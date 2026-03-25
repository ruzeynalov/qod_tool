-- AlterTable
ALTER TABLE "stories" ADD COLUMN     "epic_id" UUID;

-- CreateTable
CREATE TABLE "epics" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "external_id" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "source" TEXT NOT NULL DEFAULT 'jira',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "epics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "epics_project_id_idx" ON "epics"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "epics_project_id_external_id_source_key" ON "epics"("project_id", "external_id", "source");

-- CreateIndex
CREATE INDEX "stories_epic_id_idx" ON "stories"("epic_id");

-- AddForeignKey
ALTER TABLE "epics" ADD CONSTRAINT "epics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_epic_id_fkey" FOREIGN KEY ("epic_id") REFERENCES "epics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
