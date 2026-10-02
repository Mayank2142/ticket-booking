import { NextRequest } from "next/server";
import { Role } from "@/generated/prisma/client";
import { err, ok } from "@/lib/api";
import { getUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateVenueInput, ValidationError } from "@/lib/validation";
import { replaceVenueLayout } from "@/lib/venues";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const venue = await db.venue.findUnique({
    where: { id },
    include: { categories: true, seats: true, _count: { select: { events: true } } },
  });
  if (!venue) return err("Venue not found", 404);
  return ok({ venue });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!requireRole(user, [Role.ADMIN])) return err("Forbidden", 403);

  let input;
  try {
    input = validateVenueInput(await req.json());
  } catch (error) {
    return err(error instanceof ValidationError ? error.message : "Invalid venue data");
  }

  const venue = await db.venue.findUnique({
    where: { id },
    select: { id: true, _count: { select: { events: true } } },
  });
  if (!venue) return err("Venue not found", 404);
  if (venue._count.events > 0) {
    return err("A venue layout cannot be changed after events use it. Create a new venue instead.", 409);
  }

  const updated = await db.$transaction((tx) => replaceVenueLayout(tx, id, input));
  const full = await db.venue.findUnique({
    where: { id: updated.id },
    include: { categories: true, seats: true, _count: { select: { events: true } } },
  });
  return ok({ venue: full });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!requireRole(user, [Role.ADMIN])) return err("Forbidden", 403);

  const venue = await db.venue.findUnique({
    where: { id },
    select: { id: true, _count: { select: { events: true } } },
  });
  if (!venue) return err("Venue not found", 404);
  if (venue._count.events > 0) return err("Venues used by events cannot be deleted", 409);

  await db.$transaction(async (tx) => {
    await tx.seat.deleteMany({ where: { venueId: id } });
    await tx.seatCategory.deleteMany({ where: { venueId: id } });
    await tx.venue.delete({ where: { id } });
  });
  return ok({ deleted: true });
}
