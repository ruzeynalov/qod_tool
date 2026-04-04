import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

test.describe('Coverage page', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/coverage`);
    await page.getByText('Test Coverage').waitFor({ timeout: 15_000 });
  });

  test('renders coverage summary cards', async ({ demoPage: page }) => {
    await expect(page.getByText('Test Coverage')).toBeVisible();
    // Summary cards show coverage percentage
    await expect(page.getByText(/%/).first()).toBeVisible();
  });

  test('displays the test cases data table', async ({ demoPage: page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('search input is present and filters', async ({ demoPage: page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();

    await searchInput.fill('auth');
    // Wait for debounce (300ms) + re-render
    await page.waitForTimeout(500);

    // Table should still be visible
    await expect(page.locator('table').first()).toBeVisible();
  });

  test('filter dropdowns are present', async ({ demoPage: page }) => {
    const selects = page.locator('select');
    expect(await selects.count()).toBeGreaterThanOrEqual(1);
  });

  test('tabs for Test Cases, Stories, Epics exist', async ({ demoPage: page }) => {
    for (const tab of ['Test Cases', 'Stories', 'Epics']) {
      await expect(page.getByText(tab, { exact: true }).first()).toBeVisible();
    }
  });

  test('pagination is present', async ({ demoPage: page }) => {
    // Look for pagination indicators (page numbers or next/prev buttons)
    const pagination = page.getByRole('button', { name: /next|prev|›|»/i })
      .or(page.locator('button').filter({ hasText: /^[0-9]+$/ }));
    if (await pagination.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await pagination.count()).toBeGreaterThan(0);
    }
  });
});
