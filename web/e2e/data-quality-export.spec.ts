import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * The two halves of phase 6 that only exist end to end: what the forecast rests
 * on, whether the curated corpus is any good, and whether the workbook we hand
 * a curator is one we can read back.
 */

test.describe('forecast evidence', () => {
  test('the molecule page says what the forecast rests on', async ({ page }) => {
    await login(page, USERS.buyer);
    await page.goto('/en/analytics/103-90-2');

    const evidence = page.getByTestId('evidence');
    await expect(evidence).toBeVisible();

    // A count, not a placeholder — the seed holds a real series for this CAS.
    await expect(page.getByTestId('evidence-used')).not.toHaveText('0');
    await expect(page.getByTestId('evidence-excluded')).toBeVisible();

    // The mix is the point: a page that shows one number and no provenance is
    // the thing this section exists to replace.
    const mix = page.getByTestId('confidence-mix');
    await expect(mix).toContainText('High');
    await expect(mix).toContainText('Low');
  });

  test('a supplier is compared against a stated benchmark, never a bare percentage', async ({ page }) => {
    await login(page, USERS.buyer);
    await page.goto('/en/analytics/103-90-2');

    const rows = page.getByTestId('supplier-price-row');
    await expect(rows.first()).toBeVisible();

    // Every comparison shows the median it was measured against and how wide a
    // window that came from, so "12% below market" is checkable rather than an
    // accusation. An earlier version compared an August quote to two years of
    // customs data and reported 67% below market.
    const first = rows.first();
    await expect(first).toContainText('$');
    await expect(first).toContainText(/same month|month window/);
  });
});

test.describe('data quality', () => {
  test('ops sees coverage, freshness and the price mix', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto('/en/admin/data-quality');

    await expect(page.getByTestId('data-quality')).toBeVisible();
    await expect(page.getByTestId('overall-coverage')).toContainText('%');

    // Sellers only, and every seeded one is present. Not an exact row count:
    // the SSO onboarding spec creates a supplier, so a fixed number here fails
    // depending on which specs ran first.
    const rows = page.getByTestId('quality-row');
    expect(await rows.count()).toBeGreaterThanOrEqual(6);
    await expect(page.getByText('Sun Pharma API Division')).toBeVisible();

    // Buyers are deliberately not scored — no FEI, no plants and no listings by
    // design, so they would sit at the bottom of the work queue forever.
    await expect(page.getByText('Cipla Ltd')).toHaveCount(0);

    // Both ends of the freshness scale are populated, so an operator can tell
    // the widget works rather than seeing one uniform bucket. Counts, not exact
    // numbers: earlier specs verify organisations and move rows between
    // buckets, so a fixed figure fails depending on what ran first.
    const freshness = page.getByTestId('freshness');
    await expect(freshness).toContainText(/Within 90 days · [1-9]/);
    await expect(freshness).toContainText(/Over 6 months · [1-9]/);

    // A price corpus at all. The exact count moves with whatever the suite has
    // quoted, so assert it is populated rather than pinning a number.
    await expect(page.getByTestId('price-quality')).toContainText(/\b[1-9]\d{2,}\b/);
  });

  test('a buyer cannot reach the data-quality console', async ({ page }) => {
    await login(page, USERS.buyer);
    await page.goto('/en/admin/data-quality');
    await expect(page.getByTestId('data-quality')).toHaveCount(0);
  });
});

test.describe('catalogue export', () => {
  test('ops downloads a workbook the importer can read back', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto('/en/admin/imports');

    const download = page.waitForEvent('download');
    await page.getByTestId('catalogue-export-all').click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(/^pharmalink-catalogue-\d{4}-\d{2}-\d{2}\.xlsx$/);

    // Upload it straight back. The acceptance criterion for the whole round
    // trip is that a re-upload updates rather than duplicates, so preview must
    // report rows read with nothing rejected.
    const path = await file.path();
    await page.setInputFiles('input[type="file"]', path);
    await page.getByTestId('catalogue-import-preview').click();

    const report = page.getByTestId('import-summary');
    await expect(report).toBeVisible({ timeout: 60_000 });
    await expect(report).toContainText('1. Company Master');
    await expect(report).toContainText('9. Key Contacts');
    // Zero rejected: every row we wrote, we can read.
    await expect(report).toContainText('0 rejected');
  });

  test('a supplier cannot export the catalogue', async ({ page }) => {
    // It is every supplier's contact list and commercial terms in one file.
    await login(page, USERS.seller);
    const res = await page.request.get('/api/admin/exports/supplier-catalogue');
    expect(res.status()).toBe(403);
  });
});
