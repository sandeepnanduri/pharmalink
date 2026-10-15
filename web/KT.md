# PharmaLink — knowledge transfer

Everything someone needs to take this over: what it is, how it is put together, how
data moves through it, how to run and deploy it, and what is currently wrong with it.

Written 2026-08-10 against `develop` @ `51a1491` — the commit serving
<https://pharmaconnectb2b.duckdns.org>. Live findings in this document were measured
against that deployment, not inferred from the code.

---

## 1. What it is

A B2B marketplace for pharmaceutical raw materials: APIs, intermediates, KSMs,
excipients and finished dose forms. Buyers (formulators) find molecules and request
quotes; suppliers (manufacturers) list products and respond; the platform's actual
product is **trust** — it verifies who a supplier is, tracks their certificates and
regulatory filings, and puts a defensible price forecast next to every molecule.

The platform never holds or routes trade value. There is no escrow. That constraint
shapes real decisions downstream — see §6.

### Roles

| Role | Can | Notes |
|---|---|---|
| `buyer` | post RFQs, compare quotes, award deals, see analytics | must be a **verified** org to transact |
| `seller` | list products, quote, manage sites and filings | listings are public only once the org is verified |
| `both` | either | sees sourcing and supply groups in that order |
| `admin` | everything staff-side | no organisation, so can never trade |
| `verifier` | verification queue only | narrow by design |
| `product_admin` | catalogue moderation only | narrow by design |

Staff having **no `orgId`** is the mechanism, not a convention: an RFQ needs a
`buyerOrgId`, so a staff account is structurally incapable of posting one.

---

## 2. Shape of the codebase

```
web/
  src/app/[locale]/       48 page routes, locale-prefixed (en, zh)
  src/app/api/            13 route handlers
  src/lib/                88 modules — domain logic, queries, server actions
  src/components/         UI, mostly server components
  prisma/schema.prisma    39 models
  e2e/                    38 Playwright specs (205 tests)
  deploy/oci/             the production stack
```

**47 unit test files / 739 tests. 38 e2e specs / 205 tests.**

### Conventions worth knowing before you change anything

These are load-bearing. Each exists because the alternative caused a specific bug.

| Convention | Why |
|---|---|
| **No Prisma `enum`, no `Json` columns** | Postgres portability is a stated goal. Statuses are `String` with a `///` doc comment listing the vocabulary, parsed fail-closed at the boundary. |
| **`specJson` is JSON-in-text** | Following the `Deal.termsJson` precedent. Opaque to the database, *not* to the application — `product-spec.ts` is the registry that gives it structure. |
| **Never store a derived value** | A second column holding a fact another column implies is a data-integrity bug. Counts, deltas and "days until expiry" are computed at read time. |
| **Multi-value fields are comma-separated** | The v3 workbook uses semicolons; conversion happens at the import and export boundary, nowhere else. |
| **A filter section must be backed by a real column** | `filters.ts` enforces it. Promoting a `specJson` key to a column is the deliberate act of deciding to filter on it. |
| **`unitPriceUsdKg` is the only field price maths reads** | Everything else is provenance. FDC per-unit prices carry `priceUnit` and are excluded from price sorts and ranges. |
| **No `prisma/migrations`** | `db push` only. See §7 for what that means for deploys. |

---

## 3. Feature matrix

Verified live means: exercised on the deployed site during the 2026-08-10 audit.

### Marketplace core — Epic #4

| Feature | Route | Reads | Writes | Live |
|---|---|---|---|---|
| Catalogue with filter rail | `/catalog` | `catalog-queries.ts`, `filters.ts` | — | ✅ |
| Product detail + spec sheet | `/products/[id]` | `product-spec.ts` registry | — | ✅ |
| Compare products | `/products/compare` | `catalog-queries.ts` | — | ✅ |
| Post an RFQ | `/buyer/rfqs/new` | `match-score.ts` | `Rfq`, `RfqSupplier` | ✅ |
| Supplier inbox and quoting | `/seller` | `rfq-queries.ts` | `Quote` | ✅ |
| Compare quotes, award | `/buyer/rfqs/[id]/compare` | `pricing.ts` | `Deal`, `Quote.status` | ✅ |
| Counter-offer negotiation | `negotiation-panel.tsx` | — | `Quote`, `CounterOffer` | ✅ |
| Sample requests | `/seller`, product page | `sample-queries.ts` | `SampleRequest` | ✅ |
| Orders and shipment tracking | `/orders` | `fulfillment-*.ts` | `Shipment`, `Deal.status` | ✅ |
| Saved suppliers / shortlist | `/buyer/saved` | `social-queries.ts` | `SavedSupplier` | ✅ |
| **Supplier directory** | `/suppliers` | — | — | ❌ **404 — issue #12** |

