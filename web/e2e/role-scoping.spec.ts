import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Each role sees only its own work.
 *
 * A signed-in user must never land on the public marketing page: "Get started
 * free" is aimed at visitors, and showing it to an existing customer reads as
 * "you are not logged in".
 */
test.describe('supplier is scoped to supplier work', () => {
  test('lands on the supplier dashboard, never the marketing page', async ({ page }) => {
    await login(page, USERS.seller);
    await expect(page).toHaveURL(/\/en\/seller$/, { timeout: 15_000 });

    // Going to "/" explicitly must still not show the sales pitch.
    await page.goto('/en');
    await expect(page).toHaveURL(/\/en\/seller$/, { timeout: 15_000 });

    // Wait for the dashboard itself, not just the URL. `/seller` has a
    // `loading.tsx`, so the client-side redirect above resolves while the body
    // still reads "Loading…" — reading innerText here raced the boundary.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });

    // innerText, NOT textContent: textContent also returns <script> contents —
    // Next's RSC payload — which is not what a user sees, and would fail here on
    // strings that never render.
    const visible = await page.locator('body').innerText();
    expect(visible).not.toContain('Get started free');
    expect(visible).not.toContain('verified to the document');
    expect(visible).toContain('Supplier dashboard');
  });

  test('nav offers only supplier work — no buyer browsing', async ({ page }) => {
    await login(page, USERS.seller);
    // Navigation lives in the shell rail now, not a top navbar.
    const nav = page.locator('[data-testid="app-shell"] nav');
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'My products' })).toBeVisible();
    // Buyer activities must not be offered.
    await expect(nav.getByRole('link', { name: 'Marketplace' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'My RFQs' })).toHaveCount(0);
  });

  test('buyer routes bounce back to the supplier dashboard, not the marketing page', async ({ page }) => {
    await login(page, USERS.seller);
    for (const path of ['/en/buyer', '/en/buyer/rfqs', '/en/buyer/rfqs/new']) {
      await page.goto(path);
      await expect(page, `${path} should bounce to /seller`).toHaveURL(/\/en\/seller$/, { timeout: 15_000 });
    }
  });

  test('ops routes are refused', async ({ page }) => {
    await login(page, USERS.seller);
    await page.goto('/en/admin');
    await expect(page).toHaveURL(/\/en\/seller$/, { timeout: 15_000 });
    await page.goto('/en/admin/users');
    await expect(page).not.toHaveURL(/\/admin\/users/, { timeout: 15_000 });
  });

  test('the supplier dashboard shows their inquiries and products', async ({ page }) => {
    await login(page, USERS.seller);
    await expect(page.getByTestId('stat-inquiries')).toBeVisible();
    await expect(page.getByTestId('stat-live-products')).toBeVisible();
  });
});

test.describe('other roles land on their own work', () => {
  test('buyer lands on the buyer dashboard and keeps the catalog', async ({ page }) => {
    await login(page, USERS.buyer);
    await expect(page).toHaveURL(/\/en\/buyer$/, { timeout: 15_000 });
    // Sourcing IS the buyer's job, so the catalog stays.
    await expect(page.locator('[data-testid="app-shell"] nav').getByRole('link', { name: 'Marketplace' })).toBeVisible();
  });

  test('admin lands on the ops console', async ({ page }) => {
    await login(page, 'ops@pharmalink.global');
    await expect(page).toHaveURL(/\/en\/admin$/, { timeout: 15_000 });
  });

  test('product admin lands on catalog moderation', async ({ page }) => {
    await login(page, 'catalog@pharmalink.global');
    await expect(page).toHaveURL(/\/en\/admin\/products$/, { timeout: 15_000 });
  });

  test('a visitor still gets the marketing page', async ({ page }) => {
    await page.goto('/en');
    // The shipped hero, from the redesigned marketing page. The old copy this
    // asserted lives on only as an orphaned `home.heroTitle` message key.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('verified to the document');
    // The redesigned marketing page offers the CTA twice, in the hero and again
    // lower down; either one proves a visitor sees the sales pitch.
    await expect(page.getByRole('link', { name: 'Get started free' }).first()).toBeVisible();
  });
});
