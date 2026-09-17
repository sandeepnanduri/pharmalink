import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Source-scan pins for the inbound webhook — same "no DB-backed harness for
 * a route file" situation actions.partner-boundary.test.ts is already in.
 * verifyWebhook's own crypto correctness is already unit-tested directly in
 * lib/integrations.test.ts; this only pins that the route actually REUSES
 * it rather than rolling its own comparison.
 */
describe('WhatsApp inbound webhook (deliberately receive-and-log only, no action-triggering)', () => {
  const src = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');

  it('verifies signatures with the existing verifyWebhook helper, not a hand-rolled comparison', () => {
    expect(src).toContain("import { verifyWebhook } from '@/lib/integrations'");
    expect(src).toContain('verifyWebhook(appSecret, rawBody, signature)');
  });

  it('refuses to process a POST without WHATSAPP_APP_SECRET configured', () => {
    expect(src).toMatch(/if \(!appSecret\) return new Response\('Not configured', \{ status: 503 \}\);/);
  });

  it('never calls a state-changing action — only logs a WhatsAppDelivery row', () => {
    // No import from lib/actions.ts or lib/partner-actions.ts anywhere in
    // this file — an inbound message can only ever be logged, not acted on.
    expect(src).not.toContain("from '@/lib/actions'");
    expect(src).not.toContain("from '@/lib/partner-actions'");
  });
});

describe('updateProfileAction (opt-in safety)', () => {
  it('never persists whatsappOptIn true without a phone on file', () => {
    const actionsSrc = readFileSync(new URL('../../../../lib/actions.ts', import.meta.url), 'utf8');
    const start = actionsSrc.indexOf('export async function updateProfileAction');
    const next = actionsSrc.indexOf('\nexport ', start + 1);
    const body = actionsSrc.slice(start, next === -1 ? undefined : next);
    expect(body).toMatch(/whatsappOptIn\s*=\s*formData\.get\('whatsappOptIn'\)\s*===\s*'on'\s*&&\s*!!phone/);
  });
});
