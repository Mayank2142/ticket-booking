import http from "node:http";
import https from "node:https";
import { performance } from "node:perf_hooks";

const baseUrl = new URL(process.env.LOAD_TEST_URL ?? "http://127.0.0.1:3000");
const users = positiveInteger("LOAD_TEST_USERS", 10_000);
const sockets = positiveInteger("LOAD_TEST_SOCKETS", Math.min(2_000, users));
const timeoutMs = positiveInteger("LOAD_TEST_TIMEOUT_MS", 15_000);
const maxP95Ms = positiveInteger("LOAD_TEST_MAX_P95_MS", 5_000);
const maxErrorRate = numberSetting("LOAD_TEST_MAX_ERROR_RATE", 0.01);
const paths = [
  "/",
  "/api/events?pageSize=12&upcoming=true",
  "/api/events?pageSize=12&sort=trending&upcoming=true",
  "/api/health",
];
const client = baseUrl.protocol === "https:" ? https : http;
const agent = new client.Agent({ keepAlive: true, maxSockets: sockets, maxFreeSockets: Math.min(sockets, 256), scheduling: "fifo" });

await Promise.all(Array.from({ length: Math.min(30, sockets) }, (_, index) => request(paths[index % paths.length])));

const startedAt = performance.now();
const results = await Promise.all(Array.from({ length: users }, (_, index) => request(paths[index % paths.length])));
const elapsedMs = performance.now() - startedAt;
agent.destroy();

const latencies = results.map((result) => result.latencyMs).sort((left, right) => left - right);
const statuses = results.reduce((totals, result) => {
  const key = result.error ? "network-error" : String(result.status);
  totals[key] = (totals[key] ?? 0) + 1;
  return totals;
}, {});
const failures = results.filter((result) => result.error || result.status < 200 || result.status >= 400).length;
const errorRate = failures / users;
const report = {
  target: baseUrl.origin,
  users,
  socketConcurrency: sockets,
  elapsedMs: rounded(elapsedMs),
  requestsPerSecond: rounded(users / (elapsedMs / 1_000)),
  latencyMs: {
    min: percentile(latencies, 0),
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    max: percentile(latencies, 1),
  },
  statuses,
  errorRate: rounded(errorRate),
  thresholds: { maxP95Ms, maxErrorRate },
};

console.log(JSON.stringify(report, null, 2));
if (report.latencyMs.p95 > maxP95Ms || errorRate > maxErrorRate) process.exitCode = 1;

function request(path) {
  const started = performance.now();
  return new Promise((resolve) => {
    const request = client.request(new URL(path, baseUrl), {
      agent,
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "cinebook-local-load-test/1.0" },
      timeout: timeoutMs,
    }, (response) => {
      response.resume();
      response.once("end", () => resolve({ status: response.statusCode ?? 0, latencyMs: performance.now() - started }));
    });
    request.once("timeout", () => request.destroy(new Error(`Timed out after ${timeoutMs}ms`)));
    request.once("error", (error) => resolve({ status: 0, latencyMs: performance.now() - started, error: error.message }));
    request.end();
  });
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  return rounded(values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] ?? values[0]);
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function positiveInteger(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function numberSetting(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}
