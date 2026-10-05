import assert from "node:assert/strict";
import test from "node:test";
import {
  checkRateLimit,
  rateLimitResponse,
  resetLocalRateLimitsForTests,
} from "../src/lib/rate-limit";
import { eventRoutes, parseEventListQuery } from "../apps/api/src/routes/events";

test.beforeEach(() => {
  resetLocalRateLimitsForTests();
});

test("rate limiter rejects requests after the configured allowance", async () => {
  const request = new Request("http://localhost/api/auth/login", {
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
  const request = new Request("http://localhost/api/events");
  const policy = { scope: "hold", limit: 1, windowMs: 60_000 };

  assert.equal((await checkRateLimit(request, policy, "customer-a")).allowed, true);
  assert.equal((await checkRateLimit(request, policy, "customer-a")).allowed, false);
  assert.equal((await checkRateLimit(request, policy, "customer-b")).allowed, true);
  assert.equal((await checkRateLimit(request, { ...policy, scope: "booking" }, "customer-a")).allowed, true);
});

test("rate-limit response exposes retry metadata without leaking identity", async () => {
  const request = new Request("http://localhost/api/events");
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

test("event pagination accepts bounded integers and preserves reproducible query values", () => {
  const query = parseEventListQuery(new URL("http://localhost/api/events?page=3&pageSize=24&sort=price-asc&upcoming=true&date=2030-11-15&city=Mumbai"));
  assert.equal(query.page, 3);
  assert.equal(query.pageSize, 24);
  assert.equal(query.sort, "price-asc");
  assert.equal(query.upcoming, true);
  assert.equal(query.date, "2030-11-15");
  assert.equal(query.city, "Mumbai");
});

test("event listing rejects invalid pagination and filter query values", async () => {
  const route = eventRoutes.find((item) => item.method === "GET" && item.path === "/api/events");
  assert.ok(route);
  const invalidQueries = [
    "page=0",
    "page=1.5",
    "pageSize=49",
    "sort=popular",
    "type=SPORT",
    "date=2030-02-31",
    "upcoming=sometimes",
    `q=${"x".repeat(101)}`,
  ];
  for (const query of invalidQueries) {
    const url = new URL(`http://localhost/api/events?${query}`);
    const response = await route.handler(new Request(url), {}, url);
    assert.equal(response.status, 400, query);
    const body = await response.json() as { error?: string };
    assert.ok(body.error, query);
  }
});
