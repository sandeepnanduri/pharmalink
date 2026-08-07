import { test, expect } from '@playwright/test';
import { login, logout, USERS } from './helpers';

/**
 * The CMS + crawler: ops author content (or crawl a link), curate what is
 * featured on the homepage, and the SSRF guard refuses internal URLs.
 */

test('admin writes a featured article; it appears in Spotlight + /content, then unpublishes', async ({ page }) => {
  const TITLE = 'E2E Spotlight — comparing API quotes on landed cost';

  await login(page, USERS.admin);
  await page.goto('/en/admin/content');

  // "Write article" is the default mode.
  await page.getByTestId('content-title').fill(TITLE);
  await page.getByTestId('content-summary').fill('A short E2E article used to verify the CMS pipeline end to end.');
  await page.getByTestId('content-body').fill('First paragraph.\n\nSecond paragraph.');
  await page.getByTestId('content-featured').check();
  await page.getByTestId('content-publish').check();
  await page.getByTestId('content-save').click();

  // Listed as published in the manager.
  const row = page.getByTestId('content-row').filter({ hasText: TITLE });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('Published');

  // Public: homepage Spotlight + the /content index both show it.
  await logout(page);
  await page.goto('/en');
  await expect(page.getByTestId('spotlight')).toContainText(TITLE);
  await page.goto('/en/content');
  await expect(page.getByText(TITLE)).toBeVisible();

  // Curation: unpublish it and it leaves the public index.
  await login(page, USERS.admin);
  await page.goto('/en/admin/content');
  await page.getByTestId('content-row').filter({ hasText: TITLE }).getByRole('button', { name: 'Unpublish' }).click();
  await expect(page.getByTestId('content-row').filter({ hasText: TITLE })).toContainText('Draft', { timeout: 15_000 });

  await logout(page);
  await page.goto('/en/content');
  await expect(page.getByText(TITLE)).toHaveCount(0);
});

test('the link crawler refuses an internal/metadata URL (SSRF guard)', async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto('/en/admin/content');

  await page.getByTestId('tab-link').click();
  await page.getByTestId('link-url').fill('http://169.254.169.254/latest/meta-data/');
  await page.getByTestId('link-fetch').click();

  // The server-side SSRF guard blocks it and the UI surfaces the reason.
  await expect(page.getByText(/blocked or private host/i)).toBeVisible({ timeout: 15_000 });
});

test('seeded featured content renders in the homepage Spotlight', async ({ page }) => {
  await page.goto('/en');
  const spotlight = page.getByTestId('spotlight');
  await expect(spotlight).toBeVisible();
  // The seed features an article + an FDA link.
  await expect(spotlight.getByTestId('spotlight-card').first()).toBeVisible();
});
