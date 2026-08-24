import { ok } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await db.$queryRaw`SELECT 1`;
  const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  return ok({ status: "ok", database: "connected", smtpConfigured, timestamp: new Date().toISOString() });
}
