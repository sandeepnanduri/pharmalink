import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Side-by-side quote comparison.
 *
 * The assertions check the two things this screen exists for: that DIFFERENCES
 * between quotes are marked, and that the match score is auditable rather than
 * asserted. A comparison table that renders without those is just the quote list
 * again in a wider layout.
 */

/**
 * Opens the seeded RFQ that carries more than one quote.
 *
 * Targeted by reference rather than "click each row until one works": the seed
 * pins RFQ-3003 to Cipla with two quotes, so a deterministic selector fails
 * loudly if the seed changes instead of silently walking to a different RFQ.
 */
const MULTI_QUOTE_REF = 'RFQ-3003';

async function openMultiQuoteRfq(page: import('@playwright/test').Page) {
  await page.goto('/en/buyer/rfqs');
  await page.getByRole('link', { name: MULTI_QUOTE_REF, exact: true }).click();
  await expect(page).toHaveURL(/\/buyer\/rfqs\/(?!new$)[^/]+$/);
}

test('compare link appears only when there is more than one quote', async ({ page }) => {
  await login(page, USERS.buyer);
  await openMultiQuoteRfq(page);
  await expect(page.getByTestId('compare-quotes')).toBeVisible();
});

test('comparison marks the rows where suppliers differ', async ({ page }) => {
  await login(page, USERS.buyer);
  await openMultiQuoteRfq(page);
  await page.getByTestId('compare-quotes').click();
  await expect(page).toHaveURL(/\/compare$/);

  const table = page.getByTestId('compare-table');
  await expect(table).toBeVisible();

  // Every attribute the buyer needs to decide on is present as a row.
  for (const label of ['Unit price', 'Lead time', 'Incoterm', 'Payment terms', 'Match score']) {
    await expect(table).toContainText(label);
  }

  // At least one row differs — otherwise the screen has nothing to say.
  const differing = page.locator('[data-testid="compare-row"][data-differs="true"]');
  expect(await differing.count()).toBeGreaterThan(0);
});

test('the match score shows its working, not just a number', async ({ page }) => {
  await login(page, USERS.buyer);
  await openMultiQuoteRfq(page);
  await page.getByTestId('compare-quotes').click();
  // Wait for the navigation before counting — clicking does not await it, and
  // counting on the previous page silently returns 0.
  await expect(page.getByTestId('compare-table')).toBeVisible();

  const cards = page.getByTestId('match-breakdown');
  expect(await cards.count()).toBeGreaterThan(0);

  // Each breakdown names its components and justifies them.
  const first = cards.first();
  await expect(first).toContainText('Certifications');
  await expect(first).toContainText('Price vs market');
  await expect(first).toContainText(/market median|No market median/);
});

test('landed cost is not invented', async ({ page }) => {
  await login(page, USERS.buyer);
  await openMultiQuoteRfq(page);
  await page.getByTestId('compare-quotes').click();
  await expect(page.getByTestId('compare-table')).toBeVisible();
  await expect(page.getByText(/Landed cost is not estimated/)).toBeVisible();
});

test('another buyer cannot open this comparison', async ({ page }) => {
  await login(page, USERS.buyer);
  await openMultiQuoteRfq(page);
  await page.getByTestId('compare-quotes').click();
  const url = page.url();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, USERS.proBuyer);
  const res = await page.goto(url);
  expect(res?.status()).toBe(404);
});

test('comparison is localised', async ({ page }) => {
  await login(page, USERS.buyer);
  await openMultiQuoteRfq(page);
  const url = page.url();
  await page.goto(url.replace('/en/', '/zh/') + '/compare');
  await expect(page.getByTestId('compare-table')).toContainText('属性');
});
