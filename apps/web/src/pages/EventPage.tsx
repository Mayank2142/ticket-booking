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
import type { SeatCell } from "../components/SeatMap";
import { api, apiUrl } from "../lib/api";
import { displaySeatLabel } from "../lib/presentation";
import { EventDetailsState, EventDetailsView } from "./EventDetailsView";
import { SeatSelectionView } from "./SeatSelectionView";
import { BookingConfirmationView, CheckoutReviewView } from "./BookingCheckoutView";

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

  if (error) return view === "details" ? <EventDetailsState error={error} /> : <StatusPanel title="Unable to open event" detail={error} />;
  if (!event || !layout) return view === "details" ? <EventDetailsState /> : <EventSkeleton />;

  if (view === "confirmed" && confirmation) return <BookingConfirmationView event={event} confirmation={confirmation} customer={user} />;
  if (view === "checkout") {
    return <CheckoutReviewView event={event} customer={user} seats={selectedSeats.map((seat) => displaySeatLabel(seat.row, seat.col))} total={total} remaining={remaining} working={working} notice={notice} countdown={<Countdown remaining={remaining} />} onBack={() => setView("seats")} onConfirm={bookSeats} />;
  }

  if (view === "details") return <EventDetailsView event={event} availableSeats={showSeats.filter((seat) => seat.status === "AVAILABLE").length} realtimeStatus={realtimeStatus} canFavourite={user?.role === "CUSTOMER"} notice={notice} onSelectSeats={showSeatSelection} onFavourite={toggleFavourite} />;

  return (
    <SeatSelectionView
      event={event}
      layout={layout}
      seatCells={seatCells}
      showSeats={showSeats}
      selected={selected}
      selectedSeats={selectedSeats}
      total={total}
      availability={availability}
      waitlist={waitlist}
      realtimeStatus={realtimeStatus}
      notice={notice}
      offer={offer}
      heldUntil={heldUntil}
      holdLabel={formatRemaining(remaining)}
      finalMinute={remaining > 0 && remaining <= 60_000}
      offerCountdown={offer && heldUntil ? <Countdown remaining={remaining} /> : null}
      working={working}
      onToggle={toggleSeat}
      onContinue={holdAndCheckout}
      onJoinWaitlist={joinWaitlist}
    />
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



function Countdown({ remaining }: { remaining: number }) {
  const finalMinute = remaining > 0 && remaining <= 60_000;
  return <div className={`countdown ${finalMinute ? "countdown-urgent" : ""}`} aria-live={finalMinute ? "assertive" : "polite"}><small>{finalMinute ? "Final minute — complete booking" : "Hold expires in"}</small><strong>{formatRemaining(remaining)}</strong></div>;
}

function formatRemaining(remaining: number) {
  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(Math.max(0, seconds % 60)).padStart(2, "0")}`;
}


function StatusPanel({ title, detail }: { title: string; detail: string }) {
  return <section className="status-card"><span>!</span><h1>{title}</h1><p>{detail}</p><Link to="/" className="button button-ghost">Back to events</Link></section>;
}

function EventSkeleton() {
  return <div className="event-page"><div className="event-page-skeleton large" /><div className="event-detail-grid"><div className="event-page-skeleton" /><div className="event-page-skeleton" /></div></div>;
}
