# PharmaLink — robustness + UI/UX hardening plan

Audit date: 2026-08-07. Scope: the whole `web/` app (42 pages, 45 components,
342 unit tests, 137 e2e).

Sizing is in **engineer-days**, assuming the same working pattern as the current
build (pure lib + unit tests + UI + i18n parity + e2e per slice).
S = ≤1d, M = 2–3d, L = 4–8d, XL = 8d+.

Ordering rule used throughout: **anything that loses data, hides an error, or
blocks a user comes before anything that looks better.** A beautiful app that
500s to a blank screen is worse than a plain one that degrades gracefully.

---

## 0. What this audit found that is actually alarming

| Finding | Evidence | Why it matters |
|---|---|---|
| **Zero error boundaries** | `find src/app -name error.tsx` → 0 results across 42 pages | Any thrown error in any server component shows Next's raw error screen. In production that is a white page with no recovery path and no report. |
| **No rate limiting anywhere** | no `rateLimit` in `src/` | Login is brute-forceable. Flagged in the 2026-07-18 pentest, still open. |
| **No structured logging or error tracking** | no Sentry/pino/winston | A production failure leaves no trace. You would learn about outages from users. |
| **Loading states on 7 of 42 routes** | `find -name loading.tsx` → 7 | 35 routes flash blank during navigation. |
| **No dark mode** | 0 `dark:` rules in `globals.css`; no `darkMode` in tailwind config | Table-stakes for a B2B tool people sit in all day. |
| **4 e2e failing on main** | full suite: 133 passed / 4 failed | Onboarding wizard gained steps in the 2026-08-03 work; the document-upload specs still click "next" twice. Tests are not gated by CI, so this went unnoticed. |

---

## Phase 1 — Stop the bleeding (5–7 days)

Non-negotiables. Nothing here is visible in a demo; all of it decides whether
the app survives a real user.

| # | Item | Size | Notes |
|---|---|---|---|
| 1.1 | **Error boundaries**: `global-error.tsx`, per-segment `error.tsx`, `not-found.tsx` | M | Must carry a reset action and a support reference, not a stack trace. Watch the existing soft-404 trap: a `loading.tsx` sibling commits a 200 before `notFound()` can fire. |
| 1.2 | **Rate limiting** on login, signup, password reset, RFQ create, API keys | M | Fixed-window per IP+identifier is enough at this scale; store in the DB so it survives the single container. Add lockout with exponential backoff and an audit-log entry. |
| 1.3 | **Structured logging + error tracking** | M | Request-id middleware, JSON logs, and a Sentry (or equivalent) hook in `global-error.tsx` + server actions. Without this, everything below is guesswork. |
| 1.4 | ~~**Fix the 4 failing e2e**~~ + add CI gate | S | **Wizard staleness fixed** (suite is 153 passed / 3 failed). The 3 that remain are not staleness — see 1.8. **Still open:** gate merges on `npm run verify` + e2e. |
| 1.5 | **Quota TOCTOU race** on RFQ creation | S | Known open. Wrap check+insert in a transaction with a unique constraint as the real guard. |
| 1.6 | **Transaction audit** | S | Only 7 `$transaction` calls across all mutations. Any action writing 2+ rows (deal + shipment + notification) needs one, or a crash mid-way leaves orphans. |
| 1.7 | ~~**Fix local `.env`**~~ | S | **Done.** `AUTH_URL`/`NEXT_PUBLIC_SITE_URL` now default to `http://localhost:3000`; the ngrok host, token and domain moved to a commented opt-in block. **Still open: rotate `NGROK_AUTHTOKEN`** — it has sat in plaintext on disk and only its owner can replace it. |
| 1.8 | **A committed mutation that the screen does not show** | M | See below. The last 3 e2e failures are all this. Highest-value item in the phase: it is a data-integrity-*looking* bug that is really a refresh bug, and it teaches operators to double-click destructive things. |

### 1.8 — what is actually wrong (diagnosed 2026-08-07, not yet fixed)

Three specs fail: ops approves a supplier, a supplier declines an inquiry, an
org registers a webhook. In every case **the write commits** — checked directly
against `test.db`: the org is `verified`, the `Webhook` row exists, both
`AuditLog` rows are written. Only the screen is wrong, and a manual reload
always corrects it. So this is not an authorization, transaction, or validation
bug, and it is not test staleness.

