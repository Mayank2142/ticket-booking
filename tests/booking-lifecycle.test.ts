import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { BookingStatus, EventType, Role, SeatStatus, ShowStatus, WaitlistStatus } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { getUser, hashPassword, sessionCookieName, signToken, verifyPassword } from "../src/lib/auth";
import jwt from "jsonwebtoken";
import { bookingRoutes } from "../apps/api/src/routes/bookings";
import { accountRoutes } from "../apps/api/src/routes/account";
import { organiserRoutes } from "../apps/api/src/routes/organiser";
import { adminRoutes } from "../apps/api/src/routes/admin";
import { catalogueRoutes } from "../apps/api/src/routes/catalogue";
import { eventRoutes } from "../apps/api/src/routes/events";
import { authRoutes } from "../apps/api/src/routes/auth";
import { exchangeFirebaseIdentity } from "../src/lib/firebase-session";
import type { FirebasePrincipal } from "../src/lib/firebase-auth";
import { deliverWaitlistJoined, deliverWaitlistOffer, deliverWaitlistOfferExpired } from "../src/lib/delivery";
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
  await db.alertSubscription.deleteMany();
  await db.auditLog.deleteMany();
  await db.maintenanceRun.deleteMany();
  await db.bookingSeat.deleteMany();
  await db.waitlistEntry.deleteMany();
  await db.booking.deleteMany();
  await db.showSeat.deleteMany();
  await db.categoryPrice.deleteMany();
  await db.show.deleteMany();
  await db.auditorium.deleteMany();
  await db.seat.deleteMany();
  await db.seatCategory.deleteMany();
  await db.venue.deleteMany();
  await db.city.deleteMany();
  await db.content.deleteMany();
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
  const city = await db.city.create({ data: { name: "Test City", slug: "test-city" } });
  const venue = await db.venue.create({ data: { name: "Test Hall", city: city.name, cityId: city.id, rows: 1, cols: seatCount } });
  const auditorium = await db.auditorium.create({ data: { venueId: venue.id, name: "Screen 1", rows: 1, cols: seatCount } });
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
  const content = await db.content.create({ data: { identityKey: `concurrency-test-${organiser.id}`, title: "Concurrency Test", type: EventType.CONCERT, language: "English", format: "Live", genre: "Music", durationMinutes: 120 } });
  const event = await db.show.create({
    data: {
      organiserId: organiser.id,
      venueId: venue.id,
      auditoriumId: auditorium.id,
      contentId: content.id,
      title: "Concurrency Test",
      type: EventType.CONCERT,
      date: "2099-01-01",
      time: "19:00",
      prices: { create: { categoryId: category.id, price: 500 } },
    },
  });
  await db.showSeat.createMany({ data: seats.map((seat) => ({ eventId: event.id, seatId: seat.id })) });
  return { users, organiser, city, venue, auditorium, content, category, seats, event };
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

async function callAccountRoute(method: string, path: string, token: string, body?: unknown) {
  const route = accountRoutes.find((candidate) => candidate.method === method && candidate.path === path);
  assert.ok(route, `Missing ${method} ${path}`);
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return route.handler(request, {}, new URL(request.url));
}

