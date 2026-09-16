# Market data sources for API price prediction

A scouting report on where API (active pharmaceutical ingredient) price and
supplier data can actually be obtained, what each source is worth to the
prediction engine, and whether it can be captured lawfully and technically.

Every claim below was **probed live** on 2026-08-07, not taken from a vendor's
marketing page. Where a source is marked blocked, that is an observed HTTP
response, not an assumption.

---

## 1. The blunt finding first

**There is no free, public, molecule-level API spot-price feed.** Anyone
claiming otherwise is selling one. What exists is three tiers:

| Tier | What it is | Cost | Precision |
|---|---|---|---|
| **A. Official trade statistics** | Customs value ÷ weight per tariff line | Free | Tariff heading, monthly, ~2-month lag |
| **B. Commercial shipment data** | Per-shipment records with buyer, seller, unit rate | Licensed | Molecule + counterparty, weekly |
| **C. Procurement/tender awards** | Prices actually paid in public tenders | Free | Finished product mostly, per-award |

The engine built here runs on **A + our own transactions**, treats **C** as a
manual import, and lists **B** as a documented gap with a price tag rather than
pretending to cover it.

---

## 2. Sources with a working connector

These are live in `src/lib/market-data.server.ts`. No API key, no scraping, no
terms violated.

### UN Comtrade — implied unit values ✅ *primary price signal*
- `https://comtradeapi.un.org/public/v1/preview/C/M/HS`
- **Verified working**, no key. Returns monthly HS-6 trade with `netWgt` (kg)
  and `primaryValue` (USD) — divide for an implied USD/kg.
- Real example pulled during this work — India exports, Jan 2024:

  | HS | Description | USD/kg |
  |---|---|---|
  | 291639 | Aromatic monocarboxylic acids (incl. ibuprofen) | 14.04 |
  | 292429 | Cyclic amides (incl. paracetamol) | 33.13 |
  | 293627 | Vitamin C and derivatives | 15.81 |
  | 294110 | Penicillins and derivatives | 41.68 |

- **Constraints found by probing, not by reading docs:**
  - The free preview endpoint accepts **one period per call** but **many
    commodity codes** — so batch by HS, loop by month.
  - It **rate-limits hard**: at a 400 ms gap most calls returned `429`. 1.4 s
    plus exponential backoff completes a full 24-month pull cleanly.
  - **China stops reporting monthly after 2024-12**; India runs to 2026-04.
    Coverage is a per-reporter fact, not a global one.
- **The honesty problem, and how it is handled:** an HS heading is usually
  *broader* than a molecule. `292429` is every cyclic amide, not paracetamol.
  The `HS_BY_CAS` table therefore tags each mapping `narrow` or `group`, and
  group-level observations are weighted at half of narrow ones
  (`customsWeight`). The UI states which heading a number came from.
- All 20 HS codes used were verified against the official reference file
  `https://comtradeapi.un.org/files/v1/app/reference/HS.json`.

### openFDA — supply events ✅ *the leading indicator*
- `https://api.fda.gov/drug/shortages.json`, `.../drug/enforcement.json`
- **Verified working**, no key (a free key raises quotas to 120k/day).
  CC0 public domain. 1,651 shortage records and 17,860 enforcement records live.
- Shortages, discontinuations and recalls move API prices *before* the price
  series shows it, which is why they are modelled as first-class `SupplyEvent`
  rows feeding the supply-risk index rather than left as news text.
- Recall class maps to severity. Note the parsing trap: `"Class III"` contains
  `"Class II"`, so a substring test silently grades the mildest recalls medium.

### ECB reference rates via Frankfurter ✅ *macro driver*
- `https://api.frankfurter.dev/v1/{start}..{end}?base=USD&symbols=INR,CNY`
- **Verified working**, no key. Nearly every API is priced off an Indian or
  Chinese cost base, so USD/INR and USD/CNY are the first-order FX driver.
- Intermittently `520`s on multi-year ranges — request in 12-month windows.

