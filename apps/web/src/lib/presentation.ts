import type { EventPriceDto } from "@cinebook/shared";

export function getStartingPrice(prices: EventPriceDto[]) {
  return prices.length ? Math.min(...prices.map((item) => item.price)) : 0;
}

export function formatEventDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

export function eventArtwork(type: string) {
  return type === "MOVIE" ? "/images/portal-poster.png" : "/images/cinema-hero.png";
}

export function eventPresentation(type: string) {
  return type === "MOVIE"
    ? { genre: "Sci-fi · Adventure", duration: "2h 15m", language: "English", rating: "4.8" }
    : { genre: "Live music", duration: "3h", language: "Live", rating: "4.9" };
}

export function displaySeatLabel(row: number, col: number) {
  let value = row;
  let letters = "";
  while (value > 0) {
    value -= 1;
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26);
  }
  return `${letters}${col}`;
}
