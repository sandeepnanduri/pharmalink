import { test, expect } from '@playwright/test';
import { login, logout, USERS } from './helpers';

/**
 * The public homepage surfaces REAL market signal — latest listings, a live
 * activity feed, and a pharma-news hub (BACKLOG R12: real data only). The buyer
 * side stays anonymous (R13): a named pharma's sourcing must never be exposed.
 */
test('homepage shows live activity, listings and news — with buyers anonymised', async ({ page }) => {
  await page.goto('/en');

  // Activity feed is present and populated from real records.
  const activity = page.getByTestId('market-activity');
  await expect(activity).toBeVisible();
  await expect(page.getByTestId('activity-row').first()).toBeVisible();

  // Latest listings and news are populated from the seed.
  await expect(page.getByTestId('listing-card').first()).toBeVisible();
  await expect(page.getByTestId('news-card').first()).toBeVisible();

  // ANONYMITY: Cipla is a seeded buyer. Its name must appear nowhere on the
  // public homepage — not in the activity feed, not anywhere.
  await expect(activity).not.toContainText('Cipla');
  await expect(page.locator('body')).not.toContainText('Cipla');
});

test('developers page documents the open API', async ({ page }) => {
  await page.goto('/en/developers');
  await expect(page.getByRole('heading', { name: 'Developers', exact: true })).toBeVisible();
  await expect(page.getByText('/api/v1/products').first()).toBeVisible();
  await expect(page.getByText('catalog:read').first()).toBeVisible();
});

test('news hub: public list and article render', async ({ page }) => {
  await page.goto('/en/news');
  await expect(page.getByTestId('news-card').first()).toBeVisible();

  // Open the first article.
  await page.getByTestId('news-card').first().click();
  await expect(page).toHaveURL(/\/news\/[^/]+$/);
  await expect(page.getByRole('link', { name: /All news/ })).toBeVisible();
});

test('admin publishes a news post and it appears in the hub', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  const HEADLINE = 'E2E Regulatory Bulletin — inspection cadence update';

  await login(page, USERS.admin);
  await page.goto('/en/admin/news');

  await page.getByTestId('news-title').fill(HEADLINE);
  await page.getByTestId('news-summary').fill('A test post published by the E2E suite to verify the news pipeline.');
  await page.getByTestId('news-body').fill('First paragraph.\n\nSecond paragraph.');
  // publish checkbox is checked by default.
  await page.getByTestId('news-save').click();

  // It shows in the admin list as published.
  const row = page.getByTestId('news-row').filter({ hasText: HEADLINE });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('Published');

  // It shows in the public hub.
  await logout(page);
  await page.goto('/en/news');
  await expect(page.getByText(HEADLINE)).toBeVisible();

  // Unpublish it (admin) and it leaves the public hub.
  await login(page, USERS.admin);
  await page.goto('/en/admin/news');
  await page.getByTestId('news-row').filter({ hasText: HEADLINE }).getByRole('button', { name: 'Unpublish' }).click();
  await expect(page.getByTestId('news-row').filter({ hasText: HEADLINE })).toContainText('Draft', { timeout: 15_000 });

  await logout(page);
  await page.goto('/en/news');
  await expect(page.getByText(HEADLINE)).toHaveCount(0);
});

test('the hero showcase renders all three scenes with nothing blank', async ({ page }) => {
  await page.goto('/en');
  const scenes = page.locator('.pl-hs-scene');
  await expect(scenes).toHaveCount(3);

  // Nine rows across three scenes. A row stuck at opacity 0 means some rule
  // claimed the animation shorthand and cancelled its fade-in — which is
  // exactly how the best-value row once vanished, leaving a hole in the card.
  await page.waitForTimeout(1200);
  const stuck = await page
    .locator('.pl-hs-row')
    .evaluateAll((rows) => rows.filter((r) => Number(getComputedStyle(r).opacity) === 0 && Number(getComputedStyle(r.closest('.pl-hs-scene')!).opacity) > 0.5).length);
  expect(stuck, 'rows visible in a shown scene but stuck transparent').toBe(0);

  // Each scene must carry a headline, so none renders as an empty panel.
  // Scoped to the showcase: the page's feature section reuses this wording.
  for (const [i, label] of ['Compare quotes', 'Verify the supplier', 'Track the order'].entries()) {
    await expect(scenes.nth(i).getByText(label, { exact: true })).toBeAttached();
  }
});
