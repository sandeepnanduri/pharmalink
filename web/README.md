# PharmaLink Global — Phase 1 (MVP)

B2B marketplace for GMP-verified pharma ingredients. Next.js 15 · TypeScript · Prisma · Auth.js · Tailwind · next-intl (EN / 简体中文).

## Run it

```bash
cd web
npm install
npm run setup      # generate client + create SQLite DB + seed demo data
npm run dev        # http://localhost:3000  → redirects to /en
```

## Demo logins — password `Password123!`

| Email | Role | Why it's interesting |
|---|---|---|
| `riya@cipla.test` | Buyer (verified) | Can post RFQs, compare quotes, accept |
| `arjun@torrent.test` | Buyer (**unverified**) | **RFQ posting is blocked** — proves the gate |
| `suresh@sunpharma.test` | Supplier (verified) | Receives matched RFQs, submits quotes |
| `li.wei@huahai.test` | Supplier, China (verified) | Holds EU GMP + WHO PQ but **not** US FDA GMP |
| `dev@mangalam.test` | Supplier (**pending**) | Cannot manage products until verified |
| `raj@zydus.test` | Supplier (**pending**) | Sits in the ops queue — approve them and watch their product appear in the catalog |
| `ops@pharmalink.global` | Ops / Admin | Verification queue + audit trail |

## Try this path (5 minutes)

1. **`/en/catalog`** — search `Paracetamol` → 2 results. Tick **US FDA GMP** → 1 result. Huahai drops out because it doesn't hold that cert (**AND** semantics, not OR).
2. **Sign in as `arjun@torrent.test`** → `/en/buyer/rfqs/new` → the wizard isn't there, just an explanation. Logging in is not authorization.
3. **Sign in as `riya@cipla.test`** → post an RFQ for Ibuprofen / CAS `15687-27-1`, mandate US FDA GMP → step 3 shows **real matched suppliers** computed server-side.
4. **Sign in as `suresh@sunpharma.test`** → `/en/seller` → the inquiry is waiting → submit a quote.
5. **Back as Riya** → compare quotes side by side → **Accept** → a frozen `DEAL-xxxx` record is created.
6. **Sign in as `ops@pharmalink.global`** → `/en/admin` → approve **Zydus** → their Amoxicillin listing appears in the catalog.
7. **Switch to 简体中文** in the header — the whole UI translates and you stay on the same page.

## Scripts

```bash
npm run verify      # lint + typecheck + unit  (all green)
npm test            # 41 unit tests
npm run test:e2e    # 17 Playwright E2E tests
npm run db:seed     # reseed (clears + reinserts)
```

## Architecture notes

- **Trust model.** This is a *public* marketplace: anyone may sign up (JIT on SSO is intentional). Sign-in grants nothing — every real action is gated on the organization being **ops-verified** (`src/lib/rbac.ts`). Gates are enforced **server-side** in every action, never just hidden in the UI.
- **Matching** (`src/lib/matching.ts`) is deliberately **rule-based, not AI** (BACKLOG F4.2): a verified seller must list the CAS *and* hold **every** mandated cert (verified + unexpired). AI scoring is Phase 2 (R16).
- **Deal records are frozen snapshots** — terms are serialised at acceptance so the record can't drift if a quote changes.
- **Audit log** written for every sensitive action (`org.verified`, `quote.accepted`, …), surfaced in the ops console.
- **Boundary parsers** (`parseRole` / `parseOrgStatus`) validate DB strings and **fail closed** — an unknown role degrades to least privilege.

### Auth providers

| Provider | Status |
|---|---|
| Local signup (bcrypt) | ✅ working |
| **Google SSO** | wired, set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` |
| **SAML SSO** (BoxyHQ) | wired, set `BOXYHQ_SAML_ISSUER` / `BOXYHQ_SAML_CLIENT_ID` |

Both SSO providers are feature-flagged: without config they aren't registered and their buttons stay hidden, so the app always boots. Set `NEXT_PUBLIC_GOOGLE_ENABLED=true` / `NEXT_PUBLIC_SAML_ENABLED=true` to show the buttons.

### Database

SQLite for zero-setup dev and fast CI. The schema is written to be **Postgres-portable** — see the header of `prisma/schema.prisma` for the 3-step switch (provider, enums, `Decimal` for money).

## Revenue model — subscription only

The platform charges a **subscription**. It takes **no commission on trade value**, holds
**no escrow**, and processes **no buyer↔seller payments** — so it stays out of PCI and
KYC/AML scope entirely. Invoices are issued in-app and **settled off-platform** (bank
transfer / external payment link); no card data is ever captured or stored.

| | Starter — Free | Growth — $799/mo | Enterprise — Custom |
|---|---|---|---|
| RFQs / month | 3 | Unlimited | Unlimited |
| Live listings | 5 | Unlimited | Unlimited |
| User seats | 1 | 5 | Unlimited |
| Verification SLA | 48h | 24h | 12h + CSM |
| Featured placement | — | ✅ | ✅ |
| Comparison export | — | ✅ | ✅ |
| Price benchmarks | — | ✅ | ✅ |
| WhatsApp notifications | — | ✅ | ✅ |
| SAML SSO | — | — | ✅ |
| Team roles & approvals | — | — | ✅ |
| API / ERP | — | — | ✅ |
| Audit log export | — | — | ✅ |

Entitlements live in `src/lib/plans.ts` (16 unit tests) and are enforced **server-side** in
`src/lib/actions.ts` — a UI-only limit is not a limit. Unknown plans **fail closed** to Starter.

## Documents, notifications & export

- **Uploads are real.** Bytes are validated (PDF/PNG/JPEG, 10 MB cap), **SHA-256 hashed**, and
  written under an opaque, unguessable key (`src/lib/storage.ts`). Identical bytes de-duplicate.
- **No file ever has a public URL.** Reads go through `GET /api/documents/[id]`, which re-checks
  access on every request and writes a `document.accessed` audit row. Access = owning org,
  ops admin, or a **verified** counterparty party to the RFQ. Everyone else gets **404, not 403**
  — the existence of a document is not disclosed.
- **Notification centre** (`/notifications` + header bell) fires on RFQ match, quote received,
  quote accepted and verification decisions. In-app rows are the source of truth; email/WhatsApp
  dispatch will read the same rows so channels cannot drift.
- **PDF export** of the deal record and quote comparison via a print-optimised route. This is
  browser print-to-PDF *by choice*: the browser already has CJK fonts, so 简体中文 exports
  correctly without embedding a CJK subset (a classic source of tofu boxes in generated PDFs).

## Known gaps (honest list)

- Email/WhatsApp **dispatch** is not wired (F5.2/F5.3) — notifications are in-app only.
- Storage backend is local disk; the `ObjectStore` interface in `src/lib/storage.ts` is the seam
  for S3 / Azure Blob (same keys, same call sites).
- **Escrow / payments / disputes-with-refunds: removed by design**, not pending. See
  `../BACKLOG.md` R9 (dropped) and A1.