### Trust and compliance — Epic #5

| Feature | Route | Reads | Writes | Live |
|---|---|---|---|---|
| Verification queue + dossier | `/admin` | `org-dossier.tsx` | `Organization.status`, `AuditLog` | ✅ |
| Certificate expiry register | `/compliance` | `compliance.ts` | — | ✅ |
| Facilities (sites) | `/seller/facilities` | — | `Site` | ✅ |
| Regulatory filings | `/seller/filings` | `compliance.ts` | `RegulatoryFiling` | ✅ |
| Supplier public profile | `/suppliers/[id]` | `supplier-queries.ts` | — | ✅ (verified orgs only) |
| Contact gate (3 tiers) | supplier profile | `contact-visibility.ts`, `contact-queries.ts` | — | ✅ |
| Document upload + review | `/api/documents` | `storage.ts` | `Document` | ✅ |

### Price intelligence — Epic #6

| Feature | Route | Reads | Writes | Live |
|---|---|---|---|---|
| Market index and spend | `/analytics` | `forecast-queries.ts` | — | ✅ |
| Molecule forecast | `/analytics/[cas]` | `forecast.ts`, `drivers.ts`, `supply-risk.ts` | — | ✅ |
| **Forecast evidence panel** | `/analytics/[cas]` | `price-evidence.ts` | — | ✅ |
| **Supplier vs market** | `/analytics/[cas]` | `price-evidence.ts` | — | ✅ |
| Market-data ingest console | `/admin/market-data` | `market-data.server.ts` | `PriceObservation`, `MarketSignal`, `IngestRun` | ✅ |

### Curation — Epic #7

| Feature | Route | Reads | Writes | Live |
|---|---|---|---|---|
| Workbook import (preview) | `/admin/imports` | `supplier-import.server.ts` | nothing — by design | ✅ |
| Workbook import (apply) | `/admin/imports` | same | 9 entities, transactional per company | ✅ |
| **Workbook export** | `/api/admin/exports/...` | `template-export.server.ts` | `externalId` backfill only | ✅ |
| Import history | `/admin/imports` | `ImportBatch` | — | ✅ |
| **Data quality** | `/admin/data-quality` | `data-quality-queries.ts` | — | ✅ |
| Seller CSV import/export | `/seller/products` | `csv.ts` | `Product` | ✅ |

### Platform — Epic #9

| Feature | Route | Notes | Live |
|---|---|---|---|
| Credentials + Google SSO | `/login` | Auth.js v5, JWT sessions | ✅ |
| Onboarding | `/onboarding` | org creation, role choice | ✅ |
| Team management | `/account/team` | `orgRole` owner/member | ✅ |
| API keys + webhooks | `/account/integrations` | `ApiKey`, `Webhook` | ✅ |
| Public REST API | `/api/v1/*` | bearer key, org-scoped | ✅ |
| i18n en/zh | every route | parity enforced by test | ✅ |
| Notifications | `/notifications` | in-app only | ⚠️ **links 404 — issue #13** |
| Billing / plans | `/billing`, `/pricing` | plan gates RFQ quota | ✅ |

---

## 4. Dataflows

### 4.1 The trade loop

```
Buyer posts RFQ ──> match-score.ts ranks verified suppliers by cert + product fit
                     │
                     └─> RfqSupplier rows (the broadcast list) ──> notifications
                                                                     │
Supplier quotes ──> Quote (status: submitted) ─────────────────────┘
                     │
Buyer compares ──> pricing.ts normalises to a landed-cost view
                     │
Buyer awards  ──> $transaction: Deal + Quote.status=accepted + Rfq.status=awarded
                     │                                    │
                     │                                    └─> termsJson: a FROZEN
                     │                                        snapshot, so the deal
                     │                                        cannot drift if the
                     │                                        quote is edited
                     └─> mirrorInternalPrices() ──> PriceObservation
                                                    (weight 1.0, HIGH confidence)
```

The last arrow is the one people miss: **closed deals feed the price engine.** An
on-platform transaction is the strongest evidence the forecast has, and it is the
platform's redefinition of the template's "escrow-confirmed" — there is no escrow.

### 4.2 Price intelligence

