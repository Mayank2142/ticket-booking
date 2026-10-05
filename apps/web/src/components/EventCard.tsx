import type { EventSummaryDto } from "@cinebook/shared";
import { Link } from "react-router-dom";
import { formatEventDate, getStartingPrice } from "../lib/presentation";
import { PosterImage } from "./PosterImage";

export function EventCard({ event, onFavourite, compact = false }: { event: EventSummaryDto; onFavourite?: (event: EventSummaryDto) => void; compact?: boolean }) {
  const image = event.posterUrl || (event.type === "MOVIE" ? "/images/portal-poster.png" : "/images/cinema-hero.png");
  return (
    <article className={`event-card ${compact ? "event-card-compact" : ""}`}>
      {onFavourite && <button type="button" className={`favourite-button ${event.isFavourite ? "active" : ""}`} onClick={() => onFavourite(event)} aria-label={event.isFavourite ? `Remove ${event.title} from favourites` : `Add ${event.title} to favourites`} aria-pressed={event.isFavourite}>{event.isFavourite ? "♥" : "♡"}</button>}
      <Link to={`/events/${event.id}`} aria-label={`View ${event.title}`}>
        <div className="poster-wrap">
          <PosterImage src={image} alt="" className="poster" />
          <div className="poster-shade" />
          <span className="event-badge">{event.type === "MOVIE" ? event.format : "Live"}</span>
          <span className="price-badge">From ₹{getStartingPrice(event.prices)}</span>
        </div>
        <div className="event-card-body">
          <span className="card-spec">{event.type === "MOVIE" ? `${event.genre} · ${event.language}` : `${event.venue.city} · ${event.language}`}</span>
          <h3>{event.title}</h3>
          <p>{event.venue.name}</p>
          <div className="card-footer"><span>{formatEventDate(event.date)} · {event.time}</span><b>Select seats →</b></div>
        </div>
      </Link>
    </article>
  );
}
