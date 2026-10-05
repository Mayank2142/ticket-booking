import "dotenv/config";
import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import { structuredLog } from "../../../src/lib/observability";

const requestedWorkers = Number(process.env.API_WORKERS ?? Math.min(4, availableParallelism()));
const workerCount = Number.isInteger(requestedWorkers) && requestedWorkers > 0
  ? Math.min(requestedWorkers, Math.max(1, availableParallelism()))
  : 1;

if (cluster.isPrimary) {
  let stopping = false;
  const workerIndexes = new Map<number, number>();
  structuredLog("info", "api.cluster.started", { primaryProcessId: process.pid, workerCount });
  for (let index = 0; index < workerCount; index += 1) forkWorker(index + 1, workerIndexes);

  cluster.on("exit", (worker, code, signal) => {
    structuredLog(stopping ? "info" : "warn", "api.cluster.worker-exited", {
      processId: worker.process.pid,
      code,
      signal,
      stopping,
    });
    const index = workerIndexes.get(worker.id) ?? 1;
    workerIndexes.delete(worker.id);
    if (!stopping) forkWorker(index, workerIndexes);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      stopping = true;
      for (const worker of Object.values(cluster.workers ?? {})) worker?.process.kill(signal);
      setTimeout(() => process.exit(0), 5_000).unref();
    });
  }
} else {
  await import("./server");
}

function forkWorker(index: number, workerIndexes: Map<number, number>) {
  const worker = cluster.fork({ ...process.env, API_WORKER_INDEX: String(index) });
  workerIndexes.set(worker.id, index);
}
