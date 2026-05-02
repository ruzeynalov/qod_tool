import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['html', { open: 'never' }], ['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: `http://127.0.0.1:${process.env.QOD_TEST_PORT ?? '3002'}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Mobile-only specs are unrunnable on desktop viewports (hamburger is
      // lg:hidden, etc). Visual regression has its own opt-in env gate but
      // is excluded from the default desktop run for symmetry.
      testIgnore: ['**/mobile-smoke.spec.ts', '**/visual-regression.spec.ts'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: ['**/mobile-smoke.spec.ts', '**/visual-regression.spec.ts'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: ['**/mobile-smoke.spec.ts', '**/visual-regression.spec.ts'],
    },
    // Mobile projects for the mobile-smoke + visual-regression specs.
    // iPhone 14 covers the 393 px reference target (iPhone 16 / Pixel 8 are
    // the same width class); iPhone SE 1 covers the 320 px lower bound.
    // Override defaultBrowserType from the device profiles (which would be
    // webkit) to chromium so CI does not need to install a second browser.
    {
      name: 'mobile-chromium',
      use: {
        ...devices['iPhone 14'],
        defaultBrowserType: 'chromium',
        userAgent: undefined,
      },
      testMatch: ['**/mobile-smoke.spec.ts', '**/visual-regression.spec.ts'],
    },
    {
      name: 'mobile-chromium-narrow',
      use: {
        ...devices['iPhone SE'],
        defaultBrowserType: 'chromium',
        userAgent: undefined,
      },
      testMatch: ['**/mobile-smoke.spec.ts', '**/visual-regression.spec.ts'],
    },
  ],

  webServer: {
    command: `npx next dev --hostname 127.0.0.1 --port ${process.env.QOD_TEST_PORT ?? '3002'}`,
    url: `http://127.0.0.1:${process.env.QOD_TEST_PORT ?? '3002'}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
