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
    // User-visible RAG label in the detail header (avoids [class*="border-l"], which can match
    // nothing in WebKit when class strings include arbitrary values like border-l-[3px]).
    await expect(page.getByText(/^(GREEN|AMBER|RED)$/).first()).toBeVisible();
  });

  test('trend charts are rendered', async ({ demoPage: page }) => {
    // SVG chart elements should be present
    const svgs = page.locator('svg');
    expect(await svgs.count()).toBeGreaterThan(0);
  });
});
