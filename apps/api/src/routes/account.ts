import { createHash, randomBytes } from "node:crypto";
import { BookingStatus, Role, SeatStatus } from "../../../../src/generated/prisma/client";
import { err, ok } from "../../../../src/lib/api";
import { getUser, hashPassword, requireRole, signToken, verifyPassword } from "../../../../src/lib/auth";
import { db } from "../../../../src/lib/db";
import { enforceRateLimit } from "../../../../src/lib/rate-limit";
import { enqueueBackgroundJob, JOB_TYPES } from "../../../../src/lib/jobs";
import { expireStaleOffers, offerNextWaitlistForSeat } from "../../../../src/lib/seats";
import { publishSeatUpdate } from "../../../../src/lib/realtime";
import { normalizeEmail, validateName, validatePassword, ValidationError } from "../../../../src/lib/validation";
import type { RouteDefinition } from "../types";
import { readJson } from "../types";

function customerProfile(user: {
  id: string;
  email: string;
  name: string;
  role: Role;
  reminderEmails: boolean;
  waitlistAlerts: boolean;
  emailVerifiedAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    reminderEmails: user.reminderEmails,
    waitlistAlerts: user.waitlistAlerts,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}

async function authenticatedCustomer(request: Request) {
  const user = await getUser(request);
  return requireRole(user, [Role.CUSTOMER]) ? user : null;
}

export const accountRoutes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/account",
    async handler(request) {
      const auth = await authenticatedCustomer(request);
      if (!auth) return err("Forbidden", 403);
      const user = await db.user.findUnique({ where: { id: auth.id } });
      return user ? ok({ user: customerProfile(user) }) : err("Account not found", 404);
    },
  },
  {
    method: "PATCH",
    path: "/api/account",
    async handler(request) {
      const auth = await authenticatedCustomer(request);
      if (!auth) return err("Forbidden", 403);
      const limited = await enforceRateLimit(request, { scope: "account-update", limit: 10, windowMs: 60_000 }, auth.id);
      if (limited) return limited;
      const body = await readJson<Record<string, unknown>>(request);
      if (!body) return err("Invalid account details");

      let name: string;
      let email: string;
      try {
        name = validateName(body.name);
        email = normalizeEmail(body.email);
      } catch (error) {
        return err(error instanceof ValidationError ? error.message : "Invalid account details");
      }
      if (typeof body.reminderEmails !== "boolean" || typeof body.waitlistAlerts !== "boolean") {
        return err("Choose valid notification preferences");
      }
      const reminderEmails = body.reminderEmails;
      const waitlistAlerts = body.waitlistAlerts;
      const duplicate = await db.user.findFirst({ where: { email, id: { not: auth.id } }, select: { id: true } });
      if (duplicate) return err("Email already registered", 409);

      const emailChanged = email !== auth.email;
      const verificationToken = emailChanged ? randomBytes(32).toString("hex") : null;
      const verificationTokenHash = verificationToken ? createHash("sha256").update(verificationToken).digest("hex") : null;
      const user = await db.$transaction(async (transaction) => {
        const updated = await transaction.user.update({
          where: { id: auth.id },
          data: { name, email, reminderEmails, waitlistAlerts, ...(emailChanged ? { emailVerifiedAt: null, emailVerificationTokenHash: verificationTokenHash, emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60_000) } : {}) },
        });
        if (verificationToken && verificationTokenHash) await enqueueBackgroundJob({ type: JOB_TYPES.EMAIL_VERIFICATION, payload: { userId: updated.id, token: verificationToken }, dedupeKey: `${JOB_TYPES.EMAIL_VERIFICATION}:${updated.id}:${verificationTokenHash.slice(0, 12)}` }, transaction);
        return updated;
      });
      const authUser = { id: user.id, email: user.email, name: user.name, role: user.role };
      return ok({ user: customerProfile(user), token: signToken(authUser) });
    },
  },
  {
    method: "POST",
    path: "/api/account/email-verification/resend",
    async handler(request) {
      const auth = await authenticatedCustomer(request);
      if (!auth) return err("Forbidden", 403);
      const limited = await enforceRateLimit(request, { scope: "email-verification", limit: 5, windowMs: 60 * 60_000 }, auth.id);
      if (limited) return limited;
      const verificationToken = randomBytes(32).toString("hex");
      const verificationTokenHash = createHash("sha256").update(verificationToken).digest("hex");
      const result = await db.$transaction(async (transaction) => {
        const current = await transaction.user.findUnique({ where: { id: auth.id } });
        if (!current) return "missing" as const;
        if (current.emailVerifiedAt) return "verified" as const;
        await transaction.user.update({ where: { id: current.id }, data: { emailVerificationTokenHash: verificationTokenHash, emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
        await enqueueBackgroundJob({ type: JOB_TYPES.EMAIL_VERIFICATION, payload: { userId: current.id, token: verificationToken }, dedupeKey: `${JOB_TYPES.EMAIL_VERIFICATION}:${current.id}:${verificationTokenHash.slice(0, 12)}` }, transaction);
        return "queued" as const;
      });
      if (result === "missing") return err("Account not found", 404);
      return ok({ queued: result === "queued", verified: result === "verified" });
    },
  },
  {
    method: "POST",
    path: "/api/account/email-verification/confirm",
    async handler(request) {
      const limited = await enforceRateLimit(request, { scope: "email-verification-confirm", limit: 20, windowMs: 60 * 60_000 });
      if (limited) return limited;
      const body = await readJson<{ token?: unknown }>(request);
      if (typeof body?.token !== "string" || body.token.length < 32) return err("Verification token is invalid");
      const tokenHash = createHash("sha256").update(body.token).digest("hex");
      const user = await db.user.findUnique({ where: { emailVerificationTokenHash: tokenHash } });
      if (!user || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt <= new Date()) return err("Verification link is invalid or expired", 410);
      if (!user.emailVerifiedAt) await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      return ok({ verified: true });
    },
  },
  {
    method: "POST",
    path: "/api/account/password",
    async handler(request) {
      const auth = await authenticatedCustomer(request);
      if (!auth) return err("Forbidden", 403);
      const limited = await enforceRateLimit(request, { scope: "password-change", limit: 5, windowMs: 15 * 60_000 }, auth.id);
      if (limited) return limited;
      const body = await readJson<{ currentPassword?: unknown; newPassword?: unknown }>(request);
      if (!body || typeof body.currentPassword !== "string") return err("Current password is required");
      let newPassword: string;
      try {
        newPassword = validatePassword(body.newPassword);
      } catch (error) {
        return err(error instanceof ValidationError ? error.message : "Invalid password");
      }
      const user = await db.user.findUnique({ where: { id: auth.id } });
      if (!user || !(await verifyPassword(body.currentPassword, user.password))) return err("Current password is incorrect", 401);
      if (await verifyPassword(newPassword, user.password)) return err("Choose a password different from your current password");
      await db.user.update({ where: { id: auth.id }, data: { password: await hashPassword(newPassword) } });
      return ok({ changed: true });
    },
  },
  {
    method: "DELETE",
    path: "/api/account",
    async handler(request) {
      const auth = await authenticatedCustomer(request);
      if (!auth) return err("Forbidden", 403);
      const limited = await enforceRateLimit(request, { scope: "account-delete", limit: 3, windowMs: 60 * 60_000 }, auth.id);
      if (limited) return limited;
      const body = await readJson<{ password?: unknown }>(request);
      if (!body || typeof body.password !== "string") return err("Password is required");
      const user = await db.user.findUnique({ where: { id: auth.id } });
      if (!user || !(await verifyPassword(body.password, user.password))) return err("Password is incorrect", 401);

      const [heldSeats, futureBookings] = await Promise.all([
        db.showSeat.findMany({ where: { heldById: auth.id, status: SeatStatus.HELD }, select: { eventId: true, seatId: true } }),
        db.booking.findMany({
          where: { userId: auth.id, status: BookingStatus.CONFIRMED, event: { date: { gte: new Date().toISOString().slice(0, 10) } } },
          select: { eventId: true, seats: { select: { seatId: true } } },
        }),
      ]);
      const releasedSeats = [
        ...heldSeats,
        ...futureBookings.flatMap((booking) => booking.seats.map(({ seatId }) => ({ eventId: booking.eventId, seatId }))),
      ];

      await db.$transaction(async (transaction) => {
        await transaction.showSeat.updateMany({
          where: { heldById: auth.id, status: SeatStatus.HELD },
          data: { status: SeatStatus.AVAILABLE, heldById: null, heldUntil: null, version: { increment: 1 } },
        });
        for (const booking of futureBookings) {
          await transaction.showSeat.updateMany({
            where: { eventId: booking.eventId, seatId: { in: booking.seats.map(({ seatId }) => seatId) }, status: SeatStatus.BOOKED },
            data: { status: SeatStatus.AVAILABLE, heldById: null, heldUntil: null, version: { increment: 1 } },
          });
        }
        await transaction.waitlistEntry.deleteMany({ where: { userId: auth.id } });
        await transaction.favourite.deleteMany({ where: { userId: auth.id } });
        await transaction.recentlyViewed.deleteMany({ where: { userId: auth.id } });
        await transaction.booking.deleteMany({ where: { userId: auth.id } });
        await transaction.user.delete({ where: { id: auth.id } });
      });
      for (const eventId of new Set(releasedSeats.map((seat) => seat.eventId))) void publishSeatUpdate(eventId, "released");
      for (const { eventId, seatId } of releasedSeats) await offerNextWaitlistForSeat(eventId, seatId);
      return ok({ deleted: true });
    },
  },
  {
    method: "GET",
    path: "/api/waitlist",
    async handler(request) {
      const auth = await authenticatedCustomer(request);
      if (!auth) return err("Forbidden", 403);
      await expireStaleOffers();
      const entries = await db.waitlistEntry.findMany({
        where: { userId: auth.id },
        include: {
          category: true,
          event: { include: { venue: true, content: { select: { posterUrl: true } } } },
        },
        orderBy: { createdAt: "desc" },
      });
      return ok({ entries });
    },
  },
];
