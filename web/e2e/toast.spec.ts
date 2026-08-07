import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Toasts confirm that a server action actually did something.
 *
 * The failure this prevents: every form used to report success by silently
 * re-rendering, so a user with no confirmation presses submit again — which is
 * how duplicate quotes and duplicate RFQs get created.
 */

test('a successful action confirms itself, and the toast is announced', async ({ page }) => {
  await login(page, USERS.buyer);

  // Reviews are the shortest round-trip to a real server action.
  await page.goto('/en/catalog');
  await page.getByTestId('product-card').first().click();
  await page.locator('a[href*="/suppliers/"]').first().click();

  const form = page.locator('form').filter({ has: page.getByRole('button', { name: /review/i }) }).first();
  await form.getByRole('button', { name: /review/i }).click();

  const toast = page.getByTestId('toast');
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await expect(toast).toHaveAttribute('data-tone', 'success');
  // Success is announced politely, not as an alert.
  await expect(toast).toHaveAttribute('role', 'status');
});

test('a success toast auto-dismisses; the viewport empties', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/catalog');
  await page.getByTestId('product-card').first().click();
  await page.locator('a[href*="/suppliers/"]').first().click();

  const form = page.locator('form').filter({ has: page.getByRole('button', { name: /review/i }) }).first();
  await form.getByRole('button', { name: /review/i }).click();
  await expect(page.getByTestId('toast')).toBeVisible({ timeout: 10_000 });

  // 5s dismissal + margin. An error would NOT disappear here — that asymmetry
  // is the point: unread failures must persist.
  await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 12_000 });
});

test('the toast can be dismissed by hand', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/catalog');
  await page.getByTestId('product-card').first().click();
  await page.locator('a[href*="/suppliers/"]').first().click();

  const form = page.locator('form').filter({ has: page.getByRole('button', { name: /review/i }) }).first();
  await form.getByRole('button', { name: /review/i }).click();
  const toast = page.getByTestId('toast');
  await expect(toast).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Dismiss notification' }).first().click();
  await expect(toast).toHaveCount(0, { timeout: 3000 });
});
