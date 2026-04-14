import { test, expect } from '@playwright/test';

const ADMIN_USER = {
  id: 'admin-uuid',
  email: 'admin@qod.dev',
  name: 'Admin',
  role: 'ADMIN',
  orgId: 'org-uuid',
};

const MOCK_USERS = [
  { id: 'u1', email: 'admin@qod.dev', name: 'Admin', role: 'ADMIN', blockedAt: null, orgId: 'org-uuid', createdAt: '2026-01-01' },
  { id: 'u2', email: 'member@qod.dev', name: 'Member User', role: 'MEMBER', blockedAt: null, orgId: 'org-uuid', createdAt: '2026-01-02' },
  { id: 'u3', email: 'blocked@qod.dev', name: 'Blocked User', role: 'MEMBER', blockedAt: '2026-03-01', orgId: 'org-uuid', createdAt: '2026-01-03' },
];

test.describe('User Management', () => {
  test.beforeEach(async ({ page }) => {
    // Setup admin auth
    await page.addInitScript((u: any) => {
      localStorage.setItem('qod-auth-token', 'mock-token');
      localStorage.setItem('qod-auth-user', JSON.stringify(u));
    }, ADMIN_USER);

    // Mock all API responses
    await page.route('**/api/v1/users', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, json: MOCK_USERS });
      }
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 201,
          json: { id: 'new-user', email: 'new@qod.dev', name: 'New User', role: 'MEMBER', password: 'GeneratedPass123!' },
        });
      }
      return route.fulfill({ status: 200, json: {} });
    });

    // Catch any other API calls to prevent timeouts
    await page.route('**/api/v1/**', (route) => {
      if (route.request().url().includes('/api/v1/users')) {
        return route.fallback();
      }
      return route.fulfill({ status: 200, json: [] });
    });
  });

  test('renders user management page with table', async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByRole('heading', { name: /user management/i })).toBeVisible();
    await expect(page.getByText('admin@qod.dev')).toBeVisible();
    await expect(page.getByText('member@qod.dev')).toBeVisible();
    await expect(page.getByText('blocked@qod.dev')).toBeVisible();
  });

  test('create user dialog opens and submits', async ({ page }) => {
    await page.goto('/users');
    await page.getByRole('heading', { name: /user management/i }).waitFor();
    // Button text is "Add User"
    await page.getByRole('button', { name: /add user/i }).click();
    // Fill form fields using placeholders (exact match)
    await page.getByPlaceholder('user@company.com').fill('new@example.com');
    await page.getByPlaceholder('johndoe', { exact: true }).fill('newuser');
    await page.getByPlaceholder('John', { exact: true }).fill('New');
    await page.getByPlaceholder('Doe', { exact: true }).fill('User');
    // Submit using the "Create User" button inside the dialog
    await page.getByRole('button', { name: /create user/i }).click();
    // Should show generated password
    await expect(page.getByText('GeneratedPass123!')).toBeVisible();
  });

  test('shows blocked status badge for blocked users', async ({ page }) => {
    await page.goto('/users');
    await page.getByRole('heading', { name: /user management/i }).waitFor();
    // The blocked user row should show a "Blocked" badge — use exact match to avoid "Blocked User" name
    const blockedRow = page.locator('tr', { hasText: 'blocked@qod.dev' });
    await expect(blockedRow.locator('span', { hasText: /^Blocked$/ })).toBeVisible();
  });
});
