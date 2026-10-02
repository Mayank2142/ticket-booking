import { NextRequest } from "next/server";
import { BookingStatus, Role } from "@/generated/prisma/client";
import { err, ok } from "@/lib/api";
import { getUser, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(req);
  if (!requireRole(user, [Role.ORGANISER, Role.ADMIN])) return err("Forbidden", 403);

  const event = await db.event.findUnique({
    where: { id },
    include: {
      venue: true,
      bookings: {
        where: { status: BookingStatus.CONFIRMED },
        include: { seats: { include: { seat: { include: { category: true } } } } },
      },
      prices: { include: { category: true } },
    },
  });

  if (!event) return err("Not found", 404);
  if (user!.role === Role.ORGANISER && event.organiserId !== user!.id) {
    return err("Forbidden", 403);
  }

  const revenue = event.bookings.reduce((sum, b) => sum + b.totalAmount, 0);
  const byCategory = event.prices.map((p) => ({
    category: p.category.name,
    booked: event.bookings.flatMap((b) => b.seats).filter((s) => s.seat.categoryId === p.categoryId).length,
    price: p.price,
  }));

  return ok({
    event: { id: event.id, title: event.title, date: event.date, time: event.time },
    totalBookings: event.bookings.length,
    revenue,
    byCategory,
  });
}
