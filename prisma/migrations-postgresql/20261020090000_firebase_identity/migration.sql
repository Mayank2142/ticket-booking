ALTER TABLE "User" ADD COLUMN "firebaseUid" TEXT;
ALTER TABLE "User" ADD COLUMN "firebaseProvider" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordLoginEnabled" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");
