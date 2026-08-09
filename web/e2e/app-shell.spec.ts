import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * The ops console shell.
 *
 * The redesign kit reported that "the admin reuses the marketing navbar" with a
 * sticky-overlap bug on scroll, and prescribed a proper shell. `/admin/*` had no
 * layout at all, so every ops page rendered under the marketing header — which
 * is `sticky top-0 z-50`.
 */
test.describe('the signed-in shell', () => {
  test('replaces the marketing header on every ops route', async ({ page }) => {
    await login(page, USERS.admin);
    for (const path of ['/en/admin', '/en/admin/products', '/en/admin/users', '/en/admin/market-data']) {
      await page.goto(path);
      await expect(page.getByTestId('app-shell'), `${path} has no shell`).toBeVisible();
      // Exactly one navigation chrome, not two stacked sticky bars.
      await expect(page.locator('header'), `${path} still renders the marketing header`).toHaveCount(0);
    }
  });

  test('gives a buyer the same shell, with sourcing navigation', async ({ page }) => {
    await login(page, USERS.buyer);
    await page.goto('/en/catalog');
    await expect(page.getByTestId('app-shell')).toBeVisible();
    // One chrome, not two stacked sticky bars.
    await expect(page.locator('header')).toHaveCount(0);
    await expect(page.getByTestId('nav-catalog')).toBeVisible();
    await expect(page.getByTestId('nav-buyer-rfqs')).toBeVisible();
    // A buyer has no supplier surfaces.
    await expect(page.getByTestId('nav-seller-products')).toHaveCount(0);
  });

  test('gives a supplier supply navigation, and no buyer browsing', async ({ page }) => {
    await login(page, USERS.seller);
    await page.goto('/en/seller/products');
    await expect(page.getByTestId('nav-seller-products')).toBeVisible();
    await expect(page.getByTestId('nav-seller-facilities')).toBeVisible();
    await expect(page.getByTestId('nav-seller-filings')).toBeVisible();
    await expect(page.getByTestId('nav-buyer-rfqs')).toHaveCount(0);
  });

  test('keeps the marketing header for visitors only', async ({ page }) => {
    await page.goto('/en/catalog');
    await expect(page.locator('header')).toHaveCount(1);
    await expect(page.getByTestId('app-shell')).toHaveCount(0);
  });

  test('shows the signed-in account and the pending-review count', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto('/en/admin');
    // The account, not a display name: every ops action lands in the audit log.
    await expect(page.getByTestId('current-user')).toHaveText(USERS.admin);
    // Zydus is seeded pending, so the badge must show at least one.
    const badge = page.getByTestId('nav-admin').locator('span').last();
    await expect(badge).toHaveText(/[1-9]/);
  });

  test('marks the current section and only that section', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto('/en/admin/products');
    await expect(page.getByTestId('nav-admin-products')).toHaveAttribute('aria-current', 'page');
    // `/admin` must not light up for every page underneath it.
    await expect(page.getByTestId('nav-admin')).not.toHaveAttribute('aria-current', 'page');
  });

  test('offers each staff role only the sections it may open', async ({ page }) => {
    // A verifier approves organisations and nothing else; the catalogue
    // moderator does the opposite. The sidebar mirrors the permission set
    // rather than showing links that would redirect.
    await login(page, 'verifier@pharmalink.global');
    await expect(page.getByTestId('nav-admin')).toBeVisible();
    await expect(page.getByTestId('nav-admin-products')).toHaveCount(0);
    await expect(page.getByTestId('nav-admin-users')).toHaveCount(0);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await login(page, 'catalog@pharmalink.global');
    await expect(page.getByTestId('nav-admin-products')).toBeVisible();
    await expect(page.getByTestId('nav-admin')).toHaveCount(0);
  });

  test('nothing stacks or overlaps on scroll', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto('/en/admin/products');
    const topbar = page.getByTestId('shell-crumb');
    await expect(topbar).toBeVisible();
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(300);
    // The ops topbar is the only sticky chrome, and it stays put.
    await expect(topbar).toBeInViewport();
    await expect(page.locator('header')).toHaveCount(0);
  });
});
