ALTER TABLE "Venue" ADD COLUMN "city" TEXT NOT NULL DEFAULT 'Delhi';
ALTER TABLE "Venue" ADD COLUMN "address" TEXT;
ALTER TABLE "Venue" ADD COLUMN "auditorium" TEXT NOT NULL DEFAULT 'Main Auditorium';

CREATE TABLE "Content" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identityKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT,
  "language" TEXT NOT NULL DEFAULT 'Hindi',
  "format" TEXT NOT NULL DEFAULT '2D',
  "genre" TEXT NOT NULL DEFAULT 'Entertainment',
  "durationMinutes" INTEGER NOT NULL DEFAULT 120,
  "certificate" TEXT,
  "posterUrl" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Favourite" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "contentId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favourite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Favourite_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "Event" ADD COLUMN "contentId" TEXT REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Content" (
  "id", "identityKey", "title", "type", "description", "language", "format", "genre", "durationMinutes"
)
SELECT
  'legacy-' || "id", 'legacy:' || "id", "title", "type", "description", 'Hindi',
  CASE WHEN "type" = 'MOVIE' THEN '2D' ELSE 'Live' END,
  CASE WHEN "type" = 'MOVIE' THEN 'Cinema' ELSE 'Music' END,
  CASE WHEN "type" = 'MOVIE' THEN 150 ELSE 180 END
FROM "Event";

UPDATE "Event" SET "contentId" = 'legacy-' || "id" WHERE "contentId" IS NULL;

CREATE UNIQUE INDEX "Content_identityKey_key" ON "Content"("identityKey");
CREATE INDEX "Content_type_language_genre_idx" ON "Content"("type", "language", "genre");
CREATE UNIQUE INDEX "Favourite_userId_contentId_key" ON "Favourite"("userId", "contentId");
CREATE INDEX "Favourite_userId_createdAt_idx" ON "Favourite"("userId", "createdAt");
CREATE INDEX "Event_contentId_date_time_idx" ON "Event"("contentId", "date", "time");
