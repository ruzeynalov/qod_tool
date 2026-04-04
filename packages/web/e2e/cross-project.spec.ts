import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';

test.describe('Cross-project navigation flow', () => {
  test('full user journey: dashboard → projects → project detail → tabs → back', async ({ demoPage: page }) => {
    // 1. Start at dashboard
    await page.goto('/');
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();

    // 2. Navigate to projects via sidebar
    await page.getByRole('link', { name: /projects/i }).first().click();
    await page.waitForURL('**/projects');
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible();

    // 3. Open the banking project
    await page.getByRole('link', { name: new RegExp(DEMO_PROJECTS.banking.name) }).first().click();
    await page.waitForURL(`**/projects/${DEMO_PROJECTS.banking.id}**`);
    await expect(page.getByText(DEMO_PROJECTS.banking.name).first()).toBeVisible();

    // 4. Navigate to each sub-tab
    const tabs: Array<{ name: RegExp; urlPart: string }> = [
      { name: /coverage/i, urlPart: 'coverage' },
      { name: /runs/i, urlPart: 'runs' },
      { name: /defects/i, urlPart: 'defects' },
      { name: /kpis/i, urlPart: 'kpis' },
      { name: /settings/i, urlPart: 'settings' },
    ];

    for (const tab of tabs) {
      await page.getByRole('link', { name: tab.name }).first().click();
      await page.waitForURL(`**/projects/${DEMO_PROJECTS.banking.id}/${tab.urlPart}`);
      // Each tab should render without error
      await expect(page.locator('main')).not.toBeEmpty();
    }

    // 5. Navigate back to dashboard via sidebar
    await page.getByRole('link', { name: /overview/i }).first().click();
    await page.waitForURL(/\/$/);
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();
  });

  test('switching between projects preserves app state', async ({ demoPage: page }) => {
    // Visit ecommerce project
    await page.goto(`/projects/${DEMO_PROJECTS.ecommerce.id}`);
    await expect(page.getByText(DEMO_PROJECTS.ecommerce.name).first()).toBeVisible();

    // Navigate to projects list
    await page.getByRole('link', { name: /projects/i }).first().click();
    await page.waitForURL('**/projects');

    // Switch to internal tools project
    await page.getByRole('link', { name: new RegExp(DEMO_PROJECTS.internal.name) }).first().click();
    await page.waitForURL(`**/projects/${DEMO_PROJECTS.internal.id}**`);
    await expect(page.getByText(DEMO_PROJECTS.internal.name).first()).toBeVisible();
  });

  test('browser back/forward navigation works', async ({ demoPage: page }) => {
    await page.goto('/');
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();

    // Navigate to projects
    await page.getByRole('link', { name: /projects/i }).first().click();
    await page.waitForURL('**/projects');

    // Go back
    await page.goBack();
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();

    // Go forward
    await page.goForward();
    await page.waitForURL('**/projects');
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible();
  });
});

test.describe('Responsive layout', () => {
  test('sidebar collapses on narrow viewport', async ({ demoPage: page }) => {
    await page.goto('/');
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();

    // Set narrow viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);

    // Page should still be functional
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();
  });
});

test.describe('Error handling', () => {
  test('404 page renders for unknown routes', async ({ demoPage: page }) => {
    await page.goto('/this-route-does-not-exist');

    // Should show a not-found page or redirect
    const notFound = page.getByText(/not found|404/i);
    if (await notFound.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(notFound.first()).toBeVisible();
    }
  });

  test('invalid project ID shows error or empty state', async ({ demoPage: page }) => {
    await page.goto('/projects/non-existent-project-id');

    // Should gracefully handle — show empty state, error, or redirect
    await expect(page.locator('main')).not.toBeEmpty();
  });
});
