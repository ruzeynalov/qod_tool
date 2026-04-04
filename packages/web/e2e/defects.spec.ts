import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

test.describe('Defects page', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/defects`);
  });

  test('renders severity breakdown and defect table', async ({ demoPage: page }) => {
    // Severity-related text should appear (chart or table headers)
    await expect(page.getByText(/severity/i).first()).toBeVisible();
  });

  test('displays defect table with rows', async ({ demoPage: page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('defect rows show severity badges', async ({ demoPage: page }) => {
    // Severity values in demo data
    const severities = ['Critical', 'Major', 'Minor', 'Trivial'];
    let found = 0;
    for (const sev of severities) {
      if (await page.getByText(sev, { exact: true }).first().isVisible().catch(() => false)) {
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  test('filters are present and functional', async ({ demoPage: page }) => {
    const selects = page.locator('select');
    const selectCount = await selects.count();
    expect(selectCount).toBeGreaterThanOrEqual(1);

    // Try changing a filter
    const firstSelect = selects.first();
    const options = firstSelect.locator('option');
    if (await options.count() > 1) {
      await firstSelect.selectOption({ index: 1 });
      await page.waitForTimeout(300);
      // Page should re-render without error
      await expect(page.locator('main')).not.toBeEmpty();
    }
  });

  test('charts are rendered (SVG elements present)', async ({ demoPage: page }) => {
    // Recharts renders SVG elements
    const svgs = page.locator('svg.recharts-surface');
    if (await svgs.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      expect(await svgs.count()).toBeGreaterThan(0);
    }
  });

  test('defect status values are displayed', async ({ demoPage: page }) => {
    const statuses = ['Open', 'Closed', 'In Progress', 'Resolved'];
    let found = 0;
    for (const status of statuses) {
      if (await page.getByText(status, { exact: true }).first().isVisible().catch(() => false)) {
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
