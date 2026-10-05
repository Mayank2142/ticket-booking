import { createHash } from "node:crypto";
import { BookingStatus, WaitlistStatus } from "@/generated/prisma/client";
import { db } from "./db";
import {
  sendBookingCancellationEmail,
  sendBookingReminderEmail,
  sendEmailVerificationEmail,
  sendTicketEmail,
  sendWaitlistJoinedEmail,
  sendWaitlistOfferEmail,
  sendWaitlistOfferExpiredEmail,
  type EmailDeliveryResult,
} from "./email";
import { enqueueBackgroundJob, JOB_TYPES } from "./jobs";

const alreadyDelivered = (message: string): EmailDeliveryResult => ({ delivered: true, mode: "smtp", message });

export async function deliverBookingTicket(bookingId: string) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { user: true, event: true, seats: { include: { seat: true } } } });
  if (!booking || booking.status !== BookingStatus.CONFIRMED) throw new Error("Booking is not eligible for confirmation email");
  if (booking.ticketEmailSentAt) return alreadyDelivered("Ticket email was already delivered");
  const result = await sendTicketEmail({ to: booking.user.email, name: booking.user.name, eventTitle: booking.event.title, bookingRef: booking.ref, seats: booking.seats.map(({ seat }) => seat.label), relatedEntityId: booking.id });
  await db.booking.update({ where: { id: booking.id }, data: { ticketEmailAttempts: { increment: 1 }, ticketEmailLastError: result.delivered || result.mode === "preview" ? null : result.message, ...(result.delivered ? { ticketEmailSentAt: new Date() } : {}) } });
  return result;
}

export async function deliverBookingCancellation(bookingId: string) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { user: true, event: true, seats: { include: { seat: true } } } });
  if (!booking || booking.status !== BookingStatus.CANCELLED) throw new Error("Booking is not eligible for cancellation email");
  if (booking.cancellationEmailSentAt) return alreadyDelivered("Cancellation email was already delivered");
  const result = await sendBookingCancellationEmail({ to: booking.user.email, name: booking.user.name, eventTitle: booking.event.title, bookingRef: booking.ref, seats: booking.seats.map(({ seat }) => seat.label), relatedEntityId: booking.id });
  if (result.delivered) await db.booking.update({ where: { id: booking.id }, data: { cancellationEmailSentAt: new Date() } });
  return result;
}

export async function deliverBookingReminder(bookingId: string) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { user: true, event: true, seats: { include: { seat: true } } } });
  if (!booking || booking.status !== BookingStatus.CONFIRMED || !booking.user.reminderEmails) throw new Error("Booking is not eligible for reminder email");
  if (booking.reminderEmailSentAt) return alreadyDelivered("Reminder email was already delivered");
  const result = await sendBookingReminderEmail({ to: booking.user.email, name: booking.user.name, eventTitle: booking.event.title, bookingRef: booking.ref, seats: booking.seats.map(({ seat }) => seat.label), showtime: `${booking.event.date} ${booking.event.time}`, relatedEntityId: booking.id });
  if (result.delivered) await db.booking.update({ where: { id: booking.id }, data: { reminderEmailSentAt: new Date() } });
  return result;
}

export async function deliverWaitlistJoined(entryId: string) {
  const entry = await db.waitlistEntry.findUnique({ where: { id: entryId }, include: { user: true, event: true, category: true } });
  if (!entry) throw new Error("Waitlist entry does not exist");
  if (entry.joinedEmailSentAt) return alreadyDelivered("Waitlist joined email was already delivered");
  const result = await sendWaitlistJoinedEmail({ to: entry.user.email, name: entry.user.name, eventTitle: entry.event.title, category: entry.category.name, relatedEntityId: entry.id });
  if (result.delivered) await db.waitlistEntry.update({ where: { id: entry.id }, data: { joinedEmailSentAt: new Date() } });
  return result;
}

