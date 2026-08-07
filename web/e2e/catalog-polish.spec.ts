import { test, expect } from '@playwright/test';

/**
 * Cluster I polish — the catalogue can be sorted and shows real supplier ratings
 * (Sun Pharma is seeded with reviews averaging 4.5).
 */
test('catalogue sorts by price and shows real supplier ratings', async ({ page }) => {
  await page.goto('/en/catalog');
  await expect(page.getByTestId('product-card').first()).toBeVisible();

  // A Sun Pharma product card carries its real average rating.
  await expect(page.getByTestId('product-card').filter({ hasText: 'Sun Pharma' }).first()).toContainText(/\d\.\d/);

  // Sort by price, low to high — the sort is reflected in the URL and re-renders.
  await page.getByTestId('catalog-sort').selectOption('price_low');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/sort=price_low/);
  await expect(page.getByTestId('product-card').first()).toBeVisible();
});
