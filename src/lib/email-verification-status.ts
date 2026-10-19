import type { EmailVerificationDeliveryDto } from "@cinebook/shared";
import { db } from "./db";
import { JOB_TYPES } from "./jobs";

/** Report only the signed-in customer's current verification request, never its token or raw transport error. */
export async function emailVerificationDelivery(userId: string, tokenHash?: string | null): Promise<EmailVerificationDeliveryDto> {
  const job = tokenHash ? await db.backgroundJob.findUnique({
    where: { dedupeKey: `${JOB_TYPES.EMAIL_VERIFICATION}:${userId}:${tokenHash.slice(0, 12)}` },
    select: { status: true, resultJson: true },
  }) : null;
  if (!job) return { state: "not_requested", message: "Your saved email has not been verified. Request a link, then open it in your inbox." };
  if (job.status === "PENDING" || job.status === "RUNNING") return { state: "queued", message: "Verification email queued. Delivery is not confirmed yet. Check your inbox and spam folder, then check status here." };
  if (job.status === "RETRY") return { state: "retrying", message: "Verification email could not be sent. The service will retry. Your address remains unverified; contact support or use Google with the same email below." };
  if (job.status === "FAILED") return { state: "failed", message: "Verification email could not be sent. Contact support or verify with Google using the same email below. Booking emails also need a working delivery service." };
  let result: { mode?: string; delivered?: boolean } = {};
  try { result = JSON.parse(job.resultJson) ?? {}; } catch { /* No private job details are exposed. */ }
  if (result.mode === "preview") return { state: "preview", message: "No email was sent: only a local preview was created. Email delivery must be configured, or use Google with the same email below." };
  if (job.status === "SUCCEEDED" && result.delivered === true) return { state: "accepted", message: "The email service accepted your verification email. Check your inbox and spam folder; open the link, then check status here." };
  return { state: "failed", message: "Verification email delivery could not be confirmed. Request a new link or contact support." };
}
