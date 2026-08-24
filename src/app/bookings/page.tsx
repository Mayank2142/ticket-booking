"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { QrTicket } from "@/components/QrTicket";
import { api } from "@/lib/client";
import { eventArtwork, formatEventDate } from "@/lib/presentation";

type Booking = {
  id: string;
  ref: string;
  status: string;
  totalAmount: number;
  event: { id: string; title: string; type: "MOVIE" | "CONCERT"; date: string; time: string; venue: { name: string } };
  seats: { seat: { label: string } }[];
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const data = await api<{ bookings: Booking[] }>("/api/bookings");
    setBookings(data.bookings);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message)).finally(() => setLoading(false));
  }, []);

  async function cancel(id: string) {
    if (!window.confirm("Cancel this booking and release its seats?")) return;
    try {
      await api(`/api/bookings/${id}`, { method: "DELETE" });
      setMessage("Booking cancelled. Any eligible seats have been offered to the waitlist.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cancellation failed");
    }
  }

  return (
    <AuthGate roles={["CUSTOMER"]}>
      <section className="space-y-8 pb-10">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="section-kicker">Your cinema wallet</p>
            <h1 className="section-title">My tickets</h1>
            <p className="mt-2 text-sm muted">Confirmed tickets, QR passes and past bookings in one place.</p>
          </div>
          <Link href="/#now-showing" className="btn">Explore events</Link>
        </header>

        {message && <p className="message" role="status">{message}</p>}

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[0, 1].map((item) => <div key={item} className="skeleton h-64 rounded-[24px]" />)}
          </div>
        ) : bookings.length === 0 ? (
          <div className="card grid min-h-72 place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-400/10 text-2xl">🎟</div>
              <h2 className="mt-4 text-xl font-semibold">No tickets yet</h2>
              <p className="mt-2 text-sm muted">Your next great night out is only a few clicks away.</p>
              <Link href="/" className="btn btn-primary mt-5">Browse now showing</Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {bookings.map((booking) => {
              const active = booking.status === "CONFIRMED";
              return (
                <article key={booking.id} className="card overflow-hidden">
                  <div className="grid min-h-64 grid-cols-[110px_1fr] sm:grid-cols-[145px_1fr]">
                    <div className="relative overflow-hidden">
                      <Image src={eventArtwork(booking.event.type)} alt="" fill className="object-cover" sizes="145px" />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0a1510]" />
                    </div>
                    <div className="flex min-w-0 flex-col p-5 pl-3 sm:pl-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className={active ? "cinema-pill" : "rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/55"}>{booking.status}</span>
                          <h2 className="mt-3 truncate text-xl font-bold">{booking.event.title}</h2>
                        </div>
                        {active && <QrTicket reference={booking.ref} size={68} />}
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <div><dt className="muted">Date & time</dt><dd className="mt-1 font-medium">{formatEventDate(booking.event.date)} · {booking.event.time}</dd></div>
                        <div><dt className="muted">Seats</dt><dd className="mt-1 font-medium">{booking.seats.map((seat) => seat.seat.label).join(", ")}</dd></div>
                        <div><dt className="muted">Venue</dt><dd className="mt-1 font-medium">{booking.event.venue.name}</dd></div>
                        <div><dt className="muted">Total</dt><dd className="mt-1 font-medium text-emerald-300">₹{booking.totalAmount}</dd></div>
                      </dl>
                      <p className="mt-auto pt-5 font-mono text-[11px] tracking-wider text-white/40">{booking.ref}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-dashed border-white/10 px-5 py-3">
                    <Link href={`/events/${booking.event.id}`} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">View event</Link>
                    {active && <button onClick={() => cancel(booking.id)} className="text-xs font-semibold text-white/50 transition hover:text-red-300">Cancel booking</button>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AuthGate>
  );
}
