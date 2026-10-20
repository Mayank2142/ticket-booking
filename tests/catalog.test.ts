import assert from "node:assert/strict";
import test from "node:test";
import { contentIdentityKey, toEventSummary } from "../src/lib/catalog";
import { validateEventInput, validateVenueInput } from "../src/lib/validation";
import { movieDateIn2030 } from "../src/lib/movie-demo-dates";
import { groupMovieScreenings } from "@cinebook/shared";
import { featuredShows, nextFeaturedIndex } from "../apps/web/src/lib/featured-shows";

test("featured carousel includes unique published movies and live events, not duplicate dates", () => {
  const events = [
    { id: "live-1", contentId: "live", title: "Coldplay: Music of the Spheres", type: "CONCERT" as const, status: "PUBLISHED" as const },
    { id: "dune-1", contentId: "dune", title: "Dune: Part Two", type: "MOVIE" as const, status: "PUBLISHED" as const },
    { id: "dune-2", contentId: "dune", title: "Dune: Part Two", type: "MOVIE" as const, status: "PUBLISHED" as const },
    { id: "live-2", contentId: "live", title: "Coldplay: Music of the Spheres", type: "CONCERT" as const, status: "PUBLISHED" as const },
    { id: "hidden", title: "Private premiere", type: "MOVIE" as const, status: "DRAFT" as const },
    { id: "legacy-1", title: "Legacy movie", type: "MOVIE" as const, status: "PUBLISHED" as const },
    { id: "legacy-2", title: " Legacy  movie ", type: "MOVIE" as const, status: "PUBLISHED" as const },
  ];
  assert.deepEqual(featuredShows(events).map((event) => event.id), ["dune-1", "live-1", "legacy-1"]);
  assert.equal(events[0].id, "live-1");
  assert.deepEqual(featuredShows([]), []);
  assert.deepEqual(featuredShows(events.filter((event) => event.type === "CONCERT")).map((event) => event.id), ["live-1"]);
});

test("featured carousel arrows wrap in both directions and tolerate zero or one slide", () => {
  assert.equal(nextFeaturedIndex(0, -1, 7), 6);
  assert.equal(nextFeaturedIndex(6, 1, 7), 0);
  assert.equal(nextFeaturedIndex(2, 1, 7), 3);
  assert.equal(nextFeaturedIndex(0, 1, 1), 0);
  assert.equal(nextFeaturedIndex(0, -1, 0), 0);
});

test("movie discovery groups screenings before pagination without merging live events", () => {
  const shows = [
    { id: "movie-a-1", contentId: "movie-a", type: "MOVIE", date: "2030-10-31" },
    { id: "movie-a-2", contentId: "movie-a", type: "MOVIE", date: "2030-10-31" },
    { id: "movie-a-3", contentId: "movie-a", type: "MOVIE", date: "2030-11-11" },
    { id: "movie-b-1", contentId: "movie-b", type: "MOVIE", date: "2030-11-30" },
    { id: "live-1", contentId: "concert", type: "CONCERT", date: "2030-11-30" },
    { id: "live-2", contentId: "concert", type: "CONCERT", date: "2030-12-25" },
    { id: "legacy-1", contentId: null, type: "MOVIE", date: "2030-12-25" },
    { id: "legacy-2", contentId: null, type: "MOVIE", date: "2030-12-25" },
  ];
  const grouped = groupMovieScreenings(shows);
  assert.equal(grouped.length, 6);
  assert.deepEqual(grouped.slice(0, 2).map((item) => item.id), ["movie-a-1", "movie-b-1"]);
  assert.equal(grouped[0].screeningCount, 3);
  assert.deepEqual(grouped[0].availableDates, ["2030-10-31", "2030-11-11"]);
  assert.equal(shows.length, 8);
  assert.equal(groupMovieScreenings(shows.filter((item) => item.date === "2030-11-11"))[0].screeningCount, 1);
});

test("movie demo dates move to 2030 while preserving month and day", () => {
  assert.equal(movieDateIn2030("2026-10-13"), "2030-10-13");
  assert.equal(movieDateIn2030("2030-10-03"), "2030-10-03");
  assert.equal(movieDateIn2030("2028-02-29"), "2030-02-28");
  assert.throws(() => movieDateIn2030("2026-02-30"), /Invalid screening date/);
  assert.throws(() => movieDateIn2030("not-a-date"), /Invalid screening date/);
});

test("content identity groups equivalent show listings", () => {
  const first = contentIdentityKey({ title: "  Midnight Premiere ", type: "MOVIE", language: "Hindi", format: "2D" });
  const second = contentIdentityKey({ title: "Midnight  Premiere", type: "MOVIE", language: "HINDI", format: "2d" });
  assert.equal(first, second);
  assert.equal(first, "movie:midnight-premiere:hindi:2d");
});

test("event catalogue metadata is validated and normalised", () => {
  const input = validateEventInput({
    title: "Signal Live",
    type: "CONCERT",
    description: "A live performance",
    language: "English",
    format: "Live Arena",
    genre: "Alternative",
    durationMinutes: 135,
    certificate: "all",
    venueId: "venue-1",
    date: "2099-01-01",
    time: "19:30",
    prices: [{ categoryId: "standard", price: 500 }],
  });

  assert.equal(input.certificate, "ALL");
  assert.equal(input.durationMinutes, 135);
  assert.equal(input.genre, "Alternative");
});

test("venue input supports city and auditorium identity", () => {
  const venue = validateVenueInput({
    name: "CineBook Central",
    city: "Bengaluru",
    auditorium: "Screen 4",
    address: "MG Road",
    rows: 2,
    cols: 5,
    categories: [{ name: "Standard", color: "#39d7a1", rows: [1, 2] }],
  });

  assert.equal(venue.city, "Bengaluru");
  assert.equal(venue.auditorium, "Screen 4");
});

test("catalogue metadata cannot overwrite the scheduled show identity", () => {
  const summary = toEventSummary({
    id: "show-1",
    contentId: "content-1",
    title: "Signal Live",
    type: "CONCERT",
    description: null,
    date: "2099-01-01",
    time: "19:30",
    content: {
      language: "English",
      format: "Live",
      genre: "Alternative",
      durationMinutes: 135,
      certificate: "ALL",
      posterUrl: null,
    },
    venue: { name: "Central", city: "Bengaluru", auditorium: "Screen 4" },
    organiser: { name: "CineBook" },
    prices: [{ categoryId: "standard", price: 500, category: { name: "Standard" } }],
  });

  assert.equal(summary.id, "show-1");
  assert.equal(summary.contentId, "content-1");
});
