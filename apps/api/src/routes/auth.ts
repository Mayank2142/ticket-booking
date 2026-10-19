import { createHash, randomBytes } from "node:crypto";
import { err, ok } from "../../../../src/lib/api";
import { getUser, hashPassword, sessionCookie, verifyPassword } from "../../../../src/lib/auth";
import { authenticatedResponse } from "../../../../src/lib/auth-response";
import { db } from "../../../../src/lib/db";
import { enforceRateLimit } from "../../../../src/lib/rate-limit";
import { enqueueBackgroundJob, JOB_TYPES } from "../../../../src/lib/jobs";
import { FirebaseAuthError, firebasePublicConfig, verifyFirebaseIdToken } from "../../../../src/lib/firebase-auth";
import { exchangeFirebaseIdentity } from "../../../../src/lib/firebase-session";
import {
  normalizeEmail,
  validateName,
  validatePassword,
  validateRegistrationRole,
  ValidationError,
} from "../../../../src/lib/validation";
import type { RouteDefinition } from "../types";
import { readJson } from "../types";

export const authRoutes: RouteDefinition[] = [
  { method: "POST", path: "/api/auth/logout", handler: () => Response.json({ signedOut: true }, { headers: { "Set-Cookie": sessionCookie("", true), "Cache-Control": "no-store" } }) },
  { method: "GET", path: "/api/auth/providers", handler: () => ok({ firebase: firebasePublicConfig() }) },
  {
    method: "POST", path: "/api/auth/firebase",
    async handler(request) {
      const limited = await enforceRateLimit(request, { scope: "firebase-login", limit: 20, windowMs: 15 * 60_000 });
      if (limited) return limited;
      const body = await readJson<{ idToken?: unknown; link?: unknown }>(request);
      if (typeof body?.idToken !== "string" || !body.idToken || body.idToken.length > 16_384) return err("A valid Firebase ID token is required");
      const current = body.link === true ? await getUser(request) : null;
      if (body.link === true && !current) return err("Log in to your existing account before linking Google.", 401);
      try {
        const principal = await verifyFirebaseIdToken(body.idToken);
        const user = await exchangeFirebaseIdentity(principal, current?.id);
        const authUser = { id: user.id, email: user.email, name: user.name, role: user.role };
        return authenticatedResponse(request, authUser);
      } catch (error) {
        return err(error instanceof FirebaseAuthError ? error.message : "Firebase sign-in could not be completed. Please try again.", error instanceof FirebaseAuthError ? error.status : 409);
      }
    },
  },
  {
    method: "POST",
    path: "/api/auth/login",
    async handler(request) {
      const limited = await enforceRateLimit(request, { scope: "auth-login", limit: 10, windowMs: 15 * 60_000 });
      if (limited) return limited;
      const body = await readJson<{ email?: unknown; password?: unknown }>(request);
      if (!body) return err("Invalid credentials", 401);

      let email: string;
      try {
        email = normalizeEmail(body.email);
      } catch (error) {
        return err(error instanceof ValidationError ? error.message : "Invalid credentials", 401);
      }
      if (typeof body.password !== "string" || !body.password || body.password.length > 128) return err("Invalid credentials", 401);
      const accountLimited = await enforceRateLimit(request, { scope: "auth-login-account", limit: 20, windowMs: 15 * 60_000 }, email);
      if (accountLimited) return accountLimited;

      const user = await db.user.findUnique({ where: { email } });
      // Missing and provider-only accounts still perform the same expensive password check.
      const validPassword = await verifyPassword(body.password, user?.passwordLoginEnabled ? user.password : "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy");
      if (!user || !user.passwordLoginEnabled || !validPassword) return err("Invalid credentials", 401);
      const authUser = { id: user.id, email: user.email, name: user.name, role: user.role };
      return authenticatedResponse(request, authUser);
    },
  },
  {
    method: "POST",
    path: "/api/auth/register",
    async handler(request) {
      const limited = await enforceRateLimit(request, { scope: "auth-register", limit: 5, windowMs: 60 * 60_000 });
      if (limited) return limited;
      const body = await readJson<Record<string, unknown>>(request);
      if (!body) return err("Invalid registration details");

      let email: string;
      let password: string;
      let name: string;
      let role;
      try {
        email = normalizeEmail(body.email);
        password = validatePassword(body.password);
        name = validateName(body.name);
        role = validateRegistrationRole(body.role);
      } catch (error) {
        return err(error instanceof ValidationError ? error.message : "Invalid registration details");
      }

      if (await db.user.findUnique({ where: { email } })) return err("Email already registered", 409);
      const verificationToken = randomBytes(32).toString("hex");
      const verificationTokenHash = createHash("sha256").update(verificationToken).digest("hex");
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60_000);
      const user = await db.$transaction(async (transaction) => {
        const created = await transaction.user.create({ data: { email, name, password: await hashPassword(password), role, emailVerificationTokenHash: verificationTokenHash, emailVerificationExpiresAt: verificationExpiresAt } });
        await enqueueBackgroundJob({ type: JOB_TYPES.EMAIL_VERIFICATION, payload: { userId: created.id, token: verificationToken }, dedupeKey: `${JOB_TYPES.EMAIL_VERIFICATION}:${created.id}:${verificationTokenHash.slice(0, 12)}` }, transaction);
        return created;
      });
      const authUser = { id: user.id, email: user.email, name: user.name, role: user.role };
      return authenticatedResponse(request, authUser, { emailVerificationQueued: true }, 201);
    },
  },
  {
    method: "GET",
    path: "/api/auth/me",
    async handler(request) {
      const user = await getUser(request);
      return user ? ok({ user }) : err("Unauthorized", 401);
    },
  },
];
