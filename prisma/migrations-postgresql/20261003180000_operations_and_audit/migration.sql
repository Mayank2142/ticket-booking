ALTER TABLE "City" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Venue" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Auditorium" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "ticketEmailLastError" TEXT;
ALTER TABLE "WaitlistEntry" ADD COLUMN "offerNotificationLastError" TEXT;

CREATE TABLE "MaintenanceRun" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "resultJson" TEXT NOT NULL DEFAULT '{}',
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "MaintenanceRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MaintenanceRun_startedAt_idx" ON "MaintenanceRun"("startedAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
