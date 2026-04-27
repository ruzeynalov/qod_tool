-- AlterTable
ALTER TABLE "notifications"
  ADD COLUMN "muted" BOOLEAN NOT NULL DEFAULT false;
