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
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile projects for the mobile-smoke + visual-regression specs.
    // iPhone 14 covers the 393 px reference target (iPhone 16 / Pixel 8 are
    // the same width class); iPhone SE 1 covers the 320 px lower bound.
    {
      name: 'mobile-chromium',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'mobile-chromium-narrow',
      use: { ...devices['iPhone SE'] },
    },
  ],

  webServer: {
    command: `npx next dev --hostname 127.0.0.1 --port ${process.env.QOD_TEST_PORT ?? '3002'}`,
    url: `http://127.0.0.1:${process.env.QOD_TEST_PORT ?? '3002'}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
