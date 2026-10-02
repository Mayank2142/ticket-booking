import { NextRequest } from "next/server";
import { Role } from "@/generated/prisma/client";
import { err, ok } from "@/lib/api";
import { getUser, requireRole } from "@/lib/auth";
import { cancelBooking } from "@/lib/seats";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(_req);
  if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
  const limited = await enforceRateLimit(_req, { scope: "booking-cancel", limit: 10, windowMs: 60_000 }, user!.id);
  if (limited) return limited;

  try {
    await cancelBooking(id, user!.id);
    return ok({ cancelled: true });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Cancel failed", 400);
  }
}
