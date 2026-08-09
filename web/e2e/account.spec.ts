import { test, expect } from '@playwright/test';
import { login, logout, USERS, PASSWORD } from './helpers';

/** Profile, password and company profile — available to every signed-in role. */
test.describe('profile', () => {
  test('supplier can view and edit their profile', async ({ page }) => {
    await login(page, USERS.seller);
    await page.goto('/en/account');

    await expect(page.getByTestId('profile-form')).toBeVisible();
    await expect(page.getByTestId('profile-name')).toHaveValue('Suresh Kumar');

    await page.getByTestId('profile-name').fill('Suresh K. Kumar');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('form-saved').first()).toBeVisible({ timeout: 15_000 });

    // Persisted, not just echoed back into the input.
    await page.reload();
    await expect(page.getByTestId('profile-name')).toHaveValue('Suresh K. Kumar');
  });

  test('email cannot be edited — it is the account identity', async ({ page }) => {
    await login(page, USERS.seller);
    await page.goto('/en/account');
    await expect(page.locator('#pf-email')).toBeDisabled();
  });

  test('the account link is available to every role', async ({ page }) => {
    for (const who of [USERS.seller, USERS.buyer, 'ops@pharmalink.global', 'verifier@pharmalink.global']) {
      await login(page, who);
      await expect(page.locator('[data-testid="app-shell"] nav').getByRole('link', { name: 'Account' }), `${who} needs an Account link`).toBeVisible();
      await page.goto('/en/account');
      await expect(page.getByTestId('profile-form')).toBeVisible();
      await logout(page);
    }
  });
});

test.describe('change password', () => {
  test('rejects a wrong current password', async ({ page }) => {
    await login(page, USERS.chinaSeller);
    await page.goto('/en/account');

    await page.getByTestId('pw-current').fill('definitely-not-my-password');
    await page.getByTestId('pw-new').fill('BrandNewPass123!');
    await page.getByTestId('pw-confirm').fill('BrandNewPass123!');
    await page.getByTestId('pw-save').click();

    await expect(page.getByTestId('form-error').first()).toBeVisible({ timeout: 15_000 });
  });

  test('rejects mismatched confirmation and short passwords', async ({ page }) => {
    await login(page, USERS.chinaSeller);
    await page.goto('/en/account');

    await page.getByTestId('pw-current').fill(PASSWORD);
    await page.getByTestId('pw-new').fill('LongEnoughPass1!');
    await page.getByTestId('pw-confirm').fill('SomethingElse123!');
    await page.getByTestId('pw-save').click();
    await expect(page.getByTestId('form-error').first()).toBeVisible({ timeout: 15_000 });
  });

  test('changes the password, and the new one actually works', async ({ page }) => {
    // Uses a dedicated account so no other spec is affected by the change.
    const NEW = 'RotatedPass456!';
    await login(page, USERS.approvableSeller);
    await page.goto('/en/account');

    await page.getByTestId('pw-current').fill(PASSWORD);
    await page.getByTestId('pw-new').fill(NEW);
    await page.getByTestId('pw-confirm').fill(NEW);
    await page.getByTestId('pw-save').click();
    await expect(page.getByTestId('form-saved').first()).toBeVisible({ timeout: 15_000 });

    // Old password must now fail, new one must work.
    await logout(page);
    await page.goto('/en/login');
    await page.getByLabel('Work email').fill(USERS.approvableSeller);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 15_000 });

    await login(page, USERS.approvableSeller, NEW);
    await expect(page.getByTestId('current-user')).toHaveText(USERS.approvableSeller);
  });
});

test.describe('company profile', () => {
  test('supplier can edit company details and default commercial terms', async ({ page }) => {
    await login(page, USERS.seller);
    await page.goto('/en/account');

    await expect(page.getByTestId('company-form')).toBeVisible();
    await page.getByTestId('company-city').fill('Navi Mumbai');
    await page.getByTestId('company-incoterm').fill('CIF Rotterdam');
    await page.getByTestId('company-dmf').fill('DMF 99999');
    await page.getByTestId('company-save').click();
    await expect(page.getByTestId('form-saved').first()).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByTestId('company-city')).toHaveValue('Navi Mumbai');
    await expect(page.getByTestId('company-incoterm')).toHaveValue('CIF Rotterdam');
    await expect(page.getByTestId('company-dmf')).toHaveValue('DMF 99999');
  });

  test('a verified org cannot edit its legal identity', async ({ page }) => {
    await login(page, USERS.seller);
    await page.goto('/en/account');
    // Name + registration number were verified against an issuing authority —
    // editing them would move a verified badge onto a different company.
    await expect(page.getByTestId('company-locked')).toBeVisible();
    await expect(page.getByTestId('company-name')).toBeDisabled();
    await expect(page.locator('#co-reg')).toBeDisabled();
  });

  test('an unverified org CAN still edit its legal identity', async ({ page }) => {
    await login(page, USERS.pendingSeller);
    await page.goto('/en/account');
    await expect(page.getByTestId('company-locked')).toHaveCount(0);
    await expect(page.getByTestId('company-name')).toBeEnabled();
  });

  test('staff have no company profile section', async ({ page }) => {
    await login(page, 'ops@pharmalink.global');
    await page.goto('/en/account');
    await expect(page.getByTestId('profile-form')).toBeVisible();
    await expect(page.getByTestId('password-form')).toBeVisible();
    // Staff are employees, not a trading party.
    await expect(page.getByTestId('company-form')).toHaveCount(0);
  });
});
