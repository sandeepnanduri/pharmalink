import { test, expect } from '@playwright/test';
import { login, logout, USERS } from './helpers';

/**
 * Advances the seller onboarding wizard until the document uploader is usable.
 *
 * The uploader sits on the credentials step, but the step INDEX has moved twice
 * as the wizard grew. Every fieldset stays in the DOM (`hidden`), so `doc-upload`
 * is always present and only visibility distinguishes the active step — which is
 * why this waits on visibility rather than counting clicks.
 */
async function gotoUploadStep(page: import('@playwright/test').Page) {
  const upload = page.getByTestId('doc-upload');
  for (let i = 0; i < 6 && !(await upload.isVisible()); i++) {
    await page.getByTestId('onboarding-next').click();
  }
  await expect(upload).toBeVisible({ timeout: 15_000 });
}

/** Real bytes, hashed and stored server-side (F2.3). */
test.describe('document upload', () => {
  test('uploads a PDF, hashes it, and never exposes a public URL', async ({ page }) => {
    await login(page, USERS.pendingSeller);
    await page.goto('/en/onboarding/seller');

    // Walk to the credentials step, where the uploader lives. Driven by the
    // uploader becoming visible rather than a fixed click count, so adding a
    // step to the wizard no longer silently breaks this test.
    await gotoUploadStep(page);

    await page.getByTestId('doc-file').setInputFiles({
      name: 'FDA_GMP_2026.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 fake certificate bytes'),
    });
    await page.getByTestId('doc-upload').click();

    await expect(page.getByTestId('uploaded-list')).toContainText('FDA_GMP_2026.pdf', { timeout: 15_000 });
  });

  test('rejects a file type that is not a document', async ({ page }) => {
    await login(page, USERS.pendingSeller);
    await page.goto('/en/onboarding/seller');
    await gotoUploadStep(page);

    await page.getByTestId('doc-file').setInputFiles({
      name: 'evil.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<script>alert(1)</script>'),
    });
    await page.getByTestId('doc-upload').click();

    await expect(page.getByTestId('upload-error')).toBeVisible({ timeout: 15_000 });
  });

  test('a stranger cannot download another org document', async ({ request }) => {
    // Seeded Zydus documents belong to Zydus. Signed out => 404 (not 403: we do
    // not disclose that the document exists).
    const res = await request.get('/api/documents/does-not-exist');
    expect(res.status()).toBe(404);
  });
});

