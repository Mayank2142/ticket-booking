import { NextRequest, NextResponse } from "next/server";

function allowedOrigins() {
  return new Set(
    [process.env.WEB_URL, process.env.APP_URL, ...(process.env.ALLOWED_ORIGINS ?? "").split(",")]
      .filter(Boolean)
      .map((value) => value!.trim().replace(/\/$/, ""))
  );
}

function applyCors(req: NextRequest, response: NextResponse) {
  const origin = req.headers.get("origin")?.replace(/\/$/, "");
  if (!origin || !allowedOrigins().has(origin)) return;
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.append("Vary", "Origin");
}

export function proxy(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = req.method === "OPTIONS"
    ? new NextResponse(null, { status: 204 })
    : NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("X-Request-ID", requestId);
  applyCors(req, response);
  console.info(JSON.stringify({
    level: "info",
    event: "http.request",
    requestId,
    method: req.method,
    path: req.nextUrl.pathname,
    at: new Date().toISOString(),
  }));
  return response;
}

export const config = { matcher: ["/api/:path*"] };
