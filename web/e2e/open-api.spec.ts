import { test, expect } from '@playwright/test';

/**
 * The open REST API partners integrate against (/api/v1). The seed provisions a
 * fixed demo key bound to the Cipla org with all read scopes:
 *   plk_live_demoOnlyKey0000000000000000000
 * These tests assert authentication, the discovery document, and each endpoint.
 */
const DEMO_KEY = 'plk_live_demoOnlyKey0000000000000000000';
const auth = { Authorization: `Bearer ${DEMO_KEY}` };

test('discovery document is public and lists endpoints + scopes', async ({ request }) => {
  const res = await request.get('/api/v1');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.name).toContain('PharmaLink');
  expect(body.scopes).toContain('catalog:read');
  expect(body.endpoints.products).toContain('/api/v1/products');
});

test('products require a valid key', async ({ request }) => {
  // No key.
  const noKey = await request.get('/api/v1/products');
  expect(noKey.status()).toBe(401);

  // Garbage key.
  const badKey = await request.get('/api/v1/products', { headers: { Authorization: 'Bearer plk_live_notarealkey' } });
  expect(badKey.status()).toBe(401);
});

test('valid key reads the live catalogue', async ({ request }) => {
  const res = await request.get('/api/v1/products?q=Paracetamol', { headers: auth });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.count).toBeGreaterThan(0);
  expect(Array.isArray(body.data)).toBe(true);
  // Only verified suppliers' live products are exposed.
  for (const p of body.data) {
    expect(p.org?.name).toBeTruthy();
    expect(p.name).toBeTruthy();
  }
});

test('valid key lists verified suppliers', async ({ request }) => {
  const res = await request.get('/api/v1/suppliers', { headers: auth });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.count).toBeGreaterThan(0);
});

test('rfqs endpoint is org-scoped to the key owner', async ({ request }) => {
  const res = await request.get('/api/v1/rfqs', { headers: auth });
  expect(res.status()).toBe(200);
  const body = await res.json();
  // The Cipla org owns the seeded RFQ-2041.
  expect(body.data.some((r: { reference: string }) => r.reference === 'RFQ-2041')).toBe(true);
  // Status is the DERIVED status (never a raw 'accepted' — that rename is the
  // whole point of the lifecycle fix).
  for (const r of body.data) {
    expect(['open', 'quoted', 'awarded', 'cancelled', 'expired']).toContain(r.status);
  }
});
