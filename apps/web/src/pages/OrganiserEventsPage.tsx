import type { EventSalesSummaryDto, EventSummaryDto } from "@cinebook/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatEventDate } from "../lib/presentation";

type Summary = Pick<EventSalesSummaryDto, "totalBookings" | "revenue">;

export function OrganiserEventsPage() {
  const [events, setEvents] = useState<EventSummaryDto[]>([]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    api<{ events: EventSummaryDto[] }>("/api/events?mine=true")
      .then(async ({ events: ownedEvents }) => {
        if (!active) return;
        setEvents(ownedEvents);
        const settled = await Promise.allSettled(ownedEvents.map(async (event) => [
          event.id,
          await api<EventSalesSummaryDto>(`/api/organiser/events/${event.id}/summary`)
        ] as const));
        if (active) setSummaries(Object.fromEntries(settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])));
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Events could not be loaded"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? events.filter((event) => `${event.title} ${event.venue.name} ${event.type}`.toLowerCase().includes(normalized)) : events;
  }, [events, query]);
  const totalRevenue = Object.values(summaries).reduce((sum, summary) => sum + summary.revenue, 0);
  const totalBookings = Object.values(summaries).reduce((sum, summary) => sum + summary.totalBookings, 0);

  return (
    <section className="workspace-page">
      <header className="workspace-heading">
        <div><p className="kicker">Organiser studio</p><h1>Performance at a glance.</h1><p>Publish listings and follow confirmed ticket sales across every show.</p></div>
        <Link to="/organiser/events/new" className="button button-primary">＋ Create event</Link>
      </header>

      <div className="metric-grid">
        <Metric label="Published events" value={String(events.length)} detail="Owned listings" />
        <Metric label="Confirmed bookings" value={totalBookings.toLocaleString("en-IN")} detail="Live reservations" />
        <Metric label="Gross revenue" value={`₹${totalRevenue.toLocaleString("en-IN")}`} detail="Before fees" accent />
      </div>

      {error && <p className="form-message error" role="alert">{error}</p>}
      <section className="workspace-card listing-panel">
        <div className="panel-toolbar"><div><p className="kicker">Live catalogue</p><h2>Your listings</h2></div><label className="workspace-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search your events</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or venue" /></label></div>
        {loading ? <div className="workspace-skeleton" /> : visibleEvents.length === 0 ? (
          <div className="workspace-empty"><span>◇</span><h3>{events.length ? "No matching listings" : "Your stage is ready"}</h3><p>{events.length ? "Try another title or venue." : "Create your first movie or concert listing."}</p>{!events.length && <Link to="/organiser/events/new" className="button button-primary">Create first event</Link>}</div>
        ) : <div className="listing-table">{visibleEvents.map((event) => {
          const summary = summaries[event.id];
          return <article key={event.id} className="listing-row">
            <div className="listing-title"><span className="workspace-chip">{event.type === "MOVIE" ? "Movie" : "Live"}</span><div><h3>{event.title}</h3><p>{event.venue.name}</p></div></div>
            <div><small>Showtime</small><strong>{formatEventDate(event.date)} · {event.time}</strong></div>
            <div><small>Bookings</small><strong>{summary?.totalBookings ?? "—"}</strong></div>
            <div><small>Revenue</small><strong className="accent-value">{summary ? `₹${summary.revenue.toLocaleString("en-IN")}` : "—"}</strong></div>
            <Link to={`/organiser/events/${event.id}`} className="row-link" aria-label={`View report for ${event.title}`}>Report <span>→</span></Link>
          </article>;
        })}</div>}
      </section>
    </section>
  );
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <article className={`metric-card${accent ? " accent-metric" : ""}`}><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>;
}
