-- Convert any existing VIEWER global roles to MEMBER
UPDATE "users" SET "role" = 'MEMBER' WHERE "role" = 'VIEWER';

-- Convert any existing VIEWER project roles to MEMBER
UPDATE "project_members" SET "role" = 'MEMBER' WHERE "role" = 'VIEWER';

-- Remove VIEWER from GlobalRole enum
ALTER TYPE "GlobalRole" RENAME TO "GlobalRole_old";
CREATE TYPE "GlobalRole" AS ENUM ('ADMIN', 'MEMBER');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "GlobalRole" USING ("role"::text::"GlobalRole");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "GlobalRole_old";

-- Remove VIEWER from ProjectRole enum
ALTER TYPE "ProjectRole" RENAME TO "ProjectRole_old";
CREATE TYPE "ProjectRole" AS ENUM ('MANAGER', 'MEMBER');
ALTER TABLE "project_members" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "project_members" ALTER COLUMN "role" TYPE "ProjectRole" USING ("role"::text::"ProjectRole");
ALTER TABLE "project_members" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "ProjectRole_old";