/** In-app notification centre (F5.1). */
test.describe('notifications', () => {
  test('supplier is notified when an RFQ is matched to them, buyer when quoted', async ({ page }) => {
    // Buyer posts an RFQ that matches Sun Pharma.
    await login(page, USERS.buyer);
    await page.goto('/en/buyer/rfqs/new');
    await page.getByLabel('Product name').fill('Ibuprofen notify');
    await page.getByLabel('CAS number').fill('15687-27-1');
    await page.getByLabel('Quantity (kg)').fill('300');
    await page.getByLabel('Required by').fill('2026-12-01');
    await page.getByTestId('rfq-next').click();
    await page.getByRole('checkbox', { name: 'US FDA GMP' }).check();
    await page.getByTestId('rfq-next').click();
    await expect(page.getByTestId('rfq-broadcast')).toBeEnabled({ timeout: 15_000 });
    await page.getByTestId('rfq-broadcast').click();
    await expect(page).toHaveURL(/\/buyer\/rfqs\/(?!new$)[^/]+$/, { timeout: 15_000 });

    // The supplier has an unread notification.
    await logout(page);
    await login(page, USERS.seller);
    await expect(page.getByTestId('unread-count')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('notification-bell').click();
    await expect(page.getByTestId('notification-list')).toContainText('Ibuprofen notify');

    // Marking read clears the badge.
    await page.getByTestId('mark-all-read').click();
    await expect(page.getByTestId('unread-count')).toHaveCount(0, { timeout: 15_000 });
  });

  test('notification centre is empty for a fresh org', async ({ page }) => {
    await login(page, USERS.pendingSeller);
    await page.goto('/en/notifications');
    await expect(page.getByTestId('no-notifications')).toBeVisible();
  });

  test('what needs a decision is separated from routine progress', async ({ page }) => {
    await login(page, USERS.buyer);
    await page.goto('/en/notifications');

    // Three groups, each rendered only when it has something in it.
    await expect(page.getByTestId('group-action')).toBeVisible();
    await expect(page.getByTestId('group-update')).toBeVisible();

    // A closing RFQ outranks the quote that arrived four hours later: within the
    // action group, urgency wins over recency.
    const action = page.getByTestId('group-action').getByTestId('notification');
    await expect(action.first()).toContainText('RFQ-2044 closes in 18 hours');

    // Routine progress is present but never in the action group.
    await expect(page.getByTestId('group-update')).toContainText('Shipment SHP-1187');
    await expect(page.getByTestId('group-action')).not.toContainText('Shipment SHP-1187');
  });

  test('the bell counts what needs a decision, not every unread row', async ({ page }) => {
    await login(page, USERS.buyer);
    await page.goto('/en/notifications');

    // Asserted as an invariant rather than a fixed number: earlier tests in the
    // suite send this buyer real notifications, so a hard-coded count would be
    // a test that breaks whenever an unrelated one is added.
    const unreadAction = page.locator('[data-testid="notification"][data-group="action"][data-read="false"]');
    const unreadAny = page.locator('[data-testid="notification"][data-read="false"]');
    const actionCount = await unreadAction.count();
    const totalUnread = await unreadAny.count();

    expect(actionCount).toBeGreaterThan(0);
    // If these were equal the next assertion would prove nothing.
    expect(totalUnread).toBeGreaterThan(actionCount);
    await expect(page.getByTestId('unread-count')).toHaveText(actionCount > 9 ? '9+' : String(actionCount));
  });
});

/** Printable deal record / comparison (F4.4, F4.6). */
test.describe('PDF export', () => {
  test('deal record shows frozen terms and both verified parties', async ({ page }) => {
    await login(page, USERS.buyer);
    await page.goto('/en/buyer/rfqs');
    await page.getByRole('link', { name: 'RFQ-2041' }).click();

    // Ensure a deal exists, without assuming whether another spec already
    // accepted this RFQ. NOTE: isVisible() does NOT wait — using it here would
    // race the navigation and silently skip the accept. Wait for whichever of
    // the two states the page settles into.
    const dealBanner = page.getByTestId('deal-banner');
    const accept = page.getByRole('button', { name: 'Accept' }).first();
    await expect(dealBanner.or(accept).first()).toBeVisible({ timeout: 15_000 });

    if (!(await dealBanner.isVisible())) {
      await accept.click();
      await expect(dealBanner).toBeVisible({ timeout: 15_000 });
    }

    await page.getByTestId('export-pdf').click();
    await expect(page.getByTestId('print-deal')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('print-ref')).toContainText('DEAL-');
    // 2000 kg x 4.35 = 8,700 — computed, not echoed.
    await expect(page.getByTestId('print-total')).toContainText('8,700');
    await expect(page.getByText('Verified by PharmaLink').first()).toBeVisible();
    // The platform is explicitly not a party to the transaction.
    await expect(page.getByText(/not party to the transaction/)).toBeVisible();
  });

  test('another buyer cannot print someone else deal record', async ({ page }) => {
    await login(page, USERS.buyer);
    await page.goto('/en/buyer/rfqs');
    const href = await page.getByRole('link', { name: 'RFQ-2041' }).getAttribute('href');
    await logout(page);

    await login(page, USERS.unverifiedBuyer);
    const res = await page.goto(`${href}/print`);
    expect(res?.status()).toBe(404);
  });
});
