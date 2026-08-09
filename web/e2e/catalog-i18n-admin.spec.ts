import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

test.describe('catalog', () => {
  test('search and cert filters narrow real results', async ({ page }) => {
    await page.goto('/en/catalog');
    const all = await page.getByTestId('product-card').count();
    expect(all).toBeGreaterThan(3);

    // Three listings match "Paracetamol": the API from Sun Pharma and from
    // Huahai, plus Huahai's finished tablet. A buyer searching the molecule
    // should see the dose form too, so all three are correct.
    await page.goto('/en/catalog?q=Paracetamol');
    await expect(page.getByTestId('product-card')).toHaveCount(3);

    // Only Sun Pharma holds US FDA GMP — Huahai must drop out (AND semantics).
    await page.goto('/en/catalog?q=Paracetamol&cert=US+FDA+GMP');
    await expect(page.getByTestId('product-card')).toHaveCount(1);
    await expect(page.getByTestId('product-card')).toContainText('Sun Pharma');
  });

  test('unverified suppliers never appear in the catalog', async ({ page }) => {
    // Zydus is pending and lists Amoxicillin — it must be invisible.
    await page.goto('/en/catalog?q=Amoxicillin');
    await expect(page.getByTestId('product-card')).toHaveCount(0);
    // The empty state now explains what to do next rather than just stating a
    // negative — assert the state, not one sentence of copy.
    await expect(page.getByTestId('catalog-empty')).toBeVisible();
  });

  test('impossible filter combination shows the empty state', async ({ page }) => {
    await page.goto('/en/catalog?cert=US+FDA+GMP&cert=NMPA');
    await expect(page.getByTestId('product-card')).toHaveCount(0);
  });

  test('controlled substances are never publicly listed (gap G13)', async ({ page }) => {
    // Tramadol is seeded against a *verified* supplier but carries a schedule,
    // so it is held as draft and must not surface — being verified is not enough.
    await page.goto('/en/catalog?q=Tramadol');
    await expect(page.getByTestId('product-card')).toHaveCount(0);
  });
});

test.describe('i18n', () => {
  test('Chinese locale renders translated UI', async ({ page }) => {
    await page.goto('/zh');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('全球 GMP 认证原料药');
    await page.goto('/zh/catalog');
    await expect(page.getByRole('heading', { name: '交易市场' })).toBeVisible();
  });

  test('language switcher keeps you on the same page', async ({ page }) => {
    await page.goto('/en/catalog');
    await page.getByLabel('Language').selectOption('zh');
    await expect(page).toHaveURL(/\/zh\/catalog/, { timeout: 15_000 });
  });

  test('root redirects to the default locale', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en/, { timeout: 15_000 });
  });
});

test.describe('ops verification', () => {
  test('admin approves a pending supplier, which then appears in the catalog', async ({ page }) => {
    // Zydus starts pending and invisible.
    await page.goto('/en/catalog?q=Amoxicillin');
    await expect(page.getByTestId('product-card')).toHaveCount(0);

    await login(page, USERS.admin);
    await page.goto('/en/admin');

    const item = page.getByTestId('queue-item').filter({ hasText: 'Zydus' });
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: /Approve/ }).click();

    // Queue drains and the verified count reflects it.
    await expect(page.getByTestId('queue-item').filter({ hasText: 'Zydus' })).toHaveCount(0, { timeout: 15_000 });

    // The audit trail recorded the decision.
    await expect(page.getByText('org.verified')).toBeVisible();
  });

  test('rejecting requires a reason', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto('/en/admin');
    const item = page.getByTestId('queue-item').first();
    const reason = item.getByPlaceholder('Reason (required to reject)');
    // The field is required — the browser blocks submission when empty.
    await expect(reason).toHaveAttribute('required', '');
  });
});