### openFDA approved drug applications ✅ *the supply base* (added 2026-08-11)
- `https://api.fda.gov/drug/drugsfda.json?search=openfda.generic_name:"..."`
- **Verified working**, no key, CC0. Feeds `MarketSupplier`, which is what
  `supply-risk.ts` computes its HHI over. Before this, the "supplier count" was
  whoever had listed on PharmaLink — a marketplace statistic being read as a
  market one.
- **Count applications, never NDC labelers.** Probed on ibuprofen: 264 distinct
  `labeler_name` values in `drug/ndc` versus 48 distinct application sponsors.
  The gap is repackagers and relabelers — *CVS Pharmacy, Amazon.com Services,
  Bryant Ranch Prepack* — none of which manufacture anything. An HHI over
  labelers reports a broad competitive field for a molecule that may still be
  made by two plants.
- **These are finished-dose holders, not API makers.** The ANDA holder for
  ibuprofen tablets usually buys the ibuprofen. The row carries
  `basis: 'finished_dose'` so the weaker claim cannot be read as the stronger
  one; only the DMF list answers the API question.
- **Applications whose products are all `Discontinued` are excluded** — a
  historical approval is not a supplier. Chloramphenicol has exactly one US
  application and it is discontinued, so it correctly reports 0 holders rather
  than 1.
- **The FDA indexes by USAN, not INN.** `paracetamol` returns NOT_FOUND;
  `acetaminophen` returns 127 applications. So does `acetylsalicylic acid` vs
  `aspirin`, and `vitamin e` vs `tocopherol`. `US_GENERIC_BY_CAS` maps all 12
  molecules and each name was confirmed live — a wrong name fails exactly like a
  molecule with no approvals, which is why none of them are guesses.
- First live run, 2026-08-11 (201 holder rows). The concentration findings are
  real and not uniform:

  | Molecule | Holders | HHI | Concentration |
  |---|---|---|---|
  | Paracetamol | 54 | 287 | unconcentrated |
  | Ibuprofen | 46 | 538 | unconcentrated |
  | Ascorbic acid | 7 | 1852 | moderate |
  | Riboflavin | 3 | 4286 | **concentrated** |
  | Tocopherol | 2 | 6800 | **concentrated** |
  | Chloramphenicol | 0 | 0 | unknown (all approvals discontinued) |

- **The share is approval count, not volume.** Nobody publishes per-firm tonnage
  for a generic, so every approval counts equally. That understates real
  concentration whenever one holder ships most of the volume across few
  approvals — it is a *floor* on concentration, not an estimate, and the UI must
  say so rather than print the HHI bare.

### PharmaLink's own quotes and deals ✅ *highest-quality evidence*
- A closed deal is a price someone actually paid; a customs aggregate is an
  average across every grade and counterparty in a tariff line. The evidence
  weights encode that ordering explicitly (`EVIDENCE_WEIGHT`).

---

## 3. Free and usable, but no API — needs a file import

These publish real data with no machine interface. Each needs a periodic
download-and-parse job, not a connector.

| Source | What it gives | Why it matters |
|---|---|---|
| **FDA Drug Master File list** — quarterly spreadsheet | Every Type II DMF holder per drug substance | The definitive answer to *who is qualified to supply this API into the US*. Directly feeds supplier-concentration (HHI). |
| **EDQM CEP database** (`extranet.edqm.eu`, HTTP 200, search UI only) | Certificate of Suitability holders per substance | Same for the EU supply base. |
| **EudraGMDP** | EU GMP certificates and manufacturing sites | Site-level compliance status. |
| **WHO Prequalification** (`extranet.who.int/prequal`, HTTP 200) | Prequalified APIs (APIMFs) | The supply base for donor-funded markets. |
| **Global Fund Price & Quality Reporting** | Transaction prices paid by donor-funded procurement, downloadable | **Real signed prices**, not statistics — the best free price data that exists. Finished products mostly. |
| **UNICEF Supply Division price data** | Indicative prices for 2,000+ procured products | Same category. |
| **India NPPA / state tender awards (TNMSC, RMSCL)** | Ceiling prices and award prices | Ground truth for the Indian market. |
| **MSH International Medical Products Price Guide** | Historic international reference prices | ⚠️ **Site retired 30 June 2024.** PDFs 1996–2015 only — historical baseline, not a live feed. |

