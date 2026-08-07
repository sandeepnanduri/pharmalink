import { prisma } from '@/lib/db';
import { matchScore, type MatchResult } from '@/lib/match-score';
import { parseCertList } from '@/lib/matching';
import { isQuoteValid } from '@/lib/rfq';

/**
 * Side-by-side quote comparison for one RFQ.
 *
 * The point of this screen is not to show the quotes again — the RFQ detail page
 * already lists them. It is to make the DIFFERENCES findable, because that is
 * what a buyer actually does with four quotes and a spreadsheet. So every row
 * carries a `differs` flag computed across the set, and the UI marks those rows.
 *
 * Landed cost is deliberately NOT invented. Freight and duty depend on the
 * incoterm, route and HS code, none of which the platform holds, so the screen
 * compares the quoted unit price and states the incoterm rather than printing a
 * confident total that would be wrong.
 */

export interface CompareRow {
  key: string;
  label: string;
  /** One cell per quote, in the same order as `quotes`. */
  values: (string | null)[];
  /** True when not every quote agrees — the UI highlights these. */
  differs: boolean;
  /** 'good' marks the best cell, when one is objectively better. */
  best?: number | null;
  numeric?: boolean;
}

export interface CompareQuote {
  id: string;
  supplier: string;
  country: string | null;
  unitPrice: number;
  currency: string;
  total: number;
  leadTime: string;
  incoterm: string;
  paymentTerms: string;
  validUntil: Date;
  valid: boolean;
  moqKg: number;
  documents: number;
  certs: string[];
  status: string;
  match: MatchResult;
  vsMarketPct: number | null;
}

export interface CompareData {
  rfq: {
    id: string;
    reference: string;
    productName: string;
    cas: string;
    quantityKg: number;
    requiredBy: Date;
    requiredCerts: string[];
    incoterm: string | null;
    targetPrice: number | null;
    status: string;
  };
  quotes: CompareQuote[];
  rows: CompareRow[];
  marketMedian: number | null;
  awardedQuoteId: string | null;
}

function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Days between now and a date, floored at 0. */
function daysUntil(d: Date): number {
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
}

/** "21 days" / "4 weeks" → days, so lead times from different sellers compare. */
export function leadTimeToDays(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(day|week|month)/i.exec(text ?? '');
  if (!m) {
    const bare = /(\d+)/.exec(text ?? '');
    return bare ? Number(bare[1]) : null;
  }
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return unit === 'day' ? n : unit === 'week' ? n * 7 : n * 30;
}

