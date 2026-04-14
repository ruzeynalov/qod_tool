-- DropIndex
DROP INDEX "connector_configs_project_id_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "blocked_at" TIMESTAMP(3);
