import { test, expect } from '@playwright/test';
import { login, logout, USERS } from './helpers';

/**
 * The spine: buyer posts an RFQ → it is rule-matched to the right suppliers →
 * seller quotes → buyer compares and accepts → a deal record is created.
 * This is the flow the whole product exists to serve (BACKLOG F4).
 */
test('buyer posts RFQ, seller quotes, buyer accepts, deal is created', async ({ page }) => {
  // --- Buyer posts an RFQ -------------------------------------------------
  await login(page, USERS.buyer);
  await page.goto('/en/buyer/rfqs/new');

  await page.getByLabel('Product name').fill('Ibuprofen');
  await page.getByLabel('CAS number').fill('15687-27-1');
  await page.getByLabel('Quantity (kg)').fill('800');
  await page.getByLabel('Required by').fill('2026-12-01');
  await page.getByTestId('rfq-next').click();

  // Mandate a cert Sun Pharma holds so the match is deterministic.
  await page.getByRole('checkbox', { name: 'US FDA GMP' }).check();
  await page.getByTestId('rfq-next').click();

  // Matching runs server-side against real data.
  const broadcast = page.getByTestId('rfq-broadcast');
  await expect(broadcast).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByText('Sun Pharma API Division')).toBeVisible();
  await broadcast.click();

  await expect(page).toHaveURL(/\/en\/buyer\/rfqs\/(?!new$)[^/]+$/, { timeout: 15_000 });
  await expect(page.getByTestId('no-quotes')).toBeVisible();
  const rfqUrl = page.url();

  // --- Seller quotes ------------------------------------------------------
  await logout(page);
  await login(page, USERS.seller);
  await page.goto('/en/seller');

  await expect(page.getByTestId('inquiry-row').filter({ hasText: 'Ibuprofen' })).toBeVisible();
  await page.getByRole('row', { name: /Ibuprofen/ }).getByRole('button', { name: 'Submit quote' }).click();
  await page.getByTestId('quote-price').fill('6.80');
  await page.getByTestId('quote-submit').click();

  // The quote now shows on the seller's pipeline.
  await expect(page.getByRole('row', { name: /Ibuprofen/ })).toContainText('6.8', { timeout: 15_000 });

  // --- Buyer compares and accepts ----------------------------------------
  await logout(page);
  await login(page, USERS.buyer);
  await page.goto(rfqUrl);

  await expect(page.getByText('USD 6.8/kg')).toBeVisible();
  // 800 kg × 6.80 = 5,440 — the total must be computed, not echoed.
  await expect(page.getByText('5,440')).toBeVisible();

  await page.getByRole('button', { name: 'Accept' }).first().click();

  const deal = page.getByTestId('deal-banner');
  await expect(deal).toBeVisible({ timeout: 15_000 });
  await expect(deal).toContainText('DEAL-');
  await expect(deal).toContainText('5,440');
  // The RFQ is now AWARDED (not merely "accepted") and the winning quote is marked won.
  await expect(page.getByTestId('status-awarded').first()).toBeVisible();
});

test('accepted RFQ can no longer be quoted or re-accepted', async ({ page }) => {
  // RFQ-2041 is seeded with a quote from Sun Pharma; accept it first.
  await login(page, USERS.buyer);
  await page.goto('/en/buyer/rfqs');
  await page.getByRole('link', { name: 'RFQ-2041' }).click();
  await page.getByRole('button', { name: 'Accept' }).first().click();
  await expect(page.getByTestId('deal-banner')).toBeVisible({ timeout: 15_000 });

  // Accept buttons are gone — the deal is frozen.
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0);

  // The seller can no longer quote on it either.
  await logout(page);
  await login(page, USERS.seller);
  await page.goto('/en/seller');
  const row = page.getByRole('row', { name: /Paracetamol/ }).first();
  await expect(row.getByRole('button', { name: 'Submit quote' })).toHaveCount(0);
});
