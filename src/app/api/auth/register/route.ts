import { NextRequest } from "next/server";
import { err, ok } from "@/lib/api";
import { hashPassword, signToken } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  normalizeEmail,
  validateName,
  validatePassword,
  validateRegistrationRole,
  ValidationError,
} from "@/lib/validation";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, { scope: "auth-register", limit: 5, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return err("Invalid registration details");
  let email: string;
  let password: string;
  let name: string;
  let userRole;
  try {
    email = normalizeEmail(body.email);
    password = validatePassword(body.password);
    name = validateName(body.name);
    userRole = validateRegistrationRole(body.role);
  } catch (error) {
    return err(error instanceof ValidationError ? error.message : "Invalid registration details");
  }

  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return err("Email already registered", 409);

  const user = await db.user.create({
    data: { email, name, password: await hashPassword(password), role: userRole },
  });

  const authUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  return ok({ token: signToken(authUser), user: authUser }, 201);
}
