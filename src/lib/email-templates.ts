export type NotificationKind =
  | "EMAIL_VERIFICATION"
  | "BOOKING_CONFIRMATION"
  | "BOOKING_CANCELLATION"
  | "WAITLIST_JOINED"
  | "WAITLIST_OFFER"
  | "WAITLIST_OFFER_EXPIRED"
  | "BOOKING_REMINDER"
  | "ALERT_SUBSCRIPTION";

export type EmailTemplate = {
  kind: NotificationKind;
  subject: string;
  text: string;
  html: string;
};

type TemplateInput = {
  kind: NotificationKind;
  name?: string;
  eventTitle?: string;
  bookingRef?: string;
  seats?: string[];
  category?: string;
  actionUrl?: string;
  expiresAt?: Date;
  showtime?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function brandedHtml(title: string, intro: string, lines: string[], action?: { label: string; url: string }) {
  const details = lines.length
    ? `<div style="margin:24px 0;padding:18px;border:1px solid #d8deea;border-radius:14px;background:#f7f9fc">${lines.map((line) => `<p style="margin:6px 0;color:#344054">${escapeHtml(line)}</p>`).join("")}</div>`
    : "";
  const button = action
    ? `<p style="margin:26px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:13px 20px;border-radius:999px;background:#6f5cf6;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(action.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#eef2f8;font-family:Arial,sans-serif;color:#172033"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="padding:28px;border-radius:20px;background:#fff;box-shadow:0 14px 38px rgba(31,42,68,.12)"><p style="margin:0 0 22px;color:#6f5cf6;font-size:20px;font-weight:800">CineBook</p><h1 style="margin:0;font-size:28px;line-height:1.15">${escapeHtml(title)}</h1><p style="margin:16px 0 0;color:#596579;line-height:1.65">${escapeHtml(intro)}</p>${details}${button}<p style="margin:28px 0 0;color:#7b8496;font-size:12px">Fair seats. Live availability. Memorable nights.</p></div></div></body></html>`;
}

function compose(kind: NotificationKind, subject: string, title: string, intro: string, lines: string[], action?: { label: string; url: string }): EmailTemplate {
  const text = [title, "", intro, ...lines.map((line) => `- ${line}`), ...(action ? ["", `${action.label}: ${action.url}`] : [])].join("\n");
  return { kind, subject, text, html: brandedHtml(title, intro, lines, action) };
}

export function renderNotificationEmail(input: TemplateInput): EmailTemplate {
  const name = input.name?.trim() || "there";
  const eventTitle = input.eventTitle || "your CineBook event";
  const seats = input.seats?.length ? input.seats.join(", ") : "See your ticket";
  switch (input.kind) {
    case "EMAIL_VERIFICATION":
      return compose(input.kind, "Verify your CineBook email", "Verify your email", `Hi ${name}, confirm this email address to secure your CineBook account.`, [], input.actionUrl ? { label: "Verify email", url: input.actionUrl } : undefined);
    case "BOOKING_CONFIRMATION":
      return compose(input.kind, `Ticket confirmed: ${eventTitle}`, "Your booking is confirmed", `Hi ${name}, your seats are reserved and your QR ticket is ready.`, [`Event: ${eventTitle}`, `Booking: ${input.bookingRef ?? "—"}`, `Seats: ${seats}`]);
    case "BOOKING_CANCELLATION":
      return compose(input.kind, `Booking cancelled: ${eventTitle}`, "Your booking was cancelled", `Hi ${name}, we have cancelled this booking and released its seats.`, [`Event: ${eventTitle}`, `Booking: ${input.bookingRef ?? "—"}`, `Released seats: ${seats}`]);
    case "WAITLIST_JOINED":
      return compose(input.kind, `Waitlist joined: ${eventTitle}`, "You are on the waitlist", `Hi ${name}, we will notify you when a matching seat becomes available.`, [`Event: ${eventTitle}`, `Category: ${input.category ?? "Any"}`]);
    case "WAITLIST_OFFER":
      return compose(input.kind, `Seat available: ${eventTitle}`, "A seat is ready for you", `Hi ${name}, a ${input.category ?? "requested"} seat is temporarily reserved for you.`, [input.expiresAt ? `Offer expires: ${input.expiresAt.toISOString()}` : "Open the offer to see its expiry time"], input.actionUrl ? { label: "Accept seat offer", url: input.actionUrl } : undefined);
    case "WAITLIST_OFFER_EXPIRED":
      return compose(input.kind, `Seat offer expired: ${eventTitle}`, "Your seat offer expired", `Hi ${name}, the temporary seat offer expired and the seat has moved to the next customer.`, [`Event: ${eventTitle}`, `Category: ${input.category ?? "Requested category"}`]);
    case "BOOKING_REMINDER":
      return compose(input.kind, `Reminder: ${eventTitle}`, "Your event is coming up", `Hi ${name}, this is a reminder for your upcoming CineBook reservation.`, [`Event: ${eventTitle}`, `Showtime: ${input.showtime ?? "See your ticket"}`, `Booking: ${input.bookingRef ?? "—"}`, `Seats: ${seats}`]);
    case "ALERT_SUBSCRIPTION":
      return compose(input.kind, "CineBook event alerts are active", "Event alerts are active", "Your early-access email alerts are ready for high-demand event reminders.", []);
  }
}
