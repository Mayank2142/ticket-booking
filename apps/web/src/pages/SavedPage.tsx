import type { EventSummaryDto } from "@cinebook/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EventCard } from "../components/EventCard";
import { api } from "../lib/api";

export function SavedPage() {
  const [events, setEvents] = useState<EventSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ events: EventSummaryDto[] }>("/api/favourites")
      .then((result) => setEvents(result.events))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Saved events could not be loaded"))
      .finally(() => setLoading(false));
  }, []);

  async function remove(event: EventSummaryDto) {
    setError("");
    try {
      await api("/api/favourites", { method: "POST", body: JSON.stringify({ eventId: event.id, favourite: false }) });
      setEvents((current) => current.filter((item) => item.contentId !== event.contentId));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Saved event could not be removed"); }
  }

  return <section className="account-page saved-page">
    <header className="page-heading"><div><p className="kicker">Your watchlist</p><h1>Saved events</h1><p>Movies and live events you saved for later.</p></div><Link className="button button-ghost" to="/search">Discover more</Link></header>
    {error && <p className="form-message error" role="alert">{error}</p>}
    {loading ? <div className="event-skeleton" /> : events.length ? <div className="movie-showcase-grid">{events.map((event) => <EventCard key={event.id} event={event} onFavourite={remove} />)}</div> : <div className="empty-bookings"><span>♡</span><h2>Nothing saved yet</h2><p>Use the heart or Save button on an event, then find it here.</p><Link className="button button-primary" to="/search">Browse events</Link></div>}
  </section>;
}
