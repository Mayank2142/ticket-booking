import type { EventType, VenueOptionDto } from "@cinebook/shared";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export function NewEventPage() {
  const navigate = useNavigate();
  const [venues, setVenues] = useState<VenueOptionDto[]>([]);
  const [venueId, setVenueId] = useState("");
  const [type, setType] = useState<EventType>("MOVIE");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const venue = venues.find((item) => item.id === venueId);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    api<{ venues: VenueOptionDto[] }>("/api/venues")
      .then(({ venues: result }) => setVenues(result))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Venues could not be loaded"))
      .finally(() => setLoading(false));
  }, []);

  function selectVenue(nextVenueId: string) {
    setVenueId(nextVenueId);
    const nextVenue = venues.find((item) => item.id === nextVenueId);
    setPrices(Object.fromEntries((nextVenue?.categories ?? []).map((category) => [category.id, ""])));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!venue) return setError("Select a venue before publishing.");
    setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ event: { id: string } }>("/api/events", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"), type, description: form.get("description"), venueId,
          language: form.get("language"), format: form.get("format"), genre: form.get("genre"),
          durationMinutes: Number(form.get("durationMinutes")), certificate: form.get("certificate"),
          date: form.get("date"), time: form.get("time"),
          prices: venue.categories.map((category) => ({ categoryId: category.id, price: Number(prices[category.id]) }))
        })
      });
      navigate(`/organiser/events/${result.event.id}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Event could not be published");
    } finally { setSaving(false); }
  }

  return (
    <section className="workspace-page narrow-workspace">
      <Link to="/organiser/events" className="back-button">← Back to event dashboard</Link>
      <header className="workspace-heading create-heading"><div><p className="kicker">New production</p><h1>Create an event.</h1><p>Choose a venue, schedule the show, and price every available category.</p></div><span className="step-badge">One-step publish</span></header>
      <form className="event-form-layout" onSubmit={submit}>
        <div className="workspace-card form-section-stack">
          <FormSection number="01" title="Event identity" detail="What customers will see in discovery.">
            <div className="form-grid two"><label><span>Event title</span><input className="form-control" name="title" minLength={2} maxLength={80} required placeholder="Midnight premiere" /></label><label><span>Event type</span><select className="form-control" value={type} onChange={(event) => setType(event.target.value as EventType)}><option value="MOVIE">Movie</option><option value="CONCERT">Concert / live event</option></select></label></div>
            <label><span>Description</span><textarea className="form-control textarea-control" name="description" maxLength={2000} placeholder="Tell customers what makes this show unmissable…" /></label>
            <div className="form-grid two"><label><span>Language</span><input className="form-control" name="language" defaultValue={type === "MOVIE" ? "Hindi" : "English"} minLength={2} maxLength={80} required /></label><label><span>Format</span><input className="form-control" name="format" defaultValue={type === "MOVIE" ? "2D" : "Live"} minLength={2} maxLength={80} required /></label></div>
            <div className="form-grid three"><label><span>Genre</span><input className="form-control" name="genre" defaultValue={type === "MOVIE" ? "Drama" : "Music"} minLength={2} maxLength={80} required /></label><label><span>Duration (minutes)</span><input className="form-control" name="durationMinutes" type="number" min="15" max="600" defaultValue={type === "MOVIE" ? 150 : 180} required /></label><label><span>Certificate</span><input className="form-control" name="certificate" maxLength={12} placeholder="U/A 13+" /></label></div>
          </FormSection>
          <FormSection number="02" title="Venue and schedule" detail="Events can only be created in the future.">
            <label><span>Venue</span><select className="form-control" value={venueId} onChange={(event) => selectVenue(event.target.value)} required disabled={loading}><option value="">{loading ? "Loading venues…" : "Select venue"}</option>{venues.map((item) => <option key={item.id} value={item.id}>{item.city} · {item.name} · {item.auditorium}</option>)}</select></label>
            <div className="form-grid two"><label><span>Show date</span><input className="form-control" name="date" type="date" min={today} required /></label><label><span>Start time</span><input className="form-control" name="time" type="time" required /></label></div>
          </FormSection>
          <FormSection number="03" title="Category pricing" detail="A positive price is required for every venue category.">
            {!venue ? <p className="form-placeholder">Select a venue to reveal its seat categories.</p> : <div className="price-input-grid">{venue.categories.map((category) => <label key={category.id}><span>{category.name}</span><div className="currency-input"><b>₹</b><input name={`price-${category.id}`} type="number" min="1" max="1000000" step="0.01" required value={prices[category.id] ?? ""} onChange={(event) => setPrices((current) => ({ ...current, [category.id]: event.target.value }))} placeholder="0" /></div></label>)}</div>}
          </FormSection>
          {error && <p className="form-message error" role="alert">{error}</p>}
          <div className="form-actions"><Link to="/organiser/events" className="button button-ghost">Cancel</Link><button className="button button-primary" type="submit" disabled={saving || !venue}>{saving ? "Publishing…" : "Publish event →"}</button></div>
        </div>
        <aside className="workspace-card publish-guide"><span className="guide-icon">✦</span><p className="kicker">Publish checklist</p><h2>Ready for the spotlight?</h2><ul><li><span>1</span>Clear event title and description</li><li><span>2</span>Future date and valid showtime</li><li><span>3</span>Price for every seat category</li></ul><p className="guide-note">The venue’s complete seat inventory is materialised when you publish, keeping every show isolated.</p></aside>
      </form>
    </section>
  );
}

function FormSection({ number, title, detail, children }: { number: string; title: string; detail: string; children: ReactNode }) {
  return <section className="form-section"><header><span>{number}</span><div><h2>{title}</h2><p>{detail}</p></div></header><div className="form-fields">{children}</div></section>;
}
