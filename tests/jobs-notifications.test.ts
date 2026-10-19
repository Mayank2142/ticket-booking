import assert from "node:assert/strict";
import test from "node:test";
import { renderNotificationEmail, type NotificationKind } from "../src/lib/email-templates";
import { sendAlertSubscriptionEmail } from "../src/lib/email";
import { db } from "../src/lib/db";
import { claimDueJobs, enqueueBackgroundJob, JOB_TYPES, recoverAllRunningJobs, retryDelayMs } from "../src/lib/jobs";
import { sendResendMessage } from "../src/lib/resend-email";

test("HTTPS email delivery includes the QR attachment and stable idempotency without exposing secrets", async () => {
  const calls: RequestInit[] = [];
  const http: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    calls.push(init!);
    return Response.json({ id: "email-test" });
  };
  const message = { from: "tickets@verified.example", to: "customer@example.com", subject: "Ticket confirmed", text: "BK-TEST", html: "<p>BK-TEST</p>", attachments: [{ filename: "ticket.png", content: "base64-png" }] };
  await sendResendMessage(message, "test-key", http);
  await sendResendMessage(message, "test-key", http);
  assert.equal(new Headers(calls[0].headers).get("Idempotency-Key"), new Headers(calls[1].headers).get("Idempotency-Key"));
  assert.deepEqual(JSON.parse(String(calls[0].body)).attachments, message.attachments);
  await assert.rejects(sendResendMessage(message, "private-test-key", async () => new Response("secret", { status: 403 })), (error: unknown) => error instanceof Error && /HTTP 403/.test(error.message) && !/private-test-key|secret/.test(error.message));
});

test("booking email includes the actual screening details and authenticated ticket link", () => {
  const result = renderNotificationEmail({ kind: "BOOKING_CONFIRMATION", eventTitle: "Interstellar", bookingRef: "BK-123", seats: ["A1"], showtime: "2030-10-31 17:15", venueName: "Cinema, Bengaluru", totalAmount: 500, actionUrl: "https://example.com/bookings/booking-1" });
  for (const detail of ["Interstellar", "A1", "2030-10-31 17:15", "Cinema, Bengaluru", "₹500", "BK-123"]) assert.ok(result.text.includes(detail));
  assert.ok(result.html.includes("https://example.com/bookings/booking-1"));
});

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
