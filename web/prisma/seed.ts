/**
 * Seed data for local dev / e2e. Mirrors the launch-liquidity plan (F7.6):
 * a pool of verified suppliers with live listings, one pending supplier to work
 * in the ops queue, a verified buyer, and an ops admin.
 *
 * Demo password for every seeded user: Password123!
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { seedMarketData, seedForecastScoreboard } from './seed-market-data';
import { mirrorInternalPrices } from '../src/lib/market-data-internal';
import {
  parseColdChain,
  parseLeadTimeDays,
  parsePurityPct,
  parseStockStatus,
  productTypeFromCategory,
  readSpecFromForm,
  validFacetFor,
} from '../src/lib/product-fields';
import { joinMulti, parseIncoterms } from '../src/lib/vocab';

/**
 * Deterministic user ids, derived from the email.
 *
 * The seed wipes and recreates rows. With random cuids, every reseed handed the
 * same person a NEW id — which silently invalidated any live session, because
 * the JWT carries the user id. Anyone signed in got booted to a signed-out
 * header mid-test with no explanation. Stable ids make reseeding safe to run
 * while people are using the app.
 */
const stableUserId = (email: string): string =>
  'usr_' + createHash('sha1').update(email.toLowerCase()).digest('hex').slice(0, 20);

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123!';
const YEAR = 365 * 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log('Seeding PharmaLink…');
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Order matters: children first (FK constraints).
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.newsPost.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.dsarRequest.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.document.deleteMany(); // FK to rfq/quote/message
  await prisma.message.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.rfqSupplier.deleteMany();
  await prisma.rfq.deleteMany();
  await prisma.productCertification.deleteMany();
  await prisma.product.deleteMany();
  await prisma.regulatoryFiling.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.certification.deleteMany(); // FK to site
  await prisma.site.deleteMany();
  await prisma.account.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // ------------------------------------------------------------ Platform staff
  // Staff have NO organization — they are PharmaLink employees, not a trading
  // party, so they can never post an RFQ or quote no matter what else changes.
  const staff = [
    { email: 'ops@pharmalink.global', name: 'Priya (Application admin)', role: 'admin' },
    { email: 'verifier@pharmalink.global', name: 'Anand (Verification officer)', role: 'verifier' },
    { email: 'catalog@pharmalink.global', name: 'Mei (Product admin)', role: 'product_admin' },
  ];
  for (const s of staff) {
    await prisma.user.create({
      data: {
        id: stableUserId(s.email),
        email: s.email,
        name: s.name,
        passwordHash: hash,
        role: s.role,
        orgId: null,
        emailVerified: new Date(),
        consentTermsAt: new Date(),
        consentPrivacyAt: new Date(),
      },
    });
  }

  /**
   * Site-level regulatory metadata, keyed by supplier city.
   *
   * Kept beside the supplier list rather than inlined into each entry so the
   * catalogue above stays about products. `fei` is the identifier a verifier
   * would type into the issuing authority's own register — the whole point of
   * capturing it is that it is checkable without trusting the uploaded PDF.
   */
  const SITE_META: Record<string, { state: string; postalCode: string; fei: string; mfgLicence: string }> = {
    Mumbai: { state: 'Maharashtra', postalCode: '400069', fei: '3002807546', mfgLicence: 'MFG/MH/2016/0421' },
    Hyderabad: { state: 'Telangana', postalCode: '500032', fei: '3004123991', mfgLicence: 'MFG/TG/2018/0733' },
    Taizhou: { state: 'Zhejiang', postalCode: '317016', fei: '3005512874', mfgLicence: 'CN-GMP-2020-4471' },
    Ahmedabad: { state: 'Gujarat', postalCode: '382213', fei: '3009981120', mfgLicence: 'MFG/GJ/2019/1183' },
  };
  const metaFor = (city: string) =>
    SITE_META[city] ?? { state: '', postalCode: '', fei: '', mfgLicence: '' };

  /** Certificate numbers are issued per authority; derive a stable one. */
  const certNumber = (org: string, cert: string) =>
    `${cert.split(' ')[0].toUpperCase()}-${org.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase()}-${cert.length}${org.length}`;

  /**
   * A seeded listing, before derivation. Everything the seller would actually
   * type; the numeric and enum twins the catalogue filters on are computed.
   */
  interface SeedProduct {
    name: string;
    cas: string;
    category?: string;
    grade?: string | null;
    purity?: string | null;
    moqKg: number;
    leadTime: string;
    priceMin?: number;
    priceMax?: number;
    facet?: string;
    incoterms?: string;
    coldChain?: string;
    stockStatus?: string;
    packaging?: string;
    cepNumber?: string;
    asmfNumber?: string;
    status?: string;
    /** Registry-backed columns and specJson keys, keyed exactly as the registry names them. */
    spec?: Record<string, string>;
  }

  /**
   * Builds a listing the same way `saveProductAction` and the CSV importer do —
   * through the shared derivations in `src/lib/product-fields.ts`.
   *
   * Going through the same code rather than hand-writing `productType` and
   * `purityPct` here is the point: it means the seed cannot drift from what the
   * application actually writes, which is precisely how the catalogue ended up
   * with a filter rail no seeded row could ever satisfy.
   */
  function seedProduct(p: SeedProduct) {
    const productType = productTypeFromCategory(p.category ?? 'API');
    const storage = p.coldChain ?? '15–25°C, dry';
    // Spec values go through the same registry split the seller editor and the
    // importer use, so the seed cannot produce a shape the application would
    // not — including landing a blob key in a column or vice versa.
    const spec = p.spec ? readSpecFromForm({ get: (k) => p.spec?.[k] ?? null }, productType) : {};
    return {
      ...spec,
      name: p.name,
      cas: p.cas,
      category: p.category ?? 'API',
      grade: p.grade ?? null,
      purity: p.purity ?? null,
      moqKg: p.moqKg,
      leadTime: p.leadTime,
      priceMin: p.priceMin ?? null,
      priceMax: p.priceMax ?? null,
      shelfLife: '36 months',
      storage,
      status: p.status ?? 'live',
      packaging: p.packaging ?? null,
      cepNumber: p.cepNumber ?? null,
      asmfNumber: p.asmfNumber ?? null,
      productType,
      facet: validFacetFor(productType, p.facet),
      purityPct: parsePurityPct(p.purity),
      leadTimeDays: parseLeadTimeDays(p.leadTime),
      incoterms: joinMulti(parseIncoterms(p.incoterms)),
      coldChain: parseColdChain(storage),
      stockStatus: parseStockStatus(p.stockStatus) ?? 'made_to_order',
    };
  }

  interface SeedSupplier {
    name: string;
    city: string;
    country: string;
    user: { email: string; name: string };
    markets: string;
    dmf: string;
    website: string;
    associations: string | null;
    foundedYear: number;
    employees: number;
    listedOn: string;
    certs: { name: string; expires: number; via: string }[];
    products: SeedProduct[];
  }

  // ---------------------------------------------------------------- Suppliers
  const suppliers: SeedSupplier[] = [
    {
      name: 'Sun Pharma API Division',
      city: 'Mumbai',
      country: 'India',
      user: { email: 'suresh@sunpharma.test', name: 'Suresh Kumar' },
      markets: 'US,EU,WHO',
      dmf: 'DMF 32145, CEP R1-CEP-2019-021',
      // `website` is the only identity field that matters mechanically: the logo
      // resolver keys on the domain (src/lib/logo.ts), so a seed without it
      // exercises only the monogram fallback and the logo path never gets used.
      website: 'https://sunpharma.com',
      associations: 'IPA,Pharmexcil',
      foundedYear: 1983,
      employees: 43000,
      listedOn: 'NSE: SUNPHARMA · BSE: 524715',
      certs: [
        { name: 'US FDA GMP', expires: 1.7, via: 'FDA drug database' },
        { name: 'EU GMP', expires: 0.07, via: 'EudraGMDP' }, // ~25 days — drives an expiry alert in the compliance hub
        { name: 'WHO PQ', expires: 2.5, via: 'WHO PQ list' },
      ],
      products: [
        { name: 'Paracetamol (Acetaminophen)', cas: '103-90-2', grade: 'IP / BP / USP', purity: '99.8%', moqKg: 25, leadTime: '2–3 weeks', priceMin: 4.2, priceMax: 5.1, facet: 'anti-inflammatory', incoterms: 'FOB; CIF; DAP; DDP', stockStatus: 'In Stock', packaging: '25 kg HDPE drum', cepNumber: 'CEP 2019-021-3-0' },
        { name: 'Ibuprofen', cas: '15687-27-1', grade: 'BP / USP', purity: '99.7%', moqKg: 25, leadTime: '2 weeks', priceMin: 6.1, priceMax: 7.4, facet: 'anti-inflammatory', incoterms: 'FOB; CIF', stockStatus: 'In Stock', packaging: '25 kg fibre drum' },
        // A KSM, so the segment filter has something outside `api` to return.
        // Dicyandiamide is the metformin precursor from the curation template.
        {
          name: 'Dicyandiamide (DCDA)', cas: '461-58-5', category: 'KSM', grade: 'Technical', purity: '≥98.0%',
          moqKg: 1000, leadTime: '4 weeks', priceMin: 2.8, priceMax: 3.2, incoterms: 'FOB; CIF',
          stockStatus: 'In Stock', packaging: '500 kg bulk bag',
          // Links to the metformin listing above by CAS, so the product page can
          // answer "who else supplies the API this feeds".
          spec: {
            iupacName: 'Cyanoguanidine',
            formula: 'C2H4N4',
            molecularWeight: '84.08',
            inchiKey: 'RXGJHLEKF-UHFFFAOYSA-N',
            smiles: 'NC(=N)NC#N',
            parentApiName: 'Metformin Hydrochloride',
            parentApiCas: '1115-70-4',
            synthesisStep: 'Step 1 (Early)',
            totalSteps: '2',
            roleInSynthesis: 'Biguanide core precursor — provides the guanidyl group',
            ichQ11Class: 'ICH Q11 Starting Material',
            analyticalMethod: 'GC-FID; HPLC-UV; 1H-NMR',
            genotoxConcern: 'No genotoxic concern',
            nitrosamineRisk: 'Not applicable at starting-material stage',
            capacityMtYr: '1200',
            utilizationPct: '55',
          },
        },
      ],
    },
    {
      name: "Divi's Laboratories",
      city: 'Hyderabad',
      country: 'India',
      user: { email: 'anita@divis.test', name: 'Anita Rao' },
      markets: 'US,EU,JP',
      dmf: 'DMF 28994',
      website: 'https://divislaboratories.com',
      associations: 'IPA,Pharmexcil',
      foundedYear: 1990,
      employees: 17000,
      listedOn: 'NSE: DIVISLAB · BSE: 532488',
      certs: [
        { name: 'US FDA GMP', expires: 1.5, via: 'FDA drug database' },
        { name: 'EU GMP', expires: 1.9, via: 'EudraGMDP' },
        { name: 'WHO PQ', expires: 1.2, via: 'WHO PQ list' },
      ],
      products: [
        {
          name: 'Metformin HCl', cas: '1115-70-4', grade: 'IP / USP', purity: '99.5%', moqKg: 100, leadTime: '3–4 weeks',
          priceMin: 3.8, priceMax: 4.6, facet: 'antidiabetic', incoterms: 'EXW; FOB; CIF; DDP', stockStatus: 'In Stock',
          packaging: '25 kg HDPE drum', asmfNumber: 'EU/ASMF/00198',
          // The worked example from the curation template — enough spec depth to
          // exercise <SpecTable>'s grouping, units and long-text wrapping.
          spec: {
            iupacName: '1,1-Dimethylbiguanide Hydrochloride',
            molecularWeight: '165.62',
            atcCode: 'A10BA02',
            physicalForm: 'Crystalline Powder',
            appearance: 'White to off-white crystalline powder',
            solubility: 'Freely soluble in water',
            chirality: 'Achiral',
            polymorphForm: 'Monocrystalline Form I',
            particleSize: 'D50: 45–75 µm',
            phRange: '6.68 (1% aqueous solution)',
            lossOnDrying: '≤0.5',
            heavyMetals: '≤10',
            residualSolvents: 'ICH Q3C Class II — ethanol and acetonitrile residuals tested',
            impurityProfile: 'Dimethylguanidine ≤0.05%; no genotoxic impurities',
            synthesisRoute: 'Condensation of dicyandiamide with dimethylamine sulphate; ICH Q11 step-1 listed',
            startingMaterial: 'Dicyandiamide (DCDA); Dimethylamine Sulfate',
            ipStatus: 'Generic (Post-Patent)',
            patentExpiry: 'Expired 1978',
            dmfType: 'Type II',
            capacityMtYr: '2400',
            utilizationPct: '65',
            hsCode: '292690',
            hsnCode: '29279090',
            gstRate: '12',
            priceUnit: 'kg',
            moqUnit: 'kg',
            expediteLeadDays: '28',
            coaType: 'Batch CoA per consignment',
            sdsAvailable: 'yes',
            tdsAvailable: 'yes',
            stabilityData: 'ICH Zones I–IV; 24 months primary, 36 months ongoing',
          },
        },
        { name: 'Pantoprazole Sodium', cas: '138786-67-1', grade: 'EP', purity: '99.4%', moqKg: 10, leadTime: '4 weeks', priceMin: 180, priceMax: 240, facet: 'gastrointestinal', incoterms: 'FOB; CIP', coldChain: 'Refrigerated 2-8 C', stockStatus: 'Made to Order', packaging: '5 kg alu-alu pack' },
        // An intermediate — the fifth of the seven segments.
        { name: 'Pantoprazole Sulphide', cas: '102625-64-9', category: 'Intermediate', grade: 'In-house', purity: '≥98.5%', moqKg: 50, leadTime: '5 weeks', priceMin: 95, priceMax: 120, incoterms: 'FOB', stockStatus: 'Made to Order' },
      ],
    },
    {
      name: 'Aurobindo Pharma',
      city: 'Hyderabad',
      country: 'India',
      user: { email: 'vikram@aurobindo.test', name: 'Vikram Patel' },
      markets: 'US,EU,WHO',
      dmf: 'DMF 31002',
      website: 'https://aurobindo.com',
      associations: 'BDMA,Pharmexcil,IPA',
      foundedYear: 1986,
      employees: 26000,
      listedOn: 'NSE: AUROPHARMA · BSE: 524804',
      certs: [
        { name: 'US FDA GMP', expires: 2.1, via: 'FDA drug database' },
        { name: 'CDSCO', expires: 1.6, via: 'CDSCO portal' },
      ],
      products: [
        { name: 'Atorvastatin Calcium', cas: '134523-03-8', grade: 'USP / EP', purity: '99.2%', moqKg: 5, leadTime: '4–5 weeks', priceMin: 310, priceMax: 420, facet: 'cardiovascular', incoterms: 'FOB; CIF; CPT', stockStatus: 'Made to Order', packaging: '5 kg alu drum' },
        {
          name: 'Microcrystalline Cellulose', cas: '9004-34-6', category: 'Excipient', grade: 'NF / EP',
          purity: '≥97.0% (dried basis)', moqKg: 500, leadTime: '2 weeks', priceMin: 2.1, priceMax: 2.8,
          facet: 'filler', incoterms: 'EXW; FOB; CIF; DAP', stockStatus: 'In Stock',
          packaging: '25 kg PE bag; 500 kg octabin',
          // Exercises the dietary-compliance tri-states, including one that is
          // deliberately "no" and one deliberately left unstated.
          spec: {
            functionInFormulation: 'Diluent / Filler',
            compendialGrade: 'USP-NF',
            pharmacopoeiaRef: 'USP 43-NF 38',
            monographName: 'Microcrystalline Cellulose',
            functionalGrade: 'Direct Compression Grade',
            origin: 'Plant-derived',
            nonGmo: 'yes',
            bseTseFree: 'yes',
            halal: 'yes',
            kosher: 'yes',
            organicCertified: 'no',
            veganStatus: 'Vegan-compatible',
            allergenDeclaration: 'None (non-allergenic)',
            vendorQualStatus: 'Qualified (Fully)',
            bulkDensity: '0.28–0.33',
            moistureContent: '≤5.0',
            microbialLimits: 'TAMC ≤1000 CFU/g; TYMC ≤100 CFU/g',
            colourAppearance: 'White to off-white powder; odourless',
            grasStatus: 'GRAS Notice GRN 000xxx',
            cfr21Listed: '21 CFR 182.70',
            inciName: 'Cellulose',
            hsCode: '391200',
            hsnCode: '39129000',
          },
        },
        // A pharma raw material — solvent grade, consumed in manufacture.
        { name: 'Acetone (Pharma Grade)', cas: '67-64-1', category: 'Raw Material', grade: 'USP / Ph.Eur', purity: '≥99.5%', moqKg: 2000, leadTime: '1 week', priceMin: 1.1, priceMax: 1.4, incoterms: 'EXW; FCA; FOB', stockStatus: 'In Stock', packaging: '200 L MS drum' },
      ],
    },
    {
      name: 'Zhejiang Huahai Pharmaceutical',
      city: 'Taizhou',
      country: 'China',
      user: { email: 'li.wei@huahai.test', name: 'Li Wei' },
      markets: 'CN,EU,WHO',
      dmf: 'CEP R1-CEP-2021-338',
      website: 'https://huahaipharm.com',
      // Chinese manufacturer — deliberately no Indian association, so the
      // profile panel is exercised with the field genuinely absent.
      associations: null,
      foundedYear: 1989,
      employees: 8000,
      listedOn: 'SSE: 600521',
      certs: [
        { name: 'NMPA', expires: 2.0, via: 'NMPA portal' },
        { name: 'EU GMP', expires: 1.4, via: 'EudraGMDP' },
        { name: 'WHO PQ', expires: 1.8, via: 'WHO PQ list' },
      ],
      products: [
        { name: 'Paracetamol (Acetaminophen)', cas: '103-90-2', grade: 'USP / EP', purity: '99.6%', moqKg: 50, leadTime: '3 weeks', priceMin: 3.9, priceMax: 4.8, facet: 'anti-inflammatory', incoterms: 'FOB; CIF; DPU', stockStatus: 'In Stock', packaging: '25 kg HDPE drum' },
        { name: 'Losartan Potassium', cas: '124750-99-8', grade: 'USP', purity: '99.3%', moqKg: 25, leadTime: '4 weeks', priceMin: 95, priceMax: 130, facet: 'cardiovascular', incoterms: 'FOB; CIF', stockStatus: 'Made to Order', packaging: '10 kg alu drum' },
        // A high-potency specialty API — the segment that carries containment
        // and handling requirements rather than a therapeutic facet.
        { name: 'Docetaxel Trihydrate (HPAPI)', cas: '148408-66-6', category: 'Specialty', grade: 'USP', purity: '≥99.0%', moqKg: 1, leadTime: '8 weeks', priceMin: 8500, priceMax: 11000, incoterms: 'CIP; DDP', coldChain: 'Refrigerated 2-8 C', stockStatus: 'Made to Order', packaging: '100 g amber glass, secondary containment' },
        // A finished dose form. Prices are deliberately left unset: an FDF is
        // sold per unit, and `priceMin`/`priceMax` are USD-per-kg columns. A
        // $0.04 tablet written into a per-kg column wins every "price, low to
        // high" sort forever. The per-unit price gets a home in a later phase.
        {
          name: 'Paracetamol Tablets IP 500 mg', cas: '103-90-2', category: 'FDF', grade: 'IP', moqKg: 500,
          leadTime: '6 weeks', facet: 'tablet', incoterms: 'FOB; CIF; DDP', stockStatus: 'Made to Order',
          packaging: '10 × 10 blister, 500 packs per carton',
          spec: {
            innName: 'Paracetamol',
            fdcCombination: 'Paracetamol 500 mg (single API)',
            strength: '500 mg',
            routeOfAdmin: 'Oral',
            referenceProduct: 'Panadol (Haleon)',
            packSize: '10 tablets per blister; 10 blisters per box',
            containerClosure: 'PVC/PVDC blister; HDPE bottle with child-resistant cap',
            keyExcipients: 'Microcrystalline Cellulose; Povidone K30; Magnesium Stearate; Croscarmellose Na',
            bioequivalence: 'Conducted (crossover, 24 subjects)',
            sterileManufacture: 'no',
            // Per unit, not per kg. `priceMin`/`priceMax` stay null above for
            // exactly this reason — see the note on Product.priceUnit.
            priceUnit: 'unit',
            moqUnit: 'unit',
          },
        },
      ],
    },
  ];

  for (const s of suppliers) {
    const org = await prisma.organization.create({
      data: {
        name: s.name,
        kind: 'seller',
        status: 'verified',
        country: s.country,
        city: s.city,
        regNumber: '27AAACS1234M1Z8',
        website: s.website,
        associations: s.associations,
        foundedYear: s.foundedYear,
        employees: s.employees,
        listedOn: s.listedOn,
        exportMarkets: s.markets,
        dmfNumbers: s.dmf,
        defaultIncoterm: `FOB ${s.city}`,
        defaultPaymentTerms: '30% advance, 70% against BL',
        defaultLeadTime: '2–3 weeks',
        verifiedAt: new Date(),
        about: `${s.name} operates GMP-certified manufacturing facilities producing APIs and intermediates for regulated markets.`,
        supplierType: 'manufacturer',
        sites: {
          create: [
            {
              name: `${s.city} Unit-1`,
              location: `${s.city}, ${s.country}`,
              certsClaimed: s.certs.map((c) => c.name).join(','),
              addressLine: 'Plot 21, Industrial Estate',
              city: s.city,
              state: metaFor(s.city).state,
              postalCode: metaFor(s.city).postalCode,
              country: s.country,
              siteType: 'manufacturing',
              regulatoryId: metaFor(s.city).fei,
            },
          ],
        },
        certifications: {
          create: [
            ...s.certs.map((c) => ({
              name: c.name,
              category: 'certification',
              number: certNumber(s.name, c.name),
              issuingAuthority: c.via,
              status: 'verified',
              expiresAt: new Date(Date.now() + c.expires * YEAR),
              verifiedVia: c.via,
            })),
            // Every verified manufacturer holds a manufacturing licence — this
            // is the record ops checks against the state FDA register.
            {
              name: 'Manufacturing licence (Form 25/28)',
              category: 'licence',
              number: metaFor(s.city).mfgLicence,
              issuingAuthority: 'State FDA',
              status: 'verified',
              expiresAt: new Date(Date.now() + 3 * YEAR),
              verifiedVia: 'State FDA register',
            },
          ],
        },
        products: { create: s.products.map((p) => seedProduct(p)) },
      },
    });

    await prisma.user.create({
      data: {
        id: stableUserId(s.user.email),
        email: s.user.email,
        name: s.user.name,
        passwordHash: hash,
        role: 'seller',
        orgId: org.id,
        emailVerified: new Date(),
        consentTermsAt: new Date(),
        consentPrivacyAt: new Date(),
      },
    });
  }

  // -------------------------------------------- Pending supplier (ops queue)
  const pending = await prisma.organization.create({
    data: {
      name: 'Zydus Lifesciences',
      kind: 'seller',
      status: 'pending',
      country: 'India',
      city: 'Ahmedabad',
      regNumber: '24AAACZ9999Q1ZP',
      website: 'https://zyduslife.com',
      associations: 'IPA,Pharmexcil',
      foundedYear: 1952,
      employees: 27000,
      listedOn: 'NSE: ZYDUSLIFE · BSE: 532321',
      exportMarkets: 'India,WHO',
      // A complete, well-formed application: manufacturer + declared site +
      // numbered licence. This is what ops should be able to approve.
      supplierType: 'manufacturer',
      sites: {
        create: [
          {
            name: 'Ahmedabad SEZ Unit-2',
            location: 'Ahmedabad, India',
            addressLine: 'Survey 417, Sarkhej-Bavla Road',
            city: 'Ahmedabad',
            state: 'Gujarat',
            postalCode: '382213',
            country: 'India',
            siteType: 'manufacturing',
            regulatoryId: '3009981120',
            certsClaimed: 'US FDA GMP',
          },
        ],
      },
      documents: {
        create: [
          { kind: 'gmp_cert', filename: 'FDA_GMP_Zydus_2026.pdf', status: 'pending', sha256: 'a3f1'.repeat(16) },
          { kind: 'mfg_licence', filename: 'Mfg_Licence_GJ.pdf', status: 'pending', sha256: 'b7c2'.repeat(16) },
        ],
      },
      products: {
        create: [
          seedProduct({
            name: 'Amoxicillin Trihydrate',
            cas: '61336-70-7',
            grade: 'IP / BP',
            purity: '99.0%',
            moqKg: 50,
            leadTime: '3 weeks',
            priceMin: 28,
            priceMax: 34,
            facet: 'anti-infective',
            incoterms: 'FOB; CIF',
            stockStatus: 'Made to Order',
            status: 'draft',
          }),
        ],
      },
    },
  });

  // Certifications are created after the org so each can be linked to the
  // document that evidences it — a claim without its file is unverifiable, and
  // the ops dossier calls that out explicitly.
  {
    const docs = await prisma.document.findMany({
      where: { orgId: pending.id },
      select: { id: true, kind: true },
    });
    const docFor = (kind: string) => docs.find((d) => d.kind === kind)?.id ?? null;

    await prisma.certification.create({
      data: {
        orgId: pending.id,
        name: 'US FDA GMP',
        category: 'certification',
        number: 'FDA-ZYDU-1116',
        issuingAuthority: 'US FDA',
        status: 'pending',
        expiresAt: new Date(Date.now() + 2.2 * YEAR),
        documentId: docFor('gmp_cert'),
      },
    });
    await prisma.certification.create({
      data: {
        orgId: pending.id,
        name: 'Manufacturing licence (Form 25/28)',
        category: 'licence',
        number: 'MFG/GJ/2019/1183',
        issuingAuthority: 'State FDA',
        status: 'pending',
        expiresAt: new Date(Date.now() + 1.4 * YEAR),
        documentId: docFor('mfg_licence'),
      },
    });
  }
  await prisma.user.create({
    data: {
      id: stableUserId('raj@zydus.test'),
      email: 'raj@zydus.test',
      name: 'Raj Mehta',
      passwordHash: hash,
      role: 'seller',
      orgId: pending.id,
      emailVerified: new Date(),
      consentTermsAt: new Date(),
      consentPrivacyAt: new Date(),
    },
  });

  // A second pending supplier, reserved for tests that assert the "pending"
  // gate. Kept separate from Zydus so the ops-approval test can mutate Zydus
  // without breaking gate assertions (tests share one SQLite fixture).
  const pending2 = await prisma.organization.create({
    data: {
      name: 'Mangalam Drugs & Organics',
      kind: 'seller',
      status: 'pending',
      country: 'India',
      city: 'Mumbai',
      regNumber: '27AAACM4444R1ZQ',
      website: 'https://mangalamdrugs.com',
      associations: 'BDMA',
      foundedYear: 1972,
      employees: 600,
      // The contrasting case: claims to manufacture but declares no site, and
      // its CDSCO claim carries no number and no document. Left deliberately
      // incomplete so the ops dossier has something to flag — this is the shape
      // a reseller-posing-as-manufacturer application takes.
      supplierType: 'manufacturer',
      certifications: { create: [{ name: 'CDSCO', category: 'certification', status: 'pending' }] },
      documents: { create: [{ kind: 'mfg_licence', filename: 'Mfg_Licence_MH_Mangalam.pdf', status: 'pending' }] },
    },
  });
  await prisma.user.create({
    data: {
      id: stableUserId('dev@mangalam.test'),
      email: 'dev@mangalam.test',
      name: 'Dev Sharma',
      passwordHash: hash,
      role: 'seller',
      orgId: pending2.id,
      emailVerified: new Date(),
      consentTermsAt: new Date(),
      consentPrivacyAt: new Date(),
    },
  });

  // ------------------------------------------------------------------ Buyers
  const cipla = await prisma.organization.create({
    data: {
      name: 'Cipla Ltd',
      kind: 'buyer',
      status: 'verified',
      country: 'India',
      city: 'Mumbai',
      companyType: 'finished-dosage',
      regNumber: '27AAACC1234A1ZX',
      website: 'https://cipla.com',
      sourcingCategories: 'API,Excipient',
      regulatoryMarkets: 'US,EU,WHO',
      preferredOrigins: 'India',
      verifiedAt: new Date(),
    },
  });
  await prisma.user.create({
    data: {
      id: stableUserId('riya@cipla.test'),
      email: 'riya@cipla.test',
      name: 'Riya Mehta',
      passwordHash: hash,
      role: 'buyer',
      orgId: cipla.id,
      emailVerified: new Date(),
      consentTermsAt: new Date(),
      consentPrivacyAt: new Date(),
    },
  });

  // A second verified buyer on the GROWTH plan (unlimited RFQs). The free plan
  // caps RFQs at 3/month, which the e2e suite exhausts on Cipla; lifecycle tests
  // that post several RFQs use this buyer so they never hit the quota wall.
  const medisource = await prisma.organization.create({
    data: {
      name: 'MediSource Global',
      kind: 'buyer',
      status: 'verified',
      country: 'Singapore',
      city: 'Singapore',
      companyType: 'distributor',
      regNumber: 'SG-201800123M',
      website: 'https://medisourceglobal.example',
      sourcingCategories: 'API,Intermediate,Excipient',
      regulatoryMarkets: 'US,EU,WHO',
      preferredOrigins: 'India,China',
      plan: 'growth',
      planStartedAt: new Date(),
      verifiedAt: new Date(),
    },
  });
  await prisma.user.create({
    data: {
      id: stableUserId('pro@medisource.test'),
      email: 'pro@medisource.test',
      name: 'Wei Chen',
      passwordHash: hash,
      role: 'buyer',
      orgId: medisource.id,
      emailVerified: new Date(),
      consentTermsAt: new Date(),
      consentPrivacyAt: new Date(),
    },
  });

  // Unverified buyer — proves the RFQ gate blocks unverified orgs.
  const torrent = await prisma.organization.create({
    data: {
      name: 'Torrent Pharma',
      kind: 'buyer',
      status: 'pending',
      country: 'India',
      city: 'Ahmedabad',
      companyType: 'generic',
      regNumber: '24AAACT5678B1ZY',
      website: 'https://torrentpharma.com',
      documents: { create: [{ kind: 'drug_licence', filename: 'Wholesale_Licence_Torrent.pdf', status: 'pending' }] },
      // Buyers need a licence too: APIs may only be supplied to a licensed
      // buyer, so this is what ops checks against the state FDA register.
      certifications: {
        create: [
          {
            name: 'Wholesale drug licence (Form 20B)',
            category: 'licence',
            number: 'GJ/20B/2021/8842',
            issuingAuthority: 'State FDA',
            status: 'pending',
            expiresAt: new Date(Date.now() + 1.1 * YEAR),
          },
        ],
      },
    },
  });
  await prisma.user.create({
    data: {
      id: stableUserId('arjun@torrent.test'),
      email: 'arjun@torrent.test',
      name: 'Arjun Shah',
      passwordHash: hash,
      role: 'buyer',
      orgId: torrent.id,
      emailVerified: new Date(),
      consentTermsAt: new Date(),
      consentPrivacyAt: new Date(),
    },
  });

  // Someone who authenticated via SSO but has not finished account setup:
  // the adapter creates a User with no organization. Gives the onboarding gate
  // a subject without needing a live Google round-trip in tests.
  // Three of them: completing setup is a one-way change, so a test that
  // finishes the flow must not consume the subject another test reads.
  for (const [email, name] of [
    ['newsso@pharmalink.test', 'Neha Kulkarni'],
    ['newsso-buyer@pharmalink.test', 'Neha Kulkarni'],
    ['newsso-seller@pharmalink.test', 'Neha Kulkarni'],
  ]) {
    await prisma.user.create({
      data: {
        id: stableUserId(email),
        email,
        name,
        passwordHash: hash,
        role: 'buyer',
        orgId: null,
        emailVerified: new Date(),
      },
    });
  }

  // A controlled substance (gap G13). Kept as draft: anything with a schedule
  // is held for manual review and must never appear in the public catalog.
  const sunOrg = await prisma.organization.findFirst({ where: { name: 'Sun Pharma API Division' } });
  await prisma.product.create({
    data: {
      orgId: sunOrg!.id,
      ...seedProduct({
        name: 'Tramadol HCl',
        cas: '27203-92-5',
        grade: 'IP / BP',
        purity: '99.1%',
        moqKg: 5,
        leadTime: '4 weeks',
        priceMin: 42,
        priceMax: 55,
        facet: 'cns',
        incoterms: 'FOB; CIF',
        stockStatus: 'Made to Order',
        status: 'draft',
      }),
      controlledSchedule: 'NDPS / DEA IV',
      certifications: { create: [{ name: 'US FDA GMP' }, { name: 'CDSCO' }] },
    },
  });

  // Certificates are issued per manufacturing site, not per company (F2.2) —
  // attach each org's certs to its site.
  for (const org of await prisma.organization.findMany({ include: { sites: true } })) {
    const site = org.sites[0];
    if (site) {
      await prisma.certification.updateMany({ where: { orgId: org.id }, data: { siteId: site.id } });
    }
  }

  // ------------------------------------------------- A live RFQ with quotes
  const sun = await prisma.organization.findFirst({ where: { name: 'Sun Pharma API Division' } });
  const huahai = await prisma.organization.findFirst({ where: { name: 'Zhejiang Huahai Pharmaceutical' } });

  const rfq = await prisma.rfq.create({
    data: {
      reference: 'RFQ-2041',
      buyerOrgId: cipla.id,
      productName: 'Paracetamol (Acetaminophen)',
      cas: '103-90-2',
      quantityKg: 2000,
      requiredBy: daysFromNow(30),
      grade: 'USP',
      minPurity: '99.5%',
      requiredCerts: 'US FDA GMP,WHO PQ',
      incoterm: 'FOB',
      destination: 'Nhava Sheva, India',
      sampleRequested: true,
      status: 'quoted',
      broadcasts: { create: [{ orgId: sun!.id }] },
    },
  });

  await prisma.quote.create({
    data: {
      rfqId: rfq.id,
      sellerOrgId: sun!.id,
      unitPrice: 4.35,
      currency: 'USD',
      moqKg: 25,
      leadTime: '2 weeks',
      incoterm: 'FOB Mumbai',
      paymentTerms: '30% advance, 70% against BL',
      validUntil: daysFromNow(14),
      notes: 'CoA for batch B2214 attached on request.',
    },
  });

  // Huahai holds WHO PQ + EU GMP but not US FDA GMP, so it is intentionally NOT
  // matched to RFQ-2041 — demonstrates the AND semantics of required certs.
  console.log(`Seeded. Huahai (${huahai!.name}) deliberately unmatched on RFQ-2041 (no US FDA GMP).`);

  // ------------------------------------------------- Historical RFQs / deals
  // Real quote/deal history so price intelligence, spend analytics and order
  // tracking have genuine data to aggregate (nothing here is fabricated).
  const history: {
    ref: string;
    buyer: { id: string };
    product: string;
    cas: string;
    qty: number;
    grade: string;
    quotes: { seller: { id: string }; price: number }[];
    awardRef?: string; // create a Deal with the FIRST quote when set
    ageDays: number;
  }[] = [
    { ref: 'RFQ-3001', buyer: cipla, product: 'Paracetamol (Acetaminophen)', cas: '103-90-2', qty: 1000, grade: 'USP', quotes: [{ seller: sun!, price: 4.8 }, { seller: huahai!, price: 4.55 }], awardRef: 'DEAL-2001', ageDays: 40 },
    { ref: 'RFQ-3002', buyer: medisource, product: 'Ibuprofen', cas: '15687-27-1', qty: 500, grade: 'BP / USP', quotes: [{ seller: sun!, price: 6.95 }, { seller: huahai!, price: 6.6 }], awardRef: 'DEAL-2002', ageDays: 22 },
    // Dated to last month so it doesn't consume Cipla's this-month free-plan RFQ quota.
    { ref: 'RFQ-3003', buyer: cipla, product: 'Paracetamol (Acetaminophen)', cas: '103-90-2', qty: 2000, grade: 'USP', quotes: [{ seller: sun!, price: 4.6 }, { seller: huahai!, price: 4.4 }], ageDays: 38 },
  ];
  for (const h of history) {
    const hr = await prisma.rfq.create({
      data: {
        reference: h.ref,
        buyerOrgId: h.buyer.id,
        productName: h.product,
        cas: h.cas,
        quantityKg: h.qty,
        requiredBy: daysFromNow(30 - h.ageDays),
        grade: h.grade,
        minPurity: '99.5%',
        incoterm: 'FOB',
        status: h.awardRef ? 'awarded' : 'quoted',
        createdAt: daysFromNow(-h.ageDays),
        // Broadcast to Huahai only — Sun Pharma is the seller the e2e suite drives,
        // and adding historical inquiries to its dashboard would collide with the
        // product-name row locators in those tests. Sun still QUOTES below (for
        // market-price data) but is not on the broadcast list, so it never shows
        // as an inquiry row.
        broadcasts: { create: [{ orgId: huahai!.id }] },
      },
    });
    const quoteRows = [];
    for (const q of h.quotes) {
      quoteRows.push(
        await prisma.quote.create({
          data: {
            rfqId: hr.id,
            sellerOrgId: q.seller.id,
            unitPrice: q.price,
            currency: 'USD',
            moqKg: 25,
            leadTime: '3 weeks',
            incoterm: 'FOB',
            paymentTerms: '30% advance, 70% against BL',
            validUntil: daysFromNow(30),
            status: 'submitted',
            createdAt: daysFromNow(-h.ageDays),
          },
        }),
      );
    }
    if (h.awardRef) {
      // Award Huahai's quote (Huahai is the broadcast supplier). Sun's quote
      // stays 'submitted' — market data only, never a won deal for the test seller.
      const win = quoteRows.find((q) => q.sellerOrgId === huahai!.id) ?? quoteRows[0];
      await prisma.quote.update({ where: { id: win.id }, data: { status: 'accepted' } });
      await prisma.deal.create({
        data: {
          reference: h.awardRef,
          rfqId: hr.id,
          quoteId: win.id,
          totalValue: Math.round(win.unitPrice * h.qty),
          currency: 'USD',
          termsJson: JSON.stringify({ product: h.product, cas: h.cas, quantityKg: h.qty, unitPrice: win.unitPrice }),
          createdAt: daysFromNow(-h.ageDays + 1),
        },
      });
    }
  }

  // ------------------------------------------------------- Shipments (tracking)
  // Give the two historical deals real fulfilment status so /orders has content.
  const deal1 = await prisma.deal.findUnique({ where: { reference: 'DEAL-2001' }, select: { id: true } });
  const deal2 = await prisma.deal.findUnique({ where: { reference: 'DEAL-2002' }, select: { id: true } });
  if (deal1) {
    // Delivered — the buyer (Cipla) can confirm receipt.
    await prisma.shipment.create({ data: { dealId: deal1.id, status: 'delivered', carrier: 'DHL', trackingRef: 'DHL-8842019', shippedAt: daysFromNow(-30), deliveredAt: daysFromNow(-3) } });
  }
  if (deal2) {
    // In transit — the seller (Huahai) can advance it to delivered.
    await prisma.shipment.create({ data: { dealId: deal2.id, status: 'in_transit', carrier: 'Maersk Line', trackingRef: 'MAEU-2261887', shippedAt: daysFromNow(-10), eta: daysFromNow(6) } });
  }

  // An OPEN RFQ (future deadline) with a Huahai quote — negotiable, so it drives
  // the counter-offer demo/e2e. createdAt last month so it doesn't touch Cipla's
  // this-month free-plan quota; broadcast to Huahai only (keeps Sun's board clean).
  const rfq3004 = await prisma.rfq.create({
    data: {
      reference: 'RFQ-3004',
      buyerOrgId: cipla.id,
      productName: 'Paracetamol (Acetaminophen)',
      cas: '103-90-2',
      quantityKg: 1500,
      requiredBy: daysFromNow(20),
      grade: 'USP',
      minPurity: '99.5%',
      incoterm: 'FOB',
      status: 'quoted',
      createdAt: daysFromNow(-40),
      broadcasts: { create: [{ orgId: huahai!.id }] },
    },
  });
  await prisma.quote.create({
    data: {
      rfqId: rfq3004.id,
      sellerOrgId: huahai!.id,
      unitPrice: 4.5,
      currency: 'USD',
      moqKg: 25,
      leadTime: '3 weeks',
      incoterm: 'FOB',
      paymentTerms: '30% advance, 70% against BL',
      validUntil: daysFromNow(30),
      status: 'submitted',
      createdAt: daysFromNow(-40),
    },
  });

  // ------------------------------------------------ Volume tiers + rich fields
  const sunPara = await prisma.product.findFirst({ where: { orgId: sun!.id, cas: '103-90-2' }, select: { id: true } });
  if (sunPara) {
    await prisma.product.update({ where: { id: sunPara.id }, data: { formula: 'C8H9NO2', sampleAvailable: true, dmfNumber: 'US DMF 23412', storage: 'Below 25°C', shelfLife: '36 months' } });
    await prisma.productPriceTier.createMany({
      data: [
        { productId: sunPara.id, minQtyKg: 500, pricePerKg: 4.8 },
        { productId: sunPara.id, minQtyKg: 2000, pricePerKg: 4.5 },
        { productId: sunPara.id, minQtyKg: 10000, pricePerKg: 4.2 },
      ],
    });
    // A pending sample request (from MediSource) so the seller queue has content
    // and Cipla can still make a fresh request in the demo/e2e.
    await prisma.sampleRequest.create({
      data: { productId: sunPara.id, buyerOrgId: medisource.id, sellerOrgId: sun!.id, status: 'requested', quantityG: 50, shipTo: 'Singapore' },
    });
  }

  // A registered document with a REAL SHA-256 so /verify + the registry work.
  // The hash is deterministic (same source string in the e2e), not fabricated.
  const DEMO_DOC_HASH = createHash('sha256').update('PharmaLink demo document — Sun FDA GMP Halol').digest('hex');
  await prisma.document.create({
    data: { orgId: sun!.id, kind: 'gmp_cert', filename: 'FDA_GMP_Sun_Halol_2027.pdf', mimeType: 'application/pdf', sizeBytes: 284102, sha256: DEMO_DOC_HASH, status: 'verified' },
  });

  // ------------------------------------------------- Curated supplier detail
  // Facilities, regulatory filings and contacts -- the data the v3 curation
  // template adds. Kept small deliberately: e2e runs `workers: 1` against one
  // SQLite file, so every seeded row is paid for by all thirty-odd specs.
  {
    const sunSites = await prisma.site.findMany({ where: { orgId: sun!.id }, select: { id: true } });
    if (sunSites[0]) {
      await prisma.site.update({
        where: { id: sunSites[0].id },
        data: {
          externalId: 'FAC-IND-3002807546',
          fdaGmpStatus: 'Current (Active)',
          euGmpStatus: 'Current (Active)',
          whoGmpStatus: 'Listed (Active)',
          lastFdaInspectionAt: daysFromNow(-330),
          fdaInspectionOutcome: 'NAI (No Action Indicated)',
          lastEuInspectionAt: daysFromNow(-420),
          euInspectionOutcome: 'Satisfactory',
          form483Count: 0,
          capacityValue: 2400,
          capacityUnit: 'MT/year',
          utilizationPct: 65,
          manufacturingType: 'API Manufacturing',
          containmentLevel: 'Standard Containment (open API)',
          sterile: false,
          coldChainCapability: 'Ambient (15-25C) only',
          productionLines: 8,
          qcLabs: 3,
          yearEstablished: 1998,
          employees: 2200,
          sourceUrl: 'https://www.accessdata.fda.gov/scripts/cder/daf/',
          dataSourceName: 'FDA FEI Search',
          lastVerifiedAt: daysFromNow(-20),
        },
      });
    }
    // A second site carrying VAI, so both badge variants render. An inspection
    // outcome that is never anything but clean teaches an operator nothing.
    await prisma.site.create({
      data: {
        orgId: sun!.id,
        name: 'Ankleshwar API Facility (Unit II)',
        location: 'Ankleshwar, Gujarat, India',
        city: 'Ankleshwar',
        state: 'Gujarat',
        country: 'India',
        siteType: 'manufacturing',
        regulatoryId: '3002808041',
        externalId: 'FAC-IND-3002808041',
        fdaGmpStatus: 'Current (Active)',
        lastFdaInspectionAt: daysFromNow(-160),
        fdaInspectionOutcome: 'VAI (Voluntary Action Indicated)',
        form483Count: 3,
        capacityValue: 900,
        capacityUnit: 'MT/year',
        utilizationPct: 48,
        manufacturingType: 'API Manufacturing',
        dataSourceName: 'FDA FEI Search',
        lastVerifiedAt: daysFromNow(-20),
      },
    });

    // Curation provenance on the two suppliers that carry curated detail, so
    // the data-quality page has all three freshness buckets to show rather than
    // nine identical "never verified" rows. The dates are the ones that make
    // the buckets differ: Sun inside 90 days, Huahai past the template's
    // six-month "outdated" line, everyone else genuinely never checked.
    await prisma.organization.update({
      where: { id: sun!.id },
      data: { sourceUrl: 'https://sunpharma.com/api', dataSourceName: 'Company website', curatedBy: 'seed', lastVerifiedAt: daysFromNow(-20) },
    });
    await prisma.organization.update({
      where: { id: huahai!.id },
      data: { sourceUrl: 'https://www.huahaipharm.com', dataSourceName: 'Company website', curatedBy: 'seed', lastVerifiedAt: daysFromNow(-210) },
    });

    // Three filings covering the three expiry shapes the compliance register
    // has to tell apart: none at all, imminent, and already gone.
    await prisma.regulatoryFiling.createMany({
      data: [
        {
          orgId: sun!.id,
          externalId: 'RF-2026-0001',
          filingType: 'US FDA Type II DMF',
          filingNumber: 'Type II DMF #23412',
          authority: 'US FDA CDER',
          country: 'United States',
          status: 'active',
          cas: '103-90-2',
          productName: 'Paracetamol (Acetaminophen)',
          filedAt: daysFromNow(-4200),
          approvedAt: daysFromNow(-4100),
          // A DMF genuinely has no expiry. This row is what proves the register
          // reports "unknown" rather than quietly reporting "ok".
          expiresAt: null,
          holderName: 'Sun Pharma API Division',
          openToReference: true,
          referencingCount: 48,
          annualFeeUsd: 4867,
          sitesCovered: '3002807546,3002808041',
          sourceUrl: 'https://www.accessdata.fda.gov/scripts/cder/daf/',
          dataSourceName: 'FDA CDER DMF list',
          lastVerifiedAt: daysFromNow(-20),
        },
        {
          orgId: sun!.id,
          externalId: 'RF-2026-0002',
          filingType: 'CEP (EDQM)',
          filingNumber: 'CEP 2019-021-3-0',
          authority: 'EDQM',
          country: 'European Union',
          status: 'active',
          cas: '103-90-2',
          productName: 'Paracetamol (Acetaminophen)',
          approvedAt: daysFromNow(-1800),
          // Twenty days out: lands in the `warning` bucket in compliance.ts.
          expiresAt: daysFromNow(20),
          holderName: 'Sun Pharma API Division',
          openToReference: true,
          sitesCovered: '3002807546',
          dataSourceName: 'EDQM CEP database',
          lastVerifiedAt: daysFromNow(-20),
        },
        {
          orgId: sun!.id,
          externalId: 'RF-2026-0003',
          filingType: 'US FDA ANDA',
          filingNumber: 'ANDA 200123',
          authority: 'US FDA CDER',
          country: 'United States',
          status: 'expired',
          cas: '15687-27-1',
          productName: 'Ibuprofen',
          approvedAt: daysFromNow(-2600),
          expiresAt: daysFromNow(-90),
          holderName: 'Sun Pharma API Division',
          openToReference: false,
          dataSourceName: 'FDA Orange Book',
          lastVerifiedAt: daysFromNow(-40),
        },
      ],
    });

    // Contacts on BOTH Sun and Huahai, which is what makes the gate testable:
    // Cipla's seeded deal (DEAL-2001) was awarded to Huahai and Sun's quote
    // stays 'submitted', so the same buyer sees the `full` tier on Huahai and
    // the `email` tier on Sun.
    await prisma.contact.createMany({
      data: [
        {
          orgId: sun!.id, externalId: 'CON-IND-0001', salutation: 'Mr.', firstName: 'Suresh', lastName: 'Kumar',
          jobTitle: 'Vice President - International API Exports', department: 'Global API Business',
          seniority: 'vp', primaryRole: 'export_sales',
          businessEmail: 'suresh.exports@sunpharma.test', mobile: '+91-98765-43210', officePhone: '+91-22-6645-5645',
          linkedinUrl: 'https://linkedin.com/in/example-suresh', city: 'Mumbai', country: 'India',
          territories: 'USA,EU27,UK,Canada,Japan', languages: 'English,Hindi,Gujarati',
          responseHours: 4, bestContactTime: '08:00-18:00 IST',
          dataSourceName: 'Supplier confirmation', lastVerifiedAt: daysFromNow(-25),
        },
        {
          orgId: sun!.id, externalId: 'CON-IND-0002', salutation: 'Dr.', firstName: 'Meera', lastName: 'Iyer',
          jobTitle: 'Head of Regulatory Affairs', department: 'Regulatory',
          seniority: 'director', primaryRole: 'regulatory',
          businessEmail: 'meera.ra@sunpharma.test', officePhone: '+91-22-6645-5700',
          linkedinUrl: 'https://linkedin.com/in/example-meera', city: 'Mumbai', country: 'India',
          territories: 'USA,EU27', languages: 'English,Hindi', responseHours: 24,
          dataSourceName: 'Supplier confirmation', lastVerifiedAt: daysFromNow(-25),
        },
        {
          orgId: huahai!.id, externalId: 'CON-CHN-0001', salutation: 'Ms.', firstName: 'Li', lastName: 'Wei',
          jobTitle: 'Director - International Sales', department: 'Export',
          seniority: 'director', primaryRole: 'export_sales',
          businessEmail: 'liwei.export@huahai.test', mobile: '+86-138-0000-0000', officePhone: '+86-576-8888-0000',
          linkedinUrl: 'https://linkedin.com/in/example-liwei', city: 'Taizhou', country: 'China',
          territories: 'EU27,WHO,LATAM', languages: 'Mandarin,English',
          responseHours: 8, bestContactTime: '09:00-18:00 CST',
          dataSourceName: 'Supplier confirmation', lastVerifiedAt: daysFromNow(-15),
        },
        {
          orgId: huahai!.id, externalId: 'CON-CHN-0002', firstName: 'Zhang', lastName: 'Hua',
          jobTitle: 'QA Manager', department: 'Quality Assurance',
          seniority: 'manager', primaryRole: 'quality',
          businessEmail: 'zhang.qa@huahai.test', officePhone: '+86-576-8888-0100',
          linkedinUrl: 'https://linkedin.com/in/example-zhang', city: 'Taizhou', country: 'China',
          languages: 'Mandarin', responseHours: 48,
          dataSourceName: 'Supplier confirmation', lastVerifiedAt: daysFromNow(-15),
        },
      ],
    });
  }

  // ---------------------------------------------------------------- News hub
  // Real-sounding regulatory/market posts so the homepage feed and /news are
  // populated on a fresh install. Author = ops admin.
  const opsAdminId = stableUserId('ops@pharmalink.global');
  const news: {
    locale: string;
    title: string;
    summary: string;
    body: string;
    category: string;
    sourceUrl?: string;
    ageDays: number;
  }[] = [
    {
      locale: 'en',
      category: 'regulatory',
      title: 'US FDA updates data-integrity expectations for API manufacturers',
      summary:
        'A refreshed guidance restates ALCOA+ record-keeping requirements and clarifies audit-trail review during routine inspections of active-ingredient facilities.',
      body:
        'The guidance does not introduce new obligations but consolidates expectations that inspectors have applied inconsistently. Manufacturers should confirm that electronic batch records capture a complete, attributable and contemporaneous audit trail.\n\nFor suppliers listing on PharmaLink, a current data-integrity posture is increasingly a buyer pre-qualification criterion — several verified buyers now request audit-trail review evidence alongside the CoA.',
      sourceUrl: 'https://www.fda.gov/regulatory-information',
      ageDays: 2,
    },
    {
      locale: 'en',
      category: 'market',
      title: 'Paracetamol API prices ease as Chinese capacity comes back online',
      summary:
        'Spot prices for pharma-grade paracetamol softened this quarter as maintenance turnarounds at two large plants concluded, lifting available tonnage.',
      body:
        'Buyers sourcing for H2 delivery are seeing more competitive quotes, though logistics costs remain elevated on some lanes. Lead times have normalised to 3–4 weeks for FOB shipments.\n\nOn PharmaLink, sourcing requests for paracetamol drew the widest quote spread of any molecule this month — a reminder that comparing on landed cost, not headline unit price, is where the saving is.',
      ageDays: 6,
    },
    {
      locale: 'en',
      category: 'supply',
      title: 'EU GMP certificate renewals: plan for longer inspection backlogs',
      summary:
        'National competent authorities are reporting inspection scheduling delays. Suppliers relying on a certificate expiring within six months should begin renewal now.',
      body:
        'A lapsed EU GMP certificate removes a supplier from consideration for any buyer with an EU regulatory market — on PharmaLink that means your listings stop matching those RFQs automatically. Keep your certification records current in your supplier profile so verified buyers continue to see you.',
      ageDays: 11,
    },
    {
      locale: 'en',
      category: 'company',
      title: 'PharmaLink opens an integration API for ERP and procurement platforms',
      summary:
        'Verified organizations can now issue scoped API keys and subscribe to signed webhooks, so the catalogue and RFQ events flow directly into existing systems.',
      body:
        'The read API covers products, suppliers and your own RFQs; webhooks push events such as rfq.posted and quote.awarded to your endpoint in near real time, signed with HMAC-SHA256. See the Developers page to get started, and create a key under Account → Integrations.',
      ageDays: 1,
    },
    {
      locale: 'zh',
      category: 'market',
      title: '扑热息痛原料药价格随中国产能恢复而回落',
      summary: '随着两家大型工厂检修结束、可供货量上升，本季度药用级扑热息痛现货价格走软。',
      body:
        '为下半年交付采购的买家看到报价更具竞争力，但部分航线的物流成本仍然偏高。FOB 货物的交货期已恢复至 3–4 周。',
      ageDays: 6,
    },
    {
      locale: 'zh',
      category: 'company',
      title: 'PharmaLink 面向 ERP 与采购平台开放集成 API',
      summary: '已认证企业现可签发带权限范围的 API 密钥并订阅带签名的 Webhook，将产品目录与询价事件直接接入现有系统。',
      body:
        '读取 API 覆盖产品、供应商及您自己的询价单；Webhook 会以 HMAC-SHA256 签名近乎实时地推送 rfq.posted、quote.awarded 等事件。请查看开发者页面开始使用。',
      ageDays: 1,
    },
  ];
  for (const n of news) {
    await prisma.newsPost.create({
      data: {
        locale: n.locale,
        title: n.title,
        summary: n.summary,
        body: n.body,
        category: n.category,
        sourceUrl: n.sourceUrl ?? null,
        status: 'published',
        publishedAt: daysFromNow(-n.ageDays),
        authorId: opsAdminId,
      },
    });
  }

  // ---------------------------------------------------------------- CMS content
  // Ops-curated homepage content: authored articles + crawled external links.
  const content: {
    kind: 'article' | 'link';
    category: string;
    title: string;
    summary: string;
    body?: string;
    imageUrl?: string;
    sourceUrl?: string;
    sourceName?: string;
    featured?: boolean;
    sortOrder?: number;
    ageDays: number;
  }[] = [
    {
      kind: 'article',
      category: 'insight',
      title: 'How to compare API quotes on landed cost, not headline price',
      summary:
        'The cheapest unit price rarely wins once MOQ, incoterms, lead time and payment terms are factored in. A short guide to reading a quote comparison.',
      body:
        'A headline price of $4.20/kg can cost more than $4.80/kg once you account for minimum order quantity, freight under the incoterm, and the working-capital hit of an advance payment.\n\nOn PharmaLink every quote is normalised into the same comparison table, so you compare like for like: unit price, total at your quantity, lead time, MOQ, incoterm, payment terms and the supplier’s live certifications.\n\nRule of thumb: shortlist on landed cost, then break ties on certification coverage and lead-time reliability.',
      featured: true,
      sortOrder: 1,
      ageDays: 3,
    },
    {
      kind: 'article',
      category: 'announcement',
      title: 'PharmaLink now offers an open API and signed webhooks',
      summary:
        'Verified organizations can issue scoped API keys and subscribe to marketplace events, so the catalogue and RFQ activity flow into their own systems.',
      body:
        'Integrate the verified catalogue and your own RFQs over REST, and receive rfq.posted / quote.awarded / org.verified events at your endpoint, signed with HMAC-SHA256.\n\nStart at the Developers page and create a key under Account → Integrations.',
      featured: true,
      sortOrder: 2,
      ageDays: 1,
    },
    {
      kind: 'link',
      category: 'news',
      title: 'US FDA — Data Integrity and Compliance With Drug CGMP',
      summary:
        'The FDA’s guidance on data-integrity expectations for CGMP, restating ALCOA+ record-keeping and audit-trail review during inspections.',
      sourceUrl: 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents',
      sourceName: 'U.S. Food & Drug Administration',
      featured: true,
      sortOrder: 3,
      ageDays: 5,
    },
    {
      kind: 'link',
      category: 'resource',
      title: 'WHO — Prequalification of Active Pharmaceutical Ingredients',
      summary:
        'The WHO programme that assesses APIs for quality, safety and efficacy — a reference many buyers use when setting certification requirements.',
      sourceUrl: 'https://extranet.who.int/prequal/active-pharmaceutical-ingredients',
      sourceName: 'World Health Organization',
      featured: false,
      sortOrder: 4,
      ageDays: 9,
    },
  ];
  for (const c of content) {
    await prisma.contentItem.create({
      data: {
        kind: c.kind,
        locale: 'en',
        title: c.title,
        summary: c.summary,
        body: c.body ?? null,
        imageUrl: c.imageUrl ?? null,
        sourceUrl: c.sourceUrl ?? null,
        sourceName: c.sourceName ?? null,
        canonicalUrl: c.kind === 'link' ? (c.sourceUrl ?? null) : null,
        category: c.category,
        status: 'published',
        featured: c.featured ?? false,
        sortOrder: c.sortOrder ?? 0,
        publishedAt: daysFromNow(-c.ageDays),
        fetchedAt: c.kind === 'link' ? daysFromNow(-c.ageDays) : null,
        authorId: opsAdminId,
      },
    });
  }

  // ------------------------------------------------------------ Reviews + saved
  // Real buyer reviews so supplier ratings render (averages are computed, not set).
  const sunS = await prisma.organization.findFirst({ where: { name: 'Sun Pharma API Division' }, select: { id: true } });
  const huahaiS = await prisma.organization.findFirst({ where: { name: 'Zhejiang Huahai Pharmaceutical' }, select: { id: true } });
  if (sunS && huahaiS) {
    const reviews = [
      { supplierOrgId: sunS.id, authorOrgId: cipla.id, authorUserId: stableUserId('riya@cipla.test'), rating: 5, title: 'Consistently reliable on Metformin', body: 'CoAs always in order and lead times as promised. Documentation is top-notch.', tags: 'Quality,Documentation,On-time delivery', verifiedBuyer: true },
      { supplierOrgId: sunS.id, authorOrgId: medisource.id, authorUserId: stableUserId('pro@medisource.test'), rating: 4, title: 'Strong quality, pricing negotiable', body: 'Good regulatory coverage; price came down after a short negotiation.', tags: 'Regulatory compliance,Communication', verifiedBuyer: false },
      { supplierOrgId: huahaiS.id, authorOrgId: cipla.id, authorUserId: stableUserId('riya@cipla.test'), rating: 4, title: 'Competitive on price', body: 'Responsive team and competitive pricing on Paracetamol.', tags: 'Competitive pricing,Fast response', verifiedBuyer: false },
    ];
    for (const r of reviews) await prisma.review.create({ data: r });
    await prisma.savedSupplier.create({ data: { orgId: cipla.id, supplierOrgId: sunS.id } });
    await prisma.savedSupplier.create({ data: { orgId: cipla.id, supplierOrgId: huahaiS.id } });
  }

  // ------------------------------------------------------------- Notifications
  // Seeded across all three groups (see src/lib/notifications.ts) so the centre
  // demonstrates what it is FOR: a closing RFQ and an expiring certificate stay
  // at the top while six routine shipment updates sit below them. A seed that
  // only wrote one kind would look identical to the flat list it replaced.
  const notify = async (
    email: string,
    rows: { kind: string; title: string; body?: string; link?: string; hoursAgo: number; read?: boolean }[]
  ) => {
    const userId = stableUserId(email);
    for (const r of rows) {
      const createdAt = new Date(Date.now() - r.hoursAgo * 3600_000);
      await prisma.notification.create({
        data: {
          userId,
          kind: r.kind,
          title: r.title,
          body: r.body ?? null,
          link: r.link ?? null,
          createdAt,
          // Read timestamps must post-date creation or the list sorts oddly.
          readAt: r.read ? new Date(createdAt.getTime() + 1800_000) : null,
        },
      });
    }
  };

  // The seller's action items are seeded READ on purpose. e2e asserts that the
  // badge appears when an RFQ is matched to this supplier; a pre-existing unread
  // action item would make that assertion pass no matter what the code did.
  // Read rows still render, so the demo loses nothing.
  await notify('suresh@sunpharma.test', [
    { kind: 'cert.expiring', title: 'EU GMP certificate expires in 25 days', body: 'Renew before the expiry date or your listings drop out of EU-market searches.', link: '/seller/compliance', hoursAgo: 3, read: true },
    { kind: 'rfq.matched', title: 'RFQ-2041 · Paracetamol, 500 kg matched to you', body: 'Cipla Ltd is sourcing for a US-market filing. Closes in 4 days.', link: '/seller/rfqs', hoursAgo: 9, read: true },
    { kind: 'quote.awarded', title: 'Your quote on RFQ-2039 was awarded', body: 'MediSource Global accepted $4.35/kg FOB Mumbai. Confirm to raise the order.', link: '/seller/quotes', hoursAgo: 27, read: true },
    // Unread, but routine — this is the case the quiet dot exists for.
    { kind: 'shipment.updated', title: 'Shipment SHP-1187 cleared customs at Nhava Sheva', hoursAgo: 5 },
    { kind: 'shipment.delivered', title: 'Shipment SHP-1174 delivered to Cipla Ltd, Goa', hoursAgo: 52 },
    { kind: 'review.received', title: 'Cipla Ltd left a 5-star review', body: '“CoAs always in order and lead times as promised.”', link: '/seller/reviews', hoursAgo: 74, read: true },
    { kind: 'content.published', title: 'New guidance: ICH Q7 audit-trail expectations', link: '/news', hoursAgo: 96, read: true },
  ]);

  await notify('riya@cipla.test', [
    { kind: 'quote.received', title: '3 quotes received on RFQ-2041 · Paracetamol', body: 'Best offer $4.20/kg. The RFQ closes in 4 days.', link: '/buyer/rfqs', hoursAgo: 2 },
    { kind: 'rfq.closing', title: 'RFQ-2044 closes in 18 hours', body: 'Two suppliers have quoted. Award now or extend the deadline.', link: '/buyer/rfqs', hoursAgo: 6 },
    { kind: 'shipment.updated', title: 'Shipment SHP-1187 is in transit · ETA 14 Aug', link: '/buyer/orders', hoursAgo: 5 },
    { kind: 'org.verified', title: 'Zydus Lifesciences is now a verified supplier', body: 'A supplier on your watchlist completed verification.', hoursAgo: 40, read: true },
    { kind: 'plan.changed', title: 'Your Free plan renews on 1 September', link: '/account/billing', hoursAgo: 120, read: true },
  ]);

  // ------------------------------------------------------ Demo integration key
  // A fixed key so docs/e2e can call /api/v1 without a UI round-trip. Only the
  // hash is stored in production keys; this raw value is demo-only.
  const DEMO_API_KEY = 'plk_live_demoOnlyKey0000000000000000000';
  await prisma.apiKey.create({
    data: {
      orgId: cipla.id,
      name: 'Demo ERP integration',
      prefix: DEMO_API_KEY.slice(0, 16),
      hashedKey: createHash('sha256').update(DEMO_API_KEY).digest('hex'),
      scopes: 'catalog:read rfq:read suppliers:read',
      active: true,
    },
  });

  // Every seeded org has a single primary user — make them the org owner so they
  // can manage the team. New teammates join as members.
  await prisma.user.updateMany({ where: { orgId: { not: null } }, data: { orgRole: 'owner' } });

  const counts = {
    orgs: await prisma.organization.count(),
    users: await prisma.user.count(),
    products: await prisma.product.count(),
    rfqs: await prisma.rfq.count(),
    quotes: await prisma.quote.count(),
  };
  console.log('Done:', counts);

  // Market data last: mirroring platform quotes/deals into the observation
  // table requires them to exist first.
  const market = await seedMarketData(prisma);
  const internal = await mirrorInternalPrices(prisma);
  const scored = await seedForecastScoreboard(prisma);
  console.log('Market data (real captured public sources):', {
    ...market,
    internalPrices: internal.inserted,
    totalObservations: await prisma.priceObservation.count(),
    issuedForecasts: scored,
  });
  console.log(`\nDemo logins (password: ${DEMO_PASSWORD})`);
  console.log('  ops@pharmalink.global       — application admin (users + verify + catalog)');
  console.log('  verifier@pharmalink.global  — verification officer (verify ONLY)');
  console.log('  catalog@pharmalink.global   — product admin (catalog ONLY)');
  console.log('  riya@cipla.test        — verified buyer');
  console.log('  arjun@torrent.test     — UNVERIFIED buyer (RFQ blocked)');
  console.log('  suresh@sunpharma.test  — verified supplier');
  console.log('  li.wei@huahai.test     — verified supplier (China)');
  console.log('  raj@zydus.test         — pending supplier (in ops queue)');
  console.log(`\nDemo API key (Cipla org): ${DEMO_API_KEY}`);
  console.log('  curl localhost:3000/api/v1/products -H "Authorization: Bearer <key>"');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