**Why supplier data matters as much as price data:** the strongest predictor of
an API price spike is not last month's price, it is *how few plants make it*.
DMF and CEP counts per molecule give a defensible supplier count, and that feeds
the HHI in `supply-risk.ts`.

---

## 4. Sources that cannot be captured — the honest gap

Probed and confirmed blocked. These are listed in the admin console as gaps so
the coverage hole is visible next to the coverage.

| Source | Probe result | Reality |
|---|---|---|
| **PharmaCompass** | `403` from CloudFront — even `/robots.txt` | The best free-to-*read* API price trend data on the web. No public API; commercial licensing only. |
| **Zauba** | Cloudflare managed challenge on `/robots.txt` | Indian customs shipment records. |
| **Volza** | Cloudflare "Attention Required" | Same, paid API. |
| **ExportGenius / ImportGenius / Panjiva** | Commercial, subscription | Shipment-level with counterparties. |
| **ChemicalBook** | `robots.txt` explicitly `Disallow: /Chemical/Supplier/` and `/Chemical/DetailForCas/` | The supplier and CAS-detail pages — precisely the ones of interest — are disallowed. |

| **ChemAnalyst** | `robots.txt` **allows** `/Pricing-data/`; pages render server-side | Terms forbid it: *"you may not use substantial parts of this site, such as product listing and prices, on your own website without our written consent."* Blocked contractually, not technically. See §4b. |
| **Echemi** | `robots.txt` disallows `/market-price-list.html?keywords=*` and `/produce/ajaxGetLatestPricePage.do` | The price endpoints specifically are disallowed. The rest of the site is open. |
| **Guidechem** | `robots.txt` disallows `/*?*` | Every query string, which is how supplier search works. |
| **ChemNet** | Anti-bot JS cookie challenge on `/robots.txt` | Cannot be read without executing their fingerprinting script. |
| **Lookchem** | Connection timeout | Unreachable from here at all. |
| **Pharmaoffer** | Cloudflare `301` on `/robots.txt` | Not resolvable to a crawlable policy. |

**Recommendation:** if this engine is ever to move from tariff-heading proxies
to true molecule-level prices, the step is **licensing one shipment-data
provider** (Volza, ExportGenius or Panjiva), not more scraping. Scraping these
would breach their terms, and their bot protection means it would not work
anyway. Budget for a licence, or accept HS-line precision and say so — which is
what the product currently does.

---

## 4a. Chemical Weekly — probed in depth, 2026-08-11

Worth its own section because it is the **deepest price history found anywhere**
and the answer is "buy it", not "scrape it".

- `robots.txt` is `User-agent: * / Allow: /` — no path is disallowed. The
  constraint here is authentication, not crawl policy.
- The site is an Angular SPA over a Laravel API at `api.chemicalweekly.com`.

**Open, no authentication:**

| Endpoint | Returns |
|---|---|
| `GET Pricetrack/cities` | Mumbai, Chennai, Hyderabad — the three quoted markets |
| `GET Pricetrack/getDates` | **Every weekly price date from 05-02-2002 to now** — ~24 years, ~1,250 observations |
| `POST Chemxchange/getData` | Buy/sell listing search — 516 products with buy-side listings under "acid" |
| `GET newstrack/getDates`, `POST Chemxchange/getissuedates` | Weekly issue calendars |

**Gated — `401 {"message":"Authentication required"}`:**

| Endpoint | Returns |
|---|---|
| `POST Pricetrack/products` | The product list |
| `POST Pricetrack/getData` | **The price values themselves** (`product`, `city`, `fromdate`, `todate`) |

**Verdict.** The archive is real, weekly, city-level, and 24 years deep — which
is materially better than anything else surveyed, Comtrade included, on history
alone. But every price *value* is behind a paid subscription, and the open
`getDates` endpoint is essentially a shop window showing you exactly how much
you are not getting. There is no scraping route around this and none should be
attempted; the route is a subscription plus written confirmation that ingestion
into a derived price index is permitted.

