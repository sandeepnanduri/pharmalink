import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * A user who arrives through SSO has an account but no organization: the
 * provider gives an email and a display name and nothing else. These tests pin
 * the gate that stops them reaching trading surfaces, and the setup form that
 * collects what SSO could not supply.
 */

test('an SSO user with no organization is pushed to account setup', async ({ page }) => {
  await login(page, USERS.newSso);
  await expect(page).toHaveURL(/\/en\/onboarding\/account/);

  // Deep links to trading surfaces are gated too, not just the landing page.
  await page.goto('/en/buyer/rfqs');
  await expect(page).toHaveURL(/\/en\/onboarding\/account/);
});

test('setup prefills what SSO knows and refuses to proceed without the terms', async ({ page }) => {
  await login(page, USERS.newSsoBuyer);
  await expect(page).toHaveURL(/\/en\/onboarding\/account/);

  // Email is the authenticated identity, so it is shown but not editable.
  const email = page.getByTestId('setup-email');
  await expect(email).toHaveValue(USERS.newSsoBuyer);
  await expect(email).toBeDisabled();
  // The single display name is split as a starting point.
  await expect(page.getByTestId('setup-first')).toHaveValue('Neha');
  await expect(page.getByTestId('setup-last')).toHaveValue('Kulkarni');

  await page.getByTestId('setup-phone').fill('+91 90000 11122');
  await page.getByTestId('setup-company').fill('Kulkarni Sourcing');
  await page.getByTestId('setup-submit').click();

  // Terms left unticked: the server rejects it, and nothing is created.
  await expect(page.getByTestId('setup-error')).toBeVisible();
  await expect(page).toHaveURL(/\/en\/onboarding\/account/);

  await page.getByTestId('setup-terms').check();
  await page.getByTestId('setup-submit').click();
  await expect(page).toHaveURL(/\/en\/onboarding\/buyer/, { timeout: 15_000 });
});

test('a role chosen on signup carries through and is preselected at setup', async ({ page }) => {
  await login(page, USERS.newSsoSeller);
  // What signup appends to the OAuth redirect when "seller" was picked.
  await page.goto('/en/onboarding/account?role=seller');
  await expect(page.getByTestId('setup-role-seller')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('setup-role-buyer')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('setup-company').fill('Kulkarni Actives');
  await page.getByTestId('setup-terms').check();
  await page.getByTestId('setup-submit').click();

  // A seller lands on seller onboarding, not the buyer flow.
  await expect(page).toHaveURL(/\/en\/onboarding\/seller/, { timeout: 15_000 });
});