```
UN Comtrade ─┐
ECB FX ──────┤
openFDA ─────┼─> market-data.server.ts ─> PriceObservation ─┐
Platform     │   (withRun: every ingest      MarketSignal    │
quotes ──────┤    is an IngestRun row        SupplyEvent     │
Platform     │    with a status)                             │
deals ───────┘                                               │
                                                             v
                        price-evidence.ts: partition on outlierFlag
                                                             │
                          ┌──────────────────────────────────┤
                          v                                  v
                  forecast.ts (used rows only)        Evidence summary
                  drivers.ts (correlation)            - confidence mix
                  supply-risk.ts (0-100)              - what was excluded, why
                          │                           - origin/incoterm/purity
                          v                           - supplier vs market
                     /analytics/[cas]  <──────────────────────┘
```

Weight is set once, at write time, from the source type. The label shown on screen
is *derived from the weight* (`confidenceLabelForWeight`) rather than typed beside
it, so the badge can never disagree with the number the maths used.

### 4.3 Curation round trip

```
v3 workbook ──> xlsx.server.ts (header found by CONTENT, never by row offset —
                 it is row 5 on sheets 1,2,6 and row 4 on the rest)
                 │
                 v
            9 pure mappers ──> {ok: Row} | {error: {sheet,row,column,cellRef,code}}
                 │
                 v
            resolvePlan: resolves the whole dependency graph BEFORE reporting,
                         so a rejected company also rejects its children rather
                         than orphaning them
                 │
        preview │ writes nothing        apply │ $transaction per company
                 v                             v
            ImportBatch (report)          Organization, Site, Product,
                                          RegulatoryFiling, Contact
                                          + PriceObservation OUTSIDE the
                                            transaction (CAS-keyed, idempotent
                                            on sourceRef, and 400 of them would
                                            blow the 20s timeout)
                 ^                             │
                 └──────── template-export ────┘
                           every column carries the template's literal header;
                           a test asserts each normalises to a key a mapper reads
```

**Idempotency**: apply the same file twice and the second run reports `created: 0`.
That is the acceptance test for the whole feature, and it holds because every
entity has a stable external ID.

### 4.4 Verification gate

```
signup ─> Organization.status = 'pending'
              │
              │   invisible in /catalog (catalog-queries.ts filters on it)
              │   cannot post an RFQ  (REQUIRES_VERIFIED in rbac.ts)
              v
ops reviews dossier at /admin
              │
        approve│                          reject│
              v                                 v
     status = 'verified'              status = 'rejected'
     certs + docs promoted            reason is MANDATORY
     AuditLog + notification          AuditLog + notification
```

`curationStatus` is a **separate column** carrying the workbook's Verified /
Outdated / Flagged / Duplicate. Writing that into `status` would publish an
imported company as an RFQ-eligible supplier with no human review. There is a test
asserting the importer never writes `status: 'verified'`.

---

## 5. Running it

```bash
cd web
npm ci
npm run setup          # prisma generate + db push + seed
npm run dev            # http://localhost:3000

npm run verify         # lint + typecheck + 739 unit tests
npm run test:e2e       # 205 specs; owns its own server and database
```

The e2e suite builds, seeds `test.db` and starts its own server. It never touches
`dev.db`.

### Demo logins (password `Password123!`)

| Email | Role |
|---|---|
| `ops@pharmalink.global` | admin — users, verify, catalogue |
| `verifier@pharmalink.global` | verification only |
| `catalog@pharmalink.global` | catalogue moderation only |
| `riya@cipla.test` | verified buyer |
| `arjun@torrent.test` | **unverified** buyer — RFQ blocked |
| `suresh@sunpharma.test` | verified supplier |
| `li.wei@huahai.test` | verified supplier (China) |
| `raj@zydus.test` | pending supplier, sits in the ops queue |

These exist on production too — the volume predates `SEED=false`.

---

## 6. Deployment

```
push to develop
   │
   ├─ preflight  names every missing secret/variable and blocks the build
   ├─ verify     lint + typecheck + 739 unit tests
   ├─ build      native amd64 → ghcr.io/sandeepnanduri/pharmalink:<sha>
   └─ deploy     scp stack → ssh → pull → up -d
                 wait on the container's own healthcheck
                 roll back to the previous image if it never reports healthy
                 then check the PUBLIC url separately
```

| | |
|---|---|
| Host | `140.245.197.227`, user `ubuntu`, **x86_64** |
| Stack | `~/pharmalink/deploy/oci/docker-compose.prebuilt.yml` — app + Caddy |
| Data | Docker volume at `/data` — SQLite database and uploads |
| URL | <https://pharmaconnectb2b.duckdns.org> |

