import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  BookingStatus,
  EventType,
  PrismaClient as PostgresClient,
  Role,
  SeatStatus,
  WaitlistStatus,
} from "../src/generated/prisma/client";
import { PrismaClient as SqliteClient } from "../src/generated/prisma-test/client";

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;

if (!sourceUrl?.startsWith("file:")) throw new Error("SOURCE_DATABASE_URL must point to the existing SQLite file");
if (!targetUrl || !/^postgres(?:ql)?:\/\//i.test(targetUrl)) throw new Error("DATABASE_URL must point to PostgreSQL");

const source = new SqliteClient({ adapter: new PrismaBetterSqlite3({ url: sourceUrl }) });
const target = new PostgresClient({ adapter: new PrismaPg({ connectionString: targetUrl }) });

async function main() {
  const [users, venues, categories, seats, contents, events, prices, showSeats, bookings, bookingSeats, waitlist, favourites] = await Promise.all([
    source.user.findMany(),
    source.venue.findMany(),
    source.seatCategory.findMany(),
    source.seat.findMany(),
    source.content.findMany(),
    source.event.findMany(),
    source.categoryPrice.findMany(),
    source.showSeat.findMany(),
    source.booking.findMany(),
    source.bookingSeat.findMany(),
    source.waitlistEntry.findMany(),
    source.favourite.findMany(),
  ]);

  const existingRows = await target.user.count();
  if (existingRows) throw new Error("Target PostgreSQL database is not empty; migration stopped to avoid duplicate or overwritten data");

  await target.$transaction(async (tx) => {
    await tx.user.createMany({ data: users.map((row) => ({ ...row, role: row.role as Role })) });
    await tx.venue.createMany({ data: venues });
    await tx.seatCategory.createMany({ data: categories });
    await tx.seat.createMany({ data: seats });
    await tx.content.createMany({ data: contents.map((row) => ({ ...row, type: row.type as EventType })) });
    await tx.event.createMany({ data: events.map((row) => ({ ...row, type: row.type as EventType })) });
    await tx.categoryPrice.createMany({ data: prices });
    await tx.showSeat.createMany({ data: showSeats.map((row) => ({ ...row, status: row.status as SeatStatus })) });
    await tx.booking.createMany({ data: bookings.map((row) => ({ ...row, status: row.status as BookingStatus })) });
    await tx.bookingSeat.createMany({ data: bookingSeats });
    await tx.waitlistEntry.createMany({ data: waitlist.map((row) => ({ ...row, status: row.status as WaitlistStatus })) });
    await tx.favourite.createMany({ data: favourites });
  }, { maxWait: 10_000, timeout: 120_000 });

  const copied = {
    users: users.length,
    venues: venues.length,
    categories: categories.length,
    seats: seats.length,
    contents: contents.length,
    events: events.length,
    prices: prices.length,
    showSeats: showSeats.length,
    bookings: bookings.length,
    bookingSeats: bookingSeats.length,
    waitlist: waitlist.length,
    favourites: favourites.length,
  };
  console.log("SQLite → PostgreSQL migration complete", copied);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  });
