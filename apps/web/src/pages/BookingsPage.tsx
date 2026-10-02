import type { BookingDto } from "@cinebook/shared";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { QrTicket } from "../components/QrTicket";
import { api, assetUrl } from "../lib/api";
import { eventArtwork, formatEventDate } from "../lib/presentation";

export function BookingsPage() {
  const [bookings, setBookings] = useState<BookingDto[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<BookingDto | null>(null);
  const [cancelling, setCancelling] = useState(false);

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
      {message && <p className="inline-notice" role="status">{message}</p>}
      {loading ? <div className="booking-grid"><div className="booking-skeleton" /><div className="booking-skeleton" /></div> : bookings.length === 0 ? (
        <div className="empty-bookings"><span>🎟</span><h2>No tickets yet</h2><p>Your next memorable night is only a few clicks away.</p><Link to="/" className="button button-primary">Browse shows</Link></div>
      ) : (
        <div className="booking-grid">
          {bookings.map((booking) => {
            const active = booking.status === "CONFIRMED";
            return (
              <article className="booking-card" key={booking.id}>
                <div className="booking-main"><div className="booking-art"><img src={assetUrl(eventArtwork(booking.event.type))} alt="" /><div /></div><div className="booking-copy"><div className="booking-title-row"><div><span className={`status-chip ${active ? "active" : ""}`}>{booking.status}</span><h2>{booking.event.title}</h2></div>{active && <QrTicket reference={booking.ref} size={72} />}</div><dl><div><dt>Date & time</dt><dd>{formatEventDate(booking.event.date)} · {booking.event.time}</dd></div><div><dt>Seats</dt><dd>{booking.seats.map(({ seat }) => seat.label).join(", ")}</dd></div><div><dt>Venue</dt><dd>{booking.event.venue.name}</dd></div><div><dt>Total</dt><dd className="price-text">₹{booking.totalAmount}</dd></div></dl><code>{booking.ref}</code></div></div>
                <footer><Link to={`/events/${booking.event.id}`}>View event</Link>{active && <button type="button" onClick={() => setCancelTarget(booking)}>Cancel booking</button>}</footer>
              </article>
            );
          })}
        </div>
      )}

      {cancelTarget && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !cancelling) setCancelTarget(null); }}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title"><span className="dialog-icon">!</span><h2 id="cancel-title">Cancel this booking?</h2><p>{cancelTarget.event.title} · {cancelTarget.seats.map(({ seat }) => seat.label).join(", ")}</p><p>The seats will be released and may be offered to waiting customers. This action cannot be undone.</p><div><button type="button" className="button button-ghost" disabled={cancelling} onClick={() => setCancelTarget(null)}>Keep booking</button><button type="button" className="button danger-button" disabled={cancelling} onClick={cancelBooking}>{cancelling ? "Cancelling…" : "Cancel booking"}</button></div></section></div>}
    </section>
  );
}
