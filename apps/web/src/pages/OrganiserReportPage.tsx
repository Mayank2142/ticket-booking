import type { EventSalesSummaryDto } from "@cinebook/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, downloadApiFile } from "../lib/api";
import { formatEventDate } from "../lib/presentation";

export function OrganiserReportPage() {
  const { eventId = "" } = useParams();
  const [summary, setSummary] = useState<EventSalesSummaryDto | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<EventSalesSummaryDto>(`/api/organiser/events/${eventId}/summary`)
      .then(setSummary)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Report could not be loaded"));
  }, [eventId]);

  if (error) return <section className="status-card"><span>!</span><h1>Report unavailable</h1><p>{error}</p><Link to="/organiser/events" className="button button-ghost">Back to dashboard</Link></section>;
  if (!summary) return <div className="route-loader" role="status"><span /><p>Preparing sales report…</p></div>;
  const totalTickets = summary.byCategory.reduce((total, category) => total + category.booked, 0);
  const maxBooked = Math.max(1, ...summary.byCategory.map((category) => category.booked));

  return (
    <section className="workspace-page">
      <Link to="/organiser/events" className="back-button">← All events</Link>
      <header className="workspace-heading report-heading"><div><p className="kicker">Sales intelligence</p><h1>{summary.event.title}</h1><p>{formatEventDate(summary.event.date)} · {summary.event.time}</p></div><div className="heading-actions"><button type="button" className="button button-ghost" onClick={() => downloadApiFile(`/api/organiser/reports.csv?showId=${eventId}`, `${summary.event.title}-bookings.csv`).catch((reason) => setError(reason.message))}>Export CSV</button><Link to={`/organiser/events/${eventId}/edit`} className="button button-ghost">Edit show</Link><Link to={`/events/${eventId}`} className="button button-ghost">Public listing ↗</Link></div></header>
      <div className="metric-grid"><Metric label="Confirmed bookings" value={summary.totalBookings.toLocaleString("en-IN")} /><Metric label="Tickets sold" value={totalTickets.toLocaleString("en-IN")} /><Metric label="Gross revenue" value={`₹${summary.revenue.toLocaleString("en-IN")}`} accent /></div>
      <div className="report-grid">
        <section className="workspace-card category-chart"><div className="panel-toolbar"><div><p className="kicker">Category demand</p><h2>Tickets sold</h2></div><span>{totalTickets} total</span></div><div className="bar-list">{summary.byCategory.map((row) => <div key={row.category}><div><strong>{row.category}</strong><span>{row.booked} tickets · ₹{row.price}</span></div><div className="bar-track"><i style={{ width: `${(row.booked / maxBooked) * 100}%` }} /></div></div>)}</div></section>
        <section className="workspace-card category-table-card"><div className="panel-toolbar"><div><p className="kicker">Revenue model</p><h2>Price breakdown</h2></div></div><div className="report-table"><div className="report-row report-head"><span>Category</span><span>Booked</span><span>Price</span><span>Value</span></div>{summary.byCategory.map((row) => <div className="report-row" key={row.category}><strong>{row.category}</strong><span>{row.booked}</span><span>₹{row.price}</span><strong className="accent-value">₹{(row.booked * row.price).toLocaleString("en-IN")}</strong></div>)}</div></section>
      </div>
      {summary.inventory && <section className="workspace-card"><div className="panel-toolbar"><div><p className="kicker">Live inventory</p><h2>Seat and waitlist status</h2></div></div><div className="inventory-grid">{Object.entries(summary.inventory).map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</div></section>}
      <section className="workspace-card data-table-card"><div className="panel-toolbar"><div><p className="kicker">Audience</p><h2>Attendee and booking list</h2></div></div><div className="data-table"><div className="data-row data-head"><span>Reference</span><span>Customer</span><span>Seats</span><span>Total</span><span>Booked</span></div>{summary.bookings?.map((booking) => <div className="data-row" key={booking.id}><strong>{booking.ref}</strong><span>{booking.customer.name}<small>{booking.customer.email}</small></span><span>{booking.seats.join(", ")}</span><strong>₹{booking.totalAmount.toLocaleString("en-IN")}</strong><span>{new Date(booking.createdAt).toLocaleDateString("en-IN")}</span></div>)}{!summary.bookings?.length && <p className="muted-copy">No confirmed attendees yet.</p>}</div></section>
    </section>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <article className={`metric-card${accent ? " accent-metric" : ""}`}><small>{label}</small><strong>{value}</strong><span>Confirmed only</span></article>;
}
