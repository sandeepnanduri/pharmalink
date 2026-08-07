import { test, expect } from '@playwright/test';
import { login, logout, USERS } from './helpers';

/**
 * Cluster F — team accounts. An org owner adds teammates (within their seat plan)
 * who join the same organization with the same trading access. MediSource is on
 * the growth plan (5 seats), so its owner can invite.
 */

test('org owner adds a teammate who can then sign in; members cannot invite', async ({ page }) => {
  await login(page, USERS.proBuyer); // pro@medisource.test — MediSource owner
  await page.goto('/en/account');
  await page.getByTestId('team-link').click();
  await expect(page).toHaveURL(/\/account\/team$/);
  await expect(page.getByTestId('member-row')).toHaveCount(1); // just the owner

  await page.getByTestId('tm-name').fill('Ravi Teammate');
  await page.getByTestId('tm-email').fill('ravi.team@medisource.test');
  await page.getByTestId('tm-password').fill('Password123!');
  await page.getByTestId('tm-invite').click();

  await expect(page.getByTestId('member-row')).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByTestId('member-row').filter({ hasText: 'ravi.team@medisource.test' })).toBeVisible();

  // The new teammate can sign in (temporary password) and lands on the buyer app.
  await logout(page);
  await login(page, 'ravi.team@medisource.test'); // default Password123!
  await expect(page.getByTestId('current-user')).toHaveText('ravi.team@medisource.test');

  // A member sees the team read-only — no invite form.
  await page.goto('/en/account/team');
  await expect(page.getByTestId('member-row').first()).toBeVisible();
  await expect(page.getByTestId('tm-invite')).toHaveCount(0);
});

test('a free-plan org is at its seat limit (cannot invite)', async ({ page }) => {
  await login(page, USERS.buyer); // Cipla — free plan, 1 seat, already used
  await page.goto('/en/account/team');
  await expect(page.getByTestId('seat-limit')).toBeVisible();
  await expect(page.getByTestId('tm-invite')).toHaveCount(0);
});
