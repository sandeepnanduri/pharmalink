import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `server-only` throws when imported outside a server runtime; stub it for tests.
vi.mock('server-only', () => ({}));

import { whatsappEnabled } from './whatsapp.server';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('whatsappEnabled (same env-var-presence gate as auth.ts googleEnabled/samlEnabled)', () => {
  it('is false with no credentials', () => {
    expect(whatsappEnabled()).toBe(false);
  });

  it('is false with only one of the two required vars set', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    expect(whatsappEnabled()).toBe(false);
  });

  it('is true once both are set', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'id';
    expect(whatsappEnabled()).toBe(true);
  });
});

/**
 * sendWhatsAppTemplate touches prisma and fetch, neither of which this repo
 * mocks for a unit test (no DB-backed harness — same situation every other
 * prisma-touching function in lib/*.server.ts is already in). Pinned by
 * source-scan instead, same convention actions.partner-boundary.test.ts
 * already establishes: the no-op-when-disabled guarantee must be
 * STRUCTURAL — whatsappEnabled() checked and returned on before any
 * fetch/prisma call — not just true by coincidence of current logic.
 */
describe('sendWhatsAppTemplate (structural no-op-when-disabled)', () => {
  it('checks whatsappEnabled() and returns before touching fetch or prisma', () => {
    const src = readFileSync(new URL('./whatsapp.server.ts', import.meta.url), 'utf8');
    const start = src.indexOf('export async function sendWhatsAppTemplate');
    const body = src.slice(start);
    const guardIndex = body.indexOf('if (!whatsappEnabled()) return;');
    const fetchIndex = body.indexOf('fetch(');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(fetchIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(fetchIndex);
  });
});
