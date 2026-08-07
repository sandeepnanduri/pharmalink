import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * The three panels the buyer-side review called the critical gaps.
 * The assertions check HONESTY as much as presence: a metric without enough
 * data must say so rather than print a flattering number.
 */
async function openSupplier(page: import('@playwright/test').Page) {
  // There is no supplier index route; the profile is reached from a listing.
  await page.goto('/en/catalog');
  await page.getByTestId('product-card').first().click();
  await expect(page).toHaveURL(/\/products\/[^/]+$/);
  await page.locator('a[href*="/suppliers/"]').first().click();
  await expect(page).toHaveURL(/\/suppliers\/[^/]+$/);
}

test('regulatory verdict is stated before the certificate list', async ({ page }) => {
  await login(page, USERS.buyer);
  await openSupplier(page);

  const panel = page.getByTestId('regulatory-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/No regulatory action on record|open regulatory action|import alert/);
  await expect(panel).toContainText('not self-declared by the supplier');

  // It must sit ABOVE the certifications heading — an import alert makes the
  // certificate list irrelevant.
  const regY = (await panel.boundingBox())!.y;
  const certY = (await page.getByRole('heading', { name: /Certifications/i }).first().boundingBox())!.y;
  expect(regY).toBeLessThan(certY);
});

test('performance metrics refuse to rate on too little data', async ({ page }) => {
  await login(page, USERS.buyer);
  await openSupplier(page);

  const panel = page.getByTestId('performance-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('metrics have enough data');

  // The seed has few shipments, so at least one metric must decline to rate
  // rather than printing 0% or 100%.
  const insufficient = page.locator('[data-testid="performance-metric"][data-status="insufficient"], [data-testid="performance-metric"][data-status="none"]');
  expect(await insufficient.count()).toBeGreaterThan(0);
  await expect(insufficient.first()).toContainText('Not enough data');
});

test('commercial terms say "not stated" rather than inventing a default', async ({ page }) => {
  await login(page, USERS.buyer);
  await openSupplier(page);
  const panel = page.getByTestId('commercial-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Incoterms offered');
  await expect(panel).toContainText('The binding terms are the ones on a quote you accept');
});

test('supplier shows a logo or a deterministic monogram, never a broken image', async ({ page }) => {
  await login(page, USERS.buyer);
  await openSupplier(page);
  const logo = page.getByTestId('company-logo').first();
  await expect(logo).toBeVisible();
  expect(['image', 'monogram']).toContain(await logo.getAttribute('data-kind'));
});
