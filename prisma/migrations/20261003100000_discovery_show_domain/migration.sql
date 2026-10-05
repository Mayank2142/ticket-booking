CREATE TABLE "City" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Auditorium" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "venueId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rows" INTEGER NOT NULL,
  "cols" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Auditorium_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RecentlyViewed" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "contentId" TEXT NOT NULL,
  "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecentlyViewed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecentlyViewed_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "Venue" ADD COLUMN "cityId" TEXT REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD COLUMN "auditoriumId" TEXT REFERENCES "Auditorium"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Event" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "Content" ADD COLUMN "releaseDate" TEXT;
ALTER TABLE "Content" ADD COLUMN "castNames" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Content" ADD COLUMN "crewNames" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Content" ADD COLUMN "trailerUrl" TEXT;
ALTER TABLE "Content" ADD COLUMN "formats" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Content" ADD COLUMN "performerNames" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Content" ADD COLUMN "ageRule" TEXT;
ALTER TABLE "Content" ADD COLUMN "entryRule" TEXT;

INSERT INTO "City" ("id", "name", "slug")
SELECT 'city-' || lower(replace(replace("city", ' ', '-'), '/', '-')), "city", lower(replace(replace("city", ' ', '-'), '/', '-'))
FROM "Venue" GROUP BY "city";

UPDATE "Venue" SET "cityId" = (
  SELECT "City"."id" FROM "City" WHERE "City"."name" = "Venue"."city"
);

INSERT INTO "Auditorium" ("id", "venueId", "name", "rows", "cols")
SELECT 'aud-' || "id", "id", "auditorium", "rows", "cols" FROM "Venue";

UPDATE "Event" SET "auditoriumId" = 'aud-' || "venueId";
UPDATE "Content" SET "formats" = "format" WHERE "formats" = '';

CREATE UNIQUE INDEX "City_name_key" ON "City"("name");
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");
CREATE UNIQUE INDEX "Auditorium_venueId_name_key" ON "Auditorium"("venueId", "name");
CREATE UNIQUE INDEX "RecentlyViewed_userId_contentId_key" ON "RecentlyViewed"("userId", "contentId");
CREATE INDEX "RecentlyViewed_userId_viewedAt_idx" ON "RecentlyViewed"("userId", "viewedAt");
CREATE INDEX "Venue_cityId_name_idx" ON "Venue"("cityId", "name");
CREATE INDEX "Event_status_date_time_idx" ON "Event"("status", "date", "time");
CREATE INDEX "Event_auditoriumId_date_time_idx" ON "Event"("auditoriumId", "date", "time");
