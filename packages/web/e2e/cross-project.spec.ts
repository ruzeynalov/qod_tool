import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';

test.describe('Cross-project navigation flow', () => {
  test('full user journey: dashboard → projects → project detail → tabs → back', async ({ demoPage: page }) => {
    // 1. Dashboard
    await page.goto('/');
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();

    // 2. Navigate to projects via sidebar
    const sidebar = page.locator('nav[aria-label="Main navigation"]');
    await sidebar.getByRole('link', { name: 'Projects' }).click();
    await page.waitForURL('**/projects');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

    // 3. Open banking project
    await page.getByRole('link', { name: new RegExp(DEMO_PROJECTS.banking.name) }).first().click();
    await page.waitForURL(`**/projects/${DEMO_PROJECTS.banking.id}**`);

    // 4. Navigate through tabs (scoped to main content to avoid sidebar duplicates)
    const main = page.getByRole('main');
    const tabs = ['Coverage', 'Runs', 'Defects', 'KPIs', 'Settings'];
    for (const tab of tabs) {
      await main.getByRole('link', { name: tab }).click();
      await page.waitForURL(`**/projects/${DEMO_PROJECTS.banking.id}/${tab.toLowerCase()}`);
    }

    // 5. Navigate back to dashboard via sidebar
    await sidebar.getByRole('link', { name: 'Overview' }).first().click();
    await page.waitForURL(/\/$/);
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();
  });

  test('switching between projects', async ({ demoPage: page }) => {
    await page.goto(`/projects/${DEMO_PROJECTS.ecommerce.id}`);
    await expect(page.getByText(DEMO_PROJECTS.ecommerce.name).first()).toBeVisible();

    // Go to projects list via sidebar
    const sidebar = page.locator('nav[aria-label="Main navigation"]');
    await sidebar.getByRole('link', { name: 'Projects' }).click();
    await page.waitForURL('**/projects');

    // Open different project
    await page.getByRole('link', { name: new RegExp(DEMO_PROJECTS.internal.name) }).first().click();
    await page.waitForURL(`**/projects/${DEMO_PROJECTS.internal.id}**`);
    await expect(page.getByText(DEMO_PROJECTS.internal.name).first()).toBeVisible();
  });

  test('browser back/forward navigation works', async ({ demoPage: page }) => {
    await page.goto('/');
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();

    const sidebar = page.locator('nav[aria-label="Main navigation"]');
    await sidebar.getByRole('link', { name: 'Projects' }).click();
    await page.waitForURL('**/projects');

    await page.goBack();
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();

    await page.goForward();
    await page.waitForURL('**/projects');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });
});

test.describe('Responsive layout', () => {
  test('page renders correctly on narrow viewport', async ({ demoPage: page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();
  });
});

test.describe('Error handling', () => {
  test('404 page renders for unknown routes', async ({ demoPage: page }) => {
    const response = await page.goto('/this-route-does-not-exist');
    // Should get a 404 response or show a not-found page
    expect(response?.status()).toBe(404);
  });

  test('invalid project ID shows graceful fallback', async ({ demoPage: page }) => {
    await page.goto('/projects/non-existent-project-id');
    // Page should render without crashing
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
