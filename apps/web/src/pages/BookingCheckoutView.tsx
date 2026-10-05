import type { BookingConfirmationDto, EventDetailDto } from "@cinebook/shared";
import { useEffect, useRef, type ReactNode } from "react";
import { PosterImage } from "../components/PosterImage";
import { QrTicket } from "../components/QrTicket";
import { Badge } from "../components/ui/Badge";
import { Button, ButtonLink } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { eventArtwork, formatEventDate } from "../lib/presentation";
import "./BookingCheckout.css";

type BookingCustomer = { name: string; email: string } | null;
type CheckoutReviewProps = {
  event: EventDetailDto;
  customer: BookingCustomer;
  seats: string[];
  total: number;
  remaining: number;
  working: boolean;
  notice: string;
  countdown: ReactNode;
  onBack: () => void;
  onConfirm: () => void;
};

/** Render-only views. EventPage owns the timer, totals, requests and booking transitions. */
export function CheckoutReviewView({ event, customer, seats, total, remaining, working, notice, countdown, onBack, onConfirm }: CheckoutReviewProps) {
  const heading = useBookingStepHeading();
  return (
    <section className="booking-checkout-design booking-review" aria-labelledby="booking-review-title" aria-busy={working}>
      <div className="booking-checkout-breadcrumb"><Button variant="ghost" size="small" onClick={onBack}>← Back to seats</Button><span>Booking review</span><Badge tone="primary">Review selection</Badge></div>
      <div className="booking-review-heading"><div><p>One last check before you confirm</p><h1 id="booking-review-title" ref={heading} tabIndex={-1}>Review your booking</h1></div>{countdown}</div>
      {remaining === 0 && <p className="booking-checkout-alert" role="alert">Your hold has expired. Return to the seat map to choose available seats.</p>}
      <div className="booking-checkout-columns">
        <div className="booking-checkout-ticket-column">
          <TicketCard event={event} seats={seats} confirmed={false} />
          <Card className="booking-checkout-guidance"><h2>Before you confirm</h2><p>Check your showtime and selected seats. Your booking is confirmed only after the confirmation request succeeds.</p><p>Your seats remain reserved until the hold timer expires.</p></Card>
        </div>
        <aside className="booking-checkout-sidebar" aria-label="Booking summary">
          <OrderSummary seats={seats} total={total} confirmed={false} />
          <ContactCard customer={customer} />
          <Card className="booking-checkout-action-card">
            <h2>Ready to book?</h2><p>Your QR ticket is generated immediately after confirmation.</p>
            {notice && <p className="booking-checkout-alert" role="alert">{notice}</p>}
            <Button fullWidth disabled={working || remaining === 0 || !customer} onClick={onConfirm} aria-busy={working}>{working ? "Confirming…" : "Confirm booking"}</Button>
            {working && <p className="booking-checkout-progress" role="status">Confirming your booking. Please wait.</p>}
          </Card>
        </aside>
      </div>
    </section>
  );
}

export function BookingConfirmationView({ event, confirmation, customer }: { event: EventDetailDto; confirmation: BookingConfirmationDto; customer: BookingCustomer }) {
  const heading = useBookingStepHeading();
  return (
    <section className="booking-checkout-design booking-confirmation" aria-labelledby="booking-confirmation-title">
      <div className="booking-checkout-breadcrumb"><ButtonLink to="/bookings" variant="ghost" size="small">← My tickets</ButtonLink><span>Booking pass confirmation</span><Badge tone="success">Booking confirmed</Badge></div>
      <header className="booking-confirmation-heading"><span aria-hidden="true">✓</span><div><h1 id="booking-confirmation-title" ref={heading} tabIndex={-1}>You’re all set. Booking confirmed!</h1><p>Your digital ticket is ready. Keep the booking reference and QR code for entry.</p></div></header>
      <div className="booking-checkout-columns">
        <div className="booking-checkout-ticket-column">
          <TicketCard event={event} seats={confirmation.seats} confirmed reference={confirmation.ref} />
          <Card className="booking-checkout-guidance"><h2>Your digital ticket</h2><p>Show your QR ticket at the venue entrance. You can reopen your booking reference and QR code at any time from My Tickets.</p>{event.entryRule && <p>{event.entryRule}</p>}</Card>
        </div>
        <aside className="booking-checkout-sidebar" aria-label="Confirmed booking summary">
          <OrderSummary seats={confirmation.seats} total={confirmation.total} confirmed />
          <ContactCard customer={customer} emailMessage={confirmation.emailDelivered ? "QR ticket delivered by email" : confirmation.emailMessage} />
          <Card className="booking-checkout-guidance"><h2>Ticket saved in My Tickets</h2><p>Find this booking, its reference and QR code in your ticket history.</p></Card>
          <div className="booking-checkout-next-actions"><ButtonLink to="/" fullWidth>Explore more events</ButtonLink><ButtonLink to="/bookings" variant="secondary" fullWidth>View my tickets</ButtonLink></div>
        </aside>
      </div>
    </section>
  );
}

