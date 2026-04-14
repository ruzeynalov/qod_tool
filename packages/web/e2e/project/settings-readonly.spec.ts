import { test, expect } from '@playwright/test';

const ADMIN_USER = {
  id: 'admin-uuid',
  email: 'admin@qod.dev',
  name: 'Admin',
  role: 'ADMIN',
  orgId: 'org-uuid',
};

const MEMBER_USER = {
  id: 'member-uuid',
  email: 'member@qod.dev',
  name: 'Member',
  role: 'MEMBER',
  orgId: 'org-uuid',
};

test.describe('Settings read-only for non-admins', () => {
  test('member user sees read-only banner on settings', async ({ page }) => {
    // Setup as member in demo mode so data loads without backend
    await page.addInitScript((u: any) => {
      localStorage.setItem('qod-auth-token', 'mock-token');
      localStorage.setItem('qod-auth-user', JSON.stringify(u));
      localStorage.setItem('qod-demo-mode', 'true');
    }, MEMBER_USER);

    await page.goto('/projects/demo-ecommerce/settings');
    // Wait for the settings tabs to load
    await page.getByText('Connectors').first().waitFor({ timeout: 15_000 });
    // Should see the read-only banner (both demo and non-admin apply)
    await expect(page.getByText(/read-only/i).first()).toBeVisible();
  });

  test('admin user in demo mode sees demo-specific read-only banner', async ({ page }) => {
    await page.addInitScript((u: any) => {
      localStorage.setItem('qod-auth-token', 'mock-token');
      localStorage.setItem('qod-auth-user', JSON.stringify(u));
      localStorage.setItem('qod-demo-mode', 'true');
    }, ADMIN_USER);

    await page.goto('/projects/demo-ecommerce/settings');
    // Wait for the settings tabs to load
    await page.getByText('Connectors').first().waitFor({ timeout: 15_000 });
    await expect(page.getByText(/read-only in demo mode/i)).toBeVisible();
  });
});
