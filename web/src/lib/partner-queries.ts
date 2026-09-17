/**
 * Sourcing Partner channel — reads (EPIC N7).
 *
 * Paired with lib/partner.ts (pure decision logic) and lib/partner-actions.ts
 * (mutations), same *.ts/*-actions.ts/*-queries.ts split as the rest of the
 * codebase (see lib/rfq.ts + lib/compare-queries.ts for the read-path
 * precedent this follows).
 */
import { prisma } from '@/lib/db';
import {
  canActFor,
  hasScope,
  withinDays,
  ACTIVATION_WINDOW_DAYS,
  STREAK_WINDOW_DAYS,
  STREAK_TARGET,
  BREADTH_TIERS,
  REFERRAL_TARGET,
  INCENTIVE_REWARD_USD,
  type RepresentationScope,
} from '@/lib/partner';
import { certExpiryLevel, needsAttention } from '@/lib/compliance';
import { effectiveRfqStatus, canReceiveQuotes } from '@/lib/rfq';
import { getQuoteComparison } from '@/lib/compare-queries';

/** The live PartnerRepresentation row (if any) a partner org holds over a principal org. */
export async function getActiveRepresentation(partnerOrgId: string, principalOrgId: string) {
  const partner = await prisma.partner.findUnique({ where: { orgId: partnerOrgId }, select: { id: true } });
  if (!partner) return null;
  return prisma.partnerRepresentation.findUnique({
    where: { partnerId_orgId: { partnerId: partner.id, orgId: principalOrgId } },
  });
}

/**
 * Resolves who an RFQ/quote-drafting action is really for.
 *
 * - No `actingForOrgId`, or it equals the caller's own org: the caller is
 *   acting for themselves, exactly like today — `partnerId: null`.
 * - Otherwise: the caller must be a partner (have a Partner row for their own
 *   org) with a live, non-revoked PartnerRepresentation over `actingForOrgId`
 *   carrying `scope`. Anything short of that returns null — no partial credit.
 *
 * The caller (lib/actions.ts) is responsible for treating a null result as
 * `{error:'unauthorized'}` and for using `targetOrgId`, never `userOrgId`,
 * for every downstream plan/quota/self-dealing/broadcast check — see the
 * PARTNER BOUNDARY comment above acceptQuoteAction, which this function is
 * never called from.
 */
export async function resolveActingOrgId(
  userOrgId: string,
  actingForOrgId: string | null | undefined,
  scope: RepresentationScope
): Promise<{ targetOrgId: string; partnerId: string | null } | null> {
  if (!actingForOrgId || actingForOrgId === userOrgId) {
    return { targetOrgId: userOrgId, partnerId: null };
  }
  const partner = await prisma.partner.findUnique({ where: { orgId: userOrgId }, select: { id: true, status: true } });
  // A suspended partner keeps existing PartnerRepresentation rows (revoking
  // them is the represented org's call, not an automatic side effect of
  // suspension) but must not go on acting through them.
  if (!partner || partner.status === 'suspended') return null;
  const representation = await prisma.partnerRepresentation.findUnique({
    where: { partnerId_orgId: { partnerId: partner.id, orgId: actingForOrgId } },
  });
  if (!canActFor(representation, scope)) return null;
  return { targetOrgId: actingForOrgId, partnerId: partner.id };
}

/** A single row in the partner's mandate pipeline (N7.4) — an RFQ or a quote
 *  the partner drafted, normalised to one shape so the console can show them
 *  side by side. */
export interface MandateRow {
  id: string;
  kind: 'rfq' | 'quote';
  reference: string;
  productName: string;
  cas: string;
  principalOrgName: string;
  bucket: 'sourcing' | 'quoted' | 'awarded';
  createdAt: Date;
}

/** One entry in the "Priority today" panel — a cert alert or a stale
 *  sourcing-bucket mandate, normalised so the panel renders both generically. */
export type PriorityItem =
  | { kind: 'cert'; id: string; orgName: string; name: string; level: ReturnType<typeof certExpiryLevel>; expiresAt: Date | null }
  | { kind: 'stale_mandate'; id: string; orgName: string; name: string; reference: string };

