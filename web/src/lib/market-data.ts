/**
 * External market data — the pure half: the source registry, the molecule→HS
 * map, and the normalisers that turn upstream records into our own facts.
 *
 * Fetching lives in `market-data.server.ts`. Everything here is deterministic
 * and unit-tested, so the rules that decide "is this a usable price?" can be
 * inspected without a network.
 *
 * The governing constraint: a public trade statistic is NOT a quotation. A
 * customs line reports what a whole HS heading traded for, and an HS heading is
 * usually broader than one molecule. Rather than hide that, every observation
 * carries a `weight` derived from how specific its source actually is, and the
 * forecast maths respects it.
 */

// ---------------------------------------------------------------------------
// Source registry
// ---------------------------------------------------------------------------

export type SourceKind = 'price' | 'supply_event' | 'macro' | 'supplier';
/** live = connector implemented; manual = importable but no API; blocked = not capturable. */
export type CaptureStatus = 'live' | 'manual' | 'blocked';

export interface MarketSource {
  id: string;
  name: string;
  /** Exact host the connector may talk to — the fetch allowlist, not decoration. */
  host: string | null;
  kind: SourceKind;
  status: CaptureStatus;
  /** Licence/terms as published by the source. */
  licence: string;
  requiresKey: boolean;
  /** What this source contributes to the engine, in one line. */
  yields: string;
  docsUrl: string;
}

export const MARKET_SOURCES: readonly MarketSource[] = [
  {
    id: 'comtrade',
    name: 'UN Comtrade',
    host: 'comtradeapi.un.org',
    kind: 'price',
    status: 'live',
    licence: 'UN open data — free preview endpoint, attribution required',
    requiresKey: false,
    yields: 'Monthly import/export value ÷ net weight per HS heading → implied USD/kg unit values',
    docsUrl: 'https://comtradedeveloper.un.org/',
  },
  {
    id: 'openfda-shortages',
    name: 'openFDA drug shortages',
    host: 'api.fda.gov',
    kind: 'supply_event',
    status: 'live',
    licence: 'CC0 public domain',
    requiresKey: false,
    yields: 'Current and resolved US shortages + discontinuations, by generic name and company',
    docsUrl: 'https://open.fda.gov/apis/drug/drugshortages/',
  },
  {
    id: 'openfda-enforcement',
    name: 'openFDA recall enforcement',
    host: 'api.fda.gov',
    kind: 'supply_event',
    status: 'live',
    licence: 'CC0 public domain',
    requiresKey: false,
    yields: 'Class I–III drug recalls with reason, firm and date',
    docsUrl: 'https://open.fda.gov/apis/drug/enforcement/',
  },
  {
    id: 'frankfurter-fx',
    name: 'Frankfurter (ECB reference rates)',
    host: 'api.frankfurter.dev',
    kind: 'macro',
    status: 'live',
    licence: 'ECB reference rates, free reuse with attribution',
    requiresKey: false,
    yields: 'USD/INR and USD/CNY — the FX leg of any India- or China-sourced API price',
    docsUrl: 'https://frankfurter.dev/',
  },
  {
    id: 'openfda-drugsfda',
    name: 'openFDA approved drug applications',
    host: 'api.fda.gov',
    kind: 'supplier',
    status: 'live',
    licence: 'CC0 public domain',
    requiresKey: false,
    yields:
      'Distinct ANDA/NDA sponsors per molecule → the US finished-dose supply base and its HHI. NOT API makers — see fda-dmf for that.',
    docsUrl: 'https://open.fda.gov/apis/drug/drugsfda/',
  },
  {
    id: 'fda-dmf',
    name: 'FDA Drug Master File list',
    host: 'www.fda.gov',
    kind: 'supplier',
    status: 'manual',
    licence: 'US public domain',
    requiresKey: false,
    yields: 'Quarterly spreadsheet of Type II DMF holders → who is qualified to supply each API in the US',
    docsUrl: 'https://www.fda.gov/drugs/forms-submission-requirements/drug-master-files-dmfs',
  },
  {
    id: 'chemical-weekly',
    name: 'Chemical Weekly (India) PriceTrack',
    host: null,
    kind: 'price',
    status: 'manual',
    licence: 'Paid subscription — archive is real but every price value is behind a login',
    requiresKey: true,
    yields:
      'Weekly Indian domestic chemical prices for Mumbai, Chennai and Hyderabad, continuously since Feb 2002 — the deepest price history found anywhere, if licensed',
    docsUrl: 'https://www.chemicalweekly.com/pricetrack',
  },
  {
    id: 'chemanalyst',
    name: 'ChemAnalyst pricing data',
    host: null,
    kind: 'price',
    status: 'blocked',
    licence: 'Proprietary — terms forbid reusing prices on another site without written consent',
    requiresKey: true,
    yields:
      'Quarterly regional USD/MT averages for ~1,090 chemicals including most of HS_BY_CAS at molecule level. Technically readable, contractually not. Licence it.',
    docsUrl: 'https://www.chemanalyst.com/Pricing/Pricingoverview',
  },
  {
    id: 'chemical-marketplaces',
    name: 'Echemi / Guidechem / ChemNet / Lookchem',
    host: null,
    kind: 'supplier',
    status: 'blocked',
    licence: 'Proprietary — robots.txt disallows the price and supplier paths specifically',
    requiresKey: true,
    yields:
      'Chinese-marketplace supplier listings and quoted prices. Each one disallows exactly the endpoints of interest, or serves an anti-bot challenge.',
    docsUrl: 'https://www.echemi.com/',
  },
  {
    id: 'edqm-cep',
    name: 'EDQM Certificates of Suitability',
    host: 'extranet.edqm.eu',
    kind: 'supplier',
    status: 'manual',
    licence: 'Public search, no bulk/API access offered',
    requiresKey: false,
    yields: 'CEP holders per substance → the EU-qualified supply base',
    docsUrl: 'https://extranet.edqm.eu/publications/recherches_CEP.shtml',
  },
  {
    id: 'globalfund-pqr',
    name: 'Global Fund Price & Quality Reporting',
    host: 'www.theglobalfund.org',
    kind: 'price',
    status: 'manual',
    licence: 'Published for transparency, downloadable',
    requiresKey: false,
    yields: 'Actual transaction prices paid by donor-funded procurement — real signed prices, not statistics',
    docsUrl: 'https://www.theglobalfund.org/en/sourcing-management/price-quality-reporting/',
  },
  {
    id: 'pharmacompass',
    name: 'PharmaCompass',
    host: null,
    kind: 'price',
    status: 'blocked',
    licence: 'Proprietary — CDN bot protection, no public API',
    requiresKey: true,
    yields: 'API price trends and DMF/CEP counts — commercially licensable, not capturable',
    docsUrl: 'https://www.pharmacompass.com/',
  },
  {
    id: 'customs-brokers',
    name: 'Zauba / Volza / ExportGenius',
    host: null,
    kind: 'price',
    status: 'blocked',
    licence: 'Proprietary — Cloudflare challenge, paid API only',
    requiresKey: true,
    yields: 'Shipment-level Indian customs records with per-kg rates — the sharpest public price signal, but licensed',
    docsUrl: 'https://www.volza.com/',
  },
] as const;

