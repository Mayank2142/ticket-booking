import type { BookingDto } from "@cinebook/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { QrTicket } from "../components/QrTicket";
import { PosterImage } from "../components/PosterImage";
import { api } from "../lib/api";
import { eventPosterArtwork, formatEventDate } from "../lib/presentation";

export function BookingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [bookings, setBookings] = useState<BookingDto[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<BookingDto | null>(null);
  const [cancelling, setCancelling] = useState(false);
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
    load().catch((reason) => setMessage(reason instanceof Error ? reason.message : "Bookings could not be loaded")).finally(() => setLoading(false));
  }, [load]);

  async function cancelBooking() {
    if (!cancelTarget) return;
    setCancelling(true); setMessage("");
    try {
      await api(`/api/bookings/${cancelTarget.id}`, { method: "DELETE" });
      setMessage("Booking cancelled. Eligible seats have been offered to the waitlist.");
      setCancelTarget(null);
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Cancellation failed");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="bookings-page">
      <header className="page-heading"><div><p className="kicker">Your cinema wallet</p><h1>My tickets</h1><p>Confirmed QR passes, previous reservations and cancellations in one place.</p></div><Link to="/" className="button button-ghost">Explore events</Link></header>
      <div className="account-tabs" role="tablist" aria-label="Booking history filters">
        {(["upcoming", "previous", "cancelled"] as const).map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => setSearchParams(tab === "upcoming" ? {} : { tab })} key={tab}>{tab[0].toUpperCase() + tab.slice(1)} <span>{grouped[tab].length}</span></button>)}
      </div>
      {message && <p className="inline-notice" role="status">{message}</p>}
      {loading ? <div className="booking-grid"><div className="booking-skeleton" /><div className="booking-skeleton" /></div> : visibleBookings.length === 0 ? (
        <div className="empty-bookings"><span>🎟</span><h2>No {activeTab} tickets</h2><p>{bookings.length ? "Your bookings in this group will appear here." : "Your next memorable night is only a few clicks away."}</p><Link to="/" className="button button-primary">Browse shows</Link></div>
      ) : (
        <div className="booking-grid">
          {visibleBookings.map((booking) => {
            const active = booking.status === "CONFIRMED" && booking.event.date >= today;
            return (
              <article className="booking-card" key={booking.id}>
                <div className="booking-main"><div className="booking-art"><PosterImage src={booking.event.content?.posterUrl || eventPosterArtwork(booking.event)} alt={`${booking.event.title} poster`} /><div /></div><div className="booking-copy"><div className="booking-title-row"><div><span className={`status-chip ${active ? "active" : ""}`}>{booking.status}</span><h2>{booking.event.title}</h2></div>{active && <QrTicket reference={booking.ref} size={72} />}</div><dl><div><dt>Date & time</dt><dd>{formatEventDate(booking.event.date)} · {booking.event.time}</dd></div><div><dt>Seats</dt><dd>{booking.seats.map(({ seat }) => seat.label).join(", ")}</dd></div><div><dt>Venue</dt><dd>{booking.event.venue.name}</dd></div><div><dt>Total</dt><dd className="price-text">₹{booking.totalAmount}</dd></div></dl><code>{booking.ref}</code></div></div>
                <footer><Link to={`/bookings/${booking.id}`}>Booking details</Link><Link to={`/events/${booking.event.id}`}>View event</Link>{active && <button type="button" onClick={() => setCancelTarget(booking)}>Cancel booking</button>}</footer>
              </article>
            );
          })}
        </div>
      )}

      {cancelTarget && <AccessibleDialog labelledBy="cancel-title" className="confirm-dialog" locked={cancelling} onClose={() => setCancelTarget(null)}><span className="dialog-icon" aria-hidden="true">!</span><h2 id="cancel-title">Cancel this booking?</h2><p>{cancelTarget.event.title} · {cancelTarget.seats.map(({ seat }) => seat.label).join(", ")}</p><p>The seats will be released and may be offered to waiting customers. This action cannot be undone.</p><div><button type="button" className="button button-ghost" disabled={cancelling} onClick={() => setCancelTarget(null)}>Keep booking</button><button type="button" className="button danger-button" disabled={cancelling} onClick={cancelBooking}>{cancelling ? "Cancelling…" : "Cancel booking"}</button></div></AccessibleDialog>}
    </section>
  );
}
