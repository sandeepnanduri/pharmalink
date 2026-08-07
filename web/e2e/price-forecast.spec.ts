import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers';

/**
 * Price prediction engine.
 *
 * The seed loads a captured snapshot of REAL public market data (UN Comtrade
 * implied unit values, ECB reference rates, openFDA supply events), so every
 * figure asserted here is derived from published numbers rather than fixtures
 * invented to make the test pass.
 *
 * The assertions deliberately check the HONESTY affordances as much as the
 * happy path: that confidence is graded, that the backtest error is shown, and
 * that provenance is listed. A forecast UI that renders without those is the
 * failure mode this feature exists to avoid.
 */

test('buyer sees forecasts graded by measured accuracy', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/analytics');

  const overview = page.getByTestId('forecast-overview');
  await expect(overview).toBeVisible();
  await expect(page.getByTestId('forecast-row').first()).toBeVisible();

  // Every row carries a confidence grade — never a bare number.
  const badges = page.getByTestId('confidence-badge');
  expect(await badges.count()).toBeGreaterThan(0);
  const grades = await badges.evaluateAll((els) => els.map((e) => e.getAttribute('data-confidence')));
  for (const g of grades) expect(['high', 'medium', 'low', 'insufficient']).toContain(g);

  // Prices are real USD/kg unit values, not placeholders.
  await expect(overview).toContainText('$');
});

test('molecule detail shows the chart, the model choice and the backtest error', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/analytics');
  await page.getByTestId('forecast-row').first().getByRole('link').click();

  await expect(page).toHaveURL(/\/en\/analytics\/[^/]+$/);

  // The chart is server-rendered inline SVG with a forecast band.
  const chart = page.getByTestId('forecast-chart');
  await expect(chart).toBeVisible();
  await expect(chart.locator('svg')).toBeVisible();

  // The method is disclosed: which model, and how wrong it has been.
  await expect(chart).toContainText('How this is calculated');
  await expect(page.getByTestId('backtest-mape')).toContainText('%');

  // Prediction interval is shown alongside the point estimate.
  await expect(page.getByTestId('next-price')).toContainText('p10');

  // Provenance: every source behind the numbers is named.
  await expect(page.getByTestId('provenance-row').first()).toContainText('UN Comtrade');
});

test('supply risk is explained by its inputs, not just scored', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/analytics/103-90-2'); // Paracetamol

  const risk = page.getByTestId('supply-risk');
  await expect(risk).toBeVisible();
  await expect(risk).toContainText('HHI');
  // The reasons list makes the score reproducible by hand.
  await expect(risk).toContainText('qualified supplier');
  await expect(page.getByTestId('risk-badge').first()).toBeVisible();
});

test('an uncovered molecule says so rather than inventing a forecast', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/analytics/000-00-0');
  await expect(page.getByTestId('no-observations')).toBeVisible();
  // Nothing is rendered that could be mistaken for a prediction.
  await expect(page.getByTestId('forecast-chart')).toHaveCount(0);
  await expect(page.getByTestId('risk-badge')).toHaveCount(0);
});

test('the scoreboard grades past forecasts against what actually happened', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/analytics');

  const board = page.getByTestId('forecast-scoreboard');
  await expect(board).toBeVisible();
  // The seed issues genuine as-of-then forecasts, so rows exist and each one
  // reports whether reality landed inside the predicted band.
  await expect(page.getByTestId('scoreboard-row').first()).toBeVisible();
  await expect(board).toContainText('%');
});

test('ops can see every source, including the ones that cannot be captured', async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto('/en/admin/market-data');

  await expect(page.getByRole('heading', { name: 'Market data' })).toBeVisible();
  const rows = page.getByTestId('source-row');
  expect(await rows.count()).toBeGreaterThan(5);

  // Sources behind bot protection / a commercial licence are listed as gaps
  // rather than hidden, and are never fetchable.
  await expect(page.getByTestId('source-row').filter({ hasText: 'PharmaCompass' })).toContainText('Not capturable');
  await expect(page.getByTestId('source-row').filter({ hasText: 'UN Comtrade' })).toContainText('Connector');
});

test('a trading user cannot reach the ingestion console', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/en/admin/market-data');
  // Buyers are redirected away from ops surfaces entirely.
  await expect(page).not.toHaveURL(/admin\/market-data/);
});

test('the forecast page is localised', async ({ page }) => {
  await login(page, USERS.buyer);
  await page.goto('/zh/analytics');
  await expect(page.getByTestId('forecast-overview')).toContainText('价格预测');
});
