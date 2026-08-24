"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EventCard } from "@/components/EventCard";
import { api } from "@/lib/client";
import { eventArtwork, eventPresentation, formatEventDate, startingPrice } from "@/lib/presentation";

type Event = {
  id: string;
  title: string;
  type: "MOVIE" | "CONCERT";
  description?: string | null;
  date: string;
  time: string;
  venue: { name: string };
  organiser: { name: string };
  prices: { price: number; category: { name: string } }[];
};

const comingSoon = [
  { title: "Emerald Horizon", date: "12 Dec", genre: "Sci-fi · Adventure", image: "/images/portal-poster.png" },
  { title: "Midnight Overture", date: "19 Dec", genre: "Music · Drama", image: "/images/cinema-hero.png" },
  { title: "Beyond the Gate", date: "08 Jan", genre: "Mystery · Fantasy", image: "/images/portal-poster.png" },
];

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [sort, setSort] = useState("date");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notified, setNotified] = useState<string[]>([]);

  useEffect(() => {
    api<{ events: Event[] }>("/api/events")
      .then((data) => setEvents(data.events))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Events could not be loaded"))
      .finally(() => setLoading(false));
  }, []);

  const venues = useMemo(() => Array.from(new Set(events.map((event) => event.venue.name))).sort(), [events]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = events.filter((event) =>
      (!normalized || `${event.title} ${event.venue.name}`.toLowerCase().includes(normalized)) &&
      (!type || event.type === type) &&
      (!venue || event.venue.name === venue) &&
      (!date || event.date === date)
    );
    return [...result].sort((a, b) => {
      if (sort === "price") return startingPrice(a.prices) - startingPrice(b.prices);
      if (sort === "title") return a.title.localeCompare(b.title);
      return `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`);
    });
  }, [date, events, query, sort, type, venue]);

  const featured = events[0];
  const movies = filtered.filter((event) => event.type === "MOVIE");
  const liveEvents = filtered.filter((event) => event.type === "CONCERT");
  const showing = movies.length ? movies : filtered;

  return (
    <div className="space-y-20">
      {featured ? <Hero event={featured} /> : <HeroSkeleton />}

      <section id="discover" className="scroll-mt-24 space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div><p className="section-kicker">Find your next show</p><h2 className="section-title">Discover what’s on</h2></div>
          <button onClick={() => setFiltersOpen((value) => !value)} className="btn md:hidden">{filtersOpen ? "Hide filters" : "Filters"}</button>
        </div>
        <div className="card p-3 sm:p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,2fr)_repeat(4,minmax(120px,1fr))]">
            <label className="relative">
              <span className="sr-only">Search</span>
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="input w-full pl-10" placeholder="Search movies, concerts, venues" />
            </label>
            <div className={`${filtersOpen ? "contents" : "hidden md:contents"}`}>
              <select value={venue} onChange={(event) => setVenue(event.target.value)} className="input w-full" aria-label="Venue"><option value="">All venues</option>{venues.map((name) => <option key={name}>{name}</option>)}</select>
              <input value={date} onChange={(event) => setDate(event.target.value)} type="date" className="input w-full" aria-label="Date" />
              <select value={type} onChange={(event) => setType(event.target.value)} className="input w-full" aria-label="Category"><option value="">All categories</option><option value="MOVIE">Movies</option><option value="CONCERT">Concerts</option></select>
              <select value={sort} onChange={(event) => setSort(event.target.value)} className="input w-full" aria-label="Sort events"><option value="date">Soonest</option><option value="price">Lowest price</option><option value="title">A–Z</option></select>
            </div>
          </div>
        </div>
      </section>

      <section id="now-showing" className="scroll-mt-24 space-y-7">
        <SectionHeading kicker="In cinemas now" title="Now Showing" description="Premium seats, instant confirmation, and a QR ticket delivered to your inbox." />
        {loading ? <CardSkeletons /> : error ? <ErrorState message={error} /> : showing.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {showing.map((event) => <EventCard key={event.id} event={event} />)}
          </div>
        ) : <EmptyState title="No shows match those filters" body="Try a different date, venue, or category." />}
      </section>

      <section className="space-y-7">
        <SectionHeading kicker="First look" title="Coming Soon" description="Be the first to know when reservations open." />
        <div className="flex snap-x gap-4 overflow-x-auto pb-4">
          {comingSoon.map((item, index) => (
            <article key={item.title} className="group min-w-[230px] snap-start sm:min-w-[260px]">
              <div className="relative aspect-[3/2] overflow-hidden rounded-[18px] border border-white/10">
                <Image src={item.image} alt="" fill sizes="260px" className={`object-cover transition duration-500 group-hover:scale-105 ${index === 1 ? "object-[70%_center]" : ""}`} />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
                <span className="absolute left-3 top-3 cinema-pill">{item.date}</span>
              </div>
              <h3 className="mt-3 font-semibold">{item.title}</h3><p className="mt-1 text-xs text-white/45">{item.genre}</p>
              <button onClick={() => setNotified((items) => items.includes(item.title) ? items.filter((title) => title !== item.title) : [...items, item.title])} className="btn mt-3 min-h-9 px-4 py-1.5 text-xs">
                {notified.includes(item.title) ? "✓ You’ll be notified" : "Notify me"}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section id="live-events" className="scroll-mt-24 space-y-7">
        <SectionHeading kicker="On stage" title="Live Events & Concerts" description="Big nights, live performances, and the best view in the house." />
        {loading ? <CardSkeletons count={3} /> : liveEvents.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {liveEvents.map((event) => <LiveEventCard key={event.id} event={event} />)}
          </div>
        ) : <EmptyState title="No live events listed" body="New concerts will appear here as organisers publish them." />}
      </section>
    </div>
  );
}

