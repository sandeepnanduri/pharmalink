/**
 * Product taxonomy — pure, no DB, unit tested.
 *
 * ## Why this exists rather than an IndiaMART import
 *
 * The team asked for IndiaMART's category coverage. IndiaMART's Terms of Use
 * prohibit systematic retrieval of their content to build a directory —
 * explicitly including manual collection — so their pages are not a source we
 * can draw from. What IS reusable is the SHAPE of the market: the top-level
 * segments a pharma buyer searches by. Those are industry vocabulary, not
 * anyone's property, and they are reconstructed here from the classifications
 * used by public bodies:
 *
 *   - Pharmexcil's own export panels (bulk drugs/APIs, formulations, excipients)
 *   - The Bulk Drug Manufacturers Association's product scope
 *   - USP/BP/Ph.Eur monograph classes for grade
 *   - ICH Q7 for what counts as an API vs an intermediate vs a KSM
 *   - WHO ATC for therapeutic grouping
 *
 * The five top-level segments are the ones the team named: API, Key Starting
 * Material, Pharma Raw Material, Excipient, Finished Dose.
 */

export type ProductType = 'api' | 'ksm' | 'intermediate' | 'excipient' | 'raw_material' | 'fdf' | 'specialty';

export interface TaxonomyNode {
  id: string;
  label: string;
  /** Search terms a buyer might type that should land on this node. */
  synonyms: string[];
  children?: TaxonomyNode[];
}

/**
 * Therapeutic areas for APIs — the WHO ATC top level, trimmed to the classes
 * that actually appear in generic API trade. A buyer sourcing an oncology API
 * has different GMP and containment requirements from one sourcing an antacid,
 * which is why this drives filters rather than being cosmetic.
 */
export const THERAPEUTIC_AREAS: TaxonomyNode[] = [
  { id: 'antidiabetic', label: 'Antidiabetic', synonyms: ['diabetes', 'metformin', 'gliptin'] },
  { id: 'cardiovascular', label: 'Cardiovascular', synonyms: ['cardiac', 'statin', 'antihypertensive'] },
  { id: 'cns', label: 'CNS / Neurology', synonyms: ['neuro', 'psychiatric', 'antiepileptic'] },
  { id: 'oncology', label: 'Oncology', synonyms: ['cytotoxic', 'anticancer', 'onco'] },
  { id: 'anti-infective', label: 'Anti-infectives', synonyms: ['antibiotic', 'antibacterial', 'penicillin', 'cephalosporin'] },
  { id: 'respiratory', label: 'Respiratory', synonyms: ['asthma', 'bronchodilator', 'copd'] },
  { id: 'gastrointestinal', label: 'Gastrointestinal', synonyms: ['gi', 'antacid', 'ppi', 'proton pump'] },
  { id: 'anti-inflammatory', label: 'Anti-inflammatory', synonyms: ['nsaid', 'analgesic', 'painkiller'] },
  { id: 'ophthalmology', label: 'Ophthalmology', synonyms: ['ocular', 'eye'] },
  { id: 'hormones', label: 'Hormones / Steroids', synonyms: ['steroid', 'corticosteroid', 'hormone'] },
  { id: 'antiviral', label: 'Antivirals', synonyms: ['hiv', 'antiretroviral', 'hepatitis'] },
  { id: 'dermatology', label: 'Dermatology', synonyms: ['topical', 'skin'] },
  { id: 'vitamins', label: 'Vitamins & Nutraceuticals', synonyms: ['vitamin', 'supplement', 'nutraceutical'] },
];

/** Finished dose forms — determines packaging, stability and GMP annexe. */
export const DOSE_FORMS: TaxonomyNode[] = [
  { id: 'tablet', label: 'Tablet', synonyms: ['tab', 'caplet'] },
  { id: 'capsule-hard', label: 'Capsule (hard)', synonyms: ['capsule', 'hard gelatin'] },
  { id: 'capsule-soft', label: 'Capsule (soft gel)', synonyms: ['softgel', 'soft gelatin'] },
  { id: 'injectable-iv', label: 'Injectable (IV)', synonyms: ['intravenous', 'infusion'] },
  { id: 'injectable-im', label: 'Injectable (IM/SC)', synonyms: ['intramuscular', 'subcutaneous'] },
  { id: 'oral-liquid', label: 'Oral liquid', synonyms: ['syrup', 'suspension', 'solution'] },
  { id: 'topical', label: 'Topical / cream', synonyms: ['ointment', 'gel', 'cream'] },
  { id: 'transdermal', label: 'Transdermal patch', synonyms: ['patch'] },
  { id: 'ophthalmic', label: 'Ophthalmic', synonyms: ['eye drop'] },
  { id: 'inhalation', label: 'Inhalation', synonyms: ['mdi', 'dpi', 'nebuliser'] },
];

/** Excipient functions — how the buyer actually searches for them. */
export const EXCIPIENT_FUNCTIONS: TaxonomyNode[] = [
  { id: 'binder', label: 'Binder', synonyms: ['povidone', 'starch'] },
  { id: 'filler', label: 'Filler / diluent', synonyms: ['mcc', 'lactose', 'microcrystalline cellulose'] },
  { id: 'disintegrant', label: 'Disintegrant', synonyms: ['croscarmellose', 'sodium starch glycolate'] },
  { id: 'lubricant', label: 'Lubricant / glidant', synonyms: ['magnesium stearate', 'silica'] },
  { id: 'coating', label: 'Coating / film former', synonyms: ['hpmc', 'opadry'] },
  { id: 'preservative', label: 'Preservative', synonyms: ['paraben', 'benzoate'] },
  { id: 'solvent', label: 'Solvent / vehicle', synonyms: ['propylene glycol', 'peg'] },
  { id: 'surfactant', label: 'Surfactant', synonyms: ['polysorbate', 'sls'] },
];

