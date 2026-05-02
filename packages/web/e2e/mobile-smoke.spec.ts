import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';
import { test as adminTest } from './fixtures/admin-mode';

/**
 * Mobile smoke tests. Run with:
 *
 *   npx playwright test mobile-smoke --project=mobile-chromium
 *   npx playwright test mobile-smoke --project=mobile-chromium-narrow
 *
 * Two assertions per route per mobile viewport:
 *   1) No horizontal body scroll — `document.documentElement.scrollWidth <= clientWidth`
 *      (sub-pixel slack of 1).
 *   2) The hamburger opens the off-canvas drawer, traps focus, and Esc
 *      closes it returning focus to the trigger.
 *
 * Demo mode is preset by the `demoPage` fixture; routes use real demo
 * project ids from `DEMO_PROJECTS`. The admin-only `/users` route uses
 * `adminPage` which adds a synthetic ADMIN auth user.
 */

const PID = DEMO_PROJECTS.ecommerce.id;

const PUBLIC_ROUTES = [
  '/',
  '/projects',
  `/projects/${PID}`,
  `/projects/${PID}/kpis`,
  `/projects/${PID}/runs`,
  `/projects/${PID}/defects`,
  `/projects/${PID}/coverage`,
  `/projects/${PID}/settings`,
];

test.describe('mobile — no horizontal page scroll', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route}`, async ({ demoPage }) => {
      await demoPage.goto(route);
      // Wait for layout to settle (charts can shift width during initial render).
      await demoPage.waitForLoadState('networkidle');
      const overflow = await demoPage.evaluate(() => {
        return (
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
        );
      });
      expect(overflow, 'no horizontal page-level scroll').toBeLessThanOrEqual(1);
    });
  }
});

adminTest.describe('mobile — admin route has no horizontal scroll', () => {
  adminTest('/users', async ({ adminPage }) => {
    await adminPage.goto('/users');
    await adminPage.waitForLoadState('networkidle');
    // Sanity check: we should not be on the access-denied screen.
    await expect(adminPage.getByText(/access denied/i)).toHaveCount(0);
    const overflow = await adminPage.evaluate(() => {
      return (
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
      );
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('mobile — hamburger drawer', () => {
  test('opens the drawer, traps focus, and closes on Esc', async ({ demoPage }) => {
    await demoPage.goto('/');
    await demoPage.waitForLoadState('networkidle');

    const hamburger = demoPage.getByRole('button', { name: /open navigation menu/i });
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    // Drawer is a role="dialog"; the Sheet primitive marks it aria-modal=true.
    const dialog = demoPage.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Tab once — focus should still be inside the dialog (focus trap).
    await demoPage.keyboard.press('Tab');
    const insideAfterTab = await demoPage.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return d?.contains(document.activeElement) ?? false;
    });
    expect(insideAfterTab).toBe(true);

    // Esc closes the drawer; focus returns to the hamburger trigger.
    await demoPage.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(hamburger).toBeFocused();
  });
});
