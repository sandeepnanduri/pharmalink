/**
 * Catalogue filter framework — pure, unit tested, no DB.
 *
 * Built from the team's 15-section spec, with one governing constraint applied
 * throughout: **a filter that hides suppliers must be backed by data the
 * platform actually holds.** A "no FDA import alert" toggle that silently
 * matches everything because nobody populated the field is worse than no toggle
 * — it tells a buyer a compliance check happened when it did not.
 *
 * So every filter declares its `backing`:
 *   - `verified`  the value is checked by ops or by an external feed
 *   - `declared`  the supplier stated it; shown with a "supplier-stated" note
 *   - `derived`   computed from platform activity (prices, orders)
 *
 * The UI shows the backing next to the section, and `assertBacked` refuses to
 * register a filter without one.
 */

import { DOSE_FORMS, EXCIPIENT_FUNCTIONS, SEGMENTS, THERAPEUTIC_AREAS } from './taxonomy';

export type Backing = 'verified' | 'declared' | 'derived';
export type FilterKind = 'multi' | 'single' | 'range' | 'toggle';

export interface FilterOption {
  value: string;
  label: string;
  /** Optional hint shown under the option — used for regulatory scope. */
  note?: string;
}

export interface FilterSection {
  key: string;
  label: string;
  kind: FilterKind;
  backing: Backing;
  options?: FilterOption[];
  /** For ranges: unit shown beside the inputs. */
  unit?: string;
  /** Why this filter exists, in the buyer's terms. Shown as help text. */
  why?: string;
  /** Collapsed by default — the long tail that most buyers never open. */
  advanced?: boolean;
}

const opt = (value: string, label: string, note?: string): FilterOption => ({ value, label, note });

/** GMP schemes, each scoped to the market it actually governs. */
export const GMP_CERTS: FilterOption[] = [
  opt('US FDA GMP', 'US FDA GMP', '21 CFR 210/211 — US market'),
  opt('EU GMP', 'EU GMP', 'EudraGMDP — EU/EEA market'),
  opt('WHO GMP', 'WHO Prequalification', 'UN, Global Fund, emerging markets'),
  opt('ICH Q7', 'ICH Q7', 'API GMP guide for regulated markets'),
  opt('PMDA', 'PMDA (Japan)', 'Japanese market'),
  opt('Health Canada GMP', 'Health Canada', 'Canadian market'),
  opt('TGA', 'TGA (Australia)', 'Australian market'),
  opt('ANVISA', 'ANVISA (Brazil)', 'Brazilian market'),
  opt('SFDA', 'SFDA (Saudi Arabia)', 'GCC markets'),
  opt('SAHPRA', 'SAHPRA (South Africa)', 'Sub-Saharan Africa'),
  opt('CDSCO Schedule M', 'CDSCO Schedule M', 'India domestic'),
];

/** Regulatory filings — the strongest signal that a supplier can actually ship. */
export const FILINGS: FilterOption[] = [
  opt('dmf', 'Active US DMF (Type II)', 'Drug Master File filed with the FDA'),
  opt('asmf', 'European ASMF filed', 'Active Substance Master File'),
  opt('cep', 'CEP / COS (EDQM)', 'Ph.Eur. compliance certified by EDQM'),
  opt('copp', 'CoPP available', 'Certificate of Pharmaceutical Product'),
];

export const PHARMACOPOEIA: FilterOption[] = ['USP', 'BP', 'Ph.Eur', 'IP', 'JP'].map((p) => opt(p, p));

export const INCOTERMS: FilterOption[] = ['EXW', 'FCA', 'FOB', 'CIF', 'CFR', 'DAP', 'DDP'].map((i) => opt(i, i));

export const COLD_CHAIN: FilterOption[] = [
  opt('ambient', 'Ambient (15–25 °C)'),
  opt('refrigerated', 'Refrigerated (2–8 °C)'),
  opt('frozen', 'Frozen (below −20 °C)'),
  opt('ultracold', 'Ultra-cold (below −80 °C)'),
];

/**
 * The sections, in the order a procurement head actually narrows.
 *
 * Ordering is deliberate and not the spec's: certification and filings come
 * FIRST because an uncertified supplier is not a cheaper supplier, it is an
 * unusable one. Price sits below them so the screen cannot be read as
 * "cheapest first, compliance later".
 */