function TicketCard({ event, seats, confirmed, reference }: { event: EventDetailDto; seats: string[]; confirmed: boolean; reference?: string }) {
  return (
    <Card as="article" className="booking-checkout-ticket" aria-label={confirmed ? "Confirmed digital ticket" : "Selected show and seats"}>
      <div className="booking-ticket-art">
        <PosterImage src={event.posterUrl || eventArtwork(event.type)} alt="" />
        <div className="booking-ticket-shade" />
        <div className="booking-ticket-badges"><Badge tone="primary">{event.format}</Badge><Badge tone={confirmed ? "success" : "neutral"}>{confirmed ? "Confirmed pass" : "Review selection"}</Badge></div>
        <div className="booking-ticket-title"><h2>{event.title}</h2><p>{event.venue.auditorium} · {event.language}{event.certificate ? ` · ${event.certificate}` : ""}</p></div>
      </div>
      <div className="booking-ticket-body">
        <dl className="booking-ticket-metadata"><Detail label="Date" value={formatEventDate(event.date)} /><Detail label="Showtime" value={event.time} /><Detail label="Tickets" value={String(seats.length)} /><Detail label="Auditorium" value={event.venue.auditorium} /></dl>
        <div className="booking-ticket-seats"><span>Selected seats</span><ul aria-label="Selected seats">{seats.map((seat) => <li key={seat}>{seat}</li>)}</ul></div>
        <div className="booking-ticket-venue"><span aria-hidden="true">⌖</span><div><strong>{event.venue.name}</strong><p>{event.venue.city}{event.venue.address ? ` · ${event.venue.address}` : ""}</p></div></div>
      </div>
      {confirmed && reference && <>
        <div className="booking-ticket-pass">
          <div className="booking-ticket-qr"><QrTicket reference={reference} size={188} /><p>Scan at the venue entrance</p></div>
          <dl className="booking-ticket-reference"><div><dt>Booking reference</dt><dd><code>{reference}</code></dd></div><Detail label="Ticket status" value="Confirmed · QR ready" /><Detail label="Date & time" value={`${formatEventDate(event.date)} · ${event.time}`} /></dl>
        </div>
        <div className="booking-ticket-download"><a className="ui-button ui-button--secondary ui-button--medium" href={`data:text/plain;charset=utf-8,${encodeURIComponent(`CineBook ticket ${reference}\n${event.title}\n${seats.join(", ")}`)}`} download={`${reference}.txt`}>Download ticket details</a><p>Select the QR code to download your QR ticket.</p></div>
      </>}
    </Card>
  );
}

function OrderSummary({ seats, total, confirmed }: { seats: string[]; total: number; confirmed: boolean }) {
  const money = `₹${total.toLocaleString("en-IN")}`;
  return <Card className="booking-checkout-order"><div className="booking-checkout-card-heading"><h2>Order summary</h2><Badge tone={confirmed ? "success" : "neutral"}>{confirmed ? "Confirmed" : `${seats.length} ticket${seats.length === 1 ? "" : "s"}`}</Badge></div><dl><div><dt><strong>Tickets ({seats.length})</strong><small>{seats.join(", ")}</small></dt><dd>{money}</dd></div><div><dt>Convenience fee</dt><dd>₹0</dd></div></dl><div className="booking-checkout-total"><div><span>{confirmed ? "Booking total" : "Total amount"}</span><small>No additional checkout fee</small></div><strong>{money}</strong></div></Card>;
}

function ContactCard({ customer, emailMessage }: { customer: BookingCustomer; emailMessage?: string }) {
  return <Card className="booking-checkout-contact"><h2>{emailMessage !== undefined ? "Contact & ticket delivery" : "Customer details"}</h2>{customer ? <dl><Detail label="Customer" value={customer.name} /><Detail label="Email address" value={customer.email} /></dl> : <p>Log in to confirm this booking.</p>}{emailMessage !== undefined && <p className="booking-checkout-delivery" role="status">{emailMessage}</p>}</Card>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function useBookingStepHeading() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest("section")?.scrollIntoView({ block: "start", behavior: "instant" });
  }, []);
  return heading;
}
