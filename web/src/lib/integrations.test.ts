import { describe, it, expect } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  bearerFromHeader,
  signWebhook,
  verifyWebhook,
  hasScope,
  subscribes,
} from './integrations';

describe('API keys', () => {
  it('produces a prefixed key and stores only its hash', () => {
    const { raw, prefix, hashedKey } = generateApiKey();
    expect(raw.startsWith('plk_live_')).toBe(true);
    expect(prefix).toBe(raw.slice(0, 16));
    // The hash is deterministic for the raw key, and is NOT the key itself.
    expect(hashedKey).toBe(hashApiKey(raw));
    expect(hashedKey).not.toContain(raw);
    expect(hashedKey).toHaveLength(64); // sha256 hex
  });

  it('never generates the same key twice', () => {
    expect(generateApiKey().raw).not.toBe(generateApiKey().raw);
  });

  it('parses a Bearer header and rejects malformed ones', () => {
    expect(bearerFromHeader('Bearer plk_live_abc')).toBe('plk_live_abc');
    expect(bearerFromHeader('bearer  plk_live_abc ')).toBe('plk_live_abc');
    expect(bearerFromHeader('plk_live_abc')).toBeNull();
    expect(bearerFromHeader(null)).toBeNull();
  });
});

describe('webhook signing', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ event: 'rfq.posted', id: 'rfq_1' });

  it('verifies its own signature', () => {
    expect(verifyWebhook(secret, body, signWebhook(secret, body))).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = signWebhook(secret, body);
    expect(verifyWebhook(secret, body + ' ', sig)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifyWebhook(secret, body, signWebhook('other', body))).toBe(false);
  });

  it('does not throw on a length-mismatched signature', () => {
    expect(verifyWebhook(secret, body, 'short')).toBe(false);
  });
});

describe('scopes & subscriptions', () => {
  it('checks a space-separated scope grant', () => {
    expect(hasScope('catalog:read rfq:read', 'rfq:read')).toBe(true);
    expect(hasScope('catalog:read', 'rfq:read')).toBe(false);
    expect(hasScope(null, 'catalog:read')).toBe(false);
  });

  it('matches webhook subscriptions, including wildcard', () => {
    expect(subscribes('*', 'rfq.posted')).toBe(true);
    expect(subscribes('rfq.posted,quote.received', 'quote.received')).toBe(true);
    expect(subscribes('org.verified', 'rfq.posted')).toBe(false);
  });
});
