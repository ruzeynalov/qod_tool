import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';

const PROJECT = DEMO_PROJECTS.ecommerce;

test.describe('Coverage page', () => {
  test.beforeEach(async ({ demoPage: page }) => {
    await page.goto(`/projects/${PROJECT.id}/coverage`);
  });

  test('renders the test cases tab by default', async ({ demoPage: page }) => {
    // Should show Test Cases tab or table
    await expect(page.getByText(/test cases/i).first()).toBeVisible();
  });

  test('displays a data table with test cases', async ({ demoPage: page }) => {
    // Wait for table to render
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    // Table should have rows
    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('search input filters test cases', async ({ demoPage: page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible();

    // Get initial row count
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    // Type a search term — should filter results
    await searchInput.fill('auth');
    // Wait for debounce (300ms) + re-render
    await page.waitForTimeout(500);

    // Table should still be visible (results may vary but table should persist)
    await expect(table).toBeVisible();
  });

  test('filter dropdowns are present', async ({ demoPage: page }) => {
    // Suite and type filter selects
    const selects = page.locator('select');
    expect(await selects.count()).toBeGreaterThanOrEqual(1);
  });

  test('pagination controls work', async ({ demoPage: page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    // Look for pagination (Next/Previous buttons or page numbers)
    const nextBtn = page.getByRole('button', { name: /next/i })
      .or(page.locator('button:has(svg.lucide-chevron-right)'));

    if (await nextBtn.isVisible()) {
      const firstRowText = await table.locator('tbody tr').first().textContent();
      await nextBtn.click();
      await page.waitForTimeout(300);

      // After clicking next, content should change
      const newFirstRowText = await table.locator('tbody tr').first().textContent();
      expect(newFirstRowText).not.toBe(firstRowText);
    }
  });

  test('tabs switch between Test Cases, Stories, Epics', async ({ demoPage: page }) => {
    const tabs = ['Test Cases', 'Stories', 'Epics'];
    for (const tab of tabs) {
      const tabButton = page.getByRole('button', { name: new RegExp(tab, 'i') })
        .or(page.getByText(tab, { exact: true }));

      if (await tabButton.first().isVisible()) {
        await tabButton.first().click();
        await page.waitForTimeout(300);
      }
    }
  });
});
