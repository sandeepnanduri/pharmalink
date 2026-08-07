import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Revenue model: subscription only. No escrow, no commission, no card data.
 */
test.describe('pricing', () => {
  test('shows three tiers and states the no-commission promise', async ({ page }) => {
    await page.goto('/en/pricing');
    await expect(page.getByTestId('plan-card-free')).toBeVisible();
    await expect(page.getByTestId('plan-card-growth')).toBeVisible();
    await expect(page.getByTestId('plan-card-enterprise')).toBeVisible();
    await expect(page.getByText('0% commission on trade value')).toBeVisible();
    await expect(page.getByText('$799')).toBeVisible();
  });

  test('the platform never mentions escrow or holding funds', async ({ page }) => {
    for (const path of ['/en', '/en/pricing', '/en/catalog']) {
      await page.goto(path);
      const body = (await page.textContent('body'))?.toLowerCase() ?? '';
      expect(body).not.toContain('escrow');
      expect(body).not.toContain('take-rate');
    }
  });

  test('pricing is translated into Chinese', async ({ page }) => {
    await page.goto('/zh/pricing');
    await expect(page.getByRole('heading', { name: '订阅方案与价格' })).toBeVisible();
    await expect(page.getByText('交易金额 0% 佣金')).toBeVisible();
  });
});

test.describe('plan enforcement', () => {
  test('current plan is reflected on billing with usage', async ({ page }) => {
    await login(page, USERS.buyer);
    await page.goto('/en/billing');
    await expect(page.getByTestId('current-plan')).toContainText('Starter');
    await expect(page.getByTestId('usage-rfqs')).toBeVisible();
    await expect(page.getByTestId('no-invoices')).toBeVisible();
  });

  test('upgrading issues an invoice to settle off-platform', async ({ page }) => {
    await login(page, USERS.buyer);
    await page.goto('/en/pricing');
    await page.getByTestId('choose-growth').click();
    // click() resolves when the click dispatches, not when the server action
    // finishes — wait for the observable effect before navigating away.
    await expect(page.getByTestId('plan-card-growth').getByTestId('current-plan-badge')).toBeVisible({
      timeout: 15_000,
    });

    await page.goto('/en/billing');
    await expect(page.getByTestId('current-plan')).toContainText('Growth');
    // An invoice is raised — but no card was ever asked for.
    await expect(page.getByTestId('invoice-row')).toHaveCount(1);
    await expect(page.getByTestId('invoice-row')).toContainText('799');
    const body = (await page.textContent('body'))?.toLowerCase() ?? '';
    expect(body).not.toContain('card number');
  });

  test('Starter plan quota blocks further RFQs — enforced server-side', async ({ page }) => {
    await login(page, USERS.buyer);

    // Make the test self-contained: other specs may have upgraded this org or
    // consumed quota, so explicitly put it back on Starter (3 RFQs/month).
    await page.goto('/en/pricing');
    const chooseFree = page.getByTestId('choose-free');
    if (await chooseFree.isVisible().catch(() => false)) {
      await chooseFree.click();
      await expect(page.getByTestId('plan-card-free').getByTestId('current-plan-badge')).toBeVisible({
        timeout: 15_000,
      });
    }
    await page.goto('/en/billing');
    await expect(page.getByTestId('current-plan')).toContainText('Starter');

    async function postRfq(label: string): Promise<'created' | 'blocked'> {
      await page.goto('/en/buyer/rfqs/new');
      await page.getByLabel('Product name').fill(label);
      await page.getByLabel('CAS number').fill('15687-27-1');
      await page.getByLabel('Quantity (kg)').fill('100');
      await page.getByLabel('Required by').fill('2026-12-01');
      await page.getByTestId('rfq-next').click();
      await page.getByTestId('rfq-next').click();
      await expect(page.getByTestId('rfq-broadcast')).toBeEnabled({ timeout: 15_000 });
      await page.getByTestId('rfq-broadcast').click();

      const blocked = page.getByTestId('rfq-error');
      // NOTE: the negative lookahead is load-bearing — /buyer/rfqs/new (the page
      // we are already on) otherwise matches, and every attempt would falsely
      // read as "created" without ever exercising the quota.
      const created = page
        .waitForURL(/\/buyer\/rfqs\/(?!new$)[^/]+$/, { timeout: 10_000 })
        .then(() => 'created' as const);
      const refused = blocked.waitFor({ timeout: 10_000 }).then(() => 'blocked' as const);
      return Promise.race([created, refused]).catch(() => 'blocked' as const);
    }

    // Don't assume how much quota is already used — post until the server refuses.
    // 4 attempts is strictly more than the Starter allowance of 3.
    let blockedAt = -1;
    for (let i = 0; i < 4; i++) {
      const result = await postRfq(`Quota probe ${i}`);
      if (result === 'blocked') {
        blockedAt = i;
        break;
      }
    }

    expect(blockedAt, 'Starter plan must refuse an RFQ within 4 attempts').toBeGreaterThanOrEqual(0);
    await expect(page.getByTestId('rfq-error')).toContainText('planLimitRfqs');
  });
});