**The runner builds because the VM cannot.** 1 GB of RAM runs Next.js comfortably
and cannot compile it.

**`NEXT_PUBLIC_*` is compiled into the browser bundle.** Changing `SITE_URL` means
rebuilding. Editing the VM's `.env` will not do it. This is also why issue #11
(logos) cannot be fixed on the VM.

### Schema changes need care

There are no migrations. The entrypoint copies a template database onto the volume
**only if none exists** — an existing volume is never migrated. A column added to
`schema.prisma` will therefore be missing on the live database and every query
touching it will fail at runtime, with a green deploy.

Before deploying a schema change, diff the live columns against the schema. There
is a worked example of this check in the session log; it takes two minutes and it
is the difference between a deploy and an outage.

---

## 7. What is currently wrong

Tracked in GitHub, milestone **v3 Curation Template**.

| # | Issue | Impact |
|---|---|---|
| [#11](https://github.com/sandeepnanduri/pharmalink/issues/11) | **Supplier logos never render** | A stated requirement is unmet. All 13 catalogue logos fall back to monograms because `NEXT_PUBLIC_LOGO_DEV_TOKEN` was never issued or passed at build time; `img.logo.dev` returns 401. |
| [#12](https://github.com/sandeepnanduri/pharmalink/issues/12) | **No supplier directory** | `/en/suppliers` 404s. The API exposes `GET /api/v1/suppliers`; the UI has no index. |
| [#13](https://github.com/sandeepnanduri/pharmalink/issues/13) | **6 of 8 notification links 404** | Seeded links point at a route layout that no longer exists. |
| [#14](https://github.com/sandeepnanduri/pharmalink/issues/14) | Data-quality links unverified suppliers to a 404 | The public profile `notFound()`s for non-verified orgs; the queue deliberately lists them. |
| [#15](https://github.com/sandeepnanduri/pharmalink/issues/15) | 5 e2e specs flaky | One shared SQLite fixture, `workers: 1`. The failing *set* rotates. Fix is a per-spec database. |

Also open and worth knowing: the `metadataBase` warning breaks social previews, and
the page-interior restyle (tables, chips, empty states) is done for the shell and
the new pages but not everywhere.

---

## 8. Where the bodies are buried

Things that will cost you a day if you meet them cold.

- **`revalidatePath` does not refresh a `force-dynamic` page.** There is no cached
  entry to drop, so Next answers with an empty revalidated-path list and the client
  keeps the tree it has. Use `<ActionForm>`, which awaits the action in a client
  closure. Watching `useFormStatus` for the settled edge **does not work** when the
  response remounts the row — the new observer starts fresh and never sees a
  transition. This cost several rounds to diagnose; see issue #27.
- **`contains` is case-sensitive on SQLite and insensitive on Postgres**, and
  Prisma's `mode: 'insensitive'` is unsupported on SQLite. Grade tokens are
  canonicalised at import for this reason.
- **`createMany({skipDuplicates})` throws on SQLite** instead of skipping.
- **`nulls: 'last'` is silently ignored on SQLite.** `catalog-queries.ts` does a
  two-pass sort instead. Verified at runtime, not assumed.
- **An empty `--build-arg` overrides the Dockerfile default** rather than falling
  back to it. This shipped a broken image once; `preflight` now blocks it.
- **`scp` copies two of three files and exits zero.** The deploy verifies the file
  landed for this reason.
- **The i18n parity test fails on any zh string identical to English.** That is why
  ~200 spec field labels live in the registry rather than the message catalogues.
- **The header row moves between sheets** in the v3 workbook — row 5 on sheets 1, 2
  and 6, row 4 on the rest. Never read by offset.

---

## 9. Tracking

| | |
|---|---|
| Epics | [#4](https://github.com/sandeepnanduri/pharmalink/issues/4)–[#10](https://github.com/sandeepnanduri/pharmalink/issues/10) |
| Open defects | #11–#15 |
| Shipped record | #16–#35, closed, one per phase and per fixed defect |
| Milestone | v3 Curation Template |
| Labels | `epic` `feature` `bug` `requirement` `tech-debt` `infra` `shipped` `verified-live` |

Design intent lives in code comments, deliberately: the reason a thing is the way it
is sits next to the thing. `HARDENING-PLAN.md`, `ARCHITECTURE.md`, `DATA-SOURCES.md`
and `deploy/oci/README.md` carry the longer arguments.
