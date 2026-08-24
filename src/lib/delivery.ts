import { BookingStatus, WaitlistStatus } from "@/generated/prisma/client";
import { db } from "./db";
import { sendTicketEmail, sendWaitlistOfferEmail } from "./email";

export async function deliverBookingTicket(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      event: true,
      seats: { include: { seat: true } },
    },
  });
  if (!booking || booking.status !== BookingStatus.CONFIRMED) {
    return { delivered: false, mode: "console" as const, message: "Booking is not eligible for email" };
  }
  if (booking.ticketEmailSentAt) {
    return { delivered: true, mode: "smtp" as const, message: "Ticket email was already delivered" };
  }

  const result = await sendTicketEmail({
    to: booking.user.email,
    name: booking.user.name,
    eventTitle: booking.event.title,
    bookingRef: booking.ref,
    seats: booking.seats.map(({ seat }) => seat.label),
  });
  await db.booking.updateMany({
    where: { id: booking.id, ticketEmailSentAt: null },
    data: {
      ticketEmailAttempts: { increment: 1 },
      ...(result.delivered ? { ticketEmailSentAt: new Date() } : {}),
    },
  });
  return result;
}

export async function deliverWaitlistOffer(entryId: string) {
  const entry = await db.waitlistEntry.findUnique({
    where: { id: entryId },
    include: { user: true, event: true, category: true },
  });
  if (
    !entry ||
    entry.status !== WaitlistStatus.OFFERED ||
    !entry.offerToken ||
    !entry.offerExpiresAt ||
    entry.offerExpiresAt <= new Date()
  ) {
    return { delivered: false, mode: "console" as const, message: "Waitlist offer is not eligible for email" };
  }
  if (entry.offerNotifiedAt) {
    return { delivered: true, mode: "smtp" as const, message: "Waitlist email was already delivered" };
  }

  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const result = await sendWaitlistOfferEmail({
    to: entry.user.email,
    name: entry.user.name,
    eventTitle: entry.event.title,
    category: entry.category.name,
    offerUrl: `${appUrl}/events/${entry.eventId}?offer=${entry.offerToken}`,
    expiresAt: entry.offerExpiresAt,
  });
  await db.waitlistEntry.updateMany({
    where: { id: entry.id, status: WaitlistStatus.OFFERED, offerNotifiedAt: null },
    data: {
      offerNotificationAttempts: { increment: 1 },
      ...(result.delivered ? { offerNotifiedAt: new Date() } : {}),
    },
  });
  return result;
}

export async function retryPendingEmails(limit = 20) {
  const now = new Date();
  const [bookings, offers] = await Promise.all([
    db.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        ticketEmailSentAt: null,
        ticketEmailAttempts: { lt: 5 },
      },
      select: { id: true },
      take: limit,
      orderBy: { createdAt: "asc" },
    }),
    db.waitlistEntry.findMany({
      where: {
        status: WaitlistStatus.OFFERED,
        offerNotifiedAt: null,
        offerNotificationAttempts: { lt: 5 },
        offerExpiresAt: { gt: now },
      },
      select: { id: true },
      take: limit,
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const bookingResults = [];
  for (const booking of bookings) bookingResults.push(await deliverBookingTicket(booking.id));
  const offerResults = [];
  for (const offer of offers) offerResults.push(await deliverWaitlistOffer(offer.id));

  return {
    bookingsAttempted: bookingResults.length,
    offersAttempted: offerResults.length,
    delivered: [...bookingResults, ...offerResults].filter((result) => result.delivered).length,
  };
}
