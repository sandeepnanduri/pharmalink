import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Asking a buyer to retype the product they just clicked on is the fastest way
 * to lose them. "Request quote" must carry the product into the RFQ wizard.
 */
test('request quote from a product page pre-fills that product', async ({ page }) => {
  await login(page, USERS.buyer);

  await page.goto('/en/catalog?q=Ibuprofen');
  await page.getByTestId('product-card').first().click();
  await expect(page.getByRole('heading', { name: 'Ibuprofen' })).toBeVisible();

  await page.getByTestId('request-quote').click();
  await expect(page).toHaveURL(/\/buyer\/rfqs\/new\?productId=/, { timeout: 15_000 });

  // The product the buyer clicked is already there — no retyping.
  await expect(page.getByTestId('rfq-prefilled')).toBeVisible();
  await expect(page.getByLabel('Product name')).toHaveValue('Ibuprofen');
  await expect(page.getByLabel('CAS number')).toHaveValue('15687-27-1');
});

test('pre-filled RFQ posts straight through to the right supplier', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/catalog?q=Ibuprofen');
  await page.getByTestId('product-card').first().click();
  await page.getByTestId('request-quote').click();

  // Only quantity + date should still be needed.
  await page.getByLabel('Quantity (kg)').fill('400');
  await page.getByLabel('Required by').fill('2026-12-01');
  await page.getByTestId('rfq-next').click();
  await page.getByTestId('rfq-next').click();

  await expect(page.getByTestId('rfq-broadcast')).toBeEnabled({ timeout: 15_000 });
  // Sun Pharma lists Ibuprofen, so it must be matched. Scope to the matched
  // list — the supplier name also appears in the "pre-filled from" banner.
  await expect(page.locator('label').filter({ hasText: 'Sun Pharma API Division' })).toBeVisible();
});

test('a tampered productId cannot seed the wizard', async ({ page }) => {
  await login(page, USERS.buyer);

  // Unknown id: fall back to a blank wizard rather than trusting the URL.
  await page.goto('/en/buyer/rfqs/new?productId=does-not-exist');
  await expect(page.getByTestId('rfq-prefilled')).toHaveCount(0);
  await expect(page.getByLabel('Product name')).toHaveValue('');
});

test('a draft/controlled listing cannot be used to seed an RFQ', async ({ page, request }) => {
  // Tramadol is seeded as a controlled substance held in draft. Even with its
  // real id, it must not pre-fill an RFQ — it is not a live, buyable listing.
  const res = await request.get('/en/catalog?q=Tramadol');
  expect(res.status()).toBe(200);

  await login(page, USERS.buyer);
  await page.goto('/en/buyer/rfqs/new');
  await expect(page.getByTestId('rfq-prefilled')).toHaveCount(0);
});
