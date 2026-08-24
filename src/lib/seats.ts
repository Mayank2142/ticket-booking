import { randomBytes } from "crypto";
import { Prisma, SeatStatus, WaitlistStatus } from "@/generated/prisma/client";
import { HOLD_TTL_MINUTES, WAITLIST_OFFER_MINUTES } from "./constants";
import { deliverWaitlistOffer } from "./delivery";
import { db } from "./db";

class WaitlistClaimConflict extends Error {}
class SeatClaimConflict extends Error {}

export async function releaseExpiredHolds(eventId?: string) {
  const result = await db.showSeat.updateMany({
    where: {
      status: SeatStatus.HELD,
      heldUntil: { lt: new Date() },
      ...(eventId ? { eventId } : {}),
    },
    data: {
      status: SeatStatus.AVAILABLE,
      heldUntil: null,
      heldById: null,
      version: { increment: 1 },
    },
  });
  return result.count;
}

export async function getWaitlistOffer(token: string, userId?: string) {
  const entry = await db.waitlistEntry.findUnique({
    where: { offerToken: token },
    include: {
      category: true,
      event: { select: { title: true } },
      user: { select: { id: true, name: true } },
    },
  });
  if (!entry || entry.status !== WaitlistStatus.OFFERED) return null;
  if (!entry.offerExpiresAt || entry.offerExpiresAt <= new Date()) return null;
  if (userId && entry.userId !== userId) return null;

  let seatLabel: string | null = null;
  if (entry.offeredSeatId) {
    const showSeat = await db.showSeat.findFirst({
      where: { eventId: entry.eventId, seatId: entry.offeredSeatId },
      include: { seat: true },
    });
    seatLabel = showSeat?.seat.label ?? null;
  }

  return {
    id: entry.id,
    eventId: entry.eventId,
    categoryId: entry.categoryId,
    categoryName: entry.category.name,
    eventTitle: entry.event.title,
    seatId: entry.offeredSeatId,
    seatLabel,
    expiresAt: entry.offerExpiresAt,
  };
}

type TransactionClient = Prisma.TransactionClient;

async function validateOfferAccess(
  tx: TransactionClient,
  eventId: string,
  seatIds: string[],
  userId: string,
  offerToken?: string
) {
  const activeOffers = await tx.waitlistEntry.findMany({
    where: {
      eventId,
      status: WaitlistStatus.OFFERED,
      offeredSeatId: { in: seatIds },
    },
    select: { id: true },
  });

  if (!offerToken) {
    if (activeOffers.length) throw new Error("This seat requires its active waitlist offer token");
    return null;
  }

  const offer = await tx.waitlistEntry.findUnique({ where: { offerToken } });
  if (
    !offer ||
    offer.status !== WaitlistStatus.OFFERED ||
    offer.userId !== userId ||
    offer.eventId !== eventId ||
    !offer.offeredSeatId ||
    !offer.offerExpiresAt ||
    offer.offerExpiresAt <= new Date()
  ) {
    throw new Error("Invalid or expired waitlist offer");
  }
  if (seatIds.length !== 1 || seatIds[0] !== offer.offeredSeatId) {
    throw new Error("A waitlist offer can only book its assigned seat");
  }
  if (activeOffers.some((active) => active.id !== offer.id)) {
    throw new Error("Seat is reserved by another waitlist offer");
  }
  return offer;
}

