-- CreateEnum
CREATE TYPE "RunCountSource" AS ENUM ('TEST_RESULTS', 'CI_JOBS');

-- AlterTable
ALTER TABLE "test_runs"
ADD COLUMN "count_source" "RunCountSource" NOT NULL DEFAULT 'TEST_RESULTS';

-- AlterTable
ALTER TABLE "connector_configs"
ADD COLUMN "last_sync_warning" TEXT;
