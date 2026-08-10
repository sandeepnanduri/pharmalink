import { test, expect, type Page } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * The supplier contact gate.
 *
 * Sheet 9 of the curation template contradicts itself — "visible only to buyers
 * who have completed at least one transaction", then "business email only shown
 * pre-transaction" — so this ships three tiers, and these assertions are what
 * pin which is which.
 *
 * **The fixture is the interesting part.** The seed awards `DEAL-2001` to
 * Huahai and leaves Sun's competing quote `submitted`, so the SAME buyer sees
 * the full tier on Huahai and the email tier on Sun. Reaching for Sun — the
 * seller every other spec uses — would produce a false pass on the strict
 * assertion and a false failure on the permissive one.
 */

/** There is no supplier index; a buyer reaches a profile from a listing. */
async function gotoSupplier(page: Page, productQuery: string) {
  await page.goto(`/en/catalog?q=${encodeURIComponent(productQuery)}`);
  await page.getByTestId('product-card').first().click();
  await page.getByRole('link', { name: 'View supplier profile' }).click();
  await expect(page.getByTestId('supplier-contacts')).toBeVisible();
}

/** Direct lines must never be in the markup at all, not merely hidden. */
async function assertNoDirectLines(page: Page) {
  const html = await page.content();
  expect(html, 'a mobile number reached the page').not.toContain('98765-43210');
  expect(html, 'an office number reached the page').not.toContain('6645-5645');
}

test('a signed-out visitor gets name, title and LinkedIn only', async ({ page }) => {
  await gotoSupplier(page, 'Dicyandiamide'); // Sun Pharma only lists this one
  await expect(page.getByTestId('contact-tier-public')).toBeVisible();

  const card = page.getByTestId('contact-card').first();
  await expect(card).toContainText('Suresh Kumar');
  await expect(card).toContainText('International API Exports');
  // The template says LinkedIn is always shown, at every tier.
  await expect(card.getByTestId('contact-linkedin')).toBeVisible();

  // Redacted in the query, so it is absent from the document — not display:none.
  const html = await page.content();
  expect(html).not.toContain('suresh.exports@sunpharma.test');
  await assertNoDirectLines(page);
});

test('a verified buyer with no deal with THIS supplier gets the email tier', async ({ page }) => {
  await login(page, USERS.buyer); // Cipla — its completed deal is with Huahai, not Sun
  await gotoSupplier(page, 'Dicyandiamide');

  await expect(page.getByTestId('contact-tier-email')).toBeVisible();
  await expect(page.getByTestId('supplier-contacts')).toContainText('suresh.exports@sunpharma.test');
  // Direct lines stay behind the transaction.
  await assertNoDirectLines(page);
});

test('a verified buyer WITH a deal with this supplier gets the full tier', async ({ page }) => {
  await login(page, USERS.buyer);
  await gotoSupplier(page, 'Losartan'); // Huahai only

  await expect(page.getByTestId('contact-tier-full')).toBeVisible();
  const contacts = page.getByTestId('supplier-contacts');
  await expect(contacts).toContainText('liwei.export@huahai.test');
  await expect(contacts).toContainText('+86-138-0000-0000');
});

test('one completed deal does not unlock every other supplier', async ({ page }) => {
  // The scoping invariant: `hasDealsWith` answers per supplier. A single global
  // "has this buyer ever transacted" flag would open every phone book at once.
  await login(page, USERS.buyer);

  await gotoSupplier(page, 'Losartan');
  await expect(page.getByTestId('contact-tier-full')).toBeVisible();

  await gotoSupplier(page, 'Dicyandiamide');
  await expect(page.getByTestId('contact-tier-email')).toBeVisible();
  await assertNoDirectLines(page);
});

test('an unverified buyer gets no more than a visitor', async ({ page }) => {
  await login(page, USERS.unverifiedBuyer);
  await gotoSupplier(page, 'Dicyandiamide');

  await expect(page.getByTestId('contact-tier-public')).toBeVisible();
  expect(await page.content()).not.toContain('suresh.exports@sunpharma.test');
});

test('facilities and filings surface the evidence that makes them checkable', async ({ page }) => {
  await gotoSupplier(page, 'Dicyandiamide');

  const facilities = page.getByTestId('supplier-facilities');
  await expect(facilities).toBeVisible();
  // The FEI is the handle a buyer types into the FDA's own register.
  await expect(facilities).toContainText('3002807546');
  await expect(facilities).toContainText('NAI');
  await expect(facilities).toContainText('VAI'); // both outcome variants render
  await expect(facilities).toContainText('2400'); // capacity, with its unit
  await expect(facilities).toContainText('MT/year');

  const filings = page.getByTestId('supplier-filings');
  await expect(filings).toBeVisible();
  await expect(filings).toContainText('Type II DMF #23412');
  await expect(filings).toContainText('48 referencing');
  // A DMF has no expiry, and that reads as unknown — never as "ok".
  await expect(filings.getByTestId('filing-expiry-unknown').first()).toBeVisible();
  // The CEP is 20 days out, which is the warning bucket.
  await expect(filings.getByTestId('filing-expiry-warning').first()).toBeVisible();
});
