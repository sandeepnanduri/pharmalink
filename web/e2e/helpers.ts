import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Password123!';

export const USERS = {
  buyer: 'riya@cipla.test',
  /** Verified buyer on the GROWTH plan — unlimited RFQs, for quota-heavy tests. */
  proBuyer: 'pro@medisource.test',
  unverifiedBuyer: 'arjun@torrent.test',
  seller: 'suresh@sunpharma.test',
  chinaSeller: 'li.wei@huahai.test',
  /** Reserved for gate assertions — never approved by the ops test. */
  pendingSeller: 'dev@mangalam.test',
  /** Used by the ops-approval test, which mutates it to verified. */
  approvableSeller: 'raj@zydus.test',
  admin: 'ops@pharmalink.global',
  /** Authenticated with no organization — mimics a fresh SSO sign-in. */
  newSso: 'newsso@pharmalink.test',
  /** Same, but reserved for the test that completes setup as a buyer. */
  newSsoBuyer: 'newsso-buyer@pharmalink.test',
  /** Same, but reserved for the test that completes setup as a seller. */
  newSsoSeller: 'newsso-seller@pharmalink.test',
};

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/en/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('current-user')).toHaveText(email, { timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
}

/** A Sun Pharma product + a cert Sun holds — guarantees a deterministic match. */
export const SUN_PRODUCTS = {
  paracetamol: { product: 'Paracetamol (Acetaminophen)', cas: '103-90-2' },
  ibuprofen: { product: 'Ibuprofen', cas: '15687-27-1' },
};

/**
 * Posts an RFQ as the currently-signed-in buyer and returns its detail URL plus
 * its human reference (RFQ-xxxx). Mandates US FDA GMP AND uses a product Sun
 * Pharma lists — matching needs BOTH the product (by CAS) and the cert, so it
 * deterministically broadcasts to Sun (the seed supplier the tests act as).
 *
 * The reference is unique per RFQ, so seller-side assertions can target one row
 * even when several RFQs share a product name across the suite.
 */
export async function postRfq(
  page: Page,
  opts: { product: string; cas: string; qty?: string; requiredBy?: string },
): Promise<{ url: string; ref: string }> {
  await page.goto('/en/buyer/rfqs/new');
  await page.getByLabel('Product name').fill(opts.product);
  await page.getByLabel('CAS number').fill(opts.cas);
  await page.getByLabel('Quantity (kg)').fill(opts.qty ?? '500');
  await page.getByLabel('Required by').fill(opts.requiredBy ?? '2026-12-01');
  await page.getByTestId('rfq-next').click();
  await page.getByRole('checkbox', { name: 'US FDA GMP' }).check();
  await page.getByTestId('rfq-next').click();
  const broadcast = page.getByTestId('rfq-broadcast');
  await expect(broadcast).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByText('Sun Pharma API Division')).toBeVisible();
  await broadcast.click();
  await expect(page).toHaveURL(/\/en\/buyer\/rfqs\/(?!new$)[^/]+$/, { timeout: 15_000 });
  const ref = (await page.getByText(/RFQ-\d+/).first().innerText()).match(/RFQ-\d+/)![0];
  return { url: page.url(), ref };
}
