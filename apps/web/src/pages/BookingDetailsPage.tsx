import type { BookingDto } from "@cinebook/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PosterImage } from "../components/PosterImage";
import { QrTicket } from "../components/QrTicket";
import { api } from "../lib/api";
import { eventPosterArtwork, formatEventDate } from "../lib/presentation";

export function BookingDetailsPage() {
  const { bookingId = "" } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<BookingDto | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ booking: BookingDto }>(`/api/bookings/${bookingId}`)
      .then(({ booking: result }) => setBooking(result))
      .catch((reason) => setMessage(reason instanceof Error ? reason.message : "Booking could not be loaded"))
      .finally(() => setLoading(false));
  }, [bookingId]);

  async function cancel() {
    if (!booking || !window.confirm("Cancel this booking and release its seats?")) return;
    try {
      await api(`/api/bookings/${booking.id}`, { method: "DELETE" });
      setBooking({ ...booking, status: "CANCELLED" });
      setMessage("Booking cancelled and seats released.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Cancellation failed");
    }
  }

  if (loading) return <section className="account-page"><div className="booking-skeleton" /></section>;
  if (!booking) return <section className="account-page"><div className="empty-bookings"><h1>Booking unavailable</h1><p>{message}</p><button className="button button-ghost" onClick={() => navigate("/bookings")}>Back to tickets</button></div></section>;
  const active = booking.status === "CONFIRMED" && booking.event.date >= new Date().toISOString().slice(0, 10);

  return <section className="account-page booking-details-page">
    <header className="page-heading"><div><p className="kicker">Booking details</p><h1>{booking.event.title}</h1><p>Reference {booking.ref}</p></div><Link to="/bookings" className="button button-ghost">Back to tickets</Link></header>
    {message && <p className="inline-notice" role="status">{message}</p>}
    <article className="booking-detail-card">
      <PosterImage src={booking.event.content?.posterUrl || eventPosterArtwork(booking.event)} alt={`${booking.event.title} poster`} />
      <div><span className={`status-chip ${active ? "active" : ""}`}>{booking.status}</span><h2>{booking.event.title}</h2>
        <dl><div><dt>Date & time</dt><dd>{formatEventDate(booking.event.date)} · {booking.event.time}</dd></div><div><dt>Venue</dt><dd>{booking.event.venue.name}, {booking.event.venue.city} · {booking.event.venue.auditorium}</dd></div><div><dt>Seats</dt><dd>{booking.seats.map(({ seat }) => seat.label).join(", ")}</dd></div><div><dt>Total paid</dt><dd>₹{booking.totalAmount.toLocaleString("en-IN")}</dd></div></dl>
        <div className="booking-detail-actions"><Link to={`/events/${booking.event.id}`} className="button button-ghost">View event</Link>{active && <button type="button" className="button danger-button" onClick={cancel}>Cancel booking</button>}</div>
      </div>
      <div className="booking-detail-qr"><QrTicket reference={booking.ref} size={180} /><strong>{booking.ref}</strong><span>Present this QR at entry</span></div>
    </article>
  </section>;
}
