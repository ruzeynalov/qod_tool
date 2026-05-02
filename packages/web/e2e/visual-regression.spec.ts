import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';

/**
 * Visual regression baselines for the canonical routes at two viewport
 * widths. Run with:
 *
 *   QOD_VISUAL_REGRESSION=1 npx playwright test visual-regression --project=chromium
 *
 * Skipped by default until baselines exist. Record baselines locally with:
 *
 *   QOD_VISUAL_REGRESSION=1 npx playwright test visual-regression --project=chromium --update-snapshots
 *
 * and commit the resulting `visual-regression.spec.ts-snapshots/` directory.
 *
 * Once baselines are in place and stable, drop the env-var gate so the suite
 * runs on every CI run for the chromium project.
 */

const ENABLED = process.env.QOD_VISUAL_REGRESSION === '1';

const PID = DEMO_PROJECTS.ecommerce.id;

const ROUTES = [
  '/',
  '/projects',
  `/projects/${PID}/kpis`,
  `/projects/${PID}/runs`,
  `/projects/${PID}/defects`,
  `/projects/${PID}/coverage`,
  `/projects/${PID}/settings`,
];

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
];

test.describe('visual regression', () => {
  test.skip(!ENABLED, 'set QOD_VISUAL_REGRESSION=1 to run; record baselines with --update-snapshots');

  for (const v of VIEWPORTS) {
    for (const route of ROUTES) {
      const slug = route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, '');
      test(`${v.name} ${route}`, async ({ demoPage }) => {
        await demoPage.setViewportSize({ width: v.width, height: v.height });
        await demoPage.goto(route, { waitUntil: 'networkidle' });
        await expect(demoPage).toHaveScreenshot(`${v.name}-${slug}.png`, {
          fullPage: true,
          animations: 'disabled',
          // Start permissive while baselines stabilize — sub-pixel font
          // rendering and chart anti-aliasing differ between local macOS
          // and CI Linux. Tighten to 0.005 once baselines are recorded
          // and a few CI runs confirm they're stable.
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  }
});
