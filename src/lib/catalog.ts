import type { EventSummaryDto, EventType } from "@/contracts/api";

type CatalogEventRecord = {
  id: string;
  contentId: string | null;
  title: string;
  type: EventType;
  description: string | null;
  date: string;
  time: string;
  content: {
    language: string;
    format: string;
    genre: string;
    durationMinutes: number;
    certificate: string | null;
    posterUrl: string | null;
  } | null;
  venue: { name: string; city: string; auditorium: string };
  organiser: { name: string };
  prices: Array<{ categoryId: string; price: number; category: { name: string } }>;
};

export function contentIdentityKey(input: {
  title: string;
  type: EventType;
  language: string;
  format: string;
}) {
  const normalize = (value: string) => encodeURIComponent(
    value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "-")
  ).replace(/%/g, "");
  return [input.type.toLowerCase(), normalize(input.title), normalize(input.language), normalize(input.format)].join(":");
}

export function toEventSummary(
  event: CatalogEventRecord,
  favouriteContentIds: ReadonlySet<string> = new Set()
): EventSummaryDto {
  const metadata = event.content ?? {
    language: "Hindi",
    format: event.type === "MOVIE" ? "2D" : "Live",
    genre: event.type === "MOVIE" ? "Cinema" : "Music",
    durationMinutes: event.type === "MOVIE" ? 150 : 180,
    certificate: null,
    posterUrl: null,
  };

  return {
    id: event.id,
    contentId: event.contentId,
    title: event.title,
    type: event.type,
    description: event.description,
    language: metadata.language,
    format: metadata.format,
    genre: metadata.genre,
    durationMinutes: metadata.durationMinutes,
    certificate: metadata.certificate,
    posterUrl: metadata.posterUrl,
    isFavourite: Boolean(event.contentId && favouriteContentIds.has(event.contentId)),
    date: event.date,
    time: event.time,
    venue: event.venue,
    organiser: event.organiser,
    prices: event.prices,
  };
}

export function startingPrice(prices: Array<{ price: number }>) {
  return prices.length ? Math.min(...prices.map((price) => price.price)) : 0;
}
