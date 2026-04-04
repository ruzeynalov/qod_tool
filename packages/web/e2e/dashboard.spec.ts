import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';
import { DashboardPage, Header, Sidebar } from './fixtures/page-objects';

test.describe('Dashboard overview', () => {
  test('renders the main heading and summary cards', async ({ demoPage: page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.heading).toBeVisible();
    // Summary cards: Active Projects, Avg Pass Rate, Open Defects, Total Test Cases
    await expect(page.getByText('Active Projects')).toBeVisible();
    await expect(page.getByText('Avg Pass Rate')).toBeVisible();
    await expect(page.getByText('Open Defects')).toBeVisible();
    await expect(page.getByText('Total Test Cases')).toBeVisible();
  });

  test('displays KPI rollup cards with RAG status', async ({ demoPage: page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // At least some KPI metric labels should be visible
    const kpiLabels = ['Pass Rate', 'Coverage', 'Flaky Rate', 'MTTR'];
    for (const label of kpiLabels) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });

  test('shows project quick links for all demo projects', async ({ demoPage: page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    for (const project of Object.values(DEMO_PROJECTS)) {
      await expect(page.getByText(project.name).first()).toBeVisible();
    }
  });

  test('project quick link navigates to project detail', async ({ demoPage: page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await page.getByRole('link', { name: new RegExp(DEMO_PROJECTS.ecommerce.name) }).first().click();
    await page.waitForURL(`**/projects/${DEMO_PROJECTS.ecommerce.id}**`);
    await expect(page).toHaveURL(new RegExp(`/projects/${DEMO_PROJECTS.ecommerce.id}`));
  });
});

test.describe('Sidebar navigation', () => {
  test('sidebar shows Overview and Projects links', async ({ demoPage: page }) => {
    await page.goto('/');
    const sidebar = new Sidebar(page);
    await expect(sidebar.overviewLink).toBeVisible();
    await expect(sidebar.projectsLink).toBeVisible();
  });

  test('navigating via sidebar updates the page', async ({ demoPage: page }) => {
    await page.goto('/');

    const sidebar = new Sidebar(page);
    await sidebar.navigateTo('Projects');
    await page.waitForURL('**/projects');
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible();
  });
});

test.describe('Header controls', () => {
  test('demo toggle is visible and active', async ({ demoPage: page }) => {
    await page.goto('/');
    const header = new Header(page);
    await expect(header.demoToggle).toBeVisible();
  });

  test('theme toggle switches between light and dark', async ({ demoPage: page }) => {
    await page.goto('/');
    const header = new Header(page);

    // Get initial theme
    const htmlEl = page.locator('html');
    const initialClass = await htmlEl.getAttribute('class') ?? '';
    const wasDark = initialClass.includes('dark');

    await header.toggleTheme();

    // Class should have changed
    if (wasDark) {
      await expect(htmlEl).not.toHaveClass(/dark/);
    } else {
      await expect(htmlEl).toHaveClass(/dark/);
    }
  });
});
