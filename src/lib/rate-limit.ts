import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "./realtime";

export type RateLimitPolicy = {
  scope: string;
  limit: number;
  windowMs: number;
};

type LocalBucket = { count: number; resetAt: number };
const globalLimits = globalThis as typeof globalThis & { cinebookRateLimits?: Map<string, LocalBucket> };
const localLimits = globalLimits.cinebookRateLimits ?? new Map<string, LocalBucket>();
globalLimits.cinebookRateLimits = localLimits;

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  source: "redis" | "memory";
};

function clientAddress(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

function identifierHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function cleanupLocalBuckets(now: number) {
  if (localLimits.size < 2_000) return;
  for (const [key, bucket] of Array.from(localLimits.entries())) {
    if (bucket.resetAt <= now) localLimits.delete(key);
  }
  while (localLimits.size > 10_000) {
    const oldest = localLimits.keys().next().value as string | undefined;
    if (!oldest) break;
    localLimits.delete(oldest);
  }
}

function localDecision(key: string, policy: RateLimitPolicy, now: number): RateLimitDecision {
  cleanupLocalBuckets(now);
  const existing = localLimits.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + policy.windowMs }
    : existing;
  bucket.count += 1;
  localLimits.set(key, bucket);
  return {
    allowed: bucket.count <= policy.limit,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - bucket.count),
    resetAt: bucket.resetAt,
    source: "memory",
  };
}

export async function checkRateLimit(
  req: NextRequest,
  policy: RateLimitPolicy,
  identity?: string
): Promise<RateLimitDecision> {
  const now = Date.now();
  const rawIdentity = identity || clientAddress(req);
  const key = `cinebook:ratelimit:${policy.scope}:${identifierHash(rawIdentity)}`;

  try {
    const redis = await getRedisClient();
    if (redis?.isReady) {
      const result = await redis.sendCommand([
        "EVAL",
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('PTTL',KEYS[1])}",
        "1",
        key,
        String(policy.windowMs),
      ]) as unknown as [number, number];
      const count = Number(result[0]);
      const ttl = Math.max(0, Number(result[1]));
      return {
        allowed: count <= policy.limit,
        limit: policy.limit,
        remaining: Math.max(0, policy.limit - count),
        resetAt: now + ttl,
        source: "redis",
      };
    }
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      component: "rate-limit",
      event: "redis-fallback",
      message: error instanceof Error ? error.message : String(error),
    }));
  }

  return localDecision(key, policy, now);
}

export function rateLimitHeaders(decision: RateLimitDecision) {
  return {
    "RateLimit-Limit": String(decision.limit),
    "RateLimit-Remaining": String(decision.remaining),
    "RateLimit-Reset": String(Math.ceil(decision.resetAt / 1000)),
  };
}

export function rateLimitResponse(decision: RateLimitDecision) {
  const retryAfter = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: { ...rateLimitHeaders(decision), "Retry-After": String(retryAfter) },
    }
  );
}

export async function enforceRateLimit(
  req: NextRequest,
  policy: RateLimitPolicy,
  identity?: string
) {
  const decision = await checkRateLimit(req, policy, identity);
  return decision.allowed ? null : rateLimitResponse(decision);
}

export function resetLocalRateLimitsForTests() {
  localLimits.clear();
}
