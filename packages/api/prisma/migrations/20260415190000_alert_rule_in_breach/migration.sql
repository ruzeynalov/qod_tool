-- AlterTable
ALTER TABLE "alert_rules"
  ADD COLUMN "in_breach" BOOLEAN NOT NULL DEFAULT false;
