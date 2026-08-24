import { NextRequest } from "next/server";
import { Role } from "@/generated/prisma/client";
import { err, ok } from "@/lib/api";
import { getUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateVenueInput, ValidationError } from "@/lib/validation";
import { createVenueLayout } from "@/lib/venues";

export async function GET() {
  const venues = await db.venue.findMany({
    include: { categories: true, seats: true, _count: { select: { events: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok({ venues });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!requireRole(user, [Role.ADMIN])) return err("Forbidden", 403);

  let input;
  try {
    input = validateVenueInput(await req.json());
  } catch (error) {
    return err(error instanceof ValidationError ? error.message : "Invalid venue data");
  }

  const venue = await db.$transaction((tx) => createVenueLayout(tx, input));
  const full = await db.venue.findUnique({
    where: { id: venue.id },
    include: { categories: true, seats: true, _count: { select: { events: true } } },
  });
  return ok({ venue: full }, 201);
}
