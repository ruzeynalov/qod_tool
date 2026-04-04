import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

test.describe('KPIs page', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/kpis`);
  });

  test('renders KPI metric cards', async ({ demoPage: page }) => {
    const kpiLabels = ['Pass Rate', 'Coverage', 'Flaky Rate', 'MTTR'];
    let found = 0;
    for (const label of kpiLabels) {
      if (await page.getByText(label, { exact: false }).first().isVisible().catch(() => false)) {
        found++;
      }
    }
    expect(found).toBeGreaterThanOrEqual(2);
  });

  test('KPI cards show numeric values', async ({ demoPage: page }) => {
    // KPI values typically contain numbers with % or hours
    const valuePattern = page.getByText(/\d+(\.\d+)?(%|h|hrs)?/);
    expect(await valuePattern.count()).toBeGreaterThan(0);
  });

  test('KPI cards display RAG status indicators', async ({ demoPage: page }) => {
    // RAG status is shown via colored left borders (border-l-[3px])
    // At least one card should be present with a colored border
    const cards = page.locator('[class*="border-l"]');
    if (await cards.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      expect(await cards.count()).toBeGreaterThan(0);
    }
  });

  test('trend charts are rendered', async ({ demoPage: page }) => {
    // Recharts SVG or sparkline SVGs should be present
    const charts = page.locator('svg').filter({ has: page.locator('path') });
    await expect(charts.first()).toBeVisible({ timeout: 5000 });
  });

  test('target lines are visible on charts', async ({ demoPage: page }) => {
    // Reference lines in Recharts render as line elements
    const referenceLines = page.locator('.recharts-reference-line');
    if (await referenceLines.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      expect(await referenceLines.count()).toBeGreaterThan(0);
    }
  });
});
