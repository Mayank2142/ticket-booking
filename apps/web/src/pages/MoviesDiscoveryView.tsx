import type { DiscoveryOptionsDto, EventSummaryDto } from "@cinebook/shared";
import { Link } from "react-router-dom";
import { PosterImage } from "../components/PosterImage";
import { Badge } from "../components/ui/Badge";
import { Button, ButtonLink } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Select } from "../components/ui/FormControls";
import { formatEventDate, getStartingPrice } from "../lib/presentation";
import "./MoviesDiscovery.css";

type Props = {
  catalogueType?: "MOVIE" | "CONCERT";
  events: EventSummaryDto[];
  options: DiscoveryOptionsDto;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  filters: Record<string, string>;
  loading: boolean;
  error: string;
  setFilter: (name: string, value: string) => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
  onFavourite?: (event: EventSummaryDto) => void;
};

/** Presentation only: catalogue requests and URL/state updates remain in CataloguePage. */
export function MoviesDiscoveryView({ catalogueType = "MOVIE", events, options, pagination, filters, loading, error, setFilter, clearFilters, setPage, onFavourite }: Props) {
  const isLive = catalogueType === "CONCERT";
  const allLabel = isLive ? "All live events" : "All movies";
  const emptyLabel = isLive ? "No upcoming live events found" : "No movies found";
  const loadingLabel = isLive ? "Loading live events" : "Loading movies";
  const active = Object.entries(filters).filter(([key, value]) => key !== "sort" && value);
  const labelFor = (key: string, value: string) => key === "venue" ? options.venues.find((item) => item.id === value)?.name ?? value : value;
  return <div className="movies-discovery">
    <header className="movies-discovery__hero">
      <div><p className="movies-discovery__eyebrow">{isLive ? "Live Events · Live show availability" : "Movies · Live show availability"}</p><h1>{isLive ? "Explore Live Events" : "Explore Movies"}{filters.city && <> in <span>{filters.city}</span></>}</h1><p>{isLive ? "Discover upcoming concerts, tours and live performances. Find the right venue, date and seats." : "Discover your next big-screen favourite. Find the right format, cinema and showtime."}</p></div>
      <div className="movies-discovery__summary"><strong>{pagination.total}</strong><span>matching show{pagination.total === 1 ? "" : "s"}</span></div>
    </header>
    <div className="movies-discovery__layout">
      <Card as="section" className="movies-discovery__filters" aria-label="Catalogue filters">
        <div className="movies-discovery__filter-heading"><h2>Filters</h2><Button variant="ghost" size="small" onClick={clearFilters}>Clear filters</Button></div>
        <label className="movies-discovery__field"><span>Search catalogue</span><Input aria-label="Search catalogue" value={filters.q} onChange={(e) => setFilter("q", e.target.value)} placeholder={isLive ? "Artists, tours or venues…" : "Movies, genres or cinemas…"} /></label>
        <MovieFilter label="City" value={filters.city} values={options.cities.map((value) => ({ value, label: value }))} onChange={(value) => setFilter("city", value)} />
        <fieldset className="movies-discovery__formats"><legend>Format</legend><div><Button variant={!filters.format ? "primary" : "secondary"} size="small" aria-pressed={!filters.format} onClick={() => setFilter("format", "")}>All formats</Button>{options.formats.map((value) => <Button key={value} size="small" variant={filters.format === value ? "primary" : "secondary"} aria-pressed={filters.format === value} onClick={() => setFilter("format", filters.format === value ? "" : value)}>{value}</Button>)}</div></fieldset>
        <MovieFilter label="Language" value={filters.language} values={options.languages.map((value) => ({ value, label: value }))} onChange={(value) => setFilter("language", value)} />
        <MovieFilter label="Genre" value={filters.genre} values={options.genres.map((value) => ({ value, label: value }))} onChange={(value) => setFilter("genre", value)} />
        <MovieFilter label="Venue" value={filters.venue} values={options.venues.filter((item) => !filters.city || item.city === filters.city).map((item) => ({ value: item.id, label: `${item.name} · ${item.city}` }))} onChange={(value) => setFilter("venue", value)} />
        <label className="movies-discovery__field"><span>Show date</span><Input aria-label="Show date" type="date" value={filters.date} onChange={(e) => setFilter("date", e.target.value)} /></label>
      </Card>
      <section className="movies-discovery__results" aria-label={isLive ? "Live event results" : "Movie results"} aria-busy={loading}>
        <Card className="movies-discovery__toolbar"><div className="movies-discovery__active"><span>Active:</span>{active.length ? active.map(([key, value]) => <Button key={key} size="small" variant="secondary" aria-label={`Remove ${key} filter: ${labelFor(key, value)}`} onClick={() => setFilter(key, "")}>{labelFor(key, value)} <span aria-hidden="true">×</span></Button>) : <span>{allLabel}</span>}</div><label className="movies-discovery__sort"><span>Sort by</span><Select aria-label="Sort results" value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}><option value="date">Soonest first</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="trending">Trending</option></Select></label></Card>
        {error ? <Card className="movies-discovery__status" role="status"><h2>Couldn’t load this catalogue</h2><p>{error}</p></Card> : loading ? <div className="movies-discovery__grid" aria-label={loadingLabel}>{Array.from({ length: 8 }, (_, i) => <Card key={i} className="movies-discovery__skeleton"><div /><span /><span /></Card>)}</div> : events.length ? <div className="movies-discovery__grid">{events.map((event) => <MovieCard key={event.id} event={event} onFavourite={onFavourite} />)}</div> : <Card className="movies-discovery__status" role="status"><h2>{emptyLabel}</h2><p>Try clearing a filter or choosing another city.</p></Card>}
        <div className="movies-discovery__pagination"><p>{pagination.total ? `Showing ${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(pagination.page * pagination.pageSize, pagination.total)} of ${pagination.total} shows` : "0 shows"}</p>{pagination.totalPages > 1 && <nav aria-label="Search result pages"><Button variant="secondary" size="small" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}>← Previous</Button><span>Page {pagination.page} of {pagination.totalPages}</span><Button variant="secondary" size="small" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}>Next →</Button></nav>}</div>
      </section>
    </div>
  </div>;
}

