import { Role } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { seatLabel } from "../src/lib/seats-label";

async function main() {
  const password = await bcrypt.hash("password123", 10);

  await db.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: { email: "admin@demo.com", name: "Admin", password, role: Role.ADMIN },
  });

  await db.user.upsert({
    where: { email: "organiser@demo.com" },
    update: {},
    create: { email: "organiser@demo.com", name: "Organiser", password, role: Role.ORGANISER },
  });

  await db.user.upsert({
    where: { email: "customer@demo.com" },
    update: {},
    create: { email: "customer@demo.com", name: "Customer", password, role: Role.CUSTOMER },
  });

  const venue = await db.venue.upsert({
    where: { id: "seed-venue" },
    update: { city: "Delhi NCR", address: "Central Arts District", auditorium: "Emerald Hall" },
    create: {
      id: "seed-venue",
      name: "City Arena",
      city: "Delhi NCR",
      address: "Central Arts District",
      auditorium: "Emerald Hall",
      rows: 5,
      cols: 8,
    },
  });

  const premium = await db.seatCategory.upsert({
    where: { id: "seed-premium" },
    update: {},
    create: { id: "seed-premium", venueId: venue.id, name: "Premium", color: "#f59e0b" },
  });

  const standard = await db.seatCategory.upsert({
    where: { id: "seed-standard" },
    update: {},
    create: { id: "seed-standard", venueId: venue.id, name: "Standard", color: "#6366f1" },
  });

  const seatCount = await db.seat.count({ where: { venueId: venue.id } });
  if (!seatCount) {
    for (let row = 1; row <= 5; row++) {
      const categoryId = row <= 2 ? premium.id : standard.id;
      for (let col = 1; col <= 8; col++) {
        await db.seat.create({
          data: {
            venueId: venue.id,
            categoryId,
            row,
            col,
            label: seatLabel(row, col),
          },
        });
      }
    }
  }

  const organiser = await db.user.findUnique({ where: { email: "organiser@demo.com" } });
  if (!organiser) return;

  const content = await db.content.upsert({
    where: { identityKey: "concert:summer-concert:english:live" },
    update: {},
    create: {
      identityKey: "concert:summer-concert:english:live",
      title: "Summer Concert",
      type: "CONCERT",
      description: "An immersive live music night with arena-scale production.",
      language: "English",
      format: "Live",
      genre: "Pop",
      durationMinutes: 180,
      certificate: "ALL",
    },
  });

  const existingEvent = await db.event.findFirst({ where: { title: "Summer Concert" } });
  if (existingEvent) {
    await db.event.update({ where: { id: existingEvent.id }, data: { contentId: content.id } });
  } else {
    const seats = await db.seat.findMany({ where: { venueId: venue.id } });
    const event = await db.event.create({
      data: {
        title: "Summer Concert",
        type: "CONCERT",
        description: "Live music night",
        contentId: content.id,
        venueId: venue.id,
        date: "2030-09-15",
        time: "19:30",
        organiserId: organiser.id,
        prices: {
          create: [
            { categoryId: premium.id, price: 1200 },
            { categoryId: standard.id, price: 600 },
          ],
        },
      },
    });

    await db.showSeat.createMany({
      data: seats.map((seat) => ({ eventId: event.id, seatId: seat.id })),
    });
  }

  console.log("Seed complete");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
