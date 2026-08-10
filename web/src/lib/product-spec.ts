/**
 * The product spec registry — pure, no DB/Next imports.
 *
 * ## Why this exists
 *
 * The v3 curation template describes a product across four sheets (API, FDC,
 * KSM/Intermediate, Raw Material/Excipient) totalling ~250 column slots, of
 * which roughly 140 are distinct. Promoting all of them to Prisma columns would
 * add ~140 nullable columns that nothing ever queries; leaving them out would
 * discard the data buyers actually evaluate on.
 *
 * So a field earns a **real column** if and only if one of these is true:
 *
 *   1. a query predicate reads it (`where` / `orderBy` / `groupBy`)
 *   2. an analytics or scoring function consumes it
 *   3. it is a foreign key or an idempotency key
 *   4. the template gives it a validation rule we enforce — if we reject a row
 *      over a value, we must store it in the shape we validated
 *   5. it is a badge or lede above the fold, where a per-row JSON parse costs
 *
 * Everything else lives in `Product.specJson` — JSON held as text, following
 * the `Deal.termsJson` precedent, because this schema has no `Json` columns and
 * Postgres portability is a stated goal.
 *
 * Two corollaries, both load-bearing:
 *
 *   - **Never add a filter section for a blob field.** `filters.ts` already
 *     refuses a filter without a backing. So promoting blob → column is the
 *     deliberate act of deciding to filter on something, and it comes with a
 *     backfill. The boundary enforces itself instead of being a matter of taste.
 *   - **Derivable is not storable.** `schema.prisma:184-188` says a second
 *     column holding the same fact is a data-integrity bug. Counts and deltas
 *     the template supplies (`No Active US DMFs`, `Days Until Expiry`,
 *     `% vs Market Avg`) are computed, never stored — they are wrong the day
 *     after import.
 *
 * ## Why a registry rather than four hand-written lists
 *
 * `specJson` is opaque to the database but **not** to the application: ~130
 * fields have to render as labelled, ordered, grouped, translated spec sheets,
 * be editable by a seller, and export back into the template. One registry
 * drives all four consumers — the import mapper, `<SpecTable>`, `<FieldGroup>`
 * and the template export — so adding a field adds it everywhere.
 *
 * That is the structural fix for the drift that left `productType`, `facet`,
 * `purityPct` and a dozen others written by nothing: with four hand-maintained
 * object literals, a new column had four places to be forgotten.
 *
 * ## Why labels are not in messages/*.json
 *
 * `src/i18n/messages.test.ts` fails the build on any zh string identical to its
 * English counterpart. Putting 140 field labels in the catalogues would demand
 * 140 genuine translations, and any that legitimately read the same in both
 * languages ("pH", "ICH Q3C") would break the suite. Labels live here with
 * `label`/`labelZh`, guarded by the registry's own test. Only page chrome —
 * headings, buttons, empty states — goes in the message catalogues.
 */

import type { ProductType } from './taxonomy';

export type SpecKind = 'text' | 'longtext' | 'number' | 'bool' | 'date' | 'list';

export interface SpecField {
  /** `specJson` key, or the Prisma column name when `column` is true. */
  key: string;
  label: string;
  labelZh: string;
  kind: SpecKind;
  /** Rendered after the value, e.g. `%`, `MT/yr`. Never part of the stored value. */
  unit?: string;
  /**
   * True when this is a real `Product` column rather than a `specJson` key.
   * Every one of these satisfies at least one of the five promotion rules.
   */
  column?: boolean;
  /** Segments this field applies to. Absent means every segment. */
  productTypes?: readonly ProductType[];
  /** Where the value comes from in the curation template, as `sheet:column`. */
  sheetRef?: string;
  /** Placeholder / help text for the seller form. */
  hint?: string;
}

export interface SpecGroup {
  id: string;
  label: string;
  labelZh: string;
  /** Segments this group applies to. Absent means every segment. */
  productTypes?: readonly ProductType[];
  fields: readonly SpecField[];
}

const CHEMICAL: readonly ProductType[] = ['api', 'ksm', 'intermediate', 'raw_material', 'excipient', 'specialty'];
const SYNTHESISED: readonly ProductType[] = ['api', 'ksm', 'intermediate', 'specialty'];
const MATERIAL: readonly ProductType[] = ['raw_material', 'excipient'];

