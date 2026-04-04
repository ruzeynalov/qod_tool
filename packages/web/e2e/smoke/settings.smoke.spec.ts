import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

/**
 * Settings smoke: tabs, connector form, KPI thresholds, general, danger zone.
 */
test.describe('Settings smoke', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/settings`);
    await page.locator('h1').first().waitFor({ timeout: 15_000 });
  });

  test('demo mode warning is shown', async ({ demoPage: page }) => {
    await expect(page.getByText(/read-only in demo mode/i)).toBeVisible();
  });

  test('Connectors tab shows connector management UI', async ({ demoPage: page }) => {
    // In demo mode, should show connector list or add connector button
    await expect(page.getByText(/connector/i).first()).toBeVisible();
  });

  test('KPI Thresholds tab shows editable threshold table', async ({ demoPage: page }) => {
    await page.getByText('KPI Thresholds', { exact: false }).first().click();
    await page.waitForTimeout(500);

    // Table should have metric rows with Target, Green, Amber columns
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    await expect(table.locator('th').filter({ hasText: 'Target' })).toBeVisible();
    await expect(table.locator('th').filter({ hasText: 'Green' })).toBeVisible();
    await expect(table.locator('th').filter({ hasText: 'Amber' })).toBeVisible();

    // Metrics should be listed
    await expect(page.getByText('Test Coverage').first()).toBeVisible();
    await expect(page.getByText('Flaky Rate').first()).toBeVisible();

    // Save button should be present
    await expect(page.getByRole('button', { name: /save thresholds/i })).toBeVisible();
  });

  test('KPI Formulas tab shows formula reference cards', async ({ demoPage: page }) => {
    await page.getByText('KPI Formulas', { exact: false }).first().click();
    await page.waitForTimeout(500);

    await expect(page.getByText('KPI Formulas Reference')).toBeVisible();
    // Should show formula categories
    await expect(page.getByText('Testing Metrics').first()).toBeVisible();
    await expect(page.getByText('Defect Metrics').first()).toBeVisible();
  });

  test('General tab shows project name input and danger zone', async ({ demoPage: page }) => {
    await page.getByText('General', { exact: true }).first().click();
    await page.waitForTimeout(500);

    // Project Details section
    await expect(page.getByText('Project Details')).toBeVisible();

    // Danger Zone
    await expect(page.getByText('Danger Zone')).toBeVisible();
    await expect(page.getByRole('button', { name: /delete project/i })).toBeVisible();
  });

  test('General tab shows danger zone with delete button', async ({ demoPage: page }) => {
    await page.getByText('General', { exact: true }).first().click();
    await page.waitForTimeout(500);

    // Scroll to danger zone and verify it exists
    const dangerZone = page.getByText('Danger Zone');
    await dangerZone.scrollIntoViewIfNeeded();
    await expect(dangerZone).toBeVisible();

    // Delete button should be present
    const deleteBtn = page.getByRole('button', { name: /delete project/i });
    await deleteBtn.scrollIntoViewIfNeeded();
    await expect(deleteBtn).toBeVisible();
  });
});
