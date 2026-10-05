import { BookingStatus, Role, ShowStatus, WaitlistStatus } from "../../../../src/generated/prisma/client";
import { err, ok } from "../../../../src/lib/api";
import { writeAuditLog } from "../../../../src/lib/audit";
import { getUser, requireRole } from "../../../../src/lib/auth";
import { db } from "../../../../src/lib/db";
import { deliverBookingTicket, deliverWaitlistOffer } from "../../../../src/lib/delivery";
import { verifyEmailTransport } from "../../../../src/lib/email";
import { renderNotificationEmail, type NotificationKind } from "../../../../src/lib/email-templates";
import { processDueBackgroundJobs } from "../../../../src/lib/job-worker";
import { enqueueBackgroundJob, JOB_TYPES, retryBackgroundJob } from "../../../../src/lib/jobs";
import { getRedisDiagnostics } from "../../../../src/lib/realtime";
import { validateName, ValidationError } from "../../../../src/lib/validation";
import type { RouteDefinition } from "../types";
import { readJson } from "../types";

async function admin(request: Request) {
  const user = await getUser(request);
  return requireRole(user, [Role.ADMIN]) ? user : null;
}

function slugify(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function pageParams(url: URL) {
  const rawPage = url.searchParams.get("page");
  const rawPageSize = url.searchParams.get("pageSize");
  const page = rawPage === null ? 1 : Number(rawPage);
  const pageSize = rawPageSize === null ? 25 : Number(rawPageSize);
  if (!Number.isInteger(page) || page < 1 || page > 10_000) throw new ValidationError("page must be an integer from 1 to 10000");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new ValidationError("pageSize must be an integer from 1 to 100");
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function validatedPageParams(url: URL) {
  try { return { ok: true as const, value: pageParams(url) }; }
  catch (error) { return { ok: false as const, error: err(error instanceof ValidationError ? error.message : "Invalid pagination") }; }
}

export const adminRoutes: RouteDefinition[] = [
  {
    method: "GET", path: "/api/admin/overview", async handler(request) {
      if (!await admin(request)) return err("Forbidden", 403);
      const [users, organisers, customers, venues, shows, published, bookings, revenue, waitlisted, emailFailures, latestRun] = await Promise.all([
        db.user.count(), db.user.count({ where: { role: Role.ORGANISER } }), db.user.count({ where: { role: Role.CUSTOMER } }), db.venue.count({ where: { archivedAt: null } }), db.show.count(), db.show.count({ where: { status: ShowStatus.PUBLISHED } }), db.booking.count({ where: { status: BookingStatus.CONFIRMED } }), db.booking.aggregate({ where: { status: BookingStatus.CONFIRMED }, _sum: { totalAmount: true } }), db.waitlistEntry.count({ where: { status: { in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] } } }), db.booking.count({ where: { ticketEmailSentAt: null, ticketEmailAttempts: { gt: 0 }, ticketEmailLastError: { not: null } } }), db.maintenanceRun.findFirst({ orderBy: { startedAt: "desc" } }),
      ]);
      return ok({ stats: { users, organisers, customers, venues, shows, published, bookings, revenue: revenue._sum.totalAmount ?? 0, waitlisted, emailFailures }, latestRun });
    },
  },
  {
    method: "GET", path: "/api/admin/cities", async handler(request) {
      if (!await admin(request)) return err("Forbidden", 403);
      return ok({ cities: await db.city.findMany({ include: { _count: { select: { venues: true } } }, orderBy: { name: "asc" } }) });
    },
  },
  {
    method: "POST", path: "/api/admin/cities", async handler(request) {
      const user = await admin(request); if (!user) return err("Forbidden", 403);
      const body = await readJson<{ name?: unknown }>(request);
      let name: string; try { name = validateName(body?.name, "City"); } catch (error) { return err(error instanceof ValidationError ? error.message : "Invalid city"); }
      if (await db.city.findUnique({ where: { name } })) return err("City already exists", 409);
      const city = await db.city.create({ data: { name, slug: slugify(name) } });
      await writeAuditLog({ actorId: user.id, action: "CITY_CREATED", entityType: "City", entityId: city.id, metadata: { name } });
      return ok({ city }, 201);
    },
  },
  {
    method: "PATCH", path: "/api/admin/cities/:id", async handler(request, params) {
      const user = await admin(request); if (!user) return err("Forbidden", 403);
      const body = await readJson<{ name?: unknown; archived?: unknown }>(request);
      const current = await db.city.findUnique({ where: { id: params.id } }); if (!current) return err("City not found", 404);
      let name = current.name;
      if (body?.name !== undefined) { try { name = validateName(body.name, "City"); } catch (error) { return err(error instanceof ValidationError ? error.message : "Invalid city"); } }
      const city = await db.city.update({ where: { id: current.id }, data: { name, slug: slugify(name), ...(typeof body?.archived === "boolean" ? { archivedAt: body.archived ? new Date() : null } : {}) } });
      await db.venue.updateMany({ where: { cityId: city.id }, data: { city: city.name } });
      await writeAuditLog({ actorId: user.id, action: body?.archived ? "CITY_ARCHIVED" : "CITY_UPDATED", entityType: "City", entityId: city.id, metadata: { name } });
      return ok({ city });
    },
  },
  {
    method: "GET", path: "/api/admin/auditoriums", async handler(request) {
      if (!await admin(request)) return err("Forbidden", 403);
      return ok({ auditoriums: await db.auditorium.findMany({ include: { venue: { select: { id: true, name: true, city: true, archivedAt: true } }, _count: { select: { shows: true } } }, orderBy: [{ venue: { name: "asc" } }, { name: "asc" }] }) });
    },
  },
  {
    method: "POST", path: "/api/admin/auditoriums", async handler(request) {
      const user = await admin(request); if (!user) return err("Forbidden", 403);
      const body = await readJson<{ venueId?: unknown; name?: unknown }>(request);
      let name: string; try { name = validateName(body?.name, "Auditorium"); } catch (error) { return err(error instanceof ValidationError ? error.message : "Invalid auditorium"); }
      if (typeof body?.venueId !== "string") return err("Venue is required");
      const venue = await db.venue.findFirst({ where: { id: body.venueId, archivedAt: null } }); if (!venue) return err("Active venue not found", 404);
      const auditorium = await db.auditorium.create({ data: { venueId: venue.id, name, rows: venue.rows, cols: venue.cols } }).catch(() => null);
      if (!auditorium) return err("Auditorium name already exists at this venue", 409);
      await writeAuditLog({ actorId: user.id, action: "AUDITORIUM_CREATED", entityType: "Auditorium", entityId: auditorium.id, metadata: { venueId: venue.id, name } });
      return ok({ auditorium }, 201);
    },
  },
  {
    method: "PATCH", path: "/api/admin/auditoriums/:id", async handler(request, params) {
      const user = await admin(request); if (!user) return err("Forbidden", 403);
      const body = await readJson<{ name?: unknown; archived?: unknown }>(request);
      const current = await db.auditorium.findUnique({ where: { id: params.id } }); if (!current) return err("Auditorium not found", 404);
      let name = current.name; if (body?.name !== undefined) { try { name = validateName(body.name, "Auditorium"); } catch (error) { return err(error instanceof ValidationError ? error.message : "Invalid auditorium"); } }
      const auditorium = await db.auditorium.update({ where: { id: current.id }, data: { name, ...(typeof body?.archived === "boolean" ? { archivedAt: body.archived ? new Date() : null } : {}) } }).catch(() => null);
      if (!auditorium) return err("Auditorium name already exists at this venue", 409);
      await writeAuditLog({ actorId: user.id, action: body?.archived ? "AUDITORIUM_ARCHIVED" : "AUDITORIUM_UPDATED", entityType: "Auditorium", entityId: current.id, metadata: { name } });
      return ok({ auditorium });
    },
  },
  {
    method: "PATCH", path: "/api/admin/venues/:id/archive", async handler(request, params) {
      const user = await admin(request); if (!user) return err("Forbidden", 403);
      const body = await readJson<{ archived?: unknown }>(request); if (typeof body?.archived !== "boolean") return err("Archive state is required");
      const venue = await db.venue.update({ where: { id: params.id }, data: { archivedAt: body.archived ? new Date() : null } }).catch(() => null);
      if (!venue) return err("Venue not found", 404);
      await writeAuditLog({ actorId: user.id, action: body.archived ? "VENUE_ARCHIVED" : "VENUE_RESTORED", entityType: "Venue", entityId: venue.id, metadata: { name: venue.name } });
      return ok({ venue });
    },
  },
  {
    method: "GET", path: "/api/admin/users", async handler(request, _params, url) {
      if (!await admin(request)) return err("Forbidden", 403); const paging = validatedPageParams(url); if (!paging.ok) return paging.error; const { page, pageSize, skip } = paging.value; const q = url.searchParams.get("q")?.trim(); const role = url.searchParams.get("role") as Role | null;
      if (q && q.length > 100) return err("q must be no more than 100 characters");
      if (role && !Object.values(Role).includes(role)) return err(`role must be one of: ${Object.values(Role).join(", ")}`);
      const where = { ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}), ...(role && Object.values(Role).includes(role) ? { role } : {}) };
      const [users, total] = await Promise.all([db.user.findMany({ where, select: { id: true, name: true, email: true, role: true, createdAt: true, _count: { select: { bookings: true, events: true } } }, orderBy: { createdAt: "desc" }, skip, take: pageSize }), db.user.count({ where })]);
      return ok({ users, pagination: { page, pageSize, total } });
    },
  },
  {
    method: "PATCH", path: "/api/admin/users/:id/role", async handler(request, params) {
      const user = await admin(request); if (!user) return err("Forbidden", 403); const body = await readJson<{ role?: unknown }>(request);
      if (typeof body?.role !== "string" || !Object.values(Role).includes(body.role as Role)) return err("Valid role required");
      if (params.id === user.id && body.role !== Role.ADMIN) return err("You cannot remove your own administrator role", 409);
      const target = await db.user.findUnique({ where: { id: params.id } }); if (!target) return err("User not found", 404);
      if (target.role === Role.ADMIN && body.role !== Role.ADMIN && await db.user.count({ where: { role: Role.ADMIN } }) <= 1) return err("At least one administrator is required", 409);
      const updated = await db.user.update({ where: { id: target.id }, data: { role: body.role as Role } });
      await writeAuditLog({ actorId: user.id, action: "USER_ROLE_CHANGED", entityType: "User", entityId: target.id, metadata: { from: target.role, to: updated.role } });
      return ok({ user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role } });
    },
  },
  {
    method: "GET", path: "/api/admin/shows", async handler(request, _params, url) {
      if (!await admin(request)) return err("Forbidden", 403); const paging = validatedPageParams(url); if (!paging.ok) return paging.error; const { page, pageSize, skip } = paging.value; const status = url.searchParams.get("status") as ShowStatus | null;
      if (status && !Object.values(ShowStatus).includes(status)) return err(`status must be one of: ${Object.values(ShowStatus).join(", ")}`);
      const where = status && Object.values(ShowStatus).includes(status) ? { status } : {};
      const [shows, total] = await Promise.all([db.show.findMany({ where, include: { organiser: { select: { name: true, email: true } }, venue: { select: { name: true, city: true } }, _count: { select: { bookings: true, waitlist: true } } }, orderBy: [{ date: "desc" }, { time: "desc" }], skip, take: pageSize }), db.show.count({ where })]);
      return ok({ shows, pagination: { page, pageSize, total } });
    },
  },
  {
    method: "GET", path: "/api/admin/bookings", async handler(request, _params, url) {
      if (!await admin(request)) return err("Forbidden", 403); const paging = validatedPageParams(url); if (!paging.ok) return paging.error; const { page, pageSize, skip } = paging.value;
      const [bookings, total] = await Promise.all([db.booking.findMany({ include: { user: { select: { name: true, email: true } }, event: { include: { organiser: { select: { name: true } }, venue: { select: { name: true } } } }, seats: { include: { seat: { select: { label: true } } } } }, orderBy: { createdAt: "desc" }, skip, take: pageSize }), db.booking.count()]);
      return ok({ bookings, pagination: { page, pageSize, total } });
    },
  },
  {
    method: "GET", path: "/api/admin/operations", async handler(request) {
      if (!await admin(request)) return err("Forbidden", 403);
      const [runs, jobs, previews, bookingEmails, waitlistEmails, redis, email] = await Promise.all([
        db.maintenanceRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
        db.backgroundJob.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
        db.emailPreview.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, kind: true, recipient: true, subject: true, relatedEntityId: true, createdAt: true } }),
        db.booking.findMany({ where: { ticketEmailSentAt: null, ticketEmailAttempts: { gt: 0 }, ticketEmailLastError: { not: null } }, include: { user: { select: { email: true } }, event: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
        db.waitlistEntry.findMany({ where: { offerNotifiedAt: null, offerNotificationAttempts: { gt: 0 }, offerNotificationLastError: { not: null } }, include: { user: { select: { email: true } }, event: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
        getRedisDiagnostics(),
        verifyEmailTransport(),
      ]);
      return ok({ runs, jobs: jobs.map((job) => ({ ...job, payloadJson: undefined })), previews, diagnostics: { redis, email }, emailFailures: [...bookingEmails.map((item) => ({ kind: "booking", id: item.id, recipient: item.user.email, eventTitle: item.event.title, attempts: item.ticketEmailAttempts, error: item.ticketEmailLastError })), ...waitlistEmails.map((item) => ({ kind: "waitlist", id: item.id, recipient: item.user.email, eventTitle: item.event.title, attempts: item.offerNotificationAttempts, error: item.offerNotificationLastError }))] });
    },
  },
  {
    method: "POST", path: "/api/admin/operations/run", async handler(request) {
      const user = await admin(request); if (!user) return err("Forbidden", 403);
      const job = await enqueueBackgroundJob({ type: JOB_TYPES.MAINTENANCE, dedupeKey: `maintenance:manual:${Date.now()}`, maxAttempts: 8 });
      const result = await processDueBackgroundJobs(25);
      await writeAuditLog({ actorId: user.id, action: "MAINTENANCE_RUN", entityType: "BackgroundJob", entityId: job.id });
      return ok({ jobId: job.id, result });
    },
  },
  {
    method: "POST", path: "/api/admin/jobs/:id/retry", async handler(request, params) {
      const user = await admin(request); if (!user) return err("Forbidden", 403);
      const retried = await retryBackgroundJob(params.id);
      if (retried.count !== 1) return err("Only failed or waiting jobs can be retried", 409);
      const result = await processDueBackgroundJobs(25);
      await writeAuditLog({ actorId: user.id, action: "BACKGROUND_JOB_RETRIED", entityType: "BackgroundJob", entityId: params.id });
      return ok({ retried: true, result });
    },
  },
  {
    method: "GET", path: "/api/admin/email-previews/:id", async handler(request, params) {
      if (!await admin(request)) return err("Forbidden", 403);
      const preview = await db.emailPreview.findUnique({ where: { id: params.id } });
      return preview ? ok({ preview }) : err("Email preview not found", 404);
    },
  },
  {
    method: "POST", path: "/api/admin/email-previews/samples", async handler(request) {
      const user = await admin(request); if (!user) return err("Forbidden", 403);
      const kinds: NotificationKind[] = ["EMAIL_VERIFICATION", "BOOKING_CONFIRMATION", "BOOKING_CANCELLATION", "WAITLIST_JOINED", "WAITLIST_OFFER", "WAITLIST_OFFER_EXPIRED", "BOOKING_REMINDER", "ALERT_SUBSCRIPTION"];
      const created = [];
      for (const kind of kinds) {
        const template = renderNotificationEmail({ kind, name: "Preview Customer", eventTitle: "CineBook Premiere Night", bookingRef: "BK-PREVIEW", seats: ["F11", "F12"], category: "Premium", actionUrl: `${process.env.WEB_URL ?? "http://localhost:5173"}/`, expiresAt: new Date(Date.now() + 15 * 60_000), showtime: "Tomorrow · 19:30" });
        created.push(await db.emailPreview.create({ data: { kind, recipient: "preview@cinebook.local", subject: template.subject, textBody: template.text, htmlBody: template.html, relatedEntityId: "sample" } }));
      }
      await writeAuditLog({ actorId: user.id, action: "EMAIL_PREVIEWS_GENERATED", entityType: "EmailPreview", metadata: { count: created.length } });
      return ok({ count: created.length }, 201);
    },
  },
  {
    method: "POST", path: "/api/admin/email/:kind/:id/retry", async handler(request, params) {
      const user = await admin(request); if (!user) return err("Forbidden", 403);
      const result = params.kind === "booking" ? await deliverBookingTicket(params.id) : params.kind === "waitlist" ? await deliverWaitlistOffer(params.id) : null;
      if (!result) return err("Unknown delivery type", 404);
      await writeAuditLog({ actorId: user.id, action: "EMAIL_RETRIED", entityType: params.kind, entityId: params.id, metadata: { delivered: result.delivered } });
      return ok({ result });
    },
  },
  {
    method: "GET", path: "/api/admin/audit", async handler(request, _params, url) {
      if (!await admin(request)) return err("Forbidden", 403); const paging = validatedPageParams(url); if (!paging.ok) return paging.error; const { page, pageSize, skip } = paging.value;
      const [logs, total] = await Promise.all([db.auditLog.findMany({ include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip, take: pageSize }), db.auditLog.count()]);
      return ok({ logs: logs.map((log) => ({ ...log, metadata: JSON.parse(log.metadata) })), pagination: { page, pageSize, total } });
    },
  },
];
