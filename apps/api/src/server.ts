import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { authRoutes } from "./routes/auth";
import { accountRoutes } from "./routes/account";
import { adminRoutes } from "./routes/admin";
import { bookingRoutes } from "./routes/bookings";
import { catalogueRoutes } from "./routes/catalogue";
import { eventRoutes } from "./routes/events";
import { operationRoutes } from "./routes/operations";
import { organiserRoutes } from "./routes/organiser";
import { venueRoutes } from "./routes/venues";
import { Router } from "./router";
import { safeError, structuredLog } from "../../../src/lib/observability";
import { cachedPublicResponse } from "../../../src/lib/http-cache";
import { beginRequest, endRequest } from "../../../src/lib/runtime-metrics";

const router = new Router()
  .addAll(authRoutes)
  .addAll(accountRoutes)
  .addAll(adminRoutes)
  .addAll(organiserRoutes)
  .addAll(eventRoutes)
  .addAll(bookingRoutes)
  .addAll(catalogueRoutes)
  .addAll(venueRoutes)
  .addAll(operationRoutes);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const publicRoot = resolve(repositoryRoot, "public");
const webRoot = resolve(repositoryRoot, "apps/web/dist");
const maxInFlight = positiveInteger(process.env.API_MAX_IN_FLIGHT, 2_000);
const accessLogSampleRate = boundedNumber(process.env.ACCESS_LOG_SAMPLE_RATE, process.env.NODE_ENV === "production" ? 0.01 : 1, 0, 1);
const slowRequestMs = positiveInteger(process.env.ACCESS_LOG_SLOW_MS, 1_000);
const staticCacheMaxEntries = positiveInteger(process.env.STATIC_CACHE_MAX_ENTRIES, 128);
const staticCacheMaxFileBytes = positiveInteger(process.env.STATIC_CACHE_MAX_FILE_BYTES, 5_000_000);
const staticFiles = new Map<string, { body: Buffer; etag: string }>();

const server = createServer(async (incoming, outgoing) => {
  const startedAt = Date.now();
  const requestId = firstHeader(incoming, "x-request-id") ?? randomUUID();
  if (!beginRequest(maxInFlight)) {
    outgoing.statusCode = 503;
    outgoing.setHeader("Content-Type", "application/json; charset=utf-8");
    outgoing.setHeader("Retry-After", "1");
    outgoing.setHeader("X-Request-ID", requestId);
    outgoing.setHeader("X-Content-Type-Options", "nosniff");
    outgoing.setHeader("Cache-Control", "no-store");
    outgoing.end(JSON.stringify({ error: "Server is busy. Retry shortly." }));
    return;
  }
  try {
    const request = await toWebRequest(incoming, outgoing, requestId);
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      outgoing.statusCode = 204;
      applyCommonHeaders(outgoing, request, requestId);
      outgoing.end();
      return;
    }

    if (!url.pathname.startsWith("/api/")) {
      const served = await serveStatic(url.pathname, outgoing, request, requestId);
      if (served) return;
    }

    const cacheable = isCacheablePublicRead(request, url);
    const resolution = cacheable
      ? await cachedPublicResponse(request, `${url.pathname}${url.search}`, () => router.handle(request))
      : { response: await router.handle(request), source: "BYPASS" as const };
    const response = resolution.response;
    response.headers.set("X-Cache", resolution.source);
    await sendResponse(outgoing, request, response, requestId);
  } catch (error) {
    structuredLog("error", "http.request.failed", { requestId, ...safeError(error) });
    if (!outgoing.headersSent) {
      outgoing.statusCode = 500;
      outgoing.setHeader("Content-Type", "application/json; charset=utf-8");
      outgoing.setHeader("X-Request-ID", requestId);
    }
    outgoing.end(JSON.stringify({ error: "Internal server error" }));
  } finally {
    endRequest();
    const durationMs = Date.now() - startedAt;
    if (outgoing.statusCode >= 500 || durationMs >= slowRequestMs || Math.random() < accessLogSampleRate) {
      structuredLog(outgoing.statusCode >= 500 ? "error" : durationMs >= slowRequestMs ? "warn" : "info", "http.request", {
        requestId,
        method: incoming.method,
        path: incoming.url,
        status: outgoing.statusCode,
        durationMs,
      });
    }
  }
});

server.keepAliveTimeout = positiveInteger(process.env.API_KEEP_ALIVE_TIMEOUT_MS, 5_000);
server.headersTimeout = positiveInteger(process.env.API_HEADERS_TIMEOUT_MS, 10_000);
server.requestTimeout = positiveInteger(process.env.API_REQUEST_TIMEOUT_MS, 30_000);
server.maxRequestsPerSocket = positiveInteger(process.env.API_MAX_REQUESTS_PER_SOCKET, 1_000);
server.maxConnections = positiveInteger(process.env.API_MAX_CONNECTIONS, 20_000);

server.listen(port, host, () => {
  structuredLog("info", "api.started", { host, port, webBuildAvailable: existsSync(resolve(webRoot, "index.html")) });
});