Mechanism, from the action's own response headers:

- Every one of these pages is `dynamic = 'force-dynamic'`, so there is **no
  cached entry for `revalidatePath('/[locale]/…', 'page')` to drop**. Next
  answers the action `200 text/x-component` with
  `x-action-revalidated: [[],1,0]` — an **empty** revalidated-path list — and a
  full, *correct* RSC tree. The client receives the fresh tree and keeps the one
  it has.
- Reproduced outside Playwright with a plain script, so it is app behaviour, not
  a test artifact. It is a **race**: same script, same build, roughly one pass in
  three.

What was tried, measured over repeated runs rather than single passes:

| Attempt | Result |
|---|---|
| `revalidatePath(pattern, 'page')` alone (the original) | ~1 pass in 3 |
| \+ `revalidatePath('/', 'layout')` | ~3 in 4 — **kept**, it is what sibling actions in the file already do |
| \+ `redirect()` back to the same page | **worse**: emits `x-action-redirect: /en/admin;push`, the router pushes a URL it already holds and serves the stale entry |
| \+ redirect to a cache-busting `?done=<id>` URL | 2 in 6 — no better than the layout call, so it was reverted rather than left in as unearned complexity |

Only the layout-level revalidate survives in the code today. It reduces the
failure rate; it does not remove it.

**Leading hypothesis for the real fix, untested:** the one page whose mutation
became reliable is the seller dashboard, and it is also the only one whose
submit button is a **client** component (`ConfirmSubmit`). The admin queue posts
from a plain server-rendered `<button>`. Wrapping these submits in a small client
component that calls `router.refresh()` once the action resolves would give every
mutation an explicit, non-optional refresh instead of an implicit one. Try that
next, and measure it over ≥6 runs — single runs are noise here.

**Exit criteria:** kill the process mid-request and nothing is corrupted; every
error reaches a dashboard; a brute-force script gets locked out; CI is green.

---

## Phase 2 — Industry-ready UI foundation (8–10 days)

This is the "looks like a real product" phase. Do it as a **design-system
layer**, not a per-page restyle, or phase 3 will re-do it.

| # | Item | Size | Notes |
|---|---|---|---|
| 2.1 | **Design tokens + dark mode** | L | Promote the ad-hoc palette to semantic tokens (`surface/raised/overlay`, `text-primary/secondary`, `border-subtle/strong`, elevation, radii, motion durations) as CSS variables, then `dark:` throughout. Doing tokens first makes dark mode mostly free. |
| 2.2 | **Data-table primitive** | L | Every screen hand-rolls `<table className="w-full text-sm">`. One component with sort, filter, pagination, column visibility, sticky header, row density, empty/loading/error states, and CSV export. Replaces ~12 bespoke tables and is the single biggest perceived-quality jump. |
| 2.3 | **Skeletons on all 42 routes** | M | Reuse the capsule loader. Respect the `notFound()` rule — segments that 404 must not get a loading boundary. |
| 2.4 | **Toast/notification system** | S | Server actions currently report success by re-rendering. Users need confirmation that does not require reading the whole page. |
| 2.5 | **Empty / error / zero-state pass** | M | Every list needs a designed empty state with a next action. The forecast work set the pattern (`no-observations`); apply it everywhere. |
| 2.6 | **Accessibility pass** | M | Skip-to-content link, landmark regions, focus-visible ring, focus trapping in modals, `aria-live` for async results, colour-contrast audit. Partially done in forms — finish it and add an axe check to e2e. |
| 2.7 | **Responsive/mobile pass** | M | Tables overflow on phones; needs a card-list fallback under `sm`. |

**Exit criteria:** dark mode ships with no visual regressions; one table
component powers every list; axe reports zero critical violations.

---

## Phase 3 — UX depth (6–8 days)

Where it starts feeling like a tool professionals choose rather than tolerate.

