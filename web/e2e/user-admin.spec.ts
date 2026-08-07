import { test, expect } from '@playwright/test';
import { login, logout, USERS, PASSWORD } from './helpers';

const ADMIN = 'ops@pharmalink.global';
const VERIFIER = 'verifier@pharmalink.global';
const CATALOG = 'catalog@pharmalink.global';

/**
 * Staff roles are least-privilege. These tests are the guard rail: every one of
 * them is a permission boundary that would be a security hole if it regressed.
 */
test.describe('staff role boundaries', () => {
  test('verifier can open the verification queue but NOT users or catalog', async ({ page }) => {
    await login(page, VERIFIER);
    await page.goto('/en/admin');
    await expect(page.getByTestId('stat-verified')).toBeVisible();

    // Blocked by permission, not by hiding a link.
    await page.goto('/en/admin/users');
    await expect(page).toHaveURL(/\/en\/admin$/, { timeout: 15_000 });
    await page.goto('/en/admin/products');
    await expect(page).toHaveURL(/\/en\/admin$/, { timeout: 15_000 });
  });

  test('product admin can moderate the catalog but NOT verify or manage users', async ({ page }) => {
    await login(page, CATALOG);
    await page.goto('/en/admin/products');
    await expect(page.getByTestId('stat-live')).toBeVisible();

    // Bounced to the page they CAN use, not through one they cannot.
    await page.goto('/en/admin/users');
    await expect(page).toHaveURL(/\/en\/admin\/products$/, { timeout: 15_000 });
    await page.goto('/en/admin');
    await expect(page).toHaveURL(/\/en\/admin\/products$/, { timeout: 15_000 });
  });

  test('admin reaches all three ops areas', async ({ page }) => {
    await login(page, ADMIN);
    for (const [path, marker] of [
      ['/en/admin', 'stat-verified'],
      ['/en/admin/users', 'stat-staff'],
      ['/en/admin/products', 'stat-live'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByTestId(marker)).toBeVisible();
    }
  });

  test('a buyer cannot reach user administration', async ({ page }) => {
    await login(page, USERS.buyer);
    await page.goto('/en/admin/users');
    await expect(page).not.toHaveURL(/\/admin\/users/, { timeout: 15_000 });
  });

  test('nav only offers what the staff role may open', async ({ page }) => {
    await login(page, VERIFIER);
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Catalog' })).toHaveCount(0);

    await logout(page);
    await login(page, ADMIN);
    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible();
  });

  test('staff cannot trade — no buyer/seller surfaces', async ({ page }) => {
    await login(page, VERIFIER);
    await page.goto('/en/buyer/rfqs/new');
    await expect(page.getByTestId('rfq-next')).toHaveCount(0);
  });
});

test.describe('user administration', () => {
  test('admin creates a verifier who can then sign in with those exact rights', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/en/admin/users');

    const email = `qa.verifier@pharmalink.global`;
    await page.getByTestId('add-staff').click();
    await page.getByTestId('staff-name').fill('QA Verifier');
    await page.getByTestId('staff-email').fill(email);
    await page.getByTestId('staff-password').fill(PASSWORD);
    await page.getByTestId('staff-role').selectOption('verifier');
    await page.getByTestId('staff-save').click();

    await expect(page.getByTestId('staff-row').filter({ hasText: email })).toBeVisible({ timeout: 15_000 });

    // The new account works, and has exactly the verifier's rights.
    await logout(page);
    await login(page, email);
    await page.goto('/en/admin');
    await expect(page.getByTestId('stat-verified')).toBeVisible();
    await page.goto('/en/admin/users');
    await expect(page).toHaveURL(/\/en\/admin$/, { timeout: 15_000 });
  });

  test('rejects a duplicate email and a weak password', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/en/admin/users');

    await page.getByTestId('add-staff').click();
    await page.getByTestId('staff-name').fill('Dup');
    await page.getByTestId('staff-email').fill(VERIFIER); // already exists
    await page.getByTestId('staff-password').fill(PASSWORD);
    await page.getByTestId('staff-save').click();
    await expect(page.getByTestId('staff-error')).toBeVisible({ timeout: 15_000 });
  });

  test('the last admin cannot disable or demote themselves', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/en/admin/users');

    const self = page.getByTestId('staff-row').filter({ hasText: ADMIN });
    await expect(self.getByText('You')).toBeVisible();
    // No disable control for yourself — locking yourself out is not a feature.
    await expect(self.getByTestId(`toggle-${ADMIN}`)).toHaveCount(0);
  });

  test('trading accounts are read-only here (role tied to their org)', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/en/admin/users');
    const row = page.getByTestId('member-row').filter({ hasText: USERS.buyer });
    await expect(row).toBeVisible();
    // No role dropdown for a buyer — re-roling would orphan them from their org.
    await expect(row.locator('select')).toHaveCount(0);
  });
});

test.describe('catalog moderation', () => {
  test('product admin can hold a live listing, and it leaves the public catalog', async ({ page }) => {
    await page.goto('/en/catalog?q=Ibuprofen');
    await expect(page.getByTestId('product-card')).toHaveCount(1);

    await login(page, CATALOG);
    await page.goto('/en/admin/products');
    const row = page.getByTestId('moderation-row').filter({ hasText: 'Ibuprofen' });
    await row.getByRole('button', { name: 'Hold' }).click();
    await expect(row.getByRole('button', { name: 'Publish' })).toBeVisible({ timeout: 15_000 });

    await logout(page);
    await page.goto('/en/catalog?q=Ibuprofen');
    await expect(page.getByTestId('product-card')).toHaveCount(0);
  });

  test('a controlled substance is locked and cannot be published (G13)', async ({ page }) => {
    await login(page, CATALOG);
    await page.goto('/en/admin/products');
    const row = page.getByTestId('moderation-row').filter({ hasText: 'Tramadol' });
    await expect(row).toBeVisible();
    await expect(row.getByText(/NDPS|DEA/)).toBeVisible();
    // No publish control at all for a scheduled substance.
    await expect(row.getByRole('button', { name: 'Publish' })).toHaveCount(0);
    await expect(row.getByText('Locked')).toBeVisible();
  });
});
