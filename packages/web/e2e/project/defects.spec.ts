import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

test.describe('Defects page', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/defects`);
    // The project tab label "Defects" matches /defect/i and can satisfy that wait before
    // async data + filter controls mount (especially on slower browsers).
    await page.getByRole('heading', { name: 'All Defects' }).waitFor({ timeout: 15_000 });
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
    const table = page.locator('table').first();
    await expect(table.locator('tbody tr').first()).toBeVisible();

    // Row badges use lowercase enum text (critical, high, …). Filter <option> labels match in
    // Chromium but are not reliably discoverable via getByText in WebKit, so scope to the table.
    await expect(
      table.getByText(/^(critical|high|medium|low)$/).first(),
    ).toBeVisible();
  });

  test('filter selects are present', async ({ demoPage: page }) => {
    // Our Select primitive is a native <select>. Chromium maps it to role=combobox; Firefox
    // often does not, so assert on the DOM instead of the ARIA role.
    const filters = page.locator('select');
    await expect(filters.first()).toBeVisible({ timeout: 15_000 });
    expect(await filters.count()).toBeGreaterThanOrEqual(1);
  });

  test('charts render SVG elements', async ({ demoPage: page }) => {
    // Recharts renders SVG elements for charts
    const svgs = page.locator('svg');
    expect(await svgs.count()).toBeGreaterThan(0);
  });
});
