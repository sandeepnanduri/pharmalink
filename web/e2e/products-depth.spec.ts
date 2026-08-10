import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Cluster E — seller product depth: bulk CSV import/export, per-product live
 * demand (real RFQ counts) and volume price tiers. Sun Pharma is seeded with a
 * tiered Paracetamol listing and live RFQ demand for it.
 */

test('seller sees demand + tiers, exports CSV, and bulk-imports products', async ({ page }) => {
  await login(page, USERS.seller); // Sun Pharma
  await page.goto('/en/seller/products');

  await expect(page.getByTestId('product-row').first()).toBeVisible();
  // Real demand: Paracetamol (CAS 103-90-2) has live RFQs.
  await expect(page.locator('[data-testid^="demand-"]').filter({ hasText: 'RFQ' }).first()).toBeVisible();
  // Volume-tier editor present.
  await expect(page.locator('[data-testid^="tiers-"]').first()).toBeVisible();

  // Export the catalogue as CSV (auth-gated, org-scoped).
  const res = await page.request.get('/api/seller/products/export');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/csv');
  expect(await res.text()).toContain('name,cas');

  // Bulk-import a new product from pasted CSV. The CAS must be real: the
  // importer validates the check digit, so a made-up number is rejected.
  await page.getByTestId('bulk-import-toggle').click();
  await page
    .getByTestId('csv-textarea')
    .fill('name,cas,category,priceMin,priceMax,productType,facet,incoterms,leadTime\nE2E Bulk API,50-78-2,API,10,12,api,cardiovascular,FOB; CIF,3 weeks');
  await page.getByTestId('csv-import').click();
  await expect(page.getByTestId('import-result')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('product-row').filter({ hasText: 'E2E Bulk API' })).toBeVisible();
});

test('a bulk import names the row and the reason when it rejects one', async ({ page }) => {
  // The parser has always collected per-row errors rather than dropping rows
  // silently; before this they were computed and then thrown away, so a seller
  // saw "no valid rows" with no way to find the bad cell.
  await login(page, USERS.seller);
  await page.goto('/en/seller/products');
  await page.getByTestId('bulk-import-toggle').click();
  // 1115-70-5 is a one-digit typo of metformin's real CAS, 1115-70-4.
  await page.getByTestId('csv-textarea').fill('name,cas\nTypo Product,1115-70-5');
  await page.getByTestId('csv-import').click();

  const errors = page.getByTestId('import-row-errors');
  await expect(errors).toBeVisible({ timeout: 15_000 });
  await expect(errors).toContainText('row 2');
  await expect(errors).toContainText('check digit');
  // And nothing was created from the bad paste.
  await expect(page.getByTestId('product-row').filter({ hasText: 'Typo Product' })).toHaveCount(0);
});

test('the export endpoint is forbidden without a seller session', async ({ request }) => {
  const res = await request.get('/api/seller/products/export');
  expect(res.status()).toBe(403);
});
