import { Prisma, SeatType } from "@/generated/prisma/client";
import { seatLabel } from "./seats-label";
import { VenueInput } from "./validation";

export async function createVenueLayout(tx: Prisma.TransactionClient, input: VenueInput) {
  const city = await upsertCity(tx, input.city);
  const venue = await tx.venue.create({
    data: {
      name: input.name,
      city: input.city,
      cityId: city.id,
      address: input.address,
      auditorium: input.auditorium,
      rows: input.rows,
      cols: input.cols,
    },
  });
  await tx.auditorium.create({ data: { venueId: venue.id, name: input.auditorium, rows: input.rows, cols: input.cols } });
  await addCategoriesAndSeats(tx, venue.id, input);
  return venue;
}

export async function replaceVenueLayout(
  tx: Prisma.TransactionClient,
  venueId: string,
  input: VenueInput
) {
  const city = await upsertCity(tx, input.city);
  await tx.seat.deleteMany({ where: { venueId } });
  await tx.seatCategory.deleteMany({ where: { venueId } });
  const venue = await tx.venue.update({
    where: { id: venueId },
    data: {
      name: input.name,
      city: input.city,
      cityId: city.id,
      address: input.address,
      auditorium: input.auditorium,
      rows: input.rows,
      cols: input.cols,
    },
  });
  await tx.auditorium.upsert({
    where: { venueId_name: { venueId, name: input.auditorium } },
    update: { rows: input.rows, cols: input.cols },
    create: { venueId, name: input.auditorium, rows: input.rows, cols: input.cols },
  });
  await addCategoriesAndSeats(tx, venueId, input);
  return venue;
}

async function upsertCity(tx: Prisma.TransactionClient, name: string) {
  const slug = name.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return tx.city.upsert({ where: { name }, update: { slug }, create: { name, slug } });
}

async function addCategoriesAndSeats(
  tx: Prisma.TransactionClient,
  venueId: string,
  input: VenueInput
) {
  for (const categoryInput of input.categories) {
    const category = await tx.seatCategory.create({
      data: { venueId, name: categoryInput.name, color: categoryInput.color },
    });
    await tx.seat.createMany({
      data: categoryInput.rows.flatMap((row) =>
        Array.from({ length: input.cols }, (_, index) => {
          const col = index + 1;
          return {
            venueId,
            categoryId: category.id,
            row,
            col,
            label: seatLabel(row, col),
            seatType: row === input.rows && col === 1
              ? SeatType.WHEELCHAIR
              : row === input.rows && col === 2
                ? SeatType.COMPANION
                : SeatType.STANDARD,
            aisleAfter: col === Math.floor(input.cols / 2),
            isBlocked: row === input.rows && col === input.cols,
            viewLabel: row <= Math.ceil(input.rows / 3)
              ? "Close immersive view"
              : row >= Math.ceil(input.rows * 0.75)
                ? "Wide auditorium view"
                : "Balanced centre view",
            viewScore: row <= Math.ceil(input.rows / 3) ? 4 : 5,
          };
        })
      ),
    });
  }
}
