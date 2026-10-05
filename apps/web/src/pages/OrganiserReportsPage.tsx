import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadApiFile } from "../lib/api";

type Report = {
  shows: Array<{ id: string; title: string; date: string; time: string }>;
  rows: Array<{ bookingId: string; reference: string; showTitle: string; showDate: string; showTime: string; customerName: string; customerEmail: string; seats: string; total: number; bookedAt: string }>;
  totals: { bookings: number; tickets: number; revenue: number };
};

export function OrganiserReportsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [showId, setShowId] = useState("");
  const [error, setError] = useState("");
  const query = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(showId ? { showId } : {}) }).toString();
  function load() { setError(""); api<Report>(`/api/organiser/reports${query ? `?${query}` : ""}`).then(setReport).catch((reason) => setError(reason instanceof Error ? reason.message : "Report could not be loaded")); }
  useEffect(load, []); // Initial overview; filters are applied explicitly.
  return <section className="workspace-page">
    <Link to="/organiser/events" className="back-button">← Organiser dashboard</Link>
    <header className="workspace-heading"><div><p className="kicker">Booking reports</p><h1>Every confirmed attendee.</h1><p>Filter by date or show, inspect bookings, and export the same result as CSV.</p></div><button className="button button-primary" type="button" onClick={() => downloadApiFile(`/api/organiser/reports.csv${query ? `?${query}` : ""}`, "cinebook-bookings.csv").catch((reason) => setError(reason.message))}>Export CSV</button></header>
    <section className="workspace-card report-filters"><label><span>From</span><input className="form-control" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label><span>To</span><input className="form-control" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label><span>Show</span><select className="form-control" value={showId} onChange={(event) => setShowId(event.target.value)}><option value="">All shows</option>{report?.shows.map((show) => <option value={show.id} key={show.id}>{show.title} · {show.date}</option>)}</select></label><button className="button button-ghost" type="button" onClick={load}>Apply filters</button></section>
    {error && <p className="form-message error" role="alert">{error}</p>}
    {report && <><div className="metric-grid"><Metric label="Bookings" value={String(report.totals.bookings)} /><Metric label="Tickets" value={String(report.totals.tickets)} /><Metric label="Revenue" value={`₹${report.totals.revenue.toLocaleString("en-IN")}`} /></div><section className="workspace-card data-table-card"><div className="panel-toolbar"><div><p className="kicker">Confirmed only</p><h2>Attendee and booking list</h2></div></div><div className="data-table"><div className="data-row data-head"><span>Reference</span><span>Show</span><span>Customer</span><span>Seats</span><span>Total</span></div>{report.rows.map((row) => <div className="data-row" key={row.bookingId}><strong>{row.reference}</strong><span>{row.showTitle}<small>{row.showDate} · {row.showTime}</small></span><span>{row.customerName}<small>{row.customerEmail}</small></span><span>{row.seats}</span><strong>₹{row.total.toLocaleString("en-IN")}</strong></div>)}{report.rows.length === 0 && <p className="muted-copy">No confirmed bookings match these filters.</p>}</div></section></>}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="metric-card"><small>{label}</small><strong>{value}</strong><span>Filtered result</span></article>; }
