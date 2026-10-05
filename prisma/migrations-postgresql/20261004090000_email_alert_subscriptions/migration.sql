CREATE TABLE "AlertSubscription" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "confirmationSentAt" TIMESTAMP(3),
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlertSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlertSubscription_email_key" ON "AlertSubscription"("email");
CREATE INDEX "AlertSubscription_active_createdAt_idx" ON "AlertSubscription"("active", "createdAt");
