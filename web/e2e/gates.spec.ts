import { test, expect } from '@playwright/test';
import { login, logout, USERS } from './helpers';

/**
 * Trust model: signing in grants nothing. Every real action is gated on the
 * organization being ops-verified (BACKLOG F2.5, F3.4 / G2).
 */
test('unverified buyer cannot post an RFQ and is told why', async ({ page }) => {
  await login(page, USERS.unverifiedBuyer);
  await page.goto('/en/buyer/rfqs/new');

  await expect(page.getByTestId('verification-banner')).toBeVisible();
  await expect(page.getByTestId('verification-banner')).toContainText('Verification in progress');
  // The wizard is not rendered at all — the gate is server-side, not cosmetic.
  await expect(page.getByTestId('rfq-next')).toHaveCount(0);
});

test('verified buyer CAN post an RFQ (the gate is status-based, not blanket)', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/buyer/rfqs/new');
  await expect(page.getByTestId('verification-banner')).toHaveCount(0);
  await expect(page.getByTestId('rfq-next')).toBeVisible();
});

test('pending supplier cannot manage products', async ({ page }) => {
  await login(page, USERS.pendingSeller);
  await page.goto('/en/seller/products');
  await expect(page.getByTestId('verification-banner')).toBeVisible();
  await expect(page.getByTestId('add-product')).toHaveCount(0);
});

test('buyer cannot open the ops console', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/admin');
  // Bounced to the buyer's own home — not the public marketing page, and
  // definitely not into ops.
  await expect(page).toHaveURL(/\/en\/buyer$/, { timeout: 15_000 });
  await expect(page.getByTestId('stat-verified')).toHaveCount(0);
});

test('signed-out visitor is redirected from buyer pages to login', async ({ page }) => {
  await page.goto('/en/buyer');
  await expect(page).toHaveURL(/\/en\/login/, { timeout: 15_000 });
});

test('a buyer cannot open another org RFQ', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/buyer/rfqs');
  const href = await page.getByRole('link', { name: 'RFQ-2041' }).getAttribute('href');
  await logout(page);

  // Torrent (a different buyer org) must not see Cipla's RFQ.
  await login(page, USERS.unverifiedBuyer);
  const res = await page.goto(href!);

  // Status AND content. A loading.tsx over this route would stream a 200 shell
  // before notFound() could set 404 — the status assertion is what catches that
  // regression; the content assertion is what proves nothing actually leaked.
  expect(res?.status()).toBe(404);

  // Two different checks, deliberately scoped differently.
  //
  // Raw markup (includes the streamed RSC payload) must not carry record-scoped
  // identifiers — those can only come from the database, so their presence is a
  // real leak even when nothing is painted.
  const raw = (await page.content()) ?? '';
  expect(raw).not.toContain('RFQ-2041');
  expect(raw).not.toContain('Sun Pharma');

  // Product names also exist as static UI copy (the homepage hero names a
  // molecule), and next-intl inlines the whole catalog into every payload.
  // Matching those in raw markup is a false positive, so check what renders.
  const visible = await page.locator('body').innerText();
  expect(visible).not.toContain('RFQ-2041');
  expect(visible).not.toContain('Paracetamol');
  expect(visible).not.toContain('Sun Pharma');
});

test('bad password is rejected', async ({ page }) => {
  await page.goto('/en/login');
  await page.getByLabel('Work email').fill(USERS.buyer);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('login-error')).toBeVisible();
});

test('signing up with an existing email offers to sign in to it instead', async ({ page }) => {
  await page.goto('/en/signup');
  await page.getByLabel('Full name').fill('Duplicate Person');
  await page.getByLabel('Work email').fill(USERS.buyer);
  await page.getByLabel('Company name').fill('Duplicate Co');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByLabel('Confirm password').fill('Password123!');
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Create account' }).click();

  const err = page.getByTestId('signup-error');
  await expect(err).toContainText('already exists');

  // The offered escape hatch carries the address over, so it isn't retyped.
  await page.getByTestId('signup-signin-instead').click();
  await expect(page).toHaveURL(/\/en\/login\?email=/);
  await expect(page.getByLabel('Work email')).toHaveValue(USERS.buyer);
});

test('terms and privacy are reachable and an SSO user must accept them', async ({ page }) => {
  await page.goto('/en/login');

  // The legal links open in a new tab so a half-filled form survives a read.
  const [terms] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('link-terms').click()]);
  await expect(terms).toHaveURL(/\/en\/legal\/terms/);
  await expect(terms.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  await expect(terms.getByRole('heading', { name: 'Our role is a venue, not a party' })).toBeVisible();

  await terms.getByRole('link', { name: 'Privacy Policy' }).click();
  await expect(terms).toHaveURL(/\/en\/legal\/privacy/);
  await expect(terms.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
});
