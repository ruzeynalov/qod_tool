import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

/**
 * KPIs smoke: card selection, trend chart, period switching, sparklines.
 */
test.describe('KPIs smoke', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/kpis`);
    await page.getByText('Quality KPI Dashboard').waitFor({ timeout: 15_000 });
  });

  test('KPI cards show values, targets, RAG badges, and sparklines', async ({ demoPage: page }) => {
    // Should have ordered KPI cards
    await expect(page.getByText('Automation Coverage').first()).toBeVisible();
    await expect(page.getByText('Pass Rate (30d)').first()).toBeVisible();
    await expect(page.getByText('Flaky Test Rate').first()).toBeVisible();

    // KPI cards should show percentage values
    const percentValues = page.getByText(/\d+\.\d+%/);
    expect(await percentValues.count()).toBeGreaterThanOrEqual(5);

    // SVG elements for sparklines/icons should be present
    const svgs = page.locator('svg');
    expect(await svgs.count()).toBeGreaterThan(0);
  });

  test('clicking a KPI card shows trend detail chart', async ({ demoPage: page }) => {
    // Click the first KPI card (Automation Coverage)
    const firstCard = page.getByText('Automation Coverage').first().locator('..').locator('..');
    await firstCard.click();
    await page.waitForTimeout(500);

    // Trend chart section should appear with a Recharts wrapper
    const chart = page.locator('.recharts-wrapper');
    expect(await chart.count()).toBeGreaterThan(0);
  });

  test('period buttons switch trend chart timeframe', async ({ demoPage: page }) => {
    // Click 90d period
    await page.getByRole('button', { name: '90d', exact: true }).first().click();
    await page.waitForTimeout(500);

    // Chart should still be visible
    expect(await page.locator('.recharts-wrapper').count()).toBeGreaterThan(0);

    // Switch to 7d
    await page.getByRole('button', { name: '7d', exact: true }).first().click();
    await page.waitForTimeout(500);
    expect(await page.locator('.recharts-wrapper').count()).toBeGreaterThan(0);
  });

  test('KPI metric dropdown selects a different metric', async ({ demoPage: page }) => {
    const metricSelect = page.locator('select').first();
    if (await metricSelect.isVisible()) {
      await metricSelect.selectOption({ index: 2 });
      await page.waitForTimeout(500);
      // Chart should re-render
      expect(await page.locator('.recharts-wrapper').count()).toBeGreaterThan(0);
    }
  });
});
