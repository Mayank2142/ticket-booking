import type { EventSummaryDto, EventType } from "@cinebook/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EventCard } from "../components/EventCard";
import { api, assetUrl } from "../lib/api";
import { formatEventDate, getStartingPrice } from "../lib/presentation";
import { useAuth } from "../auth/AuthContext";

type EventFilter = "ALL" | EventType;

export function HomePage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventSummaryDto[]>([]);
  const [recommendations, setRecommendations] = useState<EventSummaryDto[]>([]);
  const [personalised, setPersonalised] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EventFilter>("ALL");
  const [city, setCity] = useState("ALL");
  const [language, setLanguage] = useState("ALL");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ events: EventSummaryDto[] }>("/api/events", { signal: controller.signal }),
      api<{ recommendations: EventSummaryDto[]; personalised: boolean }>("/api/recommendations", { signal: controller.signal })
    ])
      .then(([catalogue, recommended]) => { setEvents(catalogue.events); setRecommendations(recommended.recommendations); setPersonalised(recommended.personalised); })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Events could not be loaded");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [user?.id]);

  const cities = useMemo(() => Array.from(new Set(events.map((event) => event.venue.city))).sort(), [events]);
  const languages = useMemo(() => Array.from(new Set(events.map((event) => event.language))).sort(), [events]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesType = filter === "ALL" || event.type === filter;
      const matchesCity = city === "ALL" || event.venue.city === city;
      const matchesLanguage = language === "ALL" || event.language === language;
      const matchesQuery = !normalizedQuery || `${event.title} ${event.venue.name}`.toLowerCase().includes(normalizedQuery);
      return matchesType && matchesCity && matchesLanguage && matchesQuery;
    });
  }, [city, events, filter, language, query]);

  const featured = events[0];
  const movies = filtered.filter((event) => event.type === "MOVIE");
  const concerts = filtered.filter((event) => event.type === "CONCERT");

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <img className="hero-image" src={assetUrl("/images/cinema-hero.png")} alt="" />
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="eyebrow-row"><span className="pill accent">React preview</span><span className="pill">Live inventory</span></div>
          <p className="kicker">Movies, music and unforgettable nights</p>
          <h1 id="hero-title">{featured?.title ?? "Your next great show starts here."}</h1>
          <p className="hero-copy">Choose the exact seats you want, hold them securely, and receive a QR ticket as soon as your booking is confirmed.</p>
          {featured && <p className="hero-meta">{featured.venue.name} · {formatEventDate(featured.date)} · From ₹{getStartingPrice(featured.prices)}</p>}
          <div className="hero-actions">
            {featured ? <Link className="button button-primary" to={`/events/${featured.id}`}>Book tickets <span>→</span></Link> : <a className="button button-primary" href="#discover">Explore shows <span>→</span></a>}
            <a className="button button-ghost" href="#discover">Explore shows</a>
          </div>
        </div>
      </section>

      <section className="section" id="discover">
        <div className="section-heading">
          <div><p className="kicker">Curated for your city</p><h2>Discover what’s on</h2></div>
          <p>Search the live catalogue served by the existing CineBook API.</p>
        </div>
        <div className="discover-bar">
          <label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">Search shows</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movies, concerts or venues" /></label>
          <div className="filter-tabs" aria-label="Event type">
            {(["ALL", "MOVIE", "CONCERT"] as const).map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "ALL" ? "All shows" : item === "MOVIE" ? "Movies" : "Live events"}</button>)}
          </div>
          <label className="catalog-select"><span className="sr-only">City</span><select value={city} onChange={(event) => setCity(event.target.value)}><option value="ALL">All cities</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="catalog-select"><span className="sr-only">Language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="ALL">All languages</option>{languages.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>
      </section>

      {error ? <StatusCard title="Couldn’t load events" detail={error} /> : loading ? <LoadingGrid /> : (
        <>
          {recommendations.length > 0 && <EventSection id="recommended" kicker={personalised ? "Picked from your taste" : "Trending now"} title={personalised ? "Recommended for you" : "Popular near you"} events={recommendations} onFavourite={user?.role === "CUSTOMER" ? toggleFavourite : undefined} />}
          <EventSection id="movies" kicker="Now showing" title="Movies" events={movies} onFavourite={user?.role === "CUSTOMER" ? toggleFavourite : undefined} />
          <EventSection id="live-events" kicker="On stage" title="Live events & concerts" events={concerts} onFavourite={user?.role === "CUSTOMER" ? toggleFavourite : undefined} />
          {!filtered.length && <StatusCard title="No shows found" detail="Try another title, venue, or category." />}
        </>
      )}
    </>
  );

  async function toggleFavourite(target: EventSummaryDto) {
    const favourite = !target.isFavourite;
    const update = (items: EventSummaryDto[]) => items.map((item) => item.contentId && item.contentId === target.contentId ? { ...item, isFavourite: favourite } : item);
    setEvents(update);
    setRecommendations(update);
    try {
      await api("/api/favourites", { method: "POST", body: JSON.stringify({ eventId: target.id, favourite }) });
    } catch (reason) {
      setEvents((items) => items.map((item) => item.contentId && item.contentId === target.contentId ? { ...item, isFavourite: !favourite } : item));
      setRecommendations((items) => items.map((item) => item.contentId && item.contentId === target.contentId ? { ...item, isFavourite: !favourite } : item));
      setError(reason instanceof Error ? reason.message : "Favourite could not be updated");
    }
  }
}

function EventSection({ id, kicker, title, events, onFavourite }: { id: string; kicker: string; title: string; events: EventSummaryDto[]; onFavourite?: (event: EventSummaryDto) => void }) {
  if (!events.length) return null;
  return <section className="section" id={id}><div className="section-heading compact-heading"><div><p className="kicker">{kicker}</p><h2>{title}</h2></div><span>{events.length} show{events.length === 1 ? "" : "s"}</span></div><div className="event-grid">{events.map((event) => <EventCard event={event} key={event.id} onFavourite={onFavourite} />)}</div></section>;
}

function LoadingGrid() {
  return <section className="section"><div className="event-grid">{Array.from({ length: 5 }, (_, index) => <div className="event-skeleton" key={index}><div /><span /><span /></div>)}</div></section>;
}

function StatusCard({ title, detail }: { title: string; detail: string }) {
  return <section className="status-card" role="status"><span>◇</span><h2>{title}</h2><p>{detail}</p></section>;
}
