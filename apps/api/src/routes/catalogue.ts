import { Role } from "../../../../src/generated/prisma/client";
import { err, ok } from "../../../../src/lib/api";
import { getUser, requireRole } from "../../../../src/lib/auth";
import { toEventSummary } from "../../../../src/lib/catalog";
import { db } from "../../../../src/lib/db";
import { sendAlertSubscriptionEmail } from "../../../../src/lib/email";
import { enforceRateLimit } from "../../../../src/lib/rate-limit";
import { normalizeEmail, ValidationError } from "../../../../src/lib/validation";
import type { RouteDefinition } from "../types";
import { readJson } from "../types";

export const catalogueRoutes: RouteDefinition[] = [
  {
    method: "POST",
    path: "/api/alerts",
    async handler(request) {
      const limited = await enforceRateLimit(request, { scope: "email-alerts", limit: 5, windowMs: 60_000 });
      if (limited) return limited;
      const body = await readJson<{ email?: unknown }>(request);
      let email: string;
      try { email = normalizeEmail(body?.email); } catch (error) { return err(error instanceof ValidationError ? error.message : "Enter a valid email address"); }
      const subscription = await db.alertSubscription.upsert({ where: { email }, create: { email }, update: { active: true } });
      const delivery = await sendAlertSubscriptionEmail(email);
      await db.alertSubscription.update({ where: { id: subscription.id }, data: { deliveryAttempts: { increment: 1 }, lastError: delivery.delivered || delivery.mode === "preview" ? null : delivery.message, ...(delivery.delivered ? { confirmationSentAt: new Date() } : {}) } });
      return ok({ active: true, delivered: delivery.delivered, mode: delivery.mode, message: delivery.message }, 201);
    },
  },
  {
    method: "GET",
    path: "/api/discovery/options",
    async handler() {
      const [venues, content] = await Promise.all([
        db.venue.findMany({ select: { id: true, name: true, city: true }, orderBy: [{ city: "asc" }, { name: "asc" }] }),
        db.content.findMany({ select: { genre: true, language: true, format: true, formats: true } }),
      ]);
      return ok({
        cities: Array.from(new Set(venues.map((venue) => venue.city))).sort(),
        venues,
        genres: Array.from(new Set(content.map((item) => item.genre))).sort(),
        languages: Array.from(new Set(content.map((item) => item.language))).sort(),
        formats: Array.from(new Set(content.flatMap((item) => (item.formats || item.format).split("|").map((value) => value.trim()).filter(Boolean)))).sort(),
      });
    },
  },
  {
    method: "GET",
    path: "/api/recently-viewed",
    async handler(request) {
      const user = await getUser(request);
      if (!requireRole(user, [Role.CUSTOMER])) return ok({ events: [] });
      const rows = await db.recentlyViewed.findMany({
        where: { userId: user!.id },
        include: {
          content: {
            include: {
              shows: {
                where: { status: "PUBLISHED" },
                include: { content: true, venue: true, organiser: { select: { name: true } }, prices: { include: { category: true } } },
                orderBy: [{ date: "asc" }, { time: "asc" }],
                take: 1,
              },
            },
          },
        },
        orderBy: { viewedAt: "desc" },
        take: 8,
      });
      const favouriteRows = await db.favourite.findMany({ where: { userId: user!.id }, select: { contentId: true } });
      const favouriteIds = new Set(favouriteRows.map((item) => item.contentId));
      return ok({ events: rows.flatMap((row) => row.content.shows[0] ? [toEventSummary(row.content.shows[0], favouriteIds)] : []) });
    },
  },
  {
    method: "POST",
    path: "/api/recently-viewed",
    async handler(request) {
      const user = await getUser(request);
      if (!requireRole(user, [Role.CUSTOMER])) return ok({ stored: false });
      const body = await readJson<{ eventId?: unknown }>(request);
      if (!body || typeof body.eventId !== "string") return err("Event is required");
      const event = await db.show.findUnique({ where: { id: body.eventId }, select: { contentId: true } });
      if (!event?.contentId) return err("Catalogue content not found", 404);
      await db.recentlyViewed.upsert({
        where: { userId_contentId: { userId: user!.id, contentId: event.contentId } },
        create: { userId: user!.id, contentId: event.contentId },
        update: { viewedAt: new Date() },
      });
      return ok({ stored: true });
    },
  },
  {
    method: "GET",
    path: "/api/favourites",
    async handler(request) {
      const user = await getUser(request);
      if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
      const limited = await enforceRateLimit(request, { scope: "favourites", limit: 60, windowMs: 60_000 }, user!.id);
      if (limited) return limited;
      const favourites = await db.favourite.findMany({
        where: { userId: user!.id },
        include: {
          content: {
            include: {
              shows: {
                where: { status: "PUBLISHED" },
                include: { content: true, venue: true, organiser: { select: { name: true } }, prices: { include: { category: true } } },
                orderBy: [{ date: "asc" }, { time: "asc" }],
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      const favouriteIds = new Set(favourites.map((item) => item.contentId));
      return ok({ events: favourites.flatMap((item) => item.content.shows[0] ? [toEventSummary(item.content.shows[0], favouriteIds)] : []) });
    },
  },
  {
    method: "POST",
    path: "/api/favourites",
    async handler(request) {
      const user = await getUser(request);
      if (!requireRole(user, [Role.CUSTOMER])) return err("Forbidden", 403);
      const body = await readJson<{ eventId?: unknown; favourite?: unknown }>(request);
      if (!body || typeof body.eventId !== "string" || typeof body.favourite !== "boolean") {
        return err("Event and favourite state are required");
      }
      const event = await db.show.findUnique({ where: { id: body.eventId }, select: { contentId: true } });
      if (!event) return err("Event not found", 404);
      if (!event.contentId) return err("This event is not connected to the catalogue", 409);
      if (body.favourite) {
        await db.favourite.upsert({
          where: { userId_contentId: { userId: user!.id, contentId: event.contentId } },
          update: {},
          create: { userId: user!.id, contentId: event.contentId },
        });
      } else {
        await db.favourite.deleteMany({ where: { userId: user!.id, contentId: event.contentId } });
      }
      return ok({ contentId: event.contentId, favourite: body.favourite });
    },
  },
  {
    method: "GET",
    path: "/api/recommendations",
    async handler(request) {
      const user = await getUser(request);
      const customerId = user?.role === Role.CUSTOMER ? user.id : null;
      const today = new Date().toISOString().slice(0, 10);
      const [favourites, bookingSignals, candidates] = await Promise.all([
        customerId ? db.favourite.findMany({ where: { userId: customerId }, include: { content: true } }) : [],
        customerId
          ? db.booking.findMany({
              where: { userId: customerId },
              select: { event: { select: { content: { select: { type: true, genre: true, language: true } } } } },
              take: 20,
              orderBy: { createdAt: "desc" },
            })
          : [],
        db.show.findMany({
          where: { date: { gte: today } },
          include: {
            content: true,
            venue: true,
            organiser: { select: { name: true } },
            prices: { include: { category: true } },
            _count: { select: { bookings: true } },
          },
          orderBy: [{ date: "asc" }, { time: "asc" }],
          take: 60,
        }),
      ]);
      const favouriteContentIds = new Set(favourites.map((item) => item.contentId));
      const preferredGenres = new Set([
        ...favourites.map((item) => item.content.genre),
        ...bookingSignals.flatMap((item) => item.event.content?.genre ? [item.event.content.genre] : []),
      ]);
      const preferredLanguages = new Set([
        ...favourites.map((item) => item.content.language),
        ...bookingSignals.flatMap((item) => item.event.content?.language ? [item.event.content.language] : []),
      ]);
      const earliestByContent = new Map<string, (typeof candidates)[number]>();
      for (const event of candidates) {
        const key = event.contentId ?? event.id;
        if (!earliestByContent.has(key)) earliestByContent.set(key, event);
      }
      const recommendations = Array.from(earliestByContent.values())
        .map((event) => ({
          event,
          score: event._count.bookings
            + (event.content && preferredGenres.has(event.content.genre) ? 20 : 0)
            + (event.content && preferredLanguages.has(event.content.language) ? 8 : 0),
        }))
        .sort((left, right) => right.score - left.score || left.event.date.localeCompare(right.event.date))
        .slice(0, 6)
        .map(({ event }) => toEventSummary(event, favouriteContentIds));
      return ok({ recommendations, personalised: Boolean(customerId && (favourites.length || bookingSignals.length)) });
    },
  },
];
