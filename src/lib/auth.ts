import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Role } from "@/generated/prisma/client";
import { db } from "./db";

function signingSecret() {
  const secret = process.env.JWT_SECRET ?? "dev-secret";
  if (process.env.NODE_ENV === "production" && (Buffer.byteLength(secret) < 32 || /^(dev-secret|change-me-in-production|test-secret)$/.test(secret))) {
    throw new Error("Production requires a private JWT_SECRET of at least 32 bytes.");
  }
  return secret;
}

const SESSION_SECONDS = 8 * 60 * 60;
const sessionUserSelect = { id: true, email: true, name: true, role: true, password: true, firebaseUid: true } as const;
type SessionUser = AuthUser & { password: string; firebaseUid: string | null };

function sessionStamp(user: SessionUser) {
  return createHmac("sha256", signingSecret()).update(JSON.stringify([user.id, user.password, user.email, user.role, user.firebaseUid])).digest("base64url");
}

export function sessionCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-cinebook_session" : "cinebook_session";
}

export function sessionCookie(token: string, clear = false) {
  return `${sessionCookieName()}=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signToken(user: AuthUser) {
  const current = await db.user.findUnique({ where: { id: user.id }, select: sessionUserSelect });
  if (!current) throw new Error("Cannot create a session for a missing account.");
  return jwt.sign(
    { sub: current.id, sv: sessionStamp(current) },
    signingSecret(),
    { algorithm: "HS256", issuer: "cinebook", audience: "cinebook-api", expiresIn: SESSION_SECONDS, jwtid: randomUUID() }
  );
}

export function getToken(req: Request) {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7, 8199);
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const tokenCookie = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${sessionCookieName()}=`));
  try { return tokenCookie ? decodeURIComponent(tokenCookie.slice(sessionCookieName().length + 1)) : null; }
  catch { return null; }
}

export async function getUser(req: Request): Promise<AuthUser | null> {
  const token = getToken(req);
  if (!token) return null;
  try {
    if (token.length > 8192) return null;
    const payload = jwt.verify(token, signingSecret(), { algorithms: ["HS256"], issuer: "cinebook", audience: "cinebook-api" });
    if (typeof payload === "string" || typeof payload.sub !== "string" || typeof payload.sv !== "string") return null;
    const user = await db.user.findUnique({ where: { id: payload.sub }, select: sessionUserSelect });
    if (!user) return null;
    const expected = Buffer.from(sessionStamp(user));
    const supplied = Buffer.from(payload.sv);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  } catch {
    return null;
  }
}

export function requireRole(user: AuthUser | null, roles: Role[]) {
  return !!user && roles.includes(user.role);
}