export async function deliverWaitlistOffer(entryId: string) {
  const entry = await db.waitlistEntry.findUnique({ where: { id: entryId }, include: { user: true, event: true, category: true } });
  if (!entry || entry.status !== WaitlistStatus.OFFERED || !entry.offerToken || !entry.offerExpiresAt || entry.offerExpiresAt <= new Date()) throw new Error("Waitlist offer is not eligible for email");
  if (entry.offerNotifiedAt) return alreadyDelivered("Waitlist offer email was already delivered");
  const webUrl = (process.env.WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const result = await sendWaitlistOfferEmail({ to: entry.user.email, name: entry.user.name, eventTitle: entry.event.title, category: entry.category.name, offerUrl: `${webUrl}/events/${entry.eventId}?offer=${entry.offerToken}`, expiresAt: entry.offerExpiresAt, relatedEntityId: entry.id });
  await db.waitlistEntry.update({ where: { id: entry.id }, data: { offerNotificationAttempts: { increment: 1 }, offerNotificationLastError: result.delivered || result.mode === "preview" ? null : result.message, ...(result.delivered ? { offerNotifiedAt: new Date() } : {}) } });
  return result;
}

export async function deliverWaitlistOfferExpired(entryId: string) {
  const entry = await db.waitlistEntry.findUnique({ where: { id: entryId }, include: { user: true, event: true, category: true } });
  if (!entry || entry.status !== WaitlistStatus.EXPIRED) throw new Error("Waitlist offer is not expired");
  if (entry.expiredEmailSentAt) return alreadyDelivered("Offer-expired email was already delivered");
  const result = await sendWaitlistOfferExpiredEmail({ to: entry.user.email, name: entry.user.name, eventTitle: entry.event.title, category: entry.category.name, relatedEntityId: entry.id });
  if (result.delivered) await db.waitlistEntry.update({ where: { id: entry.id }, data: { expiredEmailSentAt: new Date() } });
  return result;
}

export async function deliverEmailVerification(userId: string, token: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  const hash = createHash("sha256").update(token).digest("hex");
  if (!user || user.emailVerifiedAt || user.emailVerificationTokenHash !== hash || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt <= new Date()) throw new Error("Email verification token is no longer active");
  const webUrl = (process.env.WEB_URL ?? "http://localhost:5173").replace(/\/$/, "");
  return sendEmailVerificationEmail({ to: user.email, name: user.name, verificationUrl: `${webUrl}/verify-email?token=${encodeURIComponent(token)}`, relatedEntityId: user.id });
}

export async function enqueuePendingNotificationJobs(limit = 50) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 10);
  const now = new Date();
  const [confirmed, cancelled, joined, offered, expired, reminders] = await Promise.all([
    db.booking.findMany({ where: { status: BookingStatus.CONFIRMED, ticketEmailSentAt: null }, select: { id: true }, take: limit }),
    db.booking.findMany({ where: { status: BookingStatus.CANCELLED, cancellationEmailSentAt: null }, select: { id: true }, take: limit }),
    db.waitlistEntry.findMany({ where: { joinedEmailSentAt: null }, select: { id: true }, take: limit }),
    db.waitlistEntry.findMany({ where: { status: WaitlistStatus.OFFERED, offerNotifiedAt: null, offerExpiresAt: { gt: now } }, select: { id: true }, take: limit }),
    db.waitlistEntry.findMany({ where: { status: WaitlistStatus.EXPIRED, expiredEmailSentAt: null }, select: { id: true }, take: limit }),
    db.booking.findMany({ where: { status: BookingStatus.CONFIRMED, reminderEmailSentAt: null, user: { reminderEmails: true }, event: { date: tomorrow } }, select: { id: true }, take: limit }),
  ]);
  const jobs = [
    ...confirmed.map(({ id }) => ({ type: JOB_TYPES.BOOKING_CONFIRMATION, id })),
    ...cancelled.map(({ id }) => ({ type: JOB_TYPES.BOOKING_CANCELLATION, id })),
    ...joined.map(({ id }) => ({ type: JOB_TYPES.WAITLIST_JOINED, id })),
    ...offered.map(({ id }) => ({ type: JOB_TYPES.WAITLIST_OFFER, id })),
    ...expired.map(({ id }) => ({ type: JOB_TYPES.WAITLIST_OFFER_EXPIRED, id })),
    ...reminders.map(({ id }) => ({ type: JOB_TYPES.BOOKING_REMINDER, id })),
  ];
  for (const job of jobs) await enqueueBackgroundJob({ type: job.type, payload: { id: job.id }, dedupeKey: `${job.type}:${job.id}` });
  return { enqueued: jobs.length };
}

export async function retryPendingEmails(limit = 20) {
  return enqueuePendingNotificationJobs(limit);
}
