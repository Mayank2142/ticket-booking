export type PresentableEvent = {
  id: string;
  title: string;
  type: string;
  date: string;
  time: string;
  description?: string | null;
  venue?: { name: string };
  prices?: { price: number }[];
};

export function eventArtwork(type: string) {
  return type === "MOVIE" ? "/images/portal-poster.png" : "/images/cinema-hero.png";
}

export function eventPresentation(type: string) {
  return type === "MOVIE"
    ? { genre: "Sci-fi · Adventure", duration: "2h 15m", language: "English", rating: "4.8" }
    : { genre: "Live music", duration: "3h", language: "Live", rating: "4.9" };
}

export function startingPrice(prices: { price: number }[] = []) {
  if (!prices.length) return 0;
  return Math.min(...prices.map(({ price }) => price));
}

export function formatEventDate(date: string, options?: Intl.DateTimeFormatOptions) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-IN", options ?? { day: "numeric", month: "short", year: "numeric" }).format(parsed);
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
