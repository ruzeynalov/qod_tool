import { test, expect, DEMO_PROJECTS } from '../fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

/**
 * Coverage smoke: test case table, search filtering, tab switching, heatmap.
 */
test.describe('Coverage smoke', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/coverage`);
    await page.getByText('Test Coverage').waitFor({ timeout: 15_000 });
  });

  test('summary cards show total 420 test cases with coverage %', async ({ demoPage: page }) => {
    // E-commerce has 420 test cases
    await expect(page.getByText('420').first()).toBeVisible();
    // Coverage percentage card
    await expect(page.getByText(/\d+\.\d+%/).first()).toBeVisible();
  });

  test('heatmap shows feature areas with colored coverage bars', async ({ demoPage: page }) => {
    await expect(page.getByText('Coverage by Feature Area')).toBeVisible();
    // E-commerce feature areas
    const areas = ['Authentication', 'Payments', 'Cart', 'Inventory', 'Search'];
    for (const area of areas) {
      await expect(page.getByText(area).first()).toBeVisible();
    }
  });

  test('search filters test case table and updates results', async ({ demoPage: page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    const initialCount = await table.locator('tbody tr').count();

    // The page renders both the desktop filter row and a (md:hidden) mobile
    // filter row that contains a SearchInput with the same placeholder, so
    // a bare getByPlaceholder() resolves to two elements. Scope to the
    // visible (desktop) input.
    await page.getByPlaceholder('Search test cases...').first().fill('payment');
    await page.waitForTimeout(500); // debounce

    const filteredCount = await table.locator('tbody tr').count();
    // Filtered results should be fewer (or different) than initial
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
    expect(filteredCount).toBeGreaterThan(0);
  });

  test('suite dropdown filters results', async ({ demoPage: page }) => {
    const suiteSelect = page.locator('select').first();
    await expect(suiteSelect).toBeVisible();

    // Select a specific suite (not "All")
    const options = await suiteSelect.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1);
    await suiteSelect.selectOption({ index: 1 });
    await page.waitForTimeout(300);

    // Table should still have rows
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });

  test('Stories tab shows story table with status badges', async ({ demoPage: page }) => {
    await page.getByText('Stories', { exact: true }).first().click();
    await page.waitForTimeout(500);

    // Stories table should have Status column
    await expect(page.getByText('Story').first()).toBeVisible();
    // Status badges
    const statuses = page.getByText(/^(OPEN|IN_PROGRESS|CLOSED|RESOLVED)$/);
    expect(await statuses.count()).toBeGreaterThan(0);
  });

  test('Epics tab shows expandable epic rows', async ({ demoPage: page }) => {
    await page.getByText('Epics', { exact: true }).first().click();
    await page.waitForTimeout(500);

    // Should show epic rows with expand chevrons
    await expect(page.getByText(/stories/).first()).toBeVisible();
    // Click first epic to expand
    const firstExpandBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') }).first();
    if (await firstExpandBtn.isVisible()) {
      await firstExpandBtn.click();
      await page.waitForTimeout(300);
      // Expanded should show stories
    }
  });

  test('pagination navigates through test cases', async ({ demoPage: page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    // Get first row text
    const firstRowText = await table.locator('tbody tr').first().textContent();

    // Click next page
    const nextBtn = page.getByRole('button', { name: /next/i })
      .or(page.locator('button:has(svg.lucide-chevron-right)').last());
    if (await nextBtn.isEnabled()) {
      await nextBtn.click();
      await page.waitForTimeout(300);
      const newFirstRowText = await table.locator('tbody tr').first().textContent();
      expect(newFirstRowText).not.toBe(firstRowText);
    }
  });
});