export interface ProductSegment {
  type: ProductType;
  label: string;
  /** One line explaining what belongs here — shown as filter help text. */
  scope: string;
  synonyms: string[];
  /** The sub-facet this segment is filtered by, if any. */
  facet?: { key: string; label: string; options: TaxonomyNode[] };
}

/** The five segments the team named, plus the two the framework needs to be complete. */
export const SEGMENTS: ProductSegment[] = [
  {
    type: 'api',
    label: 'Active Pharmaceutical Ingredients',
    scope: 'The substance responsible for the therapeutic effect, as defined by ICH Q7.',
    synonyms: ['api', 'active', 'bulk drug', 'drug substance'],
    facet: { key: 'therapeuticArea', label: 'Therapeutic area', options: THERAPEUTIC_AREAS },
  },
  {
    type: 'ksm',
    label: 'Key Starting Materials',
    scope: 'A raw material or intermediate incorporated as a significant structural fragment of the API.',
    synonyms: ['ksm', 'key starting material', 'starting material'],
  },
  {
    type: 'intermediate',
    label: 'Intermediates',
    scope: 'A material produced during API synthesis that undergoes further molecular change before becoming the API.',
    synonyms: ['intermediate', 'advanced intermediate'],
  },
  {
    type: 'raw_material',
    label: 'Pharma Raw Materials',
    scope: 'Solvents, reagents and process chemicals consumed in manufacture but not present in the final product.',
    synonyms: ['raw material', 'pharma raw material', 'reagent', 'solvent', 'process chemical'],
  },
  {
    type: 'excipient',
    label: 'Excipients',
    scope: 'Inactive substances formulated alongside the API — binders, fillers, coatings and the rest.',
    synonyms: ['excipient', 'inactive ingredient', 'formulation aid'],
    facet: { key: 'excipientFunction', label: 'Function', options: EXCIPIENT_FUNCTIONS },
  },
  {
    type: 'fdf',
    label: 'Finished Dose Forms',
    scope: 'Product ready for patient administration — the packaged, dosed form.',
    synonyms: ['fdf', 'finished dose', 'finished formulation', 'finished product'],
    facet: { key: 'doseForm', label: 'Dose form', options: DOSE_FORMS },
  },
  {
    type: 'specialty',
    label: 'Specialty & Niche Chemicals',
    scope: 'High-potency, controlled or otherwise specialised materials needing dedicated handling.',
    synonyms: ['specialty', 'niche', 'hpapi', 'high potency'],
  },
];

export const PRODUCT_TYPES: ProductType[] = SEGMENTS.map((s) => s.type);

export function segment(type: string): ProductSegment | undefined {
  return SEGMENTS.find((s) => s.type === type);
}

export function isProductType(value: string): value is ProductType {
  return (PRODUCT_TYPES as string[]).includes(value);
}

/**
 * Resolves a free-text search term to a segment, so "bulk drug" and
 * "pharma raw material" both land somewhere sensible rather than returning
 * nothing. Exact label match wins, then synonym containment, longest first so
 * "key starting material" beats "material".
 */
export function resolveSegment(term: string): ProductSegment | null {
  const q = term.trim().toLowerCase();
  if (!q) return null;
  const exact = SEGMENTS.find((s) => s.label.toLowerCase() === q || s.type === q);
  if (exact) return exact;
  const candidates = SEGMENTS.flatMap((s) => s.synonyms.map((syn) => ({ s, syn })))
    .filter(({ syn }) => q.includes(syn))
    .sort((a, b) => b.syn.length - a.syn.length);
  return candidates[0]?.s ?? null;
}

/**
 * The human label for a `(productType, facet)` pair, or null.
 *
 * Null covers three cases that all render the same way: the segment has no
 * facet (KSM, intermediate, raw material, specialty), the listing has not stated
 * one, or the stored value does not belong to this segment. Callers show
 * nothing rather than a raw id.
 */
export function facetLabel(type: string, facet: string | null | undefined): string | null {
  if (!facet) return null;
  return segment(type)?.facet?.options.find((o) => o.id === facet)?.label ?? null;
}

/** Flattens every node so search can match a facet as well as a segment. */
export function allFacetOptions(): { segment: ProductType; key: string; node: TaxonomyNode }[] {
  return SEGMENTS.flatMap((s) => (s.facet ? s.facet.options.map((node) => ({ segment: s.type, key: s.facet!.key, node })) : []));
}

export function resolveFacet(term: string): { segment: ProductType; key: string; node: TaxonomyNode } | null {
  const q = term.trim().toLowerCase();
  if (!q) return null;
  const all = allFacetOptions();
  const exact = all.find((o) => o.node.label.toLowerCase() === q || o.node.id === q);
  if (exact) return exact;
  return (
    all
      .flatMap((o) => o.node.synonyms.map((syn) => ({ o, syn })))
      .filter(({ syn }) => q.includes(syn))
      .sort((a, b) => b.syn.length - a.syn.length)[0]?.o ?? null
  );
}
