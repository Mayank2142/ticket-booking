import type { EventDetailDto, ShowSeatDto, SeatStatus, WaitlistEntryDto, WaitlistOfferDto } from "@cinebook/shared";
import type { ReactNode } from "react";
import { SeatMap, type SeatCell } from "../components/SeatMap";
import { PosterImage } from "../components/PosterImage";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { displaySeatLabel, eventArtwork, formatEventDate } from "../lib/presentation";
import "./SeatSelection.css";

type SeatSelectionProps = {
  event: EventDetailDto;
  layout: { rows: number; cols: number };
  seatCells: SeatCell[];
  showSeats: ShowSeatDto[];
  selected: string[];
  selectedSeats: SeatCell[];
  total: number;
  availability: Record<string, number>;
  waitlist: WaitlistEntryDto[];
  realtimeStatus: "live" | "connecting" | "fallback";
  notice: string;
  offer: WaitlistOfferDto | null;
  heldUntil: string | null;
  holdLabel: string;
  finalMinute: boolean;
  offerCountdown: ReactNode;
  working: boolean;
  onToggle: (seatId: string, status: SeatStatus) => void;
  onContinue: () => void;
  onJoinWaitlist: (categoryId: string) => void;
};

/** Presentation only: EventPage remains the owner of inventory, selection and holds. */
export function SeatSelectionView({ event, layout, seatCells, showSeats, selected, selectedSeats, total, availability, waitlist, realtimeStatus, notice, offer, heldUntil, holdLabel, finalMinute, offerCountdown, working, onToggle, onContinue, onJoinWaitlist }: SeatSelectionProps) {
  const money = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
  const available = showSeats.filter((seat) => seat.status === "AVAILABLE").length;
  const streamLabel = realtimeStatus === "live" ? "Live seat updates connected" : realtimeStatus === "connecting" ? "Connecting live seat updates…" : "Reconnecting — safety refresh active";
  return (
    <div className="seat-selection-design">
      <div className="seat-selection-stream">
        <Badge tone={realtimeStatus === "live" ? "success" : "warning"}>{streamLabel}</Badge>
        <span>Protected seat holds</span>
        <span className={`seat-selection-timer ${finalMinute ? "is-urgent" : ""}`} role="status">{heldUntil ? `${finalMinute ? "Final minute — complete booking" : "Hold expires in"}: ${holdLabel}` : "Hold timer starts after continue"}</span>
      </div>

      <section className="seat-selection-show" aria-label={`${event.title} show information`}>
        <PosterImage src={event.posterUrl || eventArtwork(event.type)} alt="" />
        <div className="seat-selection-show-copy">
          <div className="seat-selection-tags"><Badge tone="primary">{event.format}</Badge><Badge>{event.language}</Badge>{event.certificate && <Badge>{event.certificate}</Badge>}<span>{event.durationMinutes} min</span></div>
          <h1>{event.title}</h1>
          <p>{event.venue.name} · {event.venue.auditorium} · {formatEventDate(event.date)} · {event.time}</p>
        </div>
        <dl className="seat-selection-show-specs"><div><dt>Auditorium</dt><dd>{event.venue.auditorium}</dd></div><div><dt>City</dt><dd>{event.venue.city}</dd></div><div><dt>Seat status</dt><dd className="seat-selection-open">{available} seats open</dd></div></dl>
      </section>

      <section id="seats" className="seat-selection-workspace" aria-labelledby="seat-selection-title">
        <div className="seat-selection-heading"><h2 id="seat-selection-title">Choose your seats</h2><p>Select up to 10 seats. Use arrow keys to move, Enter or Space to select.</p></div>
        {notice && <p className="seat-selection-notice" role="status">{notice}</p>}
        {offer && <Card className="seat-selection-offer"><div><Badge tone="warning">Exclusive waitlist allocation</Badge><h3>Your {offer.categoryName} seat is waiting.</h3><p>This seat is reserved only for you. Complete booking before the timer expires.</p></div>{offerCountdown}</Card>}
        <div className="seat-selection-columns">
          <div className="seat-selection-map-column">
            <p className="seat-selection-map-hint">Swipe or scroll the map horizontally to see every seat.</p>
            <SeatMap rows={layout.rows} cols={layout.cols} seats={seatCells} selected={selected} prices={Object.fromEntries(event.prices.map((price) => [price.category.name, price.price]))} onToggle={onToggle} />
            <div className="seat-selection-notes"><Card compact><strong>Keyboard friendly</strong><p>Arrow keys move between seats. Home and End move across a row.</p></Card><Card compact><strong>Live availability</strong><p>Inventory updates automatically. Your selection is secured when you continue.</p></Card><Card compact><strong>Accessible seating</strong><p>♿ marks wheelchair spaces. C marks companion seats, where provided.</p></Card></div>
          </div>
          <aside className="seat-selection-sidebar" aria-label="Ticket reservation">
            <Card className="seat-selection-reservation">
              <div className="seat-selection-reservation-top"><span>Ticket reservation</span><Badge tone="primary">{event.venue.auditorium}</Badge></div>
              <h3>{event.title}</h3><p className="seat-selection-format">{event.format} · {event.language}</p>
              <dl className="seat-selection-reservation-meta"><div><dt>Venue</dt><dd>{event.venue.name}</dd></div><div><dt>Showtime</dt><dd>{formatEventDate(event.date)} · {event.time}</dd></div></dl>
              <div className="seat-selection-active-heading"><h4>Selected seats</h4><span>{selectedSeats.length} ticket{selectedSeats.length === 1 ? "" : "s"}</span></div>
              {selectedSeats.length ? <ul className="seat-selection-chips">{selectedSeats.map((seat) => {
                const showSeat = showSeats.find((item) => item.seatId === seat.seatId);
                const price = event.prices.find((item) => item.categoryId === showSeat?.seat.categoryId)?.price ?? 0;
                return <li key={seat.seatId}><strong>{displaySeatLabel(seat.row, seat.col)}</strong><span>{seat.category.name}{seat.seatType === "WHEELCHAIR" ? " · Accessible" : seat.seatType === "COMPANION" ? " · Companion" : ""}</span><b>{money(price)}</b>{seat.viewLabel && <small>{seat.viewLabel}</small>}</li>;
              })}</ul> : <p className="seat-selection-empty">Choose an available seat on the map to get started.</p>}
              <div className="seat-selection-fare"><div><span>Base admission ({selectedSeats.length} seat{selectedSeats.length === 1 ? "" : "s"})</span><b>{money(total)}</b></div><div><span>Booking convenience fee</span><b>₹0</b></div><div><span>Integrated taxes</span><b>Included</b></div></div>
              <div className="seat-selection-total"><div><strong>Total amount</strong><small>Including all local taxes</small></div><b>{money(total)}</b></div>
              <p className={`seat-selection-hold-note ${finalMinute ? "is-urgent" : ""}`}>{heldUntil ? `Your seats are held — ${holdLabel} remaining.` : "Seats are not held until you continue to checkout."}</p>
              <Button fullWidth disabled={!selected.length || working} onClick={onContinue}>{working ? "Securing seats…" : offer ? "Accept offer & continue" : `Continue to checkout (${selected.length} seat${selected.length === 1 ? "" : "s"}) →`}</Button>
            </Card>
            <Card className="seat-selection-pricing"><h3>Pricing & waitlist</h3>{event.prices.map((price) => {
              const left = availability[price.categoryId] ?? 0;
              const entry = waitlist.find((item) => item.category.id === price.categoryId && item.status !== "EXPIRED");
              return <div className="seat-selection-price-row" key={price.categoryId}><div><strong>{price.category.name}</strong><b>{money(price.price)}</b></div><div><span>{left ? `${left} available` : "Sold out"}</span>{entry ? <strong>{entry.status === "WAITING" ? `Position #${entry.position}` : entry.status}</strong> : !left ? <Button variant="secondary" size="small" onClick={() => onJoinWaitlist(price.categoryId)}>Join waitlist</Button> : null}</div></div>;
            })}</Card>
          </aside>
        </div>
      </section>
    </div>
  );
}
