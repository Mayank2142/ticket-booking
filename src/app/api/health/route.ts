import { ok } from "@/lib/api";
export const dynamic = "force-dynamic";

export async function GET() {
  return ok({
    status: "ok",
    service: "cinebook-api",
    version: process.env.BUILD_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? "development",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
