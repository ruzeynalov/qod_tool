-- AlterTable
ALTER TABLE "defects" ADD COLUMN "labels" TEXT[] DEFAULT ARRAY[]::TEXT[];
