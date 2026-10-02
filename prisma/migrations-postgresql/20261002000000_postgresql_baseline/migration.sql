-- CineBook PostgreSQL baseline. The earlier SQLite migrations are retained under
-- prisma/migrations for local-history/reference purposes and are not deployed.

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "Role" AS ENUM ('ADMIN', 'ORGANISER', 'CUSTOMER');
CREATE TYPE "EventType" AS ENUM ('MOVIE', 'CONCERT');
CREATE TYPE "SeatStatus" AS ENUM ('AVAILABLE', 'HELD', 'BOOKED');
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'FULFILLED', 'EXPIRED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Venue" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rows" INTEGER NOT NULL,
  "cols" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeatCategory" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  CONSTRAINT "SeatCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Seat" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "row" INTEGER NOT NULL,
  "col" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "organiserId" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" "EventType" NOT NULL,
  "description" TEXT,
  "date" TEXT NOT NULL,
  "time" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CategoryPrice" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "CategoryPrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShowSeat" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "seatId" TEXT NOT NULL,
  "status" "SeatStatus" NOT NULL DEFAULT 'AVAILABLE',
  "heldUntil" TIMESTAMP(3),
  "heldById" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ShowSeat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Booking" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "ref" TEXT NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "ticketEmailSentAt" TIMESTAMP(3),
  "ticketEmailAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingSeat" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "seatId" TEXT NOT NULL,
  CONSTRAINT "BookingSeat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WaitlistEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
  "offerToken" TEXT,
  "offerExpiresAt" TIMESTAMP(3),
  "offeredSeatId" TEXT,
  "offerNotifiedAt" TIMESTAMP(3),
  "offerNotificationAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Seat_venueId_row_col_key" ON "Seat"("venueId", "row", "col");
CREATE UNIQUE INDEX "CategoryPrice_eventId_categoryId_key" ON "CategoryPrice"("eventId", "categoryId");
CREATE UNIQUE INDEX "ShowSeat_eventId_seatId_key" ON "ShowSeat"("eventId", "seatId");
CREATE UNIQUE INDEX "Booking_ref_key" ON "Booking"("ref");
CREATE UNIQUE INDEX "BookingSeat_bookingId_seatId_key" ON "BookingSeat"("bookingId", "seatId");
CREATE UNIQUE INDEX "WaitlistEntry_offerToken_key" ON "WaitlistEntry"("offerToken");
CREATE INDEX "WaitlistEntry_eventId_categoryId_status_position_idx" ON "WaitlistEntry"("eventId", "categoryId", "status", "position");
CREATE UNIQUE INDEX "WaitlistEntry_eventId_categoryId_userId_key" ON "WaitlistEntry"("eventId", "categoryId", "userId");
CREATE UNIQUE INDEX "WaitlistEntry_eventId_categoryId_position_key" ON "WaitlistEntry"("eventId", "categoryId", "position");

ALTER TABLE "SeatCategory" ADD CONSTRAINT "SeatCategory_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SeatCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_organiserId_fkey" FOREIGN KEY ("organiserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CategoryPrice" ADD CONSTRAINT "CategoryPrice_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryPrice" ADD CONSTRAINT "CategoryPrice_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SeatCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShowSeat" ADD CONSTRAINT "ShowSeat_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShowSeat" ADD CONSTRAINT "ShowSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShowSeat" ADD CONSTRAINT "ShowSeat_heldById_fkey" FOREIGN KEY ("heldById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingSeat" ADD CONSTRAINT "BookingSeat_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingSeat" ADD CONSTRAINT "BookingSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SeatCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
