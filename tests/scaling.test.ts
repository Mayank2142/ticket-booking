import assert from "node:assert/strict";
import test from "node:test";
import { cachedPublicResponse, clearPublicCache, publicCacheStats } from "../src/lib/http-cache";
import { beginRequest, endRequest, resetRuntimeMetricsForTests, runtimeMetrics } from "../src/lib/runtime-metrics";

test("public response cache coalesces simultaneous misses and supports conditional reads", async () => {
  clearPublicCache();
  let calls = 0;
  const request = new Request("http://localhost/api/events?pageSize=12");
  const producer = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json({ events: [{ id: "show-1" }] });
  };

  const [first, second] = await Promise.all([
    cachedPublicResponse(request, "/api/events?pageSize=12", producer, 5_000),
    cachedPublicResponse(request, "/api/events?pageSize=12", producer, 5_000),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(new Set([first.source, second.source]), new Set(["MISS", "HIT"]));
  assert.deepEqual(await first.response.json(), { events: [{ id: "show-1" }] });

  const third = await cachedPublicResponse(request, "/api/events?pageSize=12", producer, 5_000);
  assert.equal(third.source, "HIT");
  assert.equal(calls, 1);
  const etag = third.response.headers.get("etag");
  assert.ok(etag);

  const conditional = await cachedPublicResponse(new Request(request, { headers: { "If-None-Match": etag! } }), "/api/events?pageSize=12", producer, 5_000);
  assert.equal(conditional.response.status, 304);
  assert.equal(publicCacheStats().entries, 1);
});

test("authenticated requests bypass the public cache", async () => {
  clearPublicCache();
  let calls = 0;
  const request = new Request("http://localhost/api/events", { headers: { Authorization: "Bearer test" } });
  const result = await cachedPublicResponse(request, "/api/events", async () => {
    calls += 1;
    return Response.json({ private: true });
  });
  assert.equal(result.source, "BYPASS");
  assert.equal(calls, 1);
  assert.equal(publicCacheStats().entries, 0);
});

test("runtime load shedding bounds concurrent work and records rejections", () => {
  resetRuntimeMetricsForTests();
  assert.equal(beginRequest(1), true);
  assert.equal(beginRequest(1), false);
  assert.equal(runtimeMetrics().inFlight, 1);
  assert.equal(runtimeMetrics().rejected, 1);
  endRequest();
  assert.equal(runtimeMetrics().inFlight, 0);
  resetRuntimeMetricsForTests();
});
