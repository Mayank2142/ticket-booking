import type {
  BookingConfirmationDto,
  EventDetailDto,
  SeatMapDto,
  SeatStatus,
  ShowSeatDto,
  WaitlistEntryDto,
  WaitlistOfferDto
} from "@cinebook/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { QrTicket } from "../components/QrTicket";
import { SeatMap, type SeatCell } from "../components/SeatMap";
import { api, apiUrl, assetUrl } from "../lib/api";
import { displaySeatLabel, eventArtwork, eventPresentation, formatEventDate, getStartingPrice } from "../lib/presentation";

type EventView = "details" | "seats" | "checkout" | "confirmed";

export function EventPage() {
  const { eventId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const offerToken = searchParams.get("offer");
  const [view, setView] = useState<EventView>(location.hash === "#seats" || offerToken ? "seats" : "details");
  const [event, setEvent] = useState<EventDetailDto | null>(null);
  const [showSeats, setShowSeats] = useState<ShowSeatDto[]>([]);
  const [layout, setLayout] = useState<{ rows: number; cols: number } | null>(null);
  const [availability, setAvailability] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [offer, setOffer] = useState<WaitlistOfferDto | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistEntryDto[]>([]);
  const [heldUntil, setHeldUntil] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmationDto | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "live" | "fallback">("connecting");

  const loadSeats = useCallback(async () => {
    const data = await api<SeatMapDto>(`/api/events/${eventId}/seats`);
    setShowSeats(data.showSeats);
    setLayout(data.layout);
    setAvailability(data.availability ?? {});
    setSelected((current) => current.filter((seatId) => {
      const seat = data.showSeats.find((item) => item.seatId === seatId);
      return seat?.status === "AVAILABLE" || seat?.heldByMe;
    }));
  }, [eventId]);

  const loadWaitlist = useCallback(async () => {
    if (user?.role !== "CUSTOMER") {
      setWaitlist([]);
      return;
    }
    const data = await api<{ entries: WaitlistEntryDto[] }>(`/api/events/${eventId}/waitlist`);
    setWaitlist(data.entries);
  }, [eventId, user?.role]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ event: EventDetailDto }>(`/api/events/${eventId}`),
      api<SeatMapDto>(`/api/events/${eventId}/seats`)
    ]).then(([eventResult, seatResult]) => {
      if (!active) return;
      setEvent(eventResult.event);
      setShowSeats(seatResult.showSeats);
      setLayout(seatResult.layout);
      setAvailability(seatResult.availability ?? {});
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Event could not be loaded"); });

    return () => { active = false; };
  }, [eventId]);

  useEffect(() => {
    loadWaitlist().catch(() => null);
  }, [loadWaitlist]);

  useEffect(() => {
    let refreshTimer: number | null = null;
    const refresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        loadSeats().catch(() => null);
        loadWaitlist().catch(() => null);
      }, 120);
    };

    const source = new EventSource(apiUrl(`/api/events/${eventId}/stream`));
    source.onopen = () => setRealtimeStatus("live");
    source.addEventListener("inventory", refresh);
    source.onerror = () => setRealtimeStatus("fallback");

    const safetyPoll = window.setInterval(() => loadSeats().catch(() => null), 30_000);
    return () => {
      source.close();
      window.clearInterval(safetyPoll);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [eventId, loadSeats, loadWaitlist]);

  useEffect(() => {
    if (!offerToken) return;
    api<{ offer: WaitlistOfferDto; requiresLogin?: boolean }>(`/api/events/${eventId}/waitlist/offer?token=${encodeURIComponent(offerToken)}`)
      .then(({ offer: activeOffer, requiresLogin }) => {
        setOffer(activeOffer);
        setHeldUntil(activeOffer.expiresAt);
        if (activeOffer.seatId) setSelected([activeOffer.seatId]);
        setView("seats");
        setNotice(requiresLogin ? "Log in to accept this waitlist offer." : `Your ${activeOffer.categoryName} seat is ready. Complete booking before the timer ends.`);
      })
      .catch((reason) => setNotice(reason instanceof Error ? reason.message : "This waitlist offer is unavailable"));
  }, [eventId, offerToken]);

  useEffect(() => {
    if (!heldUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [heldUntil]);

  const seatCells = useMemo<SeatCell[]>(() => showSeats.map((showSeat) => ({
    seatId: showSeat.seatId,
    row: showSeat.seat.row,
    col: showSeat.seat.col,
    status: showSeat.status,
    category: showSeat.seat.category,
    heldByMe: showSeat.heldByMe
  })), [showSeats]);

  const selectedSeats = useMemo(() => selected.map((seatId) => seatCells.find((seat) => seat.seatId === seatId)).filter((seat): seat is SeatCell => Boolean(seat)), [seatCells, selected]);
  const total = useMemo(() => selectedSeats.reduce((sum, seat) => {
    const categoryId = showSeats.find((item) => item.seatId === seat.seatId)?.seat.categoryId;
    return sum + (event?.prices.find((price) => price.categoryId === categoryId)?.price ?? 0);
  }, 0), [event?.prices, selectedSeats, showSeats]);
  const remaining = heldUntil ? Math.max(0, new Date(heldUntil).getTime() - now) : 0;

  useEffect(() => {
    if (!heldUntil || remaining > 0 || view === "confirmed") return;
    setHeldUntil(null);
    setOffer(null);
    setSelected([]);
    setView("seats");
    setNotice("Your hold expired. The seats have returned to the live map.");
    loadSeats().catch(() => null);
  }, [heldUntil, loadSeats, remaining, view]);

  if (error) return <StatusPanel title="Unable to open event" detail={error} />;
  if (!event || !layout) return <EventSkeleton />;
  const meta = eventPresentation(event.type);

  if (view === "confirmed" && confirmation) return <Confirmation event={event} confirmation={confirmation} />;
  if (view === "checkout") {
    return <Checkout event={event} customer={user} seats={selectedSeats.map((seat) => displaySeatLabel(seat.row, seat.col))} total={total} remaining={remaining} working={working} onBack={() => setView("seats")} onConfirm={bookSeats} />;
  }

  return (
    <div className="event-page">
      <section className="event-hero">
        <img src={assetUrl(eventArtwork(event.type))} alt="" />
        <div className="event-hero-shade" />
        <div className="event-hero-content">
          <div className="eyebrow-row"><span className="pill accent">{event.type === "MOVIE" ? "Now showing" : "Live"}</span><span className="pill">★ {meta.rating}</span></div>
          <p className="kicker">{event.genre}</p><h1>{event.title}</h1>
          <p>{event.description || "A premium live experience with real-time seat selection and instant QR ticket confirmation."}</p>
          <div className="event-meta"><span>{formatEventDate(event.date)}</span><span>{event.time}</span><span>{event.durationMinutes} min</span><span>{event.language} · {event.format}</span><span>{event.venue.city} · {event.venue.name}</span></div>
          <div className="hero-actions"><button type="button" onClick={showSeatSelection} className="button button-primary">Select seats →</button><span className="button button-ghost static-button">From ₹{getStartingPrice(event.prices)}</span>{user?.role === "CUSTOMER" && <button type="button" className="button button-ghost" onClick={toggleFavourite}>{event.isFavourite ? "♥ Saved" : "♡ Save"}</button>}</div>
        </div>
      </section>

      {view === "details" ? (
        <>
          {event.showtimes.length > 1 && <section className="content-card showtime-strip"><div><p className="kicker">More showtimes</p><h2>Choose the time that works</h2></div><div>{event.showtimes.map((show) => <Link className={show.id === event.id ? "active" : ""} key={show.id} to={`/events/${show.id}`}><strong>{show.time}</strong><span>{formatEventDate(show.date)}</span><small>{show.venue.auditorium} · from ₹{show.startingPrice}</small></Link>)}</div></section>}
          <div className="event-detail-grid">
            <section className="content-card event-about"><p className="kicker">About this show</p><h2>Event details</h2><p>{event.description || `${event.organiser.name} presents ${event.title} at ${event.venue.name}. Choose a category and reserve your exact seat.`}</p><div className="meta-grid"><Meta label="Genre" value={event.genre} /><Meta label="Duration" value={`${event.durationMinutes} minutes`} /><Meta label="Language" value={`${event.language} · ${event.format}`} /><Meta label="Certificate" value={event.certificate || "All audiences"} /><Meta label="Organiser" value={event.organiser.name} /><Meta label="Auditorium" value={event.venue.auditorium} /></div></section>
            <section className="content-card price-card"><p className="kicker">Ticket categories</p><div className="price-list">{event.prices.map((price) => <div key={price.categoryId}><span>{price.category.name}</span><strong>₹{price.price}</strong></div>)}</div><button type="button" onClick={showSeatSelection} className="button button-primary full-button">Choose seats</button></section>
          </div>
        </>
      ) : (
        <section id="seats" className="seat-section">
          <div className="section-heading compact-heading"><div><p className="kicker">Interactive seating</p><h2>Choose your seats</h2></div><span>{realtimeStatus === "live" ? "Live seat updates connected" : realtimeStatus === "connecting" ? "Connecting live seat updates…" : "Reconnecting · 30-second safety refresh active"}</span></div>
          {notice && <p className="inline-notice" role="status">{notice}</p>}
          {offer && <div className="offer-banner"><div><strong>Waitlist offer · {offer.categoryName}</strong><p>Reserved only for you while the timer is active.</p></div>{heldUntil && <Countdown remaining={remaining} />}</div>}
          <div className="seat-layout-grid">
            <SeatMap rows={layout.rows} cols={layout.cols} seats={seatCells} selected={selected} onToggle={toggleSeat} />
            <aside className="booking-sidebar">
              <div className="content-card selection-card">
                <div className="selection-image"><img src={assetUrl(eventArtwork(event.type))} alt="" /><div /></div>
                <div className="selection-body"><p className="kicker">Your selection</p><h3>{event.title}</h3><p className="muted-copy">{formatEventDate(event.date)} · {event.time}</p><hr />
                  {selectedSeats.length ? <><div className="selected-chips">{selectedSeats.map((seat) => <span key={seat.seatId}>{displaySeatLabel(seat.row, seat.col)}</span>)}</div><div className="selection-total"><span>{selectedSeats.length} ticket{selectedSeats.length === 1 ? "" : "s"}</span><strong>₹{total}</strong></div></> : <p className="muted-copy selection-empty">Select up to 10 available seats from the map.</p>}
                  <button type="button" disabled={!selected.length || working} onClick={holdAndCheckout} className="button button-primary full-button">{working ? "Securing seats…" : offer ? "Accept offer & continue" : "Hold & continue"}</button>
                </div>
              </div>
              <div className="content-card waitlist-card"><p className="kicker">Pricing & waitlist</p><div className="waitlist-list">{event.prices.map((price) => {
                const left = availability[price.categoryId] ?? 0;
                const entry = waitlist.find((item) => item.category.id === price.categoryId && item.status !== "EXPIRED");
                return <div key={price.categoryId}><div><span>{price.category.name}</span><strong>₹{price.price}</strong></div><div className="availability-row"><span>{left ? `${left} available` : "Sold out"}</span>{entry ? <strong>{entry.status === "WAITING" ? `Position #${entry.position}` : entry.status}</strong> : !left ? <button type="button" onClick={() => joinWaitlist(price.categoryId)}>Join waitlist</button> : null}</div></div>;
              })}</div></div>
            </aside>
          </div>
        </section>
      )}
    </div>
  );

  function showSeatSelection() {
    setView("seats");
    navigate({ pathname: location.pathname, search: location.search, hash: "seats" }, { replace: true });
  }

  function toggleSeat(seatId: string, status: SeatStatus) {
    if (heldUntil || status === "BOOKED") return;
    if (offer?.seatId && seatId !== offer.seatId) return;
    setSelected((current) => current.includes(seatId) ? current.filter((id) => id !== seatId) : current.length < 10 ? [...current, seatId] : current);
  }

  function requireCustomer() {
    if (!user) {
      const next = `/events/${eventId}${offerToken ? `?offer=${encodeURIComponent(offerToken)}` : "#seats"}`;
      navigate(`/login?next=${encodeURIComponent(next)}`);
      return false;
    }
    if (user.role !== "CUSTOMER") {
      setNotice("Use a customer account to hold seats, book tickets, or join a waitlist.");
      return false;
    }
    return true;
  }

  async function holdAndCheckout() {
    if (!requireCustomer()) return;
    setWorking(true); setNotice("");
    try {
      const result = await api<{ heldUntil: string }>(`/api/events/${eventId}/seats`, { method: "POST", body: JSON.stringify({ seatIds: selected, offerToken }) });
      setHeldUntil(result.heldUntil); setNow(Date.now()); setView("checkout"); await loadSeats();
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Seats could not be held"); }
    finally { setWorking(false); }
  }

  async function bookSeats() {
    if (!requireCustomer()) return;
    setWorking(true); setNotice("");
    try {
      const result = await api<{ booking: { ref: string; totalAmount: number }; email: { delivered: boolean; message: string } }>(`/api/events/${eventId}/book`, { method: "POST", body: JSON.stringify({ seatIds: selected, offerToken }) });
      setConfirmation({ ref: result.booking.ref, total: result.booking.totalAmount, seats: selectedSeats.map((seat) => displaySeatLabel(seat.row, seat.col)), emailDelivered: result.email.delivered, emailMessage: result.email.message });
      setSelected([]); setHeldUntil(null); setOffer(null); setView("confirmed"); await loadSeats();
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Booking could not be completed"); }
    finally { setWorking(false); }
  }

  async function joinWaitlist(categoryId: string) {
    if (!requireCustomer()) return;
    try {
      const result = await api<{ entry: WaitlistEntryDto }>(`/api/events/${eventId}/waitlist`, { method: "POST", body: JSON.stringify({ categoryId }) });
      setNotice(`You joined the waitlist at position #${result.entry.position}. Offers are for one seat and expire automatically.`);
      await loadWaitlist();
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Waitlist could not be joined"); }
  }

  async function toggleFavourite() {
    if (!event || user?.role !== "CUSTOMER") return;
    const favourite = !event.isFavourite;
    setEvent({ ...event, isFavourite: favourite });
    try {
      await api("/api/favourites", { method: "POST", body: JSON.stringify({ eventId: event.id, favourite }) });
    } catch (reason) {
      setEvent((current) => current ? { ...current, isFavourite: !favourite } : current);
      setNotice(reason instanceof Error ? reason.message : "Favourite could not be updated");
    }
  }
}

function Checkout({ event, customer, seats, total, remaining, working, onBack, onConfirm }: {
  event: EventDetailDto;
  customer: { name: string; email: string } | null;
  seats: string[];
  total: number;
  remaining: number;
  working: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="checkout-page">
      <button type="button" onClick={onBack} className="back-button">← Back to seats</button>
      <div className="checkout-heading"><div><p className="kicker">Secure reservation</p><h1>Review your booking</h1></div><Countdown remaining={remaining} /></div>
      <div className="checkout-grid">
        <section className="content-card checkout-event"><div className="checkout-image"><img src={assetUrl(eventArtwork(event.type))} alt="" /><div /><span><small>{event.type}</small><strong>{event.title}</strong></span></div><div className="checkout-meta"><Meta label="Date & time" value={`${formatEventDate(event.date)} · ${event.time}`} /><Meta label="Venue" value={event.venue.name} /><Meta label="Selected seats" value={seats.join(", ")} /><Meta label="Tickets" value={String(seats.length)} /></div></section>
        <aside className="content-card checkout-summary"><p className="kicker">Booking summary</p><div className="summary-lines"><div><span>Tickets ({seats.length})</span><span>₹{total}</span></div><div><span>Convenience fee</span><span>₹0</span></div><div className="summary-total"><strong>Total</strong><strong>₹{total}</strong></div></div><div className="customer-box"><strong>Customer</strong>{customer ? <><span>{customer.name}</span><small>{customer.email}</small></> : <span>Log in to confirm this booking.</span>}</div><button type="button" disabled={working || remaining === 0 || !customer} onClick={onConfirm} className="button button-primary full-button">{working ? "Confirming…" : "Confirm booking"}</button><p className="summary-note">No payment is collected. Your QR ticket is generated immediately after confirmation.</p></aside>
      </div>
    </div>
  );
}

function Confirmation({ event, confirmation }: { event: EventDetailDto; confirmation: BookingConfirmationDto }) {
  return (
    <section className="confirmation-card">
      <div className="confirmation-check">✓</div><p className="kicker">Reservation complete</p><h1>Booking confirmed</h1><p>{confirmation.emailDelivered ? "Your QR ticket has also been delivered to your email." : confirmation.emailMessage}</p>
      <div className="ticket-panel"><div className="ticket-qr"><QrTicket reference={confirmation.ref} size={166} /></div><div className="ticket-copy"><div><small>Booking reference</small><strong className="booking-ref">{confirmation.ref}</strong></div><div><h2>{event.title}</h2><p>{formatEventDate(event.date)} · {event.time}</p><p>{event.venue.name}</p></div><div className="ticket-meta"><Meta label="Seats" value={confirmation.seats.join(", ")} /><Meta label="Total" value={`₹${confirmation.total}`} /></div></div></div>
      <div className="confirmation-actions"><Link to="/bookings" className="button button-primary">View my bookings</Link><Link to="/" className="button button-ghost">Explore more shows</Link></div>
    </section>
  );
}

function Countdown({ remaining }: { remaining: number }) {
  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  return <div className="countdown"><small>Hold expires in</small><strong>{String(minutes).padStart(2, "0")}:{String(Math.max(0, seconds % 60)).padStart(2, "0")}</strong></div>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="meta-item"><small>{label}</small><strong>{value}</strong></div>;
}

function StatusPanel({ title, detail }: { title: string; detail: string }) {
  return <section className="status-card"><span>!</span><h1>{title}</h1><p>{detail}</p><Link to="/" className="button button-ghost">Back to events</Link></section>;
}

function EventSkeleton() {
  return <div className="event-page"><div className="event-page-skeleton large" /><div className="event-detail-grid"><div className="event-page-skeleton" /><div className="event-page-skeleton" /></div></div>;
}
