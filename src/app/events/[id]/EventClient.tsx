"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QrTicket } from "@/components/QrTicket";
import { SeatMap } from "@/components/SeatMap";
import { api, getToken } from "@/lib/client";
import { displaySeatLabel, eventArtwork, eventPresentation, formatEventDate } from "@/lib/presentation";

type ShowSeat = {
  seatId: string;
  status: string;
  heldByMe: boolean;
  seat: { label: string; row: number; col: number; categoryId: string; category: { name: string; color: string } };
};
type EventDetail = {
  id: string;
  title: string;
  type: "MOVIE" | "CONCERT";
  description?: string | null;
  date: string;
  time: string;
  venue: { name: string; categories: { id: string; name: string; color: string }[] };
  organiser: { name: string };
  prices: { categoryId: string; price: number; category: { name: string } }[];
};
type OfferInfo = { seatId: string | null; seatLabel: string | null; categoryName: string; expiresAt: string | null };
type WaitlistEntry = { id: string; position: number; status: string; category: { id: string; name: string } };
type View = "details" | "seats" | "checkout" | "confirmed";

export default function EventClient() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const offerToken = searchParams.get("offer");
  const [view, setView] = useState<View>("details");
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [showSeats, setShowSeats] = useState<ShowSeat[]>([]);
  const [layout, setLayout] = useState<{ rows: number; cols: number } | null>(null);
  const [availability, setAvailability] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [customer, setCustomer] = useState<{ name: string; email: string } | null>(null);
  const [offer, setOffer] = useState<OfferInfo | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [heldUntil, setHeldUntil] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ref: string; total: number; seats: string[]; emailDelivered: boolean; emailMessage: string } | null>(null);

  const loadSeats = useCallback(async () => {
    const data = await api<{ showSeats: ShowSeat[]; layout: { rows: number; cols: number }; availability: Record<string, number> }>(`/api/events/${id}/seats`);
    setShowSeats(data.showSeats);
    setLayout(data.layout);
    setAvailability(data.availability ?? {});
  }, [id]);

  const loadWaitlist = useCallback(async () => {
    if (!getToken()) return;
    const data = await api<{ entries: WaitlistEntry[] }>(`/api/events/${id}/waitlist`);
    setWaitlist(data.entries);
  }, [id]);

  useEffect(() => {
    api<{ event: EventDetail }>(`/api/events/${id}`)
      .then((data) => setEvent(data.event))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Event could not be loaded"));
    if (getToken()) {
      api<{ user: { name: string; email: string } }>("/api/auth/me")
        .then((data) => { setCustomer(data.user); return loadWaitlist(); })
        .catch(() => null);
    }
    loadSeats().catch((reason) => setError(reason instanceof Error ? reason.message : "Seats could not be loaded"));
    const poll = setInterval(() => loadSeats().catch(() => null), 3000);
    return () => clearInterval(poll);
  }, [id, loadSeats, loadWaitlist]);

  useEffect(() => {
    if (window.location.hash === "#seats") setView("seats");
  }, []);

  useEffect(() => {
    if (!offerToken) return;
    api<{ offer: OfferInfo; requiresLogin?: boolean }>(`/api/events/${id}/waitlist/offer?token=${offerToken}`)
      .then((data) => {
        setOffer(data.offer);
        setHeldUntil(data.offer.expiresAt);
        if (data.offer.seatId) setSelected([data.offer.seatId]);
        setView("seats");
        setMessage(data.requiresLogin ? "Log in to accept this waitlist offer." : `Your ${data.offer.categoryName} seat is ready. Complete booking before the timer ends.`);
      })
      .catch((reason) => setMessage(reason.message));
  }, [id, offerToken]);

  useEffect(() => {
    if (!heldUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [heldUntil]);

  const seatCells = useMemo(() => showSeats.map((showSeat) => ({
    seatId: showSeat.seatId,
    label: showSeat.seat.label,
    row: showSeat.seat.row,
    col: showSeat.seat.col,
    status: showSeat.status as "AVAILABLE" | "HELD" | "BOOKED",
    category: showSeat.seat.category,
    heldByMe: showSeat.heldByMe,
  })), [showSeats]);

  const selectedSeats = useMemo(() => selected.map((seatId) => seatCells.find((seat) => seat.seatId === seatId)).filter(Boolean) as typeof seatCells, [seatCells, selected]);
  const total = useMemo(() => selectedSeats.reduce((sum, seat) => sum + (event?.prices.find((price) => price.categoryId === showSeats.find((item) => item.seatId === seat.seatId)?.seat.categoryId)?.price ?? 0), 0), [event, selectedSeats, showSeats]);
  const remaining = heldUntil ? Math.max(0, new Date(heldUntil).getTime() - now) : 0;

  useEffect(() => {
    if (heldUntil && remaining === 0 && view === "checkout") {
      setHeldUntil(null);
      setSelected([]);
      setView("seats");
      setMessage("Your hold expired. The seats have returned to the live map.");
      loadSeats().catch(() => null);
    }
  }, [heldUntil, loadSeats, remaining, view]);

  if (error) return <div className="card mx-auto max-w-xl p-8 text-center"><p className="label">Unable to open event</p><h1 className="mt-3 text-2xl font-semibold">Something went wrong</h1><p className="mt-3 text-sm text-white/50">{error}</p><Link href="/" className="btn mt-6">Back to events</Link></div>;
  if (!event || !layout) return <EventSkeleton />;

  const meta = eventPresentation(event.type);

  if (view === "confirmed" && confirmation) {
    return <Confirmation event={event} confirmation={confirmation} />;
  }

  if (view === "checkout") {
    return (
      <Checkout
        event={event}
        customer={customer}
        seats={selectedSeats.map((seat) => displaySeatLabel(seat.row, seat.col))}
        total={total}
        remaining={remaining}
        working={working}
        onBack={() => setView("seats")}
        onConfirm={bookSeats}
      />
    );
  }

  return (
    <div className="space-y-8">
      <section className="relative min-h-[390px] overflow-hidden rounded-[28px] border border-white/10">
        <Image src={eventArtwork(event.type)} alt="" fill priority sizes="1280px" className={`object-cover ${event.type === "CONCERT" ? "object-[68%_center]" : "object-center"}`} />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(1,8,5,.98),rgba(1,8,5,.72)_48%,rgba(1,8,5,.2)),linear-gradient(0deg,rgba(1,8,5,.88),transparent_65%)]" />
        <div className="relative flex min-h-[390px] max-w-2xl flex-col justify-end p-6 sm:p-10">
          <div className="mb-auto flex flex-wrap gap-2"><span className="cinema-pill">{event.type === "MOVIE" ? "Now showing" : "Live"}</span><span className="rating-pill">★ {meta.rating}</span></div>
          <p className="label">{meta.genre}</p><h1 className="mt-3 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">{event.title}</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/60">{event.description || "A premium live experience with real-time seat selection and instant QR ticket confirmation."}</p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/50"><span>{formatEventDate(event.date)}</span><span>{event.time}</span><span>{meta.duration}</span><span>{meta.language}</span><span>{event.venue.name}</span></div>
          <div className="mt-7 flex flex-wrap gap-3"><button onClick={() => setView("seats")} className="btn btn-primary">Select seats →</button><span className="btn cursor-default">From ₹{Math.min(...event.prices.map((price) => price.price))}</span></div>
        </div>
      </section>

      {view === "details" ? (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
          <section className="card p-6 sm:p-8"><p className="section-kicker">About this show</p><h2 className="section-title">Event details</h2><p className="mt-5 leading-7 text-white/55">{event.description || `${event.organiser.name} presents ${event.title} at ${event.venue.name}. Choose from the available categories and reserve your exact seat on the interactive map.`}</p><div className="mt-7 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4"><Meta label="Genre" value={meta.genre}/><Meta label="Duration" value={meta.duration}/><Meta label="Language" value={meta.language}/><Meta label="Organiser" value={event.organiser.name}/></div></section>
          <section className="card p-6"><p className="section-kicker">Ticket categories</p><div className="mt-4 space-y-3">{event.prices.map((price) => <div key={price.categoryId} className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><span>{price.category.name}</span><span className="font-semibold text-emerald-300">₹{price.price}</span></div>)}</div><button onClick={() => setView("seats")} className="btn btn-primary mt-5 w-full">Choose seats</button></section>
        </div>
      ) : (
        <section id="seats" className="scroll-mt-24 space-y-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="section-kicker">Interactive seating</p><h2 className="section-title">Choose your seats</h2></div><p className="text-sm text-white/45">Live availability refreshes every 3 seconds</p></div>
          {message && <p className="message">{message}</p>}
          {offer && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4"><div><p className="font-semibold text-amber-100">Waitlist offer · {offer.categoryName}</p><p className="mt-1 text-xs text-amber-100/60">Reserved only for you while the timer is active.</p></div>{heldUntil && <Countdown remaining={remaining} />}</div>}
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <SeatMap rows={layout.rows} cols={layout.cols} seats={seatCells} selected={selected} onToggle={toggleSeat} />
            <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              <div className="card overflow-hidden"><div className="relative h-36"><Image src={eventArtwork(event.type)} alt="" fill sizes="320px" className={`object-cover ${event.type === "CONCERT" ? "object-[68%_center]" : ""}`}/><div className="absolute inset-0 bg-gradient-to-t from-[#08130e] to-transparent"/></div><div className="p-5"><p className="label">Your selection</p><h3 className="mt-2 text-lg font-semibold">{event.title}</h3><p className="mt-1 text-xs text-white/45">{formatEventDate(event.date)} · {event.time}</p><div className="my-5 border-t border-white/[0.07]"/>{selectedSeats.length ? <div className="space-y-3"><div className="flex flex-wrap gap-2">{selectedSeats.map((seat) => <span key={seat.seatId} className="rounded-lg bg-emerald-400 px-2.5 py-1 text-xs font-bold text-emerald-950">{displaySeatLabel(seat.row, seat.col)}</span>)}</div><div className="flex justify-between text-sm text-white/55"><span>{selectedSeats.length} ticket{selectedSeats.length === 1 ? "" : "s"}</span><strong className="text-lg text-white">₹{total}</strong></div></div> : <p className="text-sm leading-6 text-white/40">Select up to 10 available seats from the map.</p>}<button disabled={!selected.length || working} onClick={holdAndCheckout} className="btn btn-primary mt-5 w-full">{working ? "Securing seats…" : offer ? "Accept offer & continue" : "Hold & continue"}</button></div></div>
              <div className="card p-5"><p className="label">Pricing & waitlist</p><div className="mt-4 space-y-3">{event.prices.map((price) => { const left = availability[price.categoryId] ?? 0; const entry = waitlist.find((item) => item.category.id === price.categoryId && item.status !== "EXPIRED"); return <div key={price.categoryId} className="rounded-xl border border-white/[0.07] p-3"><div className="flex items-center justify-between text-sm"><span>{price.category.name}</span><span className="font-medium">₹{price.price}</span></div><div className="mt-2 flex items-center justify-between text-xs text-white/40"><span>{left ? `${left} available` : "Sold out"}</span>{entry ? <span className="text-emerald-300">{entry.status === "WAITING" ? `Position #${entry.position}` : entry.status}</span> : !left ? <button onClick={() => joinWaitlist(price.categoryId)} className="text-emerald-300 hover:text-emerald-200">Join waitlist</button> : null}</div></div>; })}</div></div>
            </aside>
          </div>
        </section>
      )}
    </div>
  );

  function toggleSeat(seatId: string, status: string) {
    if (heldUntil || status === "BOOKED") return;
    if (offer?.seatId && seatId !== offer.seatId) return;
    setSelected((current) => current.includes(seatId) ? current.filter((id) => id !== seatId) : current.length < 10 ? [...current, seatId] : current);
  }

  async function holdAndCheckout() {
    if (!getToken()) return router.push(`/login?next=${encodeURIComponent(`/events/${id}${offerToken ? `?offer=${offerToken}` : "#seats"}`)}`);
    setWorking(true);
    try {
      const result = await api<{ heldUntil: string }>(`/api/events/${id}/seats`, { method: "POST", body: JSON.stringify({ seatIds: selected, offerToken }) });
      setHeldUntil(result.heldUntil);
      setNow(Date.now());
      setView("checkout");
      await loadSeats();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Seats could not be held"); }
    finally { setWorking(false); }
  }

  async function bookSeats() {
    if (!customer) return router.push(`/login?next=${encodeURIComponent(`/events/${id}#seats`)}`);
    setWorking(true);
    try {
      const result = await api<{ booking: { ref: string; totalAmount: number }; email: { delivered: boolean; message: string } }>(`/api/events/${id}/book`, { method: "POST", body: JSON.stringify({ seatIds: selected, offerToken }) });
      setConfirmation({ ref: result.booking.ref, total: result.booking.totalAmount, seats: selectedSeats.map((seat) => displaySeatLabel(seat.row, seat.col)), emailDelivered: result.email.delivered, emailMessage: result.email.message });
      setSelected([]); setHeldUntil(null); setOffer(null); setView("confirmed");
      await loadSeats();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Booking could not be completed"); }
    finally { setWorking(false); }
  }

  async function joinWaitlist(categoryId: string) {
    if (!getToken()) return router.push(`/login?next=${encodeURIComponent(`/events/${id}#seats`)}`);
    try {
      const result = await api<{ entry: WaitlistEntry }>(`/api/events/${id}/waitlist`, { method: "POST", body: JSON.stringify({ categoryId }) });
      setMessage(`You joined the waitlist at position #${result.entry.position}. Offers are for one seat and expire automatically.`);
      await loadWaitlist();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Waitlist could not be joined"); }
  }
}

function Checkout({ event, customer, seats, total, remaining, working, onBack, onConfirm }: { event: EventDetail; customer: { name: string; email: string } | null; seats: string[]; total: number; remaining: number; working: boolean; onBack: () => void; onConfirm: () => void }) {
  return <div className="mx-auto max-w-5xl space-y-6"><button onClick={onBack} className="btn">← Back to seats</button><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="section-kicker">Secure checkout</p><h1 className="section-title">Review your booking</h1></div><Countdown remaining={remaining}/></div><div className="grid gap-5 lg:grid-cols-[1fr_360px]"><section className="card overflow-hidden"><div className="relative h-56"><Image src={eventArtwork(event.type)} alt="" fill sizes="800px" className={`object-cover ${event.type === "CONCERT" ? "object-[68%_center]" : ""}`}/><div className="absolute inset-0 bg-gradient-to-t from-[#08130e] to-transparent"/><div className="absolute bottom-5 left-5"><p className="label">{event.type}</p><h2 className="mt-2 text-2xl font-bold">{event.title}</h2></div></div><div className="grid gap-5 p-6 sm:grid-cols-2"><Meta label="Date & time" value={`${formatEventDate(event.date)} · ${event.time}`}/><Meta label="Venue" value={event.venue.name}/><Meta label="Selected seats" value={seats.join(", ")}/><Meta label="Tickets" value={String(seats.length)}/></div></section><aside className="card p-6"><p className="section-kicker">Payment summary</p><div className="mt-5 space-y-4 text-sm"><div className="flex justify-between text-white/55"><span>Tickets ({seats.length})</span><span>₹{total}</span></div><div className="flex justify-between text-white/55"><span>Convenience fee</span><span>₹0</span></div><div className="border-t border-white/10 pt-4"><div className="flex items-end justify-between"><span className="font-semibold">Total</span><strong className="text-2xl">₹{total}</strong></div></div></div><div className="mt-6 rounded-2xl bg-white/[0.04] p-4 text-sm"><p className="font-medium">Customer</p>{customer ? <><p className="mt-2 text-white/55">{customer.name}</p><p className="mt-1 break-all text-xs text-white/40">{customer.email}</p></> : <p className="mt-2 text-white/45">Log in to confirm this booking.</p>}</div><button disabled={working || remaining === 0 || !customer} onClick={onConfirm} className="btn btn-primary mt-6 w-full">{working ? "Confirming…" : "Confirm booking"}</button><p className="mt-3 text-center text-[11px] leading-5 text-white/35">Your QR ticket will be generated immediately and emailed after confirmation.</p></aside></div></div>;
}

function Confirmation({ event, confirmation }: { event: EventDetail; confirmation: { ref: string; total: number; seats: string[]; emailDelivered: boolean; emailMessage: string } }) {
  return <div className="mx-auto max-w-4xl"><section className="relative overflow-hidden rounded-[28px] border border-emerald-300/20 bg-[radial-gradient(circle_at_top,rgba(16,185,129,.16),transparent_45%),#06100b] p-6 text-center shadow-2xl sm:p-10"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-400 text-3xl font-bold text-emerald-950 shadow-xl shadow-emerald-500/20">✓</div><p className="section-kicker mt-7">Payment successful</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Booking confirmed</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-white/50">{confirmation.emailDelivered ? "Your QR ticket has also been delivered to your email." : confirmation.emailMessage}</p><div className="mx-auto mt-8 grid max-w-2xl overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] text-left sm:grid-cols-[210px_1fr]"><div className="grid place-items-center border-b border-white/10 bg-white p-5 sm:border-b-0 sm:border-r"><QrTicket reference={confirmation.ref} size={166}/></div><div className="space-y-4 p-6"><div><p className="label">Booking reference</p><p className="mt-1 font-mono text-xl font-bold tracking-wider">{confirmation.ref}</p></div><div><p className="text-lg font-semibold">{event.title}</p><p className="mt-1 text-sm text-white/45">{formatEventDate(event.date)} · {event.time}</p><p className="mt-1 text-sm text-white/45">{event.venue.name}</p></div><div className="grid grid-cols-2 gap-4 border-t border-dashed border-white/15 pt-4"><Meta label="Seats" value={confirmation.seats.join(", ")}/><Meta label="Total" value={`₹${confirmation.total}`}/></div></div></div><div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/bookings" className="btn btn-primary">View my bookings</Link><Link href="/" className="btn">Explore more shows</Link></div></section></div>;
}

function Countdown({ remaining }: { remaining: number }) { const seconds = Math.ceil(remaining / 1000); const minutes = Math.floor(seconds / 60); return <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-center"><p className="text-[10px] uppercase tracking-wider text-amber-100/55">Hold expires in</p><p className="mt-0.5 font-mono text-lg font-bold text-amber-100">{String(minutes).padStart(2, "0")}:{String(Math.max(0, seconds % 60)).padStart(2, "0")}</p></div>; }
function Meta({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</p><p className="mt-1.5 text-sm font-medium text-white/80">{value}</p></div>; }
function EventSkeleton() { return <div className="space-y-6"><div className="skeleton min-h-[390px] rounded-[28px]"/><div className="grid gap-5 md:grid-cols-2"><div className="skeleton h-56 rounded-[20px]"/><div className="skeleton h-56 rounded-[20px]"/></div></div>; }