async function callRoute(routes: typeof organiserRoutes, method: string, routePath: string, requestPath: string, token: string, params: Record<string, string>, body?: unknown) {
  const route = routes.find((candidate) => candidate.method === method && candidate.path === routePath);
  assert.ok(route, `Missing ${method} ${routePath}`);
  const request = new Request(`http://localhost${requestPath}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return route.handler(request, params, new URL(request.url));
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

test("blocked and unavailable positions can never be held", async () => {
  const scenario = await createScenario();
  await db.seat.update({ where: { id: scenario.seats[0].id }, data: { isBlocked: true } });
  await db.showSeat.update({
    where: { eventId_seatId: { eventId: scenario.event.id, seatId: scenario.seats[0].id } },
    data: { status: SeatStatus.UNAVAILABLE, unavailableReason: "Blocked auditorium position" },
  });
  await assert.rejects(
    holdSeats(scenario.event.id, [scenario.seats[0].id], scenario.users[0].id),
    /unavailable/i
  );
  assert.equal(await db.booking.count({ where: { eventId: scenario.event.id } }), 0);
});

test("customers can update preferences, change password, and delete their account", async () => {
  const password = "startPass123";
  const user = await db.user.create({
    data: { name: "Profile Customer", email: "profile@test.dev", password: await hashPassword(password), role: Role.CUSTOMER },
  });
  let token = await signToken({ id: user.id, email: user.email, name: user.name, role: user.role });

  const updateResponse = await callAccountRoute("PATCH", "/api/account", token, {
    name: "Updated Customer",
    email: "updated@test.dev",
    reminderEmails: false,
    waitlistAlerts: true,
  });
  assert.equal(updateResponse.status, 200);
  token = (await updateResponse.json()).token;
  const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(updated.name, "Updated Customer");
  assert.equal(updated.reminderEmails, false);

  const newPassword = "newPass456";
  const passwordResponse = await callAccountRoute("POST", "/api/account/password", token, { currentPassword: password, newPassword });
  assert.equal(passwordResponse.status, 200);
  token = (await passwordResponse.json()).token;
  const secured = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(await verifyPassword(newPassword, secured.password), true);

  const deleteResponse = await callAccountRoute("DELETE", "/api/account", token, { password: newPassword });
  assert.equal(deleteResponse.status, 200);
  assert.equal(await db.user.findUnique({ where: { id: user.id } }), null);
});

test("browser login returns only a protected cookie and public identity fields, and logout expires it", async () => {
  const password = "PrivateLogin123";
  const user = await db.user.create({ data: { name: "Secure Customer", email: "secure-login@test.dev", password: await hashPassword(password), role: Role.CUSTOMER } });
  const route = authRoutes.find((candidate) => candidate.path === "/api/auth/login")!;
  const request = new Request("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-cinebook-session": "cookie" }, body: JSON.stringify({ email: user.email, password }) });
  const response = await route.handler(request, {}, new URL(request.url));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.token, "");
  assert.deepEqual(Object.keys(body.user).sort(), ["email", "id", "name", "role"]);
  const cookie = response.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  assert.equal((await getUser(new Request("http://localhost/api/auth/me", { headers: { cookie: cookie.split(";")[0] } })))?.id, user.id);
  const logout = authRoutes.find((candidate) => candidate.path === "/api/auth/logout")!;
  const loggedOut = await logout.handler(new Request("http://localhost/api/auth/logout", { method: "POST" }), {}, new URL("http://localhost/api/auth/logout"));
  assert.match(loggedOut.headers.get("set-cookie")!, /Max-Age=0/);
});

test("password, email, role and Firebase-identity changes invalidate previously issued sessions", async () => {
  const user = await db.user.create({ data: { name: "Session Customer", email: "secure-session@test.dev", password: await hashPassword("PrivatePass123"), role: Role.CUSTOMER } });
  const request = (token: string) => new Request("http://localhost/api/account", { headers: { authorization: `Bearer ${token}` } });
  for (const update of [{ password: await hashPassword("ChangedPass123") }, { email: "changed-session@test.dev" }, { role: Role.ORGANISER }, { firebaseUid: "linked-test-identity" }]) {
    const token = await signToken(user);
    assert.ok(await getUser(request(token)));
    const claims = jwt.decode(token) as jwt.JwtPayload;
    assert.equal(claims.exp! - claims.iat!, 8 * 3600);
    assert.equal(claims.email, undefined); assert.equal(claims.password, undefined); assert.equal(claims.role, undefined);
    await db.user.update({ where: { id: user.id }, data: update });
    assert.equal(await getUser(request(token)), null);
    assert.ok(await getUser(request(await signToken(user))));
  }
  const currentToken = await signToken(user);
  const claims = jwt.decode(currentToken) as jwt.JwtPayload;
  const wrongAlgorithm = jwt.sign({ sub: user.id, sv: claims.sv }, process.env.JWT_SECRET!, { algorithm: "HS384", issuer: "cinebook", audience: "cinebook-api" });
  assert.equal(await getUser(request(wrongAlgorithm)), null);
  const legacy = jwt.sign({ sub: user.id, role: Role.ADMIN }, process.env.JWT_SECRET!);
  assert.equal(await getUser(request(legacy)), null);
  assert.equal(await getUser(new Request("http://localhost/api/account", { headers: { cookie: `${sessionCookieName()}=%not-valid-encoding` } })), null);
});

test("booking responses cannot expose password hashes or internal verification and Firebase fields", async () => {
  const scenario = await createScenario();
  const user = scenario.users[0];
  await db.user.update({ where: { id: user.id }, data: { emailVerificationTokenHash: "private-verification-hash", firebaseUid: "private-firebase-uid" } });
  await holdSeats(scenario.event.id, [scenario.seats[0].id], user.id);
  const response = await callRoute(eventRoutes, "POST", "/api/events/:id/book", `/api/events/${scenario.event.id}/book`, await signToken(user), { id: scenario.event.id }, { seatIds: [scenario.seats[0].id] });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.booking.user).sort(), ["email", "id", "name"]);
  assert.doesNotMatch(JSON.stringify(body), /hashed-password|private-verification-hash|private-firebase-uid|emailVerificationTokenHash|passwordLoginEnabled/);
  const stranger = scenario.users[1];
  const strangerToken = await signToken(stranger);
  const denied = await callRoute(bookingRoutes, "GET", "/api/bookings/:id", `/api/bookings/${body.booking.id}`, strangerToken, { id: body.booking.id });
  assert.equal(denied.status, 404);
  const cannotCancel = await callRoute(bookingRoutes, "DELETE", "/api/bookings/:id", `/api/bookings/${body.booking.id}`, strangerToken, { id: body.booking.id });
  assert.notEqual(cannotCancel.status, 200);
  const noAdmin = await callRoute(adminRoutes, "GET", "/api/admin/users", "/api/admin/users", strangerToken, {});
  assert.equal(noAdmin.status, 403);
});

test("per-account brute-force limits cannot be bypassed by changing forwarded IP headers", async () => {
  const route = authRoutes.find((candidate) => candidate.path === "/api/auth/login")!;
  const email = `brute-force-${Date.now()}@test.dev`;
  for (let attempt = 0; attempt < 21; attempt++) {
    const request = new Request("http://localhost/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${attempt}` }, body: JSON.stringify({ email, password: "WrongPass123" }) });
    const response = await route.handler(request, {}, new URL(request.url));
    assert.equal(response.status, attempt < 20 ? 401 : 429);
  }
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

