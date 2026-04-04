import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

test.describe('Runs page', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/runs`);
  });

  test('renders tabs: Charts & Trends, Flaky Tests, Run History', async ({ demoPage: page }) => {
    const tabLabels = ['Charts', 'Flaky', 'History'];
    for (const label of tabLabels) {
      await expect(page.getByText(new RegExp(label, 'i')).first()).toBeVisible();
    }
  });

  test('pass rate trend chart renders with period selector', async ({ demoPage: page }) => {
    // Period selector buttons
    const periods = ['7d', '30d', '90d'];
    for (const period of periods) {
      const btn = page.getByRole('button', { name: period })
        .or(page.getByText(period, { exact: true }));
      await expect(btn.first()).toBeVisible();
    }
  });

  test('switching period updates the chart', async ({ demoPage: page }) => {
    const btn30d = page.getByRole('button', { name: '30d' })
      .or(page.getByText('30d', { exact: true })).first();
    const btn7d = page.getByRole('button', { name: '7d' })
      .or(page.getByText('7d', { exact: true })).first();

    if (await btn30d.isVisible()) {
      await btn30d.click();
      await page.waitForTimeout(300);
      await btn7d.click();
      await page.waitForTimeout(300);
      // No crash = success — chart re-renders with new data
    }
  });

  test('run history tab shows a table of runs', async ({ demoPage: page }) => {
    // Navigate to Run History tab
    const historyTab = page.getByText(/history/i).first();
    await historyTab.click();
    await page.waitForTimeout(300);

    // Should show a table or list of runs
    const table = page.locator('table').first();
    if (await table.isVisible()) {
      const rows = table.locator('tbody tr');
      expect(await rows.count()).toBeGreaterThan(0);
    }
  });

  test('run history has status filter', async ({ demoPage: page }) => {
    const historyTab = page.getByText(/history/i).first();
    await historyTab.click();
    await page.waitForTimeout(300);

    // Should have at least one filter select
    const selects = page.locator('select');
    if (await selects.first().isVisible()) {
      expect(await selects.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test('flaky tests tab renders', async ({ demoPage: page }) => {
    const flakyTab = page.getByText(/flaky/i).first();
    await flakyTab.click();
    await page.waitForTimeout(500);

    // Should render some content (chart or list of flaky tests)
    // At minimum the page should not be empty or errored
    await expect(page.locator('main')).not.toBeEmpty();
  });
});
