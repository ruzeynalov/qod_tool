import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

/**
 * Runs smoke: charts & trends, flaky test analysis, run history filtering.
 */
test.describe('Runs smoke', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/runs`);
    await page.getByText('Automation Runs').waitFor({ timeout: 15_000 });
  });

  test('Charts & Trends tab shows Pass Rate Trend and Execution Timeline charts', async ({ demoPage: page }) => {
    await expect(page.getByRole('heading', { name: 'Pass Rate Trend' })).toBeVisible();
    // Charts render as Recharts SVGs (may be 1 or more depending on viewport)
    const charts = page.locator('.recharts-wrapper');
    expect(await charts.count()).toBeGreaterThanOrEqual(1);
  });

  test('period buttons update chart data', async ({ demoPage: page }) => {
    // Switch to 90d and back to 7d
    await page.getByRole('button', { name: '90d', exact: true }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '7d', exact: true }).first().click();
    await page.waitForTimeout(500);
    // Charts should still be rendered
    expect(await page.locator('.recharts-wrapper').count()).toBeGreaterThanOrEqual(2);
  });

  test('Re-run Analysis or Run Health section shows stat cards', async ({ demoPage: page }) => {
    // Either "Re-run Analysis" or "Run Health (30d)" should be visible
    const rerunOrHealth = page.getByText('Re-run Analysis').or(page.getByText('Run Health'));
    await expect(rerunOrHealth.first()).toBeVisible();
  });

  test('Flaky Tests tab shows flaky test table with scores', async ({ demoPage: page }) => {
    await page.getByText('Flaky Tests', { exact: false }).first().click();
    await page.waitForTimeout(500);

    // Should show flaky test details table or "No flaky tests" message
    const table = page.locator('table');
    const noFlaky = page.getByText('No flaky tests detected');
    if (await table.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      // Table has columns: Test Name, Flakiness %, Total Runs, etc.
      await expect(table.locator('th').filter({ hasText: 'Flakiness' }).first()).toBeVisible();
      // At least one flaky test row
      expect(await table.locator('tbody tr').count()).toBeGreaterThan(0);
    } else {
      await expect(noFlaky).toBeVisible();
    }
  });

  test('Run History tab shows filterable run table with pagination', async ({ demoPage: page }) => {
    await page.getByText('Run History', { exact: true }).click();
    await page.waitForTimeout(500);

    // Should have filter dropdowns
    const selects = page.locator('select');
    expect(await selects.count()).toBeGreaterThanOrEqual(1);

    // Table should show runs
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    // Table has expected columns
    await expect(table.locator('th').filter({ hasText: 'Name' })).toBeVisible();
    await expect(table.locator('th').filter({ hasText: 'Status' })).toBeVisible();

    // Filter by "Failed" status
    const statusSelect = selects.first();
    await statusSelect.selectOption('FAILED');
    await page.waitForTimeout(300);

    // All visible status badges should be FAILED
    const statusCells = table.locator('tbody td:nth-child(2)');
    const count = await statusCells.count();
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        await expect(statusCells.nth(i)).toContainText('FAILED');
      }
    }
  });
});
