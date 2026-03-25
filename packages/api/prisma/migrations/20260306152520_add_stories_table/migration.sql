-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED');

-- AlterEnum
ALTER TYPE "ConnectorType" ADD VALUE 'JIRA_STORIES';

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "external_id" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "status" "StoryStatus" NOT NULL DEFAULT 'OPEN',
    "story_points" INTEGER,
    "assignee" TEXT,
    "component" TEXT,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'jira',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stories_project_id_status_idx" ON "stories"("project_id", "status");

-- CreateIndex
CREATE INDEX "stories_project_id_created_at_idx" ON "stories"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stories_project_id_external_id_source_key" ON "stories"("project_id", "external_id", "source");

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