| # | Item | Size | Notes |
|---|---|---|---|
| 3.1 | **Global search / command palette** (⌘K) | M | Molecules, RFQs, suppliers, orders, pages. In a catalog product this is the primary navigation for power users. |
| 3.2 | **Saved views + filters** | M | Buyers re-run the same searches; persist filter sets per user. |
| 3.3 | **Onboarding wizard rework** | M | 5 steps with no progress persistence — a refresh loses everything. Add autosave, a progress indicator, and resumability. |
| 3.4 | ~~**Notification centre upgrade**~~ | S | **Done.** Grouped into action / update / info by what the event asks of the reader (`src/lib/notifications.ts`, 15 tests); the bell badge counts action items only, with a quiet dot for routine unreads; per-group unread counts, relative timestamps, sentiment-toned icons. **Still open:** per-type preferences and the email digest — both need a delivery-preferences table and an outbound mailer, which is Phase 4 work. |
| 3.5 | **Shared chart layer** | M | One `PriceChart` exists. Generalise to a small viz set (line/band, bar, sparkline) with consistent axes, tooltips, and the log-scale rule already established. |
| 3.6 | **Bulk actions + keyboard nav** on tables | M | Multi-select, bulk decline/approve, `j/k` navigation. |
| 3.7 | **Print/PDF styling** beyond the deal record | S | RFQs, quotes, compliance registers are all printed in this industry. |

---

## Phase 4 — Scale + operability (8–12 days)

Needed before real customers, not before a demo.

| # | Item | Size | Notes |
|---|---|---|---|
| 4.1 | **SQLite → Postgres** | L | Schema is already written to be portable; `Float` money fields should become `Decimal(12,4)` in the same pass. Unblocks >1 replica, which SQLite-on-Azure-Files cannot do safely. |
| 4.2 | **Scheduled ingestion** | M | Market-data connectors are manual-only by design. Add a scheduler with jitter, per-source backoff, and staleness alerts (Comtrade throttles to ~1 call/12s under load). |
| 4.3 | **Backup + restore runbook** | S | The OCI volume holds the DB and uploads with no tested restore path. Untested backups are not backups. |
| 4.4 | **CSP nonces** | M | Currently `unsafe-inline` + `unsafe-eval`. Move JSON-LD to a nonce and drop both. |
| 4.5 | **API-key entitlement enforcement** | S | Free orgs can mint keys. Revenue, not security — but it is a product decision that is currently made by omission. |
| 4.6 | **Object storage for uploads** | M | Local disk does not survive a container replacement or scale past one node. |
| 4.7 | **Health/readiness split + metrics** | S | `/api/health` exists; add readiness vs liveness and basic RED metrics. |

---

## Phase 5 — Prediction-engine depth (6–10 days, optional)

The engine is evidence-backed today (log-SES at 0.798 relative MAE, conformal
intervals at 79.8% coverage). The remaining wins are **data**, not models — the
bake-off showed model choice is nearly exhausted.

| # | Item | Size | Notes |
|---|---|---|---|
| 5.1 | **USITC DataWeb / US Census HS-10** | M | The single biggest free precision upgrade: HS-10 lines are far narrower than Comtrade's HS-6, which is the main source of noise today. |
| 5.2 | **Finish the multi-reporter history pull** | S | Script is written and resumable; it just needs hours of wall-clock. Enables the series-construction comparison that was degenerate on one reporter. |
| 5.3 | **FDA DMF + EDQM CEP importers** | M | Turns supplier-concentration (HHI) from "who listed here" into "who is actually qualified" — the input that most affects supply risk. |
| 5.4 | **Driver regression** | M | FX/freight/feedstock as explanatory inputs. Build only after 5.1 — more signal beats more model. |
| 5.5 | **Licensed shipment data** | — | Commercial decision, not engineering. Volza/ExportGenius/Panjiva is the only route to true molecule-level prices. |

---

## Total

| Phase | Days | Cumulative |
|---|---|---|
| 1 — Stop the bleeding | 5–7 | ~1.5 weeks |
| 2 — UI foundation | 8–10 | ~4 weeks |
| 3 — UX depth | 6–8 | ~5.5 weeks |
| 4 — Scale + operability | 8–12 | ~8 weeks |
| 5 — Engine depth (optional) | 6–10 | ~10 weeks |

**~35–47 engineer-days** for phases 1–4; call it **7–9 weeks** for one engineer,
or 4–5 weeks for two working in parallel after phase 1 (phase 2 and 4 are
largely independent).

## Recommended cut if the timeline is shorter

- **Demo-ready in 2 weeks:** Phase 1 + items 2.1, 2.2, 2.3, 2.5. Dark mode and a
  real data-table carry most of the "industry-ready" impression, and error
  boundaries stop the embarrassing failure mode.
- **Do not skip:** 1.1, 1.2, 1.3, 1.4. These are the ones that are invisible
  right up until they are catastrophic.
