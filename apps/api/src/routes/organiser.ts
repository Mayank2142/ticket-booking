import { BookingStatus, Prisma, Role, SeatStatus, ShowStatus, WaitlistStatus } from "../../../../src/generated/prisma/client";
import { err, ok } from "../../../../src/lib/api";
import { writeAuditLog } from "../../../../src/lib/audit";
import { getUser, requireRole } from "../../../../src/lib/auth";
import { db } from "../../../../src/lib/db";
import { validateName, ValidationError } from "../../../../src/lib/validation";
import type { RouteDefinition } from "../types";
import { readJson } from "../types";

const showInclude = {
  venue: { include: { auditoriums: true, categories: true } },
  auditorium: true,
  content: true,
  prices: { include: { category: true } },
} as const;

type BatchVenue = Prisma.VenueGetPayload<{
  include: { seats: true; categories: true; auditoriums: true };
}>;

type BatchShowInput = {
  venue: BatchVenue;
  auditorium: BatchVenue["auditoriums"][number];
  date: string;
  time: string;
  status: ShowStatus;
  prices: Array<{ categoryId?: unknown; price?: unknown }>;
};

async function organiser(request: Request) {
  const user = await getUser(request);
  return requireRole(user, [Role.ORGANISER, Role.ADMIN]) ? user : null;
}

async function ownedShow(request: Request, id: string) {
  const user = await organiser(request);
  if (!user) return { user: null, show: null };
  const show = await db.show.findUnique({ where: { id }, include: showInclude });
  if (!show || (user.role === Role.ORGANISER && show.organiserId !== user.id)) return { user, show: null };
  return { user, show };
}

