import { retryPendingEmails } from "./delivery";
import { expireStaleOffers, releaseExpiredHolds } from "./seats";

export async function runMaintenanceCycle() {
  const startedAt = new Date();
  const expiredOffers = await expireStaleOffers();
  const releasedHolds = await releaseExpiredHolds();
  const email = await retryPendingEmails();
  const completedAt = new Date();

  return {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    expiredOffers,
    releasedHolds,
    email,
  };
}