export const FILTER_SECTIONS: FilterSection[] = [
  {
    key: 'type',
    label: 'Product segment',
    kind: 'multi',
    backing: 'verified',
    options: SEGMENTS.map((s) => opt(s.type, s.label, s.scope)),
    why: 'Segment determines which GMP annexe and filings apply.',
  },
  {
    key: 'therapeuticArea',
    label: 'Therapeutic area',
    kind: 'multi',
    backing: 'declared',
    options: THERAPEUTIC_AREAS.map((t) => opt(t.id, t.label)),
  },
  {
    key: 'doseForm',
    label: 'Dose form',
    kind: 'multi',
    backing: 'declared',
    options: DOSE_FORMS.map((d) => opt(d.id, d.label)),
    advanced: true,
  },
  {
    key: 'excipientFunction',
    label: 'Excipient function',
    kind: 'multi',
    backing: 'declared',
    options: EXCIPIENT_FUNCTIONS.map((e) => opt(e.id, e.label)),
    advanced: true,
  },
  {
    key: 'cert',
    label: 'GMP certification',
    kind: 'multi',
    backing: 'verified',
    options: GMP_CERTS,
    why: 'A supplier must hold EVERY certificate you select. Each is checked against the issuing authority.',
  },
  {
    key: 'filing',
    label: 'Regulatory filings',
    kind: 'multi',
    backing: 'verified',
    options: FILINGS,
    why: 'A filed DMF or CEP is what lets your regulatory team reference this supplier in a submission.',
  },
  {
    key: 'noRegulatoryAction',
    label: 'No open regulatory action',
    kind: 'toggle',
    backing: 'verified',
    why: 'Excludes suppliers with a current FDA import alert, an open warning letter, or an EU GMP non-compliance.',
  },
  {
    key: 'pharmacopoeia',
    label: 'Pharmacopoeial grade',
    kind: 'multi',
    backing: 'declared',
    options: PHARMACOPOEIA,
  },
  { key: 'purity', label: 'Minimum purity', kind: 'range', backing: 'declared', unit: '%' },
  { key: 'country', label: 'Country of origin', kind: 'multi', backing: 'verified' },
  { key: 'price', label: 'Price', kind: 'range', backing: 'derived', unit: 'USD/kg' },
  { key: 'moq', label: 'Maximum MOQ', kind: 'range', backing: 'declared', unit: 'kg' },
  { key: 'leadTime', label: 'Maximum lead time', kind: 'range', backing: 'declared', unit: 'days' },
  { key: 'incoterm', label: 'Incoterms offered', kind: 'multi', backing: 'declared', options: INCOTERMS, advanced: true },
  { key: 'coldChain', label: 'Cold chain', kind: 'multi', backing: 'declared', options: COLD_CHAIN, advanced: true },
  { key: 'sampleAvailable', label: 'Sample available', kind: 'toggle', backing: 'declared' },
  {
    key: 'matchScore',
    label: 'Minimum match score',
    kind: 'range',
    backing: 'derived',
    why: 'Computed from your own requirement — see the score breakdown for the components.',
  },
];

export function sectionByKey(key: string): FilterSection | undefined {
  return FILTER_SECTIONS.find((s) => s.key === key);
}

