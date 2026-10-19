import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  checkRateLimit,
  rateLimitResponse,
  resetLocalRateLimitsForTests,
} from "../src/lib/rate-limit";
import { eventRoutes, parseEventListQuery } from "../apps/api/src/routes/events";
import { authRoutes } from "../apps/api/src/routes/auth";
import { firebasePublicConfig } from "../src/lib/firebase-auth";
import { assertProductionSecurity, crossSiteRequestError, MAX_REQUEST_BODY_BYTES, safeRequestPath } from "../src/lib/http-security";
import { sessionCookie } from "../src/lib/auth";
import { validatePassword } from "../src/lib/validation";
import { safeCsvCell } from "../src/lib/csv";
import { Router } from "../apps/api/src/router";

test("web HTML does not add a second CSP that blocks configured Firebase scripts and frames", async () => {
  const html = await readFile(new URL("../apps/web/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["']/i);
});

test("Firebase configuration does not expose server credentials and missing tokens cannot authenticate", async () => {
  const config = firebasePublicConfig();
  if (config) assert.deepEqual(Object.keys(config).sort(), ["apiKey", "appId", "authDomain", "projectId"]);
  const route = authRoutes.find((item) => item.path === "/api/auth/firebase");
  assert.ok(route);
  for (const body of [{ role: "ADMIN" }, { idToken: "", role: "ADMIN" }, { idToken: "x".repeat(17000) }]) {
    const url = new URL("http://localhost/api/auth/firebase");
    const result = await route.handler(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), {}, url);
    assert.equal(result.status, 400);
    assert.equal("token" in await result.json(), false);
  }
});

test.beforeEach(() => {
  resetLocalRateLimitsForTests();
});

test("browser cookies are HttpOnly, host-only and Secure in production", () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const cookie = sessionCookie("session-value");
    assert.match(cookie, /^__Host-cinebook_session=/);
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /; Secure/);
    assert.doesNotMatch(cookie, /Domain=/i);
    assert.match(sessionCookie("", true), /Max-Age=0/);
  } finally { process.env.NODE_ENV = previous; }
});

test("unsafe cross-origin requests and cookie requests without the CSRF header are blocked before handlers run", async () => {
  let called = false;
  const router = new Router().add("POST", "/api/test", () => { called = true; return Response.json({ ok: true }); });
  for (const headers of [{ origin: "https://attacker.example" }, { "sec-fetch-site": "cross-site" }, { cookie: "cinebook_session=secret" }] as Array<Record<string, string>>) {
    const response = await router.handle(new Request("https://cinebook.example/api/test", { method: "POST", headers }));
    assert.equal(response.status, 403); assert.equal(called, false);
  }
  const trusted = new Request("https://cinebook.example/api/test", { method: "POST", headers: { origin: "https://cinebook.example", cookie: "cinebook_session=secret", "x-cinebook-session": "cookie" } });
  assert.equal(crossSiteRequestError(trusted), null);
  assert.equal((await router.handle(trusted)).status, 200);
});

test("production refuses default or short signing and maintenance secrets", () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET, CRON_SECRET: process.env.CRON_SECRET };
  try {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "dev-secret";
    assert.throws(assertProductionSecurity, /JWT_SECRET/);
    process.env.JWT_SECRET = "random-jwt-value-with-more-than-32-bytes";
    process.env.CRON_SECRET = "short";
    assert.throws(assertProductionSecurity, /CRON_SECRET/);
    process.env.CRON_SECRET = "random-cron-value-with-more-than-32-bytes";
    assert.doesNotThrow(assertProductionSecurity);
  } finally { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
});

test("password validation prevents bcrypt's silent 72-byte truncation, including Unicode", () => {
  assert.equal(validatePassword("a1" + "b".repeat(70)).length, 72);
  assert.throws(() => validatePassword("a1" + "b".repeat(71)), /72 UTF-8 bytes/);
  assert.throws(() => validatePassword("a1" + "界".repeat(24)), /72 UTF-8 bytes/);
});

test("access-log paths remove verification tokens, offer tokens and cron query credentials", () => {
  assert.equal(safeRequestPath("/verify-email?token=private-value"), "/verify-email");
  assert.equal(safeRequestPath("/api/cron/release-holds?secret=private-value"), "/api/cron/release-holds");
  assert.equal(MAX_REQUEST_BODY_BYTES, 65536);
});

test("spreadsheet exports neutralise formulas while escaping quotes and preserving ordinary data", () => {
  for (const value of ["=HYPERLINK(\"https://attacker.example\")", "+SUM(1,2)", "@SUM(A1)", "-1+2", "  =1+1", "\t=1+1", "\rpayload"]) assert.ok(safeCsvCell(value).startsWith("\"'"));
  assert.equal(safeCsvCell('Customer "Name"'), '"Customer ""Name"""');
  assert.equal(safeCsvCell(250), '"250"');
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
    "groupMovies=yes",
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
