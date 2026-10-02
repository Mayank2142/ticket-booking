import { Prisma } from "@/generated/prisma/client";
import { seatLabel } from "./seats-label";
import { VenueInput } from "./validation";

export async function createVenueLayout(tx: Prisma.TransactionClient, input: VenueInput) {
  const venue = await tx.venue.create({
    data: {
      name: input.name,
      city: input.city,
      address: input.address,
      auditorium: input.auditorium,
      rows: input.rows,
      cols: input.cols,
    },
  });
  await addCategoriesAndSeats(tx, venue.id, input);
  return venue;
}

export async function replaceVenueLayout(
  tx: Prisma.TransactionClient,
  venueId: string,
  input: VenueInput
) {
  await tx.seat.deleteMany({ where: { venueId } });
  await tx.seatCategory.deleteMany({ where: { venueId } });
  const venue = await tx.venue.update({
    where: { id: venueId },
    data: {
      name: input.name,
      city: input.city,
      address: input.address,
      auditorium: input.auditorium,
      rows: input.rows,
      cols: input.cols,
    },
  });
  await addCategoriesAndSeats(tx, venueId, input);
  return venue;
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
          };
        })
      ),
    });
  }
}
