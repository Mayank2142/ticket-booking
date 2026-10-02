import { NextRequest } from "next/server";
import { Role, SeatStatus, WaitlistStatus } from "@/generated/prisma/client";
import { err, ok } from "@/lib/api";
import { getUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { safeError, structuredLog } from "@/lib/observability";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);

  const entries = await db.waitlistEntry.findMany({
    where: { eventId: id, userId: user!.id },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });

  return ok({ entries });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
  const limited = await enforceRateLimit(req, { scope: "waitlist", limit: 10, windowMs: 60_000 }, user!.id);
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { categoryId?: unknown } | null;
  const categoryId = body?.categoryId;
  if (typeof categoryId !== "string" || !categoryId) return err("Category required");

  const eventCategory = await db.categoryPrice.findUnique({
    where: { eventId_categoryId: { eventId: id, categoryId } },
    select: { id: true },
  });
  if (!eventCategory) return err("Category does not belong to this event", 404);

  const available = await db.showSeat.count({
    where: {
      eventId: id,
      seat: { categoryId },
      status: SeatStatus.AVAILABLE,
    },
  });
  if (available > 0) return err("Seats still available in this category");

  const existing = await db.waitlistEntry.findUnique({
    where: { eventId_categoryId_userId: { eventId: id, categoryId, userId: user!.id } },
  });
  if (existing && existing.status !== WaitlistStatus.EXPIRED) {
    return err("Already on waitlist", 409);
  }

  let entry;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      entry = await db.$transaction(async (tx) => {
        const last = await tx.waitlistEntry.aggregate({
          where: { eventId: id, categoryId },
          _max: { position: true },
        });
        const position = (last._max.position ?? 0) + 1;
        return tx.waitlistEntry.upsert({
          where: { eventId_categoryId_userId: { eventId: id, categoryId, userId: user!.id } },
          create: { eventId: id, categoryId, userId: user!.id, position, status: WaitlistStatus.WAITING },
          update: {
            position,
            status: WaitlistStatus.WAITING,
            offerToken: null,
            offerExpiresAt: null,
            offeredSeatId: null,
            offerNotifiedAt: null,
            offerNotificationAttempts: 0,
          },
        });
      });
      break;
    } catch (error) {
      if (attempt === 2) {
        structuredLog("error", "waitlist.position.failed", { eventId: id, userId: user!.id, ...safeError(error) });
        return err("Waitlist is busy; please try again", 409);
      }
    }
  }

  return ok({ entry }, 201);
}