export async function holdSeats(
  eventId: string,
  seatIds: string[],
  userId: string,
  offerToken?: string
) {
  await expireStaleOffers(eventId);
  await releaseExpiredHolds(eventId);

  return db.$transaction(async (tx) => {
    const offer = await validateOfferAccess(tx, eventId, seatIds, userId, offerToken);
    const heldUntil = offer?.offerExpiresAt ?? new Date(Date.now() + HOLD_TTL_MINUTES * 60_000);
    const seats = await tx.showSeat.findMany({
      where: { eventId, seatId: { in: seatIds } },
      include: { seat: true },
    });

    if (seats.length !== seatIds.length) throw new Error("Invalid seats");
    const now = new Date();
    for (const seat of seats) {
      const available =
        seat.status === SeatStatus.AVAILABLE ||
        (seat.status === SeatStatus.HELD &&
          seat.heldById === userId &&
          !!seat.heldUntil &&
          seat.heldUntil > now);
      if (!available) throw new Error(`Seat ${seat.seat.label} unavailable`);
    }

    for (const seat of seats) {
      const updated = await tx.showSeat.updateMany({
        where: {
          id: seat.id,
          OR: [
            { status: SeatStatus.AVAILABLE },
            { status: SeatStatus.HELD, heldById: userId, heldUntil: { gt: now } },
          ],
        },
        data: {
          status: SeatStatus.HELD,
          heldById: userId,
          heldUntil,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new Error("Seat taken by another customer");
    }

    return { heldUntil };
  });
}

function bookingRef() {
  return `BK-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export async function confirmBooking(
  eventId: string,
  seatIds: string[],
  userId: string,
  offerToken?: string
) {
  await expireStaleOffers(eventId);
  await releaseExpiredHolds(eventId);

  return db.$transaction(async (tx) => {
    const offer = await validateOfferAccess(tx, eventId, seatIds, userId, offerToken);
    const now = new Date();
    const showSeats = await tx.showSeat.findMany({
      where: { eventId, seatId: { in: seatIds } },
      include: { seat: { include: { category: true } } },
    });

    if (showSeats.length !== seatIds.length) throw new Error("Invalid seats");
    for (const seat of showSeats) {
      if (
        seat.status !== SeatStatus.HELD ||
        seat.heldById !== userId ||
        !seat.heldUntil ||
        seat.heldUntil <= now
      ) {
        throw new Error(`Seat ${seat.seat.label} is not actively held by you`);
      }
    }

    const prices = await tx.categoryPrice.findMany({ where: { eventId } });
    const priceMap = new Map(prices.map((price) => [price.categoryId, price.price]));
    const totalAmount = showSeats.reduce((sum, showSeat) => {
      const price = priceMap.get(showSeat.seat.categoryId);
      if (price === undefined) throw new Error(`No price configured for ${showSeat.seat.category.name}`);
      return sum + price;
    }, 0);

    for (const seat of showSeats) {
      const updated = await tx.showSeat.updateMany({
        where: {
          id: seat.id,
          status: SeatStatus.HELD,
          heldById: userId,
          heldUntil: { gt: now },
        },
        data: {
          status: SeatStatus.BOOKED,
          heldUntil: null,
          heldById: null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new Error("Booking conflict");
    }

    const booking = await tx.booking.create({
      data: {
        userId,
        eventId,
        ref: bookingRef(),
        totalAmount,
        seats: { create: seatIds.map((seatId) => ({ seatId })) },
      },
      include: { seats: { include: { seat: true } }, event: true, user: true },
    });

    if (offer) {
      const fulfilled = await tx.waitlistEntry.updateMany({
        where: {
          id: offer.id,
          status: WaitlistStatus.OFFERED,
          offerToken,
          offerExpiresAt: { gt: now },
        },
        data: {
          status: WaitlistStatus.FULFILLED,
          offerToken: null,
          offerExpiresAt: null,
          offeredSeatId: null,
        },
      });
      if (fulfilled.count !== 1) throw new Error("Waitlist offer changed during booking");
    }

    return booking;
  });
}

export async function offerNextWaitlistForSeat(eventId: string, seatId: string) {
  const seat = await db.seat.findUnique({ where: { id: seatId } });
  if (!seat) return null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = randomBytes(24).toString("hex");
    const offerExpiresAt = new Date(Date.now() + WAITLIST_OFFER_MINUTES * 60_000);

    try {
      const claimed = await db.$transaction(async (tx) => {
        const showSeat = await tx.showSeat.findFirst({ where: { eventId, seatId } });
        if (!showSeat || showSeat.status !== SeatStatus.AVAILABLE) return null;

        const next = await tx.waitlistEntry.findFirst({
          where: { eventId, categoryId: seat.categoryId, status: WaitlistStatus.WAITING },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { id: true, userId: true },
        });
        if (!next) return null;

        const waiterClaim = await tx.waitlistEntry.updateMany({
          where: { id: next.id, status: WaitlistStatus.WAITING },
          data: {
            status: WaitlistStatus.OFFERED,
            offerToken: token,
            offerExpiresAt,
            offeredSeatId: seatId,
            offerNotifiedAt: null,
            offerNotificationAttempts: 0,
          },
        });
        if (waiterClaim.count !== 1) throw new WaitlistClaimConflict();

        const seatClaim = await tx.showSeat.updateMany({
          where: { id: showSeat.id, status: SeatStatus.AVAILABLE },
          data: {
            status: SeatStatus.HELD,
            heldById: next.userId,
            heldUntil: offerExpiresAt,
            version: { increment: 1 },
          },
        });
        if (seatClaim.count !== 1) throw new SeatClaimConflict();
        return { entryId: next.id, token, offerExpiresAt, seatId };
      });

      if (!claimed) return null;
      const email = await deliverWaitlistOffer(claimed.entryId);
      return { ...claimed, email };
    } catch (error) {
      if (error instanceof SeatClaimConflict) return null;
      if (!(error instanceof WaitlistClaimConflict) || attempt === 4) throw error;
    }
  }
  return null;
}

export async function expireStaleOffers(eventId?: string) {
  const now = new Date();
  const stale = await db.waitlistEntry.findMany({
    where: {
      status: WaitlistStatus.OFFERED,
      offerExpiresAt: { lt: now },
      ...(eventId ? { eventId } : {}),
    },
    select: { id: true, eventId: true, userId: true, offeredSeatId: true },
  });

  let expiredCount = 0;
  for (const entry of stale) {
    const expired = await db.$transaction(async (tx) => {
      const updated = await tx.waitlistEntry.updateMany({
        where: { id: entry.id, status: WaitlistStatus.OFFERED, offerExpiresAt: { lt: now } },
        data: {
          status: WaitlistStatus.EXPIRED,
          offerToken: null,
          offerExpiresAt: null,
          offeredSeatId: null,
        },
      });
      if (updated.count !== 1) return false;

      if (entry.offeredSeatId) {
        await tx.showSeat.updateMany({
          where: {
            eventId: entry.eventId,
            seatId: entry.offeredSeatId,
            status: SeatStatus.HELD,
            heldById: entry.userId,
          },
          data: {
            status: SeatStatus.AVAILABLE,
            heldUntil: null,
            heldById: null,
            version: { increment: 1 },
          },
        });
      }
      return true;
    });

    if (!expired) continue;
    expiredCount += 1;
    if (entry.offeredSeatId) {
      const showSeat = await db.showSeat.findFirst({
        where: { eventId: entry.eventId, seatId: entry.offeredSeatId },
        select: { status: true },
      });
      if (showSeat?.status === SeatStatus.AVAILABLE) {
        await offerNextWaitlistForSeat(entry.eventId, entry.offeredSeatId);
      }
    }
  }
  return expiredCount;
}

export async function cancelBooking(bookingId: string, userId: string) {
  const cancelled = await db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { seats: { select: { seatId: true } } },
    });
    if (!booking || booking.userId !== userId) throw new Error("Booking not found");

    const statusChange = await tx.booking.updateMany({
      where: { id: bookingId, userId, status: "CONFIRMED" },
      data: { status: "CANCELLED" },
    });
    if (statusChange.count !== 1) throw new Error("Booking is already cancelled");

    const freedSeats: string[] = [];
    for (const { seatId } of booking.seats) {
      const released = await tx.showSeat.updateMany({
        where: { eventId: booking.eventId, seatId, status: SeatStatus.BOOKED },
        data: {
          status: SeatStatus.AVAILABLE,
          heldUntil: null,
          heldById: null,
          version: { increment: 1 },
        },
      });
      if (released.count === 1) freedSeats.push(seatId);
    }
    return { eventId: booking.eventId, freedSeats };
  });

  const offers = [];
  for (const seatId of cancelled.freedSeats) {
    offers.push(await offerNextWaitlistForSeat(cancelled.eventId, seatId));
  }
  return { cancelled: true, offers: offers.filter(Boolean) };
}

export async function categoryAvailability(eventId: string, categoryId: string) {
  return db.showSeat.count({
    where: { eventId, seat: { categoryId }, status: SeatStatus.AVAILABLE },
  });
}
