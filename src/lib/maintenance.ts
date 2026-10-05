import { retryPendingEmails } from "./delivery";
import { expireStaleOffers, releaseExpiredHolds } from "./seats";
import { db } from "./db";

export async function runMaintenanceCycle() {
  const startedAt = new Date();
  const run = await db.maintenanceRun.create({ data: { status: "RUNNING" } });
  try {
    const expiredOffers = await expireStaleOffers();
    const releasedHolds = await releaseExpiredHolds();
    const email = await retryPendingEmails();
    const completedAt = new Date();
    const result = {
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      expiredOffers,
      releasedHolds,
      email,
    };
    await db.maintenanceRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", resultJson: JSON.stringify(result), completedAt } });
    return { id: run.id, status: "SUCCEEDED", ...result };
  } catch (error) {
    await db.maintenanceRun.update({ where: { id: run.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : String(error), completedAt: new Date() } });
    throw error;
  }
}
