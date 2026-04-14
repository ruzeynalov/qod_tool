import type { Locator } from '@playwright/test';
import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';

test.describe('Keyboard navigation', () => {
  test('Tab key cycles through interactive elements', async ({ demoPage: page }) => {
    await page.goto('/');
    await page.getByText('Quality Observability Dashboard').waitFor();

    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const projects = nav.getByRole('link', { name: 'Projects' });

    await projects.focus();
    const focusInside = (handle: Locator) =>
      handle.evaluate((el: HTMLElement) => {
        const a = document.activeElement;
        return !!(a && (a === el || el.contains(a)));
      });

    expect(await focusInside(projects)).toBe(true);

    // Tab may take more than one stop inside the Next.js link tree; then continues elsewhere
    // (order differs by engine; WebKit may not land on the sidebar collapse control next).
    let exitedProjects = false;
    for (let j = 0; j < 6; j++) {
      await page.keyboard.press('Tab');
      if (!(await focusInside(projects))) {
        exitedProjects = true;
        break;
      }
    }
    expect(exitedProjects).toBe(true);
  });

  test('Enter key activates focused links', async ({ demoPage: page }) => {
    await page.goto('/projects');
    await page.getByRole('heading', { name: 'Projects' }).waitFor();

    const firstProjectLink = page.getByRole('link', {
      name: new RegExp(DEMO_PROJECTS.ecommerce.name),
    }).first();
    await firstProjectLink.focus();
    await page.keyboard.press('Enter');

    await page.waitForURL(`**/projects/${DEMO_PROJECTS.ecommerce.id}**`);
  });
});

test.describe('Semantic HTML', () => {
  test('login form uses correct input types', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('heading', { name: /sign in/i }).waitFor();

    await expect(page.locator('#login')).toHaveAttribute('type', 'text');
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');
  });

  test('login error uses role="alert"', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('heading', { name: /sign in/i }).waitFor();

    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({ status: 401, json: { message: 'Bad creds' } }),
    );

    await page.locator('#login').fill('bad@test.com');
    await page.locator('#password').fill('wrong');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.locator('div[role="alert"].rounded-md')).toBeVisible();
  });

  test('tables have proper structure', async ({ demoPage: page }) => {
    await page.goto(`/projects/${DEMO_PROJECTS.ecommerce.id}/coverage`);
    await page.getByText('Test Coverage').waitFor({ timeout: 15_000 });

    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    await expect(table.locator('thead')).toBeVisible();
    await expect(table.locator('tbody')).toBeVisible();
    expect(await table.locator('th').count()).toBeGreaterThan(0);
  });

  test('sidebar navigation uses <nav> with links', async ({ demoPage: page }) => {
    await page.goto('/');
    await page.getByText('Quality Observability Dashboard').waitFor();

    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();

    const links = nav.locator('a');
    expect(await links.count()).toBeGreaterThan(0);
  });
});

test.describe('Loading states', () => {
  test('page content renders fully', async ({ demoPage: page }) => {
    await page.goto(`/projects/${DEMO_PROJECTS.ecommerce.id}`);
    await expect(page.locator('h1').filter({ hasText: DEMO_PROJECTS.ecommerce.name }).first()).toBeVisible();
  });
});
