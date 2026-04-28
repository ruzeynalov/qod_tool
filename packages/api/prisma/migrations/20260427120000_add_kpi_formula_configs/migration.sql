-- CreateTable
CREATE TABLE "kpi_formula_configs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "metric" "KPIMetric" NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "expression" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "kpi_formula_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kpi_formula_configs_project_id_metric_key" ON "kpi_formula_configs"("project_id", "metric");

-- CreateIndex
CREATE INDEX "kpi_formula_configs_project_id_updated_at_idx" ON "kpi_formula_configs"("project_id", "updated_at");

-- AddForeignKey
ALTER TABLE "kpi_formula_configs" ADD CONSTRAINT "kpi_formula_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_formula_configs" ADD CONSTRAINT "kpi_formula_configs_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
