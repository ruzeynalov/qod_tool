-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('MANAGER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('GITHUB', 'TESTRAIL', 'JIRA', 'JUNIT_XML', 'TESTNG_XML');

-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR', 'SYNCING');

-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('MANUAL', 'AUTOMATED', 'BDD');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('AUTOMATED', 'NOT_AUTOMATED', 'NEEDS_UPDATE');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('CI_PUSH', 'PR', 'SCHEDULE', 'MANUAL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED', 'ERRORED');

-- CreateEnum
CREATE TYPE "TestResultStatus" AS ENUM ('PASSED', 'FAILED', 'SKIPPED', 'ERROR', 'FLAKY');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "DefectStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'SUCCESS', 'FAILURE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KPIMetric" AS ENUM ('COVERAGE_PCT', 'PASS_RATE_7D', 'PASS_RATE_30D', 'FLAKY_RATE', 'MTTD_HOURS', 'MTTR_HOURS', 'ESCAPE_RATE', 'EXEC_VELOCITY', 'REQ_COVERAGE', 'READINESS_SCORE');

-- CreateEnum
CREATE TYPE "AlertCondition" AS ENUM ('LESS_THAN', 'GREATER_THAN', 'DELTA_PCT');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('SLACK', 'EMAIL', 'IN_APP');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" "GlobalRole" NOT NULL DEFAULT 'MEMBER',
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "retention_days" INTEGER NOT NULL DEFAULT 365,
    "demo_mode" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_configs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "connector_type" "ConnectorType" NOT NULL,
    "name" TEXT NOT NULL,
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "field_mapping" JSONB NOT NULL DEFAULT '{}',
    "sync_schedule" TEXT NOT NULL DEFAULT '*/15 * * * *',
    "status" "ConnectorStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_sync_at" TIMESTAMP(3),
    "last_sync_error" TEXT,
    "sync_cursor" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connector_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_areas" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "external_mapping" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#6366f1',

    CONSTRAINT "feature_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "external_id" TEXT,
    "title" TEXT NOT NULL,
    "type" "TestType" NOT NULL DEFAULT 'AUTOMATED',
    "automation_status" "AutomationStatus" NOT NULL DEFAULT 'AUTOMATED',
    "feature_area_id" UUID,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'manual',
    "suite_name" TEXT,
    "class_name" TEXT,
    "file_path" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_runs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "external_id" TEXT,
    "name" TEXT,
    "trigger_type" "TriggerType" NOT NULL DEFAULT 'MANUAL',
    "branch" TEXT,
    "sha" TEXT,
    "environment" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "total_tests" INTEGER NOT NULL DEFAULT 0,
    "passed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "errored_count" INTEGER NOT NULL DEFAULT 0,
    "flaky_count" INTEGER NOT NULL DEFAULT 0,
    "is_rerun" BOOLEAN NOT NULL DEFAULT false,
    "original_run_id" UUID,
    "pipeline_run_id" UUID,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "report_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_results" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,
    "status" "TestResultStatus" NOT NULL,
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "stack_trace" TEXT,
    "screenshot_url" TEXT,
    "retry_index" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defects" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "external_id" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "priority" "Priority" NOT NULL DEFAULT 'P2',
    "status" "DefectStatus" NOT NULL DEFAULT 'OPEN',
    "component" TEXT,
    "feature_area_id" UUID,
    "is_escaped" BOOLEAN NOT NULL DEFAULT false,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "assignee" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "changelog" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "defects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defect_test_links" (
    "defect_id" UUID NOT NULL,
    "test_case_id" UUID NOT NULL,

    CONSTRAINT "defect_test_links_pkey" PRIMARY KEY ("defect_id","test_case_id")
);

-- CreateTable
CREATE TABLE "pipeline_runs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "external_id" TEXT,
    "workflow_name" TEXT NOT NULL,
    "branch" TEXT,
    "sha" TEXT,
    "status" "PipelineStatus" NOT NULL DEFAULT 'QUEUED',
    "duration_ms" INTEGER,
    "triggered_by" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "jobs" JSONB NOT NULL DEFAULT '[]',
    "url" TEXT,
    "source" TEXT NOT NULL DEFAULT 'github',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_snapshots" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "metric" "KPIMetric" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "target" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_targets" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "metric" "KPIMetric" NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "green_threshold" DOUBLE PRECISION NOT NULL,
    "amber_threshold" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "kpi_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "metric" "KPIMetric" NOT NULL,
    "condition" "AlertCondition" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "channel_config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_triggered" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_layouts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "widgets" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "previous_value" JSONB,
    "new_value" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_org_id_slug_key" ON "projects"("org_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_areas_project_id_name_key" ON "feature_areas"("project_id", "name");

-- CreateIndex
CREATE INDEX "test_cases_project_id_feature_area_id_idx" ON "test_cases"("project_id", "feature_area_id");

-- CreateIndex
CREATE INDEX "test_cases_project_id_automation_status_idx" ON "test_cases"("project_id", "automation_status");

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_project_id_external_id_source_key" ON "test_cases"("project_id", "external_id", "source");

-- CreateIndex
CREATE INDEX "test_runs_project_id_started_at_idx" ON "test_runs"("project_id", "started_at");

-- CreateIndex
CREATE INDEX "test_runs_project_id_status_idx" ON "test_runs"("project_id", "status");

-- CreateIndex
CREATE INDEX "test_runs_project_id_branch_idx" ON "test_runs"("project_id", "branch");

-- CreateIndex
CREATE UNIQUE INDEX "test_runs_project_id_external_id_source_key" ON "test_runs"("project_id", "external_id", "source");

-- CreateIndex
CREATE INDEX "test_results_run_id_status_idx" ON "test_results"("run_id", "status");

-- CreateIndex
CREATE INDEX "test_results_test_case_id_created_at_idx" ON "test_results"("test_case_id", "created_at");

-- CreateIndex
CREATE INDEX "defects_project_id_status_idx" ON "defects"("project_id", "status");

-- CreateIndex
CREATE INDEX "defects_project_id_severity_idx" ON "defects"("project_id", "severity");

-- CreateIndex
CREATE INDEX "defects_project_id_created_at_idx" ON "defects"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "defects_project_id_external_id_source_key" ON "defects"("project_id", "external_id", "source");

-- CreateIndex
CREATE INDEX "pipeline_runs_project_id_started_at_idx" ON "pipeline_runs"("project_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_runs_project_id_external_id_source_key" ON "pipeline_runs"("project_id", "external_id", "source");

-- CreateIndex
CREATE INDEX "kpi_snapshots_project_id_metric_recorded_at_idx" ON "kpi_snapshots"("project_id", "metric", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_targets_project_id_metric_key" ON "kpi_targets"("project_id", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_layouts_user_id_project_id_key" ON "dashboard_layouts"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_created_at_idx" ON "notifications"("user_id", "read", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_project_id_created_at_idx" ON "audit_logs"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_configs" ADD CONSTRAINT "connector_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_areas" ADD CONSTRAINT "feature_areas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_feature_area_id_fkey" FOREIGN KEY ("feature_area_id") REFERENCES "feature_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_pipeline_run_id_fkey" FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_feature_area_id_fkey" FOREIGN KEY ("feature_area_id") REFERENCES "feature_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_test_links" ADD CONSTRAINT "defect_test_links_defect_id_fkey" FOREIGN KEY ("defect_id") REFERENCES "defects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_test_links" ADD CONSTRAINT "defect_test_links_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_snapshots" ADD CONSTRAINT "kpi_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_targets" ADD CONSTRAINT "kpi_targets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_layouts" ADD CONSTRAINT "dashboard_layouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
