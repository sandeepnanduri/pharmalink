import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The activity feed is public. Two invariants protect it, and both are the kind
 * of thing that regresses silently during a refactor — so they are asserted
 * against the source itself rather than only through the UI.
 */
const SOURCE = readFileSync(path.join(process.cwd(), 'src/lib/activity.ts'), 'utf8');

describe('market activity feed — buyer anonymity', () => {
  it('never selects the buyer organization name', () => {
    // Selecting buyerOrg.name would put "Cipla is sourcing 2,000 kg" on a public
    // page — exposing a named pharma company's sourcing intent to competitors.
    const rfqSelect = SOURCE.slice(SOURCE.indexOf('prisma.rfq.findMany'), SOURCE.indexOf('prisma.deal.findMany'));
    expect(rfqSelect).toContain('buyerOrg');
    expect(rfqSelect).toContain('country: true');
    expect(rfqSelect, 'buyer name must never be selected for the public feed').not.toMatch(/buyerOrg:\s*{\s*select:\s*{[^}]*name:\s*true/);
  });

  it('sets actor to null on every buyer-side event', () => {
    const rfqMap = SOURCE.slice(SOURCE.indexOf("kind: 'rfq' as const"), SOURCE.indexOf("kind: 'deal' as const"));
    expect(rfqMap).toContain('actor: null');

    const dealMap = SOURCE.slice(SOURCE.indexOf("kind: 'deal' as const"));
    expect(dealMap).toContain('actor: null');
  });

  it('does not name either party on a closed deal', () => {
    const dealSelect = SOURCE.slice(SOURCE.indexOf('prisma.deal.findMany'), SOURCE.indexOf('const items'));
    expect(dealSelect).not.toContain('sellerOrg');
    expect(dealSelect).not.toContain('buyerOrg');
  });
});

describe('market activity feed — real data only', () => {
  it('only ever reads from the database, never fabricates rows', () => {
    // A young marketplace is tempted to invent liquidity. Guard against a
    // "sample"/"demo" feed being slipped in (BACKLOG R12).
    expect(SOURCE).not.toMatch(/Math\.random|faker|SAMPLE_ACTIVITY|MOCK_/i);
    expect(SOURCE).toContain('prisma.product.findMany');
    expect(SOURCE).toContain('prisma.rfq.findMany');
  });

  it('only surfaces listings from verified suppliers', () => {
    const listings = SOURCE.slice(SOURCE.indexOf('prisma.product.findMany'), SOURCE.indexOf('prisma.organization.findMany'));
    expect(listings).toContain("status: 'live'");
    expect(listings).toContain("org: { status: 'verified' }");
  });
});

describe('news', () => {
  it('only returns published posts for the requested locale', () => {
    const news = SOURCE.slice(SOURCE.indexOf('getLatestNews'));
    expect(news).toContain("status: 'published'");
    expect(news).toContain('locale');
    expect(news).toContain('publishedAt: { not: null }');
  });
});
