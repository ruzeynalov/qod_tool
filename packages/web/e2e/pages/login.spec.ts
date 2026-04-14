import { test, expect } from '@playwright/test';
import { LoginPage } from '../fixtures/page-objects';

test.describe('Login page', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('renders the login form with all elements', async () => {
    await expect(loginPage.heading).toBeVisible();
    await expect(loginPage.loginInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
    await expect(loginPage.submitButton).toHaveText('Sign in');
  });

  test('login input has correct placeholder', async () => {
    await expect(loginPage.loginInput).toHaveAttribute('placeholder', 'Enter your email or username');
  });

  test('password input is masked', async () => {
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
  });

  test('does not show default credentials hint', async ({ page }) => {
    await expect(page.getByText('user@test.com / testpass')).not.toBeVisible();
  });

  test('submit button shows loading state', async ({ page }) => {
    // Delay server response so we can observe the loading state
    await page.route('**/api/v1/auth/login', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.fulfill({ status: 200, json: { accessToken: 'tok', user: { id: '1', email: 'a', name: 'A', role: 'admin', orgId: 'o' } } });
    });

    await loginPage.loginInput.fill('user@test.com');
    await loginPage.passwordInput.fill('testpass');
    // Click and immediately check for loading text
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
    await expect(submitBtn).toContainText('Signing in', { timeout: 3000 });
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 401,
        json: { message: 'Invalid credentials' },
      }),
    );

    await loginPage.login('bad@email.com', 'wrong');
    await expect(loginPage.errorAlert).toBeVisible();
    await expect(loginPage.errorAlert).toContainText('Invalid credentials');
  });

  test('shows error on network failure', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) => route.abort());

    await loginPage.login('user@test.com', 'testpass');
    await expect(loginPage.errorAlert).toBeVisible();
  });

  test('redirects to /projects on successful login', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 200,
        json: {
          accessToken: 'fake-token',
          user: { id: '1', email: 'user@test.com', name: 'Admin', role: 'admin', orgId: 'org1' },
        },
      }),
    );

    await loginPage.login('user@test.com', 'testpass');
    await page.waitForURL('**/projects');
    await expect(page).toHaveURL(/\/projects/);
  });

  test('supports login with username', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 200,
        json: {
          accessToken: 'fake-token',
          user: { id: '1', email: 'user@test.com', name: 'Admin', role: 'admin', orgId: 'org1' },
        },
      }),
    );

    await loginPage.login('admin', 'testpass');
    await page.waitForURL('**/projects');
    await expect(page).toHaveURL(/\/projects/);
  });

  test('form validates required fields', async () => {
    await expect(loginPage.loginInput).toHaveAttribute('required', '');
    await expect(loginPage.passwordInput).toHaveAttribute('required', '');
  });
});

test.describe('Auth gate', () => {
  test('redirects unauthenticated users to /login', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('qod-demo-mode');
      localStorage.removeItem('qod-auth-token');
    });
    await page.goto('/');
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/\/login/);
  });
});
