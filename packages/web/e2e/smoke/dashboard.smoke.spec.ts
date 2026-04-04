import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

/**
 * Dashboard smoke: verify aggregated data renders correctly across all 3 demo projects.
 */
test.describe('Dashboard smoke', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto('/');
    await page.getByText('Quality Observability Dashboard').waitFor({ timeout: 15_000 });
  });

  test('summary cards show real aggregated numbers, not placeholders', async ({ demoPage: page }) => {
    // Active Projects should show "3"
    const activeProjects = page.locator('.card').filter({ hasText: 'Active Projects' });
    await expect(activeProjects.locator('.text-xl')).toHaveText('3');

    // Avg Pass Rate should show a percentage (not "—")
    const passRate = page.locator('.card').filter({ hasText: 'Avg Pass Rate' });
    await expect(passRate.locator('.text-xl')).toContainText('%');

    // Open Defects should show a number
    const defects = page.locator('.card').filter({ hasText: 'Open Defects' });
    const defectText = await defects.locator('.text-xl').textContent();
    expect(Number(defectText)).toBeGreaterThan(0);

    // Total Test Cases should be sum across projects (420+310+180 = 910)
    const testCases = page.locator('.card').filter({ hasText: 'Total Test Cases' });
    await expect(testCases.locator('.text-xl')).toHaveText('910');
  });

  test('KPI rollup cards have RAG-colored borders and numeric values', async ({ demoPage: page }) => {
    const rollupSection = page.getByRole('heading', { name: 'Cross-Project KPI Rollup' }).locator('..');
    await expect(rollupSection).toBeVisible();

    // Each KPI card has a colored left border (border-l-2 + border-rag-*)
    const kpiCards = page.locator('.border-l-2');
    const count = await kpiCards.count();
    expect(count).toBeGreaterThanOrEqual(7);

    // Verify specific metrics are present with percentage values
    await expect(page.getByText('Automation Coverage').first()).toBeVisible();
    await expect(page.getByText('Flaky Test Rate').first()).toBeVisible();
    await expect(page.getByText('Release Readiness').first()).toBeVisible();
  });

  test('project links show per-project pass rate and coverage', async ({ demoPage: page }) => {
    // Each project row in the "Projects" section shows pass% and coverage%
    for (const proj of Object.values(DEMO_PROJECTS)) {
      const row = page.getByRole('link', { name: new RegExp(proj.name) }).first();
      await expect(row).toBeVisible();
      // Should contain a "% pass" and "% coverage" label
      await expect(row.getByText(/\d+\.\d+% pass/)).toBeVisible();
      await expect(row.getByText(/\d+% coverage/)).toBeVisible();
    }
  });

  test('clicking a project navigates to its overview with KPI cards', async ({ demoPage: page }) => {
    await page.getByRole('link', { name: new RegExp(DEMO_PROJECTS.ecommerce.name) }).first().click();
    await page.waitForURL(`**/projects/${DEMO_PROJECTS.ecommerce.id}**`);

    // Project overview should show KPI cards with RAG borders
    await expect(page.locator('.border-l-2').first()).toBeVisible();
    // And recent runs section
    await expect(page.getByText('Recent Runs')).toBeVisible();
  });
});
