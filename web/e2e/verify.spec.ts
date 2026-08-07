import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { login, USERS } from './helpers';

/**
 * Cluster H — honest document integrity (real SHA-256, no blockchain). The seed
 * registers a Sun Pharma FDA GMP cert document; its hash is deterministic.
 */
const HASH = createHash('sha256').update('PharmaLink demo document — Sun FDA GMP Halol').digest('hex');

test('public verify: the form confirms a registered hash', async ({ page }) => {
  await page.goto('/en/verify');
  await page.getByTestId('verify-input').fill(HASH);
  await page.getByTestId('verify-submit').click();

  await expect(page.getByTestId('verify-found')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('verify-found')).toContainText('Sun Pharma');
  await expect(page.getByTestId('verify-found')).toContainText('FDA_GMP_Sun_Halol');
});

test('public verify: an unknown hash is rejected', async ({ page }) => {
  await page.goto('/en/verify?hash=' + '0'.repeat(64));
  await expect(page.getByTestId('verify-notfound')).toBeVisible();
});

test('public verify: non-hash input is flagged as invalid', async ({ page }) => {
  await page.goto('/en/verify?hash=not-a-real-hash');
  await expect(page.getByTestId('verify-result')).toContainText(/SHA-256/i);
});

test('an org sees its document registry with integrity hashes', async ({ page }) => {
  await login(page, USERS.seller); // Sun Pharma
  await page.goto('/en/compliance');
  await expect(page.getByTestId('document-registry')).toBeVisible();
  await expect(page.getByTestId('doc-row').first()).toBeVisible();
});
