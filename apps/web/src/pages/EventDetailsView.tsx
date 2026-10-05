import type { EventDetailDto } from "@cinebook/shared";
import { Link } from "react-router-dom";
import { PosterImage } from "../components/PosterImage";
import { Badge } from "../components/ui/Badge";
import { Button, ButtonLink } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { eventHeroArtwork, formatEventDate, getStartingPrice } from "../lib/presentation";
import "./EventDetails.css";

type Props = {
  event: EventDetailDto;
  availableSeats: number;
  realtimeStatus: "connecting" | "live" | "fallback";
  canFavourite: boolean;
  notice: string;
  onSelectSeats: () => void;
  onFavourite: () => void;
};

/** A presentation layer only; EventPage continues to own API, favourite and booking state. */
export function EventDetailsView({ event, availableSeats, realtimeStatus, canFavourite, notice, onSelectSeats, onFavourite }: Props) {
  const venues = new Map<string, EventDetailDto["showtimes"]>();
  for (const show of event.showtimes) {
    const key = JSON.stringify([show.venue.name, show.venue.city]);
    venues.set(key, [...(venues.get(key) ?? []), show]);
  }
  const dates = [...new Set(event.showtimes.map((show) => show.date))];
  const formats = [...new Set([event.format, ...event.formats].filter(Boolean))];
  return <div className="details-design">
    <div className="details-design__ribbon" aria-label="Current show availability"><span>{realtimeStatus === "live" ? "Live seating connected" : realtimeStatus === "connecting" ? "Connecting live seating…" : "Reconnecting · safety refresh active"}</span><span>{availableSeats} seats currently available</span><span>{event.venue.city}</span></div>
    <section className="details-design__hero" aria-labelledby="details-title">
      <PosterImage className="details-design__art" src={eventHeroArtwork(event)} alt="" loading="eager" />
      <div className="details-design__hero-layout"><div className="details-design__hero-copy">
        <div className="details-design__badges"><Badge tone="primary">{event.type === "MOVIE" ? "Movie" : "Live event"}</Badge>{event.certificate && <Badge>{event.certificate}</Badge>}{event.durationMinutes > 0 && <Badge>{event.durationMinutes} min</Badge>}</div>
        <h1 id="details-title">{event.title}</h1>
        {event.description && <p>{event.description}</p>}
        <ul className="details-design__hero-meta"><li>{event.genre}</li><li>{event.language} · {event.format}</li><li>{formatEventDate(event.date)} · {event.time}</li></ul>
        {canFavourite && <div className="details-design__save"><Button variant="secondary" size="small" onClick={onFavourite} aria-pressed={event.isFavourite}>{event.isFavourite ? "♥ Saved" : "♡ Save"}</Button>{event.isFavourite && <ButtonLink variant="secondary" size="small" to="/saved">View saved</ButtonLink>}</div>}
      </div><Card className="details-design__hero-price"><div><span>{event.prices.length ? "Prices from" : "Prices unavailable"}</span>{event.prices.length > 0 && <strong>₹{getStartingPrice(event.prices)}</strong>}</div><p>{event.venue.name} · {event.venue.city}<br />{event.venue.auditorium}</p><Button fullWidth onClick={onSelectSeats}>Select seats →</Button><a className="details-design__showtimes-link" href="#details-showtimes">Explore showtimes ↓</a></Card></div>
    </section>
    {notice && <Card className="details-design__notice" role="status">{notice}</Card>}
    <div className="details-design__overview">
      <Card as="section" className="details-design__about"><h2>{event.type === "MOVIE" ? "About the movie" : "About the event"}</h2><p>{event.description || `${event.organiser.name} presents ${event.title} at ${event.venue.name}.`}</p>
        <dl className="details-design__facts"><Detail label="Genre" value={event.genre} />{event.durationMinutes > 0 && <Detail label="Duration" value={`${event.durationMinutes} minutes`} />}<Detail label="Language" value={event.language} />{event.certificate && <Detail label="Certificate" value={event.certificate} />}{event.releaseDate && <Detail label="Release date" value={formatEventDate(event.releaseDate)} />}<Detail label="Organiser" value={event.organiser.name} /></dl>
        {(event.cast.length > 0 || event.crew.length > 0 || event.performers.length > 0) && <dl className="details-design__people">{event.cast.length > 0 && <Detail label="Cast" value={event.cast.join(", ")} />}{event.crew.length > 0 && <Detail label="Crew" value={event.crew.join(", ")} />}{event.performers.length > 0 && <Detail label="Performers" value={event.performers.join(", ")} />}</dl>}
        {event.trailerUrl && <a className="ui-button ui-button--secondary ui-button--small" href={event.trailerUrl} target="_blank" rel="noreferrer">Watch trailer ↗</a>}
      </Card>
      <Card as="section" className="details-design__specs"><h2>Show specifications</h2><dl><Detail label="Format" value={event.format} /><Detail label="Auditorium" value={event.venue.auditorium} /><Detail label="Available formats" value={formats.join(" · ")} />{event.ageRule && <Detail label="Age rule" value={event.ageRule} />}{event.entryRule && <Detail label="Entry rule" value={event.entryRule} />}</dl><div className="details-design__spec-note">Choose your exact seats on the live auditorium map.</div></Card>
    </div>
    <section id="details-showtimes" className="details-design__showtimes" aria-labelledby="details-showtimes-title">
      <header><div><p className="details-design__eyebrow">Select showtimes</p><h2 id="details-showtimes-title">Venues & show timings</h2></div><span>{event.showtimes.length} upcoming show{event.showtimes.length === 1 ? "" : "s"}</span></header>
      {dates.length > 0 && <nav className="details-design__dates" aria-label="Show dates">{dates.map((date) => <Link key={date} to={`/events/${event.showtimes.find((show) => show.date === date)!.id}`} aria-current={date === event.date ? "date" : undefined}><small>{new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(new Date(`${date}T00:00:00`))}</small><strong>{formatEventDate(date)}</strong></Link>)}</nav>}
      <div className="details-design__formats" aria-label="Content formats">{formats.map((format) => <Badge key={format} tone={format === event.format ? "primary" : "neutral"}>{format}</Badge>)}</div>
      {event.showtimes.length ? <div className="details-design__venues">{[...venues].map(([key, shows]) => <Card as="article" className="details-design__venue" key={key}><header><div><h3>{shows[0].venue.name}</h3><p>{shows[0].venue.city}</p></div><Badge>Showtimes</Badge></header><div className="details-design__times">{shows.map((show) => <Link className={show.id === event.id ? "is-current" : ""} aria-current={show.id === event.id ? "page" : undefined} key={show.id} to={`/events/${show.id}`} aria-label={`${show.time}, ${formatEventDate(show.date)}, ${show.venue.name}, ${show.venue.auditorium}, from ₹${show.startingPrice}`}><strong>{show.time}</strong><span>{show.venue.auditorium}</span><small>{formatEventDate(show.date)}</small><b>From ₹{show.startingPrice}</b></Link>)}</div></Card>)}</div> : <Card className="details-design__empty" role="status"><h3>No additional upcoming showtimes</h3><p>No upcoming shows are listed for this content. The selected show’s details are below.</p></Card>}
    </section>
    <div className="details-design__selected">
      <Card as="section" className="details-design__venue-detail"><p className="details-design__eyebrow">Selected venue</p><h2>{event.venue.name}</h2><p>{event.venue.address || event.venue.city}</p><dl className="details-design__facts"><Detail label="City" value={event.venue.city} /><Detail label="Auditorium" value={event.venue.auditorium} /><Detail label="Date & time" value={`${formatEventDate(event.date)} · ${event.time}`} /></dl></Card>
      <Card as="section" className="details-design__categories"><h2>Ticket categories</h2><dl>{event.prices.map((price) => <Detail key={price.categoryId} label={price.category.name} value={`₹${price.price}`} />)}</dl>{!event.prices.length && <p>No category prices are listed.</p>}<Button onClick={onSelectSeats} fullWidth>Choose seats</Button></Card>
    </div>
    <Card className="details-design__booking-bar"><div><strong>{event.title}</strong><span>{formatEventDate(event.date)} · {event.time} · {event.venue.name}</span></div>{event.prices.length > 0 && <span className="details-design__booking-price">From ₹{getStartingPrice(event.prices)}</span>}<Button onClick={onSelectSeats}>Choose seats →</Button></Card>
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

export function EventDetailsState({ error }: { error?: string }) {
  return <div className="details-design">{error ? <Card className="details-design__error" role="alert"><h1>Unable to open event</h1><p>{error}</p><ButtonLink to="/" variant="secondary">Back to events</ButtonLink></Card> : <div className="details-design__loading" role="status" aria-label="Loading event details"><p>Loading event details…</p><div /><div /></div>}</div>;
}
