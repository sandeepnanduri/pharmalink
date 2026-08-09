/**
 * Derivations from a product's human-readable fields into the machine-readable
 * twins the catalogue filters actually query — pure, no DB/Next imports.
 *
 * The catalogue has a long-standing asymmetry: `filters.ts` renders sections for
 * segment, therapeutic area, dose form, excipient function, purity range, cold
 * chain and incoterms, and `catalog-queries.ts` queries every one of them — but
 * nothing on the write side ever set the columns. Every listing on the platform
 * is `productType: 'api', facet: null`, so eight filter sections return nothing.
 *
 * The cause is structural rather than an oversight: the product form, the server
 * action, the CSV importer and the seed each build their own object literal, so
 * a column added to the schema has four places it can be forgotten. This module
 * is the shared derivation layer all four now go through, so a field can only be
 * missed in one place instead of four.
 */

import { parseNumber } from './numbers';
import { PRODUCT_TYPES, isProductType, resolveFacet, segment, type ProductType } from './taxonomy';

// ---------------------------------------------------------------------------
// Segment and facet
// ---------------------------------------------------------------------------

/**
 * The legacy `Product.category` vocabulary predates the taxonomy and is still
 * what the quick-add form posts and what every seeded row carries. Mapping it
 * forward means existing listings get a real segment without anyone re-entering
 * them.
 */
const CATEGORY_TO_TYPE: Record<string, ProductType> = {
  api: 'api',
  intermediate: 'intermediate',
  ksm: 'ksm',
  excipient: 'excipient',
  'raw material': 'raw_material',
  'finished dose form': 'fdf',
  fdf: 'fdf',
  specialty: 'specialty',
};

/** Legacy category → segment. Defaults to `api`, which is what the column already defaults to. */
export function productTypeFromCategory(category: string | null | undefined): ProductType {
  const key = (category ?? '').trim().toLowerCase();
  return CATEGORY_TO_TYPE[key] ?? 'api';
}

/**
 * The reverse, so the legacy column stays consistent when a seller picks a
 * segment. Two columns holding the same fact is a data-integrity bug
 * (schema.prisma:184-188); until `category` can be dropped, it is derived from
 * the segment rather than being a second thing anyone can set independently.
 */
const TYPE_TO_CATEGORY: Record<ProductType, string> = {
  api: 'API',
  ksm: 'KSM',
  intermediate: 'Intermediate',
  excipient: 'Excipient',
  raw_material: 'Raw Material',
  fdf: 'FDF',
  specialty: 'Specialty',
};

export function categoryFromProductType(type: ProductType): string {
  return TYPE_TO_CATEGORY[type] ?? 'API';
}

export function parseProductType(raw: string | null | undefined): ProductType | null {
  const key = (raw ?? '').trim().toLowerCase();
  if (isProductType(key)) return key;
  return CATEGORY_TO_TYPE[key] ?? null;
}

/**
 * Validates a facet **against its segment**.
 *
 * There is no database constraint tying the two columns together — the pairing
 * is a convention. Without this check a KSM could carry `facet: 'tablet'`, which
 * silently makes it appear under a dose-form filter it has no business in.
 */
export function validFacetFor(type: ProductType, facet: string | null | undefined): string | null {
  const value = (facet ?? '').trim();
  if (!value) return null;
  const options = segment(type)?.facet?.options;
  if (!options) return null; // ksm, intermediate, raw_material and specialty have no facet
  return options.some((o) => o.id === value) ? value : null;
}

/** Words too short or too common to identify a facet on their own. */
const MIN_TOKEN = 4;

const tokens = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN);

/**
 * Best-effort facet from free text — a therapeutic category, a dose form or an
 * excipient function, depending on the segment. Used when importing, where the
 * curator writes "Antidiabetic" or "Diluent / Filler" rather than a node id.
 *
 * Tries the shared `resolveFacet` first, then falls back to word overlap
 * **within the segment's own options**. The fallback lives here rather than in
 * `taxonomy.ts` for two reasons: `resolveFacet` also backs free-text catalogue
 * search, where a looser match would start reinterpreting buyers' queries; and
 * scoping to one segment's 8–13 options makes a cross-segment mismatch
 * impossible by construction rather than by a later check.
 */
