import assert from "node:assert/strict";
import test from "node:test";
import { renderNotificationEmail, type NotificationKind } from "../src/lib/email-templates";
import { sendAlertSubscriptionEmail } from "../src/lib/email";
import { db } from "../src/lib/db";
import { claimDueJobs, enqueueBackgroundJob, JOB_TYPES, recoverAllRunningJobs, retryDelayMs } from "../src/lib/jobs";

test("background retry delay grows exponentially and respects its ceiling", () => {
  const previousBase = process.env.JOB_RETRY_BASE_MS;
  const previousMax = process.env.JOB_RETRY_MAX_MS;
  process.env.JOB_RETRY_BASE_MS = "1000";
  process.env.JOB_RETRY_MAX_MS = "5000";
  assert.equal(retryDelayMs(1), 1000);
  assert.equal(retryDelayMs(2), 2000);
  assert.equal(retryDelayMs(3), 4000);
  assert.equal(retryDelayMs(4), 5000);
  process.env.JOB_RETRY_BASE_MS = previousBase;
  process.env.JOB_RETRY_MAX_MS = previousMax;
});

test("every notification has branded HTML and plain-text output", () => {
  const kinds: NotificationKind[] = ["EMAIL_VERIFICATION", "BOOKING_CONFIRMATION", "BOOKING_CANCELLATION", "WAITLIST_JOINED", "WAITLIST_OFFER", "WAITLIST_OFFER_EXPIRED", "BOOKING_REMINDER", "ALERT_SUBSCRIPTION"];
  for (const kind of kinds) {
    const result = renderNotificationEmail({ kind, name: "Test Customer", eventTitle: "Test Event", bookingRef: "BK-TEST", seats: ["A1"], category: "General", actionUrl: "http://localhost:5173/test", expiresAt: new Date("2099-01-01T10:00:00.000Z"), showtime: "2099-01-01 18:00" });
    assert.match(result.html, /CineBook/);
    assert.match(result.html, /<!doctype html>/);
    assert.ok(result.text.length > 30);
    assert.ok(result.subject.length > 5);
  }
});

test("local preview mode stores notification content without SMTP", async () => {
  const result = await sendAlertSubscriptionEmail("preview-test@example.com");
  assert.equal(result.mode, "preview");
  assert.ok(result.previewId);
  const preview = await db.emailPreview.findUnique({ where: { id: result.previewId } });
  assert.equal(preview?.recipient, "preview-test@example.com");
  assert.match(preview?.htmlBody ?? "", /CineBook/);
});

test("a running durable job is recovered after a worker restart", async () => {
  const key = `test-recovery-${Date.now()}`;
  const job = await enqueueBackgroundJob({ type: JOB_TYPES.MAINTENANCE, dedupeKey: key });
  const claimed = await claimDueJobs(100);
  assert.ok(claimed.some((item) => item.id === job.id));
  await recoverAllRunningJobs();
  const recovered = await db.backgroundJob.findUnique({ where: { id: job.id } });
  assert.equal(recovered?.status, "RETRY");
  assert.match(recovered?.lastError ?? "", /worker restarted/);
});
