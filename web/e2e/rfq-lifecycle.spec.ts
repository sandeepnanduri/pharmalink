import { test, expect } from '@playwright/test';
import { login, logout, postRfq, SUN_PRODUCTS, USERS } from './helpers';

/**
 * The RFQ lifecycle beyond the happy path (BACKLOG F4, correctness review):
 *  - a buyer can WITHDRAW (cancel) a live request, and it stops accepting quotes;
 *  - a supplier can DECLINE (no-bid) an inquiry, and it leaves their queue.
 * Both are irreversible, so both sit behind a confirm() — the tests accept it.
 *
 * Seller-side rows are located by RFQ reference (unique) rather than product
 * name, since several RFQs across the suite share Sun Pharma's product names.
 */

test('buyer withdraws an RFQ; suppliers can no longer quote it', async ({ page }) => {
  page.on('dialog', (d) => d.accept()); // ConfirmSubmit guards cancel with confirm()

  await login(page, USERS.proBuyer); // growth plan — never hits the free RFQ cap
  const { url, ref } = await postRfq(page, SUN_PRODUCTS.paracetamol);

  // Withdraw it.
  await page.getByTestId('cancel-rfq').click();
  await expect(page.getByTestId('rfq-cancelled')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('status-cancelled')).toBeVisible();
  // A cancelled RFQ can't be cancelled again.
  await expect(page.getByTestId('cancel-rfq')).toHaveCount(0);

  // The supplier it was broadcast to sees it as cancelled and cannot quote.
  await logout(page);
  await login(page, USERS.seller);
  await page.goto('/en/seller');
  const row = page.getByRole('row', { name: new RegExp(ref) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole('button', { name: 'Submit quote' })).toHaveCount(0);
  await expect(row.getByTestId('status-cancelled')).toBeVisible();

  // And re-opening the withdrawn RFQ as its owning buyer still shows cancelled.
  await logout(page);
  await login(page, USERS.proBuyer);
  await page.goto(url);
  await expect(page.getByTestId('status-cancelled')).toBeVisible();
});

test('supplier declines an inquiry; it leaves the quote queue', async ({ page }) => {
  page.on('dialog', (d) => d.accept()); // decline is confirm()-guarded

  // Buyer posts a fresh RFQ that broadcasts to Sun Pharma.
  await login(page, USERS.proBuyer); // growth plan — never hits the free RFQ cap
  const { ref } = await postRfq(page, SUN_PRODUCTS.ibuprofen);

  // Supplier no-bids it.
  await logout(page);
  await login(page, USERS.seller);
  await page.goto('/en/seller');
  const row = page.getByRole('row', { name: new RegExp(ref) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: 'Decline' }).click();

  // After declining, the row shows declined and offers neither quote nor decline.
  await expect(row.getByTestId('status-declined')).toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole('button', { name: 'Submit quote' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Decline' })).toHaveCount(0);
});
