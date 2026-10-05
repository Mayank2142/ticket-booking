import type { BookingDto } from "@cinebook/shared";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { QrTicket } from "../components/QrTicket";
import { PosterImage } from "../components/PosterImage";
import { api } from "../lib/api";
import { eventPosterArtwork, formatEventDate } from "../lib/presentation";
import { Badge } from "../components/ui/Badge";
import { Button, ButtonLink } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CustomerEmptyState, CustomerFeedback, CustomerLoading, CustomerPageHeading } from "./CustomerPageUI";

export function BookingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookings, setBookings] = useState<BookingDto[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<BookingDto | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [messageError, setMessageError] = useState(false);
  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab === "previous" || requestedTab === "cancelled" ? requestedTab : "upcoming";
  const today = new Date().toISOString().slice(0, 10);
  const grouped = {
    upcoming: bookings.filter((booking) => booking.status === "CONFIRMED" && booking.event.date >= today),
    previous: bookings.filter((booking) => booking.status === "CONFIRMED" && booking.event.date < today),
    cancelled: bookings.filter((booking) => booking.status === "CANCELLED"),
  };
  const visibleBookings = grouped[activeTab];

  const load = useCallback(async () => {
    const data = await api<{ bookings: BookingDto[] }>("/api/bookings");
    setBookings(data.bookings);
  }, []);

  useEffect(() => {
    load().catch((reason) => { setMessage(reason instanceof Error ? reason.message : "Bookings could not be loaded"); setLoadFailed(true); setMessageError(true); }).finally(() => setLoading(false));
  }, [load]);

  async function cancelBooking() {
    if (!cancelTarget) return;
    setCancelling(true); setMessage(""); setMessageError(false);
    try {
      await api(`/api/bookings/${cancelTarget.id}`, { method: "DELETE" });
      setMessage("Booking cancelled. Eligible seats have been offered to the waitlist.");
      setCancelTarget(null);
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Cancellation failed");
      setMessageError(true);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="customer-space bookings-page">
      <CustomerPageHeading eyebrow="Your reservations" title="My tickets" description="Confirmed QR passes, previous reservations and cancellations in one place." action={<ButtonLink to="/" variant="secondary">Explore events</ButtonLink>} />
      <div className="account-tabs" role="tablist" aria-label="Booking history filters" onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]"));
        const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next]?.focus(); tabs[next]?.click();
      }}>
        {(["upcoming", "previous", "cancelled"] as const).map((tab) => <button type="button" role="tab" id={`tickets-tab-${tab}`} aria-controls="tickets-panel" tabIndex={activeTab === tab ? 0 : -1} aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => setSearchParams(tab === "upcoming" ? {} : { tab })} key={tab}>{tab[0].toUpperCase() + tab.slice(1)} <span>{grouped[tab].length}</span></button>)}
      </div>
      {message && !cancelTarget && <CustomerFeedback error={messageError} focus>{message}</CustomerFeedback>}
      <div id="tickets-panel" role="tabpanel" aria-labelledby={`tickets-tab-${activeTab}`}>
      {loading ? <CustomerLoading label="Loading your tickets…" /> : loadFailed ? <CustomerEmptyState error title="Tickets could not be loaded" description={message} action={<ButtonLink to="/" variant="secondary">Explore events</ButtonLink>} /> : visibleBookings.length === 0 ? (
        <CustomerEmptyState title={`No ${activeTab} tickets`} description={bookings.length ? "Your bookings in this group will appear here." : "Your next memorable night is only a few clicks away."} action={<ButtonLink to="/">Browse shows</ButtonLink>} />
      ) : (
        <div className="customer-ticket-grid">
          {visibleBookings.map((booking) => {
            const active = booking.status === "CONFIRMED" && booking.event.date >= today;
            return (
              <Card as="article" className="customer-ticket" key={booking.id}>
                <div className="customer-ticket-body"><PosterImage className="customer-ticket-poster" src={booking.event.content?.posterUrl || eventPosterArtwork(booking.event)} alt={`${booking.event.title} poster`} /><div className="customer-ticket-copy"><Badge tone={booking.status === "CANCELLED" ? "danger" : active ? "success" : "neutral"}>{booking.status}</Badge><h2>{booking.event.title}</h2><dl className="customer-ticket-metadata"><div><dt>Date & time</dt><dd>{formatEventDate(booking.event.date)} · {booking.event.time}</dd></div><div><dt>Seats</dt><dd>{booking.seats.map(({ seat }) => seat.label).join(", ")}</dd></div><div><dt>Venue</dt><dd>{booking.event.venue.name}</dd></div><div><dt>Total</dt><dd>₹{booking.totalAmount.toLocaleString("en-IN")}</dd></div></dl></div></div>
                <div className="customer-ticket-pass">{active && <QrTicket reference={booking.ref} size={72} />}<div><span>Booking reference</span><code>{booking.ref}</code></div></div>
                <footer className="customer-ticket-actions"><ButtonLink to={`/bookings/${booking.id}`} variant="secondary" size="small">Booking details</ButtonLink><ButtonLink to={`/events/${booking.event.id}`} variant="ghost" size="small">View event</ButtonLink>{active && <Button variant="danger" size="small" onClick={() => { setMessage(""); setCancelTarget(booking); }}>Cancel booking</Button>}</footer>
              </Card>
            );
          })}
        </div>
      )}
      </div>

      {cancelTarget && <AccessibleDialog labelledBy="cancel-title" className="customer-dialog" locked={cancelling} onClose={() => setCancelTarget(null)}><span className="customer-dialog-icon" aria-hidden="true">!</span><h2 id="cancel-title">Cancel this booking?</h2><p>{cancelTarget.event.title} · {cancelTarget.seats.map(({ seat }) => seat.label).join(", ")}</p><p>The seats will be released and may be offered to waiting customers. This action cannot be undone.</p>{message && <CustomerFeedback error={messageError}>{message}</CustomerFeedback>}<div className="customer-dialog-actions"><Button variant="secondary" disabled={cancelling} onClick={() => setCancelTarget(null)}>Keep booking</Button><Button variant="danger" disabled={cancelling} aria-busy={cancelling} onClick={cancelBooking}>{cancelling ? "Cancelling…" : "Cancel booking"}</Button></div></AccessibleDialog>}
    </section>
  );
}
