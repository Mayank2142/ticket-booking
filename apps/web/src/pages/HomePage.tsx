import type { EventSummaryDto } from "@cinebook/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PosterImage } from "../components/PosterImage";
import { Badge, Button, ButtonLink, Card, Input, MapPinIcon, Select } from "../components/ui";
import { api } from "../lib/api";
import { formatEventDate, getStartingPrice } from "../lib/presentation";
import "./HomePage.css";

const movieOrder = ["Dune: Part Two", "Oppenheimer: 70mm", "Kalki 2898 AD", "Interstellar: 10th Anniversary"];
const concertOrder = ["Coldplay: Music of the Spheres", "A.R. Rahman: Symphony Live", "Diljit Dosanjh: Dil-Luminati Tour"];

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<EventSummaryDto[]>([]);
  const [trending, setTrending] = useState<EventSummaryDto[]>([]);
  const [recommendations, setRecommendations] = useState<EventSummaryDto[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<EventSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("ALL");
  const [date, setDate] = useState("");
  const [language, setLanguage] = useState("ALL");
  const [format, setFormat] = useState("ALL");
  const [alertEmail, setAlertEmail] = useState("");
  const [alertNotice, setAlertNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<{ events: EventSummaryDto[] }>("/api/events?pageSize=48", { signal: controller.signal })
      .then((catalogue) => setEvents(catalogue.events))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Events could not be loaded");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [user?.id]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ events: EventSummaryDto[] }>("/api/events?upcoming=true&sort=trending&pageSize=4", { signal: controller.signal }).then((result) => setTrending(result.events)),
      api<{ recommendations: EventSummaryDto[] }>("/api/recommendations", { signal: controller.signal }).then((result) => setRecommendations(result.recommendations)),
      user?.role === "CUSTOMER" ? api<{ events: EventSummaryDto[] }>("/api/recently-viewed", { signal: controller.signal }).then((result) => setRecentlyViewed(result.events)) : Promise.resolve(),
    ]).catch(() => null);
    return () => controller.abort();
  }, [user?.id, user?.role]);

  useEffect(() => {
    setCity(searchParams.get("city") || "ALL");
    setQuery(searchParams.get("q") || "");
    setDate(searchParams.get("date") || "");
    setLanguage(searchParams.get("language") || "ALL");
    setFormat(searchParams.get("format") || "ALL");
  }, [searchParams]);

  const cities = useMemo(() => Array.from(new Set(events.map((event) => event.venue.city))).sort(), [events]);
  const languages = useMemo(() => Array.from(new Set(events.map((event) => event.language))).sort(), [events]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesCity = city === "ALL" || event.venue.city === city;
      const matchesLanguage = language === "ALL" || event.language === language;
      const matchesFormat = format === "ALL" || event.format.toLowerCase().includes(format.toLowerCase());
      const matchesDate = !date || event.date === date;
      const matchesQuery = !normalizedQuery || `${event.title} ${event.venue.name} ${event.genre}`.toLowerCase().includes(normalizedQuery);
      return matchesCity && matchesLanguage && matchesFormat && matchesDate && matchesQuery;
    });
  }, [city, date, events, format, language, query]);

  const movies = orderEvents(filtered.filter((event) => event.type === "MOVIE"), movieOrder);
  const concerts = orderEvents(filtered.filter((event) => event.type === "CONCERT"), concertOrder);
  const today = new Date().toISOString().slice(0, 10);
  const upcomingMovies = events.filter((event) => event.type === "MOVIE" && event.date > today).slice(0, 4);
  const dune = events.find((event) => event.title === "Dune: Part Two") ?? movies[0];

  return (
    <div className="home-page">
      <section className="home-feature" aria-labelledby="hero-title">
        <div className="home-feature__content">
          <div className="home-feature__badges">
            <Badge tone="primary">Featured movie</Badge>
            {dune && <><Badge className="home-format-badge">{dune.format}</Badge>{dune.certificate && <Badge>{dune.certificate}</Badge>}<span className="home-feature__language">{dune.language}</span></>}
          </div>
          <p className="home-eyebrow">{dune ? "Now in theatres · Premium cinema" : "Movies & live entertainment"}</p>
          <h1 id="hero-title">{dune?.title ?? "Book your moment."}</h1>
          <p className="home-feature__description">{dune?.description || "Discover movies and live entertainment. Choose exact seats from a map that updates in real time."}</p>
          {dune && <div className="home-feature__shows"><p>Scheduled shows{city !== "ALL" ? ` in ${city}` : " across our venues"}</p><div>{events.filter((event) => event.title === dune.title && (city === "ALL" || event.venue.city === city)).slice(0, 3).map((show) => <Link to={`/events/${show.id}`} key={show.id}>{show.time} <span>({show.venue.name})</span></Link>)}</div></div>}
          <div className="home-feature__actions">
            {dune ? <ButtonLink to={`/events/${dune.id}`} aria-label={`View ${dune.title}`}>Book tickets · From ₹{getStartingPrice(dune.prices).toLocaleString("en-IN")} <span aria-hidden="true">→</span></ButtonLink> : <ButtonLink to="/movies">Explore movies →</ButtonLink>}
            <ButtonLink variant="secondary" to="/movies">Explore movies</ButtonLink>
            <span className="home-feature__assurance"><HomeIcon name="shield" /> Secure seat holds</span>
          </div>
        </div>
        <div className="home-feature__art"><PosterImage src={dune?.title === "Dune: Part Two" ? "/images/stitch/hero-dune.jpg" : dune?.posterUrl || "/images/stitch/hero-dune.jpg"} alt="" loading="eager" /><Badge className="home-feature__art-label">{dune?.format ?? "Your next show"}</Badge></div>
      </section>

      <nav className="home-categories" aria-label="Browse entertainment">
        <Link to="/movies"><span className="home-category-icon"><HomeIcon name="film" /></span><span><strong>Movies</strong><small>Now in theatres</small></span><span aria-hidden="true">→</span></Link>
        <Link to="/live-events"><span className="home-category-icon"><HomeIcon name="ticket" /></span><span><strong>Live concerts</strong><small>Stadiums & arenas</small></span><span aria-hidden="true">→</span></Link>
        <button type="button" aria-pressed={format === "IMAX 70MM"} onClick={() => setDiscoveryFilter("format", format === "IMAX 70MM" ? "ALL" : "IMAX 70MM")}><span className="home-category-icon"><HomeIcon name="screen" /></span><span><strong>IMAX specials</strong><small>70mm & large format</small></span></button>
        <button type="button" aria-pressed={format === "Dolby Atmos"} onClick={() => setDiscoveryFilter("format", format === "Dolby Atmos" ? "ALL" : "Dolby Atmos")}><span className="home-category-icon"><HomeIcon name="audio" /></span><span><strong>Dolby Atmos</strong><small>Immersive cinema sound</small></span></button>
      </nav>

      <Card className="home-discovery" compact>
        <div className="home-discovery__grid" id="discover">
          <label className="home-control home-control--search"><span>Find your next show</span><div><HomeIcon name="search" /><Input aria-label="Search shows" value={query} onChange={(event) => setDiscoveryFilter("q", event.target.value)} placeholder="Search films, artists or venues…" /></div></label>
          <label className="home-control"><span>City</span><Select aria-label="City" value={city} onChange={(event) => setDiscoveryFilter("city", event.target.value)}><option value="ALL">All cities</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</Select></label>
          <label className="home-control"><span>Date</span><Input aria-label="Event date" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDiscoveryFilter("date", event.target.value)} /></label>
          <Button onClick={scrollToResults}>Find shows <span aria-hidden="true">→</span></Button>
        </div>
        <div className="home-discovery__filters"><span>Explore by format</span>{["IMAX 70MM", "Dolby Atmos", "Stadium Live"].map((item) => <button type="button" aria-pressed={format === item} className={format === item ? "active" : ""} key={item} onClick={() => setDiscoveryFilter("format", format === item ? "ALL" : item)}>{item}</button>)}<Select aria-label="Language" value={language} onChange={(event) => setDiscoveryFilter("language", event.target.value)}><option value="ALL">All languages</option>{languages.map((item) => <option key={item} value={item}>{item}</option>)}</Select></div>
      </Card>

      {error ? <StatusCard title="Couldn’t load events" detail={error} /> : loading ? <LoadingShowcase /> : (
        <>
          <section className="home-section" id="movies" aria-labelledby="home-movies-title">
            <div className="home-section__heading"><div><p className="home-eyebrow">Laser & optical showtimes</p><h2 id="home-movies-title">Now Showing in Theatres</h2><p className="home-section__description"><MapPinIcon />{city === "ALL" ? "Find your favourite film across our cities" : `${city} · Movies near you`}</p></div><Link className="home-section__link" to="/movies">View all movies <span aria-hidden="true">→</span></Link></div>
            {movies.length ? <div className="home-movie-grid">{movies.map((event) => <HomeEventCard event={event} key={event.id} onFavourite={user?.role === "CUSTOMER" ? toggleFavourite : undefined} />)}</div> : <StatusCard title="No movies match these filters" detail="Clear a filter or choose another city." />}
          </section>

          <ConcertShowcase events={concerts} onFavourite={user?.role === "CUSTOMER" ? toggleFavourite : undefined} />

          <DiscoveryRail title="Trending now" kicker="Recent confirmed bookings" events={trending} />
          <DiscoveryRail title="Upcoming releases" kicker="Coming next to CineBook" events={upcomingMovies} />
          {recommendations.length > 0 && <DiscoveryRail title="Recommended for you" kicker={user ? "Based on your favourites and tickets" : "Popular across CineBook"} events={recommendations} />}
          {recentlyViewed.length > 0 && <DiscoveryRail title="Recently viewed" kicker="Continue where you left off" events={recentlyViewed} />}

          <VenueShowcase events={filtered} city={city} />

          <section className="home-reservations" aria-labelledby="sightline-title">
            <div><Badge tone="primary">Book with confidence</Badge><h2 id="sightline-title">Your seats. Your moment.<br />Reserved securely.</h2><p>Choose your view before you book. Explore the auditorium layout and live availability, then review your seats with a secure reservation hold.</p><div className="home-reservations__benefits"><div><HomeIcon name="shield" /><strong>Secure holds</strong><span>Time to review your selection.</span></div><div><HomeIcon name="ticket" /><strong>Instant QR tickets</strong><span>Your confirmed booking in one place.</span></div><div><HomeIcon name="screen" /><strong>Exact seat selection</strong><span>See rows, categories and prices.</span></div></div></div>
            <Card className="home-seat-preview"><div className="home-seat-preview__header"><strong>Find your view</strong><Badge>Seat map preview</Badge></div><div className="home-seat-preview__screen" /><small>All eyes this way</small><div className="home-seat-preview__grid" aria-hidden="true">{Array.from({ length: 35 }, (_, index) => <span className={index === 17 || index === 18 ? "selected" : index % 11 === 0 ? "booked" : ""} key={index}>{index === 17 ? "F11" : index === 18 ? "F12" : ""}</span>)}</div><p>Illustrative layout · Open a show for live seats</p>{dune && <ButtonLink to={`/events/${dune.id}#seats`} fullWidth>Explore the seat map <span aria-hidden="true">→</span></ButtonLink>}</Card>
          </section>

          <Card as="section" className="home-alerts" aria-labelledby="alerts-title"><div><p className="home-eyebrow">Stay in the loop</p><h2 id="alerts-title">Be first to hear about your next night out.</h2><p>Get email alerts for high-demand movies and live events.</p></div><form onSubmit={activateAlerts}><label><span className="sr-only">Email for event alerts</span><Input type="email" required value={alertEmail} onChange={(event) => setAlertEmail(event.target.value)} placeholder="you@example.com" /></label><Button type="submit">Activate alerts</Button></form>{alertNotice && <p className="home-alerts__notice" role="status">{alertNotice}</p>}</Card>

          {!filtered.length && <StatusCard title="No shows found" detail="Try another title, venue, category, or format." />}
        </>
      )}
    </div>
  );

  function scrollToResults() {
    const params = new URLSearchParams(searchParams);
    for (const key of ["city", "language", "format"]) if (params.get(key) === "ALL") params.delete(key);
    navigate(`/search${params.size ? `?${params}` : ""}`);
  }

  function setDiscoveryFilter(name: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "ALL") next.delete(name); else next.set(name, value);
    next.delete("page");
    setSearchParams(next, { replace: true });
  }

  async function activateAlerts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAlertNotice("Saving your email alert…");
    try {
      const result = await api<{ message: string }>("/api/alerts", { method: "POST", body: JSON.stringify({ email: alertEmail.trim() }) });
      window.localStorage.setItem("cinebook-alert-email", alertEmail.trim());
      setAlertNotice(result.message);
    } catch (reason) {
      setAlertNotice(reason instanceof Error ? reason.message : "Email alert could not be saved.");
    }
  }

  async function toggleFavourite(target: EventSummaryDto) {
    const favourite = !target.isFavourite;
    setEvents((items) => items.map((item) => item.contentId && item.contentId === target.contentId ? { ...item, isFavourite: favourite } : item));
    try {
      await api("/api/favourites", { method: "POST", body: JSON.stringify({ eventId: target.id, favourite }) });
    } catch (reason) {
      setEvents((items) => items.map((item) => item.contentId && item.contentId === target.contentId ? { ...item, isFavourite: !favourite } : item));
      setError(reason instanceof Error ? reason.message : "Favourite could not be updated");
    }
  }
}

