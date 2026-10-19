export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

export class RequestBodyError extends Error {
  readonly status = 413;
  constructor() { super("Request body is too large. Maximum size is 64 KiB."); }
}

export function assertProductionSecurity() {
  if (process.env.NODE_ENV !== "production") return;
  for (const name of ["JWT_SECRET", "CRON_SECRET"] as const) {
    const value = process.env[name] ?? "";
    if (Buffer.byteLength(value) < 32 || /^(dev-secret|change-me-in-production|test-secret)$/.test(value)) {
      throw new Error(`${name} must be a private value of at least 32 bytes in production.`);
    }
  }
}

export function allowedWebOrigins() {
  return new Set([
    ...(process.env.NODE_ENV === "production" ? [] : ["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173", "http://localhost:4173"]),
    process.env.WEB_URL, process.env.APP_URL, ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
  ].filter(Boolean).map((value) => value!.trim().replace(/\/$/, "")));
}

export function crossSiteRequestError(request: Request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) return null;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && !allowedWebOrigins().has(origin)) {
    return Response.json({ error: "This request origin is not allowed." }, { status: 403 });
  }
  if (request.headers.get("sec-fetch-site") === "cross-site" && (!origin || !allowedWebOrigins().has(origin))) {
    return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }
  if (request.headers.has("cookie") && !request.headers.has("authorization") && request.headers.get("x-cinebook-session") !== "cookie") {
    return Response.json({ error: "A protected browser request is required." }, { status: 403 });
  }
  return null;
}

export function safeRequestPath(rawUrl: string | undefined) {
  // Action links and cron credentials must never be copied into access logs.
  try { return new URL(rawUrl ?? "/", "http://localhost").pathname; }
  catch { return "/invalid-url"; }
}
