import { NextRequest } from "next/server";
import { err, ok } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { startingPrice, toEventSummary } from "@/lib/catalog";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  const event = await db.event.findUnique({
    where: { id },
    include: {
      venue: { include: { categories: true } },
      content: true,
      prices: { include: { category: true } },
      organiser: { select: { name: true } },
    },
  });
  if (!event) return err("Not found", 404);

  const [favourite, otherShows] = await Promise.all([
    user?.role === "CUSTOMER" && event.contentId
      ? db.favourite.findUnique({
          where: { userId_contentId: { userId: user.id, contentId: event.contentId } },
          select: { id: true },
        })
      : null,
    event.contentId
      ? db.event.findMany({
          where: { contentId: event.contentId, date: { gte: new Date().toISOString().slice(0, 10) } },
          include: { venue: true, prices: true },
          orderBy: [{ date: "asc" }, { time: "asc" }],
          take: 12,
        })
      : [],
  ]);

  const summary = toEventSummary(event, favourite && event.contentId ? new Set([event.contentId]) : new Set());
  return ok({
    event: {
      ...summary,
      venue: event.venue,
      showtimes: otherShows.map((show) => ({
        id: show.id,
        date: show.date,
        time: show.time,
        venue: show.venue,
        startingPrice: startingPrice(show.prices),
      })),
    },
  });
}