export const SPEC_GROUPS: readonly SpecGroup[] = [
  {
    id: 'identity',
    label: 'Identity & chemistry',
    labelZh: '标识与化学信息',
    productTypes: CHEMICAL,
    fields: [
      { key: 'iupacName', label: 'IUPAC name', labelZh: 'IUPAC 名称', kind: 'text', column: true, sheetRef: '2:F' },
      { key: 'brandName', label: 'Brand name', labelZh: '品牌名称', kind: 'text', sheetRef: '2:H' },
      { key: 'formula', label: 'Molecular formula', labelZh: '分子式', kind: 'text', column: true, sheetRef: '2:J', hint: 'C8H9NO2' },
      { key: 'molecularWeight', label: 'Molecular weight', labelZh: '分子量', kind: 'number', unit: 'g/mol', column: true, sheetRef: '2:K' },
      { key: 'atcCode', label: 'ATC code (WHO)', labelZh: 'ATC 编码', kind: 'text', column: true, productTypes: ['api', 'fdf', 'specialty'], sheetRef: '2:M' },
      { key: 'subTherapeuticCategory', label: 'Sub-therapeutic category', labelZh: '细分治疗类别', kind: 'text', productTypes: ['api', 'fdf'], sheetRef: '2:N' },
      { key: 'drugClass', label: 'Drug class', labelZh: '药物类别', kind: 'text', productTypes: ['api', 'fdf'], sheetRef: '2:O' },
      { key: 'inchiKey', label: 'InChI key', labelZh: 'InChI 键', kind: 'text', productTypes: SYNTHESISED, sheetRef: '4:J' },
      { key: 'smiles', label: 'SMILES', labelZh: 'SMILES 字符串', kind: 'text', productTypes: SYNTHESISED, sheetRef: '4:K' },
      { key: 'physicalForm', label: 'Physical form', labelZh: '物理形态', kind: 'text', column: true, sheetRef: '2:R', hint: 'Crystalline powder' },
      { key: 'appearance', label: 'Appearance', labelZh: '外观', kind: 'text', sheetRef: '2:S' },
      { key: 'solubility', label: 'Solubility', labelZh: '溶解度', kind: 'text', sheetRef: '2:T' },
      { key: 'colourAppearance', label: 'Colour', labelZh: '颜色', kind: 'text', productTypes: MATERIAL, sheetRef: '5:Y' },
    ],
  },
  {
    id: 'quality',
    label: 'Quality specification',
    labelZh: '质量标准',
    fields: [
      { key: 'chirality', label: 'Chirality / stereochemistry', labelZh: '手性 / 立体化学', kind: 'text', column: true, sheetRef: '2:U' },
      { key: 'enantiomericExcess', label: 'Enantiomeric excess', labelZh: '对映体过量', kind: 'text', unit: '%', productTypes: SYNTHESISED, sheetRef: '4:X' },
      { key: 'polymorphForm', label: 'Polymorphic form', labelZh: '晶型', kind: 'text', column: true, sheetRef: '2:V' },
      { key: 'particleSize', label: 'Particle size', labelZh: '粒度', kind: 'text', column: true, sheetRef: '2:W', hint: 'D50: 45–75 µm' },
      { key: 'phRange', label: 'pH range', labelZh: 'pH 范围', kind: 'text', sheetRef: '2:X' },
      { key: 'lossOnDrying', label: 'Loss on drying', labelZh: '干燥失重', kind: 'text', unit: '%', sheetRef: '2:Y' },
      { key: 'heavyMetals', label: 'Heavy metals', labelZh: '重金属', kind: 'text', unit: 'ppm', sheetRef: '2:Z' },
      { key: 'residualSolvents', label: 'Residual solvents', labelZh: '残留溶剂', kind: 'longtext', sheetRef: '2:AA' },
      { key: 'impurityProfile', label: 'Impurity profile', labelZh: '杂质谱', kind: 'longtext', sheetRef: '2:AT' },
      { key: 'analyticalMethod', label: 'Analytical method', labelZh: '分析方法', kind: 'text', productTypes: SYNTHESISED, sheetRef: '4:V' },
      { key: 'bulkDensity', label: 'Bulk density', labelZh: '堆密度', kind: 'text', unit: 'g/mL', productTypes: MATERIAL, sheetRef: '5:T' },
      { key: 'viscosity', label: 'Viscosity', labelZh: '黏度', kind: 'text', productTypes: MATERIAL, sheetRef: '5:R' },
      { key: 'moistureContent', label: 'Moisture content', labelZh: '水分含量', kind: 'text', unit: '%', productTypes: MATERIAL, sheetRef: '5:U' },
      { key: 'microbialLimits', label: 'Microbial limits', labelZh: '微生物限度', kind: 'text', productTypes: MATERIAL, sheetRef: '5:V' },
      { key: 'ichStabilityZones', label: 'ICH stability zones', labelZh: 'ICH 稳定性气候带', kind: 'text', sheetRef: '2:AS' },
    ],
  },
  {
    id: 'synthesis',
    label: 'Synthesis & starting materials',
    labelZh: '合成路线与起始物料',
    productTypes: SYNTHESISED,
    fields: [
      { key: 'synthesisRoute', label: 'Synthesis route', labelZh: '合成路线', kind: 'longtext', column: true, sheetRef: '2:AB' },
      { key: 'startingMaterial', label: 'Starting material', labelZh: '起始物料', kind: 'text', sheetRef: '2:AC' },
      // The KSM → parent API link is a plain CAS, not a self-relation: a KSM's
      // parent is a fact about chemistry, true whether or not anyone on this
      // platform lists it. Same reasoning as PriceObservation's CAS key
      // (schema.prisma:936-944).
      { key: 'parentApiName', label: 'Parent API', labelZh: '母体原料药', kind: 'text', column: true, productTypes: ['ksm', 'intermediate'], sheetRef: '4:M' },
      { key: 'parentApiCas', label: 'Parent API CAS', labelZh: '母体原料药 CAS', kind: 'text', column: true, productTypes: ['ksm', 'intermediate'], sheetRef: '4:N' },
      { key: 'synthesisStep', label: 'Synthesis step', labelZh: '合成步骤', kind: 'text', column: true, productTypes: ['ksm', 'intermediate'], sheetRef: '4:O', hint: 'Step 1 (Early)' },
      { key: 'totalSteps', label: 'Total steps in route', labelZh: '路线总步数', kind: 'number', productTypes: ['ksm', 'intermediate'], sheetRef: '4:P' },
      { key: 'roleInSynthesis', label: 'Role in synthesis', labelZh: '在合成中的作用', kind: 'longtext', productTypes: ['ksm', 'intermediate'], sheetRef: '4:Q' },
      { key: 'downstreamOperations', label: 'Downstream operations', labelZh: '下游工序', kind: 'longtext', productTypes: ['ksm', 'intermediate'], sheetRef: '4:S' },
      { key: 'alternativeRoutes', label: 'Alternative routes', labelZh: '替代路线', kind: 'longtext', productTypes: ['ksm', 'intermediate'], sheetRef: '4:T' },
      // ICH Q11 classification decides what has to be filed, so it is a real
      // buyer filter rather than reference text.
      { key: 'ichQ11Class', label: 'ICH Q11 classification', labelZh: 'ICH Q11 分类', kind: 'text', column: true, productTypes: ['ksm', 'intermediate'], sheetRef: '4:AA' },
      { key: 'genotoxConcern', label: 'Genotoxic concern', labelZh: '基因毒性风险', kind: 'text', productTypes: ['ksm', 'intermediate'], sheetRef: '4:AT' },
      { key: 'nitrosamineRisk', label: 'Nitrosamine risk', labelZh: '亚硝胺风险', kind: 'text', productTypes: ['ksm', 'intermediate'], sheetRef: '4:AU' },
    ],
  },
  {
    id: 'formulation',
    label: 'Formulation',
    labelZh: '制剂信息',
    productTypes: ['fdf'],
    fields: [
      { key: 'innName', label: 'INN / generic name', labelZh: '国际非专利名', kind: 'text', sheetRef: '3:F' },
      { key: 'fdcCombination', label: 'FDC combination', labelZh: '复方组成', kind: 'text', sheetRef: '3:G' },
      { key: 'strength', label: 'Strength / dose', labelZh: '规格 / 剂量', kind: 'text', column: true, sheetRef: '3:I', hint: '500 mg' },
      { key: 'routeOfAdmin', label: 'Route of administration', labelZh: '给药途径', kind: 'text', column: true, sheetRef: '3:J', hint: 'Oral' },
      { key: 'referenceProduct', label: 'Innovator / reference product', labelZh: '原研 / 参比制剂', kind: 'text', sheetRef: '3:M' },
      { key: 'rld', label: 'Reference listed drug (RLD)', labelZh: '参比药品 (RLD)', kind: 'text', sheetRef: '3:N' },
      { key: 'packSize', label: 'Pack size', labelZh: '包装规格', kind: 'text', sheetRef: '3:Q' },
      { key: 'containerClosure', label: 'Container closure system', labelZh: '包装容器系统', kind: 'longtext', sheetRef: '3:R' },
      { key: 'keyExcipients', label: 'Key excipients', labelZh: '主要辅料', kind: 'longtext', sheetRef: '3:S' },
      { key: 'bioequivalence', label: 'Bioequivalence study', labelZh: '生物等效性研究', kind: 'text', sheetRef: '3:AI' },
      { key: 'beStudyReference', label: 'BE study reference', labelZh: '生物等效性研究编号', kind: 'text', sheetRef: '3:AJ' },
      { key: 'sterileManufacture', label: 'Sterile manufacture', labelZh: '无菌生产', kind: 'bool', sheetRef: '3:AP' },
    ],
  },
  {
    id: 'function',
    label: 'Function & origin',
    labelZh: '功能与来源',
    productTypes: MATERIAL,
    fields: [
      { key: 'functionInFormulation', label: 'Function in formulation', labelZh: '在处方中的功能', kind: 'text', sheetRef: '5:I' },
      { key: 'compendialGrade', label: 'Compendial grade', labelZh: '药典级别', kind: 'text', sheetRef: '5:K' },
      { key: 'pharmacopoeiaRef', label: 'Pharmacopoeia reference', labelZh: '药典依据', kind: 'text', sheetRef: '5:L' },
      { key: 'monographName', label: 'Monograph name', labelZh: '专论名称', kind: 'text', sheetRef: '5:M' },
      { key: 'functionalGrade', label: 'Functional grade', labelZh: '功能级别', kind: 'text', sheetRef: '5:N' },
      // Origin and the dietary certifications are real filters — the template's
      // own note says they are "required for HALAL/KOSHER/BSE compliance
      // filtering" — so they are columns, and nullable Booleans, because
      // unknown is not the same as no.
      { key: 'origin', label: 'Origin', labelZh: '来源', kind: 'text', column: true, sheetRef: '5:AA', hint: 'Plant / Animal / Synthetic' },
      { key: 'nonGmo', label: 'Non-GMO', labelZh: '非转基因', kind: 'bool', column: true, sheetRef: '5:AB' },
      { key: 'bseTseFree', label: 'BSE/TSE free', labelZh: '无 BSE/TSE', kind: 'bool', column: true, sheetRef: '5:AC' },
      { key: 'halal', label: 'Halal certified', labelZh: '清真认证', kind: 'bool', column: true, sheetRef: '5:AD' },
      { key: 'kosher', label: 'Kosher certified', labelZh: '洁食认证', kind: 'bool', column: true, sheetRef: '5:AE' },
      { key: 'organicCertified', label: 'Organic certified', labelZh: '有机认证', kind: 'bool', sheetRef: '5:AF' },
      { key: 'veganStatus', label: 'Vegan', labelZh: '纯素', kind: 'text', sheetRef: '5:AG' },
      { key: 'allergenDeclaration', label: 'Allergen declaration', labelZh: '过敏原声明', kind: 'text', sheetRef: '5:AH' },
      { key: 'vendorQualStatus', label: 'Vendor qualification', labelZh: '供应商资格认定', kind: 'text', column: true, sheetRef: '5:AI' },
      { key: 'grasStatus', label: 'GRAS status', labelZh: 'GRAS 状态', kind: 'text', sheetRef: '5:AM' },
      { key: 'cfr21Listed', label: '21 CFR listed', labelZh: '21 CFR 收录', kind: 'text', sheetRef: '5:AN' },
      { key: 'inciName', label: 'INCI name', labelZh: 'INCI 名称', kind: 'text', sheetRef: '5:AO' },
      { key: 'fssaiApproval', label: 'FSSAI approval', labelZh: 'FSSAI 批准', kind: 'text', sheetRef: '5:AL' },
    ],
  },
  {
    id: 'regulatory',
    label: 'Regulatory',
    labelZh: '注册与法规',
    fields: [
      // The four filing numbers are already filtered on by catalog-queries.ts.
      // Once RegulatoryFiling exists they become a derived index written FROM
      // the filings, one direction — never two editors for one fact.
      { key: 'dmfNumber', label: 'US DMF number', labelZh: '美国 DMF 编号', kind: 'text', column: true, sheetRef: '2:AF' },
      { key: 'dmfType', label: 'DMF type', labelZh: 'DMF 类型', kind: 'text', sheetRef: '2:AG' },
      { key: 'asmfNumber', label: 'ASMF number', labelZh: 'ASMF 编号', kind: 'text', column: true, sheetRef: '2:AI' },
      { key: 'cepNumber', label: 'CEP number', labelZh: 'CEP 编号', kind: 'text', column: true, sheetRef: '2:AJ' },
      { key: 'cepScope', label: 'CEP scope', labelZh: 'CEP 范围', kind: 'longtext', sheetRef: '2:AK' },
      { key: 'coppNumber', label: 'CoPP number', labelZh: 'CoPP 编号', kind: 'text', column: true },
      { key: 'ipStatus', label: 'IP status', labelZh: '知识产权状态', kind: 'text', column: true, sheetRef: '2:AD', hint: 'Generic (post-patent)' },
      { key: 'patentExpiry', label: 'Patent expiry', labelZh: '专利到期', kind: 'text', column: true, sheetRef: '2:AE' },
      { key: 'controlledSchedule', label: 'Controlled schedule', labelZh: '管制类别', kind: 'text', column: true, sheetRef: '4:Z', hint: 'DEA II / NDPS' },
      { key: 'reachRegistration', label: 'REACH registration', labelZh: 'REACH 注册', kind: 'text', sheetRef: '2:BF' },
      { key: 'whoPqStatus', label: 'WHO PQ status', labelZh: 'WHO 预认证状态', kind: 'text', sheetRef: '2:AN' },
      { key: 'usFdaStatus', label: 'US FDA ANDA / NDA', labelZh: '美国 FDA ANDA / NDA', kind: 'text', sheetRef: '2:AL' },
      { key: 'euMaaStatus', label: 'EU MAA status', labelZh: '欧盟 MAA 状态', kind: 'text', sheetRef: '2:AM' },
      { key: 'cdscoStatus', label: 'CDSCO status', labelZh: 'CDSCO 状态', kind: 'text', sheetRef: '2:AO' },
      { key: 'pmdaStatus', label: 'PMDA (Japan)', labelZh: 'PMDA（日本）', kind: 'text', sheetRef: '2:AP' },
      { key: 'healthCanadaStatus', label: 'Health Canada', labelZh: '加拿大卫生部', kind: 'text', sheetRef: '2:AQ' },
      { key: 'tgaStatus', label: 'TGA (Australia)', labelZh: 'TGA（澳大利亚）', kind: 'text', sheetRef: '2:AR' },
      { key: 'anvisaStatus', label: 'ANVISA (Brazil)', labelZh: 'ANVISA（巴西）', kind: 'text', sheetRef: '2:AS' },
      { key: 'mhraStatus', label: 'UK MHRA', labelZh: '英国 MHRA', kind: 'text', productTypes: ['fdf'], sheetRef: '3:Z' },
    ],
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing & capacity',
    labelZh: '生产与产能',
    fields: [
      { key: 'manufacturingSite', label: 'Manufacturing site', labelZh: '生产场地', kind: 'text', sheetRef: '2:AU' },
      { key: 'siteCountry', label: 'Site country', labelZh: '场地国家', kind: 'text', sheetRef: '2:AV' },
      { key: 'siteFeiNumber', label: 'Site FEI number', labelZh: '场地 FEI 编号', kind: 'text', sheetRef: '2:AW' },
      { key: 'capacityMtYr', label: 'Annual capacity', labelZh: '年产能', kind: 'number', unit: 'MT/yr', column: true, sheetRef: '2:AX' },
      { key: 'utilizationPct', label: 'Current utilisation', labelZh: '当前产能利用率', kind: 'number', unit: '%', column: true, sheetRef: '2:AY' },
      { key: 'scaleUpCapability', label: 'Scale-up capability', labelZh: '扩产能力', kind: 'longtext', sheetRef: '2:AZ' },
      { key: 'siteGmpCerts', label: 'GMP certificates (this site)', labelZh: '该场地 GMP 证书', kind: 'list', sheetRef: '2:BA' },
      { key: 'containmentLevel', label: 'Containment level', labelZh: '密闭等级', kind: 'text', sheetRef: '2:BB' },
      { key: 'inHouseTesting', label: 'In-house testing', labelZh: '自有检测能力', kind: 'list', sheetRef: '2:BC' },
      { key: 'qcMethods', label: 'QC methods', labelZh: '质量控制方法', kind: 'list', sheetRef: '2:BD' },
      { key: 'gmpStandard', label: 'GMP standard', labelZh: 'GMP 标准', kind: 'text', productTypes: ['ksm', 'intermediate'], sheetRef: '4:AG' },
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial terms',
    labelZh: '商务条款',
    fields: [
      // priceUnit and moqUnit are non-negotiable. Sheet 3 prices finished dose
      // forms per unit ($0.042/tablet); Product.priceMin, the price filter,
      // SORT_MAP.price_low and match-score.ts are all kg-denominated. Without a
      // unit, a tablet price wins every "price, low to high" sort forever.
      { key: 'priceUnit', label: 'Price unit', labelZh: '计价单位', kind: 'text', column: true, hint: 'kg' },
      { key: 'moqUnit', label: 'MOQ unit', labelZh: '起订量单位', kind: 'text', column: true, hint: 'kg' },
      { key: 'priceValidUntil', label: 'Price valid until', labelZh: '报价有效期至', kind: 'date', sheetRef: '2:BK' },
      { key: 'pricePackSize', label: 'Price pack size', labelZh: '计价包装规格', kind: 'text', sheetRef: '2:BL' },
      { key: 'expediteLeadDays', label: 'Expedited lead time', labelZh: '加急交货周期', kind: 'number', unit: 'days', column: true, sheetRef: '2:BO' },
      { key: 'paymentTerms', label: 'Payment terms', labelZh: '付款条件', kind: 'longtext', sheetRef: '2:BQ' },
      { key: 'sampleSizeCost', label: 'Sample size / cost', labelZh: '样品规格 / 费用', kind: 'text', sheetRef: '2:BS' },
      { key: 'annualContract', label: 'Annual contract available', labelZh: '可签年度合同', kind: 'bool', sheetRef: '2:BT' },
      { key: 'packOptions', label: 'Pack options', labelZh: '包装选项', kind: 'list', sheetRef: '2:BV' },
      { key: 'hsnCode', label: 'HSN code (India)', labelZh: 'HSN 编码（印度）', kind: 'text', column: true, sheetRef: '2:BE' },
      { key: 'hsCode', label: 'HS code', labelZh: 'HS 编码', kind: 'text', column: true, sheetRef: '2:BF', hint: '6-digit international' },
      { key: 'gstRate', label: 'GST rate (India)', labelZh: 'GST 税率（印度）', kind: 'number', unit: '%', sheetRef: '2:BG' },
    ],
  },
  {
    id: 'documentation',
    label: 'Documentation',
    labelZh: '技术文件',
    fields: [
      { key: 'coaType', label: 'CoA type', labelZh: '检验报告类型', kind: 'text', sheetRef: '2:BW' },
      { key: 'sdsAvailable', label: 'SDS / MSDS available', labelZh: '提供 SDS/MSDS', kind: 'bool', sheetRef: '2:BY' },
      { key: 'tdsAvailable', label: 'TDS available', labelZh: '提供 TDS', kind: 'bool', sheetRef: '2:BZ' },
      { key: 'stabilityData', label: 'Stability data', labelZh: '稳定性数据', kind: 'longtext', sheetRef: '2:CA' },
      { key: 'auditReport', label: 'Audit report', labelZh: '审计报告', kind: 'text', sheetRef: '2:CB' },
      { key: 'regulatoryDossier', label: 'Regulatory dossier available', labelZh: '可提供注册资料', kind: 'text', productTypes: ['fdf'], sheetRef: '3:AY' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

const ALL_FIELDS: readonly SpecField[] = SPEC_GROUPS.flatMap((g) =>
  // A field inherits its group's segment scope unless it narrows it further.
  g.fields.map((f) => ({ ...f, productTypes: f.productTypes ?? g.productTypes })),
);

/** Every field, flattened. */
export function allSpecFields(): readonly SpecField[] {
  return ALL_FIELDS;
}

export function specField(key: string): SpecField | undefined {
  return ALL_FIELDS.find((f) => f.key === key);
}

/** Keys backed by a real `Product` column. */
export const SPEC_COLUMN_KEYS: readonly string[] = ALL_FIELDS.filter((f) => f.column).map((f) => f.key);

/** Keys stored inside `Product.specJson`. */
export const SPEC_BLOB_KEYS: readonly string[] = ALL_FIELDS.filter((f) => !f.column).map((f) => f.key);

const BLOB_KEY_SET = new Set(SPEC_BLOB_KEYS);

export function appliesTo(field: Pick<SpecField, 'productTypes'>, type: ProductType): boolean {
  return !field.productTypes || field.productTypes.includes(type);
}

/** The groups relevant to one segment, with their irrelevant fields removed. */
export function groupsFor(type: ProductType): SpecGroup[] {
  return SPEC_GROUPS.filter((g) => appliesTo(g, type))
    .map((g) => ({ ...g, fields: g.fields.filter((f) => appliesTo({ productTypes: f.productTypes ?? g.productTypes }, type)) }))
    .filter((g) => g.fields.length > 0);
}

/** Every field that applies to one segment, flattened. */
export function fieldsFor(type: ProductType): SpecField[] {
  return groupsFor(type).flatMap((g) => g.fields);
}

// ---------------------------------------------------------------------------
// specJson
// ---------------------------------------------------------------------------

export type SpecValues = Record<string, string | number | boolean>;

/**
 * Parses `Product.specJson`, tolerating anything.
 *
 * A malformed blob returns `{}` rather than throwing: a spec sheet is
 * supplementary, and a single bad row must not take out the product page.
 * Unknown keys are dropped — a blob that accumulates junk keys is unrenderable
 * and unexportable within two releases.
 */
export function parseSpec(json: string | null | undefined): SpecValues {
  if (!json) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const out: SpecValues = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!BLOB_KEY_SET.has(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      if (v !== '' && v !== null) out[k] = v;
    }
  }
  return out;
}

/**
 * Serialises spec values for storage, dropping unknown keys and empties.
 *
 * Returns null rather than `"{}"` so an empty spec reads as absent in the
 * database and in an export, instead of as an empty object someone has to
 * interpret.
 */
export function serialiseSpec(values: SpecValues): string | null {
  const clean: SpecValues = {};
  // Registry order, not insertion order, so two products with the same spec
  // produce byte-identical JSON and a diff shows a real change.
  for (const key of SPEC_BLOB_KEYS) {
    const v = values[key];
    if (v === undefined || v === null || v === '') continue;
    clean[key] = v;
  }
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

/**
 * How much of the applicable spec a listing has filled in.
 *
 * Counts only fields that apply to the product's own segment — a KSM is not
 * incomplete for lacking a dose form. This is what makes a 250-column template
 * tractable for a supplier: a number that can reach 100%.
 */
export function specCompleteness(
  type: ProductType,
  columns: Record<string, unknown>,
  spec: SpecValues,
): { filled: number; total: number; pct: number } {
  const fields = fieldsFor(type);
  const filled = fields.filter((f) => {
    const v = f.column ? columns[f.key] : spec[f.key];
    return v !== undefined && v !== null && v !== '';
  }).length;
  const total = fields.length;
  return { filled, total, pct: total === 0 ? 0 : Math.round((filled / total) * 100) };
}
