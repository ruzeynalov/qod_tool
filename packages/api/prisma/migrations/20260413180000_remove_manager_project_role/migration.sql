-- Convert any existing MANAGER project roles to MEMBER
UPDATE "project_members" SET "role" = 'MEMBER' WHERE "role" = 'MANAGER';

-- Remove MANAGER from ProjectRole enum
ALTER TYPE "ProjectRole" RENAME TO "ProjectRole_old";
CREATE TYPE "ProjectRole" AS ENUM ('MEMBER');
ALTER TABLE "project_members" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "project_members" ALTER COLUMN "role" TYPE "ProjectRole" USING ("role"::text::"ProjectRole");
ALTER TABLE "project_members" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "ProjectRole_old";
