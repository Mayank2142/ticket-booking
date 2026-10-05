import {
  deliverBookingCancellation,
  deliverBookingReminder,
  deliverBookingTicket,
  deliverEmailVerification,
  deliverWaitlistJoined,
  deliverWaitlistOffer,
  deliverWaitlistOfferExpired,
} from "./delivery";
import {
  claimDueJobs,
  completeBackgroundJob,
  failBackgroundJob,
  JOB_TYPES,
  recoverInterruptedJobs,
  type BackgroundJobType,
} from "./jobs";
import { runMaintenanceCycle } from "./maintenance";

type JobPayload = { id?: string; userId?: string; token?: string };

function parsePayload(payloadJson: string) {
  try {
    return JSON.parse(payloadJson) as JobPayload;
  } catch {
    throw new Error("Job payload is invalid JSON");
  }
}

async function processNotification(resultPromise: Promise<{ delivered: boolean; mode: "smtp" | "preview"; message: string; previewId?: string }>) {
  const result = await resultPromise;
  if (!result.delivered && result.mode === "smtp") throw new Error(result.message);
  return result;
}

async function processJob(type: BackgroundJobType, payload: JobPayload) {
  switch (type) {
    case JOB_TYPES.MAINTENANCE:
      return runMaintenanceCycle();
    case JOB_TYPES.EMAIL_VERIFICATION:
      if (!payload.userId || !payload.token) throw new Error("Email verification job is missing its token");
      return processNotification(deliverEmailVerification(payload.userId, payload.token));
    case JOB_TYPES.BOOKING_CONFIRMATION:
      if (!payload.id) throw new Error("Booking confirmation job is missing its booking id");
      return processNotification(deliverBookingTicket(payload.id));
    case JOB_TYPES.BOOKING_CANCELLATION:
      if (!payload.id) throw new Error("Booking cancellation job is missing its booking id");
      return processNotification(deliverBookingCancellation(payload.id));
    case JOB_TYPES.BOOKING_REMINDER:
      if (!payload.id) throw new Error("Booking reminder job is missing its booking id");
      return processNotification(deliverBookingReminder(payload.id));
    case JOB_TYPES.WAITLIST_JOINED:
      if (!payload.id) throw new Error("Waitlist joined job is missing its entry id");
      return processNotification(deliverWaitlistJoined(payload.id));
    case JOB_TYPES.WAITLIST_OFFER:
      if (!payload.id) throw new Error("Waitlist offer job is missing its entry id");
      return processNotification(deliverWaitlistOffer(payload.id));
    case JOB_TYPES.WAITLIST_OFFER_EXPIRED:
      if (!payload.id) throw new Error("Waitlist expiry job is missing its entry id");
      return processNotification(deliverWaitlistOfferExpired(payload.id));
    default:
      throw new Error(`Unknown background job type: ${type}`);
  }
}

export async function processDueBackgroundJobs(limit = 20) {
  const recovered = await recoverInterruptedJobs();
  const jobs = await claimDueJobs(limit);
  let succeeded = 0;
  let failed = 0;
  let scheduledForRetry = 0;
  for (const job of jobs) {
    try {
      const result = await processJob(job.type as BackgroundJobType, parsePayload(job.payloadJson));
      await completeBackgroundJob(job.id, result);
      succeeded += 1;
    } catch (error) {
      const updated = await failBackgroundJob(job, error);
      if (updated.status === "FAILED") failed += 1;
      else scheduledForRetry += 1;
    }
  }
  return { recovered: recovered.count, claimed: jobs.length, succeeded, failed, scheduledForRetry };
}
