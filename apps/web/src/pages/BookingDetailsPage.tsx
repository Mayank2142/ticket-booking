import type { BookingDto } from "@cinebook/shared";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PosterImage } from "../components/PosterImage";
import { QrTicket } from "../components/QrTicket";
import { api } from "../lib/api";
import { eventPosterArtwork, formatEventDate } from "../lib/presentation";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { Badge } from "../components/ui/Badge";
import { Button, ButtonLink } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CustomerEmptyState, CustomerFeedback, CustomerLoading, CustomerPageHeading } from "./CustomerPageUI";

export function BookingDetailsPage() {
  const { bookingId = "" } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<BookingDto | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [messageError, setMessageError] = useState(false);

  useEffect(() => {
    api<{ booking: BookingDto }>(`/api/bookings/${bookingId}`)
      .then(({ booking: result }) => setBooking(result))
      .catch((reason) => { setMessage(reason instanceof Error ? reason.message : "Booking could not be loaded"); setMessageError(true); })
      .finally(() => setLoading(false));
  }, [bookingId]);

  async function cancel() {
    if (!booking) return;
    setCancelling(true); setMessage(""); setMessageError(false);
    try {
      await api(`/api/bookings/${booking.id}`, { method: "DELETE" });
      setBooking({ ...booking, status: "CANCELLED" });
      setMessage("Booking cancelled and seats released.");
      setCancelRequested(false);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Cancellation failed");
      setMessageError(true);
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <section className="customer-space"><CustomerPageHeading eyebrow="Your reservation" title="Booking details" description="Show information, selected seats and your QR ticket." /><CustomerLoading label="Loading booking details…" /></section>;
  if (!booking) return <section className="customer-space"><CustomerPageHeading eyebrow="Your reservation" title="Booking unavailable" description="This booking could not be opened." /><CustomerEmptyState error title="Booking could not be loaded" description={message} action={<Button variant="secondary" onClick={() => navigate("/bookings")}>Back to tickets</Button>} /></section>;
  const active = booking.status === "CONFIRMED" && booking.event.date >= new Date().toISOString().slice(0, 10);

  return <section className="customer-space booking-details-page">
    <CustomerPageHeading eyebrow="Booking details" title={booking.event.title} description={`Reference ${booking.ref}`} action={<ButtonLink to="/bookings" variant="secondary">Back to tickets</ButtonLink>} />
    {message && !cancelRequested && <CustomerFeedback error={messageError} focus>{message}</CustomerFeedback>}
    <div className="customer-booking-details">
      <Card as="article">
        <div className="customer-detail-show"><PosterImage src={booking.event.content?.posterUrl || eventPosterArtwork(booking.event)} alt={`${booking.event.title} poster`} /><div><Badge tone={booking.status === "CANCELLED" ? "danger" : active ? "success" : "neutral"}>{booking.status}</Badge><h2>{booking.event.title}</h2>
          <dl className="customer-ticket-metadata"><div><dt>Date & time</dt><dd>{formatEventDate(booking.event.date)} · {booking.event.time}</dd></div><div><dt>Venue</dt><dd>{booking.event.venue.name}, {booking.event.venue.city} · {booking.event.venue.auditorium}</dd></div><div><dt>Seats ({booking.seats.length})</dt><dd>{booking.seats.map(({ seat }) => seat.label).join(", ")}</dd></div><div><dt>Booking total</dt><dd>₹{booking.totalAmount.toLocaleString("en-IN")}</dd></div></dl>
        </div></div>
        <div className="customer-detail-actions"><ButtonLink to={`/events/${booking.event.id}`} variant="secondary">View event</ButtonLink>{active && <Button variant="danger" onClick={() => { setMessage(""); setCancelRequested(true); }}>Cancel booking</Button>}</div>
      </Card>
      <Card className="customer-detail-qr"><h2>Your QR ticket</h2><QrTicket reference={booking.ref} size={180} /><code>{booking.ref}</code><p>Present this QR at entry</p>{booking.status === "CANCELLED" && <CustomerFeedback>This booking is cancelled. Its ticket is no longer valid for entry.</CustomerFeedback>}</Card>
    </div>
    {cancelRequested && <AccessibleDialog labelledBy="details-cancel-title" className="customer-dialog" locked={cancelling} onClose={() => setCancelRequested(false)}><span className="customer-dialog-icon" aria-hidden="true">!</span><h2 id="details-cancel-title">Cancel this booking?</h2><p>{booking.event.title} · {booking.seats.map(({ seat }) => seat.label).join(", ")}</p><p>The seats will be released and may be offered to waiting customers. This action cannot be undone.</p>{message && <CustomerFeedback error={messageError}>{message}</CustomerFeedback>}<div className="customer-dialog-actions"><Button variant="secondary" disabled={cancelling} onClick={() => setCancelRequested(false)}>Keep booking</Button><Button variant="danger" disabled={cancelling} aria-busy={cancelling} onClick={cancel}>{cancelling ? "Cancelling…" : "Cancel booking"}</Button></div></AccessibleDialog>}
  </section>;
}
