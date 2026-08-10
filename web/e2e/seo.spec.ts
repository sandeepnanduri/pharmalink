import { test, expect } from '@playwright/test';

/**
 * SEO is invisible until it breaks in production, so it gets its own guard.
 * These assert the machine-readable output search engines actually consume.
 */
test.describe('crawl directives', () => {
  test('robots.txt allows discovery pages and blocks private ones', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();
    expect(body).toContain('Allow: /');
    expect(body).toContain('Sitemap:');
    // Per-account areas must never be crawled.
    for (const priv of ['/*/buyer', '/*/admin', '/*/billing', '/*/account']) {
      expect(body).toContain(`Disallow: ${priv}`);
    }
  });

  test('sitemap lists products and suppliers with hreflang', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text();
    expect(xml).toContain('/en/catalog');
    expect(xml).toContain('/products/');
    expect(xml).toContain('/suppliers/');
    // Bilingual alternates present, or EN and ZH get treated as duplicates.
    expect(xml).toContain('hreflang="zh"');
    expect(xml).toContain('hreflang="x-default"');
  });

  test('manifest is served for PWA/icon metadata', async ({ request }) => {
    const m = await (await request.get('/manifest.webmanifest')).json();
    expect(m.name).toContain('PharmaLink');
    // Ink, matching the shell rail and the marketing hero. This pinned the
    // pre-redesign indigo, which the palette retired.
    expect(m.theme_color).toBe('#06121F');
    expect(m.icons.length).toBeGreaterThan(0);
  });
});

test.describe('icons', () => {
  test('favicon and social image are reachable and non-empty', async ({ request }) => {
    for (const [path, type] of [
      ['/favicon.ico', 'image'],
      ['/icon.svg', 'image/svg'],
      ['/apple-icon.png', 'image/png'],
      ['/opengraph-image.png', 'image/png'],
    ] as const) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()['content-type'], path).toContain(type);
      expect(Number(res.headers()['content-length'] ?? '1'), path).toBeGreaterThan(0);
    }
  });
});

test.describe('page metadata', () => {
  test('home has title, description, canonical, OG image and Organization JSON-LD', async ({ page }) => {
    await page.goto('/en');
    await expect(page).toHaveTitle(/PharmaLink Global/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/en$/);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('link[rel="alternate"][hreflang="zh"]')).toHaveCount(1);

    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(ld).toContain('"@type":"Organization"');
    expect(ld).toContain('"@type":"WebSite"');
  });

  test('a product page is SEO-optimised with a specific title and Product JSON-LD', async ({ page }) => {
    // Ibuprofen has a single supplier, so the title is deterministic.
    await page.goto('/en/catalog?q=Ibuprofen');
    await page.getByTestId('product-card').first().click();

    // Title includes the CAS and the supplier — what people search for.
    await expect(page).toHaveTitle(/CAS 15687-27-1/);
    await expect(page).toHaveTitle(/Sun Pharma/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/products\//);

    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(ld).toContain('"@type":"Product"');
    expect(ld).toContain('15687-27-1');
  });

  test('the Chinese homepage carries zh SEO metadata', async ({ page }) => {
    await page.goto('/zh');
    await expect(page).toHaveTitle(/GMP 认证原料药/);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'zh_CN');
  });

  test('private account pages are marked noindex is not required, but must be Disallowed', async ({ request }) => {
    // Belt and braces: the buyer dashboard should redirect unauthenticated
    // crawlers to login, never serve indexable content.
    const res = await request.get('/en/buyer', { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(res.status());
  });
});
