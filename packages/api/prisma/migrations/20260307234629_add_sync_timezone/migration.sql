-- AlterTable
ALTER TABLE "connector_configs" ADD COLUMN     "sync_timezone" TEXT NOT NULL DEFAULT 'UTC';
