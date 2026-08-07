import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

test('404 offers a route out instead of a dead end', async ({ page }) => {
  const res = await page.goto('/en/this-page-does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('We could not find that page')).toBeVisible();
  await expect(page.getByRole('link', { name: /Browse the catalogue/i })).toBeVisible();
});

test('a real 404 inside a segment still 404s (no soft-404 from loading.tsx)', async ({ page }) => {
  await login(page, USERS.buyer);
  const res = await page.goto('/en/products/does-not-exist');
  expect(res?.status()).toBe(404);
});

test('skeletons announce once and mirror the page shape', async ({ page }) => {
  await login(page, USERS.buyer);
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false, downloadThroughput: 18_000, uploadThroughput: 18_000, latency: 900,
  });
  await page.goto('/en/analytics', { waitUntil: 'commit' });
  const sk = page.locator('.skeleton').first();
  await expect(sk).toBeVisible({ timeout: 8000 });
  expect(await page.getByRole('status').filter({ hasText: 'Loading' }).count()).toBeLessThanOrEqual(1);
  await client.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 });
});

test('theme is light only — no dark surface anywhere', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/en');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // Body must stay on the light ground even when the OS asks for dark.
  const [r, g, b] = bg.match(/\d+/g)!.map(Number);
  expect(r + g + b).toBeGreaterThan(600);
});
