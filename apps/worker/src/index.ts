import "dotenv/config";
import { processDueBackgroundJobs } from "../../../src/lib/job-worker";
import { enqueueBackgroundJob, JOB_TYPES, recoverAllRunningJobs } from "../../../src/lib/jobs";

const configuredInterval = Number(process.env.WORKER_INTERVAL_MS ?? 30_000);
const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 5_000
  ? configuredInterval
  : 30_000;

let running = false;
let stopping = false;

function log(level: "info" | "error", event: string, data: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ level, service: "cinebook-worker", event, at: new Date().toISOString(), ...data }));
}

async function tick() {
  if (running || stopping) return;
  running = true;
  try {
    const bucket = Math.floor(Date.now() / intervalMs);
    await enqueueBackgroundJob({ type: JOB_TYPES.MAINTENANCE, dedupeKey: `maintenance:${bucket}`, maxAttempts: 8 });
    const result = await processDueBackgroundJobs(Number(process.env.WORKER_BATCH_SIZE ?? 25));
    log("info", "jobs.completed", result);
  } catch (error) {
    log("error", "maintenance.failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    running = false;
  }
}

const recoveredOnStart = process.env.WORKER_RECOVER_RUNNING_ON_START === "false" ? { count: 0 } : await recoverAllRunningJobs();
log("info", "worker.started", { intervalMs, redisEnabled: Boolean(process.env.REDIS_URL), recoveredJobs: recoveredOnStart.count });
void tick();
const timer = setInterval(() => void tick(), intervalMs);

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  log("info", "worker.stopping", { signal });

  const deadline = Date.now() + 10_000;
  while (running && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  log("info", "worker.stopped", { graceful: !running });
  process.exit(running ? 1 : 0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
