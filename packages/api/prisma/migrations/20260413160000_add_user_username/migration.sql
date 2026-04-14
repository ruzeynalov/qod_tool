-- AlterTable
ALTER TABLE "users" ADD COLUMN "username" TEXT;

-- Backfill: set username to the local part of email for existing rows
UPDATE "users" SET "username" = split_part("email", '@', 1) WHERE "username" IS NULL;

-- Make column NOT NULL after backfill
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
