import { NextRequest } from "next/server";
import { err, ok } from "@/lib/api";
import { expireStaleOffers, releaseExpiredHolds } from "@/lib/seats";
import { retryPendingEmails } from "@/lib/delivery";

function checkSecret(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const secret =
    req.headers.get("x-cron-secret") ??
    bearer ??
    new URL(req.url).searchParams.get("secret");
  return secret === process.env.CRON_SECRET;
}

async function runCleanup() {
  const expiredOffers = await expireStaleOffers();
  const releasedHolds = await releaseExpiredHolds();
  const email = await retryPendingEmails();
  return ok({ expiredOffers, releasedHolds, email });
}

export async function GET(req: NextRequest) {
  if (!checkSecret(req)) return err("Forbidden", 403);
  return runCleanup();
}

export async function POST(req: NextRequest) {
  if (!checkSecret(req)) return err("Forbidden", 403);
  return runCleanup();
}