export function resolveFacetFor(type: ProductType, raw: string | null | undefined): string | null {
  const exact = resolveFacet(raw ?? '');
  const validated = exact ? validFacetFor(type, exact.node.id) : null;
  if (validated) return validated;

  const options = segment(type)?.facet?.options;
  if (!options) return null;

  const cellWords = new Set(tokens(raw ?? ''));
  if (cellWords.size === 0) return null;

  // Longest shared word wins, so "Diluent / Filler" prefers the option whose
  // label is "Filler / diluent" over one that merely shares a short word.
  let best: { id: string; score: number } | null = null;
  for (const option of options) {
    for (const word of tokens(option.label)) {
      if (cellWords.has(word) && (!best || word.length > best.score)) {
        best = { id: option.id, score: word.length };
      }
    }
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------
// Lead time
// ---------------------------------------------------------------------------

const LEAD_UNIT_DAYS: Record<string, number> = {
  day: 1,
  days: 1,
  d: 1,
  week: 7,
  weeks: 7,
  wk: 7,
  wks: 7,
  w: 7,
  month: 30,
  months: 30,
  mo: 30,
};

/**
 * `2–3 weeks` → 21. `10 days` → 10. `4-5 weeks` → 35.
 *
 * **A range resolves to its upper bound, deliberately.** The filter this feeds
 * is "maximum lead time", so a buyer asking for 21 days must not be shown a
 * supplier quoting 3–5 weeks. Taking the optimistic end would make the filter
 * quietly wrong in the direction that costs the buyer a delivery date.
 *
 * A bare number with no unit is refused rather than assumed: "4" is four weeks
 * to a supplier writing a lead time and four days to one writing a despatch
 * time, and the difference matters.
 */
export function parseLeadTimeDays(raw: string | null | undefined): number | null {
  const text = (raw ?? '').trim().toLowerCase();
  if (!text) return null;

  const unitMatch = /\b(days?|d|weeks?|wks?|w|months?|mo)\b/.exec(text);
  if (!unitMatch) return null;
  const perUnit = LEAD_UNIT_DAYS[unitMatch[1]];
  if (!perUnit) return null;

  // Every number before the unit; the last one is the upper bound of a range.
  const head = text.slice(0, unitMatch.index);
  const numbers = head.match(/\d+(?:\.\d+)?/g);
  if (!numbers?.length) return null;

  const upper = Number(numbers[numbers.length - 1]);
  if (!Number.isFinite(upper) || upper <= 0) return null;
  return Math.round(upper * perUnit);
}

/** Renders days back as the phrase a seller would recognise, for the export path. */
export function formatLeadTime(days: number | null | undefined): string | null {
  if (!days || days <= 0) return null;
  if (days % 7 === 0) {
    const weeks = days / 7;
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

/**
 * `99.8%` → 99.8. `≥99.5% (USP 2024)` → 99.5. `NLT 98.0%` → 98.
 *
 * The numeric twin of the human-readable `purity` string, so the purity range
 * filter has something to compare. The string stays authoritative for display —
 * it carries the pharmacopoeia and the year, which the number cannot.
 */
export function parsePurityPct(raw: string | null | undefined): number | null {
  const text = (raw ?? '').trim().replace(/^(?:nlt|not less than|min\.?)\s*/i, '');
  if (!text) return null;
  const r = parseNumber(text);
  if (r.value == null) return null;
  return r.value > 0 && r.value <= 100 ? r.value : null;
}

// ---------------------------------------------------------------------------
// Small controlled vocabularies that live on Product
// ---------------------------------------------------------------------------

export const COLD_CHAIN_VALUES = ['ambient', 'refrigerated', 'frozen', 'ultracold'] as const;
export type ColdChain = (typeof COLD_CHAIN_VALUES)[number];

export function parseColdChain(raw: string | null | undefined): ColdChain | null {
  const text = (raw ?? '').trim().toLowerCase();
  if (!text) return null;
  if (/ultra[\s-]?cold|-80|minus 80/.test(text)) return 'ultracold';
  if (/frozen|-20|minus 20/.test(text)) return 'frozen';
  if (/refrigerat|chilled|2\s*[–-]\s*8|cold chain/.test(text)) return 'refrigerated';
  if (/ambient|room temp|15\s*[–-]\s*25|no \(ambient\)/.test(text)) return 'ambient';
  return null;
}

export const STOCK_STATUS_VALUES = ['in_stock', 'made_to_order', 'low'] as const;
export type StockStatus = (typeof STOCK_STATUS_VALUES)[number];

/**
 * Note the `[\s_-]?` separators: these parsers must accept their own canonical
 * output. `in_stock` is what the column stores and therefore what a CSV export
 * emits, so a parser that only recognised "in stock" would silently drop the
 * value on re-import — the export/import round-trip is where that shows up.
 */
export function parseStockStatus(raw: string | null | undefined): StockStatus | null {
  const text = (raw ?? '').trim().toLowerCase();
  if (!text) return null;
  if (/low[\s_-]?stock|limited|^low$/.test(text)) return 'low';
  if (/in[\s_-]?stock|available|ready/.test(text)) return 'in_stock';
  if (/made[\s_-]?to[\s_-]?order|on[\s_-]?order|campaign|mto/.test(text)) return 'made_to_order';
  return null;
}

/** Every segment id, for building a `<select>` without importing the whole taxonomy. */
export const PRODUCT_TYPE_VALUES: readonly ProductType[] = PRODUCT_TYPES;
