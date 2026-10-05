import nodemailer from "nodemailer";
import { db } from "./db";
import { renderNotificationEmail, type NotificationKind } from "./email-templates";
import { bookingQrDataUrl } from "./qr";

export type EmailDeliveryResult = {
  delivered: boolean;
  mode: "smtp" | "preview";
  message: string;
  previewId?: string;
};

async function getTransport() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: SMTP_SECURE === "true" || port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendBrandedEmail(options: {
  kind: NotificationKind;
  to: string;
  relatedEntityId?: string;
  name?: string;
  eventTitle?: string;
  bookingRef?: string;
  seats?: string[];
  category?: string;
  actionUrl?: string;
  expiresAt?: Date;
  showtime?: string;
  qrBookingRef?: string;
}) {
  const template = renderNotificationEmail(options);
  const preview = await db.emailPreview.create({
    data: {
      kind: template.kind,
      recipient: options.to,
      subject: template.subject,
      textBody: template.text,
      htmlBody: template.html,
      relatedEntityId: options.relatedEntityId,
    },
  });
  const transport = await getTransport();
  if (!transport) {
    console.log("[email:preview]", { id: preview.id, kind: template.kind, to: options.to, subject: template.subject });
    return { delivered: false, mode: "preview", previewId: preview.id, message: "Local email preview created" } satisfies EmailDeliveryResult;
  }

  try {
    const attachments = options.qrBookingRef
      ? [{ filename: "ticket.png", content: (await bookingQrDataUrl(options.qrBookingRef)).split(",")[1], encoding: "base64" as const }]
      : undefined;
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? "tickets@example.com",
      to: options.to,
      subject: template.subject,
      text: template.text,
      html: template.html,
      attachments,
    });
    return { delivered: true, mode: "smtp", previewId: preview.id, message: "Email delivered" } satisfies EmailDeliveryResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    console.error("[email:error] Delivery failed", { kind: options.kind, to: options.to, message });
    return { delivered: false, mode: "smtp", previewId: preview.id, message } satisfies EmailDeliveryResult;
  }
}

export async function sendTicketEmail(opts: { to: string; name: string; eventTitle: string; bookingRef: string; seats: string[]; relatedEntityId?: string }) {
  return sendBrandedEmail({ kind: "BOOKING_CONFIRMATION", ...opts, qrBookingRef: opts.bookingRef });
}

export async function sendBookingCancellationEmail(opts: { to: string; name: string; eventTitle: string; bookingRef: string; seats: string[]; relatedEntityId?: string }) {
  return sendBrandedEmail({ kind: "BOOKING_CANCELLATION", ...opts });
}

export async function sendBookingReminderEmail(opts: { to: string; name: string; eventTitle: string; bookingRef: string; seats: string[]; showtime: string; relatedEntityId?: string }) {
  return sendBrandedEmail({ kind: "BOOKING_REMINDER", ...opts });
}

export async function sendWaitlistJoinedEmail(opts: { to: string; name: string; eventTitle: string; category: string; relatedEntityId?: string }) {
  return sendBrandedEmail({ kind: "WAITLIST_JOINED", ...opts });
}

export async function sendWaitlistOfferEmail(opts: { to: string; name: string; eventTitle: string; category: string; offerUrl: string; expiresAt: Date; relatedEntityId?: string }) {
  return sendBrandedEmail({ kind: "WAITLIST_OFFER", ...opts, actionUrl: opts.offerUrl });
}

export async function sendWaitlistOfferExpiredEmail(opts: { to: string; name: string; eventTitle: string; category: string; relatedEntityId?: string }) {
  return sendBrandedEmail({ kind: "WAITLIST_OFFER_EXPIRED", ...opts });
}

export async function sendEmailVerificationEmail(opts: { to: string; name: string; verificationUrl: string; relatedEntityId?: string }) {
  return sendBrandedEmail({ kind: "EMAIL_VERIFICATION", ...opts, actionUrl: opts.verificationUrl });
}

export async function sendAlertSubscriptionEmail(email: string) {
  const result = await sendBrandedEmail({ kind: "ALERT_SUBSCRIPTION", to: email, relatedEntityId: email });
  return {
    ...result,
    message: result.delivered
      ? "Email alerts enabled. A confirmation email was sent."
      : result.mode === "preview"
        ? "Email alert saved. Open its local preview in the administrator job monitor."
        : "Email alert saved, but confirmation delivery failed. It is available for retry.",
  };
}

export async function verifyEmailTransport() {
  const transport = await getTransport();
  if (!transport) return { configured: false, verified: false, mode: "preview" as const, message: "SMTP is not configured; local preview mode is active" };
  try {
    await transport.verify();
    return { configured: true, verified: true, mode: "smtp" as const, message: "SMTP connection verified" };
  } catch (error) {
    console.error("[email:error] SMTP verification failed", error);
    return { configured: true, verified: false, mode: "smtp" as const, message: error instanceof Error ? error.message : "SMTP connection could not be verified" };
  }
}
