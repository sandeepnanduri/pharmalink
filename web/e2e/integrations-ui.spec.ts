import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * The self-service integration surface: a trading org mints a scoped API key and
 * a signed webhook from the UI. The key it creates must actually work against
 * /api/v1 — and its scope must be enforced (a catalog-only key can't read RFQs).
 * This is the UI ↔ API contract, end to end.
 */
test('org creates a scoped API key + webhook and the key works against the API', async ({ page, request }) => {
  await login(page, USERS.buyer);

  // Reach integrations from the account page link.
  await page.goto('/en/account');
  await page.getByTestId('integrations-link').click();
  await expect(page).toHaveURL(/\/account\/integrations$/);

  // --- Create a catalog:read-only key (the default) -----------------------
  await page.getByTestId('key-name').fill('CI catalog key');
  await page.getByTestId('create-key').click();

  const reveal = page.getByTestId('reveal-once').first();
  await expect(reveal).toBeVisible({ timeout: 15_000 });
  const rawKey = (await reveal.locator('code').first().innerText()).trim();
  expect(rawKey).toMatch(/^plk_live_/);

  // The new key is listed (there is also a seeded demo key, so filter).
  await expect(page.getByTestId('key-row').filter({ hasText: 'CI catalog key' })).toBeVisible();

  // --- The key works for catalog, but is denied RFQ access ----------------
  // Use the standalone `request` fixture (not page.request) so calls bypass the
  // browser cache entirely; the routes are force-dynamic + no-store server-side.
  const okRes = await request.get('/api/v1/products', { headers: { Authorization: `Bearer ${rawKey}` } });
  expect(okRes.status()).toBe(200);

  const rfqRes = await request.get('/api/v1/rfqs', { headers: { Authorization: `Bearer ${rawKey}` } });
  expect(rfqRes.status()).toBe(403); // no rfq:read scope

  // --- Create a webhook; its signing secret is shown once -----------------
  await page.getByTestId('hook-url').fill('https://example.com/webhooks/pharmalink');
  await page.getByTestId('create-hook').click();
  await expect(page.getByTestId('hook-row')).toContainText('example.com', { timeout: 15_000 });
  // Two reveal-once panels now: the second is the webhook secret.
  const secret = (await page.getByTestId('reveal-once').last().locator('code').first().innerText()).trim();
  expect(secret).toMatch(/^whsec_/);

  // --- Revoke the key; it stops working ------------------------------------
  // Scope to the CI row (there is also a seeded demo key) and revoke it.
  const ciRow = page.getByTestId('key-row').filter({ hasText: 'CI catalog key' });
  await ciRow.getByRole('button', { name: 'Revoke' }).click();
  await expect(ciRow.getByText('Revoked')).toBeVisible({ timeout: 15_000 });

  // The revoked key is rejected. Poll to absorb the brief window between the
  // write committing and a fresh read observing it — the security property is
  // "a revoked key stops working", not "within one millisecond".
  await expect
    .poll(async () => (await request.get('/api/v1/products', { headers: { Authorization: `Bearer ${rawKey}` } })).status(), {
      timeout: 10_000,
    })
    .toBe(401);
});

test('webhook registration blocks SSRF targets (internal / metadata hosts)', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/account/integrations');

  // The cloud-metadata address over https passes a naive scheme check but must
  // be rejected — otherwise a tenant turns the dispatcher into an SSRF proxy.
  await page.getByTestId('hook-url').fill('https://169.254.169.254/latest/meta-data/');
  await page.getByTestId('create-hook').click();

  // Rejected: an error is shown and no webhook row is created for that host.
  await expect(page.getByText('Enter a valid https:// URL.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('hook-row').filter({ hasText: '169.254' })).toHaveCount(0);
});

test('staff (no org) are redirected away from integrations', async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto('/en/account/integrations');
  // Ops staff have no trading org, so no keys to manage — bounced to /account.
  await expect(page).toHaveURL(/\/account$/, { timeout: 15_000 });
});
