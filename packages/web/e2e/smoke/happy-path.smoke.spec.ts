import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

/**
 * Happy path: end-to-end user journey through the entire app.
 * Simulates a QA lead checking the dashboard, drilling into a project,
 * reviewing test coverage, checking run trends, investigating defects.
 */
test.describe('Happy path journey', () => {
  test('QA lead reviews quality across projects', async ({ demoPage: page }) => {
    // 1. Land on dashboard, see quality overview
    await page.goto('/');
    await page.getByText('Quality Observability Dashboard').waitFor({ timeout: 15_000 });

    // Verify 3 active projects with real data
    const projectCount = page.locator('.card').filter({ hasText: 'Active Projects' });
    await expect(projectCount.locator('.text-xl')).toHaveText('3');

    // 2. Navigate to projects list
    const sidebar = page.locator('nav[aria-label="Main navigation"]');
    await sidebar.getByRole('link', { name: 'Projects' }).click();
    await page.waitForURL('**/projects');

    // See 3 project cards with real stats
    await expect(page.getByText('3 projects configured')).toBeVisible();
    await expect(page.getByText(PROJECT.name).first()).toBeVisible();

    // 3. Open E-Commerce project
    await page.getByRole('link', { name: new RegExp(PROJECT.name) }).first().click();
    await page.waitForURL(`**/projects/${PROJECT.id}**`);

    // See project overview with KPI cards and recent runs
    await expect(page.getByText('Recent Runs')).toBeVisible();
    const kpiCards = page.locator('.border-l-2');
    expect(await kpiCards.count()).toBeGreaterThanOrEqual(7);

    // 4. Check test coverage
    const main = page.getByRole('main');
    await main.getByRole('link', { name: 'Coverage' }).click();
    await page.waitForURL(`**/projects/${PROJECT.id}/coverage`);
    await expect(page.getByText('Test Coverage')).toBeVisible();
    await expect(page.getByText('420').first()).toBeVisible(); // total test cases

    // Search for payment-related tests
    // Mobile filter row also renders a SearchInput with this placeholder; scope to the first (desktop) one.
    await page.getByPlaceholder('Search test cases...').first().fill('payment');
    await page.waitForTimeout(500);
    const table = page.locator('table').first();
    expect(await table.locator('tbody tr').count()).toBeGreaterThan(0);
    await page.getByPlaceholder('Search test cases...').first().clear();
    await page.waitForTimeout(500);

    // 5. Check run trends
    await main.getByRole('link', { name: 'Runs' }).click();
    await page.waitForURL(`**/projects/${PROJECT.id}/runs`);
    await expect(page.getByText('Automation Runs')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pass Rate Trend' })).toBeVisible();

    // Switch to flaky tests
    await page.getByText('Flaky Tests', { exact: false }).first().click();
    await page.waitForTimeout(500);

    // Switch to run history and filter by Failed
    await page.getByText('Run History', { exact: true }).click();
    await page.waitForTimeout(500);
    const historyTable = page.locator('table').first();
    if (await historyTable.isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await historyTable.locator('tbody tr').count()).toBeGreaterThan(0);
    }

    // 6. Investigate defects
    await main.getByRole('link', { name: 'Defects' }).click();
    await page.waitForURL(`**/projects/${PROJECT.id}/defects`);
    await expect(page.getByText(/MTTR|Defect Density/).first()).toBeVisible();
    await expect(page.getByText('Total Open Defects').first()).toBeVisible();

    // 7. Check KPI dashboard
    await main.getByRole('link', { name: 'KPIs' }).click();
    await page.waitForURL(`**/projects/${PROJECT.id}/kpis`);
    await expect(page.getByText('Quality KPI Dashboard')).toBeVisible();

    // Verify KPI metric values are visible
    await expect(page.getByText('Automation Coverage').first()).toBeVisible();

    // 8. Check settings
    await main.getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL(`**/projects/${PROJECT.id}/settings`);
    await expect(page.getByText(/read-only in demo mode/i)).toBeVisible();
  });

  test('user checks different projects have different data', async ({ demoPage: page }) => {
    // Navigate to E-Commerce
    await page.goto(`/projects/${DEMO_PROJECTS.ecommerce.id}/coverage`);
    await page.getByText('Test Coverage').waitFor({ timeout: 15_000 });
    await expect(page.getByText('420').first()).toBeVisible(); // 420 test cases

    // Navigate to Banking
    await page.goto(`/projects/${DEMO_PROJECTS.banking.id}/coverage`);
    await page.getByText('Test Coverage').waitFor({ timeout: 15_000 });
    await expect(page.getByText('310').first()).toBeVisible(); // 310 test cases

    // Navigate to Internal Tools
    await page.goto(`/projects/${DEMO_PROJECTS.internal.id}/coverage`);
    await page.getByText('Test Coverage').waitFor({ timeout: 15_000 });
    await expect(page.getByText('180').first()).toBeVisible(); // 180 test cases
  });
});