function ConcertShowcase({ events, onFavourite }: { events: EventSummaryDto[]; onFavourite?: (event: EventSummaryDto) => void }) {
  const spotlight = events.find((event) => event.title === concertOrder[0]) ?? events[0];
  const supporting = events.filter((event) => event.id !== spotlight?.id).slice(0, 2);
  if (!spotlight) return null;
  return (
    <section className="home-section" id="live-events" aria-labelledby="home-concerts-title">
      <div className="home-section__heading"><div><p className="home-eyebrow home-eyebrow--info">Stadium & arena series</p><h2 id="home-concerts-title">Live Concerts &amp; Stadium Tours</h2><p className="home-section__description">Great music. Memorable nights. Your place in the crowd.</p></div><Link className="home-section__link" to="/live-events">View all live events <span aria-hidden="true">→</span></Link></div>
      <div className="home-concert-grid">
        <article className="home-concert-feature">
          <PosterImage src={spotlight.posterUrl || "/images/stitch/coldplay.jpg"} alt="" />
          <div className="home-concert-feature__shade" />
          <div className="home-concert-feature__badges"><Badge tone="primary">Live concert</Badge><Badge>{spotlight.format}</Badge></div>
          {onFavourite && <FavouriteButton event={spotlight} onFavourite={onFavourite} />}
          <div className="home-concert-feature__copy"><p><MapPinIcon />{spotlight.venue.name}, {spotlight.venue.city} · {formatEventDate(spotlight.date)}</p><h3>{spotlight.title}</h3><p>{spotlight.genre} · {spotlight.language} · {spotlight.venue.auditorium}</p><div className="home-concert-feature__actions"><span><small>Passes from</small><strong>₹{getStartingPrice(spotlight.prices).toLocaleString("en-IN")}</strong></span><ButtonLink to={`/events/${spotlight.id}`} aria-label={`View ${spotlight.title}`}>View event <span aria-hidden="true">→</span></ButtonLink></div></div>
        </article>
        <div className="home-concert-side">{supporting.map((event) => <Card as="article" className="home-concert-row" compact key={event.id}><PosterImage src={event.posterUrl || "/images/cinema-hero.png"} alt="" /><div><div className="home-concert-row__meta"><Badge className="home-format-badge">{event.format}</Badge><small>{formatEventDate(event.date)}</small></div><h3>{event.title}</h3><p>{event.venue.name}, {event.venue.city}</p><div className="home-concert-row__actions"><strong>From ₹{getStartingPrice(event.prices).toLocaleString("en-IN")}</strong><ButtonLink variant="secondary" size="small" to={`/events/${event.id}#seats`} aria-label={`Select seats for ${event.title}`}>Select seats</ButtonLink></div></div></Card>)}</div>
      </div>
    </section>
  );
}

