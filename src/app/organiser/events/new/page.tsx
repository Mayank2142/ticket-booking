"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import type { VenueOptionDto } from "@/contracts/api";
import { api } from "@/lib/client";

type Venue = VenueOptionDto;

export default function NewEventPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<{ venues: Venue[] }>("/api/venues").then((d) => setVenues(d.venues));
  }, []);

  const venue = venues.find((v) => v.id === venueId);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!venue) return;

    try {
      const data = await api<{ event: { id: string } }>("/api/events", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          type: form.get("type"),
          description: form.get("description"),
          venueId,
          date: form.get("date"),
          time: form.get("time"),
          prices: venue.categories.map((c) => ({
            categoryId: c.id,
            price: Number(prices[c.id] ?? 0),
          })),
        }),
      });
      router.push(`/organiser/events/${data.event.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <AuthGate roles={["ORGANISER", "ADMIN"]}>
      <div className="mx-auto max-w-3xl space-y-7 pb-10">
        <header><p className="section-kicker">Organiser studio</p><h1 className="section-title">Create a new listing</h1><p className="mt-2 text-sm muted">Publish a movie or live event with category-specific ticket prices.</p></header>
        <form onSubmit={onSubmit} className="card space-y-6 p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm"><span className="muted">Event title</span><input name="title" required placeholder="Midnight premiere" className="input w-full" /></label>
          <label className="space-y-2 text-sm"><span className="muted">Event type</span><select name="type" className="input w-full">
            <option value="CONCERT">Concert</option>
            <option value="MOVIE">Movie</option>
          </select></label></div>
          <label className="block space-y-2 text-sm"><span className="muted">Description</span><textarea name="description" placeholder="Tell customers what makes this show unmissable…" className="input min-h-[110px] w-full resize-y rounded-2xl" /></label>
          <label className="block space-y-2 text-sm"><span className="muted">Venue</span><select
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            required
            className="input w-full"
          >
            <option value="">Select venue</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm"><span className="muted">Show date</span><input name="date" type="date" required className="input w-full" /></label><label className="space-y-2 text-sm"><span className="muted">Start time</span><input name="time" type="time" required className="input w-full" /></label></div>
          {venue && <div><p className="label">Category pricing</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{venue.categories.map((c) => (
            <label key={c.id} className="space-y-2 text-sm"><span className="muted">{c.name} price (₹)</span><input
              key={c.id}
              type="number"
              min="1"
              required
              placeholder="0"
              className="input w-full"
              onChange={(e) => setPrices((p) => ({ ...p, [c.id]: e.target.value }))}
            /></label>
          ))}</div></div>}
          {message && <p className="message">{message}</p>}
          <div className="flex justify-end"><button type="submit" className="btn btn-primary min-w-40">Publish event →</button></div>
        </form>
      </div>
    </AuthGate>
  );
}