export function sourceById(id: string): MarketSource | undefined {
  return MARKET_SOURCES.find((s) => s.id === id);
}

/** Hosts any connector is permitted to contact. Anything else is a bug. */
export const ALLOWED_HOSTS: readonly string[] = MARKET_SOURCES.map((s) => s.host).filter((h): h is string => h !== null);

// ---------------------------------------------------------------------------
// Molecule → HS heading
// ---------------------------------------------------------------------------

/**
 * How closely an HS heading corresponds to the molecule.
 *
 *   narrow — the heading names this substance ("vitamin C and its derivatives")
 *   group  — the heading is a chemical family containing it ("cyclic amides")
 *
 * A group line still carries information (it moves when the family moves) but
 * it is not this molecule's price, and it is weighted accordingly.
 */
export type HsSpecificity = 'narrow' | 'group';

export interface HsMapping {
  cas: string;
  name: string;
  hs6: string;
  /** Official HS description, verbatim from the UN Comtrade reference. */
  hsDescription: string;
  specificity: HsSpecificity;
}

/** Verified against https://comtradeapi.un.org/files/v1/app/reference/HS.json */
export const HS_BY_CAS: readonly HsMapping[] = [
  { cas: '103-90-2', name: 'Paracetamol', hs6: '292429', hsDescription: 'Cyclic amides and their derivatives', specificity: 'group' },
  {
    cas: '15687-27-1',
    name: 'Ibuprofen',
    hs6: '291639',
    hsDescription: 'Aromatic monocarboxylic acids and their derivatives',
    specificity: 'group',
  },
  { cas: '50-78-2', name: 'Acetylsalicylic acid', hs6: '291822', hsDescription: 'o-Acetylsalicylic acid, its salts and esters', specificity: 'narrow' },
  { cas: '50-81-7', name: 'Ascorbic acid', hs6: '293627', hsDescription: 'Vitamin C and its derivatives, unmixed', specificity: 'narrow' },
  { cas: '83-88-5', name: 'Riboflavin', hs6: '293623', hsDescription: 'Vitamin B2 and its derivatives, unmixed', specificity: 'narrow' },
  { cas: '68-19-9', name: 'Cyanocobalamin', hs6: '293626', hsDescription: 'Vitamin B12 and its derivatives, unmixed', specificity: 'narrow' },
  { cas: '59-02-9', name: 'Tocopherol', hs6: '293628', hsDescription: 'Vitamin E and its derivatives, unmixed', specificity: 'narrow' },
  { cas: '114-07-8', name: 'Erythromycin', hs6: '294150', hsDescription: 'Erythromycin and its derivatives; salts thereof', specificity: 'narrow' },
  { cas: '56-75-7', name: 'Chloramphenicol', hs6: '294140', hsDescription: 'Chloramphenicol and its derivatives; salts thereof', specificity: 'narrow' },
  { cas: '60-54-8', name: 'Tetracycline', hs6: '294130', hsDescription: 'Tetracyclines and their derivatives; salts thereof', specificity: 'group' },
  { cas: '26787-78-0', name: 'Amoxicillin', hs6: '294110', hsDescription: 'Penicillins and their derivatives; salts thereof', specificity: 'group' },
  { cas: '738-70-5', name: 'Trimethoprim', hs6: '293359', hsDescription: 'Compounds containing a pyrimidine or piperazine ring', specificity: 'group' },
] as const;

