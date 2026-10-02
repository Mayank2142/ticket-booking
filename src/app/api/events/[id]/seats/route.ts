import { NextRequest } from "next/server";
import { Role } from "@/generated/prisma/client";
import { err, ok } from "@/lib/api";
import { getUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { categoryAvailability, expireStaleOffers, holdSeats, releaseExpiredHolds } from "@/lib/seats";
import { validateSeatIds, ValidationError } from "@/lib/validation";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await expireStaleOffers(id);
  await releaseExpiredHolds(id);
  const user = await getUser(req);

  const seatRows = await db.showSeat.findMany({
    where: { eventId: id },
    include: { seat: { include: { category: true } } },
    orderBy: [{ seat: { row: "asc" } }, { seat: { col: "asc" } }],
  });

  const venue = await db.event.findUnique({
    where: { id },
    select: { venue: { select: { rows: true, cols: true } } },
  });

  const availability: Record<string, number> = {};
  for (const ss of seatRows) {
    const cid = ss.seat.categoryId;
    if (availability[cid] === undefined) {
      availability[cid] = await categoryAvailability(id, cid);
    }
  }

  const showSeats = seatRows.map(({ heldById, ...showSeat }) => ({
    ...showSeat,
    heldByMe: !!user && heldById === user.id,
  }));
  return ok({ showSeats, layout: venue?.venue, availability });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
  const limited = await enforceRateLimit(req, { scope: "seat-hold", limit: 30, windowMs: 60_000 }, user!.id);
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { seatIds?: unknown; offerToken?: unknown } | null;
  if (!body) return err("Invalid seat selection");
  const { seatIds: rawSeatIds, offerToken } = body;
  let seatIds: string[];
  try {
    seatIds = validateSeatIds(rawSeatIds);
  } catch (error) {
    return err(error instanceof ValidationError ? error.message : "Invalid seat selection");
  }

  try {
    const result = await holdSeats(id, seatIds, user!.id, typeof offerToken === "string" ? offerToken : undefined);
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Hold failed", 409);
  }
}
