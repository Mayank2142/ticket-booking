import { NextRequest } from "next/server";
import { Role } from "@/generated/prisma/client";
import { ok } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { toEventSummary } from "@/lib/catalog";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  const customerId = user?.role === Role.CUSTOMER ? user.id : null;
  const today = new Date().toISOString().slice(0, 10);

  const [favourites, bookingSignals, candidates] = await Promise.all([
    customerId
      ? db.favourite.findMany({ where: { userId: customerId }, include: { content: true } })
      : [],
    customerId
      ? db.booking.findMany({
          where: { userId: customerId },
          select: { event: { select: { content: { select: { type: true, genre: true, language: true } } } } },
          take: 20,
          orderBy: { createdAt: "desc" },
        })
      : [],
    db.event.findMany({
      where: { date: { gte: today } },
      include: {
        content: true,
        venue: true,
        organiser: { select: { name: true } },
        prices: { include: { category: true } },
        _count: { select: { bookings: true } },
      },
      orderBy: [{ date: "asc" }, { time: "asc" }],
      take: 60,
    }),
  ]);

  const favouriteContentIds = new Set(favourites.map((item) => item.contentId));
  const preferredGenres = new Set([
    ...favourites.map((item) => item.content.genre),
    ...bookingSignals.flatMap((item) => item.event.content?.genre ? [item.event.content.genre] : []),
  ]);
  const preferredLanguages = new Set([
    ...favourites.map((item) => item.content.language),
    ...bookingSignals.flatMap((item) => item.event.content?.language ? [item.event.content.language] : []),
  ]);

  const earliestByContent = new Map<string, (typeof candidates)[number]>();
  for (const event of candidates) {
    const key = event.contentId ?? event.id;
    if (!earliestByContent.has(key)) earliestByContent.set(key, event);
  }

  const recommendations = Array.from(earliestByContent.values())
    .map((event) => ({
      event,
      score:
        event._count.bookings +
        (event.content && preferredGenres.has(event.content.genre) ? 20 : 0) +
        (event.content && preferredLanguages.has(event.content.language) ? 8 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.event.date.localeCompare(b.event.date))
    .slice(0, 6)
    .map(({ event }) => toEventSummary(event, favouriteContentIds));

  return ok({
    recommendations,
    personalised: Boolean(customerId && (favourites.length || bookingSignals.length)),
  });
}
