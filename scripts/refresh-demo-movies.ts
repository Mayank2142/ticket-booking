import { db } from "../src/lib/db";

// Add upcoming local demo screenings without rescheduling historical bookings.
const demoVenueIds = ["seed-pvr-vegas", "seed-forum-koramangala", "seed-inox-meenakshi", "seed-cinepolis-nexus"];
const demoContentKeys = ["movie:dune-part-two:english:imax-70mm", "movie:oppenheimer:english:imax-70mm", "movie:kalki-2898-ad:hindi:dolby-3d", "movie:interstellar-10th-anniversary:english:imax-laser"];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function main() {
  const templates = await db.show.findMany({
    where: { type: "MOVIE", venueId: { in: demoVenueIds }, content: { identityKey: { in: demoContentKeys } }, status: "PUBLISHED", venue: { archivedAt: null } },
    include: { prices: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const seen = new Set<string>();
  let created = 0;
  for (const template of templates) {
    const key = `${template.contentId}:${template.venueId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.show.findFirst({ where: { contentId: template.contentId, venueId: template.venueId, status: "PUBLISHED", date: { gte: today } } });
      if (existing) return { title: existing.title, date: existing.date, created: false };
      if (!template.prices.length) throw new Error(`No category prices for ${template.title}. Run the initial seed first.`);
      const seats = await tx.seat.findMany({ where: { venueId: template.venueId } });
      if (!seats.length) throw new Error(`No layout for ${template.title}. Run the initial seed first.`);
      const screeningDate = new Date(`${today}T12:00:00Z`);
      screeningDate.setUTCDate(screeningDate.getUTCDate() + 7);
      const date = screeningDate.toISOString().slice(0, 10);
      const show = await tx.show.create({ data: {
        title: template.title, type: "MOVIE", description: template.description,
        contentId: template.contentId, venueId: template.venueId, auditoriumId: template.auditoriumId,
        organiserId: template.organiserId, status: "PUBLISHED", date, time: template.time,
        prices: { create: template.prices.map(({ categoryId, price }) => ({ categoryId, price })) },
      } });
      await tx.showSeat.createMany({ data: seats.map((seat) => ({
        eventId: show.id, seatId: seat.id, status: seat.isBlocked ? "UNAVAILABLE" as const : "AVAILABLE" as const,
        unavailableReason: seat.isBlocked ? "Blocked auditorium position" : null,
      })) });
      return { title: show.title, date: show.date, created: true };
    });
    if (result.created) created++;
    console.log(`${result.created ? "Added demo screening" : "Already upcoming"}: ${result.title} · ${result.date}`);
  }
  if (!seen.size) throw new Error("No seeded movie templates found. Run npm run db:seed on your local database first.");
  console.log(`${created} screenings added; historical shows, bookings and seat locks were not changed.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
