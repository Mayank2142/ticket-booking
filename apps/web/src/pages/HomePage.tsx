import type { EventSummaryDto } from "@cinebook/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { EventCard } from "../components/EventCard";
import { PosterImage } from "../components/PosterImage";
import { api } from "../lib/api";
import { formatEventDate, getStartingPrice } from "../lib/presentation";

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
    <>
      <section className="hero stitch-home-hero" aria-labelledby="hero-title">
        <PosterImage className="hero-image" src="/images/stitch/hero-dune.jpg" alt="" />
        <div className="hero-overlay" />
        <div className="hero-content stitch-hero-content">
          <h1 id="hero-title">Book your <span>moment.</span></h1>
          <p className="hero-copy">Discover movies, live events and unforgettable experiences powered by zero-conflict seat allocation. Choose exact seats from a map that updates in real time.</p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/movies">Explore movies <span>→</span></Link>
            <Link className="button button-ghost" to="/live-events"><span aria-hidden="true">◎</span> Browse live events</Link>
          </div>

          <div className="hero-search-panel" id="discover">
            <div className="hero-search-grid">
              <label className="search-field hero-search-input"><span aria-hidden="true">⌕</span><span className="sr-only">Search shows</span><input value={query} onChange={(event) => setDiscoveryFilter("q", event.target.value)} placeholder="Search films, artists, stadium tours…" /></label>
              <label className="hero-selector"><span aria-hidden="true">⌖</span><span><small>City / cluster</small><select aria-label="City" value={city} onChange={(event) => setDiscoveryFilter("city", event.target.value)}><option value="ALL">All cities · All hubs</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</select></span></label>
              <label className="hero-selector hero-date-selector"><span aria-hidden="true">▣</span><span><small>Schedule</small><input aria-label="Event date" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDiscoveryFilter("date", event.target.value)} /></span></label>
              <button type="button" className="find-slots-button" onClick={scrollToResults}><span>▤</span> Find slots <b>HOT</b></button>
            </div>
            <div className="instant-filters"><span>Instant filters:</span>{["IMAX 70MM", "Dolby Atmos", "Stadium Live"].map((item) => <button type="button" className={format === item ? "active" : ""} key={item} onClick={() => setDiscoveryFilter("format", format === item ? "ALL" : item)}>• {item}</button>)}<label><span className="sr-only">Language</span><select aria-label="Language" value={language} onChange={(event) => setDiscoveryFilter("language", event.target.value)}><option value="ALL">All languages</option>{languages.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
          </div>
        </div>
      </section>

      {error ? <StatusCard title="Couldn’t load events" detail={error} /> : loading ? <LoadingShowcase /> : (
        <>
          <section className="section movie-showcase" id="movies">
            <div className="section-heading movie-heading"><div><p className="movie-experience-label">Experience rigor with laser projection</p><h2>Now Showing in Theatres</h2><span>Top-tier auditoriums with verified formats and real-time seat inventory.</span></div><div className="carousel-controls" aria-hidden="true"><span>‹</span><span>›</span></div></div>
            {movies.length ? <div className="movie-showcase-grid">{movies.map((event) => <EventCard event={event} key={event.id} onFavourite={user?.role === "CUSTOMER" ? toggleFavourite : undefined} />)}</div> : <StatusCard title="No movies match these filters" detail="Clear a filter or choose another city." />}
          </section>

          <ConcertShowcase events={concerts} onFavourite={user?.role === "CUSTOMER" ? toggleFavourite : undefined} />

          <DiscoveryRail title="Trending now" kicker="Recent confirmed bookings" events={trending} />
          <DiscoveryRail title="Upcoming releases" kicker="Coming next to CineBook" events={upcomingMovies} />
          {recommendations.length > 0 && <DiscoveryRail title="Recommended for you" kicker={user ? "Based on your favourites and tickets" : "Popular across CineBook"} events={recommendations} />}
          {recentlyViewed.length > 0 && <DiscoveryRail title="Recently viewed" kicker="Continue where you left off" events={recentlyViewed} />}

          <section className="section sightline-section" aria-labelledby="sightline-title">
            <div className="sightline-copy"><p className="kicker">Cinematic optical engine</p><h2 id="sightline-title">Auditorium Sightline Simulation &amp; Audio Calibration</h2><p>Preview the screen direction, seating geometry, category boundaries and live availability before starting a hold.</p><div className="sightline-metrics"><span><small>Seat map fidelity</small><strong>Exact row &amp; column</strong><em>Venue layout synchronized</em></span><span><small>Inventory refresh</small><strong>Live event stream</strong><em>Automatic safety polling</em></span></div>{dune && <Link className="button button-primary" to={`/events/${dune.id}#seats`}>Launch seat visualizer →</Link>}</div>
            <div className="sightline-preview" aria-hidden="true"><div className="sightline-screen" /><small>Curved auditorium screen</small><div className="sightline-seat-grid">{Array.from({ length: 35 }, (_, index) => <i className={index === 17 || index === 18 ? "selected" : index % 11 === 0 ? "booked" : ""} key={index}>{index === 17 ? "F11" : index === 18 ? "F12" : ""}</i>)}</div><div><span>● Seats F11 &amp; F12 selected</span><b>Live preview</b></div></div>
          </section>

          <section className="early-access-card" aria-labelledby="alerts-title"><div><p className="kicker">Concurrency gate pre-access</p><h2 id="alerts-title">Get early drop alerts before public queues open.</h2><p>Save your email on this device for high-demand event reminders. You can remove it whenever you want.</p></div><form onSubmit={activateAlerts}><label><span className="sr-only">Email for event alerts</span><input type="email" required value={alertEmail} onChange={(event) => setAlertEmail(event.target.value)} placeholder="you@example.com" /></label><button className="button button-primary" type="submit">Activate alerts</button></form>{alertNotice && <p className="alert-notice" role="status">{alertNotice}</p>}</section>

          {!filtered.length && <StatusCard title="No shows found" detail="Try another title, venue, category, or format." />}
        </>
      )}
    </>
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
    <section className="section stadium-showcase" id="live-events">
      <div className="section-heading compact-heading"><div><p className="kicker">High-capacity stadium queue engine</p><h2>Live Concerts &amp; Stadium Tours</h2></div><span>View all upcoming concert legs →</span></div>
      <div className="stadium-grid">
        <article className="stadium-feature">
          <PosterImage src={spotlight.posterUrl || "/images/stitch/coldplay.jpg"} alt="" /><div className="stadium-shade" />
          {onFavourite && <button type="button" className={`favourite-button ${spotlight.isFavourite ? "active" : ""}`} onClick={() => onFavourite(spotlight)} aria-label={spotlight.isFavourite ? `Remove ${spotlight.title} from favourites` : `Add ${spotlight.title} to favourites`} aria-pressed={spotlight.isFavourite}>{spotlight.isFavourite ? "♥" : "♡"}</button>}
          <div className="stadium-copy"><span className="coral-chip">Waitlist available</span><p>⌖ {spotlight.venue.name}, {spotlight.venue.city}</p><h3>{spotlight.title}</h3><div className="stadium-stats"><span><small>Event format</small><b>{spotlight.format}</b></span><span><small>Seat allocation</small><b>Atomic holds</b></span><span><small>Venue view</small><b>{spotlight.venue.auditorium}</b></span></div><div className="stadium-actions"><span><small>Passes from</small><strong>₹{getStartingPrice(spotlight.prices).toLocaleString("en-IN")}</strong></span><Link to={`/events/${spotlight.id}`} aria-label={`View ${spotlight.title}`} className="button button-primary">Join priority pool →</Link></div></div>
        </article>
        <div className="stadium-side"><div className="concert-rows">{supporting.map((event, index) => <article className="concert-row" key={event.id}><div><span className={index ? "danger-chip" : "coral-chip"}>{index ? "Last tickets" : "Selling fast"}</span><small>{formatEventDate(event.date)}</small><h3>{event.title}</h3><p>⌖ {event.venue.name}, {event.venue.city}</p><span>Passes start at <strong>₹{getStartingPrice(event.prices).toLocaleString("en-IN")}</strong></span><Link to={`/events/${event.id}#seats`} aria-label={`Select seats for ${event.title}`}>Select seats →</Link></div><PosterImage src={event.posterUrl || "/images/cinema-hero.png"} alt="" /></article>)}</div><div className="authenticity-bar"><span>♢ Ticket authenticity</span><b>Reference-bound QR tickets</b></div></div>
      </div>
    </section>
  );
}

function DiscoveryRail({ title, kicker, events }: { title: string; kicker: string; events: EventSummaryDto[] }) {
  if (!events.length) return null;
  return <section className="section discovery-rail"><div className="section-heading compact-heading"><div><p className="kicker">{kicker}</p><h2>{title}</h2></div><Link to="/search">View all →</Link></div><div className="movie-showcase-grid">{events.slice(0, 4).map((event) => <EventCard event={event} key={`${title}-${event.id}`} />)}</div></section>;
}

function orderEvents(events: EventSummaryDto[], order: string[]) {
  return [...events].sort((left, right) => {
    const leftIndex = order.indexOf(left.title);
    const rightIndex = order.indexOf(right.title);
    return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
  });
}

function LoadingShowcase() {
  return <section className="section"><div className="movie-showcase-grid">{Array.from({ length: 4 }, (_, index) => <div className="event-skeleton" key={index}><div /><span /><span /></div>)}</div></section>;
}

function StatusCard({ title, detail }: { title: string; detail: string }) {
  return <section className="status-card" role="status"><span>◇</span><h2>{title}</h2><p>{detail}</p></section>;
}
