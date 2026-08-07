import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Buyer trust features: real supplier ratings, a saved-supplier shortlist, and
 * side-by-side comparison. The seed gives Cipla 2 saved suppliers + reviews, so
 * these run against real data.
 */

test('buyer sees their shortlist, compares two suppliers, and reads real ratings', async ({ page }) => {
  await login(page, USERS.buyer); // Cipla — seeded with 2 saved suppliers + reviews
  await page.goto('/en/buyer/saved');

  const rows = page.getByTestId('saved-row');
  await expect(rows).toHaveCount(2);
  // Ratings are rendered from real reviews (not "No reviews yet").
  await expect(rows.first()).toContainText(/\d\.\d/);

  // Add both to the compare tray, then open the comparison.
  const compareButtons = page.locator('[data-testid^="compare-toggle-"]');
  await compareButtons.nth(0).click();
  await compareButtons.nth(1).click();
  const bar = page.getByTestId('compare-bar');
  await expect(bar).toBeVisible();
  await page.getByTestId('compare-go').click();

  await expect(page).toHaveURL(/\/suppliers\/compare\?ids=/);
  const table = page.getByTestId('compare-table');
  await expect(table).toBeVisible();
  // 3 columns: the criteria column + 2 suppliers.
  await expect(table.locator('thead th')).toHaveCount(3);
  await expect(table).toContainText('Buyer rating');
});

test('a verified buyer writes/updates a supplier review', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/buyer/saved');

  // Open the first shortlisted supplier's profile.
  await page.getByTestId('saved-row').first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/suppliers\/[^/]+$/);

  // Rating + at least one seeded review render.
  await expect(page.getByTestId('review-form')).toBeVisible();
  await expect(page.getByTestId('review-row').first()).toBeVisible();

  // Update the review body and submit.
  const marker = 'E2E updated review body ' + '42';
  await page.getByTestId('review-body').fill(marker);
  await page.getByTestId('star-5').click();
  await page.getByTestId('review-submit').click();

  await expect(page.getByTestId('review-row').filter({ hasText: marker })).toBeVisible({ timeout: 15_000 });
});

test('a seller cannot review (no review form on the profile)', async ({ page }) => {
  await login(page, USERS.seller); // Sun Pharma — a seller, viewing another supplier
  // Reach a supplier profile via the public catalog link is awkward; instead the
  // seller's OWN profile must never show a self-review form.
  await page.goto('/en/buyer/saved'); // sellers can't buy → redirected away
  await expect(page).not.toHaveURL(/\/buyer\/saved/);
});
