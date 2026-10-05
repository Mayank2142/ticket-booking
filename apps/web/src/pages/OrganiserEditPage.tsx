import type { ShowStatus, VenueDto } from "@cinebook/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";

type ManagedShow = {
  id: string; title: string; description?: string | null; date: string; time: string; status: ShowStatus;
  content?: { language: string; format: string; genre: string; durationMinutes: number; certificate?: string | null; releaseDate?: string | null; castNames: string; crewNames: string; trailerUrl?: string | null; formats: string; performerNames: string; ageRule?: string | null; entryRule?: string | null } | null;
  venue: VenueDto;
  prices: Array<{ categoryId: string; price: number; category: { name: string } }>;
};

type ScheduleDraft = { date: string; time: string; venueId: string; auditoriumId: string; status: ShowStatus };

export function OrganiserEditPage() {
  const { eventId = "" } = useParams();
  const [show, setShow] = useState<ManagedShow | null>(null);
  const [venues, setVenues] = useState<VenueDto[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [schedules, setSchedules] = useState<ScheduleDraft[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api<{ show: ManagedShow }>(`/api/organiser/events/${eventId}/manage`),
      api<{ venues: VenueDto[] }>("/api/venues")
    ]).then(([managed, venueResult]) => {
      const item = managed.show;
      setShow(item);
      setVenues(venueResult.venues.filter((venue) => !venue.archivedAt));
      setForm({ title: item.title, description: item.description ?? "", date: item.date, time: item.time, language: item.content?.language ?? "", format: item.content?.format ?? "", genre: item.content?.genre ?? "", durationMinutes: String(item.content?.durationMinutes ?? 120), certificate: item.content?.certificate ?? "", releaseDate: item.content?.releaseDate ?? "", castNames: item.content?.castNames ?? "", crewNames: item.content?.crewNames ?? "", trailerUrl: item.content?.trailerUrl ?? "", formats: item.content?.formats ?? "", performerNames: item.content?.performerNames ?? "", ageRule: item.content?.ageRule ?? "", entryRule: item.content?.entryRule ?? "" });
      setPrices(Object.fromEntries(item.prices.map((price) => [price.categoryId, String(price.price)])));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Show could not be loaded"));
  }, [eventId]);

  function change(name: string, value: string) { setForm((current) => ({ ...current, [name]: value })); }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      await api(`/api/organiser/events/${eventId}/manage`, { method: "PUT", body: JSON.stringify({ ...form, durationMinutes: Number(form.durationMinutes), prices: show?.prices.map((price) => ({ categoryId: price.categoryId, price: Number(prices[price.categoryId]) })) }) });
      setMessage("Show and content details updated safely.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Changes could not be saved"); }
    finally { setSaving(false); }
  }

  function addSchedule() {
    const venue = venues[0];
    if (!venue) return;
    setSchedules((current) => [...current, { date: "", time: "", venueId: venue.id, auditoriumId: venue.auditoriums?.find((item) => !item.archivedAt)?.id ?? "", status: "PUBLISHED" }]);
  }
  function updateSchedule(index: number, patch: Partial<ScheduleDraft>) { setSchedules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }
  async function createBatch() {
    setSaving(true); setError(""); setMessage("");
    try {
      await api(`/api/organiser/events/${eventId}/shows`, { method: "POST", body: JSON.stringify({ shows: schedules.map((schedule) => { const venue = venues.find((item) => item.id === schedule.venueId); return { ...schedule, prices: venue?.categories.map((category) => ({ categoryId: category.id, price: Number(prices[category.id] ?? show?.prices.find((item) => item.category.name === category.name)?.price ?? 500) })) }; }) }) });
      setMessage(`${schedules.length} additional show${schedules.length === 1 ? "" : "s"} created.`); setSchedules([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Shows could not be created"); }
    finally { setSaving(false); }
  }

  if (!show && !error) return <div className="route-loader" role="status"><span /><p>Loading show manager…</p></div>;
  if (!show) return <section className="status-card"><h1>Show unavailable</h1><p>{error}</p><Link to="/organiser/events" className="button button-ghost">Back</Link></section>;
  return <section className="workspace-page">
    <Link to="/organiser/events" className="back-button">← All shows</Link>
    <header className="workspace-heading"><div><p className="kicker">Show manager</p><h1>Edit {show.title}</h1><p>Content changes apply to this title; schedule and prices stay protected after sales begin.</p></div><Link className="button button-ghost" to={`/organiser/events/${eventId}`}>Open report</Link></header>
    <form className="workspace-card management-form" onSubmit={save}>
      <div className="panel-toolbar"><div><p className="kicker">Content and schedule</p><h2>Show details</h2></div><span className="workspace-chip">{show.status}</span></div>
      <div className="form-grid two"><label><span>Title</span><input className="form-control" required value={form.title ?? ""} onChange={(event) => change("title", event.target.value)} /></label><label><span>Genre</span><input className="form-control" value={form.genre ?? ""} onChange={(event) => change("genre", event.target.value)} /></label></div>
      <label><span>Description</span><textarea className="form-control" rows={4} value={form.description ?? ""} onChange={(event) => change("description", event.target.value)} /></label>
      <div className="form-grid four"><label><span>Date</span><input className="form-control" type="date" required value={form.date ?? ""} onChange={(event) => change("date", event.target.value)} /></label><label><span>Time</span><input className="form-control" type="time" required value={form.time ?? ""} onChange={(event) => change("time", event.target.value)} /></label><label><span>Language</span><input className="form-control" value={form.language ?? ""} onChange={(event) => change("language", event.target.value)} /></label><label><span>Format</span><input className="form-control" value={form.format ?? ""} onChange={(event) => change("format", event.target.value)} /></label></div>
      <div className="form-grid four"><label><span>Runtime</span><input className="form-control" type="number" min="15" max="600" value={form.durationMinutes ?? ""} onChange={(event) => change("durationMinutes", event.target.value)} /></label><label><span>Certificate</span><input className="form-control" value={form.certificate ?? ""} onChange={(event) => change("certificate", event.target.value)} /></label><label><span>Release date</span><input className="form-control" type="date" value={form.releaseDate ?? ""} onChange={(event) => change("releaseDate", event.target.value)} /></label><label><span>Other formats</span><input className="form-control" value={form.formats ?? ""} onChange={(event) => change("formats", event.target.value)} /></label></div>
      <div className="form-grid two"><label><span>Cast / performers</span><input className="form-control" value={(form.castNames || form.performerNames) ?? ""} onChange={(event) => change(show.content?.performerNames ? "performerNames" : "castNames", event.target.value)} /></label><label><span>Crew</span><input className="form-control" value={form.crewNames ?? ""} onChange={(event) => change("crewNames", event.target.value)} /></label></div>
      <div className="form-grid two"><label><span>Trailer URL</span><input className="form-control" type="url" value={form.trailerUrl ?? ""} onChange={(event) => change("trailerUrl", event.target.value)} /></label><label><span>Age / entry rules</span><input className="form-control" value={(form.ageRule || form.entryRule) ?? ""} onChange={(event) => change("entryRule", event.target.value)} /></label></div>
      <div className="price-editor">{show.prices.map((price) => <label key={price.categoryId}><span>{price.category.name} price</span><input className="form-control" type="number" min="1" value={prices[price.categoryId] ?? ""} onChange={(event) => setPrices((current) => ({ ...current, [price.categoryId]: event.target.value }))} /></label>)}</div>
      {error && <p className="form-message error" role="alert">{error}</p>}{message && <p className="inline-notice" role="status">{message}</p>}
      <button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
    </form>
    <section className="workspace-card management-form">
      <div className="panel-toolbar"><div><p className="kicker">Multi-show workflow</p><h2>Add several showtimes</h2></div><button type="button" className="button button-ghost compact" onClick={addSchedule}>＋ Add showtime</button></div>
      {schedules.length === 0 ? <p className="muted-copy">Add showtimes to reuse this content across active auditoriums.</p> : <div className="schedule-list">{schedules.map((schedule, index) => { const venue = venues.find((item) => item.id === schedule.venueId); return <div className="schedule-row" key={index}><input aria-label={`Show ${index + 1} date`} className="form-control" type="date" value={schedule.date} onChange={(event) => updateSchedule(index, { date: event.target.value })} /><input aria-label={`Show ${index + 1} time`} className="form-control" type="time" value={schedule.time} onChange={(event) => updateSchedule(index, { time: event.target.value })} /><select aria-label={`Show ${index + 1} venue`} className="form-control" value={schedule.venueId} onChange={(event) => { const next = venues.find((item) => item.id === event.target.value); updateSchedule(index, { venueId: event.target.value, auditoriumId: next?.auditoriums?.find((item) => !item.archivedAt)?.id ?? "" }); }}>{venues.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select aria-label={`Show ${index + 1} auditorium`} className="form-control" value={schedule.auditoriumId} onChange={(event) => updateSchedule(index, { auditoriumId: event.target.value })}>{venue?.auditoriums?.filter((item) => !item.archivedAt).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select aria-label={`Show ${index + 1} status`} className="form-control" value={schedule.status} onChange={(event) => updateSchedule(index, { status: event.target.value as ShowStatus })}><option value="PUBLISHED">Published</option><option value="DRAFT">Draft</option></select><button className="icon-button" type="button" aria-label={`Remove show ${index + 1}`} onClick={() => setSchedules((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>; })}</div>}
      {schedules.length > 0 && <button type="button" className="button button-primary" disabled={saving} onClick={createBatch}>Create {schedules.length} show{schedules.length === 1 ? "" : "s"}</button>}
    </section>
  </section>;
}
