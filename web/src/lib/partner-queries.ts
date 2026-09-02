/**
 * Sourcing Partner channel — reads (EPIC N7).
 *
 * Paired with lib/partner.ts (pure decision logic) and lib/partner-actions.ts
 * (mutations), same *.ts/*-actions.ts/*-queries.ts split as the rest of the
 * codebase (see lib/rfq.ts + lib/compare-queries.ts for the read-path
 * precedent this follows).
 */
import { prisma } from '@/lib/db';
import { canActFor, type RepresentationScope } from '@/lib/partner';
import { certExpiryLevel, needsAttention } from '@/lib/compliance';
import { effectiveRfqStatus, canReceiveQuotes } from '@/lib/rfq';
import { hasScope } from '@/lib/partner';

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

  return {
    partner,
    mandates,
    openMandates: mandates.filter((m) => m.bucket !== 'awarded').length,
    quotesPending: mandates.filter((m) => m.bucket === 'quoted').length,
    dealsClosedThisMonth,
    gmvRepresented,
    earningsToDate,
    certAlerts,
  };
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
