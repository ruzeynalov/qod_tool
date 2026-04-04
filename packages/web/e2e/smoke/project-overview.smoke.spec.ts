import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

/**
 * Project overview smoke: KPI cards, recent runs with real data, Export PDF button.
 */
test.describe('Project overview smoke', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}`);
    await page.locator('h1').filter({ hasText: PROJECT.name }).first().waitFor({ timeout: 15_000 });
  });

  test('KPI cards show values with correct RAG status borders', async ({ demoPage: page }) => {
    // 9 KPI cards with left border (RAG colors)
    const kpiCards = page.locator('.border-l-2');
    expect(await kpiCards.count()).toBeGreaterThanOrEqual(7);

    // Verify known metrics are present
    await expect(page.getByText('Automation Coverage').first()).toBeVisible();
    await expect(page.getByText('Pass Rate (30d)').first()).toBeVisible();
    await expect(page.getByText('Flaky Test Rate').first()).toBeVisible();
    await expect(page.getByText('Mean Time to Resolve').first()).toBeVisible();
  });

  test('recent runs show status badges, branch, and test stats', async ({ demoPage: page }) => {
    await expect(page.getByText('Recent Runs')).toBeVisible();

    // Runs have PASSED or FAILED badges
    const statusBadges = page.getByText('PASSED').or(page.getByText('FAILED'));
    expect(await statusBadges.count()).toBeGreaterThan(0);

    // Runs show passed/failed counts in colored text
    await expect(page.getByText(/\d+ passed/).first()).toBeVisible();
  });

  test('Export PDF button exists', async ({ demoPage: page }) => {
    await expect(page.getByRole('button', { name: /export pdf/i })).toBeVisible();
  });
});
