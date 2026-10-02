"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import type { EventSalesSummaryDto } from "@/contracts/api";
import { api } from "@/lib/client";

type Summary = EventSalesSummaryDto;

export default function OrganiserSummaryPage() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    api<Summary>(`/api/organiser/events/${id}/summary`).then(setSummary).catch(console.error);
  }, [id]);

  if (!summary) return <p className="muted text-sm">Loading...</p>;

  const maxBooked = Math.max(1, ...summary.byCategory.map((row) => row.booked));

  return (
    <AuthGate roles={["ORGANISER", "ADMIN"]}>
      <div className="space-y-7 pb-10">
        <div>
          <p className="section-kicker">Sales report</p>
          <h1 className="section-title">{summary.event.title}</h1>
          <p className="mt-1 text-sm muted">{summary.event.date} · {summary.event.time}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card p-5">
            <p className="label">Total bookings</p>
            <p className="mt-1 text-3xl font-semibold">{summary.totalBookings}</p>
          </div>
          <div className="card p-5">
            <p className="label">Revenue</p>
            <p className="mt-1 text-3xl font-semibold">₹{summary.revenue}</p>
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_.8fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold">Category breakdown</h2></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="p-4 font-medium muted">Category</th>
                <th className="p-4 font-medium muted">Booked</th>
                <th className="p-4 font-medium muted">Price</th>
              </tr>
            </thead>
            <tbody>
              {summary.byCategory.map((row) => (
                <tr key={row.category} className="border-b border-white/10">
                  <td className="p-4">{row.category}</td>
                  <td className="p-4 muted">{row.booked}</td>
                  <td className="p-4">₹{row.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card p-5"><p className="label">Tickets sold by category</p><div className="mt-6 space-y-5">{summary.byCategory.map((row) => <div key={row.category}><div className="mb-2 flex justify-between text-sm"><span>{row.category}</span><span className="muted">{row.booked}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${(row.booked / maxBooked) * 100}%` }} /></div></div>)}</div></div>
        </div>
      </div>
    </AuthGate>
  );
}
