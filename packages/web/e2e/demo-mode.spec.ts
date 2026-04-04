import { test, expect } from '@playwright/test';

test.describe('Demo mode toggle', () => {
  test('enabling demo mode bypasses login and shows dashboard', async ({ page }) => {
    // Start with demo mode off
    await page.addInitScript(() => {
      localStorage.removeItem('qod-demo-mode');
      localStorage.removeItem('qod-auth-token');
    });

    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);

    // Navigate to home and toggle demo mode via the header
    // First, go to login page (which has no demo toggle), so we need to
    // set it via localStorage and reload
    await page.evaluate(() => localStorage.setItem('qod-demo-mode', 'true'));
    await page.goto('/');

    // Should now see the dashboard, not the login page
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();
  });

  test('disabling demo mode without auth redirects to login', async ({ page }) => {
    // Start in demo mode
    await page.addInitScript(() => {
      localStorage.setItem('qod-demo-mode', 'true');
    });
    await page.goto('/');
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();

    // Disable demo mode
    await page.evaluate(() => {
      localStorage.setItem('qod-demo-mode', 'false');
      localStorage.removeItem('qod-auth-token');
    });
    await page.goto('/');
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/\/login/);
  });

  test('demo mode persists across page reloads', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('qod-demo-mode', 'true');
    });

    await page.goto('/');
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();

    // Reload
    await page.reload();
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();
  });

  test('demo projects show deterministic data', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('qod-demo-mode', 'true');
    });

    await page.goto('/projects');

    // All three demo projects should be present
    await expect(page.getByText('E-Commerce Platform').first()).toBeVisible();
    await expect(page.getByText('Mobile Banking App').first()).toBeVisible();
    await expect(page.getByText('Internal Tools').first()).toBeVisible();
  });
});
