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
import { PosterImage } from "../components/PosterImage";
import { SeatMap, type SeatCell } from "../components/SeatMap";
import { api, apiUrl } from "../lib/api";
import { displaySeatLabel, eventArtwork, eventHeroArtwork, eventPresentation, formatEventDate, getStartingPrice } from "../lib/presentation";

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
    if (user?.role !== "CUSTOMER" || !eventId) return;
    api("/api/recently-viewed", { method: "POST", body: JSON.stringify({ eventId }) }).catch(() => null);
  }, [eventId, user?.role]);

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
    heldByMe: showSeat.heldByMe,
    seatType: showSeat.seat.seatType,
    aisleAfter: showSeat.seat.aisleAfter,
    isBlocked: showSeat.seat.isBlocked,
    viewLabel: showSeat.seat.viewLabel,
    viewScore: showSeat.seat.viewScore,
    unavailableReason: showSeat.unavailableReason,
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
      <div className="event-status-ribbon"><span>Inventory stream: {realtimeStatus}</span><span>Seat holds use a protected TTL</span><span>{showSeats.filter((seat) => seat.status === "AVAILABLE").length} seats currently available</span></div>
      {view === "details" && <section className="event-hero">
        <PosterImage src={eventHeroArtwork(event)} alt="" />
        <div className="event-hero-shade" />
        <div className="event-hero-content">
          <div className="eyebrow-row"><span className="pill accent">{event.type === "MOVIE" ? "Now showing" : "Live"}</span><span className="pill">★ {meta.rating}</span></div>
          <p className="kicker">{event.genre}</p><h1>{event.title}</h1>
          <p>{event.description || "A premium live experience with real-time seat selection and instant QR ticket confirmation."}</p>
          <div className="event-meta"><span>{formatEventDate(event.date)}</span><span>{event.time}</span><span>{event.durationMinutes} min</span><span>{event.language} · {event.format}</span><span>{event.venue.city} · {event.venue.name}</span></div>
          <div className="hero-actions"><button type="button" onClick={showSeatSelection} className="button button-primary">Select seats →</button><span className="button button-ghost static-button">From ₹{getStartingPrice(event.prices)}</span>{user?.role === "CUSTOMER" && <button type="button" className="button button-ghost" onClick={toggleFavourite}>{event.isFavourite ? "♥ Saved" : "♡ Save"}</button>}{user?.role === "CUSTOMER" && event.isFavourite && <Link className="button button-ghost" to="/saved">View saved</Link>}</div>
        </div>
      </section>}

      {view === "details" ? (
        <>
          {event.showtimes.length > 1 && <section className="content-card showtime-strip"><div><p className="kicker">More showtimes</p><h2>Choose the time that works</h2></div><div>{event.showtimes.map((show) => <Link className={show.id === event.id ? "active" : ""} key={show.id} to={`/events/${show.id}`}><strong>{show.time}</strong><span>{formatEventDate(show.date)}</span><small>{show.venue.auditorium} · from ₹{show.startingPrice}</small></Link>)}</div></section>}
          <div className="event-detail-grid">
            <section className="content-card event-about"><p className="kicker">About this show</p><h2>Event details</h2><p>{event.description || `${event.organiser.name} presents ${event.title} at ${event.venue.name}. Choose a category and reserve your exact seat.`}</p><div className="meta-grid"><Meta label="Genre" value={event.genre} /><Meta label="Duration" value={`${event.durationMinutes} minutes`} /><Meta label="Language" value={`${event.language} · ${event.format}`} /><Meta label="Certificate" value={event.certificate || "All audiences"} /><Meta label="Organiser" value={event.organiser.name} /><Meta label="Auditorium" value={event.venue.auditorium} />{event.releaseDate && <Meta label="Release date" value={formatEventDate(event.releaseDate)} />}{event.formats.length > 0 && <Meta label="Formats" value={event.formats.join(" · ")} />}{event.cast.length > 0 && <Meta label="Cast" value={event.cast.join(", ")} />}{event.crew.length > 0 && <Meta label="Crew" value={event.crew.join(", ")} />}{event.performers.length > 0 && <Meta label="Performers" value={event.performers.join(", ")} />}{event.ageRule && <Meta label="Age rule" value={event.ageRule} />}{event.entryRule && <Meta label="Entry rule" value={event.entryRule} />}</div>{event.trailerUrl && <a className="button button-ghost compact" href={event.trailerUrl} target="_blank" rel="noreferrer">Watch trailer ↗</a>}</section>
            <section className="content-card price-card"><p className="kicker">Ticket categories</p><div className="price-list">{event.prices.map((price) => <div key={price.categoryId}><span>{price.category.name}</span><strong>₹{price.price}</strong></div>)}</div><button type="button" onClick={showSeatSelection} className="button button-primary full-button">Choose seats</button></section>
          </div>
        </>
      ) : (
        <>
        <CompactSeatEventHeader event={event} />
        <section id="seats" className="seat-section">
          <div className="section-heading compact-heading seat-heading"><div><p className="kicker">Auditorium {event.venue.auditorium} precision selection</p><h2>Choose your seats</h2></div><span className={`stream-state ${realtimeStatus}`}>{realtimeStatus === "live" ? "Live seat updates connected" : realtimeStatus === "connecting" ? "Connecting live seat updates…" : "Reconnecting safety refresh active"}</span></div>
          <div className="seat-system-bar"><span>{showSeats.filter((seat) => seat.status === "AVAILABLE").length} available now</span><span>{event.format} · {event.durationMinutes} min</span><span>{event.venue.name}, {event.venue.city}</span><span>Hold window starts after selection</span></div>
          {notice && <p className="inline-notice" role="status">{notice}</p>}
          {offer && <div className="offer-banner waitlist-offer"><div className="offer-position">#1</div><div className="offer-copy"><span>Exclusive waitlist allocation</span><strong>Your {offer.categoryName} seat is waiting.</strong><p>This seat is reserved only for you. If the timer expires, it automatically moves to the next customer.</p><div className="queue-pipeline"><i className="done">Released</i><i className="active">Offered to you</i><i>Next in queue</i></div></div>{heldUntil && <Countdown remaining={remaining} />}</div>}
          <div className="seat-layout-grid">
            <SeatMap rows={layout.rows} cols={layout.cols} seats={seatCells} selected={selected} prices={Object.fromEntries(event.prices.map((price) => [price.category.name, price.price]))} onToggle={toggleSeat} />
            <aside className="booking-sidebar">
              <div className="content-card selection-card">
                <div className="selection-body seat-reservation-summary">
                  <div className="reservation-status"><span>Live hold reservation</span><code>{heldUntil ? "ACTIVE" : "READY"}</code></div>
                  <div className={`hold-window ${heldUntil ? "active" : ""}`}><span aria-hidden="true">◷</span><div><small>Hold expiry window</small><strong>{heldUntil ? formatRemaining(remaining) : "Starts after continue"}</strong></div></div>
                  <div className="selection-title-row"><h3>Selected seats</h3><span>{selectedSeats.length} ticket{selectedSeats.length === 1 ? "" : "s"}</span></div>
                  {selectedSeats.length ? <div className="selected-seat-list">{selectedSeats.map((seat) => {
                    const showSeat = showSeats.find((item) => item.seatId === seat.seatId);
                    const price = event.prices.find((item) => item.categoryId === showSeat?.seat.categoryId)?.price ?? 0;
                    return <div key={seat.seatId}><b>{displaySeatLabel(seat.row, seat.col)}</b><span><strong>Row {displaySeatLabel(seat.row, 1).replace(/\d+$/, "")} · {seat.category.name}</strong><small>{event.venue.auditorium}</small></span><em>₹{price.toLocaleString("en-IN")}</em></div>;
                  })}</div> : <p className="muted-copy selection-empty">Select up to 10 available seats from the live map.</p>}
                  <div className="fare-breakdown"><small>Transparent fare breakdown</small><span>Base admission <b>₹{total.toLocaleString("en-IN")}</b></span><span>Booking convenience fee <b>₹0</b></span><span>Integrated taxes <b>Included</b></span><strong>Total amount <b>₹{total.toLocaleString("en-IN")}</b></strong></div>
                  <button type="button" disabled={!selected.length || working} onClick={holdAndCheckout} className="button button-primary full-button">{working ? "Securing seats…" : offer ? "Accept offer & continue" : `Continue to checkout (${selected.length} seat${selected.length === 1 ? "" : "s"}) →`}</button>
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
        </>
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

function CompactSeatEventHeader({ event }: { event: EventDetailDto }) {
  return (
    <section className="seat-event-banner" aria-label={`${event.title} show information`}>
      <PosterImage src={event.posterUrl || eventArtwork(event.type)} alt="" />
      <div className="seat-event-copy"><div><span>{event.format}</span><span>{event.venue.auditorium}</span><span>{event.certificate || event.language}</span><span>{event.durationMinutes} min</span></div><h1>{event.title}</h1><p>{event.venue.name}, {event.venue.city} · {formatEventDate(event.date)} · {event.time}</p></div>
      <div className="seat-tech-specs"><span><small>Screen</small><strong>{event.venue.auditorium}</strong></span><span><small>Format</small><strong>{event.format}</strong></span></div>
    </section>
  );
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
        <section className="content-card checkout-event"><div className="checkout-image"><PosterImage src={event.posterUrl || eventArtwork(event.type)} alt="" /><div /><span><small>{event.type}</small><strong>{event.title}</strong></span></div><div className="checkout-meta"><Meta label="Date & time" value={`${formatEventDate(event.date)} · ${event.time}`} /><Meta label="Venue" value={event.venue.name} /><Meta label="Selected seats" value={seats.join(", ")} /><Meta label="Tickets" value={String(seats.length)} /></div></section>
        <aside className="content-card checkout-summary"><p className="kicker">Booking summary</p><div className="summary-lines"><div><span>Tickets ({seats.length})</span><span>₹{total}</span></div><div><span>Convenience fee</span><span>₹0</span></div><div className="summary-total"><strong>Total</strong><strong>₹{total}</strong></div></div><div className="customer-box"><strong>Customer</strong>{customer ? <><span>{customer.name}</span><small>{customer.email}</small></> : <span>Log in to confirm this booking.</span>}</div><button type="button" disabled={working || remaining === 0 || !customer} onClick={onConfirm} className="button button-primary full-button">{working ? "Confirming…" : "Confirm booking"}</button><p className="summary-note">Your QR ticket is generated immediately after confirmation.</p></aside>
      </div>
    </div>
  );
}

function Confirmation({ event, confirmation }: { event: EventDetailDto; confirmation: BookingConfirmationDto }) {
  return (
    <section className="confirmation-card">
      <header className="confirmation-hero"><div className="confirmation-check">✓</div><p className="kicker">Cryptographic seat lease confirmed</p><h1>You’re all set. Booking confirmed!</h1><p>Reference <strong>{confirmation.ref}</strong> · {confirmation.emailDelivered ? "QR ticket delivered by email" : confirmation.emailMessage}</p></header>
      <div className="digital-pass">
        <article className="pass-details">
          <div className="pass-label"><span><i /> Live admission pass</span><small>{event.format} · {event.language}</small></div>
          <div className="pass-event"><PosterImage src={event.posterUrl || eventArtwork(event.type)} alt="" /><div><span>{event.genre}</span><h2>{event.title}</h2><p>⌖ {event.venue.name} · {event.venue.auditorium}</p><div className="pass-grid"><Meta label="Date" value={formatEventDate(event.date)} /><Meta label="Showtime" value={event.time} /><Meta label={`Seats (${confirmation.seats.length})`} value={confirmation.seats.join(", ")} /><Meta label="Total" value={`₹${confirmation.total}`} /></div></div></div>
          <div className="pass-integrity"><span>▣</span><div><small>Ticket integrity</small><strong>Reference-bound QR · verified booking</strong></div></div>
        </article>
        <aside className="pass-qr"><div className="pass-qr-top"><span><i /> Gate-ready ticket</span><small>LIVE</small></div><div className="qr-frame"><QrTicket reference={confirmation.ref} size={188} /></div><p>Scan at the venue entrance</p><code>{confirmation.ref}</code><a className="button button-primary full-button" href={`data:text/plain;charset=utf-8,${encodeURIComponent(`CineBook ticket ${confirmation.ref}\n${event.title}\n${confirmation.seats.join(", ")}`)}`} download={`${confirmation.ref}.txt`}>Download ticket details</a></aside>
      </div>
      <div className="confirmation-note"><span>▤</span><div><strong>Ticket saved in My Tickets</strong><p>Open it any time to show the booking reference and QR code.</p></div><div className="confirmation-actions"><Link to="/bookings" className="button button-primary">View my tickets</Link><Link to="/" className="button button-ghost">Explore more events</Link></div></div>
    </section>
  );
}

function Countdown({ remaining }: { remaining: number }) {
  const finalMinute = remaining > 0 && remaining <= 60_000;
  return <div className={`countdown ${finalMinute ? "countdown-urgent" : ""}`} aria-live={finalMinute ? "assertive" : "polite"}><small>{finalMinute ? "Final minute — complete booking" : "Hold expires in"}</small><strong>{formatRemaining(remaining)}</strong></div>;
}

function formatRemaining(remaining: number) {
  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.max(0, seconds % 60)).padStart(2, "0")}`;
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
