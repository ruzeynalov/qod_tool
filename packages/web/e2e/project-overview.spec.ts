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
    await expect(page.locator('h1').filter({ hasText: PROJECT.name }).first()).toBeVisible();
    // KPI percentage values should be present
    await expect(page.getByText(/%/).first()).toBeVisible();
  });

  test('shows demo mode badge', async ({ demoPage: page }) => {
    await expect(page.getByText('Demo Mode')).toBeVisible();
  });

  test('displays recent test runs section', async ({ demoPage: page }) => {
    await expect(page.getByText('Recent Runs')).toBeVisible();
  });

  test('all navigation tabs are present', async ({ demoPage: page }) => {
    const tabNames = ['Overview', 'Coverage', 'Runs', 'Defects', 'KPIs', 'Settings'];
    for (const tab of tabNames) {
      await expect(
        page.locator(`a[href^="/projects/${PROJECT.id}"]`).filter({ hasText: tab }).first()
      ).toBeVisible();
    }
  });

  test('tab navigation works — coverage', async ({ demoPage: page }) => {
    await detail.clickTab('Coverage');
    await page.waitForURL(`**/projects/${PROJECT.id}/coverage`);
  });

  test('tab navigation works — runs', async ({ demoPage: page }) => {
    await detail.clickTab('Runs');
    await page.waitForURL(`**/projects/${PROJECT.id}/runs`);
  });

  test('tab navigation works — defects', async ({ demoPage: page }) => {
    await detail.clickTab('Defects');
    await page.waitForURL(`**/projects/${PROJECT.id}/defects`);
  });

  test('tab navigation works — kpis', async ({ demoPage: page }) => {
    await detail.clickTab('KPIs');
    await page.waitForURL(`**/projects/${PROJECT.id}/kpis`);
  });

  test('tab navigation works — settings', async ({ demoPage: page }) => {
    await detail.clickTab('Settings');
    await page.waitForURL(`**/projects/${PROJECT.id}/settings`);
  });
});
