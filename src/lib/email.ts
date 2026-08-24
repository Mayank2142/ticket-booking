import nodemailer from "nodemailer";
import { bookingQrDataUrl } from "./qr";

export type EmailDeliveryResult = {
  delivered: boolean;
  mode: "smtp" | "console";
  message: string;
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

export async function sendTicketEmail(opts: {
  to: string;
  name: string;
  eventTitle: string;
  bookingRef: string;
  seats: string[];
}) {
  const qr = await bookingQrDataUrl(opts.bookingRef);
  const from = process.env.SMTP_FROM ?? "tickets@example.com";
  const subject = `Ticket confirmed: ${opts.eventTitle}`;
  const text = `Hi ${opts.name},\n\nBooking ${opts.bookingRef} for ${opts.eventTitle}.\nSeats: ${opts.seats.join(", ")}`;

  const transport = await getTransport();
  if (!transport) {
    console.log("[email:preview]", { to: opts.to, subject, bookingRef: opts.bookingRef });
    return { delivered: false, mode: "console", message: "SMTP is not configured; email queued for retry" } satisfies EmailDeliveryResult;
  }

  try {
    await transport.sendMail({
      from,
      to: opts.to,
      subject,
      text,
      attachments: [{ filename: "ticket.png", content: qr.split(",")[1], encoding: "base64" }],
    });
    return { delivered: true, mode: "smtp", message: "Ticket email delivered" } satisfies EmailDeliveryResult;
  } catch (error) {
    console.error("[email:error] Ticket delivery failed", error);
    return { delivered: false, mode: "smtp", message: "Email delivery failed; queued for retry" } satisfies EmailDeliveryResult;
  }
}

export async function sendWaitlistOfferEmail(opts: {
  to: string;
  name: string;
  eventTitle: string;
  category: string;
  offerUrl: string;
  expiresAt: Date;
}) {
  const from = process.env.SMTP_FROM ?? "tickets@example.com";
  const subject = `Seat available: ${opts.eventTitle}`;
  const text = `Hi ${opts.name},\n\nA ${opts.category} seat opened for ${opts.eventTitle}.\nBook before ${opts.expiresAt.toISOString()}:\n${opts.offerUrl}`;

  const transport = await getTransport();
  if (!transport) {
    console.log("[email:preview]", { to: opts.to, subject, offerUrl: opts.offerUrl });
    return { delivered: false, mode: "console", message: "SMTP is not configured; email queued for retry" } satisfies EmailDeliveryResult;
  }

  try {
    await transport.sendMail({ from, to: opts.to, subject, text });
    return { delivered: true, mode: "smtp", message: "Waitlist email delivered" } satisfies EmailDeliveryResult;
  } catch (error) {
    console.error("[email:error] Waitlist delivery failed", error);
    return { delivered: false, mode: "smtp", message: "Email delivery failed; queued for retry" } satisfies EmailDeliveryResult;
  }
}

export async function verifyEmailTransport() {
  const transport = await getTransport();
  if (!transport) return { configured: false, verified: false, message: "SMTP variables are incomplete" };
  try {
    await transport.verify();
    return { configured: true, verified: true, message: "SMTP connection verified" };
  } catch (error) {
    console.error("[email:error] SMTP verification failed", error);
    return { configured: true, verified: false, message: "SMTP connection could not be verified" };
  }
}
