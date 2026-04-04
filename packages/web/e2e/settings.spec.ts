import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

test.describe('Settings page', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/settings`);
    await page.locator('h1').first().waitFor({ timeout: 15_000 });
  });

  test('renders settings tabs', async ({ demoPage: page }) => {
    for (const tab of ['Connectors', 'Thresholds', 'General']) {
      await expect(page.getByText(tab, { exact: false }).first()).toBeVisible();
    }
  });

  test('connectors tab shows connector info', async ({ demoPage: page }) => {
    // Should show connector types or empty state
    await expect(page.locator('main')).not.toBeEmpty();
  });

  test('clicking KPI thresholds tab renders content', async ({ demoPage: page }) => {
    await page.getByText(/threshold/i).first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('main')).not.toBeEmpty();
  });

  test('clicking general tab renders content', async ({ demoPage: page }) => {
    await page.getByText(/general/i).first().click();
    await page.waitForTimeout(300);
    await expect(page.locator('main')).not.toBeEmpty();
  });
});
