import assert from "node:assert/strict";
import test from "node:test";
import { contentIdentityKey, toEventSummary } from "../src/lib/catalog";
import { validateEventInput, validateVenueInput } from "../src/lib/validation";

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
