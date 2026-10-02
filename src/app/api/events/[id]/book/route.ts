import { NextRequest } from "next/server";
import { Role } from "@/generated/prisma/client";
import { err, ok } from "@/lib/api";
import { getUser, requireRole } from "@/lib/auth";
import { deliverBookingTicket } from "@/lib/delivery";
import { EmailDeliveryResult } from "@/lib/email";
import { confirmBooking } from "@/lib/seats";
import { validateSeatIds, ValidationError } from "@/lib/validation";
import { enforceRateLimit } from "@/lib/rate-limit";
import { safeError, structuredLog } from "@/lib/observability";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
  const limited = await enforceRateLimit(req, { scope: "booking", limit: 10, windowMs: 60_000 }, user!.id);
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
    const booking = await confirmBooking(
      id,
      seatIds,
      user!.id,
      typeof offerToken === "string" ? offerToken : undefined
    );
    let email: EmailDeliveryResult = {
      delivered: false,
      mode: "console",
      message: "Ticket email queued for retry",
    };
    try {
      email = await deliverBookingTicket(booking.id);
    } catch (emailError) {
      structuredLog("error", "booking.email.failed", { bookingId: booking.id, ...safeError(emailError) });
    }
    return ok({ booking, email }, 201);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Booking failed", 409);
  }
}