**Two caveats to settle before paying:**
1. **Coverage is Indian *industrial* chemicals, not APIs.** A ChemXchange search
   for `paracetamol` returned zero sell-side listings. Confirm on a trial that
   the molecules in `HS_BY_CAS` are actually quoted before committing.
2. **Prices are Indian domestic, in INR, ex-works city markets.** They are a
   different series from an FOB export price and would need the FX leg and a
   basis adjustment before being comparable to Comtrade unit values.

**Unrelated to data, but noticed and worth reporting to them:** their production
API runs with Laravel debug output enabled — an error response returned a full
SQL statement, table and column names, and absolute server filesystem paths.
That is their misconfiguration to fix; it was not probed further.

---

## 4b. ChemAnalyst — the one worth licensing

The best *fit* found in this survey, and the clearest "ask, don't take".

- `sitemap_pricing.xml` lists **1,089 pricing pages**, `changefreq: daily`.
  `robots.txt` disallows only `/login`, `/RequestForm`, `/PricingForm` and
  `/MarketForm` — the pricing pages themselves are explicitly crawlable.
- Coverage maps onto this product almost exactly. Present at **molecule level**,
  not tariff heading: paracetamol, ibuprofen, aspirin, metformin HCl,
  azithromycin, omeprazole, amoxicillin trihydrate, ciprofloxacin HCl,
  penicillin G sodium, salicylic acid, para-aminophenol, acetic anhydride, and
  vitamins A, B1, B2, B4, B5, B6, B9, B12, C, D, E, K.
- Prices are server-rendered into the HTML, so no headless browser is needed —
  e.g. paracetamol Q2 2026: **USD 4,800/MT (USA)**, **USD 4,616.67/MT (China)**,
  quarterly averages with regional breakdown.
- It even carries the two precursors that drive the paracetamol cost base
  (p-aminophenol, acetic anhydride), which is the input-cost leg §5 wants.

**But their Terms of Use forbid precisely this use:**

> "You may not copy, reproduce, publish, transfer, distribute, publicly display,
> sell or offer for sale, enter in a database, or create other works from the
> materials… you may not use substantial parts of this site, such as product
> listing and prices, on your own website without our written consent."

"Enter in a database" and "product listing and prices" describe the ingest
exactly. Being technically readable and robots-allowed does not make it
permitted, and a price index is a derived work either way.

**Recommendation:** this is the licence to buy first — it is molecule-level
where Comtrade is heading-level, which is the single biggest precision upgrade
on the table, and unlike shipment data it is priced for a small buyer. Approach
them for written consent or a data licence. Until that exists in writing, the
connector stays `blocked` and the coverage hole stays visible in the admin
console.

---

## 5. Worth adding next (not yet built)

| Source | Key? | Adds |
|---|---|---|
| **FRED** (`api.stlouisfed.org`) — probed, returns `400` without a key | Free key | PPI series for pharmaceutical and organic-chemical manufacturing — a genuine input-cost driver. |
| **World Bank Pink Sheet** | No | Monthly commodity prices (crude, natural gas) — the petrochemical feedstock leg. |
| **US Census / USITC DataWeb** (probed, `302` to auth) | Free account | HS-10 US import lines, far narrower than Comtrade's HS-6. **The single biggest precision upgrade available for free.** |
| **Eurostat Comext**, **India Tradestat** | No | HS-8 national detail. |
| **FDA import alerts 66-40 / 99-32** | No | Site-level import bans — the sharpest supply shock there is. |

---

## 6. How to refresh

```bash
node scripts/capture-market-data.mjs   # re-capture the fixture snapshot (~3 min)
npm run db:seed                        # load it
```

Or, at runtime, sign in as an operator and use **Admin → Market data**, which
runs the same connectors and logs every run — success or failure — to
`IngestRun`.

The seed loads a *captured snapshot* rather than calling the APIs, so
`db:reset` and every Playwright run stay offline and deterministic and do not
hammer free public endpoints. The numbers in the demo database are still real
published figures.
