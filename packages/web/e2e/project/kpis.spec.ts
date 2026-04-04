import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

test.describe('KPIs page', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/kpis`);
    await page.locator('h1').first().waitFor({ timeout: 15_000 });
  });

  test('renders KPI metric cards with values', async ({ demoPage: page }) => {
    // KPI cards contain percentage values
    await expect(page.getByText(/%/).first()).toBeVisible();
  });

  test('displays RAG status colors', async ({ demoPage: page }) => {
    // KPI cards have colored left borders for RAG status
    const cards = page.locator('[class*="border-l"]');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('trend charts are rendered', async ({ demoPage: page }) => {
    // SVG chart elements should be present
    const svgs = page.locator('svg');
    expect(await svgs.count()).toBeGreaterThan(0);
  });
});
