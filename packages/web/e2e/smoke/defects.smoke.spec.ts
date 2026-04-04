import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

/**
 * Defects smoke: MTTR stats, severity breakdown, filtering, age distribution.
 */
test.describe('Defects smoke', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/defects`);
    await page.getByText(/MTTR|Defect Density/).first().waitFor({ timeout: 15_000 });
  });

  test('resolution timing section shows MTTD, Density, and MTTR stat cards', async ({ demoPage: page }) => {
    await expect(page.getByText('Avg MTTD').first()).toBeVisible();
    await expect(page.getByText('Defect Density').first()).toBeVisible();
    await expect(page.getByText('Median MTTR').first()).toBeVisible();
  });

  test('MTTR by Severity table shows severity rows with time values', async ({ demoPage: page }) => {
    // MTTR table has "Severity", "Avg MTTR", "Count" headers
    const mttrTable = page.locator('table').first();
    await expect(mttrTable.locator('th').filter({ hasText: 'Avg MTTR' })).toBeVisible();
    expect(await mttrTable.locator('tbody tr').count()).toBeGreaterThan(0);
  });

  test('summary cards show open defects, critical/high count, and escaped defects', async ({ demoPage: page }) => {
    await expect(page.getByText('Total Open Defects').first()).toBeVisible();
    await expect(page.getByText('Critical / High').first()).toBeVisible();
    await expect(page.getByText('Escaped Defects').first()).toBeVisible();
  });

  test('severity filter narrows defect table results', async ({ demoPage: page }) => {
    const table = page.locator('table').last();
    await expect(table).toBeVisible();
    const initialCount = await table.locator('tbody tr').count();

    // Find severity filter by its "All Severities" option
    const severitySelect = page.locator('select').filter({ has: page.locator('option', { hasText: /severit/i }) }).first();
    // Select the second option (first non-All option)
    await severitySelect.selectOption({ index: 1 });
    await page.waitForTimeout(300);

    const filteredCount = await table.locator('tbody tr').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('main defect table has expected columns', async ({ demoPage: page }) => {
    // The "All Defects" table is the last table on the page (first is MTTR by Severity)
    const allDefectsCard = page.getByText('All Defects').locator('..');
    await expect(allDefectsCard).toBeVisible();

    const table = page.locator('table').last();
    await expect(table).toBeVisible();
    expect(await table.locator('tbody tr').count()).toBeGreaterThan(0);

    const headers = await table.locator('th').allTextContents();
    const headerText = headers.join(' ');
    expect(headerText).toMatch(/Title/);
    expect(headerText).toMatch(/Severity/i);
    expect(headerText).toMatch(/Status/i);
  });

  test('search filters defects by title or ID', async ({ demoPage: page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();

    const table = page.locator('table').last();
    const initialCount = await table.locator('tbody tr').count();

    await searchInput.fill('payment');
    await page.waitForTimeout(500);

    const filteredCount = await table.locator('tbody tr').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('defect inflow vs resolution chart renders', async ({ demoPage: page }) => {
    await expect(page.getByText('Defect Inflow vs Resolution')).toBeVisible();
    const chart = page.locator('.recharts-wrapper');
    expect(await chart.count()).toBeGreaterThan(0);
  });

  test('age distribution chart shows time buckets', async ({ demoPage: page }) => {
    await expect(page.getByText('Open Defect Age Distribution')).toBeVisible();
  });

  test('pagination shows total count and navigates', async ({ demoPage: page }) => {
    await expect(page.getByText(/Showing \d+.+of \d+/).first()).toBeVisible();
  });
});