function DiscoveryRail({ title, kicker, events }: { title: string; kicker: string; events: EventSummaryDto[] }) {
  if (!events.length) return null;
  return <section className="home-section"><div className="home-section__heading"><div><p className="home-eyebrow">{kicker}</p><h2>{title}</h2></div><Link className="home-section__link" to="/search">View all <span aria-hidden="true">→</span></Link></div><div className="home-movie-grid">{events.slice(0, 4).map((event) => <HomeEventCard event={event} key={`${title}-${event.id}`} />)}</div></section>;
}

function HomeEventCard({ event, onFavourite }: { event: EventSummaryDto; onFavourite?: (event: EventSummaryDto) => void }) {
  const hours = Math.floor(event.durationMinutes / 60);
  const minutes = event.durationMinutes % 60;
  return <Card as="article" className="home-event-card">
    <div className="home-event-card__poster"><Link to={`/events/${event.id}`} aria-label={`View ${event.title}`}><PosterImage src={event.posterUrl || (event.type === "MOVIE" ? "/images/portal-poster.png" : "/images/cinema-hero.png")} alt="" /><Badge className="home-format-badge">{event.format}</Badge></Link>{onFavourite && <FavouriteButton event={event} onFavourite={onFavourite} />}</div>
    <div className="home-event-card__body"><div className="home-event-card__schedule"><HomeIcon name="calendar" /><span>{formatEventDate(event.date)} · {event.time}</span></div><h3><Link to={`/events/${event.id}`}>{event.title}</Link></h3><p>{event.genre} · {hours}h {minutes ? `${minutes}m · ` : "· "}{event.language}</p><div className="home-event-card__venue"><span>{event.venue.name}</span>{event.certificate && <Badge>{event.certificate}</Badge>}</div><div className="home-event-card__footer"><span><small>Starting from</small><strong>₹{getStartingPrice(event.prices).toLocaleString("en-IN")}</strong></span><ButtonLink to={`/events/${event.id}`} size="small">Book now</ButtonLink></div></div>
  </Card>;
}

