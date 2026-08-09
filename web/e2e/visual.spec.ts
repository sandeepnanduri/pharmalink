import { test, expect, type Page } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Visual and hygiene sweep over the screens this work adds or changes.
 *
 * Not a snapshot test — snapshots of a design in flux are noise. This asserts
 * the three things that are objectively wrong rather than a matter of taste,
 * at both widths the redesign kit asks for (1440 and 390):
 *
 *   1. the page renders its key content,
 *   2. the browser console is clean,
 *   3. the document does not scroll horizontally.
 *
 * Artefacts land in `test-results/` so the rendering can be eyeballed too.
 */

const WIDTHS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

/** The logo CDN is third-party, has a designed monogram fallback, and is not reachable in CI. */
const IGNORED = /logo\.dev/;

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.test(m.text())) errors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  return errors;
}

async function checkPage(page: Page, path: string, label: string) {
  const errors = watchConsole(page);
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `test-results/visual/${label}.png`, fullPage: true });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(2);
  expect(errors, `${label} console errors`).toEqual([]);
}

for (const { name, width, height } of WIDTHS) {
  test.describe(`${name} (${width}px)`, () => {
    test.use({ viewport: { width, height } });

    test('public pages render clean', async ({ page }) => {
      await checkPage(page, '/en/catalog', `catalog-${name}`);
      await expect(page.getByTestId('product-card').first()).toBeVisible();

      await page.goto('/en/catalog?type=ksm');
      const ksm = page.getByTestId('product-card').first();
      await expect(ksm).toBeVisible();
      const href = await ksm.getAttribute('href');
      expect(href, 'the KSM card should link to a product').toBeTruthy();

      await checkPage(page, href!, `product-ksm-${name}`);
      // The registry-driven spec sheet, with its segment-specific groups.
      await expect(page.getByTestId('spec-table')).toBeVisible();
      await expect(page.getByTestId('spec-group-synthesis')).toBeVisible();
      await expect(page.getByTestId('spec-parentApiCas')).toContainText('1115-70-4');
      // A KSM has no dose form, so that group must not render at all.
      await expect(page.getByTestId('spec-group-formulation')).toHaveCount(0);
    });

    test('the seller editor renders clean', async ({ page }) => {
      await login(page, USERS.seller);
      await page.goto('/en/seller/products');
      await page.getByTestId('product-row').filter({ hasText: 'Dicyandiamide' }).getByRole('link').click();
      await page.waitForURL(/\/edit$/);

      await checkPage(page, page.url(), `seller-editor-${name}`);
      await expect(page.getByTestId('spec-completeness')).toBeVisible();
      await expect(page.getByTestId('field-group-synthesis')).toBeVisible();
      await expect(page.getByTestId('spec-parentApiCas')).toHaveValue('1115-70-4');
    });
  });
}
