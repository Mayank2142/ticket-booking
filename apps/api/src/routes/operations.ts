import { ok } from "../../../../src/lib/api";
import { db } from "../../../../src/lib/db";
import { runMaintenanceCycle } from "../../../../src/lib/maintenance";
import { safeError, structuredLog } from "../../../../src/lib/observability";
import { getRedisClient } from "../../../../src/lib/realtime";
import { publicCacheStats } from "../../../../src/lib/http-cache";
import { runtimeMetrics } from "../../../../src/lib/runtime-metrics";
import type { RouteDefinition } from "../types";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Readiness check exceeded ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function cronAuthorized(request: Request, url: URL) {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const secret = request.headers.get("x-cron-secret") ?? bearer ?? url.searchParams.get("secret");
  return Boolean(process.env.CRON_SECRET) && secret === process.env.CRON_SECRET;
}

async function runCleanup(request: Request, _params: Record<string, string>, url: URL) {
  if (!cronAuthorized(request, url)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return ok(await runMaintenanceCycle());
}

export const operationRoutes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/api/health",
    handler() {
      return ok({
        status: "ok",
        service: "cinebook-api",
        version: process.env.BUILD_SHA ?? "development",
        uptimeSeconds: Math.round(process.uptime()),
        runtime: runtimeMetrics(),
        publicCache: publicCacheStats(),
        timestamp: new Date().toISOString(),
      });
    },
  },
  {
    method: "GET",
    path: "/api/ready",
    async handler() {
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
          if (!redis?.isReady || (await withTimeout(redis.ping(), 2_000)) !== "PONG") throw new Error("Redis is configured but unavailable");
          checks.redis = "connected";
        }
        if (process.env.READINESS_REQUIRE_SMTP === "true" && checks.smtp !== "configured") throw new Error("SMTP is required but not configured");
        return Response.json({ status: "ready", checks, timestamp: new Date().toISOString() });
      } catch (error) {
        structuredLog("error", "readiness.failed", { checks, ...safeError(error) });
        return Response.json({ status: "not-ready", checks, timestamp: new Date().toISOString() }, { status: 503 });
      }
    },
  },
  { method: "GET", path: "/api/cron/release-holds", handler: runCleanup },
  { method: "POST", path: "/api/cron/release-holds", handler: runCleanup },
];