test("organisers cannot manage shows owned by another organiser", async () => {
  const scenario = await createScenario();
  const outsider = await db.user.create({ data: { name: "Outsider", email: "outsider@test.dev", password: "hash", role: Role.ORGANISER } });
  const token = await signToken({ id: outsider.id, name: outsider.name, email: outsider.email, role: outsider.role });
  const response = await callRoute(organiserRoutes, "GET", "/api/organiser/events/:id/manage", `/api/organiser/events/${scenario.event.id}/manage`, token, { id: scenario.event.id });
  assert.equal(response.status, 404);
});

test("organiser cancellation atomically cancels bookings, releases inventory, and audits the action", async () => {
  const scenario = await createScenario();
  const booking = await bookSeat(scenario);
  const token = await signToken({ id: scenario.organiser.id, name: scenario.organiser.name, email: scenario.organiser.email, role: scenario.organiser.role });
  const response = await callRoute(organiserRoutes, "PUT", "/api/organiser/events/:id/status", `/api/organiser/events/${scenario.event.id}/status`, token, { id: scenario.event.id }, { status: ShowStatus.CANCELLED });
  assert.equal(response.status, 200);
  assert.equal((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, BookingStatus.CANCELLED);
  assert.equal((await db.showSeat.findUniqueOrThrow({ where: { eventId_seatId: { eventId: scenario.event.id, seatId: scenario.seats[0].id } } })).status, SeatStatus.AVAILABLE);
  assert.equal(await db.auditLog.count({ where: { action: "SHOW_CANCELLED", entityId: scenario.event.id } }), 1);
});

test("organisers can create several shows for one content item in one workflow", async () => {
  const scenario = await createScenario();
  const token = await signToken({ id: scenario.organiser.id, name: scenario.organiser.name, email: scenario.organiser.email, role: scenario.organiser.role });
  const response = await callRoute(organiserRoutes, "POST", "/api/organiser/events/:id/shows", `/api/organiser/events/${scenario.event.id}/shows`, token, { id: scenario.event.id }, { shows: [
    { venueId: scenario.venue.id, auditoriumId: scenario.auditorium.id, date: "2099-01-02", time: "18:00", status: ShowStatus.DRAFT, prices: [{ categoryId: scenario.category.id, price: 600 }] },
    { venueId: scenario.venue.id, auditoriumId: scenario.auditorium.id, date: "2099-01-03", time: "20:00", status: ShowStatus.PUBLISHED, prices: [{ categoryId: scenario.category.id, price: 700 }] }
  ] });
  assert.equal(response.status, 201);
  assert.equal(await db.show.count({ where: { contentId: scenario.content.id } }), 3);
  assert.equal(await db.showSeat.count(), 3 * scenario.seats.length);
});

test("administrators manage cities and roles while organiser access remains forbidden", async () => {
  const scenario = await createScenario();
  const organiserToken = await signToken({ id: scenario.organiser.id, name: scenario.organiser.name, email: scenario.organiser.email, role: scenario.organiser.role });
  const forbidden = await callRoute(adminRoutes, "GET", "/api/admin/users", "/api/admin/users", organiserToken, {});
  assert.equal(forbidden.status, 403);
  const adminUser = await db.user.create({ data: { name: "Admin", email: "admin@test.dev", password: "hash", role: Role.ADMIN } });
  const adminToken = await signToken({ id: adminUser.id, name: adminUser.name, email: adminUser.email, role: adminUser.role });
  const cityResponse = await callRoute(adminRoutes, "POST", "/api/admin/cities", "/api/admin/cities", adminToken, {}, { name: "Bengaluru" });
  assert.equal(cityResponse.status, 201);
  const roleResponse = await callRoute(adminRoutes, "PATCH", "/api/admin/users/:id/role", `/api/admin/users/${scenario.users[1].id}/role`, adminToken, { id: scenario.users[1].id }, { role: Role.ORGANISER });
  assert.equal(roleResponse.status, 200);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: scenario.users[1].id } })).role, Role.ORGANISER);
  assert.equal(await db.auditLog.count({ where: { actorId: adminUser.id } }), 2);
});