function FavouriteButton({ event, onFavourite }: { event: EventSummaryDto; onFavourite: (event: EventSummaryDto) => void }) {
  return <button type="button" className={`home-favourite ${event.isFavourite ? "active" : ""}`} onClick={() => onFavourite(event)} aria-label={event.isFavourite ? `Remove ${event.title} from favourites` : `Add ${event.title} to favourites`} aria-pressed={event.isFavourite}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" /></svg></button>;
}

function VenueShowcase({ events, city }: { events: EventSummaryDto[]; city: string }) {
  const venues = Array.from(new Map(events.filter((event) => event.type === "MOVIE").map((event) => [`${event.venue.name}:${event.venue.city}`, event.venue])).values()).slice(0, 3);
  if (!venues.length) return null;
  return <section className="home-section home-venues"><div className="home-section__heading"><div><p className="home-eyebrow">Find your cinema</p><h2>{city === "ALL" ? "Explore Our Cinema Venues" : `Cinema Venues in ${city}`}</h2><p className="home-section__description">Browse scheduled shows, formats and auditoriums near you.</p></div></div><div className="home-venue-grid">{venues.map((venue) => {
    const shows = events.filter((event) => event.venue.name === venue.name && event.venue.city === venue.city);
    const formats = Array.from(new Set(shows.flatMap((event) => event.formats.length ? event.formats : [event.format])));
    return <Card as="article" className="home-venue-card" compact key={`${venue.name}:${venue.city}`}><div className="home-venue-card__top"><Badge>{venue.city}</Badge><MapPinIcon /></div><h3>{venue.name}</h3><p>{venue.auditorium}</p><div className="home-venue-card__formats"><small>Available formats</small><div>{formats.map((item) => <Badge key={item}>{item}</Badge>)}</div></div><div className="home-venue-card__footer"><span>{shows.length} scheduled {shows.length === 1 ? "show" : "shows"}</span><ButtonLink variant="secondary" size="small" to={`/search?${new URLSearchParams({ q: venue.name, city: venue.city })}`}>Explore shows</ButtonLink></div></Card>;
  })}</div></section>;
}

function HomeIcon({ name }: { name: "film" | "ticket" | "screen" | "audio" | "search" | "calendar" | "shield" }) {
  const paths = {
    film: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
    ticket: <><path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Z" /><path d="M15 7v2M15 11v2M15 15v2" /></>,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    audio: <><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="3" y="12" width="4" height="8" rx="2" /><rect x="17" y="12" width="4" height="8" rx="2" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 11h16" /></>,
    shield: <><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function orderEvents(events: EventSummaryDto[], order: string[]) {
  return [...events].sort((left, right) => {
    const leftIndex = order.indexOf(left.title);
    const rightIndex = order.indexOf(right.title);
    return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
  });
}

function LoadingShowcase() {
  return <section className="home-section" aria-label="Loading events" role="status"><div className="home-movie-grid">{Array.from({ length: 4 }, (_, index) => <div className="home-skeleton" key={index}><div /><span /><span /></div>)}</div></section>;
}

function StatusCard({ title, detail }: { title: string; detail: string }) {
  return <Card as="section" className="home-status" role="status"><HomeIcon name="search" /><h2>{title}</h2><p>{detail}</p></Card>;
}
