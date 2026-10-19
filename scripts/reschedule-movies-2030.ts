import { db, serializableTransaction } from "../src/lib/db";
import { movieDateIn2030 } from "../src/lib/movie-demo-dates";

async function main() {
  const apply = process.argv.includes("--apply");
  const movies = await db.show.findMany({
    where: { type: "MOVIE" },
    select: { id: true, title: true, date: true, time: true },
    orderBy: [{ date: "asc" }, { time: "asc" }],
  });
  const changes = movies.map((movie) => ({ ...movie, nextDate: movieDateIn2030(movie.date) }))
    .filter((movie) => movie.date !== movie.nextDate);
  for (const movie of changes) console.log(`${movie.title}: ${movie.date} -> ${movie.nextDate} (${movie.time})`);
  if (!apply) {
    console.log(`Preview: ${changes.length} of ${movies.length} movie shows need updating. Use --apply to save.`);
    return;
  }
  await serializableTransaction(async (tx) => {
    for (const movie of changes) {
      const result = await tx.show.updateMany({
        where: { id: movie.id, type: "MOVIE", date: movie.date },
        data: { date: movie.nextDate },
      });
      if (result.count !== 1) throw new Error(`Show changed during rescheduling: ${movie.id}. Retry after reviewing it.`);
    }
  });
  console.log(`Moved ${changes.length} movie shows to 2030. Show IDs, times, prices, bookings, waitlists and seat locks were preserved. Live events were not changed.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
