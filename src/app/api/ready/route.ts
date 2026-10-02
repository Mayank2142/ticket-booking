import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRedisClient } from "@/lib/realtime";
import { safeError, structuredLog } from "@/lib/observability";

export const dynamic = "force-dynamic";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Readiness check exceeded ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function GET() {
  const checks = {
    database: "checking",
    redis: process.env.REDIS_URL ? "checking" : "disabled",
    smtp: process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS ? "configured" : "unconfigured",
  };

  try {
    await withTimeout(db.$queryRaw`SELECT 1`, 3_000);
    checks.database = "connected";
    if (process.env.REDIS_URL) {
      const redis = await withTimeout(getRedisClient(), 3_000);
      if (!redis?.isReady || (await withTimeout(redis.ping(), 2_000)) !== "PONG") {
        throw new Error("Redis is configured but unavailable");
      }
      checks.redis = "connected";
    }
    if (process.env.READINESS_REQUIRE_SMTP === "true" && checks.smtp !== "configured") {
      throw new Error("SMTP is required but not configured");
    }
    return NextResponse.json({ status: "ready", checks, timestamp: new Date().toISOString() });
  } catch (error) {
    structuredLog("error", "readiness.failed", { checks, ...safeError(error) });
    return NextResponse.json(
      { status: "not-ready", checks, timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
