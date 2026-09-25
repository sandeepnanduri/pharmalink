import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Escrow integration — outbound calls to a payment processor's escrow-style
 * hold/release capability. Gated entirely on environment variable presence,
 * same pattern as lib/whatsapp.server.ts and auth.ts's googleEnabled()/
 * samlEnabled(): this code is correct and testable today with zero live
 * credentials, and simply no-ops until real keys are set.
 *
 * The platform's own default posture is unchanged by this file existing —
 * see lib/plans.ts's "REVENUE MODEL: subscription only" comment. This is an
 * OPT-IN capability: even once enabled, the named third-party provider
 * (Stripe or Razorpay) holds the money, never PharmaLink itself. Escrow rows
 * are PharmaLink's record of what the provider reports, not custody.
 *
 * Two providers, checked independently — Stripe Connect's real hold/release
 * primitive is a PaymentIntent created with `capture_method: 'manual'`
 * (authorize now, capture — i.e. release — later); Razorpay's escrow product
 * is contract-negotiated and its exact request shape should be confirmed
 * against the account's own API docs before going live — the Orders API
 * shape used here is Razorpay's well-documented general-purpose primitive,
 * a reasonable placeholder until that contract exists.
 */

export function stripeConnectEnabled(): boolean {
  return !!process.env.STRIPE_CONNECT_SECRET_KEY;
}

export function razorpayEscrowEnabled(): boolean {
  return !!process.env.RAZORPAY_ESCROW_KEY_ID && !!process.env.RAZORPAY_ESCROW_KEY_SECRET;
}

export function escrowEnabled(): boolean {
  return stripeConnectEnabled() || razorpayEscrowEnabled();
}

/** Mid-point of the product roadmap's published 2–3.5% platform-fee range. */
export const PLATFORM_FEE_RATE = 0.025;

type EscrowProvider = 'stripe_connect' | 'razorpay_escrow';

function activeProvider(): EscrowProvider | null {
  if (stripeConnectEnabled()) return 'stripe_connect';
  if (razorpayEscrowEnabled()) return 'razorpay_escrow';
  return null;
}

function razorpayBasicAuth(): string {
  const credentials = `${process.env.RAZORPAY_ESCROW_KEY_ID}:${process.env.RAZORPAY_ESCROW_KEY_SECRET}`;
  return Buffer.from(credentials).toString('base64');
}

/**
 * In-app notification for both parties to a deal — a small, self-contained
 * duplicate of actions.ts's private notifyOrg (that function isn't
 * exported; every *-actions.ts file in this codebase keeps its own such
 * helper rather than sharing one, per its own header comment). No WhatsApp
 * fan-out here deliberately — an escrow state change is a lower-urgency
 * update than the primary in-app notifications already cover.
 */
async function notifyDealParties(dealId: string, kind: 'escrow.funded' | 'escrow.released' | 'escrow.failed', title: string): Promise<void> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { rfq: { select: { buyerOrgId: true } }, quote: { select: { sellerOrgId: true } } },
  });
  if (!deal) return;
  const users = await prisma.user.findMany({
    where: { orgId: { in: [deal.rfq.buyerOrgId, deal.quote.sellerOrgId] }, active: true, deletedAt: null },
    select: { id: true },
  });
  if (!users.length) return;
  await prisma.notification.createMany({ data: users.map((u) => ({ userId: u.id, kind, title })) });
}

async function callProvider(provider: EscrowProvider, path: string, body: Record<string, unknown>): Promise<{ ok: boolean; ref: string | null; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res =
      provider === 'stripe_connect'
        ? await fetch(`https://api.stripe.com/v1${path}`, {
            method: 'POST',
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
              authorization: `Bearer ${process.env.STRIPE_CONNECT_SECRET_KEY}`,
            },
            body: new URLSearchParams(body as Record<string, string>),
            signal: controller.signal,
          })
        : await fetch(`https://api.razorpay.com/v1${path}`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Basic ${razorpayBasicAuth()}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, ref: typeof data.id === 'string' ? data.id : null, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Initiates escrow for a just-created Deal — no-op (returns null) when
 * disabled. Best-effort and non-blocking, same discipline as
 * sendWhatsAppTemplate: an escrow-initiation failure must never fail the
 * buyer's award action that triggered it. Every real attempt (success or
 * failure) writes exactly one Escrow row; a no-op writes none, since
 * nothing was attempted.
 */
export async function initiateEscrow(
  dealId: string,
  tradeValue: number,
  commissionAmount: number,
  platformFee: number,
  currency: string
): Promise<void> {
  if (!escrowEnabled()) return; // no-op until real credentials exist — nothing to log
  const provider = activeProvider();
  if (!provider) return; // unreachable given escrowEnabled() above; narrows the type

  try {
    const amountMinor = Math.round(tradeValue * 100);
    const result = await callProvider(
      provider,
      provider === 'stripe_connect' ? '/payment_intents' : '/orders',
      provider === 'stripe_connect'
        ? { amount: String(amountMinor), currency: currency.toLowerCase(), capture_method: 'manual', 'metadata[dealId]': dealId }
        : { amount: amountMinor, currency: currency.toUpperCase(), receipt: dealId, notes: { dealId } }
    );
    await prisma.escrow.create({
      data: {
        dealId,
        provider,
        providerRef: result.ref,
        tradeValue,
        commissionAmount,
        platformFee,
        currency,
        status: result.ok ? 'funded' : 'failed',
        fundedAt: result.ok ? new Date() : null,
      },
    });
    await notifyDealParties(dealId, result.ok ? 'escrow.funded' : 'escrow.failed', result.ok ? 'Escrow funded' : 'Escrow funding failed');
  } catch {
    await prisma.escrow
      .create({
        data: { dealId, provider, tradeValue, commissionAmount, platformFee, currency, status: 'failed', providerRef: null },
      })
      .catch(() => undefined);
    await notifyDealParties(dealId, 'escrow.failed', 'Escrow funding failed').catch(() => undefined);
  }
}

/**
 * Releases a funded escrow — Stripe: capture the held PaymentIntent.
 * Razorpay: contract-specific release call, shaped the same way pending
 * that contract. No-op if the Escrow row isn't in 'funded' status (nothing
 * to release), or if escrow isn't enabled.
 */
export async function releaseEscrow(escrowId: string): Promise<void> {
  if (!escrowEnabled()) return;

  const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } });
  if (!escrow || escrow.status !== 'funded' || !escrow.providerRef) return;

  try {
    const provider = escrow.provider as EscrowProvider;
    const result = await callProvider(
      provider,
      provider === 'stripe_connect' ? `/payment_intents/${escrow.providerRef}/capture` : `/payments/${escrow.providerRef}/capture`,
      provider === 'stripe_connect' ? {} : { amount: Math.round(escrow.tradeValue * 100), currency: escrow.currency.toUpperCase() }
    );
    await prisma.escrow.update({
      where: { id: escrowId },
      data: result.ok ? { status: 'released', releasedAt: new Date() } : { status: 'failed' },
    });
    await notifyDealParties(escrow.dealId, result.ok ? 'escrow.released' : 'escrow.failed', result.ok ? 'Escrow released' : 'Escrow release failed');
  } catch {
    await prisma.escrow.update({ where: { id: escrowId }, data: { status: 'failed' } }).catch(() => undefined);
    await notifyDealParties(escrow.dealId, 'escrow.failed', 'Escrow release failed').catch(() => undefined);
  }
}
