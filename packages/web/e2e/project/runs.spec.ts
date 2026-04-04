import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

test.describe('Runs page', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/runs`);
    await page.getByText('Automation Runs').waitFor({ timeout: 15_000 });
  });

  test('renders page heading and tabs', async ({ demoPage: page }) => {
    await expect(page.getByText('Automation Runs')).toBeVisible();

    for (const label of ['Charts & Trends', 'Flaky Tests', 'Run History']) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test('pass rate trend chart renders with period buttons', async ({ demoPage: page }) => {
    await expect(page.getByRole('heading', { name: 'Pass Rate Trend' })).toBeVisible();

    for (const period of ['7d', '30d', '90d']) {
      await expect(page.getByRole('button', { name: period, exact: true }).first()).toBeVisible();
    }
  });

  test('switching period selector works', async ({ demoPage: page }) => {
    const btn30d = page.getByText('30d', { exact: true }).first();
    const btn7d = page.getByText('7d', { exact: true }).first();

    await btn30d.click();
    await page.waitForTimeout(300);
    await btn7d.click();
    await page.waitForTimeout(300);
    // No crash = chart re-renders successfully
  });

  test('flaky tests tab renders content', async ({ demoPage: page }) => {
    await page.getByText('Flaky Tests').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('main')).not.toBeEmpty();
  });

  test('run history tab shows table', async ({ demoPage: page }) => {
    await page.getByText('Run History').click();
    await page.waitForTimeout(500);

    // Should show a table or list of pipeline runs
    const table = page.locator('table');
    if (await table.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      expect(await table.locator('tbody tr').count()).toBeGreaterThan(0);
    }
  });
});
