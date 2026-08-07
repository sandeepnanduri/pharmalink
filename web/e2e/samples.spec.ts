import { test, expect } from '@playwright/test';
import { login, logout, USERS } from './helpers';

/**
 * Cluster G — sample requests. A buyer requests a sample of a sample-available
 * product; the seller approves and ships. Sun Pharma's Paracetamol is seeded as
 * sample-available (with a pending MediSource request).
 */

test('buyer requests a sample; seller approves and ships', async ({ page }) => {
  // Buyer (Cipla) reaches Sun's Paracetamol via its shortlist → supplier → product.
  await login(page, USERS.buyer);
  await page.goto('/en/buyer/saved');
  await page.getByTestId('saved-row').filter({ hasText: 'Sun Pharma' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/suppliers\/[^/]+$/);
  await page.getByRole('link', { name: /Paracetamol/ }).first().click();
  await expect(page).toHaveURL(/\/products\/[^/]+$/);

  // Request a sample.
  await page.getByTestId('request-sample').click();
  await page.getByTestId('sample-qty').fill('25');
  await page.getByTestId('sample-submit').click();
  await expect(page.getByTestId('sample-status')).toContainText(/Requested/i, { timeout: 15_000 });

  // Seller (Sun) approves then ships a request.
  await logout(page);
  await login(page, USERS.seller);
  await page.goto('/en/seller');
  await expect(page.getByTestId('seller-samples')).toBeVisible();
  // Approve the Cipla request, then ship it.
  const row = page.getByTestId('sample-row').filter({ hasText: 'Cipla' });
  await expect(row).toBeVisible();
  await row.locator('[data-testid^="sample-approved-"]').click();
  await expect(page.getByTestId('sample-row').filter({ hasText: 'Cipla' })).toContainText('Approved', { timeout: 15_000 });
  await page.getByTestId('sample-row').filter({ hasText: 'Cipla' }).locator('[data-testid^="sample-shipped-"]').click();
  await expect(page.getByTestId('sample-row').filter({ hasText: 'Cipla' })).toContainText('Shipped', { timeout: 15_000 });
});