async function toWebRequest(incoming: IncomingMessage, outgoing: ServerResponse, requestId: string) {
  const protocol = firstHeader(incoming, "x-forwarded-proto") ?? "http";
  const hostHeader = firstHeader(incoming, "host") ?? `${host}:${port}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  headers.set("x-request-id", requestId);
  const body = incoming.method === "GET" || incoming.method === "HEAD" ? undefined : await readBody(incoming);
  const controller = new AbortController();
  outgoing.on("close", () => {
    if (!outgoing.writableEnded) controller.abort();
  });
  return new Request(`${protocol}://${hostHeader}${incoming.url ?? "/"}`, {
    method: incoming.method ?? "GET",
    headers,
    body,
    signal: controller.signal,
  });
}

async function readBody(incoming: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function sendResponse(outgoing: ServerResponse, request: Request, response: Response, requestId: string) {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => outgoing.setHeader(name, value));
  applyCommonHeaders(outgoing, request, requestId);
  if (!response.body || request.method === "HEAD") {
    outgoing.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!outgoing.write(value)) await new Promise<void>((resolveDrain) => outgoing.once("drain", resolveDrain));
    }
  } finally {
    outgoing.end();
  }
}

function applyCommonHeaders(outgoing: ServerResponse, request: Request, requestId: string) {
  outgoing.setHeader("X-Request-ID", requestId);
  outgoing.setHeader("X-Content-Type-Options", "nosniff");
  outgoing.setHeader("X-Frame-Options", "DENY");
  outgoing.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  outgoing.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  outgoing.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  outgoing.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https: wss:"
  );
  if (process.env.NODE_ENV === "production") {
    outgoing.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  if (origin && allowedOrigins().has(origin)) {
    outgoing.setHeader("Access-Control-Allow-Origin", origin);
    outgoing.setHeader("Access-Control-Allow-Credentials", "true");
    outgoing.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID");
    outgoing.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    outgoing.setHeader("Vary", "Origin");
  }
}

function allowedOrigins() {
  return new Set([
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    process.env.WEB_URL,
    process.env.APP_URL,
    ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
  ].filter(Boolean).map((value) => value!.trim().replace(/\/$/, "")));
}

async function serveStatic(pathname: string, outgoing: ServerResponse, request: Request, requestId: string) {
  const imagePath = pathname.startsWith("/images/") ? safePath(publicRoot, pathname) : null;
  if (imagePath && await isFile(imagePath)) return sendFile(imagePath, outgoing, request, requestId);

  const requested = pathname === "/" ? resolve(webRoot, "index.html") : safePath(webRoot, pathname);
  if (requested && await isFile(requested)) return sendFile(requested, outgoing, request, requestId);

  const indexPath = resolve(webRoot, "index.html");
  if (await isFile(indexPath)) return sendFile(indexPath, outgoing, request, requestId);
  return false;
}

async function sendFile(path: string, outgoing: ServerResponse, request: Request, requestId: string) {
  const file = await loadStaticFile(path);
  outgoing.statusCode = 200;
  outgoing.setHeader("Content-Type", contentType(path));
  outgoing.setHeader("ETag", file.etag);
  outgoing.setHeader("Cache-Control", staticCacheControl(path));
  applyCommonHeaders(outgoing, request, requestId);
  if (request.headers.get("if-none-match") === file.etag) {
    outgoing.statusCode = 304;
    outgoing.end();
    return true;
  }
  outgoing.setHeader("Content-Length", file.body.byteLength);
  outgoing.end(request.method === "HEAD" ? undefined : file.body);
  return true;
}

async function loadStaticFile(path: string) {
  const cached = staticFiles.get(path);
  if (cached) {
    staticFiles.delete(path);
    staticFiles.set(path, cached);
    return cached;
  }
  const body = await readFile(path);
  const file = { body, etag: `"${createHash("sha256").update(body).digest("base64url").slice(0, 22)}"` };
  if (process.env.NODE_ENV === "production" && body.byteLength <= staticCacheMaxFileBytes) {
    staticFiles.set(path, file);
    while (staticFiles.size > staticCacheMaxEntries) {
      const oldest = staticFiles.keys().next().value as string | undefined;
      if (!oldest) break;
      staticFiles.delete(oldest);
    }
  }
  return file;
}

function staticCacheControl(path: string) {
  if (path.endsWith("index.html")) return "no-cache";
  if (`${sep}${path}${sep}`.includes(`${sep}assets${sep}`)) return "public, max-age=31536000, immutable";
  return "public, max-age=86400, stale-while-revalidate=604800";
}

function safePath(root: string, pathname: string) {
  const target = resolve(root, `.${pathname}`);
  return target === root || target.startsWith(`${root}${sep}`) ? target : null;
}

async function isFile(path: string) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

function firstHeader(request: IncomingMessage, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function contentType(path: string) {
  const types: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function isCacheablePublicRead(request: Request, url: URL) {
  if (request.method !== "GET" || request.headers.has("authorization")) return false;
  return url.pathname === "/api/events"
    || url.pathname === "/api/discovery/options"
    || url.pathname === "/api/recommendations"
    || url.pathname === "/api/venues";
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
