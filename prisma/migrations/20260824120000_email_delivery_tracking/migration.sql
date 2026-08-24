-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "ticketEmailSentAt" DATETIME;
ALTER TABLE "Booking" ADD COLUMN "ticketEmailAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WaitlistEntry" ADD COLUMN "offerNotifiedAt" DATETIME;
ALTER TABLE "WaitlistEntry" ADD COLUMN "offerNotificationAttempts" INTEGER NOT NULL DEFAULT 0;

-- Fair queue positions cannot be duplicated within an event/category.
CREATE UNIQUE INDEX "WaitlistEntry_eventId_categoryId_position_key"
ON "WaitlistEntry"("eventId", "categoryId", "position");
