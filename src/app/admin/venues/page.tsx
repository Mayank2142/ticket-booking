"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import type { VenueDto } from "@/contracts/api";
import { api } from "@/lib/client";

type Venue = VenueDto;
type CategoryDraft = { key: string; name: string; color: string; rows: string };

const defaultCategories = (): CategoryDraft[] => [
  { key: crypto.randomUUID(), name: "Premium", color: "#f59e0b", rows: "1,2" },
  { key: crypto.randomUUID(), name: "Standard", color: "#6366f1", rows: "3,4,5" },
];

export default function AdminVenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [rows, setRows] = useState("5");
  const [cols, setCols] = useState("8");
  const [categories, setCategories] = useState<CategoryDraft[]>(defaultCategories);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await api<{ venues: Venue[] }>("/api/venues");
    setVenues(data.venues);
  }, []);

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setRows("5");
    setCols("8");
    setCategories(defaultCategories());
  }

  function editVenue(venue: Venue) {
    if (venue._count.events > 0) {
      setMessage("This venue already has events, so its seat layout is locked. Create a new venue for a new layout.");
      return;
    }
    setEditingId(venue.id);
    setName(venue.name);
    setRows(String(venue.rows));
    setCols(String(venue.cols));
    setCategories(
      venue.categories.map((category) => ({
        key: category.id,
        name: category.name,
        color: category.color,
        rows: Array.from(new Set(venue.seats.filter((seat) => seat.categoryId === category.id).map((seat) => seat.row)))
          .sort((a, b) => a - b)
          .join(","),
      }))
    );
    setMessage(`Editing ${venue.name}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const body = {
        name,
        rows: Number(rows),
        cols: Number(cols),
        categories: categories.map((category) => ({
          name: category.name,
          color: category.color,
          rows: category.rows
            .split(",")
            .map((row) => Number(row.trim()))
            .filter((row) => Number.isFinite(row)),
        })),
      };
      await api(editingId ? `/api/venues/${editingId}` : "/api/venues", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setMessage(editingId ? "Venue updated." : "Venue created.");
      resetForm();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Venue could not be saved");
    } finally {
      setSaving(false);
    }
  }

  async function deleteVenue(venue: Venue) {
    if (!window.confirm(`Delete ${venue.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/venues/${venue.id}`, { method: "DELETE" });
      setMessage("Venue deleted.");
      if (editingId === venue.id) resetForm();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Venue could not be deleted");
    }
  }

  function updateCategory(key: string, field: keyof Omit<CategoryDraft, "key">, value: string) {
    setCategories((current) =>
      current.map((category) => (category.key === key ? { ...category, [field]: value } : category))
    );
  }

  return (
    <AuthGate roles={["ADMIN"]}>
      <div className="space-y-8">
        <div>
          <p className="label">Administration</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Venue & seat layouts</h1>
          <p className="mt-2 max-w-2xl text-sm muted">
            Assign every row to a category. Layouts are locked after an event starts using the venue to protect sold tickets.
          </p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-5 p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-medium">{editingId ? "Edit venue" : "Create venue"}</h2>
            {editingId && <button type="button" onClick={resetForm} className="btn text-xs">Cancel edit</button>}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="muted">Venue name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required className="input w-full" placeholder="City Arena" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="muted">Rows</span>
              <input value={rows} onChange={(event) => setRows(event.target.value)} type="number" min="1" max="50" required className="input w-full" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="muted">Seats per row</span>
              <input value={cols} onChange={(event) => setCols(event.target.value)} type="number" min="1" max="50" required className="input w-full" />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Seat categories</h3>
                <p className="mt-1 text-xs muted">Use comma-separated row numbers. Each row must appear exactly once.</p>
              </div>
              <button
                type="button"
                className="btn text-xs"
                onClick={() => setCategories((current) => [...current, { key: crypto.randomUUID(), name: "", color: "#22c55e", rows: "" }])}
              >
                Add category
              </button>
            </div>

            {categories.map((category, index) => (
              <div key={category.key} className="grid gap-3 rounded-xl border border-white/10 p-4 md:grid-cols-[1fr_120px_1fr_auto]">
                <input value={category.name} onChange={(event) => updateCategory(category.key, "name", event.target.value)} required className="input w-full" placeholder={`Category ${index + 1}`} aria-label={`Category ${index + 1} name`} />
                <input value={category.color} onChange={(event) => updateCategory(category.key, "color", event.target.value)} type="color" required className="h-10 w-full cursor-pointer rounded-xl bg-transparent" aria-label={`Category ${index + 1} colour`} />
                <input value={category.rows} onChange={(event) => updateCategory(category.key, "rows", event.target.value)} required className="input w-full" placeholder="Rows, e.g. 1,2" aria-label={`Category ${index + 1} rows`} />
                <button type="button" disabled={categories.length === 1} onClick={() => setCategories((current) => current.filter((item) => item.key !== category.key))} className="btn text-xs">Remove</button>
              </div>
            ))}
          </div>

          <button disabled={saving} type="submit" className="btn btn-primary">
            {saving ? "Saving…" : editingId ? "Update venue" : "Create venue"}
          </button>
        </form>

        {message && <p className="message">{message}</p>}

        <div className="space-y-3">
          <h2 className="font-medium">Existing venues</h2>
          {venues.map((venue) => (
            <article key={venue.id} className="card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="font-medium">{venue.name}</h3>
                <p className="mt-1 text-sm muted">
                  {venue.rows} × {venue.cols} · {venue.rows * venue.cols} seats · {venue._count.events} events
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {venue.categories.map((category) => (
                    <span key={category.id} className="rounded-full px-2.5 py-1 text-xs" style={{ backgroundColor: category.color, color: "#0f0f0f" }}>
                      {category.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => editVenue(venue)} disabled={venue._count.events > 0} className="btn text-xs">Edit layout</button>
                <button onClick={() => deleteVenue(venue)} disabled={venue._count.events > 0} className="btn text-xs">Delete</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </AuthGate>
  );
}
