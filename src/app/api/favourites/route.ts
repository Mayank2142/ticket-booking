import { NextRequest } from "next/server";
import { Role } from "@/generated/prisma/client";
import { err, ok } from "@/lib/api";
import { getUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
  const limited = await enforceRateLimit(req, { scope: "favourites", limit: 60, windowMs: 60_000 }, user!.id);
  if (limited) return limited;
  const favourites = await db.favourite.findMany({
    where: { userId: user!.id },
    select: { contentId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return ok({ favourites });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
  const body = await req.json().catch(() => null) as { eventId?: unknown; favourite?: unknown } | null;
  if (!body || typeof body.eventId !== "string" || typeof body.favourite !== "boolean") {
    return err("Event and favourite state are required");
  }

  const event = await db.event.findUnique({
    where: { id: body.eventId },
    select: { contentId: true },
  });
  if (!event) return err("Event not found", 404);
  if (!event.contentId) return err("This legacy event cannot be favourited until its catalogue migration completes", 409);

  if (body.favourite) {
    await db.favourite.upsert({
      where: { userId_contentId: { userId: user!.id, contentId: event.contentId } },
      update: {},
      create: { userId: user!.id, contentId: event.contentId },
    });
  } else {
    await db.favourite.deleteMany({ where: { userId: user!.id, contentId: event.contentId } });
  }

  return ok({ contentId: event.contentId, favourite: body.favourite });
}