function text(value: unknown, max: number, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function validTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

async function updateManagedShow(request: Request, params: Record<string, string>) {
  const { user, show } = await ownedShow(request, params.id);
  if (!user) return err("Forbidden", 403);
  if (!show) return err("Show not found", 404);
  if (show.status === ShowStatus.ARCHIVED || show.status === ShowStatus.CANCELLED) return err("Archived or cancelled shows cannot be edited", 409);
  if (show.date < new Date().toISOString().slice(0, 10)) return err("Past shows cannot be edited", 409);
  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return err("Invalid show details");

  let title: string;
  try { title = validateName(body.title, "Title"); } catch (error) { return err(error instanceof ValidationError ? error.message : "Invalid title"); }
  const date = validDate(body.date);
  const time = validTime(body.time);
  if (!date || date < new Date().toISOString().slice(0, 10) || !time) return err("Choose a valid future schedule");
  const confirmed = await db.booking.count({ where: { eventId: show.id, status: BookingStatus.CONFIRMED } });
  if (confirmed && (date !== show.date || time !== show.time)) return err("A booked show cannot move to another date or time", 409);

  const prices = Array.isArray(body.prices) ? body.prices as Array<{ categoryId?: unknown; price?: unknown }> : [];
  if (prices.length) {
    const categoryIds = new Set(show.venue.categories.map((category) => category.id));
    if (prices.length !== categoryIds.size || prices.some((price) => typeof price.categoryId !== "string" || !categoryIds.has(price.categoryId) || !Number.isFinite(Number(price.price)) || Number(price.price) <= 0)) {
      return err("Provide a positive price for every venue category");
    }
    if (confirmed) return err("Prices are locked after the first confirmed booking", 409);
  }

  await db.$transaction(async (transaction) => {
    await transaction.show.update({ where: { id: show.id }, data: { title, description: text(body.description, 2000) || null, date, time } });
    if (show.contentId) {
      await transaction.content.update({
        where: { id: show.contentId },
        data: {
          title,
          description: text(body.description, 2000) || null,
          language: text(body.language, 80, show.content?.language),
          format: text(body.format, 80, show.content?.format),
          genre: text(body.genre, 80, show.content?.genre),
          durationMinutes: Math.max(15, Math.min(600, Number(body.durationMinutes) || show.content?.durationMinutes || 120)),
          certificate: text(body.certificate, 20) || null,
          releaseDate: validDate(body.releaseDate),
          castNames: text(body.castNames, 1000),
          crewNames: text(body.crewNames, 1000),
          trailerUrl: text(body.trailerUrl, 500) || null,
          formats: text(body.formats, 500),
          performerNames: text(body.performerNames, 1000),
          ageRule: text(body.ageRule, 300) || null,
          entryRule: text(body.entryRule, 500) || null,
        },
      });
    }
    for (const price of prices) {
      await transaction.categoryPrice.update({
        where: { eventId_categoryId: { eventId: show.id, categoryId: String(price.categoryId) } },
        data: { price: Number(price.price) },
      });
    }
  });
  await writeAuditLog({ actorId: user.id, action: "SHOW_UPDATED", entityType: "Show", entityId: show.id, metadata: { title, date, time } });
  return ok({ show: await db.show.findUnique({ where: { id: show.id }, include: showInclude }) });
}

async function createShowBatch(request: Request, params: Record<string, string>) {
  const { user, show: source } = await ownedShow(request, params.id);
  if (!user) return err("Forbidden", 403);
  if (!source?.contentId || !source.content) return err("Source content not found", 404);
  const body = await readJson<{ shows?: unknown }>(request);
  if (!Array.isArray(body?.shows) || body.shows.length < 1 || body.shows.length > 20) return err("Add between 1 and 20 shows");
  const inputs = body.shows as Array<Record<string, unknown>>;
  const prepared: BatchShowInput[] = [];
  for (const input of inputs) {
    const venueId = text(input.venueId, 100);
    const date = validDate(input.date);
    const time = validTime(input.time);
    const status = input.status === ShowStatus.DRAFT ? ShowStatus.DRAFT : ShowStatus.PUBLISHED;
    if (!venueId || !date || date < new Date().toISOString().slice(0, 10) || !time) return err("Every show needs a venue and valid future schedule");
    const venue = await db.venue.findFirst({ where: { id: venueId, archivedAt: null }, include: { seats: true, categories: true, auditoriums: { where: { archivedAt: null } } } });
    if (!venue) return err("A selected venue is unavailable", 404);
    const auditoriumId = text(input.auditoriumId, 100) || venue.auditoriums[0]?.id;
    const auditorium = venue.auditoriums.find((item) => item.id === auditoriumId);
    if (!auditorium) return err("Select an active auditorium for every show");
    const prices = Array.isArray(input.prices) ? input.prices as Array<{ categoryId?: unknown; price?: unknown }> : [];
    const categoryIds = new Set(venue.categories.map((category) => category.id));
    if (prices.length !== categoryIds.size || prices.some((price) => typeof price.categoryId !== "string" || !categoryIds.has(price.categoryId) || Number(price.price) <= 0)) return err("Every show needs a price for each category");
    const duplicate = await db.show.findFirst({ where: { contentId: source.contentId, auditoriumId, date, time, status: { not: ShowStatus.ARCHIVED } }, select: { id: true } });
    if (duplicate) return err(`A show already exists at ${date} ${time}`, 409);
    prepared.push({ venue, auditorium, date, time, status, prices });
  }

  const created = await db.$transaction(async (transaction) => {
    const shows = [];
    for (const input of prepared) {
      const next = await transaction.show.create({
        data: {
          organiserId: source.organiserId,
          venueId: input.venue.id,
          auditoriumId: input.auditorium.id,
          contentId: source.contentId,
          title: source.content!.title,
          type: source.content!.type,
          description: source.content!.description,
          date: input.date,
          time: input.time,
          status: input.status,
          prices: { create: input.prices.map((price) => ({ categoryId: String(price.categoryId), price: Number(price.price) })) },
        },
      });
      await transaction.showSeat.createMany({ data: input.venue.seats.map((seat) => ({ eventId: next.id, seatId: seat.id, status: seat.isBlocked ? SeatStatus.UNAVAILABLE : SeatStatus.AVAILABLE, unavailableReason: seat.isBlocked ? "Blocked auditorium position" : null })) });
      shows.push(next);
    }
    return shows;
  });
  await writeAuditLog({ actorId: user.id, action: "SHOW_BATCH_CREATED", entityType: "Content", entityId: source.contentId, metadata: { showIds: created.map((item) => item.id), count: created.length } });
  return ok({ shows: created }, 201);
}

async function changeLifecycle(request: Request, params: Record<string, string>) {
  const { user, show } = await ownedShow(request, params.id);
  if (!user) return err("Forbidden", 403);
  if (!show) return err("Show not found", 404);
  const body = await readJson<{ status?: unknown }>(request);
  if (!body || typeof body.status !== "string" || !Object.values(ShowStatus).includes(body.status as ShowStatus)) return err("A valid show state is required");
  const target = body.status as ShowStatus;
  if (show.status === ShowStatus.ARCHIVED) return err("Archived shows are read-only", 409);
  const confirmed = await db.booking.count({ where: { eventId: show.id, status: BookingStatus.CONFIRMED } });
  if (target === ShowStatus.DRAFT && confirmed) return err("A booked show cannot be unpublished", 409);
  if (target === ShowStatus.ARCHIVED && show.status !== ShowStatus.CANCELLED && show.date >= new Date().toISOString().slice(0, 10)) return err("Cancel a future show before archiving it", 409);

  await db.$transaction(async (transaction) => {
    await transaction.show.update({ where: { id: show.id }, data: { status: target } });
    if (target === ShowStatus.CANCELLED) {
      await transaction.booking.updateMany({ where: { eventId: show.id, status: BookingStatus.CONFIRMED }, data: { status: BookingStatus.CANCELLED } });
      await transaction.showSeat.updateMany({ where: { eventId: show.id, status: { in: [SeatStatus.HELD, SeatStatus.BOOKED] } }, data: { status: SeatStatus.AVAILABLE, heldById: null, heldUntil: null, version: { increment: 1 } } });
      await transaction.showSeat.updateMany({ where: { eventId: show.id, seat: { isBlocked: true } }, data: { status: SeatStatus.UNAVAILABLE, heldById: null, heldUntil: null, unavailableReason: "Blocked auditorium position" } });
      await transaction.waitlistEntry.updateMany({ where: { eventId: show.id, status: { in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] } }, data: { status: WaitlistStatus.EXPIRED, offerToken: null, offerExpiresAt: null, offeredSeatId: null } });
    }
  });
  await writeAuditLog({ actorId: user.id, action: `SHOW_${target}`, entityType: "Show", entityId: show.id, metadata: { previous: show.status } });
  return ok({ id: show.id, status: target });
}

