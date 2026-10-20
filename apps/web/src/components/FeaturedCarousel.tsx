import type { EventSummaryDto } from "@cinebook/shared";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PosterImage } from "./PosterImage";
import { Badge, Button, ButtonLink } from "./ui";
import { eventHeroArtwork, formatEventDate, getStartingPrice } from "../lib/presentation";
import { featuredShows, nextFeaturedIndex } from "../lib/featured-shows";

export function FeaturedCarousel({ events, city }: { events: EventSummaryDto[]; city: string }) {
  const slides = useMemo(() => featuredShows(events), [events]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const index = Math.max(0, slides.findIndex((event) => event.id === selectedId));
  const featured = slides[index];
  const multiple = slides.length > 1;
  const movie = featured?.type === "MOVIE";
  const shows = featured ? events.filter((event) => event.type === featured.type && (featured.contentId ? event.contentId === featured.contentId : event.title === featured.title)) : [];
  const browsePath = featured && !movie ? "/live-events" : "/movies";
  const artwork = featured ? eventHeroArtwork(featured) : "/images/cinema-hero.png";
  // Frame the artwork inside the legacy catalogue images, excluding their embedded app chrome.
  const artworkFrame = artwork.endsWith("/stitch/oppenheimer.jpg") ? "oppenheimer"
    : artwork.endsWith("/stitch/interstellar.jpg") ? "interstellar"
      : artwork.endsWith("/stitch/coldplay.jpg") ? "coldplay"
        : artwork.endsWith("/stitch/diljit.jpg") ? "diljit" : "poster";

  function move(direction: -1 | 1) {
    if (multiple) setSelectedId(slides[nextFeaturedIndex(index, direction, slides.length)].id);
  }

  return <section className="home-feature" aria-label="Featured movies and live events" aria-roledescription="carousel" tabIndex={multiple ? 0 : undefined} aria-describedby={multiple ? "home-feature-instructions" : undefined} onKeyDown={(event) => {
    if (!multiple || (event.target !== event.currentTarget && !(event.target instanceof Element && event.target.closest(".home-feature__arrow")))) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
  }}>
    <div className="home-feature__content" id="home-feature-content">
      <div className="home-feature__badges">
        <Badge tone="primary">{featured ? movie ? "Featured movie" : "Featured live event" : "Discover CineBook"}</Badge>
        {featured && <><Badge className="home-format-badge">{featured.format}</Badge>{featured.certificate && <Badge>{featured.certificate}</Badge>}<span className="home-feature__language">{featured.language}</span></>}
      </div>
      <p className="home-eyebrow">{featured ? movie ? "Now in theatres · Premium cinema" : "Live on stage · Unforgettable nights" : "Movies & live entertainment"}</p>
      <h1 id="hero-title">{featured?.title ?? "Book your moment."}</h1>
      <p className="home-feature__description">{featured?.description || "Discover movies and live entertainment. Choose exact seats from a map that updates in real time."}</p>
      {featured && <div className="home-feature__shows"><p>Scheduled shows{city !== "ALL" ? ` in ${city}` : " across our venues"}{(featured.availableDates?.length ?? 0) > 1 && ` · ${featured.availableDates!.length} available dates`}</p><div>{shows.slice(0, 3).map((show) => <Link to={`/events/${show.id}`} key={show.id}>{formatEventDate(show.date)} · {show.time} <span>({show.venue.name})</span></Link>)}</div></div>}
      <div className="home-feature__actions">
        {featured ? <ButtonLink to={`/events/${featured.id}`} aria-label={`View ${featured.title}`}>Book tickets{featured.prices.length > 0 && ` · From ₹${getStartingPrice(featured.prices).toLocaleString("en-IN")}`} <span aria-hidden="true">→</span></ButtonLink> : <ButtonLink to="/movies">Explore movies →</ButtonLink>}
        <ButtonLink variant="secondary" to={browsePath}>{featured && !movie ? "Explore live events" : "Explore movies"}</ButtonLink>
        <span className="home-feature__assurance"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" /><path d="m8 12 3 3 5-6" /></svg> Secure seat holds</span>
      </div>
    </div>
    <div className="home-feature__art">
      <div className={`home-feature__image home-feature__image--${artworkFrame}`}>
        <PosterImage key={featured?.id ?? "empty"} src={artwork} fallbackSrc="/images/cinema-hero.png" alt={featured ? `${featured.title} artwork` : ""} loading="eager" />
      </div>
      <Badge className="home-feature__art-label">{featured?.format ?? "Your next show"}</Badge>
      {multiple && <span className="home-feature__position" aria-hidden="true">{index + 1} / {slides.length}</span>}
    </div>
    {multiple && <>
      <p id="home-feature-instructions" className="sr-only">Use the previous and next buttons, or the left and right arrow keys, to browse featured movies and live events.</p>
      <Button className="home-feature__arrow home-feature__arrow--previous" variant="secondary" aria-label="Previous featured show" aria-controls="home-feature-content" onClick={() => move(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></Button>
      <Button className="home-feature__arrow home-feature__arrow--next" variant="secondary" aria-label="Next featured show" aria-controls="home-feature-content" onClick={() => move(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg></Button>
    </>}
    <p className="sr-only" aria-live="polite" aria-atomic="true">{featured ? `${featured.title}. Featured show ${index + 1} of ${slides.length}.` : "No featured shows match the current filters."}</p>
  </section>;
}