/** Throws at module load if a section forgets its backing — a build-time guard. */
export function assertBacked(sections: FilterSection[] = FILTER_SECTIONS): void {
  const bad = sections.filter((s) => !['verified', 'declared', 'derived'].includes(s.backing));
  if (bad.length) throw new Error(`Filter sections without a backing: ${bad.map((s) => s.key).join(', ')}`);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParsedFilters {
  type: string[];
  therapeuticArea: string[];
  doseForm: string[];
  excipientFunction: string[];
  cert: string[];
  filing: string[];
  pharmacopoeia: string[];
  country: string[];
  incoterm: string[];
  coldChain: string[];
  purityMin: number | null;
  priceMin: number | null;
  priceMax: number | null;
  moqMax: number | null;
  leadTimeMax: number | null;
  matchMin: number | null;
  noRegulatoryAction: boolean;
  sampleAvailable: boolean;
  q: string;
  sort: SortKey;
}

export const SORTS = {
  relevance: 'Best match',
  price_low: 'Price, low to high',
  price_high: 'Price, high to low',
  lead_time: 'Shortest lead time',
  moq_low: 'Lowest minimum order',
  newest: 'Recently listed',
} as const;
export type SortKey = keyof typeof SORTS;

export function isSortKey(v: string): v is SortKey {
  return Object.keys(SORTS).includes(v);
}

type Raw = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

/**
 * Numbers arrive from a URL, so they are attacker-controlled. Anything not
 * finite and in range becomes null rather than NaN — a NaN reaching Prisma
 * produces a confusing 500 instead of an ignored filter.
 */
function num(v: string | string[] | undefined, min: number, max: number): number | null {
  const raw = Array.isArray(v) ? v[0] : v;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export function parseFilters(sp: Raw): ParsedFilters {
  const sortRaw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  return {
    type: list(sp.type),
    therapeuticArea: list(sp.therapeuticArea),
    doseForm: list(sp.doseForm),
    excipientFunction: list(sp.excipientFunction),
    cert: list(sp.cert),
    filing: list(sp.filing),
    pharmacopoeia: list(sp.pharmacopoeia),
    country: list(sp.country),
    incoterm: list(sp.incoterm),
    coldChain: list(sp.coldChain),
    purityMin: num(sp.purityMin, 0, 100),
    priceMin: num(sp.priceMin, 0, 1_000_000),
    priceMax: num(sp.priceMax, 0, 1_000_000),
    moqMax: num(sp.moqMax, 0, 1_000_000),
    leadTimeMax: num(sp.leadTimeMax, 0, 3650),
    matchMin: num(sp.matchMin, 0, 100),
    noRegulatoryAction: list(sp.noRegulatoryAction).includes('1'),
    sampleAvailable: list(sp.sampleAvailable).includes('1'),
    q: (Array.isArray(sp.q) ? sp.q[0] : sp.q ?? '').trim().slice(0, 120),
    sort: sortRaw && isSortKey(sortRaw) ? sortRaw : 'relevance',
  };
}

/** How many filters are actually narrowing the result — drives the "clear" affordance. */
export function activeCount(f: ParsedFilters): number {
  let n = 0;
  for (const k of ['type', 'therapeuticArea', 'doseForm', 'excipientFunction', 'cert', 'filing', 'pharmacopoeia', 'country', 'incoterm', 'coldChain'] as const) {
    n += f[k].length;
  }
  for (const k of ['purityMin', 'priceMin', 'priceMax', 'moqMax', 'leadTimeMax', 'matchMin'] as const) {
    if (f[k] != null) n++;
  }
  if (f.noRegulatoryAction) n++;
  if (f.sampleAvailable) n++;
  if (f.q) n++;
  return n;
}

/**
 * Quick chips — pre-set combinations for the most common intents.
 *
 * Every chip maps to real filters; none is a badge the platform cannot back.
 * The spec's "🔥 Top Rated" and "🏅 Platinum" chips are omitted because there is
 * no rating or tier data yet — a chip that filters to everything is a lie.
 */
export const QUICK_CHIPS: { id: string; label: string; params: Record<string, string | string[]> }[] = [
  { id: 'fda', label: 'US FDA GMP', params: { cert: 'US FDA GMP' } },
  { id: 'eu', label: 'EU GMP', params: { cert: 'EU GMP' } },
  { id: 'dmf', label: 'Has US DMF', params: { filing: 'dmf' } },
  { id: 'cep', label: 'Has CEP', params: { filing: 'cep' } },
  { id: 'clean', label: 'No regulatory action', params: { noRegulatoryAction: '1' } },
  { id: 'sample', label: 'Sample available', params: { sampleAvailable: '1' } },
  { id: 'api', label: 'APIs only', params: { type: 'api' } },
  { id: 'excipient', label: 'Excipients only', params: { type: 'excipient' } },
];

/** Serialises filters back to a query string, dropping empties so URLs stay short. */
export function toQuery(f: Partial<ParsedFilters>): string {
  const p = new URLSearchParams();
  const push = (k: string, v: unknown) => {
    if (v == null || v === '' || v === false) return;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
    else p.set(k, v === true ? '1' : String(v));
  };
  for (const [k, v] of Object.entries(f)) if (k !== 'sort' || v !== 'relevance') push(k, v);
  return p.toString();
}
