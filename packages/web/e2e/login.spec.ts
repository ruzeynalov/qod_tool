import { test, expect } from '@playwright/test';
import { LoginPage } from './fixtures/page-objects';

test.describe('Login page', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('renders the login form with all elements', async () => {
    await expect(loginPage.heading).toBeVisible();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
    await expect(loginPage.submitButton).toHaveText('Sign in');
  });

  test('email input has correct placeholder', async () => {
    await expect(loginPage.emailInput).toHaveAttribute('placeholder', 'admin@qod.dev');
  });

  test('password input is masked', async () => {
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
  });

  test('shows default credentials hint', async ({ page }) => {
    await expect(page.getByText('admin@qod.dev / admin123')).toBeVisible();
  });

  test('submit button is disabled while loading', async ({ page }) => {
    // Intercept the auth endpoint to delay response
    await page.route('**/api/v1/auth/login', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({ status: 200, json: { accessToken: 'tok', user: {} } });
    });

    await loginPage.login('admin@qod.dev', 'admin123');
    await expect(loginPage.submitButton).toContainText('Signing in');
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 401,
        json: { message: 'Invalid email or password' },
      }),
    );

    await loginPage.login('bad@email.com', 'wrong');
    await expect(loginPage.errorAlert).toBeVisible();
    await expect(loginPage.errorAlert).toContainText('Invalid email or password');
  });

  test('shows error on network failure', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) => route.abort());

    await loginPage.login('admin@qod.dev', 'admin123');
    await expect(loginPage.errorAlert).toBeVisible();
  });

  test('redirects to /projects on successful login', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 200,
        json: {
          accessToken: 'fake-token',
          user: { id: '1', email: 'admin@qod.dev', name: 'Admin', role: 'admin', orgId: 'org1' },
        },
      }),
    );

    await loginPage.login('admin@qod.dev', 'admin123');
    await page.waitForURL('**/projects');
    await expect(page).toHaveURL(/\/projects/);
  });

  test('form requires email and password (HTML validation)', async ({ page }) => {
    await expect(loginPage.emailInput).toHaveAttribute('required', '');
    await expect(loginPage.passwordInput).toHaveAttribute('required', '');
  });
});

test.describe('Auth gate', () => {
  test('redirects unauthenticated users to /login', async ({ page }) => {
    // Ensure demo mode is off and no auth token
    await page.addInitScript(() => {
      localStorage.removeItem('qod-demo-mode');
      localStorage.removeItem('qod-auth-token');
    });
    await page.goto('/');
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/\/login/);
  });
});
