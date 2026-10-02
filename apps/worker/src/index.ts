import "dotenv/config";
import { runMaintenanceCycle } from "../../../src/lib/maintenance";

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
    const result = await runMaintenanceCycle();
    log("info", "maintenance.completed", result);
  } catch (error) {
    log("error", "maintenance.failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    running = false;
  }
}

log("info", "worker.started", { intervalMs, redisEnabled: Boolean(process.env.REDIS_URL) });
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
