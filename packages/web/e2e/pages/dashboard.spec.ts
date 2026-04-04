import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';
import { DashboardPage, Header, Sidebar } from '../fixtures/page-objects';

test.describe('Dashboard overview', () => {
  test('renders the main heading and summary cards', async ({ demoPage: page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.heading).toBeVisible();
    // KPI rollup section heading
    await expect(page.getByRole('heading', { name: /Cross.Project KPI Rollup/i })).toBeVisible();
  });

  test('displays KPI rollup section', async ({ demoPage: page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // KPI values with percentages should be visible
    await expect(page.getByText(/%/).first()).toBeVisible();
  });

  test('shows all demo projects in the projects section', async ({ demoPage: page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    for (const project of Object.values(DEMO_PROJECTS)) {
      await expect(page.getByText(project.name).first()).toBeVisible();
    }
  });

  test('project link navigates to project detail', async ({ demoPage: page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await page.getByRole('link', { name: new RegExp(DEMO_PROJECTS.ecommerce.name) }).first().click();
    await page.waitForURL(`**/projects/${DEMO_PROJECTS.ecommerce.id}**`);
  });
});

test.describe('Sidebar navigation', () => {
  test('sidebar shows Overview and Projects links', async ({ demoPage: page }) => {
    await page.goto('/');
    await page.getByText('Quality Observability Dashboard').waitFor();
    const sidebar = new Sidebar(page);
    await expect(sidebar.overviewLink).toBeVisible();
    await expect(sidebar.projectsLink).toBeVisible();
  });

  test('navigating via sidebar updates the page', async ({ demoPage: page }) => {
    await page.goto('/');
    await page.getByText('Quality Observability Dashboard').waitFor();

    const sidebar = new Sidebar(page);
    await sidebar.navigateTo('Projects');
    await page.waitForURL('**/projects');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });
});

test.describe('Header controls', () => {
  test('demo toggle is visible and active', async ({ demoPage: page }) => {
    await page.goto('/');
    await page.getByText('Quality Observability Dashboard').waitFor();
    const header = new Header(page);
    await expect(header.demoToggle).toBeVisible();
  });

  test('theme toggle switches between light and dark', async ({ demoPage: page }) => {
    await page.goto('/');
    await page.getByText('Quality Observability Dashboard').waitFor();
    const header = new Header(page);

    const htmlEl = page.locator('html');
    const initialClass = await htmlEl.getAttribute('class') ?? '';
    const wasDark = initialClass.includes('dark');

    await header.toggleTheme();

    if (wasDark) {
      await expect(htmlEl).not.toHaveClass(/dark/);
    } else {
      await expect(htmlEl).toHaveClass(/dark/);
    }
  });
});
