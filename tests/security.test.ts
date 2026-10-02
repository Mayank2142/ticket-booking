import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  checkRateLimit,
  rateLimitResponse,
  resetLocalRateLimitsForTests,
} from "../src/lib/rate-limit";

test.beforeEach(() => {
  resetLocalRateLimitsForTests();
});

test("rate limiter rejects requests after the configured allowance", async () => {
  const request = new NextRequest("http://localhost/api/auth/login", {
    headers: { "x-forwarded-for": "203.0.113.10" },
  });
  const policy = { scope: "security-test", limit: 2, windowMs: 60_000 };

  const first = await checkRateLimit(request, policy);
  const second = await checkRateLimit(request, policy);
  const third = await checkRateLimit(request, policy);

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
  assert.equal(third.source, "memory");
});

test("rate-limit buckets are isolated by scope and identity", async () => {
  const request = new NextRequest("http://localhost/api/events");
  const policy = { scope: "hold", limit: 1, windowMs: 60_000 };

  assert.equal((await checkRateLimit(request, policy, "customer-a")).allowed, true);
  assert.equal((await checkRateLimit(request, policy, "customer-a")).allowed, false);
  assert.equal((await checkRateLimit(request, policy, "customer-b")).allowed, true);
  assert.equal((await checkRateLimit(request, { ...policy, scope: "booking" }, "customer-a")).allowed, true);
});

test("rate-limit response exposes retry metadata without leaking identity", async () => {
  const request = new NextRequest("http://localhost/api/events");
  const policy = { scope: "response", limit: 1, windowMs: 30_000 };
  await checkRateLimit(request, policy, "private-user-id");
  const blocked = await checkRateLimit(request, policy, "private-user-id");
  const response = rateLimitResponse(blocked);
  const body = await response.json();

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("ratelimit-limit"), "1");
  assert.equal(response.headers.get("ratelimit-remaining"), "0");
  assert.ok(Number(response.headers.get("retry-after")) >= 1);
  assert.deepEqual(body, { error: "Too many requests. Please try again shortly." });
  assert.doesNotMatch(JSON.stringify(body), /private-user-id/);
});