async function summary(request: Request, params: Record<string, string>) {
  const { user, show } = await ownedShow(request, params.id);
  if (!user) return err("Forbidden", 403);
  if (!show) return err("Show not found", 404);
  const [bookings, inventoryRows, waiting] = await Promise.all([
    db.booking.findMany({ where: { eventId: show.id, status: BookingStatus.CONFIRMED }, include: { user: { select: { name: true, email: true } }, seats: { include: { seat: { include: { category: true } } } } }, orderBy: { createdAt: "desc" } }),
    db.showSeat.groupBy({ by: ["status"], where: { eventId: show.id }, _count: { _all: true } }),
    db.waitlistEntry.count({ where: { eventId: show.id, status: { in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] } } }),
  ]);
  const inventory = { available: 0, held: 0, booked: 0, unavailable: 0, waitlisted: waiting };
  for (const row of inventoryRows) inventory[row.status.toLowerCase() as "available" | "held" | "booked" | "unavailable"] = row._count._all;
  return ok({
    event: { id: show.id, title: show.title, date: show.date, time: show.time, status: show.status },
    totalBookings: bookings.length,
    revenue: bookings.reduce((sum, booking) => sum + booking.totalAmount, 0),
    inventory,
    bookings: bookings.map((booking) => ({ id: booking.id, ref: booking.ref, customer: booking.user, seats: booking.seats.map(({ seat }) => seat.label), totalAmount: booking.totalAmount, createdAt: booking.createdAt })),
    byCategory: show.prices.map((price) => ({ category: price.category.name, booked: bookings.flatMap((booking) => booking.seats).filter(({ seat }) => seat.categoryId === price.categoryId).length, price: price.price })),
  });
}

async function reports(request: Request, _params: Record<string, string>, url: URL, csv = false) {
  const user = await organiser(request);
  if (!user) return err("Forbidden", 403);
  const from = validDate(url.searchParams.get("from"));
  const to = validDate(url.searchParams.get("to"));
  const showId = text(url.searchParams.get("showId"), 100);
  const shows = await db.show.findMany({ where: { ...(user.role === Role.ORGANISER ? { organiserId: user.id } : {}), ...(showId ? { id: showId } : {}), ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) }, select: { id: true, title: true, date: true, time: true } });
  const showMap = new Map(shows.map((show) => [show.id, show]));
  const bookings = await db.booking.findMany({ where: { eventId: { in: shows.map((show) => show.id) }, status: BookingStatus.CONFIRMED }, include: { user: { select: { name: true, email: true } }, seats: { include: { seat: true } } }, orderBy: { createdAt: "desc" } });
  const rows = bookings.map((booking) => ({ bookingId: booking.id, reference: booking.ref, showId: booking.eventId, showTitle: showMap.get(booking.eventId)?.title ?? "", showDate: showMap.get(booking.eventId)?.date ?? "", showTime: showMap.get(booking.eventId)?.time ?? "", customerName: booking.user.name, customerEmail: booking.user.email, seats: booking.seats.map(({ seat }) => seat.label).join(" "), total: booking.totalAmount, bookedAt: booking.createdAt.toISOString() }));
  if (csv) {
    const fields = ["reference", "showTitle", "showDate", "showTime", "customerName", "customerEmail", "seats", "total", "bookedAt"] as const;
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    return new Response([fields.join(","), ...rows.map((row) => fields.map((field) => escape(row[field])).join(","))].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=cinebook-bookings.csv" } });
  }
  return ok({ shows, rows, totals: { bookings: rows.length, tickets: bookings.reduce((sum, booking) => sum + booking.seats.length, 0), revenue: bookings.reduce((sum, booking) => sum + booking.totalAmount, 0) } });
}

export const organiserRoutes: RouteDefinition[] = [
  { method: "GET", path: "/api/organiser/events/:id/manage", handler: async (request, params) => { const result = await ownedShow(request, params.id); return !result.user ? err("Forbidden", 403) : result.show ? ok({ show: result.show }) : err("Show not found", 404); } },
  { method: "PUT", path: "/api/organiser/events/:id/manage", handler: updateManagedShow },
  { method: "POST", path: "/api/organiser/events/:id/shows", handler: createShowBatch },
  { method: "PUT", path: "/api/organiser/events/:id/status", handler: changeLifecycle },
  { method: "GET", path: "/api/organiser/events/:id/summary", handler: summary },
  { method: "GET", path: "/api/organiser/reports", handler: (request, params, url) => reports(request, params, url) },
  { method: "GET", path: "/api/organiser/reports.csv", handler: (request, params, url) => reports(request, params, url, true) },
];
