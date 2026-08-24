import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { EventType, Role, SeatStatus, WaitlistStatus } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import {
  cancelBooking,
  confirmBooking,
  expireStaleOffers,
  holdSeats,
  offerNextWaitlistForSeat,
  releaseExpiredHolds,
} from "../src/lib/seats";

type Scenario = Awaited<ReturnType<typeof createScenario>>;

async function resetDatabase() {
  await db.bookingSeat.deleteMany();
  await db.waitlistEntry.deleteMany();
  await db.booking.deleteMany();
  await db.showSeat.deleteMany();
  await db.categoryPrice.deleteMany();
  await db.event.deleteMany();
  await db.seat.deleteMany();
  await db.seatCategory.deleteMany();
  await db.venue.deleteMany();
  await db.user.deleteMany();
}

async function createScenario(seatCount = 1) {
  const users = await Promise.all(
    ["owner", "waiter-one", "waiter-two", "waiter-three"].map((name, index) =>
      db.user.create({
        data: {
          name,
          email: `${name}@test.dev`,
          password: "hashed-password",
          role: index === 0 ? Role.CUSTOMER : Role.CUSTOMER,
        },
      })
    )
  );
  const organiser = await db.user.create({
    data: { name: "organiser", email: "organiser@test.dev", password: "hashed-password", role: Role.ORGANISER },
  });
  const venue = await db.venue.create({ data: { name: "Test Hall", rows: 1, cols: seatCount } });
  const category = await db.seatCategory.create({
    data: { venueId: venue.id, name: "Standard", color: "#6366f1" },
  });
  const seats = [];
  for (let col = 1; col <= seatCount; col += 1) {
    seats.push(
      await db.seat.create({
        data: { venueId: venue.id, categoryId: category.id, row: 1, col, label: `R1C${col}` },
      })
    );
  }
  const event = await db.event.create({
    data: {
      organiserId: organiser.id,
      venueId: venue.id,
      title: "Concurrency Test",
      type: EventType.CONCERT,
      date: "2099-01-01",
      time: "19:00",
      prices: { create: { categoryId: category.id, price: 500 } },
    },
  });
  await db.showSeat.createMany({ data: seats.map((seat) => ({ eventId: event.id, seatId: seat.id })) });
  return { users, organiser, venue, category, seats, event };
}

async function bookSeat(scenario: Scenario, userIndex = 0, seatIndex = 0) {
  const user = scenario.users[userIndex];
  const seat = scenario.seats[seatIndex];
  await holdSeats(scenario.event.id, [seat.id], user.id);
  return confirmBooking(scenario.event.id, [seat.id], user.id);
}

async function joinWaitlist(scenario: Scenario, userIndex: number, position: number) {
  return db.waitlistEntry.create({
    data: {
      userId: scenario.users[userIndex].id,
      eventId: scenario.event.id,
      categoryId: scenario.category.id,
      position,
      status: WaitlistStatus.WAITING,
    },
  });
}

beforeEach(resetDatabase);
after(async () => db.$disconnect());

