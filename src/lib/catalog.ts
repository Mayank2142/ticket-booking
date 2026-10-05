import type { EventSummaryDto, EventType, ShowStatus } from "@cinebook/shared";

type CatalogEventRecord = {
  id: string;
  contentId: string | null;
  title: string;
  type: EventType;
  description: string | null;
  date: string;
  time: string;
  status?: ShowStatus;
  content: {
    language: string;
    format: string;
    genre: string;
    durationMinutes: number;
    certificate: string | null;
    posterUrl: string | null;
    releaseDate?: string | null;
    castNames?: string;
    crewNames?: string;
    trailerUrl?: string | null;
    formats?: string;
    performerNames?: string;
    ageRule?: string | null;
    entryRule?: string | null;
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
    releaseDate: null,
    castNames: "",
    crewNames: "",
    trailerUrl: null,
    formats: "",
    performerNames: "",
    ageRule: null,
    entryRule: null,
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
    releaseDate: metadata.releaseDate ?? null,
    cast: splitList(metadata.castNames),
    crew: splitList(metadata.crewNames),
    trailerUrl: metadata.trailerUrl,
    formats: splitList(metadata.formats || metadata.format),
    performers: splitList(metadata.performerNames),
    ageRule: metadata.ageRule,
    entryRule: metadata.entryRule,
    status: event.status ?? "PUBLISHED",
    isFavourite: Boolean(event.contentId && favouriteContentIds.has(event.contentId)),
    date: event.date,
    time: event.time,
    venue: event.venue,
    organiser: event.organiser,
    prices: event.prices,
  };
}

function splitList(value?: string) {
  return (value ?? "").split("|").map((item) => item.trim()).filter(Boolean);
}

export function startingPrice(prices: Array<{ price: number }>) {
  return prices.length ? Math.min(...prices.map((price) => price.price)) : 0;
}