export function hsForCas(cas: string): HsMapping | undefined {
  return HS_BY_CAS.find((m) => m.cas === cas);
}

// ---------------------------------------------------------------------------
// Evidence weights
// ---------------------------------------------------------------------------

/**
 * How much each kind of evidence counts, 0..1.
 *
 * A closed deal is a price someone actually paid. A submitted quote is a price
 * someone was willing to offer. A customs aggregate is an average across every
 * grade, purity and counterparty in a tariff line. Ordering these honestly is
 * the single most important judgement in the whole engine.
 */
export const EVIDENCE_WEIGHT = {
  internal_deal: 1,
  internal_quote: 0.7,
  tender: 0.8,
  /** Halved again for group-level HS lines — see `customsWeight`. */
  customs: 0.5,
  listing: 0.3,
} as const;

export function customsWeight(specificity: HsSpecificity): number {
  return specificity === 'narrow' ? EVIDENCE_WEIGHT.customs : EVIDENCE_WEIGHT.customs * 0.5;
}

// ---------------------------------------------------------------------------
// UN Comtrade normalisation
// ---------------------------------------------------------------------------

/** The subset of a Comtrade row this connector relies on. */
export interface ComtradeRow {
  period: string; // "202401"
  reporterCode: number;
  flowCode: string; // M | X
  cmdCode: string;
  netWgt?: number | null;
  qty?: number | null;
  qtyUnitCode?: number | null;
  primaryValue?: number | null;
}

/**
 * Bounds outside which an implied unit value is treated as a data error rather
 * than a price. Comtrade net weights are sometimes zero, estimated, or in the
 * wrong unit; the resulting $0.0001/kg or $4m/kg must never reach a chart.
 */
export const PLAUSIBLE_USD_PER_KG = { min: 0.5, max: 250_000 } as const;

/** Comtrade quantity-unit code 8 is "kilogram"; anything else is not weight. */
const KG_UNIT_CODE = 8;

export interface NormalisedPrice {
  observedAt: Date;
  unitPriceUsdKg: number;
  quantityKg: number;
  rejected?: string;
}

/**
 * Turns one Comtrade row into an implied unit value, or explains why it cannot.
 * `netWgt` is always kilograms; `qty` is only usable when its unit code says kg.
 */
export function comtradeUnitValue(row: ComtradeRow): NormalisedPrice | { rejected: string } {
  const value = row.primaryValue;
  const kg = row.netWgt && row.netWgt > 0 ? row.netWgt : row.qtyUnitCode === KG_UNIT_CODE && row.qty && row.qty > 0 ? row.qty : 0;

  if (!value || value <= 0) return { rejected: 'no trade value' };
  if (kg <= 0) return { rejected: 'no net weight — a value without a quantity has no unit price' };

  const unitPriceUsdKg = value / kg;
  if (unitPriceUsdKg < PLAUSIBLE_USD_PER_KG.min || unitPriceUsdKg > PLAUSIBLE_USD_PER_KG.max) {
    return { rejected: `implied ${unitPriceUsdKg.toFixed(2)} USD/kg is outside the plausible range` };
  }

  const observedAt = periodToDate(row.period);
  if (!observedAt) return { rejected: `unparseable period "${row.period}"` };

  return { observedAt, unitPriceUsdKg: Math.round(unitPriceUsdKg * 100) / 100, quantityKg: Math.round(kg) };
}

/** "202401" or "2024" → the first day of that month/year, UTC. */
export function periodToDate(period: string): Date | null {
  if (/^\d{6}$/.test(period)) {
    const y = Number(period.slice(0, 4));
    const m = Number(period.slice(4, 6));
    if (m < 1 || m > 12) return null;
    return new Date(Date.UTC(y, m - 1, 1));
  }
  if (/^\d{4}$/.test(period)) return new Date(Date.UTC(Number(period), 0, 1));
  return null;
}

