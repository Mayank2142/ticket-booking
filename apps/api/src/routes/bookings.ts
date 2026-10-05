import { Role } from "../../../../src/generated/prisma/client";
import { err, ok } from "../../../../src/lib/api";
import { getUser, requireRole } from "../../../../src/lib/auth";
import { db } from "../../../../src/lib/db";
import { enforceRateLimit } from "../../../../src/lib/rate-limit";
import { cancelBooking } from "../../../../src/lib/seats";
import type { RouteDefinition } from "../types";

export const bookingRoutes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/bookings",
    async handler(request) {
      const user = await getUser(request);
      if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
      const bookings = await db.booking.findMany({
        where: { userId: user!.id },
        include: {
          event: { include: { venue: true, content: { select: { posterUrl: true } } } },
          seats: { include: { seat: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return ok({ bookings });
    },
  },
  {
    method: "GET",
    path: "/api/bookings/:id",
    async handler(request, params) {
      const user = await getUser(request);
      if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
      const booking = await db.booking.findFirst({
        where: { id: params.id, userId: user!.id },
        include: {
          event: { include: { venue: true, content: { select: { posterUrl: true } } } },
          seats: { include: { seat: true } },
        },
      });
      return booking ? ok({ booking }) : err("Booking not found", 404);
    },
  },
  {
    method: "DELETE",
    path: "/api/bookings/:id",
    async handler(request, params) {
      const user = await getUser(request);
      if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
      const limited = await enforceRateLimit(request, { scope: "booking-cancel", limit: 10, windowMs: 60_000 }, user!.id);
      if (limited) return limited;
      try {
        await cancelBooking(params.id, user!.id);
        return ok({ cancelled: true });
      } catch (error) {
        return err(error instanceof Error ? error.message : "Cancel failed");
      }
    },
  },
];