function Hero({ event }: { event: Event }) {
  const meta = eventPresentation(event.type);
  return (
    <section className="relative min-h-[480px] overflow-hidden rounded-[28px] border border-white/10 shadow-2xl shadow-black/40 sm:min-h-[520px]">
      <Image src="/images/cinema-hero.png" alt="" fill priority sizes="(max-width: 1280px) 100vw, 1280px" className="object-cover object-[68%_center]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(1,8,5,.98)_0%,rgba(1,8,5,.86)_36%,rgba(1,8,5,.2)_75%),linear-gradient(0deg,rgba(1,8,5,.82),transparent_50%)]" />
      <div className="relative flex min-h-[480px] max-w-2xl flex-col justify-end p-6 sm:min-h-[520px] sm:p-10 lg:p-14">
        <div className="mb-auto flex items-center gap-2"><span className="cinema-pill">Featured</span><span className="rating-pill">★ {meta.rating} audience rating</span></div>
        <p className="section-kicker">{event.type === "MOVIE" ? "Now showing" : "Live experience"}</p>
        <h1 className="max-w-xl text-4xl font-bold leading-[1.05] tracking-[-0.04em] sm:text-6xl">{event.title}</h1>
        <p className="mt-5 max-w-xl text-sm leading-6 text-white/65 sm:text-base">{event.description || "An unforgettable night of entertainment, live energy, and seats chosen exactly the way you want."}</p>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/55 sm:text-sm"><span>{meta.genre}</span><span>•</span><span>{meta.duration}</span><span>•</span><span>{meta.language}</span><span>•</span><span>{event.venue.name}</span></div>
        <div className="mt-8 flex flex-wrap gap-3"><Link href={`/events/${event.id}#seats`} className="btn btn-primary">Book tickets <span aria-hidden>→</span></Link><Link href={`/events/${event.id}`} className="btn">View details</Link></div>
      </div>
    </section>
  );
}

function LiveEventCard({ event }: { event: Event }) {
  return (
    <article className="card group overflow-hidden">
      <Link href={`/events/${event.id}`} className="grid sm:grid-cols-[150px_1fr]">
        <div className="relative min-h-44 overflow-hidden"><Image src={eventArtwork(event.type)} alt="" fill sizes="150px" className="object-cover object-[68%_center] transition duration-500 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#08130e]/70" /></div>
        <div className="flex flex-col justify-center p-5"><p className="label">Live concert</p><h3 className="mt-2 text-xl font-semibold">{event.title}</h3><p className="mt-2 text-sm text-white/50">{event.venue.name}</p><p className="mt-1 text-sm text-white/50">{formatEventDate(event.date)} · {event.time}</p><div className="mt-5 flex items-center justify-between"><span className="text-sm font-semibold text-emerald-300">From ₹{startingPrice(event.prices)}</span><span className="text-sm text-white/70">View event →</span></div></div>
      </Link>
    </article>
  );
}

function SectionHeading({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="section-kicker">{kicker}</p><h2 className="section-title">{title}</h2></div><p className="max-w-lg text-sm leading-6 text-white/45">{description}</p></div>;
}

function HeroSkeleton() { return <div className="skeleton min-h-[480px] rounded-[28px] border border-white/5" />; }
function CardSkeletons({ count = 5 }: { count?: number }) { return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: count }, (_, index) => <div key={index}><div className="skeleton aspect-[2/3] rounded-[18px]"/><div className="skeleton mt-3 h-4 w-3/4 rounded"/><div className="skeleton mt-2 h-3 w-1/2 rounded"/></div>)}</div>; }
function EmptyState({ title, body }: { title: string; body: string }) { return <div className="card py-16 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/[0.05] text-xl">◇</div><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-2 text-sm text-white/45">{body}</p></div>; }
function ErrorState({ message }: { message: string }) { return <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-5 text-sm text-red-100">{message}</div>; }
