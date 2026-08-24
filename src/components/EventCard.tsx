import Image from "next/image";
import Link from "next/link";
import {
  eventArtwork,
  eventPresentation,
  formatEventDate,
  PresentableEvent,
  startingPrice,
} from "@/lib/presentation";

export function EventCard({ event, compact = false }: { event: PresentableEvent; compact?: boolean }) {
  const meta = eventPresentation(event.type);
  const price = startingPrice(event.prices);

  return (
    <article className={`poster-card group ${compact ? "min-w-[220px] max-w-[220px]" : ""}`}>
      <Link href={`/events/${event.id}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
        <div className="poster-frame">
          <Image
            src={eventArtwork(event.type)}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={`object-cover transition duration-500 group-hover:scale-[1.04] ${event.type === "CONCERT" ? "object-[68%_center]" : ""}`}
          />
          <div className="poster-gradient" />
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <span className="cinema-pill">{event.type === "MOVIE" ? "Movie" : "Live"}</span>
            <span className="rating-pill">★ {meta.rating}</span>
          </div>
          <div className="poster-action">
            <span className="btn btn-primary w-full">Book tickets</span>
          </div>
        </div>
        <div className="space-y-1.5 px-1 pt-3">
          <h3 className="truncate text-base font-semibold text-white">{event.title}</h3>
          <p className="truncate text-xs text-white/55">{meta.genre} · {meta.duration}</p>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-white/45">{formatEventDate(event.date, { day: "numeric", month: "short" })}</span>
            <span className="font-medium text-emerald-300">{price ? `From ₹${price}` : "View details"}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