test("venue administration archives used layouts instead of deleting them", async () => {
  const scenario = await createScenario();
  const adminUser = await db.user.create({ data: { name: "Admin", email: "admin2@test.dev", password: "hash", role: Role.ADMIN } });
  const token = await signToken({ id: adminUser.id, name: adminUser.name, email: adminUser.email, role: adminUser.role });
  const response = await callRoute(adminRoutes, "PATCH", "/api/admin/venues/:id/archive", `/api/admin/venues/${scenario.venue.id}/archive`, token, { id: scenario.venue.id }, { archived: true });
  assert.equal(response.status, 200);
  assert.ok((await db.venue.findUniqueOrThrow({ where: { id: scenario.venue.id } })).archivedAt);
  assert.equal(await db.show.count({ where: { venueId: scenario.venue.id } }), 1);
});

test("email alerts persist and favourites return saved event cards", async () => {
  const scenario = await createScenario();
  const alertResponse = await callRoute(catalogueRoutes, "POST", "/api/alerts", "/api/alerts", "", {}, { email: "alerts@example.com" });
  assert.equal(alertResponse.status, 201);
  assert.equal(await db.alertSubscription.count({ where: { email: "alerts@example.com", active: true } }), 1);

  await db.favourite.create({ data: { userId: scenario.users[0].id, contentId: scenario.content.id } });
  const token = await signToken({ id: scenario.users[0].id, name: scenario.users[0].name, email: scenario.users[0].email, role: scenario.users[0].role });
  const favouriteResponse = await callRoute(catalogueRoutes, "GET", "/api/favourites", "/api/favourites", token, {});
  assert.equal(favouriteResponse.status, 200);
  const payload = await favouriteResponse.json() as { events: Array<{ title: string; isFavourite: boolean }> };
  assert.deepEqual(payload.events.map((event) => ({ title: event.title, isFavourite: event.isFavourite })), [{ title: "Concurrency Test", isFavourite: true }]);
});

