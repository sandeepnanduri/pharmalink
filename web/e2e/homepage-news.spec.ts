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

test('the hero states real supplier numbers, not the mockup figures', async ({ page }) => {
  // The approved mockup opens with "2,300+ GMP-verified suppliers · 48
  // countries". Those are not our numbers. A platform whose entire pitch is
  // "we check things" cannot lead with an invented figure, so the pill is
  // counted from verified rows — and this test is what stops a later tidy-up
  // from pasting the prettier mockup copy back in.
  await page.goto('/en');
  const pill = page.getByTestId('hero-pill');
  await expect(pill).toBeVisible();
  await expect(pill).not.toContainText('2,300');
  await expect(pill).not.toContainText('48 countries');

  // Whatever the seed holds, it is a real count: a number, and a small one.
  const suppliers = Number((await pill.innerText()).match(/\d+/)![0]);
  expect(suppliers).toBeGreaterThan(0);
  expect(suppliers).toBeLessThan(100);
});

test('the hero shows one RFQ compared across three suppliers, with the documents behind it', async ({ page }) => {
  await page.goto('/en');

  // The visual IS the pitch — one request, quotes side by side, certificates
  // attached. If it renders empty the page argues for nothing.
  const quotes = page.getByTestId('hero-quote');
  await expect(quotes).toHaveCount(3);
  // Exactly one is marked best value; two would make the comparison meaningless.
  await expect(page.getByTestId('hero-best')).toHaveCount(1);

  // Prices are mono — identifying numbers always are, so columns line up.
  for (const [i, price] of ['$4.20', '$3.95', '$5.10'].entries()) {
    const cell = quotes.nth(i).getByText(price, { exact: true });
    await expect(cell).toBeVisible();
    await expect(cell).toHaveCSS('font-variant-numeric', 'tabular-nums');
  }

  await expect(page.getByTestId('hero-doc')).toHaveCount(3);
});

test('hero search reaches the catalogue without JavaScript', async ({ browser }) => {
  // A plain GET form, so a crawler can follow it and a failed hydration does
  // not cost the site its primary call to action.
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/en');
  await page.getByRole('textbox', { name: /search/i }).fill('Paracetamol');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/\/catalog\?q=Paracetamol/);

  // The assertion stops at the URL on purpose, and the reason is worth knowing:
  // /catalog has a `loading.tsx`, so its whole body streams inside a Suspense
  // boundary. With scripts off, React never swaps that payload out of its
  // `display:none` staging div — the page renders as the skeleton and nothing
  // else, not even the <h1>. That is a property of the segment, not of this
  // form, and it is tracked as its own item; asserting on it here would make
  // this test fail for a reason that has nothing to do with the hero.
  await ctx.close();
});
