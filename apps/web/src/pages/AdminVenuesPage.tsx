import type { VenueDto } from "@cinebook/shared";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { AccessibleDialog } from "../components/AccessibleDialog";

type CategoryDraft = { key: string; name: string; color: string; rows: string };
const freshCategory = (name = "", color = "#39d7a1", rows = ""): CategoryDraft => ({ key: crypto.randomUUID(), name, color, rows });
const defaults = () => [freshCategory("Premium", "#f59e0b", "1,2"), freshCategory("Standard", "#39d7a1", "3,4,5")];

export function AdminVenuesPage() {
  const [venues, setVenues] = useState<VenueDto[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VenueDto | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("Delhi NCR");
  const [address, setAddress] = useState("");
  const [auditorium, setAuditorium] = useState("Main Auditorium");
  const [rows, setRows] = useState("5");
  const [cols, setCols] = useState("8");
  const [categories, setCategories] = useState<CategoryDraft[]>(defaults);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const result = await api<{ venues: VenueDto[] }>("/api/venues");
    setVenues(result.venues);
  }, []);
  useEffect(() => { load().catch((reason) => setError(reason instanceof Error ? reason.message : "Venues could not be loaded")).finally(() => setLoading(false)); }, [load]);

  const coverage = useMemo(() => {
    const limit = Number(rows);
    const assignments = categories.flatMap((category) => category.rows.split(",").map((value) => Number(value.trim())).filter(Number.isInteger).map((row) => ({ row, color: category.color, name: category.name || "Unnamed" })));
    return Array.from({ length: Number.isInteger(limit) && limit > 0 && limit <= 50 ? limit : 0 }, (_, index) => assignments.find((item) => item.row === index + 1));
  }, [categories, rows]);

  function reset() { setEditingId(null); setName(""); setCity("Delhi NCR"); setAddress(""); setAuditorium("Main Auditorium"); setRows("5"); setCols("8"); setCategories(defaults()); setError(""); }
  function edit(venue: VenueDto) {
    if (venue._count.events) return setError("This layout is locked because an event already uses it. Create a new venue instead.");
    setEditingId(venue.id); setName(venue.name); setCity(venue.city); setAddress(venue.address ?? ""); setAuditorium(venue.auditorium); setRows(String(venue.rows)); setCols(String(venue.cols));
    setCategories(venue.categories.map((category) => freshCategory(category.name, category.color, Array.from(new Set(venue.seats.filter((seat) => seat.categoryId === category.id).map((seat) => seat.row))).sort((a, b) => a - b).join(","))));
    setMessage(""); setError(""); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function updateCategory(key: string, field: "name" | "color" | "rows", value: string) { setCategories((current) => current.map((category) => category.key === key ? { ...category, [field]: value } : category)); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(""); setError("");
    try {
      const body = { name, city, address, auditorium, rows: Number(rows), cols: Number(cols), categories: categories.map((category) => ({ name: category.name, color: category.color, rows: category.rows.split(",").map((value) => Number(value.trim())).filter(Number.isFinite) })) };
      await api(editingId ? `/api/venues/${editingId}` : "/api/venues", { method: editingId ? "PUT" : "POST", body: JSON.stringify(body) });
      setMessage(editingId ? "Venue layout updated." : "Venue and seat inventory created."); reset(); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Venue could not be saved"); }
    finally { setSaving(false); }
  }

  async function archiveVenue() {
    if (!deleteTarget) return;
    setDeleting(true); setError("");
    try { await api(`/api/admin/venues/${deleteTarget.id}/archive`, { method: "PATCH", body: JSON.stringify({ archived: !deleteTarget.archivedAt }) }); setMessage(deleteTarget.archivedAt ? "Venue restored." : "Venue archived."); setDeleteTarget(null); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Venue status could not be changed"); }
    finally { setDeleting(false); }
  }

  return (
    <section className="workspace-page">
      <header className="workspace-heading"><div><p className="kicker">Platform administration</p><h1>Venue architect.</h1><p>Build flexible auditoriums with named categories and complete row coverage.</p></div><span className="step-badge">{venues.length} venue{venues.length === 1 ? "" : "s"}</span></header>
      <div className="admin-layout">
        <form className="workspace-card venue-form" onSubmit={save}>
          <div className="panel-toolbar"><div><p className="kicker">{editingId ? "Layout editor" : "New inventory"}</p><h2>{editingId ? "Edit venue" : "Create venue"}</h2></div>{editingId && <button type="button" className="row-link" onClick={reset}>Cancel edit</button>}</div>
          <div className="form-grid two"><label><span>Venue name</span><input className="form-control" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required placeholder="City Arena" /></label><label><span>City</span><input className="form-control" value={city} onChange={(event) => setCity(event.target.value)} minLength={2} maxLength={80} required placeholder="Delhi NCR" /></label></div>
          <div className="form-grid two"><label><span>Auditorium</span><input className="form-control" value={auditorium} onChange={(event) => setAuditorium(event.target.value)} minLength={2} maxLength={80} required placeholder="Screen 1" /></label><label><span>Address</span><input className="form-control" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={200} placeholder="Central Arts District" /></label></div>
          <div className="form-grid two"><label><span>Rows</span><input className="form-control" value={rows} onChange={(event) => setRows(event.target.value)} type="number" min="1" max="50" required /></label><label><span>Seats per row</span><input className="form-control" value={cols} onChange={(event) => setCols(event.target.value)} type="number" min="1" max="50" required /></label></div>
          <div className="category-heading"><div><h3>Seat categories</h3><p>Assign every row exactly once using comma-separated numbers.</p></div><button type="button" className="button button-ghost compact" disabled={categories.length >= 10} onClick={() => setCategories((current) => [...current, freshCategory()])}>＋ Add category</button></div>
          <div className="category-editor">{categories.map((category, index) => <div className="category-row" key={category.key}><span className="category-number">{String(index + 1).padStart(2, "0")}</span><label><span>Name</span><input className="form-control" value={category.name} onChange={(event) => updateCategory(category.key, "name", event.target.value)} required placeholder="Balcony" aria-label={`Category ${index + 1} name`} /></label><label><span>Colour</span><div className="color-field"><input type="color" value={category.color} onChange={(event) => updateCategory(category.key, "color", event.target.value)} aria-label={`Category ${index + 1} colour`} /><code>{category.color}</code></div></label><label><span>Rows</span><input className="form-control" value={category.rows} onChange={(event) => updateCategory(category.key, "rows", event.target.value)} required placeholder="1,2" aria-label={`Category ${index + 1} rows`} /></label><button type="button" className="icon-button" aria-label={`Remove category ${index + 1}`} disabled={categories.length === 1} onClick={() => setCategories((current) => current.filter((item) => item.key !== category.key))}>×</button></div>)}</div>
          <div className="row-preview"><div><strong>Row coverage</strong><span>{coverage.filter(Boolean).length}/{coverage.length || 0} assigned</span></div><div>{coverage.map((assignment, index) => <span key={index} title={assignment ? `Row ${index + 1}: ${assignment.name}` : `Row ${index + 1}: unassigned`} style={assignment ? { backgroundColor: assignment.color } : undefined}>{index + 1}</span>)}</div></div>
          {error && <p className="form-message error" role="alert">{error}</p>}{message && <p className="inline-notice" role="status">{message}</p>}
          <button className="button button-primary full-button" type="submit" disabled={saving}>{saving ? "Saving layout…" : editingId ? "Update venue" : "Create venue"}</button>
        </form>

        <section className="venue-list"><div className="panel-toolbar"><div><p className="kicker">Saved layouts</p><h2>Existing venues</h2></div></div>{loading ? <div className="workspace-skeleton" /> : venues.map((venue) => <article className={`workspace-card venue-card${venue.archivedAt ? " archived-card" : ""}`} key={venue.id}><div className="venue-card-top"><div><span className={`workspace-chip ${venue._count.events ? "locked" : ""}`}>{venue.archivedAt ? "Archived" : venue._count.events ? "Layout locked" : "Editable"}</span><h3>{venue.name}</h3><p>{venue.city} · {venue.auditorium}</p><p>{venue.rows} rows × {venue.cols} seats · {venue.rows * venue.cols} total</p></div><strong>{venue._count.events}<small>events</small></strong></div><div className="venue-categories">{venue.categories.map((category) => <span key={category.id}><i style={{ backgroundColor: category.color }} />{category.name}</span>)}</div><footer><button type="button" disabled={Boolean(venue._count.events) || Boolean(venue.archivedAt)} onClick={() => edit(venue)}>Edit layout</button><button type="button" className={venue.archivedAt ? "" : "danger-text"} onClick={() => setDeleteTarget(venue)}>{venue.archivedAt ? "Restore" : "Archive"}</button></footer></article>)}</section>
      </div>
      {deleteTarget && <AccessibleDialog labelledBy="archive-venue-title" className="confirm-dialog" locked={deleting} onClose={() => setDeleteTarget(null)}><span className="dialog-icon" aria-hidden="true">!</span><h2 id="archive-venue-title">{deleteTarget.archivedAt ? "Restore" : "Archive"} {deleteTarget.name}?</h2><p>{deleteTarget.archivedAt ? "The venue will become available for new shows again." : "Existing shows and bookings remain intact, but organisers cannot schedule new shows here."}</p><div><button type="button" className="button button-ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" className={deleteTarget.archivedAt ? "button button-primary" : "button danger-button"} disabled={deleting} onClick={archiveVenue}>{deleting ? "Saving…" : deleteTarget.archivedAt ? "Restore venue" : "Archive venue"}</button></div></AccessibleDialog>}
    </section>
  );
}
