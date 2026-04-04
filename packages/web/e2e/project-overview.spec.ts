import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';
import { ProjectDetailPage } from './fixtures/page-objects';

const PROJECT = DEMO_PROJECTS.ecommerce;

test.describe('Project overview page', () => {
  let detail: ProjectDetailPage;

  test.beforeEach(async ({ demoPage: page }) => {
    detail = new ProjectDetailPage(page, PROJECT.id);
    await detail.goto();
  });

  test('renders project name and KPI cards', async ({ demoPage: page }) => {
    await expect(page.getByText(PROJECT.name).first()).toBeVisible();

    // KPI cards should be present (up to 9)
    const kpiMetrics = ['Pass Rate', 'Coverage', 'Flaky Rate'];
    for (const metric of kpiMetrics) {
      await expect(page.getByText(metric, { exact: false }).first()).toBeVisible();
    }
  });

  test('shows demo mode badge', async ({ demoPage: page }) => {
    await expect(page.getByText(/demo/i).first()).toBeVisible();
  });

  test('displays recent test runs', async ({ demoPage: page }) => {
    // Recent runs section should have run items
    // Each run shows a status, name, and test stats
    await expect(page.getByText(/passed/i).first()).toBeVisible();
  });

  test('all navigation tabs are present', async ({ demoPage: page }) => {
    const tabNames = ['Overview', 'Coverage', 'Runs', 'Defects', 'KPIs', 'Settings'];
    for (const tab of tabNames) {
      await expect(
        page.getByRole('link', { name: new RegExp(tab, 'i') }).first()
      ).toBeVisible();
    }
  });

  test('tab navigation works — coverage', async ({ demoPage: page }) => {
    await detail.navigateToTab('coverage');
    await page.waitForURL(`**/projects/${PROJECT.id}/coverage`);
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT.id}/coverage`));
  });

  test('tab navigation works — runs', async ({ demoPage: page }) => {
    await detail.navigateToTab('runs');
    await page.waitForURL(`**/projects/${PROJECT.id}/runs`);
    await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT.id}/runs`));
  });

  test('tab navigation works — defects', async ({ demoPage: page }) => {
    await detail.navigateToTab('defects');
    await page.waitForURL(`**/projects/${PROJECT.id}/defects`);
  });

  test('tab navigation works — kpis', async ({ demoPage: page }) => {
    await detail.navigateToTab('kpis');
    await page.waitForURL(`**/projects/${PROJECT.id}/kpis`);
  });

  test('tab navigation works — settings', async ({ demoPage: page }) => {
    await detail.navigateToTab('settings');
    await page.waitForURL(`**/projects/${PROJECT.id}/settings`);
  });
});
