import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Compliance hub: sellers track their own cert expiry, buyers track their
 * suppliers' certs. The seed gives Sun Pharma an EU GMP cert expiring in ~25
 * days, so the early-warning alert is real (not a fabricated banner).
 */

test('seller sees their own certifications and a real expiry alert', async ({ page }) => {
  await login(page, USERS.seller); // Sun Pharma — EU GMP expiring in ~25 days
  await page.goto('/en/compliance');

  await expect(page.getByTestId('seller-compliance')).toBeVisible();
  await expect(page.getByTestId('cert-table').first()).toBeVisible();
  // The near-term expiry drives the renewal alert.
  await expect(page.getByTestId('seller-alerts')).toBeVisible();
  await expect(page.getByTestId('seller-alerts')).toContainText('EU GMP');
  // Regulatory reference is always present.
  await expect(page.getByTestId('regulatory-frameworks')).toContainText('21 CFR Part 211');
});

test('buyer tracks their suppliers’ certifications with an expiry alert', async ({ page }) => {
  await login(page, USERS.buyer); // Cipla — saved Sun Pharma + Huahai
  await page.goto('/en/compliance');

  await expect(page.getByTestId('buyer-compliance')).toBeVisible();
  await expect(page.getByTestId('cert-table').first()).toBeVisible();
  // Sun Pharma's expiring EU GMP surfaces on the buyer's radar.
  await expect(page.getByTestId('buyer-alerts')).toBeVisible();
});
