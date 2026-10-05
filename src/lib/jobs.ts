import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

export const JOB_TYPES = {
  MAINTENANCE: "MAINTENANCE_CYCLE",
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  BOOKING_CONFIRMATION: "BOOKING_CONFIRMATION",
  BOOKING_CANCELLATION: "BOOKING_CANCELLATION",
  WAITLIST_JOINED: "WAITLIST_JOINED",
  WAITLIST_OFFER: "WAITLIST_OFFER",
  WAITLIST_OFFER_EXPIRED: "WAITLIST_OFFER_EXPIRED",
  BOOKING_REMINDER: "BOOKING_REMINDER",
} as const;

export type BackgroundJobType = typeof JOB_TYPES[keyof typeof JOB_TYPES];
export type BackgroundJobStatus = "PENDING" | "RUNNING" | "RETRY" | "SUCCEEDED" | "FAILED";
type JobClient = Pick<Prisma.TransactionClient, "backgroundJob">;

export async function enqueueBackgroundJob(input: {
  type: BackgroundJobType;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  availableAt?: Date;
  maxAttempts?: number;
}, client: JobClient = db) {
  const data = {
    type: input.type,
    payloadJson: JSON.stringify(input.payload ?? {}),
    dedupeKey: input.dedupeKey,
    availableAt: input.availableAt ?? new Date(),
    maxAttempts: input.maxAttempts ?? 5,
  };
  if (!input.dedupeKey) return client.backgroundJob.create({ data });
  return client.backgroundJob.upsert({ where: { dedupeKey: input.dedupeKey }, create: data, update: {} });
}

export function retryDelayMs(attempt: number) {
  const base = Math.max(250, Number(process.env.JOB_RETRY_BASE_MS ?? 5_000));
  const maximum = Math.max(base, Number(process.env.JOB_RETRY_MAX_MS ?? 15 * 60_000));
  return Math.min(maximum, base * (2 ** Math.max(0, attempt - 1)));
}

export async function recoverInterruptedJobs() {
  const staleMs = Math.max(30_000, Number(process.env.JOB_STALE_AFTER_MS ?? 5 * 60_000));
  return db.backgroundJob.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - staleMs) } },
    data: { status: "RETRY", availableAt: new Date(), lastError: "Recovered after worker interruption", startedAt: null },
  });
}

export async function recoverAllRunningJobs() {
  return db.backgroundJob.updateMany({
    where: { status: "RUNNING" },
    data: { status: "RETRY", availableAt: new Date(), lastError: "Recovered when the worker restarted", startedAt: null },
  });
}

export async function claimDueJobs(limit = 20) {
  const now = new Date();
  const candidates = await db.backgroundJob.findMany({
    where: { status: { in: ["PENDING", "RETRY"] }, availableAt: { lte: now }, attempts: { lt: 20 } },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: Math.max(1, Math.min(limit, 100)),
  });
  const claimed = [];
  for (const candidate of candidates) {
    if (candidate.attempts >= candidate.maxAttempts) {
      await db.backgroundJob.update({ where: { id: candidate.id }, data: { status: "FAILED", completedAt: now, lastError: candidate.lastError ?? "Retry limit reached" } });
      continue;
    }
    const result = await db.backgroundJob.updateMany({
      where: { id: candidate.id, status: { in: ["PENDING", "RETRY"] }, availableAt: { lte: now } },
      data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: now, completedAt: null },
    });
    if (result.count === 1) claimed.push({ ...candidate, status: "RUNNING", attempts: candidate.attempts + 1, startedAt: now });
  }
  return claimed;
}

export async function completeBackgroundJob(id: string, result: unknown) {
  return db.backgroundJob.update({
    where: { id },
    data: { status: "SUCCEEDED", resultJson: JSON.stringify(result ?? {}), lastError: null, completedAt: new Date() },
  });
}

export async function failBackgroundJob(job: { id: string; attempts: number; maxAttempts: number }, error: unknown) {
  const lastError = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.maxAttempts;
  return db.backgroundJob.update({
    where: { id: job.id },
    data: exhausted
      ? { status: "FAILED", lastError, completedAt: new Date() }
      : { status: "RETRY", lastError, startedAt: null, availableAt: new Date(Date.now() + retryDelayMs(job.attempts)) },
  });
}

export async function retryBackgroundJob(id: string) {
  return db.backgroundJob.updateMany({
    where: { id, status: { in: ["FAILED", "RETRY"] } },
    data: { status: "RETRY", attempts: 0, availableAt: new Date(), startedAt: null, completedAt: null, lastError: null },
  });
}
