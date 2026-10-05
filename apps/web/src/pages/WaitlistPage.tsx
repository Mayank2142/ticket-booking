import type { WaitlistEntryDto } from "@cinebook/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PosterImage } from "../components/PosterImage";
import { api } from "../lib/api";
import { eventPosterArtwork, formatEventDate } from "../lib/presentation";

export function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    api<{ entries: WaitlistEntryDto[] }>("/api/waitlist").then((result) => setEntries(result.entries)).catch((reason) => setMessage(reason instanceof Error ? reason.message : "Waitlist could not be loaded")).finally(() => setLoading(false));
  }, []);
  const active = entries.filter((entry) => entry.status === "WAITING" || entry.status === "OFFERED");
  const history = entries.filter((entry) => entry.status === "FULFILLED" || entry.status === "EXPIRED");

  return <section className="account-page waitlist-page">
    <header className="page-heading"><div><p className="kicker">Queue and offers</p><h1>My waitlists</h1><p>Track every queue position and accept active seat offers before they expire.</p></div><Link to="/live-events" className="button button-ghost">Browse live events</Link></header>
    {message && <p className="inline-notice" role="status">{message}</p>}
    {loading ? <div className="booking-skeleton" /> : <>
      <WaitlistSection title="Active waitlists & offers" entries={active} empty="You have no active waitlists." />
      <WaitlistSection title="Waitlist history" entries={history} empty="Completed and expired offers will appear here." />
    </>}
  </section>;
}

function WaitlistSection({ title, entries, empty }: { title: string; entries: WaitlistEntryDto[]; empty: string }) {
  return <section className="account-section"><h2>{title}</h2>{entries.length === 0 ? <p className="section-empty">{empty}</p> : <div className="waitlist-history-grid">{entries.map((entry) => {
    const event = entry.event;
    if (!event) return null;
    const offerLink = entry.status === "OFFERED" && entry.offerToken ? `/events/${event.id}?offer=${encodeURIComponent(entry.offerToken)}#seats` : `/events/${event.id}`;
    return <article className="waitlist-history-card" key={entry.id}><PosterImage src={event.content?.posterUrl || eventPosterArtwork(event)} alt="" /><div><span className={`status-chip ${entry.status === "OFFERED" ? "active" : ""}`}>{entry.status}</span><h3>{event.title}</h3><p>{formatEventDate(event.date)} · {event.time}</p><p>{event.venue.name}, {event.venue.city} · {entry.category.name}</p>{entry.status === "WAITING" && <strong>Queue position #{entry.position}</strong>}{entry.status === "OFFERED" && entry.offerExpiresAt && <strong>Offer expires {new Date(entry.offerExpiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>}</div><Link to={offerLink} className="button button-primary">{entry.status === "OFFERED" ? "Accept offer" : "View event"}</Link></article>;
  })}</div>}</section>;
}