function MovieFilter({ label, value, values, onChange }: { label: string; value: string; values: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="movies-discovery__field"><span>{label}</span><Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}><option value="">{label === "City" ? "All cities" : `All ${label.toLowerCase()}s`}</option>{values.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</Select></label>;
}

function MovieCard({ event, onFavourite }: { event: EventSummaryDto; onFavourite?: Props["onFavourite"] }) {
  return <Card as="article" className="movies-discovery__movie">
    <div className="movies-discovery__poster"><Link to={`/events/${event.id}`} aria-label={`View ${event.title}`}><PosterImage src={event.posterUrl || "/images/portal-poster.png"} alt="" /></Link><Badge className="movies-discovery__format">{event.format}</Badge>{onFavourite && <Button variant="secondary" size="small" className="movies-discovery__favourite" aria-label={event.isFavourite ? `Remove ${event.title} from favourites` : `Add ${event.title} to favourites`} aria-pressed={event.isFavourite} onClick={() => onFavourite(event)}>{event.isFavourite ? "♥" : "♡"}</Button>}<span className="movies-discovery__price">From ₹{getStartingPrice(event.prices)}</span></div>
    <div className="movies-discovery__movie-body"><div className="movies-discovery__metadata"><span>{event.genre}</span>{event.certificate && <Badge>{event.certificate}</Badge>}</div><h2><Link to={`/events/${event.id}`}>{event.title}</Link></h2><p>{event.venue.name}</p><p>{event.language}{event.durationMinutes ? ` · ${event.durationMinutes} min` : ""}</p><div className="movies-discovery__showtime">{formatEventDate(event.date)} · {event.time}</div><ButtonLink to={`/events/${event.id}`} size="small" fullWidth>Select seats →</ButtonLink></div>
  </Card>;
}