/** Everything the Portfolio Console (N7.4) needs, in one call. */
export async function getPortfolio(partnerOrgId: string) {
  const partner = await prisma.partner.findUnique({ where: { orgId: partnerOrgId } });
  if (!partner) return null;

  const [representations, draftedRfqs, draftedQuotes, payouts] = await Promise.all([
    prisma.partnerRepresentation.findMany({ where: { partnerId: partner.id, revokedAt: null }, select: { orgId: true } }),
    prisma.rfq.findMany({
      where: { draftedByPartnerId: partner.id },
      include: { buyerOrg: { select: { name: true } }, quotes: { select: { id: true } }, deal: { select: { id: true, totalValue: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.quote.findMany({
      where: { draftedByPartnerId: partner.id },
      include: {
        sellerOrg: { select: { name: true } },
        rfq: { select: { reference: true, productName: true, cas: true, status: true, requiredBy: true } },
        deal: { select: { id: true, totalValue: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.partnerPayout.findMany({ where: { partnerId: partner.id } }),
  ]);

  const representedOrgIds = representations.map((r) => r.orgId);
  const certAlerts = representedOrgIds.length
    ? (
        await prisma.certification.findMany({
          where: { orgId: { in: representedOrgIds }, status: 'verified' },
          orderBy: [{ expiresAt: 'asc' }],
          include: { org: { select: { id: true, name: true } } },
        })
      )
        .map((c) => ({ ...c, level: certExpiryLevel(c.expiresAt) }))
        .filter((c) => needsAttention(c.level))
    : [];

  const rfqRows: MandateRow[] = draftedRfqs.map((r) => ({
    id: r.id,
    kind: 'rfq',
    reference: r.reference,
    productName: r.productName,
    cas: r.cas,
    principalOrgName: r.buyerOrg.name,
    bucket: r.quotes.length === 0 ? 'sourcing' : effectiveRfqStatus(r) === 'awarded' ? 'awarded' : 'quoted',
    createdAt: r.createdAt,
  }));
  const quoteRows: MandateRow[] = draftedQuotes
    // A declined/expired quote never entered a real pipeline stage — leave it
    // out rather than inventing a fourth bucket for it.
    .filter((q) => q.status !== 'rejected' && q.status !== 'expired')
    .map((q) => ({
      id: q.id,
      kind: 'quote',
      reference: q.rfq.reference,
      productName: q.rfq.productName,
      cas: q.rfq.cas,
      principalOrgName: q.sellerOrg.name,
      bucket: q.status === 'accepted' ? 'awarded' : 'quoted',
      createdAt: q.createdAt,
    }));
  const mandates = [...rfqRows, ...quoteRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Response rate (PARTNER-PROGRAM.md §8 row 3 — specified, never built):
  // quotes this partner actually submitted vs. still-open opportunities on a
  // represented supplier they haven't responded to yet. Reuses
  // getQuotableMandates as-is rather than re-deriving its broadcast-matching
  // logic here.
  const quotable = await getQuotableMandates(partnerOrgId);
  const responseDenominator = draftedQuotes.length + quotable.length;
  const responseRate = responseDenominator > 0 ? Math.round((draftedQuotes.length / responseDenominator) * 100) : null;

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  // Dedupe by deal id: if this partner drafted BOTH the RFQ and its winning
  // quote (representing the buyer and that supplier on the same deal — a
  // real, allowed shape, see recordIntroductionIfNew), the one Deal row would
  // otherwise be fetched via both draftedRfqs[i].deal and draftedQuotes[j].deal
  // and double-counted below.
  const dealsById = new Map<string, { totalValue: number; createdAt: Date }>();
  for (const m of [...draftedRfqs, ...draftedQuotes]) {
    if (m.deal) dealsById.set(m.deal.id, m.deal);
  }
  const dealsClosedThisMonth = [...dealsById.values()].filter((d) => d.createdAt.getTime() >= monthStart.getTime()).length;
  // Informational only — never used to price a payout (N7.10).
  const gmvRepresented = [...dealsById.values()].reduce((sum, d) => sum + d.totalValue, 0);
  const earningsToDate = payouts.reduce((sum, p) => sum + p.amount, 0);

  // Priority-today task list (extends the panel that already showed cert
  // alerts alone): adds a second, cheap-to-derive item kind from data this
  // function already fetched — a sourcing-bucket RFQ (no quotes yet) that's
  // gone quiet. Both kinds share one shape so the dashboard renders them
  // generically rather than needing a second panel.
  const STALE_MANDATE_DAYS = 7;
  const staleCutoff = Date.now() - STALE_MANDATE_DAYS * 24 * 60 * 60 * 1000;
  const priorityItems: PriorityItem[] = [
    ...certAlerts.map((c) => ({ kind: 'cert' as const, id: c.id, orgName: c.org.name, name: c.name, level: c.level, expiresAt: c.expiresAt })),
    ...mandates
      .filter((m) => m.bucket === 'sourcing' && m.createdAt.getTime() < staleCutoff)
      .map((m) => ({ kind: 'stale_mandate' as const, id: m.id, orgName: m.principalOrgName, name: m.productName, reference: m.reference })),
  ].sort((a, b) => (a.kind === 'cert' && b.kind === 'cert' ? 0 : a.kind === 'cert' ? -1 : 1));

  return {
    partner,
    mandates,
    openMandates: mandates.filter((m) => m.bucket !== 'awarded').length,
    quotesPending: mandates.filter((m) => m.bucket === 'quoted').length,
    dealsClosedThisMonth,
    gmvRepresented,
    earningsToDate,
    responseRate,
    certAlerts,
    priorityItems,
  };
}

/**
 * The quote comparison for an RFQ this partner drafted — a READ-ONLY front
 * door onto the same buyer-facing comparison, never a new copy of its logic.
 *
 * Ownership is `draftedByPartnerId === partner.id`, not org membership (a
 * partner's own org is never the RFQ's buyerOrgId — see the PARTNER BOUNDARY
 * comment above acceptQuoteAction in lib/actions.ts). Once ownership is
 * confirmed, this delegates to the EXISTING, unmodified getQuoteComparison
 * using the RFQ's own real buyerOrgId, so compare-queries.ts needs no partner
 * awareness at all and the buyer-facing function is untouched.
 */
export async function getPartnerMandateComparison(partnerOrgId: string, rfqId: string) {
  const partner = await prisma.partner.findUnique({ where: { orgId: partnerOrgId }, select: { id: true } });
  if (!partner) return null;

  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { buyerOrgId: true, draftedByPartnerId: true } });
  if (!rfq || rfq.draftedByPartnerId !== partner.id) return null;

  return getQuoteComparison(rfqId, rfq.buyerOrgId);
}

/**
 * A single quote this partner drafted, for the read-only mandate detail
 * page's quote branch. A supplier never sees competing quotes on the same
 * RFQ (existing privacy boundary), so this is deliberately narrower than
 * getPartnerMandateComparison — one quote's own detail, not a comparison.
 */
export async function getPartnerQuoteMandateDetail(partnerOrgId: string, quoteId: string) {
  const partner = await prisma.partner.findUnique({ where: { orgId: partnerOrgId }, select: { id: true } });
  if (!partner) return null;

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { rfq: { select: { reference: true, productName: true, cas: true, quantityKg: true, buyerOrg: { select: { name: true } } } } },
  });
  if (!quote || quote.draftedByPartnerId !== partner.id) return null;

  return quote;
}

export interface ActiveRepresentation {
  representationId: string;
  orgId: string;
  orgName: string;
  orgKind: string;
  scopes: string;
  consentAt: Date;
}

/** Every live (non-revoked) representation a partner holds, optionally
 *  filtered to one that carries a given scope. */
export async function getActiveRepresentations(partnerOrgId: string, scope?: RepresentationScope): Promise<ActiveRepresentation[]> {
  const partner = await prisma.partner.findUnique({ where: { orgId: partnerOrgId } });
  if (!partner) return [];
  const reps = await prisma.partnerRepresentation.findMany({
    where: { partnerId: partner.id, revokedAt: null },
    include: { org: { select: { id: true, name: true, kind: true } } },
    orderBy: { consentAt: 'desc' },
  });
  return reps
    .filter((r) => !scope || hasScope(r.scopes, scope))
    .map((r) => ({ representationId: r.id, orgId: r.orgId, orgName: r.org.name, orgKind: r.org.kind, scopes: r.scopes, consentAt: r.consentAt }));
}

export interface QuotableMandate {
  rfqId: string;
  reference: string;
  productName: string;
  cas: string;
  quantityKg: number;
  buyerOrgName: string;
  supplierOrgId: string;
  supplierOrgName: string;
}

/**
 * Open RFQs broadcast to a supplier the partner represents (with `quote_draft`
 * scope), that supplier hasn't already quoted or declined, and that can still
 * receive a quote (F4.7 lifecycle) — the partner's "you could draft a quote
 * here" list.
 */
export async function getQuotableMandates(partnerOrgId: string): Promise<QuotableMandate[]> {
  const reps = await getActiveRepresentations(partnerOrgId, 'quote_draft');
  const supplierOrgIds = reps.filter((r) => r.orgKind === 'seller' || r.orgKind === 'both').map((r) => r.orgId);
  if (supplierOrgIds.length === 0) return [];

  const broadcasts = await prisma.rfqSupplier.findMany({
    where: { orgId: { in: supplierOrgIds }, declinedAt: null },
    include: {
      org: { select: { id: true, name: true } },
      rfq: {
        select: {
          id: true,
          reference: true,
          productName: true,
          cas: true,
          quantityKg: true,
          status: true,
          requiredBy: true,
          buyerOrg: { select: { name: true } },
          quotes: { select: { sellerOrgId: true } },
        },
      },
    },
  });

  return broadcasts
    .filter((b) => canReceiveQuotes(b.rfq) && !b.rfq.quotes.some((q) => q.sellerOrgId === b.orgId))
    .map((b) => ({
      rfqId: b.rfq.id,
      reference: b.rfq.reference,
      productName: b.rfq.productName,
      cas: b.rfq.cas,
      quantityKg: b.rfq.quantityKg,
      buyerOrgName: b.rfq.buyerOrg.name,
      supplierOrgId: b.orgId,
      supplierOrgName: b.org.name,
    }));
}

export interface NetworkRow {
  representationId: string;
  orgId: string;
  orgName: string;
  orgKind: string;
  country: string;
  city: string | null;
  scopes: string;
  consentAt: Date;
  revokedAt: Date | null;
  cert: { name: string; expiresAt: Date | null; level: ReturnType<typeof certExpiryLevel> } | null;
  lastActivityAt: Date | null;
}

/** The partner's own CRM view (N7.5/N7.8 partner-facing half): every org
 *  they represent or have represented, with cert status and last activity. */
export async function getPartnerNetwork(partnerOrgId: string): Promise<NetworkRow[]> {
  const partner = await prisma.partner.findUnique({ where: { orgId: partnerOrgId } });
  if (!partner) return [];

  const [reps, draftedRfqs, draftedQuotes] = await Promise.all([
    prisma.partnerRepresentation.findMany({
      where: { partnerId: partner.id },
      include: { org: { select: { id: true, name: true, kind: true, country: true, city: true } } },
      orderBy: { consentAt: 'desc' },
    }),
    prisma.rfq.findMany({ where: { draftedByPartnerId: partner.id }, select: { buyerOrgId: true, createdAt: true } }),
    prisma.quote.findMany({ where: { draftedByPartnerId: partner.id }, select: { sellerOrgId: true, createdAt: true } }),
  ]);
  if (reps.length === 0) return [];

  const lastActivityByOrg = new Map<string, Date>();
  for (const { buyerOrgId, createdAt } of draftedRfqs) {
    const prev = lastActivityByOrg.get(buyerOrgId);
    if (!prev || createdAt > prev) lastActivityByOrg.set(buyerOrgId, createdAt);
  }
  for (const { sellerOrgId, createdAt } of draftedQuotes) {
    const prev = lastActivityByOrg.get(sellerOrgId);
    if (!prev || createdAt > prev) lastActivityByOrg.set(sellerOrgId, createdAt);
  }

  const supplierOrgIds = reps.filter((r) => r.org.kind !== 'buyer').map((r) => r.orgId);
  // Two passes, not one `orderBy: [{ expiresAt: 'asc' }]` — SQLite sorts NULL
  // expiresAt FIRST in ascending order (Prisma's `nulls: 'last'` is Postgres/
  // SQL-Server only and is silently ignored here), so a single-pass "first
  // per org" pick would surface an org's no-expiry cert instead of an
  // actually-expiring one. Same footgun and same fix as
  // lib/catalog-queries.ts's runOrdered for lead_time.
  const certByOrg = new Map<string, { orgId: string; name: string; expiresAt: Date | null }>();
  if (supplierOrgIds.length) {
    const dated = await prisma.certification.findMany({
      where: { orgId: { in: supplierOrgIds }, status: 'verified', expiresAt: { not: null } },
      orderBy: [{ expiresAt: 'asc' }],
    });
    for (const c of dated) {
      // First hit per org is the soonest-expiring, since the query is
      // ordered by expiresAt ascending — exactly the one worth surfacing.
      if (!certByOrg.has(c.orgId)) certByOrg.set(c.orgId, c);
    }
    const stillMissing = supplierOrgIds.filter((id) => !certByOrg.has(id));
    if (stillMissing.length) {
      const undated = await prisma.certification.findMany({
        where: { orgId: { in: stillMissing }, status: 'verified', expiresAt: null },
      });
      for (const c of undated) {
        if (!certByOrg.has(c.orgId)) certByOrg.set(c.orgId, c);
      }
    }
  }

  return reps.map((r) => {
    const cert = certByOrg.get(r.orgId);
    return {
      representationId: r.id,
      orgId: r.orgId,
      orgName: r.org.name,
      orgKind: r.org.kind,
      country: r.org.country,
      city: r.org.city,
      scopes: r.scopes,
      consentAt: r.consentAt,
      revokedAt: r.revokedAt,
      cert: cert ? { name: cert.name, expiresAt: cert.expiresAt, level: certExpiryLevel(cert.expiresAt) } : null,
      lastActivityAt: lastActivityByOrg.get(r.orgId) ?? null,
    };
  });
}

export interface RepresentingPartnerRow {
  representationId: string;
  partnerOrgId: string;
  partnerName: string;
  partnerCountry: string;
  tier: string;
  scopes: string;
  consentAt: Date;
  revokedAt: Date | null;
}

/** The Partner Hub (N7.8, principal-facing half): every partner this org has
 *  granted representation to, or previously granted. */
export async function getRepresentingPartners(orgId: string): Promise<RepresentingPartnerRow[]> {
  const reps = await prisma.partnerRepresentation.findMany({
    where: { orgId },
    include: { partner: { include: { org: { select: { name: true, country: true } } } } },
    orderBy: { consentAt: 'desc' },
  });
  return reps.map((r) => ({
    representationId: r.id,
    partnerOrgId: r.partner.orgId,
    partnerName: r.partner.org.name,
    partnerCountry: r.partner.org.country,
    tier: r.partner.tier,
    scopes: r.scopes,
    consentAt: r.consentAt,
    revokedAt: r.revokedAt,
  }));
}

/**
 * The Public Partner Profile (N7.7), as a buyer browsing sees it. Trust
 * signals only: a represented-org COUNT, never identities — that boundary is
 * enforced here, at the query, not left to the page to remember not to
 * render a name (PARTNER-PROGRAM.md §2's "cannot see other partners'
 * portfolios" boundary, applied to the public view of any one partner too).
 */
export async function getPartnerPublicProfile(id: string) {
  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      org: {
        select: { id: true, name: true, status: true, country: true, city: true, about: true, sourcingCategories: true, verifiedAt: true },
      },
    },
  });
  // Suspended drops out of the public directory the same way an unverified
  // org already does — "hireable" and "currently operating" should agree.
  if (!partner || partner.org.status !== 'verified' || partner.status === 'suspended') return null;

  const [representedCount, mandatesCompleted] = await Promise.all([
    prisma.partnerRepresentation.count({ where: { partnerId: partner.id, revokedAt: null } }),
    prisma.deal.count({ where: { OR: [{ rfq: { draftedByPartnerId: partner.id } }, { quote: { draftedByPartnerId: partner.id } }] } }),
  ]);

  return { partner, representedCount, mandatesCompleted };
}

/** The Earnings view (N7.9): every PartnerPayout PharmaLink has accrued/paid
 *  this partner, plus the totals the console's stat tiles need. Never reads
 *  Deal/Quote value — payouts are already computed off subscription revenue
 *  only (N7.10) by the time they land in this table. */
export async function getPartnerEarnings(partnerOrgId: string) {
  const partner = await prisma.partner.findUnique({ where: { orgId: partnerOrgId } });
  if (!partner) return null;

  const payouts = await prisma.partnerPayout.findMany({
    where: { partnerId: partner.id },
    orderBy: { createdAt: 'desc' },
  });

  const paidTotal = payouts.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const accruedTotal = payouts.filter((p) => p.status === 'accrued' || p.status === 'confirmed').reduce((sum, p) => sum + p.amount, 0);

  return { partner, payouts, paidTotal, accruedTotal };
}

/**
 * A bank-acceptable GMV & earnings statement — persona 7.2's stated need
 * (PARTNER-PROGRAM.md §7.2): "no bank-acceptable proof of GMV for a
 * working-capital loan." Reuses getPartnerEarnings's own totals rather than
 * re-deriving them, and adds the two other evidentiary counts a lender
 * would want: how many introductions this partner has sealed, and how many
 * orgs currently represent live business through them. Never reads Deal/
 * Quote value directly — same discipline getPartnerEarnings already keeps.
 */
export async function getPartnerGmvStatement(partnerOrgId: string) {
  const partner = await prisma.partner.findUnique({ where: { orgId: partnerOrgId }, include: { org: true } });
  if (!partner) return null;

  const earnings = await getPartnerEarnings(partnerOrgId);
  if (!earnings) return null;

  const [introductionCount, representedOrgCount] = await Promise.all([
    prisma.introduction.count({ where: { partnerId: partner.id } }),
    prisma.partnerRepresentation.count({ where: { partnerId: partner.id, revokedAt: null } }),
  ]);

  return {
    partner,
    paidTotal: earnings.paidTotal,
    accruedTotal: earnings.accruedTotal,
    payoutCount: earnings.payouts.length,
    introductionCount,
    representedOrgCount,
    generatedAt: new Date(),
  };
}

export interface CommissionLedgerEntry {
  dealId: string;
  reference: string;
  createdAt: Date;
  productName: string;
  cas: string;
  buyerOrgName: string;
  supplierOrgName: string;
  quantityKg: number;
  commissionPerKg: number;
  totalCommission: number;
  currency: string;
}

/**
 * The in-app trade commission ledger — what have you actually earned from
 * your own deals, tracked inside PharmaLink rather than only exportable.
 * Only deals where THIS partner drafted the winning quote with a declared
 * commission (declaredCommissionPerKg, added alongside the commission-
 * disclosure work) can be computed here — a buyer-side partner-drafted RFQ
 * has no on-platform price field, so their commission is a private
 * arrangement with their own principal this ledger has no visibility into.
 *
 * Purely informational, same A1 discipline getPortfolio's gmvRepresented
 * already keeps: PharmaLink never touches this money, never derives a
 * payout from it. This is PharmaLink SHOWING the partner their own numbers,
 * not paying them — settlement is still directly between the partner and
 * their principal, off-platform.
 */
export async function getPartnerCommissionLedger(partnerOrgId: string) {
  const partner = await prisma.partner.findUnique({ where: { orgId: partnerOrgId }, select: { id: true } });
  if (!partner) return null;

  const deals = await prisma.deal.findMany({
    where: { quote: { draftedByPartnerId: partner.id, declaredCommissionPerKg: { not: null } } },
    include: {
      quote: { select: { declaredCommissionPerKg: true, currency: true, sellerOrg: { select: { name: true } } } },
      rfq: { select: { productName: true, cas: true, quantityKg: true, buyerOrg: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const entries: CommissionLedgerEntry[] = deals.map((d) => {
    const commissionPerKg = d.quote.declaredCommissionPerKg!; // filtered not-null above
    return {
      dealId: d.id,
      reference: d.reference,
      createdAt: d.createdAt,
      productName: d.rfq.productName,
      cas: d.rfq.cas,
      buyerOrgName: d.rfq.buyerOrg.name,
      supplierOrgName: d.quote.sellerOrg.name,
      quantityKg: d.rfq.quantityKg,
      commissionPerKg,
      totalCommission: Math.round(d.rfq.quantityKg * commissionPerKg * 100) / 100,
      currency: d.quote.currency,
    };
  });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const totalAllTime = entries.reduce((sum, e) => sum + e.totalCommission, 0);
  const totalThisMonth = entries.filter((e) => e.createdAt.getTime() >= monthStart.getTime()).reduce((sum, e) => sum + e.totalCommission, 0);

  return { entries, totalAllTime, totalThisMonth };
}

export interface IncentiveMilestone {
  key: 'activation_bonus' | 'streak_bonus' | 'breadth_bonus' | 'referral_bonus';
  /** Which breadth tier this object represents (1/2/3) — undefined for every other kind. */
  tier?: number;
  earned: boolean;
  current: number;
  target: number;
  rewardUsd: number;
}

/**
 * The rewards-ladder dashboard (PARTNER-INCENTIVES.md §3) — READ-ONLY
 * eligibility/progress, never a payout write. Every figure this reads
 * already exists: Organization.verifiedAt, Rfq/Quote.draftedByPartnerId,
 * Introduction, PartnerRepresentation, PartnerAttribution. Nothing here
 * creates a PartnerPayout — see PARTNER_PAYOUT_KINDS' comment in
 * lib/partner.ts for why that's a deliberately separate, later decision.
 */
export async function getPartnerIncentives(partnerOrgId: string): Promise<IncentiveMilestone[] | null> {
  const partner = await prisma.partner.findUnique({ where: { orgId: partnerOrgId }, include: { org: { select: { verifiedAt: true } } } });
  if (!partner) return null;

  const streakStart = new Date(Date.now() - STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [firstIntroduction, firstRfq, firstQuote, streakRfqCount, streakQuoteCount, repCount, referredVerifiedPartners] = await Promise.all([
    prisma.introduction.findFirst({ where: { partnerId: partner.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.rfq.findFirst({ where: { draftedByPartnerId: partner.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.quote.findFirst({ where: { draftedByPartnerId: partner.id }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.rfq.count({ where: { draftedByPartnerId: partner.id, createdAt: { gte: streakStart } } }),
    prisma.quote.count({ where: { draftedByPartnerId: partner.id, createdAt: { gte: streakStart } } }),
    prisma.partnerRepresentation.count({ where: { partnerId: partner.id, revokedAt: null } }),
    prisma.partnerAttribution.count({ where: { partnerId: partner.id, org: { kind: 'partner', status: 'verified' } } }),
  ]);

  const milestones: IncentiveMilestone[] = [];

  // Activation: first mandate + first Introduction, both within the window
  // of the partner's OWN org verification — see ACTIVATION_WINDOW_DAYS.
  const mandateDates = [firstRfq?.createdAt, firstQuote?.createdAt].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
  const firstMandateAt = mandateDates[0] ?? null;
  const activationEarned = !!(
    partner.org.verifiedAt &&
    firstIntroduction &&
    firstMandateAt &&
    withinDays(partner.org.verifiedAt, firstIntroduction.createdAt, ACTIVATION_WINDOW_DAYS) &&
    withinDays(partner.org.verifiedAt, firstMandateAt, ACTIVATION_WINDOW_DAYS)
  );
  milestones.push({ key: 'activation_bonus', earned: activationEarned, current: activationEarned ? 1 : 0, target: 1, rewardUsd: INCENTIVE_REWARD_USD.activation_bonus });

  // Streak: rolling window, not a fixed calendar quarter.
  const streakCount = streakRfqCount + streakQuoteCount;
  milestones.push({
    key: 'streak_bonus',
    earned: streakCount >= STREAK_TARGET,
    current: Math.min(streakCount, STREAK_TARGET),
    target: STREAK_TARGET,
    rewardUsd: INCENTIVE_REWARD_USD.streak_bonus,
  });

  // Breadth: one object per published tier, each its own earned/progress state.
  for (const [i, tier] of BREADTH_TIERS.entries()) {
    milestones.push({
      key: 'breadth_bonus',
      tier: i + 1,
      earned: repCount >= tier,
      current: Math.min(repCount, tier),
      target: tier,
      rewardUsd: INCENTIVE_REWARD_USD.breadth_bonus,
    });
  }

  // Referral: another PARTNER org, sealed to this partner via
  // PartnerAttribution (the same invite-link mechanism any org uses), whose
  // own org has since reached ops verification.
  milestones.push({
    key: 'referral_bonus',
    earned: referredVerifiedPartners >= REFERRAL_TARGET,
    current: Math.min(referredVerifiedPartners, REFERRAL_TARGET),
    target: REFERRAL_TARGET,
    rewardUsd: INCENTIVE_REWARD_USD.referral_bonus,
  });

  return milestones;
}

/**
 * One PartnerPayout, dressed as a printable invoice (N7.9 follow-up: "a
 * simple invoice system for the agents"). Ownership-scoped to the calling
 * partner's own org — the caller must pass the SAME orgId that owns the
 * payout's Partner row, exactly like every other partner-scoped read here.
 *
 * `sourceOrgId` is a plain string column, not a relation (see schema.prisma)
 * — the represented org whose subscription generated this line is looked up
 * separately rather than joined.
 */
export async function getPartnerPayoutInvoice(partnerOrgId: string, payoutId: string) {
  const partner = await prisma.partner.findUnique({ where: { orgId: partnerOrgId }, include: { org: true } });
  if (!partner) return null;

  const payout = await prisma.partnerPayout.findUnique({
    where: { id: payoutId },
    include: { sourceInvoice: { select: { number: true } } },
  });
  if (!payout || payout.partnerId !== partner.id) return null;

  const sourceOrg = await prisma.organization.findUnique({ where: { id: payout.sourceOrgId }, select: { name: true } });

  return { partner, payout, sourceOrgName: sourceOrg?.name ?? null };
}

export interface PartnerSearchFilters {
  archetype?: string;
  tier?: string;
  country?: string;
}

/** Buyer-side partner search (N7.7) — verified partners only, same
 *  non-AI-ranking discipline as the product catalog (F1.5/N5): filtered and
 *  sorted by plain, explainable fields, never a hidden relevance score. */
export async function searchPartners(filters: PartnerSearchFilters) {
  const partners = await prisma.partner.findMany({
    where: {
      archetype: filters.archetype || undefined,
      tier: filters.tier || undefined,
      status: { not: 'suspended' },
      org: { status: 'verified', country: filters.country || undefined },
    },
    include: { org: { select: { id: true, name: true, country: true, city: true, sourcingCategories: true } } },
    // Newest first — NOT sorted by tier string ('specialist' < 'registered'
    // alphabetically would misrank it anyway. Tier is shown as a badge, not
    // used to order results, matching the no-opaque-ranking discipline
    // F1.5/N5 already commit to elsewhere in search.
    orderBy: { createdAt: 'desc' },
  });
  return partners;
}

export interface VerifiedOrgResult {
  id: string;
  name: string;
  kind: string;
  country: string;
  city: string | null;
}

/**
 * Name-contains search over verified buyer/seller orgs — the counterparty
 * picker for deal registration (below). Deliberately NOT a general org
 * directory: verified only, and the caller decides which `kind` to search
 * (a partner registering a deal already knows which side they're missing).
 */
export async function searchVerifiedOrgs(kind: 'buyer' | 'seller', query: string): Promise<VerifiedOrgResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const orgs = await prisma.organization.findMany({
    where: {
      status: 'verified',
      kind: { in: [kind, 'both'] },
      name: { contains: q },
    },
    select: { id: true, name: true, kind: true, country: true, city: true },
    orderBy: { name: 'asc' },
    take: 10,
  });
  return orgs;
}

/**
 * Deal registration (new — a partner claims a prospective buyer↔supplier↔
 * molecule combination before any mandate exists), for the counterparty
 * picker's other half: the orgs this partner already represents, filtered
 * to the scope registration actually needs. Thin wrapper over
 * getActiveRepresentations so the UI doesn't need two different shapes.
 */
export async function getRepresentedOrgsForDeal(partnerOrgId: string): Promise<ActiveRepresentation[]> {
  const buyerSide = await getActiveRepresentations(partnerOrgId, 'rfq_draft');
  const supplierSide = await getActiveRepresentations(partnerOrgId, 'quote_draft');
  const seen = new Set<string>();
  return [...buyerSide, ...supplierSide].filter((r) => (seen.has(r.orgId) ? false : (seen.add(r.orgId), true)));
}