export async function getQuoteComparison(rfqId: string, buyerOrgId: string): Promise<CompareData | null> {
  const rfq = await prisma.rfq.findUnique({
    where: { id: rfqId },
    include: {
      deal: { select: { quoteId: true } },
      quotes: {
        orderBy: { unitPrice: 'asc' },
        include: {
          _count: { select: { attachments: true } },
          sellerOrg: {
            select: {
              id: true,
              name: true,
              country: true,
              certifications: { where: { status: 'verified' }, select: { name: true } },
            },
          },
        },
      },
    },
  });
  // Ownership is re-checked here, not only in the page — a query that trusts its
  // caller becomes an IDOR the first time it is reused somewhere else.
  if (!rfq || rfq.buyerOrgId !== buyerOrgId) return null;

  // Market median for this molecule, from real quotes across the platform.
  const allQuotes = await prisma.quote.findMany({ where: { rfq: { cas: rfq.cas } }, select: { unitPrice: true } });
  const marketMedian = median(allQuotes.map((q) => q.unitPrice));

  const requiredCerts = parseCertList(rfq.requiredCerts);
  const windowDays = daysUntil(rfq.requiredBy);

  const quotes: CompareQuote[] = rfq.quotes.map((q) => {
    const certs = q.sellerOrg.certifications.map((c) => c.name);
    const leadDays = leadTimeToDays(q.leadTime);
    return {
      id: q.id,
      supplier: q.sellerOrg.name,
      country: q.sellerOrg.country,
      unitPrice: q.unitPrice,
      currency: q.currency,
      total: Math.round(q.unitPrice * rfq.quantityKg * 100) / 100,
      leadTime: q.leadTime,
      incoterm: q.incoterm,
      paymentTerms: q.paymentTerms,
      validUntil: q.validUntil,
      valid: isQuoteValid(q.validUntil),
      moqKg: q.moqKg,
      documents: q._count.attachments,
      certs,
      status: q.status,
      vsMarketPct: marketMedian ? Math.round(((q.unitPrice - marketMedian) / marketMedian) * 1000) / 10 : null,
      match: matchScore({
        requiredCerts,
        heldCerts: certs,
        price: q.unitPrice,
        marketMedian,
        leadTimeDays: leadDays,
        requiredWithinDays: windowDays,
        // Performance history is not yet tracked per supplier; reported as
        // unknown rather than assumed — see match-score coverage.
        responseRate: null,
        onTimeRate: null,
        completedOrders: null,
      }),
    };
  });

  const cell = (fn: (q: CompareQuote) => string | null) => quotes.map(fn);
  const allSame = (vals: (string | null)[]) => new Set(vals.map((v) => v ?? '')).size <= 1;
  const bestBy = (fn: (q: CompareQuote) => number | null, dir: 'min' | 'max') => {
    let idx: number | null = null;
    let bestVal: number | null = null;
    quotes.forEach((q, i) => {
      const v = fn(q);
      if (v == null) return;
      if (bestVal == null || (dir === 'min' ? v < bestVal : v > bestVal)) {
        bestVal = v;
        idx = i;
      }
    });
    return idx;
  };

  const row = (key: string, label: string, values: (string | null)[], best?: number | null, numeric = false): CompareRow => ({
    key,
    label,
    values,
    differs: !allSame(values),
    best: best ?? null,
    numeric,
  });

  const rows: CompareRow[] = [
    row('price', 'Unit price', cell((q) => `${q.currency} ${q.unitPrice.toFixed(2)}/kg`), bestBy((q) => q.unitPrice, 'min'), true),
    row('total', `Total for ${rfq.quantityKg} kg`, cell((q) => `${q.currency} ${q.total.toLocaleString()}`), bestBy((q) => q.total, 'min'), true),
    row('vsMarket', 'vs market median', cell((q) => (q.vsMarketPct == null ? null : `${q.vsMarketPct > 0 ? '+' : ''}${q.vsMarketPct}%`)), bestBy((q) => q.vsMarketPct, 'min'), true),
    row('match', 'Match score', cell((q) => (q.match.disqualified ? 'Not eligible' : q.match.score == null ? null : `${q.match.score}/100`)), bestBy((q) => q.match.score, 'max'), true),
    row('lead', 'Lead time', cell((q) => q.leadTime), bestBy((q) => leadTimeToDays(q.leadTime), 'min')),
    row('moq', 'Minimum order', cell((q) => `${q.moqKg} kg`), bestBy((q) => q.moqKg, 'min'), true),
    row('incoterm', 'Incoterm', cell((q) => q.incoterm)),
    row('payment', 'Payment terms', cell((q) => q.paymentTerms)),
    row('validity', 'Quote valid until', cell((q) => (q.valid ? q.validUntil.toISOString().slice(0, 10) : `${q.validUntil.toISOString().slice(0, 10)} — expired`))),
    row('country', 'Country of supply', cell((q) => q.country)),
    row('certs', 'Verified certificates', cell((q) => (q.certs.length ? q.certs.join(', ') : 'None on file')), bestBy((q) => q.certs.length, 'max')),
    row('docs', 'Documents attached', cell((q) => String(q.documents)), bestBy((q) => q.documents, 'max'), true),
  ];

  return {
    rfq: {
      id: rfq.id,
      reference: rfq.reference,
      productName: rfq.productName,
      cas: rfq.cas,
      quantityKg: rfq.quantityKg,
      requiredBy: rfq.requiredBy,
      requiredCerts,
      incoterm: rfq.incoterm,
      targetPrice: rfq.targetPrice,
      status: rfq.status,
    },
    quotes,
    rows,
    marketMedian,
    awardedQuoteId: rfq.deal?.quoteId ?? null,
  };
}
