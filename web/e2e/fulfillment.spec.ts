import { test, expect } from '@playwright/test';
import { login, logout, USERS } from './helpers';

/**
 * Cluster D: order/shipment tracking, RFQ timeline and structured counter-offers.
 * The seed provides 2 deals with shipments (one delivered, one in transit).
 */

test('buyer tracks an order and confirms delivery', async ({ page }) => {
  page.on('dialog', (d) => d.accept()); // confirm-receipt is guarded
  await login(page, USERS.buyer); // Cipla — DEAL-2001 is delivered
  await page.goto('/en/orders');

  await expect(page.getByTestId('buyer-orders')).toBeVisible();
  await expect(page.getByTestId('order-row').first()).toBeVisible();

  const confirm = page.locator('[data-testid^="confirm-"]').first();
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(page.getByText('Receipt confirmed')).toBeVisible({ timeout: 15_000 });
});

test('seller advances a shipment to delivered', async ({ page }) => {
  await login(page, USERS.chinaSeller); // Huahai — won DEAL-2001 + DEAL-2002 (in transit)
  await page.goto('/en/orders');

  await expect(page.getByTestId('seller-orders')).toBeVisible();
  const statusSel = page.locator('[data-testid^="ship-status-"]').first();
  await expect(statusSel).toBeVisible(); // DEAL-2002 (in transit) has an update form
  await statusSel.selectOption('delivered');
  await page.locator('[data-testid^="ship-update-"]').first().click();

  // Both deals now delivered → no more update forms remain.
  await expect(page.locator('[data-testid^="ship-status-"]')).toHaveCount(0, { timeout: 15_000 });
});

test('buyer counters a quote, seller accepts, price updates', async ({ page }) => {
  // RFQ-3004 is a seeded OPEN RFQ (future deadline) with a Huahai quote — never
  // awarded by other tests, so it stays negotiable.
  await login(page, USERS.buyer); // Cipla owns RFQ-3004
  await page.goto('/en/buyer/rfqs');
  await page.getByRole('link', { name: 'RFQ-3004' }).click();

  await expect(page.getByTestId('rfq-timeline')).toBeVisible(); // lifecycle timeline
  const nego = page.getByTestId('negotiation-section');
  await expect(nego).toBeVisible();
  await page.locator('[data-testid^="counter-price-"]').first().fill('4.10');
  await page.locator('[data-testid^="counter-submit-"]').first().click();
  await expect(nego).toContainText('4.1', { timeout: 15_000 });

  // The seller (Huahai) sees the counter and accepts it.
  await logout(page);
  await login(page, USERS.chinaSeller); // Huahai quoted on RFQ-3004
  await page.goto('/en/seller');
  await expect(page.getByTestId('seller-negotiations')).toBeVisible();
  await page.locator('[data-testid^="counter-accept-"]').first().click();
  // Accepted → the open counter is gone, so the negotiations panel clears.
  await expect(page.getByTestId('seller-negotiations')).toHaveCount(0, { timeout: 15_000 });
});
