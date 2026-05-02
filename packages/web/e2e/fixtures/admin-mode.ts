import { type Page } from '@playwright/test';
import { test as base } from './demo-mode';

/**
 * Extends the demoPage fixture with a synthetic ADMIN auth user so admin-gated
 * routes (/users) become navigable in tests. Demo mode by itself only sets
 * `qod-demo-mode=true`; auth is derived from `qod-auth-token` + `qod-auth-user`
 * and `auth-provider.tsx` derives `isAdmin` from `user.role === 'ADMIN'`.
 */
export const test = base.extend<{ adminPage: Page }>({
  adminPage: async ({ page }, use) => {
    await page.addInitScript(() => {
      localStorage.setItem('qod-demo-mode', 'true');
      localStorage.setItem('qod-auth-token', 'mobile-smoke-admin-token');
      localStorage.setItem(
        'qod-auth-user',
        JSON.stringify({
          id: 'mobile-smoke-admin',
          email: 'admin@example.com',
          name: 'Mobile Smoke Admin',
          role: 'ADMIN',
          orgId: 'demo-org',
        }),
      );
    });
    await use(page);
  },
});

export { expect, DEMO_PROJECTS } from './demo-mode';