/** Stable natural key so re-ingesting the same Comtrade cell updates, not duplicates. */
export function comtradeRef(row: ComtradeRow): string {
  return `comtrade:${row.reporterCode}:${row.flowCode}:${row.cmdCode}:${row.period}`;
}

// ---------------------------------------------------------------------------
// openFDA normalisation
// ---------------------------------------------------------------------------

export interface ShortageRecord {
  generic_name?: string;
  company_name?: string;
  status?: string;
  update_date?: string;
  initial_posting_date?: string;
  discontinued_date?: string;
  related_info?: string;
  package_ndc?: string;
}

export interface EnforcementRecord {
  recall_number?: string;
  classification?: string;
  recalling_firm?: string;
  product_description?: string;
  reason_for_recall?: string;
  recall_initiation_date?: string;
  status?: string;
}

export interface NormalisedEvent {
  subject: string;
  company: string | null;
  eventType: 'shortage' | 'discontinuation' | 'recall';
  severity: 'low' | 'medium' | 'high';
  occurredAt: Date;
  detail: string | null;
  sourceRef: string;
}

/**
 * A "To Be Discontinued" row is a permanent exit from the market; "Currently in
 * Shortage" is a live squeeze; "Resolved" is history that still carries decayed
 * weight. They are different events and are not collapsed into one.
 */
export function normaliseShortage(r: ShortageRecord): NormalisedEvent | null {
  const subject = (r.generic_name ?? '').trim();
  if (!subject) return null;
  const occurredAt = parseUsDate(r.update_date ?? r.initial_posting_date ?? r.discontinued_date);
  if (!occurredAt) return null;
  const ref = r.package_ndc ? `openfda-shortage:${r.package_ndc}:${r.update_date ?? ''}` : `openfda-shortage:${subject}:${r.update_date ?? ''}`;

  const status = (r.status ?? '').toLowerCase();
  const discontinued = status.includes('discontinued');
  return {
    subject,
    company: r.company_name?.trim() || null,
    eventType: discontinued ? 'discontinuation' : 'shortage',
    severity: status.includes('currently in shortage') ? 'high' : discontinued ? 'medium' : 'low',
    occurredAt,
    detail: r.related_info?.trim() || r.status?.trim() || null,
    sourceRef: ref,
  };
}

/** FDA recall classes map directly onto severity: Class I is a health hazard. */
export function normaliseEnforcement(r: EnforcementRecord): NormalisedEvent | null {
  const subject = (r.product_description ?? '').trim();
  if (!subject || !r.recall_number) return null;
  const occurredAt = parseIsoBasic(r.recall_initiation_date);
  if (!occurredAt) return null;
  return {
    subject: subject.slice(0, 300),
    company: r.recalling_firm?.trim() || null,
    eventType: 'recall',
    severity: recallSeverity(r.classification),
    occurredAt,
    detail: r.reason_for_recall?.trim().slice(0, 500) || null,
    sourceRef: `openfda-recall:${r.recall_number}`,
  };
}

/**
 * Class I = reasonable probability of serious harm, Class III = unlikely to
 * cause harm. Matched as a whole token: "class iii" *contains* "class ii", so a
 * substring test silently grades the mildest recalls as medium.
 */
function recallSeverity(classification: string | undefined): 'low' | 'medium' | 'high' {
  const m = /\bclass\s+(i{1,3})\b/i.exec(classification ?? '');
  if (m?.[1].toLowerCase() === 'i') return 'high';
  if (m?.[1].toLowerCase() === 'ii') return 'medium';
  return 'low';
}

/** openFDA shortage dates are "MM/DD/YYYY"; enforcement dates are "YYYYMMDD". */
export function parseUsDate(value: string | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return parseIsoBasic(value);
  const d = new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseIsoBasic(value: string | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Matches a free-text upstream product name to a molecule we track.
 *
 * Deliberately conservative: whole-word match on the molecule name only. FDA
 * strings look like "Amoxicillin and Clavulanate Potassium Tablet", and a
 * substring match would tie "Tetracycline" to "Oxytetracycline" — a different
 * molecule with a different supply base. An unmatched event is kept as a
 * market-wide event rather than misfiled against the wrong CAS.
 */
export function matchMolecule(text: string, catalogue: readonly { cas: string; name: string }[] = HS_BY_CAS): string | null {
  const haystack = text.toLowerCase();
  for (const m of catalogue) {
    const needle = m.name.toLowerCase();
    const re = new RegExp(`(^|[^a-z])${escapeRegex(needle)}([^a-z]|$)`);
    if (re.test(haystack)) return m.cas;
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
