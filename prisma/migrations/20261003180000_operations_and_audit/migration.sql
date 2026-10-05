ALTER TABLE "City" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Venue" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Auditorium" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Booking" ADD COLUMN "ticketEmailLastError" TEXT;
ALTER TABLE "WaitlistEntry" ADD COLUMN "offerNotificationLastError" TEXT;

CREATE TABLE "MaintenanceRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL,
  "resultJson" TEXT NOT NULL DEFAULT '{}',
  "error" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "MaintenanceRun_startedAt_idx" ON "MaintenanceRun"("startedAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
