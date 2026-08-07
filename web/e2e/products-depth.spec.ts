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

  // Bulk-import a new product from pasted CSV.
  await page.getByTestId('bulk-import-toggle').click();
  await page.getByTestId('csv-textarea').fill('name,cas,category,priceMin,priceMax\nE2E Bulk API,999-00-0,API,10,12');
  await page.getByTestId('csv-import').click();
  await expect(page.getByTestId('import-result')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('product-row').filter({ hasText: 'E2E Bulk API' })).toBeVisible();
});

test('the export endpoint is forbidden without a seller session', async ({ request }) => {
  const res = await request.get('/api/seller/products/export');
  expect(res.status()).toBe(403);
});
