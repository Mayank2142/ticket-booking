"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import type { EventSalesSummaryDto, EventSummaryDto } from "@/contracts/api";
import { api } from "@/lib/client";
import { formatEventDate } from "@/lib/presentation";

type Event = EventSummaryDto;
type Summary = Pick<EventSalesSummaryDto, "totalBookings" | "revenue">;

export default function OrganiserEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ events: Event[] }>("/api/events?mine=true")
      .then(async ({ events: ownedEvents }) => {
        setEvents(ownedEvents);
        const settled = await Promise.allSettled(
          ownedEvents.map(async (event) => [event.id, await api<Summary>(`/api/organiser/events/${event.id}/summary`)] as const)
        );
        setSummaries(Object.fromEntries(settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])));
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const totalRevenue = Object.values(summaries).reduce((sum, summary) => sum + summary.revenue, 0);
  const totalBookings = Object.values(summaries).reduce((sum, summary) => sum + summary.totalBookings, 0);

  return (
    <AuthGate roles={["ORGANISER", "ADMIN"]}>
      <section className="space-y-8 pb-10">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="section-kicker">Organiser studio</p>
            <h1 className="section-title">Event dashboard</h1>
            <p className="mt-2 text-sm muted">Track sales, revenue and inventory across your live listings.</p>
          </div>
          <Link href="/organiser/events/new" className="btn btn-primary">＋ Create event</Link>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Published events", events.length],
            ["Confirmed bookings", totalBookings],
            ["Gross revenue", `₹${totalRevenue.toLocaleString("en-IN")}`],
          ].map(([label, value]) => (
            <div key={label} className="card p-5"><p className="label">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>
          ))}
        </div>

        {error && <p className="message">{error}</p>}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="font-semibold">Your listings</h2>
            <span className="text-xs muted">Live performance</span>
          </div>
          {loading ? <div className="skeleton m-5 h-48 rounded-2xl" /> : events.length === 0 ? (
            <div className="p-10 text-center"><p className="muted">No events published yet.</p><Link href="/organiser/events/new" className="btn btn-primary mt-4">Create your first event</Link></div>
          ) : (
            <div className="divide-y divide-white/10">
              {events.map((event) => {
                const summary = summaries[event.id];
                return (
                  <article key={event.id} className="grid gap-4 p-5 transition hover:bg-white/[0.025] md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center">
                    <div><span className="label">{event.type}</span><h3 className="mt-1 font-semibold">{event.title}</h3><p className="mt-1 text-xs muted">{event.venue.name}</p></div>
                    <div><p className="text-xs muted">Showtime</p><p className="mt-1 text-sm">{formatEventDate(event.date)} · {event.time}</p></div>
                    <div className="flex gap-8"><div><p className="text-xs muted">Bookings</p><p className="mt-1 font-semibold">{summary?.totalBookings ?? "—"}</p></div><div><p className="text-xs muted">Revenue</p><p className="mt-1 font-semibold text-emerald-300">{summary ? `₹${summary.revenue.toLocaleString("en-IN")}` : "—"}</p></div></div>
                    <Link href={`/organiser/events/${event.id}`} className="btn text-xs">View report →</Link>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </AuthGate>
  );
}
