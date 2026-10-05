import { BookingStatus, Role } from "../../../../src/generated/prisma/client";
import { err, ok } from "../../../../src/lib/api";
import { writeAuditLog } from "../../../../src/lib/audit";
import { getUser, requireRole } from "../../../../src/lib/auth";
import { db } from "../../../../src/lib/db";
import { validateVenueInput, ValidationError } from "../../../../src/lib/validation";
import { createVenueLayout, replaceVenueLayout } from "../../../../src/lib/venues";
import type { RouteDefinition } from "../types";
import { readJson } from "../types";

const venueInclude = { cityRecord: true, auditoriums: true, categories: true, seats: true, _count: { select: { events: true } } } as const;

export const venueRoutes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/venues",
    async handler(request) {
      const user = await getUser(request);
      const venues = await db.venue.findMany({ where: user?.role === Role.ADMIN ? {} : { archivedAt: null }, include: venueInclude, orderBy: { createdAt: "desc" } });
      return ok({ venues });
    },
  },
  {
    method: "POST",
    path: "/api/venues",
    async handler(request) {
      const user = await getUser(request);
      if (!requireRole(user, [Role.ADMIN])) return err("Forbidden", 403);
      const body = await readJson<unknown>(request);
      let input;
      try {
        input = validateVenueInput(body);
      } catch (error) {
        return err(error instanceof ValidationError ? error.message : "Invalid venue data");
      }
      const venue = await db.$transaction((transaction) => createVenueLayout(transaction, input));
      await writeAuditLog({ actorId: user!.id, action: "VENUE_CREATED", entityType: "Venue", entityId: venue.id, metadata: { name: input.name, city: input.city } });
      return ok({ venue: await db.venue.findUnique({ where: { id: venue.id }, include: venueInclude }) }, 201);
    },
  },
  {
    method: "GET",
    path: "/api/venues/:id",
    async handler(_request, params) {
      const venue = await db.venue.findUnique({ where: { id: params.id }, include: venueInclude });
      return venue ? ok({ venue }) : err("Venue not found", 404);
    },
  },
  {
    method: "PUT",
    path: "/api/venues/:id",
    async handler(request, params) {
      const user = await getUser(request);
      if (!requireRole(user, [Role.ADMIN])) return err("Forbidden", 403);
      const body = await readJson<unknown>(request);
      let input;
      try {
        input = validateVenueInput(body);
      } catch (error) {
        return err(error instanceof ValidationError ? error.message : "Invalid venue data");
      }
      const venue = await db.venue.findUnique({ where: { id: params.id }, select: { id: true, _count: { select: { events: true } } } });
      if (!venue) return err("Venue not found", 404);
      if (venue._count.events > 0) return err("A venue layout cannot be changed after events use it. Create a new venue instead.", 409);
      const updated = await db.$transaction((transaction) => replaceVenueLayout(transaction, params.id, input));
      await writeAuditLog({ actorId: user!.id, action: "VENUE_UPDATED", entityType: "Venue", entityId: updated.id, metadata: { name: input.name } });
      return ok({ venue: await db.venue.findUnique({ where: { id: updated.id }, include: venueInclude }) });
    },
  },
  {
    method: "DELETE",
    path: "/api/venues/:id",
    async handler(request, params) {
      const user = await getUser(request);
      if (!requireRole(user, [Role.ADMIN])) return err("Forbidden", 403);
      const venue = await db.venue.findUnique({ where: { id: params.id }, select: { id: true, _count: { select: { events: true } } } });
      if (!venue) return err("Venue not found", 404);
      const archived = await db.venue.update({ where: { id: params.id }, data: { archivedAt: new Date() } });
      await writeAuditLog({ actorId: user!.id, action: "VENUE_ARCHIVED", entityType: "Venue", entityId: archived.id, metadata: { name: archived.name, usedByShows: venue._count.events } });
      return ok({ archived: true });
    },
  },
  {
    method: "GET",
    path: "/api/organiser/events/:id/summary",
    async handler(request, params) {
      const user = await getUser(request);
      if (!requireRole(user, [Role.ORGANISER, Role.ADMIN])) return err("Forbidden", 403);
      const event = await db.show.findUnique({
        where: { id: params.id },
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
      if (user!.role === Role.ORGANISER && event.organiserId !== user!.id) return err("Forbidden", 403);
      return ok({
        event: { id: event.id, title: event.title, date: event.date, time: event.time },
        totalBookings: event.bookings.length,
        revenue: event.bookings.reduce((sum, booking) => sum + booking.totalAmount, 0),
        byCategory: event.prices.map((price) => ({
          category: price.category.name,
          booked: event.bookings.flatMap((booking) => booking.seats).filter((seat) => seat.seat.categoryId === price.categoryId).length,
          price: price.price,
        })),
      });
    },
  },
];
