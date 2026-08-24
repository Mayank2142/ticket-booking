import { NextRequest } from "next/server";
import { err, ok } from "@/lib/api";
import { signToken, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeEmail, ValidationError } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const { email: rawEmail, password } = await req.json();
  let email: string;
  try {
    email = normalizeEmail(rawEmail);
  } catch (error) {
    return err(error instanceof ValidationError ? error.message : "Invalid credentials", 401);
  }
  if (typeof password !== "string" || !password) return err("Invalid credentials", 401);

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.password))) {
    return err("Invalid credentials", 401);
  }

  const authUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  return ok({ token: signToken(authUser), user: authUser });
}
