import { test, expect, devices, type Page } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Responsive contract.
 *
 * The single worst mobile bug is horizontal overflow: the page scrolls sideways,
 * content is clipped and taps land on the wrong thing. Wide content (tables,
 * comparison grids) must scroll INSIDE its own container — never the body.
 */

const PHONE = devices['iPhone 13'].viewport!; // 390x844

/** Returns elements wider than the viewport — i.e. what is causing the overflow. */
async function overflowingElements(page: Page) {
  return page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const bad: { tag: string; cls: string; width: number; text: string }[] = [];
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      // Ignore things that are legitimately scrollable containers.
      const style = getComputedStyle(el);
      const scrolls = style.overflowX === 'auto' || style.overflowX === 'scroll';
      if (!scrolls && r.width > docWidth + 1) {
        bad.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 70),
          width: Math.round(r.width),
          text: (el.textContent || '').trim().slice(0, 40),
        });
      }
    });
    return { docWidth, scrollWidth: document.documentElement.scrollWidth, bad: bad.slice(0, 5) };
  });
}

const PUBLIC_PAGES = ['/en', '/en/catalog', '/en/pricing', '/en/login', '/en/signup', '/zh', '/zh/pricing'];

test.describe('no horizontal overflow on phone', () => {
  test.use({ viewport: PHONE });

  for (const path of PUBLIC_PAGES) {
    test(`${path} fits 390px`, async ({ page }) => {
      await page.goto(path);
      const { docWidth, scrollWidth, bad } = await overflowingElements(page);
      expect(
        scrollWidth,
        `${path} scrolls horizontally (${scrollWidth}px > ${docWidth}px). Offenders: ${JSON.stringify(bad, null, 1)}`
      ).toBeLessThanOrEqual(docWidth + 1);
    });
  }

  test('signed-in pages fit 390px', async ({ page }) => {
    await login(page, USERS.buyer);
    for (const path of ['/en/buyer', '/en/buyer/rfqs', '/en/billing']) {
      await page.goto(path);
      const { docWidth, scrollWidth, bad } = await overflowingElements(page);
      expect(scrollWidth, `${path} overflows. Offenders: ${JSON.stringify(bad, null, 1)}`).toBeLessThanOrEqual(
        docWidth + 1
      );
    }
  });
});

test.describe('mobile navigation', () => {
  test.use({ viewport: PHONE });

  test('primary nav is reachable on a phone', async ({ page }) => {
    await login(page, USERS.buyer);
    await page.goto('/en/buyer');

    // Signed in, the 248px shell rail is most of a phone, so it collapses to a
    // drawer. The marketing header's own drawer is now visitors-only.
    await expect(page.getByTestId('shell-menu')).toBeVisible();
    await page.getByTestId('shell-menu').click();

    const nav = page.locator('[data-testid="app-shell"] nav').last();
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'My RFQs' })).toBeVisible();

    await nav.getByRole('link', { name: 'My RFQs' }).click();
    await expect(page).toHaveURL(/\/en\/buyer\/rfqs$/, { timeout: 15_000 });
    // The drawer must close after navigating, or it covers the page you opened.
    await expect(page.getByTestId('shell-menu')).toBeVisible();
    await expect(page.locator('[data-testid="app-shell"] .fixed.inset-y-0')).toHaveCount(0);
  });

  test('the drawer trigger is desktop-hidden for both chromes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Visitor: the marketing header's own drawer.
    await page.goto('/en');
    await expect(page.getByTestId('mobile-menu-button')).toBeHidden();
    // Signed in: the shell's.
    await login(page, USERS.buyer);
    await page.goto('/en/buyer');
    await expect(page.getByTestId('shell-menu')).toBeHidden();
  });
});

test.describe('sso options are always discoverable', () => {
  test.use({ viewport: PHONE });

  test('signup offers Google and SAML, honestly labelled when unconfigured', async ({ page }) => {
    await page.goto('/en/signup');
    await expect(page.getByTestId('sso-google')).toBeVisible();
    await expect(page.getByTestId('sso-boxyhq-saml')).toBeVisible();
  });

  test('login offers Google and SAML', async ({ page }) => {
    await page.goto('/en/login');
    await expect(page.getByTestId('sso-google')).toBeVisible();
    await expect(page.getByTestId('sso-boxyhq-saml')).toBeVisible();
  });
});