test("movie discovery paginates unique content and details expose every published showtime", async () => {
  const scenario = await createScenario();
  await db.content.update({ where: { id: scenario.content.id }, data: { type: EventType.MOVIE } });
  await db.show.update({ where: { id: scenario.event.id }, data: { type: EventType.MOVIE } });
  for (let day = 2; day <= 15; day++) {
    await db.show.create({ data: {
      organiserId: scenario.organiser.id, venueId: scenario.venue.id, auditoriumId: scenario.auditorium.id,
      contentId: scenario.content.id, title: scenario.event.title, type: EventType.MOVIE,
      date: `2099-01-${String(day).padStart(2, "0")}`, time: "20:00",
      prices: { create: { categoryId: scenario.category.id, price: 500 } },
    } });
  }
  const secondContent = await db.content.create({ data: { identityKey: "another-movie", title: "Another Movie", type: EventType.MOVIE, language: "English", format: "2D", genre: "Drama", durationMinutes: 120 } });
  const secondShow = await db.show.create({ data: {
    organiserId: scenario.organiser.id, venueId: scenario.venue.id, auditoriumId: scenario.auditorium.id,
    contentId: secondContent.id, title: secondContent.title, type: EventType.MOVIE, date: "2099-02-01", time: "19:00",
  } });
  for (const status of [ShowStatus.DRAFT, ShowStatus.CANCELLED, ShowStatus.ARCHIVED]) {
    await db.show.create({ data: {
      organiserId: scenario.organiser.id, venueId: scenario.venue.id, auditoriumId: scenario.auditorium.id,
      contentId: scenario.content.id, title: scenario.event.title, type: EventType.MOVIE, date: "2099-03-01", time: "19:00", status,
    } });
  }
  const firstResponse = await callRoute(eventRoutes, "GET", "/api/events", "/api/events?type=MOVIE&groupMovies=true&upcoming=true&pageSize=1", "", {});
  const first = await firstResponse.json();
  assert.equal(first.pagination.total, 2);
  assert.equal(first.pagination.totalPages, 2);
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0].screeningCount, 15);
  assert.equal(first.events[0].availableDates.length, 15);
  const secondResponse = await callRoute(eventRoutes, "GET", "/api/events", "/api/events?type=MOVIE&groupMovies=true&upcoming=true&pageSize=1&page=2", "", {});
  assert.equal((await secondResponse.json()).events[0].id, secondShow.id);
  const filteredResponse = await callRoute(eventRoutes, "GET", "/api/events", "/api/events?type=MOVIE&groupMovies=true&date=2099-01-15", "", {});
  assert.equal((await filteredResponse.json()).events[0].screeningCount, 1);
  const detailsResponse = await callRoute(eventRoutes, "GET", "/api/events/:id", `/api/events/${scenario.event.id}`, "", { id: scenario.event.id });
  const details = await detailsResponse.json();
  assert.equal(details.event.showtimes.length, 15);
  assert.equal(details.event.showtimes.at(-1).date, "2099-01-15");
});

test("verified Firebase identities create customers and never auto-link an existing privileged email", async () => {
  const scenario = await createScenario();
  const principal: FirebasePrincipal = { uid: `new-${scenario.organiser.id}`, email: "firebase-new@example.com", emailVerified: true, name: "Firebase Customer", provider: "google.com", authTime: Date.now() / 1000 };
  const customer = await exchangeFirebaseIdentity(principal);
  assert.equal(customer.role, Role.CUSTOMER);
  assert.equal(customer.passwordLoginEnabled, false);
  assert.ok(customer.emailVerifiedAt);
  assert.equal((await exchangeFirebaseIdentity(principal)).id, customer.id);
  await assert.rejects(exchangeFirebaseIdentity({ ...principal, uid: "unverified", emailVerified: false }), /Verify your email/);
  await assert.rejects(exchangeFirebaseIdentity({ ...principal, provider: "anonymous" }), /Verify your email/);
  await assert.rejects(exchangeFirebaseIdentity({ ...principal, uid: "different", email: scenario.organiser.email }), /existing password/);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: scenario.organiser.id } })).firebaseUid, null);
});

test("explicit Firebase linking preserves role, password and bookings and rejects stale/wrong-account proof", async () => {
  const scenario = await createScenario();
  const password = await hashPassword("Original123");
  await db.user.update({ where: { id: scenario.users[0].id }, data: { password } });
  const booking = await bookSeat(scenario);
  const principal: FirebasePrincipal = { uid: `linked-${scenario.users[0].id}`, email: scenario.users[0].email, emailVerified: true, provider: "google.com", authTime: Date.now() / 1000 };
  await assert.rejects(exchangeFirebaseIdentity(principal, scenario.users[1].id), /existing password/);
  await assert.rejects(exchangeFirebaseIdentity({ ...principal, authTime: Date.now() / 1000 - 600 }, scenario.users[0].id), /again/);
  const linked = await exchangeFirebaseIdentity(principal, scenario.users[0].id);
  assert.equal(linked.id, scenario.users[0].id);
  assert.equal(linked.role, Role.CUSTOMER);
  assert.equal(linked.password, password);
  assert.equal(linked.passwordLoginEnabled, true);
  await db.user.update({ where: { id: linked.id }, data: { emailVerifiedAt: null } });
  await assert.rejects(exchangeFirebaseIdentity({ ...principal, emailVerified: false }), /Verify your email/);
  assert.ok((await exchangeFirebaseIdentity(principal)).emailVerifiedAt);
  assert.equal((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).userId, linked.id);
  const login = await callRoute(authRoutes, "POST", "/api/auth/login", "/api/auth/login", "", {}, { email: linked.email, password: "Original123" });
  assert.equal(login.status, 200);
  const privileged = await exchangeFirebaseIdentity({ ...principal, uid: `organiser-${scenario.organiser.id}`, email: scenario.organiser.email }, scenario.organiser.id);
  assert.equal(privileged.role, Role.ORGANISER);
});

