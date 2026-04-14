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

const ALL_PROJECTS = [
  { id: 'p1', name: 'E-Commerce Platform', slug: 'e-commerce-platform' },
  { id: 'p2', name: 'Mobile Banking App', slug: 'mobile-banking-app' },
  { id: 'p3', name: 'Internal Tools', slug: 'internal-tools' },
];

const MEMBER_PROJECTS = [
  { id: 'p1', name: 'E-Commerce Platform', slug: 'e-commerce-platform' },
];

test.describe('Project access filtering', () => {
  test('admin user sees all projects', async ({ page }) => {
    await page.addInitScript((u: any) => {
      localStorage.setItem('qod-auth-token', 'mock-token');
      localStorage.setItem('qod-auth-user', JSON.stringify(u));
    }, ADMIN_USER);

    await page.route('**/api/v1/projects**', (route) =>
      route.fulfill({ status: 200, json: ALL_PROJECTS })
    );

    await page.goto('/projects');
    await expect(page.getByText('E-Commerce Platform')).toBeVisible();
    await expect(page.getByText('Mobile Banking App')).toBeVisible();
    await expect(page.getByText('Internal Tools')).toBeVisible();
  });

  test('member user sees only assigned projects', async ({ page }) => {
    await page.addInitScript((u: any) => {
      localStorage.setItem('qod-auth-token', 'mock-token');
      localStorage.setItem('qod-auth-user', JSON.stringify(u));
    }, MEMBER_USER);

    await page.route('**/api/v1/projects**', (route) =>
      route.fulfill({ status: 200, json: MEMBER_PROJECTS })
    );

    await page.goto('/projects');
    await expect(page.getByText('E-Commerce Platform')).toBeVisible();
    // These should NOT be visible since the API only returned assigned projects
    await expect(page.getByText('Mobile Banking App')).not.toBeVisible();
    await expect(page.getByText('Internal Tools')).not.toBeVisible();
  });

  test('member user does NOT see New Project button', async ({ page }) => {
    await page.addInitScript((u: any) => {
      localStorage.setItem('qod-auth-token', 'mock-token');
      localStorage.setItem('qod-auth-user', JSON.stringify(u));
    }, MEMBER_USER);

    await page.route('**/api/v1/projects**', (route) =>
      route.fulfill({ status: 200, json: MEMBER_PROJECTS })
    );

    await page.goto('/projects');
    await expect(page.getByText('E-Commerce Platform')).toBeVisible();
    await expect(page.getByRole('button', { name: /new project/i })).not.toBeVisible();
  });

  test('admin user sees New Project button', async ({ page }) => {
    await page.addInitScript((u: any) => {
      localStorage.setItem('qod-auth-token', 'mock-token');
      localStorage.setItem('qod-auth-user', JSON.stringify(u));
    }, ADMIN_USER);

    await page.route('**/api/v1/projects**', (route) =>
      route.fulfill({ status: 200, json: ALL_PROJECTS })
    );

    await page.goto('/projects');
    await expect(page.getByRole('button', { name: /new project/i })).toBeVisible();
  });
});
