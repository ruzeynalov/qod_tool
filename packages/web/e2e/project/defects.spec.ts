import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

test.describe('Defects page', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/defects`);
    // Wait for defects content to load
    await page.getByText(/defect/i).first().waitFor({ timeout: 15_000 });
  });

  test('renders defect sections and charts', async ({ demoPage: page }) => {
    // Page should show MTTR or severity info
    await expect(page.getByText(/MTTR|Severity|Resolution/i).first()).toBeVisible();
  });

  test('displays defect table with rows', async ({ demoPage: page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('defect rows show severity badges', async ({ demoPage: page }) => {
    const severities = ['Critical', 'Major', 'Minor', 'Trivial'];
    let found = 0;
    for (const sev of severities) {
      const count = await page.getByText(sev, { exact: true }).count();
      if (count > 0) found++;
    }
    expect(found).toBeGreaterThan(0);
  });

  test('filter selects are present', async ({ demoPage: page }) => {
    const selects = page.locator('select');
    expect(await selects.count()).toBeGreaterThanOrEqual(1);
  });

  test('charts render SVG elements', async ({ demoPage: page }) => {
    // Recharts renders SVG elements for charts
    const svgs = page.locator('svg');
    expect(await svgs.count()).toBeGreaterThan(0);
  });
});
