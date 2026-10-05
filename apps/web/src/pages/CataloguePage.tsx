import type { DiscoveryOptionsDto, DiscoverySort, EventSummaryDto, EventType, PaginatedEventsDto } from "@cinebook/shared";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { EventCard } from "../components/EventCard";
import { api } from "../lib/api";

const emptyOptions: DiscoveryOptionsDto = { cities: [], genres: [], venues: [], languages: [], formats: [] };

export function CataloguePage({ type }: { type?: EventType }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<EventSummaryDto[]>([]);
  const [options, setOptions] = useState<DiscoveryOptionsDto>(emptyOptions);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 8, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = searchParams.get("q") ?? "";
  const city = searchParams.get("city") ?? "";
  const date = searchParams.get("date") ?? "";
  const language = searchParams.get("language") ?? "";
  const format = searchParams.get("format") ?? "";
  const genre = searchParams.get("genre") ?? "";
  const venue = searchParams.get("venue") ?? "";
  const sort = (searchParams.get("sort") as DiscoverySort | null) ?? "date";

  useEffect(() => {
    api<DiscoveryOptionsDto>("/api/discovery/options").then(setOptions).catch(() => null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(searchParams);
    if (type) params.set("type", type); else params.delete("type");
    params.set("upcoming", "true");
    params.set("pageSize", "8");
    setLoading(true);
    setError("");
    api<PaginatedEventsDto>(`/api/events?${params}`, { signal: controller.signal })
      .then((result) => { setEvents(result.events); setPagination(result.pagination); })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "The catalogue could not be loaded");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [searchParams, type, user?.id]);

  const isMovie = type === "MOVIE";
  const isLive = type === "CONCERT";
  const heading = isMovie ? "Movies" : isLive ? "Live Events" : "Search results";
  const description = isMovie ? "Browse movies currently available for exact-seat booking." : isLive ? "Browse upcoming concerts, tours, and stadium experiences." : "Search every movie and live event from one filterable catalogue.";

  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value); else next.delete(name);
    next.delete("page");
    setSearchParams(next, { replace: true });
    if (name === "city") window.localStorage.setItem("cinebook:city", value || "ALL");
  }

  function setPage(page: number) {
    const next = new URLSearchParams(searchParams);
    if (page <= 1) next.delete("page"); else next.set("page", String(page));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearFilters() { setSearchParams({}, { replace: true }); }

  return (
    <div className="catalogue-page">
      <header className="catalogue-hero">
        <div><p className="kicker">Server-ranked live inventory</p><h1>{heading}</h1><p>{description}</p></div>
        <span className="catalogue-result-count">{pagination.total} result{pagination.total === 1 ? "" : "s"}</span>
      </header>
      <section className="catalogue-toolbar" aria-label="Catalogue filters">
        <label className="search-field catalogue-query"><span aria-hidden="true">⌕</span><span className="sr-only">Search catalogue</span><input value={query} onChange={(event) => setFilter("q", event.target.value)} placeholder={isMovie ? "Search movies, genres or cinemas…" : isLive ? "Search artists, tours or venues…" : "Search all tickets…"} /></label>
        <Filter label="City" value={city} onChange={(value) => setFilter("city", value)} options={options.cities.map((item) => ({ value: item, label: item }))} />
        <Filter label="Genre" value={genre} onChange={(value) => setFilter("genre", value)} options={options.genres.map((item) => ({ value: item, label: item }))} />
        <Filter label="Venue" value={venue} onChange={(value) => setFilter("venue", value)} options={options.venues.filter((item) => !city || item.city === city).map((item) => ({ value: item.id, label: `${item.name} · ${item.city}` }))} />
        <Filter label="Language" value={language} onChange={(value) => setFilter("language", value)} options={options.languages.map((item) => ({ value: item, label: item }))} />
        <Filter label="Format" value={format} onChange={(value) => setFilter("format", value)} options={options.formats.map((item) => ({ value: item, label: item }))} />
        <label className="catalog-select"><span>Date</span><input aria-label="Show date" type="date" value={date} onChange={(event) => setFilter("date", event.target.value)} /></label>
        <label className="catalog-select"><span>Sort</span><select aria-label="Sort results" value={sort} onChange={(event) => setFilter("sort", event.target.value)}><option value="date">Soonest first</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="trending">Trending</option></select></label>
        <button type="button" className="button button-ghost compact clear-filters" onClick={clearFilters}>Clear filters</button>
      </section>
      {error ? <CatalogueStatus title="Couldn’t load this catalogue" detail={error} /> : loading ? <div className="movie-showcase-grid catalogue-grid">{Array.from({ length: 8 }, (_, index) => <div className="event-skeleton" key={index}><div /><span /><span /></div>)}</div> : events.length ? <div className="movie-showcase-grid catalogue-grid">{events.map((event) => <EventCard event={event} key={event.id} onFavourite={user?.role === "CUSTOMER" ? toggleFavourite : undefined} />)}</div> : <CatalogueStatus title={isMovie ? "No movies found" : isLive ? "No upcoming live events found" : "No matching tickets"} detail="Try clearing a filter or choosing another city." />}
      {pagination.totalPages > 1 && <nav className="catalogue-pagination" aria-label="Search result pages"><button type="button" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>← Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>Next →</button></nav>}
    </div>
  );

  async function toggleFavourite(target: EventSummaryDto) {
    const favourite = !target.isFavourite;
    setEvents((items) => items.map((item) => item.contentId === target.contentId ? { ...item, isFavourite: favourite } : item));
    try { await api("/api/favourites", { method: "POST", body: JSON.stringify({ eventId: target.id, favourite }) }); }
    catch (reason) { setEvents((items) => items.map((item) => item.contentId === target.contentId ? { ...item, isFavourite: !favourite } : item)); setError(reason instanceof Error ? reason.message : "Favourite could not be updated"); }
  }
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  const allLabel = label === "City" ? "All cities" : `All ${label.toLowerCase()}s`;
  return <label className="catalog-select"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{allLabel}</option>{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
}

function CatalogueStatus({ title, detail }: { title: string; detail: string }) {
  return <section className="status-card" role="status"><span>◇</span><h2>{title}</h2><p>{detail}</p></section>;
}
