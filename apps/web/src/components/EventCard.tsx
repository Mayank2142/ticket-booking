import type { EventSummaryDto } from "@cinebook/shared";
import { Link } from "react-router-dom";
import { assetUrl } from "../lib/api";
import { formatEventDate, getStartingPrice } from "../lib/presentation";

export function EventCard({ event, onFavourite }: { event: EventSummaryDto; onFavourite?: (event: EventSummaryDto) => void }) {
  const image = event.posterUrl || (event.type === "MOVIE" ? "/images/portal-poster.png" : "/images/cinema-hero.png");
  return (
    <article className="event-card">
      {onFavourite && <button type="button" className={`favourite-button ${event.isFavourite ? "active" : ""}`} onClick={() => onFavourite(event)} aria-label={event.isFavourite ? `Remove ${event.title} from favourites` : `Add ${event.title} to favourites`} aria-pressed={event.isFavourite}>{event.isFavourite ? "♥" : "♡"}</button>}
      <Link to={`/events/${event.id}`} aria-label={`View ${event.title}`}>
        <div className="poster-wrap">
          <img src={assetUrl(image)} alt="" className="poster" />
          <div className="poster-shade" />
          <span className="event-badge">{event.type === "MOVIE" ? "Movie" : "Live"}</span>
          <span className="price-badge">From ₹{getStartingPrice(event.prices)}</span>
        </div>
        <div className="event-card-body">
          <h3>{event.title}</h3>
          <p>{event.language} · {event.format} · {event.genre}</p>
          <p>{event.venue.city} · {event.venue.name}</p>
          <p>{formatEventDate(event.date)} · {event.time}</p>
        </div>
      </Link>
    </article>
  );
}
