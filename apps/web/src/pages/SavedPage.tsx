import type { EventSummaryDto } from "@cinebook/shared";
import { useEffect, useState } from "react";
import { EventCard } from "../components/EventCard";
import { api } from "../lib/api";
import { ButtonLink } from "../components/ui/Button";
import { CustomerEmptyState, CustomerFeedback, CustomerLoading, CustomerPageHeading } from "./CustomerPageUI";

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

  return <section className="customer-space saved-page">
    <CustomerPageHeading eyebrow="Your watchlist" title="Saved events" description="Movies and live events you saved for later." action={<ButtonLink variant="secondary" to="/search">Discover more</ButtonLink>} />
    {error && <CustomerFeedback error>{error}</CustomerFeedback>}
    {loading ? <CustomerLoading label="Loading saved events…" /> : events.length ? <div className="movie-showcase-grid">{events.map((event) => <EventCard key={event.id} event={event} onFavourite={remove} />)}</div> : error ? <CustomerEmptyState error title="Saved events unavailable" description="Your saved events could not be loaded. Please try again later." /> : <CustomerEmptyState title="Nothing saved yet" description="Use the heart or Save button on an event, then find it here." action={<ButtonLink to="/search">Browse events</ButtonLink>} />}
  </section>;
}
