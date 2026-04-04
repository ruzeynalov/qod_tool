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

  test('each project card shows key metrics', async ({ demoPage: page }) => {
    const projects = new ProjectsPage(page);
    await projects.goto();

    // At least one project card should display pass rate and test count
    await expect(page.getByText(/pass rate/i).first()).toBeVisible();
  });

  test('shows demo badge on demo projects', async ({ demoPage: page }) => {
    const projects = new ProjectsPage(page);
    await projects.goto();

    // Demo projects should have a demo indicator
    const demoBadges = page.getByText('Demo', { exact: true });
    await expect(demoBadges.first()).toBeVisible();
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

    // Form fields should appear
    const nameInput = page.getByPlaceholder(/project name/i).or(page.locator('input[name="name"]')).first();
    await expect(nameInput).toBeVisible();

    // Cancel button should dismiss the form
    const cancelButton = page.getByRole('button', { name: /cancel/i });
    await cancelButton.click();
    await expect(nameInput).not.toBeVisible();
  });
});
