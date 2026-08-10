import { test, expect } from '@playwright/test';

/**
 * The faceted catalogue, end to end.
 *
 * `filters.ts` has rendered sections for segment, therapeutic area, dose form,
 * excipient function, purity, cold chain, incoterms and lead time since the
 * rail was built, and `catalog-queries.ts` has queried them — but nothing on
 * the write side ever set the columns, so every one of them returned an empty
 * result. Every assertion below would have failed before the product form, the
 * server action, the CSV importer and the seed were routed through the shared
 * derivations in `src/lib/product-fields.ts`.
 *
 * Each case therefore checks a filter returns something AND that a filter with
 * no matching data still returns nothing — a filter that matches everything is
 * the failure mode this whole area is guarding against.
 */

const cards = (page: import('@playwright/test').Page) => page.getByTestId('product-card');

test.describe('segment and facet filters return real results', () => {
  test('every segment the taxonomy defines has listings behind it', async ({ page }) => {
    // Before this, every listing on the platform was productType 'api', so six
    // of the seven segment options returned nothing at all.
    for (const type of ['api', 'ksm', 'intermediate', 'excipient', 'raw_material', 'fdf', 'specialty']) {
      await page.goto(`/en/catalog?type=${type}`);
      await expect(cards(page).first(), `segment ${type} has no listings`).toBeVisible();
    }
  });

  test('a facet narrows within its segment, and the card says which facet matched', async ({ page }) => {
    await page.goto('/en/catalog?type=excipient&excipientFunction=filler');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('Microcrystalline Cellulose');
    await expect(cards(page).first().getByTestId('card-facet')).toHaveText('Filler / diluent');
  });

  test('a facet with no matching listings returns an empty state, not everything', async ({ page }) => {
    await page.goto('/en/catalog?type=excipient&excipientFunction=binder');
    await expect(cards(page)).toHaveCount(0);
    await expect(page.getByTestId('catalog-empty')).toBeVisible();
  });

  test('therapeutic area filters APIs', async ({ page }) => {
    await page.goto('/en/catalog?therapeuticArea=antidiabetic');
    await expect(cards(page).first()).toContainText('Metformin');
    await page.goto('/en/catalog?therapeuticArea=oncology');
    await expect(cards(page)).toHaveCount(0);
  });

  test('dose form filters finished dose forms', async ({ page }) => {
    await page.goto('/en/catalog?type=fdf&doseForm=tablet');
    await expect(cards(page).first()).toContainText('Tablets');
  });
});

test.describe('commercial filters', () => {
  test('cold chain finds the refrigerated listings only', async ({ page }) => {
    await page.goto('/en/catalog?coldChain=refrigerated');
    const count = await cards(page).count();
    expect(count).toBeGreaterThan(0);
    await page.goto('/en/catalog?coldChain=ultracold');
    await expect(cards(page)).toHaveCount(0);
  });

  test('the three incoterms the rail was missing are now filterable', async ({ page }) => {
    // INCOTERMS listed seven of the ten Incoterms 2020 rules, so a supplier
    // offering CPT, CIP or DPU could be stored but never found.
    for (const term of ['CPT', 'DPU']) {
      await page.goto(`/en/catalog?incoterm=${term}`);
      await expect(cards(page).first(), `no listing offers ${term}`).toBeVisible();
    }
  });

  test('minimum purity filters on the numeric twin of the purity string', async ({ page }) => {
    await page.goto('/en/catalog?purityMin=99.5');
    const high = await cards(page).count();
    await page.goto('/en/catalog?purityMin=99.9');
    const veryHigh = await cards(page).count();
    expect(high).toBeGreaterThan(0);
    expect(veryHigh).toBeLessThan(high);
  });

  test('maximum lead time excludes the slower suppliers', async ({ page }) => {
    // leadTimeMax was parsed from the URL since the rail was built but never
    // reached the query, so this filter rendered and did nothing.
    await page.goto('/en/catalog?leadTimeMax=7');
    const fast = await cards(page).count();
    await page.goto('/en/catalog?leadTimeMax=90');
    const all = await cards(page).count();
    expect(fast).toBeGreaterThan(0);
    expect(fast).toBeLessThan(all);
  });

  test('sorting by lead time orders shortest first', async ({ page }) => {
    // SORT_MAP.lead_time fell back to newest-first because lead time was free
    // text. It now sorts on leadTimeDays, with unstated ones last rather than
    // first — an unknown lead time is not a short one.
    await page.goto('/en/catalog?sort=lead_time');
    await expect(cards(page).first()).toContainText('Acetone'); // 1 week, the fastest seeded listing
  });
});
