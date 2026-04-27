-- AlterTable
ALTER TABLE "notifications"
  ADD COLUMN "project_id" UUID,
  ADD COLUMN "alert_rule_id" UUID;

-- AddForeignKey
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_alert_rule_id_fkey"
  FOREIGN KEY ("alert_rule_id") REFERENCES "alert_rules"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "notifications_user_id_project_id_created_at_idx"
  ON "notifications"("user_id", "project_id", "created_at");
