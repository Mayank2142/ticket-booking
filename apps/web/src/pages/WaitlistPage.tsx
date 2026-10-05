import type { WaitlistEntryDto } from "@cinebook/shared";
import { useEffect, useState } from "react";
import { PosterImage } from "../components/PosterImage";
import { api } from "../lib/api";
import { eventPosterArtwork, formatEventDate } from "../lib/presentation";
import { Badge } from "../components/ui/Badge";
import { ButtonLink } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CustomerEmptyState, CustomerFeedback, CustomerLoading, CustomerPageHeading } from "./CustomerPageUI";

export function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    api<{ entries: WaitlistEntryDto[] }>("/api/waitlist").then((result) => setEntries(result.entries)).catch((reason) => setMessage(reason instanceof Error ? reason.message : "Waitlist could not be loaded")).finally(() => setLoading(false));
  }, []);
  const active = entries.filter((entry) => entry.status === "WAITING" || entry.status === "OFFERED");
  const history = entries.filter((entry) => entry.status === "FULFILLED" || entry.status === "EXPIRED");

  return <section className="customer-space waitlist-page">
    <CustomerPageHeading eyebrow="Queue and offers" title="My waitlists" description="Track every queue position and accept active seat offers before they expire." action={<ButtonLink to="/live-events" variant="secondary">Browse live events</ButtonLink>} />
    {message && <CustomerFeedback error>{message}</CustomerFeedback>}
    {loading ? <CustomerLoading label="Loading your waitlists…" /> : message ? <CustomerEmptyState error title="Waitlists unavailable" description="Your queue history could not be loaded. Please try again later." /> : <>
      <WaitlistSection title="Active waitlists & offers" entries={active} empty="You have no active waitlists." />
      <WaitlistSection title="Waitlist history" entries={history} empty="Completed and expired offers will appear here." />
    </>}
  </section>;
}

function WaitlistSection({ title, entries, empty }: { title: string; entries: WaitlistEntryDto[]; empty: string }) {
  return <section className="customer-section"><div className="customer-section-heading"><h2>{title}</h2><Badge>{entries.length} {entries.length === 1 ? "entry" : "entries"}</Badge></div>{entries.length === 0 ? <CustomerEmptyState title={title === "Waitlist history" ? "No waitlist history yet" : "No active waitlists"} description={empty} /> : <div className="customer-waitlist-grid">{entries.map((entry) => {
    const event = entry.event;
    if (!event) return null;
    const offerLink = entry.status === "OFFERED" && entry.offerToken ? `/events/${event.id}?offer=${encodeURIComponent(entry.offerToken)}#seats` : `/events/${event.id}`;
    return <Card as="article" className="customer-waitlist-card" key={entry.id}><PosterImage src={event.content?.posterUrl || eventPosterArtwork(event)} alt="" /><div><Badge tone={entry.status === "OFFERED" ? "primary" : entry.status === "FULFILLED" ? "success" : "neutral"}>{entry.status}</Badge><h3>{event.title}</h3><p>{formatEventDate(event.date)} · {event.time}</p><p>{event.venue.name}, {event.venue.city} · {entry.category.name}</p>{entry.status === "WAITING" && <strong>Queue position #{entry.position}</strong>}{entry.status === "OFFERED" && entry.offerExpiresAt && <strong>Offer expires {new Date(entry.offerExpiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>}</div><ButtonLink to={offerLink} variant={entry.status === "OFFERED" ? "primary" : "secondary"}>{entry.status === "OFFERED" ? "Accept offer" : "View event"}</ButtonLink></Card>;
  })}</div>}</section>;
}
