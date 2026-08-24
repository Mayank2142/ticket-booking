import { NextRequest } from "next/server";
import { Role } from "@/generated/prisma/client";
import { err, ok } from "@/lib/api";
import { getUser, requireRole } from "@/lib/auth";
import { deliverBookingTicket } from "@/lib/delivery";
import { EmailDeliveryResult } from "@/lib/email";
import { confirmBooking } from "@/lib/seats";
import { validateSeatIds, ValidationError } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);

  const { seatIds: rawSeatIds, offerToken } = await req.json();
  let seatIds: string[];
  try {
    seatIds = validateSeatIds(rawSeatIds);
  } catch (error) {
    return err(error instanceof ValidationError ? error.message : "Invalid seat selection");
  }

  try {
    const booking = await confirmBooking(
      params.id,
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
      console.error("[email:error] Booking succeeded but ticket delivery could not be recorded", emailError);
    }
    return ok({ booking, email }, 201);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Booking failed", 409);
  }
}
