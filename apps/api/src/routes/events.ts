import { randomUUID } from "node:crypto";
import { BookingStatus, EventType, Prisma, Role, SeatStatus, ShowStatus, WaitlistStatus } from "../../../../src/generated/prisma/client";
import { err, ok } from "../../../../src/lib/api";
import { getUser, requireRole } from "../../../../src/lib/auth";
import { contentIdentityKey, startingPrice, toEventSummary } from "../../../../src/lib/catalog";
import { db } from "../../../../src/lib/db";
import { safeError, structuredLog } from "../../../../src/lib/observability";
import { enforceRateLimit } from "../../../../src/lib/rate-limit";
import { enqueueBackgroundJob, JOB_TYPES } from "../../../../src/lib/jobs";
import { subscribeToSeatUpdates, type SeatUpdate } from "../../../../src/lib/realtime";
import {
  categoryAvailability,
  confirmBooking,
  expireStaleOffers,
  getWaitlistOffer,
  holdSeats,
  releaseExpiredHolds,
} from "../../../../src/lib/seats";
import { validateEventInput, validateSeatIds, ValidationError } from "../../../../src/lib/validation";
import type { RouteDefinition } from "../types";
import { readJson } from "../types";

async function listEvents(request: Request, _params: Record<string, string>, url: URL) {
  const user = await getUser(request);
  let query: ReturnType<typeof parseEventListQuery>;
  try {
    query = parseEventListQuery(url);
  } catch (error) {
    return err(error instanceof ValidationError ? error.message : "Invalid discovery query");
  }
  const { type, q, city, language, format, genre, venueId, date, mine, upcoming, sort, page, pageSize } = query;
  const today = new Date().toISOString().slice(0, 10);
  const recentSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const where: Prisma.ShowWhereInput = {
    ...(type ? { type } : {}),
    ...(city ? { venue: { city } } : {}),
    ...(venueId ? { venueId } : {}),
    ...(date ? { date } : upcoming ? { date: { gte: today } } : {}),
    ...(language || format || genre ? {
      content: {
        ...(language ? { language } : {}),
        ...(format ? { OR: [{ format: { contains: format } }, { formats: { contains: format } }] } : {}),
        ...(genre ? { genre: { contains: genre } } : {}),
      },
    } : {}),
    ...(q ? {
      OR: [
        { title: { contains: q } },
        { content: { title: { contains: q } } },
        { content: { genre: { contains: q } } },
        { content: { performerNames: { contains: q } } },
        { venue: { name: { contains: q } } },
        { venue: { auditorium: { contains: q } } },
      ],
    } : {}),
    ...(mine && user?.role === Role.ORGANISER ? { organiserId: user.id } : { status: ShowStatus.PUBLISHED }),
  };

  const include = {
    venue: true,
    content: true,
    organiser: { select: { name: true } },
    prices: { include: { category: true } },
    _count: {
      select: {
        bookings: { where: { status: BookingStatus.CONFIRMED, createdAt: { gte: recentSince } } },
      },
    },
  } satisfies Prisma.ShowInclude;

  const requiresRankedWindow = sort !== "date";
  const [total, rows] = await Promise.all([
    db.show.count({ where }),
    db.show.findMany({
      where,
      include,
      orderBy: [{ date: "asc" }, { time: "asc" }],
      skip: requiresRankedWindow ? 0 : (page - 1) * pageSize,
      take: requiresRankedWindow ? 500 : pageSize,
    }),
  ]);

  const ranked = [...rows].sort((left, right) => {
    if (sort === "price-asc") return startingPrice(left.prices) - startingPrice(right.prices);
    if (sort === "price-desc") return startingPrice(right.prices) - startingPrice(left.prices);
    if (sort === "trending") return right._count.bookings - left._count.bookings || left.date.localeCompare(right.date);
    return left.date.localeCompare(right.date) || left.time.localeCompare(right.time);
  });
  const events = requiresRankedWindow ? ranked.slice((page - 1) * pageSize, page * pageSize) : ranked;

  const favourites = user?.role === Role.CUSTOMER
    ? await db.favourite.findMany({ where: { userId: user.id }, select: { contentId: true } })
    : [];
  const favouriteIds = new Set(favourites.map((item) => item.contentId));
  return ok({
    events: events.map((event) => ({ ...toEventSummary(event, favouriteIds), trendingScore: event._count.bookings })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}

function cleanParam(url: URL, name: string, maxLength: number) {
  const value = url.searchParams.get(name)?.trim();
  if (!value) return undefined;
  if (value.length > maxLength) throw new ValidationError(`${name} must be no more than ${maxLength} characters`);
  return value;
}

function enumParam<T extends string>(url: URL, name: string, values: readonly T[]) {
  const value = url.searchParams.get(name);
  if (value === null || value === "") return undefined;
  if (!values.includes(value as T)) throw new ValidationError(`${name} must be one of: ${values.join(", ")}`);
  return value as T;
}

function integerParam(url: URL, name: string, min: number, max: number, fallback: number) {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new ValidationError(`${name} must be an integer from ${min} to ${max}`);
  return value;
}

function dateParam(url: URL, name: string) {
  const value = url.searchParams.get(name);
  if (value === null || value === "") return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ValidationError(`${name} must use YYYY-MM-DD`);
  return value;
}

function booleanParam(url: URL, name: string) {
  const value = url.searchParams.get(name);
  if (value === null) return false;
  if (value !== "true" && value !== "false") throw new ValidationError(`${name} must be true or false`);
  return value === "true";
}

export function parseEventListQuery(url: URL) {
  return {
    type: enumParam(url, "type", [EventType.MOVIE, EventType.CONCERT]),
    q: cleanParam(url, "q", 100),
    city: cleanParam(url, "city", 80),
    language: cleanParam(url, "language", 80),
    format: cleanParam(url, "format", 80),
    genre: cleanParam(url, "genre", 80),
    venueId: cleanParam(url, "venue", 100),
    date: dateParam(url, "date"),
    mine: booleanParam(url, "mine"),
    upcoming: booleanParam(url, "upcoming"),
    sort: enumParam(url, "sort", ["date", "price-asc", "price-desc", "trending"]) ?? "date",
    page: integerParam(url, "page", 1, 10_000, 1),
    pageSize: integerParam(url, "pageSize", 1, 48, 12),
  };
}

async function createEvent(request: Request) {
  const user = await getUser(request);
  if (!requireRole(user, [Role.ORGANISER, Role.ADMIN])) return err("Forbidden", 403);
  const body = await readJson<unknown>(request);
  let input;
  try {
    input = validateEventInput(body);
  } catch (error) {
    return err(error instanceof ValidationError ? error.message : "Invalid event data");
  }

  const venue = await db.venue.findUnique({ where: { id: input.venueId }, include: { seats: true, categories: true, auditoriums: true } });
  if (!venue) return err("Venue not found", 404);
  const categoryIds = new Set(venue.categories.map((category) => category.id));
  if (input.prices.length !== venue.categories.length || input.prices.some((price) => !categoryIds.has(price.categoryId))) {
    return err("Provide exactly one price for every category in the selected venue");
  }

  const event = await db.$transaction(async (transaction) => {
    const identityKey = contentIdentityKey(input);
    const content = await transaction.content.upsert({
      where: { identityKey },
      update: {
        description: input.description,
        genre: input.genre,
        durationMinutes: input.durationMinutes,
        certificate: input.certificate,
        releaseDate: input.releaseDate,
        castNames: input.castNames,
        crewNames: input.crewNames,
        trailerUrl: input.trailerUrl,
        formats: input.formats,
        performerNames: input.performerNames,
        ageRule: input.ageRule,
        entryRule: input.entryRule,
      },
      create: {
        identityKey,
        title: input.title,
        type: input.type,
        description: input.description,
        language: input.language,
        format: input.format,
        genre: input.genre,
        durationMinutes: input.durationMinutes,
        certificate: input.certificate,
        releaseDate: input.releaseDate,
        castNames: input.castNames,
        crewNames: input.crewNames,
        trailerUrl: input.trailerUrl,
        formats: input.formats,
        performerNames: input.performerNames,
        ageRule: input.ageRule,
        entryRule: input.entryRule,
      },
    });
    const auditorium = venue.auditoriums[0] ?? await transaction.auditorium.create({
      data: { venueId: venue.id, name: venue.auditorium, rows: venue.rows, cols: venue.cols },
    });
    const created = await transaction.show.create({
      data: {
        title: input.title,
        type: input.type,
        description: input.description,
        contentId: content.id,
        venueId: input.venueId,
        auditoriumId: auditorium.id,
        status: input.status,
        date: input.date,
        time: input.time,
        organiserId: user!.id,
        prices: { create: input.prices },
      },
    });
    await transaction.showSeat.createMany({
      data: venue.seats.map((seat) => ({
        eventId: created.id,
        seatId: seat.id,
        status: seat.isBlocked ? SeatStatus.UNAVAILABLE : SeatStatus.AVAILABLE,
        unavailableReason: seat.isBlocked ? "Blocked auditorium position" : null,
      })),
    });
    return created;
  });

  const full = await db.show.findUnique({
    where: { id: event.id },
    include: { venue: true, content: true, organiser: { select: { name: true } }, prices: { include: { category: true } } },
  });
  return ok({ event: full ? toEventSummary(full) : null }, 201);
}

async function getEvent(request: Request, params: Record<string, string>) {
  const user = await getUser(request);
  const event = await db.show.findUnique({
    where: { id: params.id },
    include: {
      venue: { include: { categories: true } },
      content: true,
      prices: { include: { category: true } },
      organiser: { select: { name: true } },
    },
  });
  if (!event) return err("Not found", 404);
  if (event.status !== ShowStatus.PUBLISHED && user?.role !== Role.ADMIN && event.organiserId !== user?.id) return err("Not found", 404);

  const [favourite, otherShows] = await Promise.all([
    user?.role === Role.CUSTOMER && event.contentId
      ? db.favourite.findUnique({ where: { userId_contentId: { userId: user.id, contentId: event.contentId } }, select: { id: true } })
      : null,
    event.contentId
      ? db.show.findMany({
          where: { contentId: event.contentId, date: { gte: new Date().toISOString().slice(0, 10) } },
          include: { venue: true, prices: true },
          orderBy: [{ date: "asc" }, { time: "asc" }],
          take: 12,
        })
      : [],
  ]);
  const summary = toEventSummary(event, favourite && event.contentId ? new Set([event.contentId]) : new Set());
  return ok({
    event: {
      ...summary,
      venue: event.venue,
      showtimes: otherShows.map((show) => ({
        id: show.id,
        date: show.date,
        time: show.time,
        venue: show.venue,
        startingPrice: startingPrice(show.prices),
      })),
    },
  });
}

async function getSeats(request: Request, params: Record<string, string>) {
  await expireStaleOffers(params.id);
  await releaseExpiredHolds(params.id);
  const user = await getUser(request);
  const seatRows = await db.showSeat.findMany({
    where: { eventId: params.id },
    include: { seat: { include: { category: true } } },
    orderBy: [{ seat: { row: "asc" } }, { seat: { col: "asc" } }],
  });
  const venue = await db.show.findUnique({ where: { id: params.id }, select: { venue: { select: { rows: true, cols: true } } } });
  const availability: Record<string, number> = {};
  for (const showSeat of seatRows) {
    const categoryId = showSeat.seat.categoryId;
    if (availability[categoryId] === undefined) availability[categoryId] = await categoryAvailability(params.id, categoryId);
  }
  return ok({
    showSeats: seatRows.map(({ heldById, ...showSeat }) => ({ ...showSeat, heldByMe: !!user && heldById === user.id })),
    layout: venue?.venue,
    availability,
  });
}

async function holdSelectedSeats(request: Request, params: Record<string, string>) {
  const user = await getUser(request);
  if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
  const limited = await enforceRateLimit(request, { scope: "seat-hold", limit: 30, windowMs: 60_000 }, user!.id);
  if (limited) return limited;
  const body = await readJson<{ seatIds?: unknown; offerToken?: unknown }>(request);
  if (!body) return err("Invalid seat selection");
  let seatIds: string[];
  try {
    seatIds = validateSeatIds(body.seatIds);
  } catch (error) {
    return err(error instanceof ValidationError ? error.message : "Invalid seat selection");
  }
  try {
    return ok(await holdSeats(params.id, seatIds, user!.id, typeof body.offerToken === "string" ? body.offerToken : undefined));
  } catch (error) {
    return err(error instanceof Error ? error.message : "Hold failed", 409);
  }
}

async function bookSeats(request: Request, params: Record<string, string>) {
  const user = await getUser(request);
  if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
  const limited = await enforceRateLimit(request, { scope: "booking", limit: 10, windowMs: 60_000 }, user!.id);
  if (limited) return limited;
  const body = await readJson<{ seatIds?: unknown; offerToken?: unknown }>(request);
  if (!body) return err("Invalid seat selection");
  let seatIds: string[];
  try {
    seatIds = validateSeatIds(body.seatIds);
  } catch (error) {
    return err(error instanceof ValidationError ? error.message : "Invalid seat selection");
  }
  try {
    const booking = await confirmBooking(params.id, seatIds, user!.id, typeof body.offerToken === "string" ? body.offerToken : undefined);
    return ok({ booking, email: { delivered: false, mode: "queued", message: "Ticket email queued. It will appear in the local preview shortly." } }, 201);
  } catch (error) {
    return err(error instanceof Error ? error.message : "Booking failed", 409);
  }
}

async function getWaitlist(request: Request, params: Record<string, string>) {
  const user = await getUser(request);
  if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
  const entries = await db.waitlistEntry.findMany({
    where: { eventId: params.id, userId: user!.id },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });
  return ok({ entries });
}

async function joinWaitlist(request: Request, params: Record<string, string>) {
  const user = await getUser(request);
  if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
  const limited = await enforceRateLimit(request, { scope: "waitlist", limit: 10, windowMs: 60_000 }, user!.id);
  if (limited) return limited;
  const body = await readJson<{ categoryId?: unknown }>(request);
  if (typeof body?.categoryId !== "string" || !body.categoryId) return err("Category required");
  const categoryId = body.categoryId;
  const eventCategory = await db.categoryPrice.findUnique({
    where: { eventId_categoryId: { eventId: params.id, categoryId } },
    select: { id: true },
  });
  if (!eventCategory) return err("Category does not belong to this event", 404);
  const available = await db.showSeat.count({ where: { eventId: params.id, seat: { categoryId }, status: SeatStatus.AVAILABLE } });
  if (available > 0) return err("Seats still available in this category");
  const existing = await db.waitlistEntry.findUnique({
    where: { eventId_categoryId_userId: { eventId: params.id, categoryId, userId: user!.id } },
  });
  if (existing && existing.status !== WaitlistStatus.EXPIRED) return err("Already on waitlist", 409);

  let entry;
  const joinNotificationKey = randomUUID();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      entry = await db.$transaction(async (transaction) => {
        const last = await transaction.waitlistEntry.aggregate({
          where: { eventId: params.id, categoryId },
          _max: { position: true },
        });
        const position = (last._max.position ?? 0) + 1;
        const joined = await transaction.waitlistEntry.upsert({
          where: { eventId_categoryId_userId: { eventId: params.id, categoryId, userId: user!.id } },
          create: { eventId: params.id, categoryId, userId: user!.id, position, status: WaitlistStatus.WAITING },
          update: {
            position,
            status: WaitlistStatus.WAITING,
            offerToken: null,
            offerExpiresAt: null,
            offeredSeatId: null,
            offerNotifiedAt: null,
            offerNotificationAttempts: 0,
            joinedEmailSentAt: null,
            expiredEmailSentAt: null,
          },
        });
        await enqueueBackgroundJob({ type: JOB_TYPES.WAITLIST_JOINED, payload: { id: joined.id }, dedupeKey: `${JOB_TYPES.WAITLIST_JOINED}:${joined.id}:${joinNotificationKey}` }, transaction);
        return joined;
      });
      break;
    } catch (error) {
      if (attempt === 2) {
        structuredLog("error", "waitlist.position.failed", { eventId: params.id, userId: user!.id, ...safeError(error) });
        return err("Waitlist is busy; please try again", 409);
      }
    }
  }
  return ok({ entry }, 201);
}

async function getOffer(request: Request, _params: Record<string, string>, url: URL) {
  const token = url.searchParams.get("token");
  if (!token) return err("Token required");
  const user = await getUser(request);
  const offer = await getWaitlistOffer(token, user?.id);
  return offer ? ok({ offer, requiresLogin: !user }) : err("Invalid or expired offer", 404);
}

export async function openSeatStream(request: Request, params: Record<string, string>) {
  const encoder = new TextEncoder();
  let stopSubscription: (() => Promise<void>) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown, id?: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (stopSubscription) void stopSubscription();
        try { controller.close(); } catch { /* The client already disconnected. */ }
      };
      request.signal.addEventListener("abort", close, { once: true });
      send("ready", { eventId: params.id, connectedAt: new Date().toISOString() });
      heartbeat = setInterval(() => send("heartbeat", { at: new Date().toISOString() }), 15_000);
      stopSubscription = await subscribeToSeatUpdates(params.id, (update: SeatUpdate) => send("inventory", update, update.id));
      if (closed && stopSubscription) await stopSubscription();
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (stopSubscription) void stopSubscription();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const eventRoutes: RouteDefinition[] = [
  { method: "GET", path: "/api/events", handler: listEvents },
  { method: "POST", path: "/api/events", handler: createEvent },
  { method: "GET", path: "/api/events/:id", handler: getEvent },
  { method: "GET", path: "/api/events/:id/seats", handler: getSeats },
  { method: "POST", path: "/api/events/:id/seats", handler: holdSelectedSeats },
  { method: "POST", path: "/api/events/:id/book", handler: bookSeats },
  { method: "GET", path: "/api/events/:id/waitlist", handler: getWaitlist },
  { method: "POST", path: "/api/events/:id/waitlist", handler: joinWaitlist },
  { method: "GET", path: "/api/events/:id/waitlist/offer", handler: getOffer },
  { method: "GET", path: "/api/events/:id/stream", handler: openSeatStream },
];
