import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';
import { ProjectsPage } from './fixtures/page-objects';

test.describe('Projects list page', () => {
  test('renders heading and all demo projects', async ({ demoPage: page }) => {
    const projects = new ProjectsPage(page);
    await projects.goto();

    await expect(projects.heading).toBeVisible();
    for (const project of Object.values(DEMO_PROJECTS)) {
      await expect(page.getByText(project.name).first()).toBeVisible();
    }
  });

  test('project cards show key stats', async ({ demoPage: page }) => {
    const projects = new ProjectsPage(page);
    await projects.goto();

    // Cards display test count, pass rate %, open defects count
    await expect(page.getByText(/%/).first()).toBeVisible();
    await expect(page.getByText(/open/).first()).toBeVisible();
  });

  test('shows demo badge on demo projects', async ({ demoPage: page }) => {
    const projects = new ProjectsPage(page);
    await projects.goto();

    const demoBadges = page.getByText('Demo', { exact: true });
    expect(await demoBadges.count()).toBeGreaterThanOrEqual(3);
  });

  test('clicking a project card navigates to project overview', async ({ demoPage: page }) => {
    const projects = new ProjectsPage(page);
    await projects.goto();

    await projects.openProject(new RegExp(DEMO_PROJECTS.banking.name));
    await page.waitForURL(`**/projects/${DEMO_PROJECTS.banking.id}**`);
    await expect(page.getByText(DEMO_PROJECTS.banking.name).first()).toBeVisible();
  });

  test('new project button is visible', async ({ demoPage: page }) => {
    const projects = new ProjectsPage(page);
    await projects.goto();

    await expect(projects.newProjectButton).toBeVisible();
  });

  test('new project form opens and can be cancelled', async ({ demoPage: page }) => {
    const projects = new ProjectsPage(page);
    await projects.goto();

    await projects.newProjectButton.click();

    // Form should appear with project name input
    const nameInput = page.getByPlaceholder('e.g. Payment Service');
    await expect(nameInput).toBeVisible();

    // Cancel button should dismiss the form
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await cancelButton.click();
    await expect(nameInput).not.toBeVisible();
  });
});