test("verification status reports queue failures and previews without falsely verifying or exposing private job data", async () => {
  const scenario = await createScenario();
  const customer = scenario.users[0];
  const token = await signToken({ id: customer.id, name: customer.name, email: customer.email, role: customer.role });
  const response = await callAccountRoute("POST", "/api/account/email-verification/resend", token);
  const queued = await response.json();
  assert.equal(queued.queued, true);
  assert.equal(queued.delivery.state, "queued");
  const user = await db.user.findUniqueOrThrow({ where: { id: customer.id } });
  const job = await db.backgroundJob.findUniqueOrThrow({ where: { dedupeKey: `EMAIL_VERIFICATION:${user.id}:${user.emailVerificationTokenHash!.slice(0, 12)}` } });
  for (const [status, resultJson, expected] of [
    ["RETRY", "{}", "retrying"], ["FAILED", "{}", "failed"],
    ["SUCCEEDED", JSON.stringify({ delivered: false, mode: "preview" }), "preview"],
    ["SUCCEEDED", JSON.stringify({ delivered: true, mode: "resend" }), "accepted"],
  ]) {
    await db.backgroundJob.update({ where: { id: job.id }, data: { status, resultJson, lastError: "private SMTP diagnostic" } });
    const profile = await (await callAccountRoute("GET", "/api/account", token)).json();
    assert.equal(profile.user.emailVerificationDelivery.state, expected);
    assert.equal(profile.user.emailVerifiedAt, null);
    assert.doesNotMatch(JSON.stringify(profile), /private SMTP diagnostic|payloadJson|emailVerificationTokenHash/);
    assert.doesNotMatch(JSON.stringify(profile), new RegExp(user.emailVerificationTokenHash!));
  }
  const payload = JSON.parse(job.payloadJson) as { token: string };
  assert.equal((await callAccountRoute("POST", "/api/account/email-verification/confirm", "", { token: "forged".repeat(10) })).status, 410);
  assert.equal((await callAccountRoute("POST", "/api/account/email-verification/confirm", "", { token: payload.token })).status, 200);
  const verified = await (await callAccountRoute("GET", "/api/account", token)).json();
  assert.ok(verified.user.emailVerifiedAt);
});

test("disabled waitlist emails do not send or create previews and do not change queue positions or offers", async () => {
  const scenario = await createScenario();
  await db.user.update({ where: { id: scenario.users[1].id }, data: { waitlistAlerts: false } });
  const entry = await joinWaitlist(scenario, 1, 7);
  assert.equal((await deliverWaitlistJoined(entry.id)).mode, "skipped");
  const offered = await offerNextWaitlistForSeat(scenario.event.id, scenario.seats[0].id);
  assert.ok(offered);
  assert.equal((await deliverWaitlistOffer(entry.id)).mode, "skipped");
  const active = await db.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } });
  assert.equal(active.position, 7);
  assert.equal(active.status, WaitlistStatus.OFFERED);
  assert.equal(active.offerNotifiedAt, null);
  await db.waitlistEntry.update({ where: { id: entry.id }, data: { status: WaitlistStatus.EXPIRED } });
  assert.equal((await deliverWaitlistOfferExpired(entry.id)).mode, "skipped");
  assert.equal(await db.emailPreview.count({ where: { relatedEntityId: entry.id } }), 0);
});

test("a deleted Firebase identity cannot recreate its account while provider cleanup is pending", async () => {
  const scenario = await createScenario();
  const uid = `deleted-${scenario.organiser.id}`;
  await db.backgroundJob.create({ data: { type: "FIREBASE_USER_DELETE", dedupeKey: `firebase-delete:${uid}`, payloadJson: JSON.stringify({ uid }) } });
  await assert.rejects(exchangeFirebaseIdentity({ uid, email: "deleted@example.com", emailVerified: true, provider: "google.com", authTime: Date.now() / 1000 }), /deleted/);
  assert.equal(await db.user.count({ where: { email: "deleted@example.com" } }), 0);
});
