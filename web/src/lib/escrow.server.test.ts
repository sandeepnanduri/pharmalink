import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `server-only` throws when imported outside a server runtime; stub it for tests.
vi.mock('server-only', () => ({}));

import { stripeConnectEnabled, razorpayEscrowEnabled, escrowEnabled } from './escrow.server';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.STRIPE_CONNECT_SECRET_KEY;
  delete process.env.RAZORPAY_ESCROW_KEY_ID;
  delete process.env.RAZORPAY_ESCROW_KEY_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('stripeConnectEnabled / razorpayEscrowEnabled (same env-var-presence gate as auth.ts googleEnabled/samlEnabled)', () => {
  it('stripeConnectEnabled is false with no credentials, true once set', () => {
    expect(stripeConnectEnabled()).toBe(false);
    process.env.STRIPE_CONNECT_SECRET_KEY = 'sk_test_x';
    expect(stripeConnectEnabled()).toBe(true);
  });

  it('razorpayEscrowEnabled is false with only one of the two required vars set', () => {
    process.env.RAZORPAY_ESCROW_KEY_ID = 'rzp_test_x';
    expect(razorpayEscrowEnabled()).toBe(false);
  });

  it('razorpayEscrowEnabled is true once both are set', () => {
    process.env.RAZORPAY_ESCROW_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_ESCROW_KEY_SECRET = 'secret';
    expect(razorpayEscrowEnabled()).toBe(true);
  });
});

describe('escrowEnabled (OR across providers)', () => {
  it('is false with no credentials for either provider', () => {
    expect(escrowEnabled()).toBe(false);
  });

  it('is true when only Stripe Connect is configured', () => {
    process.env.STRIPE_CONNECT_SECRET_KEY = 'sk_test_x';
    expect(escrowEnabled()).toBe(true);
  });

  it('is true when only Razorpay Escrow is fully configured', () => {
    process.env.RAZORPAY_ESCROW_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_ESCROW_KEY_SECRET = 'secret';
    expect(escrowEnabled()).toBe(true);
  });
});

/**
 * Same source-scan convention actions.partner-boundary.test.ts and
 * whatsapp.server.test.ts establish: no fetch/prisma mock exists in this
 * repo, so the no-op-when-disabled guarantee is pinned structurally — the
 * enabled-check must appear, textually, before the first fetch/prisma call
 * in each function's body.
 */
describe('initiateEscrow / releaseEscrow (structural no-op-when-disabled)', () => {
  const src = readFileSync(new URL('./escrow.server.ts', import.meta.url), 'utf8');

  it('initiateEscrow checks escrowEnabled() and returns before touching prisma or callProvider', () => {
    const start = src.indexOf('export async function initiateEscrow');
    const next = src.indexOf('\nexport ', start + 1);
    const body = src.slice(start, next === -1 ? undefined : next);
    const guardIndex = body.indexOf('if (!escrowEnabled()) return;');
    const prismaIndex = body.indexOf('prisma.escrow.create');
    const callIndex = body.indexOf('callProvider(');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(prismaIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(prismaIndex);
    expect(guardIndex).toBeLessThan(callIndex);
  });

  it('releaseEscrow checks escrowEnabled() and returns before touching prisma or callProvider', () => {
    const start = src.indexOf('export async function releaseEscrow');
    const body = src.slice(start);
    const guardIndex = body.indexOf('if (!escrowEnabled()) return;');
    const findIndex = body.indexOf('prisma.escrow.findUnique');
    const callIndex = body.indexOf('callProvider(');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(findIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(findIndex);
    expect(guardIndex).toBeLessThan(callIndex);
  });
});
