import { createHash } from "node:crypto";

type CachedResponse = {
  body: Uint8Array;
  cacheable: boolean;
  etag: string;
  expiresAt: number;
  headers: [string, string][];
  status: number;
};

type CacheResolution = { response: Response; source: "BYPASS" | "HIT" | "MISS" };

const entries = new Map<string, CachedResponse>();
const pending = new Map<string, Promise<CachedResponse>>();
let hits = 0;
let misses = 0;
let bypasses = 0;

export async function cachedPublicResponse(
  request: Request,
  key: string,
  producer: () => Promise<Response>,
  ttlMs = Number(process.env.PUBLIC_CACHE_TTL_MS ?? 5_000),
  maxEntries = Number(process.env.PUBLIC_CACHE_MAX_ENTRIES ?? 250)
): Promise<CacheResolution> {
  if (ttlMs <= 0 || request.method !== "GET" || request.headers.has("authorization")) {
    bypasses += 1;
    return { response: await producer(), source: "BYPASS" };
  }

  const now = Date.now();
  const existing = entries.get(key);
  if (existing && existing.expiresAt > now) {
    hits += 1;
    entries.delete(key);
    entries.set(key, existing);
    return { response: materialize(existing, request), source: "HIT" };
  }
  if (existing) entries.delete(key);

  let work = pending.get(key);
  let source: CacheResolution["source"] = "HIT";
  if (!work) {
    source = "MISS";
    misses += 1;
    work = capture(producer, ttlMs);
    pending.set(key, work);
  } else {
    hits += 1;
  }

  try {
    const captured = await work;
    if (!captured.cacheable) {
      bypasses += 1;
      return { response: materialize(captured, request), source: "BYPASS" };
    }
    entries.set(key, captured);
    trim(maxEntries);
    return { response: materialize(captured, request), source };
  } finally {
    if (source === "MISS") pending.delete(key);
  }
}

export function publicCacheStats() {
  return { entries: entries.size, pending: pending.size, hits, misses, bypasses };
}

export function clearPublicCache() {
  entries.clear();
  pending.clear();
  hits = 0;
  misses = 0;
  bypasses = 0;
}

async function capture(producer: () => Promise<Response>, ttlMs: number) {
  const response = await producer();
  const body = new Uint8Array(await response.arrayBuffer());
  const headers = [...response.headers.entries()].filter(([name]) => name.toLowerCase() !== "content-length");
  const cacheable = response.status === 200 && !response.headers.has("set-cookie");
  return {
    body,
    cacheable,
    etag: cacheable ? `"${createHash("sha256").update(body).digest("base64url").slice(0, 22)}"` : "",
    expiresAt: cacheable ? Date.now() + ttlMs : 0,
    headers,
    status: response.status,
  } satisfies CachedResponse;
}

function materialize(cached: CachedResponse, request: Request) {
  const headers = new Headers(cached.headers);
  if (cached.cacheable) {
    headers.set("ETag", cached.etag);
    headers.set("Cache-Control", "public, max-age=2, stale-while-revalidate=5");
  }
  if (cached.cacheable && request.headers.get("if-none-match") === cached.etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(cached.body.slice(), { status: cached.status, headers });
}

function trim(maxEntries: number) {
  while (entries.size > Math.max(1, maxEntries)) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    entries.delete(oldest);
  }
}
