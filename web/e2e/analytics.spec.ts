import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Price intelligence: real market bands from real quotes, real buyer spend from
 * real deals, real seller competitiveness. The seed provides historical RFQs,
 * quotes and 2 deals, so every figure is computed (nothing fabricated).
 */

test('buyer sees real spend and the market price index', async ({ page }) => {
  await login(page, USERS.buyer); // Cipla — has a closed Paracetamol deal
  await page.goto('/en/analytics');

  await expect(page.getByTestId('buyer-spend')).toBeVisible();
  await expect(page.getByTestId('total-spend')).toContainText('$');

  const index = page.getByTestId('market-index');
  await expect(index).toBeVisible();
  await expect(page.getByTestId('index-row').first()).toBeVisible();
  await expect(index).toContainText('Paracetamol');
});

test('seller sees price competitiveness vs the real market', async ({ page }) => {
  await login(page, USERS.seller); // Sun Pharma
  await page.goto('/en/analytics');

  await expect(page.getByTestId('seller-competitiveness')).toBeVisible();
  await expect(page.getByTestId('competitiveness-row').first()).toBeVisible();
  // The market average column is populated from real quotes ($/kg).
  await expect(page.getByTestId('seller-competitiveness')).toContainText('/kg');
  await expect(page.getByTestId('market-index')).toBeVisible();
});
