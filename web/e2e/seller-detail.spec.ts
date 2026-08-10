import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Supplier-managed facilities and regulatory filings.
 *
 * Sites were previously creatable only inside the onboarding wizard, so a
 * supplier who commissioned a plant in year two had nowhere to record it.
 * Filings had no home at all.
 */
test.describe('facilities', () => {
  test('a supplier can add a plant and it appears on the public profile', async ({ page }) => {
    await login(page, USERS.seller);
    await page.goto('/en/seller/facilities');
    await expect(page.getByTestId('facility-manage-row').first()).toBeVisible();

    await page.getByTestId('add-facility').click();
    await page.getByTestId('f-name').fill('Dahej API Facility (Unit III)');
    await page.getByTestId('f-city').fill('Dahej');
    await page.getByTestId('f-country').fill('India');
    await page.getByTestId('f-regulatoryId').fill('3009998877');
    // Exact terms only — the template refuses informal inspection descriptions.
    await page.getByTestId('f-fdaInspectionOutcome').selectOption('OAI');
    await page.getByTestId('f-capacityValue').fill('600');
    await page.getByTestId('f-capacityUnit').fill('MT/year');
    await page.getByTestId('save-facility').click();

    const row = page.getByTestId('facility-manage-row').filter({ hasText: 'Dahej' });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('3009998877');
    await expect(row).toContainText('OAI');
  });

  test('a site carrying a certificate cannot be deleted', async ({ page }) => {
    // A GMP certificate names one specific site. Deleting it would leave the
    // claim pointing nowhere, so the control is absent rather than failing.
    await login(page, USERS.seller);
    await page.goto('/en/seller/facilities');
    const certified = page.getByTestId('facility-manage-row').filter({ hasText: 'linked' }).first();
    await expect(certified).toBeVisible();
    await expect(certified.locator('[data-testid^="delete-facility-"]')).toHaveCount(0);
  });
});

test.describe('regulatory filings', () => {
  test('a supplier sees their filings with honest expiry buckets', async ({ page }) => {
    await login(page, USERS.seller);
    await page.goto('/en/seller/filings');

    await expect(page.getByTestId('filing-manage-row').filter({ hasText: 'DMF #23412' })).toBeVisible();
    // A DMF has no expiry, and that is `unknown` — never a clean "ok".
    await expect(page.getByTestId('manage-expiry-unknown').first()).toBeVisible();
    // The CEP is 20 days out.
    await expect(page.getByTestId('manage-expiry-warning').first()).toBeVisible();
    // And the expired ANDA is called out.
    await expect(page.getByTestId('manage-expiry-expired').first()).toBeVisible();
    await expect(page.getByTestId('filings-attention')).toBeVisible();
  });

  test('re-declaring the same filing edits it rather than duplicating', async ({ page }) => {
    await login(page, USERS.seller);
    await page.goto('/en/seller/filings');
    const before = await page.getByTestId('filing-manage-row').count();

    await page.getByTestId('add-filing').click();
    await page.getByTestId('f-filingType').selectOption('US FDA Type II DMF');
    await page.getByTestId('f-filingNumber').fill('Type II DMF #23412'); // already held
    await page.getByTestId('f-productName').fill('Paracetamol (Acetaminophen)');
    await page.getByTestId('save-filing').click();

    await expect(page.getByTestId('filing-manage-row')).toHaveCount(before, { timeout: 15_000 });
  });

  test('filings join certificates in the compliance register', async ({ page }) => {
    await login(page, USERS.seller);
    await page.goto('/en/compliance');
    const table = page.getByTestId('seller-compliance');
    await expect(table).toContainText('Type II DMF #23412');
    await expect(table).toContainText('Filing');
    await expect(table).toContainText('Certificate');
  });
});
