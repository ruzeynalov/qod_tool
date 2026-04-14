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

function setupAuth(page: any, user: typeof ADMIN_USER) {
  return page.addInitScript((u: any) => {
    localStorage.setItem('qod-auth-token', 'mock-token');
    localStorage.setItem('qod-auth-user', JSON.stringify(u));
  }, user);
}

test.describe('Role-based navigation', () => {
  test('admin user sees Users link in sidebar', async ({ page }) => {
    await setupAuth(page, ADMIN_USER);
    // Mock the API calls to prevent 401 redirects
    await page.route('**/api/v1/**', (route) => route.fulfill({ status: 200, json: [] }));
    await page.goto('/');
    const sidebar = page.locator('nav[aria-label="Main navigation"]');
    await expect(sidebar.getByText('Users')).toBeVisible();
  });

  test('member user does NOT see Users link in sidebar', async ({ page }) => {
    await setupAuth(page, MEMBER_USER);
    await page.route('**/api/v1/**', (route) => route.fulfill({ status: 200, json: [] }));
    await page.goto('/');
    const sidebar = page.locator('nav[aria-label="Main navigation"]');
    await expect(sidebar.getByText('Users')).not.toBeVisible();
  });

  test('member user navigating to /users sees access denied', async ({ page }) => {
    await setupAuth(page, MEMBER_USER);
    await page.route('**/api/v1/**', (route) => route.fulfill({ status: 200, json: [] }));
    await page.goto('/users');
    await expect(page.getByText('Access Denied')).toBeVisible();
  });

  test('blocked user login shows error', async ({ page }) => {
    await page.goto('/login');
    // Mock login returning 401
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({ status: 401, json: { message: 'Account is blocked' } })
    );
    await page.locator('#login').fill('blocked@qod.dev');
    await page.locator('#password').fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText('Account is blocked')).toBeVisible();
  });
});
