import { test, expect } from '@playwright/test';

test.describe('Demo mode toggle', () => {
  test('enabling demo mode bypasses login and shows dashboard', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('qod-demo-mode');
      localStorage.removeItem('qod-auth-token');
    });

    // Should redirect to login without demo/auth
    await page.goto('/');
    await page.waitForURL('**/login');

    // Enable demo mode via localStorage and reload
    await page.evaluate(() => localStorage.setItem('qod-demo-mode', 'true'));
    await page.goto('/');

    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();
  });

  test('disabling demo mode without auth redirects to login', async ({ page }) => {
    // Start with demo off, no auth — should go to login
    await page.addInitScript(() => {
      localStorage.setItem('qod-demo-mode', 'false');
      localStorage.removeItem('qod-auth-token');
      localStorage.removeItem('qod-auth-user');
    });
    await page.goto('/');
    await page.waitForURL('**/login', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('demo mode persists across page reloads', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('qod-demo-mode', 'true');
    });

    await page.goto('/');
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Quality Observability Dashboard')).toBeVisible();
  });

  test('all three demo projects render', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('qod-demo-mode', 'true');
    });

    await page.goto('/projects');
    await expect(page.getByText('E-Commerce Platform').first()).toBeVisible();
    await expect(page.getByText('Mobile Banking App').first()).toBeVisible();
    await expect(page.getByText('Internal Tools').first()).toBeVisible();
  });
});