test("simultaneous hold and booking attempts produce exactly one winner", async () => {
  const scenario = await createScenario();
  const attempts = await Promise.allSettled([
    holdSeats(scenario.event.id, [scenario.seats[0].id], scenario.users[0].id),
    holdSeats(scenario.event.id, [scenario.seats[0].id], scenario.users[1].id),
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);

  const held = await db.showSeat.findUniqueOrThrow({
    where: { eventId_seatId: { eventId: scenario.event.id, seatId: scenario.seats[0].id } },
  });
  assert.ok(held.heldById);
  const bookingAttempts = await Promise.allSettled([
    confirmBooking(scenario.event.id, [scenario.seats[0].id], held.heldById),
    confirmBooking(scenario.event.id, [scenario.seats[0].id], held.heldById),
  ]);
  assert.equal(bookingAttempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await db.booking.count({ where: { eventId: scenario.event.id } }), 1);
});

test("expired checkout holds are released", async () => {
  const scenario = await createScenario();
  await holdSeats(scenario.event.id, [scenario.seats[0].id], scenario.users[0].id);
  await db.showSeat.update({
    where: { eventId_seatId: { eventId: scenario.event.id, seatId: scenario.seats[0].id } },
    data: { heldUntil: new Date(Date.now() - 1_000) },
  });
  assert.equal(await releaseExpiredHolds(scenario.event.id), 1);
  const seat = await db.showSeat.findUniqueOrThrow({
    where: { eventId_seatId: { eventId: scenario.event.id, seatId: scenario.seats[0].id } },
  });
  assert.equal(seat.status, SeatStatus.AVAILABLE);
  assert.equal(seat.heldById, null);
});

test("cancellation is idempotent and creates only one waitlist offer", async () => {
  const scenario = await createScenario();
  const booking = await bookSeat(scenario);
  await joinWaitlist(scenario, 1, 1);

  const attempts = await Promise.allSettled([
    cancelBooking(booking.id, scenario.users[0].id),
    cancelBooking(booking.id, scenario.users[0].id),
  ]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await db.waitlistEntry.count({ where: { status: WaitlistStatus.OFFERED } }), 1);
  const offeredSeat = await db.showSeat.findUniqueOrThrow({
    where: { eventId_seatId: { eventId: scenario.event.id, seatId: scenario.seats[0].id } },
  });
  assert.equal(offeredSeat.status, SeatStatus.HELD);
  assert.equal(offeredSeat.heldById, scenario.users[1].id);
});

test("waitlist offer seat cannot be booked without its token and fulfillment is atomic", async () => {
  const scenario = await createScenario();
  const booking = await bookSeat(scenario);
  await joinWaitlist(scenario, 1, 1);
  await cancelBooking(booking.id, scenario.users[0].id);

  const offer = await db.waitlistEntry.findFirstOrThrow({ where: { status: WaitlistStatus.OFFERED } });
  await assert.rejects(
    confirmBooking(scenario.event.id, [scenario.seats[0].id], scenario.users[1].id),
    /offer token/
  );
  await assert.rejects(
    confirmBooking(scenario.event.id, [scenario.seats[0].id], scenario.users[1].id, "wrong-token"),
    /Invalid or expired/
  );

  await confirmBooking(scenario.event.id, [scenario.seats[0].id], scenario.users[1].id, offer.offerToken!);
  const fulfilled = await db.waitlistEntry.findUniqueOrThrow({ where: { id: offer.id } });
  assert.equal(fulfilled.status, WaitlistStatus.FULFILLED);
  assert.equal(fulfilled.offerToken, null);
  const seat = await db.showSeat.findUniqueOrThrow({
    where: { eventId_seatId: { eventId: scenario.event.id, seatId: scenario.seats[0].id } },
  });
  assert.equal(seat.status, SeatStatus.BOOKED);
});

test("an expired offer cascades to the next customer", async () => {
  const scenario = await createScenario();
  const booking = await bookSeat(scenario);
  const first = await joinWaitlist(scenario, 1, 1);
  const second = await joinWaitlist(scenario, 2, 2);
  await cancelBooking(booking.id, scenario.users[0].id);

  await db.waitlistEntry.update({
    where: { id: first.id },
    data: { offerExpiresAt: new Date(Date.now() - 1_000) },
  });
  await db.showSeat.update({
    where: { eventId_seatId: { eventId: scenario.event.id, seatId: scenario.seats[0].id } },
    data: { heldUntil: new Date(Date.now() - 1_000) },
  });
  assert.equal(await expireStaleOffers(scenario.event.id), 1);

  const [expired, offered, seat] = await Promise.all([
    db.waitlistEntry.findUniqueOrThrow({ where: { id: first.id } }),
    db.waitlistEntry.findUniqueOrThrow({ where: { id: second.id } }),
    db.showSeat.findUniqueOrThrow({
      where: { eventId_seatId: { eventId: scenario.event.id, seatId: scenario.seats[0].id } },
    }),
  ]);
  assert.equal(expired.status, WaitlistStatus.EXPIRED);
  assert.equal(offered.status, WaitlistStatus.OFFERED);
  assert.equal(seat.heldById, scenario.users[2].id);
});

test("concurrent seat offers claim distinct waiting customers", async () => {
  const scenario = await createScenario(2);
  await joinWaitlist(scenario, 1, 1);
  await joinWaitlist(scenario, 2, 2);
  const results = await Promise.allSettled([
    offerNextWaitlistForSeat(scenario.event.id, scenario.seats[0].id),
    offerNextWaitlistForSeat(scenario.event.id, scenario.seats[1].id),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);

  const offers = await db.waitlistEntry.findMany({ where: { status: WaitlistStatus.OFFERED } });
  assert.equal(offers.length, 2);
  assert.equal(new Set(offers.map((offer) => offer.userId)).size, 2);
  assert.equal(new Set(offers.map((offer) => offer.offeredSeatId)).size, 2);
});
