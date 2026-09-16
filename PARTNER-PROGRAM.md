# PharmaLink Global — Sourcing Partner Channel

**Question:** Who already stands between API suppliers and buyers, how do they earn,
and can PharmaLink onboard them as a channel that brings *both sides* — paid per
transaction they originate?

**Answer in one line:** The role is worth building; the per-transaction incentive
is not worth *leading* with, and one version of it collides head-on with **A1**.

**Companion docs:** `BACKLOG.md` (A1, A6, R8, R38, R42, N3.6, EPIC N7),
`ARCHITECTURE.md` (services, audit), `web/src/lib/plans.ts` (entitlements),
`web/src/lib/associations.ts` (the "membership is a weak signal" precedent this
program reuses).

> **2026-08-29 addendum:** `PharmaLink_Agent_Framework.docx` (Product
> Management Office, approved June 2026 — one month *before* A1 existed)
> specifies this same role as a blockchain-escrowed marketplace. §§7–11 below
> reconcile its personas, day-to-day screen inventory and design system into
> this program's non-escrow design — see the EPIC N7 boundary note in
> `BACKLOG.md` for why the escrow mechanics were dropped rather than merged.

---

## 1. Who actually sits in the middle today

India imports **70–80% of its API/KSM requirement** from China (≈ $3.18bn in
FY23), and almost none of that trade is direct manufacturer-to-formulator. The
gap is filled by six recognisable archetypes.

| # | Archetype | Takes title? | Paid by | Typical earn | Brings | Recruitability |
|---|---|---|---|---|---|---|
| 1 | **Indenting agent (indentor)** — represents a Chinese/overseas manufacturer in India; arranges samples, CoA, DMF paperwork, production slots, language and time-zone bridging | No | Supplier | ~1–3% of shipped value (rule of thumb — validate per molecule) | **Both sides** | 5/5 |
| 2 | **Merchant trader / importer-stockist** — imports on own account, breaks bulk, resells to the SME formulator tail | Yes | Margin | 5–15% gross margin | Buyers (owns the SME tail) | 2/5 — most exposed to disintermediation |
| 3 | **Sourcing / procurement consultant** (ex-industry QA or purchase head) | No | Buyer | Retainer or per-project | Buyers, high quality | 4/5 |
| 4 | **Regulatory / DMF-CEP consultant** | No | Supplier | Filing fees | Suppliers, high quality | 4/5 |
| 5 | **CHA / freight forwarder** | No | Either | Per-shipment | Sees deals *after* the decision | 2/5 |
| 6 | **Association / council desk** (Pharmexcil, BDMA, IPA) | No | Members | Membership dues | Bulk introductions | Programme-level, not individual |

### How a deal actually runs today

```
enquiry -> agent shortlists 2-3 sources -> offer (price / MOQ / lead time / Incoterm)
-> sample + CoA -> buyer QA evaluation -> price negotiation (WhatsApp, email)
-> PI / PO -> LC or advance -> shipment docs -> payment -> commission invoice
```

Every step is WhatsApp, Excel and emailed PDFs. There is no verified document
store, no audit trail, no portfolio view, and — the point that matters most —
**no durable proof of who introduced whom.**

### The real pain (this is the wedge, not the money)

An indentor's single largest business risk is **being bypassed after the first
shipment**. Once the buyer and the manufacturer have each other's contact, the
commission is renegotiated downward or simply stops. A platform that timestamps
the introduction, holds the verified document trail and records the deal is the
agent's *insurance policy*. That is a far stronger recruiting pitch than a
referral fee, and it costs us almost nothing to build.

---

## 2. The role: **Sourcing Partner**

A third organisation kind alongside `buyer` and `seller` — `partner`. Disclosed,
never hidden; paid by the platform, never out of the unit price; never a gate in
front of a supplier.

### What a Sourcing Partner can do

| Capability | Detail | Reuses |
|---|---|---|
| **Partner code + invitations** | Issues invite links; any org onboarding through one is attributed at signup and sealed | new `PartnerAttribution` |
| **Portfolio console** | One dashboard over every represented org: cert status and expiry, live RFQs, quotes pending, deals, response rate | F4.8 dashboards, R4 expiry alerts |
| **Introduction record** | Immutable, timestamped *"Partner P introduced Buyer B to Supplier S for molecule M"* — the anti-bypass artefact | new `Introduction`, `AuditLog` |
| **Act for a supplier** | Draft quotes for the principal's approval, upload documents, maintain catalogue and price tiers — per-org, per-scope, revocable | F4.3, `ProductPriceTier`, `Document` |
| **Act for a buyer** | Post an RFQ, run the comparison — **acceptance stays with the buyer principal** | F4.1, F4.4 |
| **Public partner profile** | "Verified Sourcing Partner" page listing represented suppliers | F1.4 |

### What a Sourcing Partner explicitly cannot do

- **Accept a quote.** Creating a `Deal` (F4.6) is the principal's act, always.
- **Verify anyone.** Ops verification (F2.5) is unchanged. A partner introduction
  is a *weak signal*, exactly as trade-association membership is in
  `associations.ts` — represented orgs land as `draft` and queue like everyone else.
- **See other partners' portfolios**, or any data of an org that has not granted
  a live, consented, revocable representation scope.
- **Take title or handle goods.** The moment they do they are a `trader` seller
  org, not a partner — encode the boundary, don't leave it to policy.

---

## 3. The money — and the A1 collision

> **A1 (confirmed 2026-07-17):** *"the platform never holds, escrows or routes
> trade value and takes no commission — revenue is subscription only. This is a
> product decision, not a phasing decision."*
> **N3.6** puts a code guard and a failing test around it.

A per-transaction payout to a partner therefore has a funding problem: if the
platform takes no cut of trade value, there is no per-transaction revenue to
share from.

**A1 conflates two different things, and the distinction is the whole unlock:**

| | Regulatory / operational cost | Verdict |
|---|---|---|
| **Holding or routing trade value** (escrow — the deleted R9) | PCI, KYC/AML, payment sagas, dispute-driven fund release | Keep banned. A1 is right. |
| **Invoicing a success fee** on a closed deal | One more line on an invoice R8 already issues; platform never touches trade value | Not the same reversal — needs a founder decision, not a rebuild |

### Three funding models

*(Dollar figures throughout §§3, 5 are shown with an illustrative USD/INR
conversion at ≈₹83/$1 — round for readability, not a quoted rate.)*

**Model A — Reseller margin on subscriptions.** *A1-safe. Ships on today's code.*
Partner resells Growth/Enterprise to the orgs they bring: **27.5% recurring for
24 months**, 40% of first-year Enterprise. Pot per Growth account ≈ **$2,637/yr
(~₹2.19L/yr)**. Weakness: an indentor moving $3M/yr (~₹24.9Cr/yr) at 2% earns
~$60k (~₹49.8L). $2.6k (~₹2.2L) does not move him — it moves archetypes 3 and
4, not archetype 1.

**Model B — Verified-deal bounty, budgeted as acquisition cost.** *A1-safe.
Phase 2.* A **fixed, non-percentage** payment per verified `Deal`: **$150
(~₹12,450)** for a partner-attributed first deal between a *new*
buyer–supplier pair, **$75 (~₹6,225)** thereafter; capped per partner per
quarter; expires 12 months after attribution. This is marketing spend, not
revenue share — A1 bans *taking a cut*, not *spending on acquisition*, and
that reading must be written down explicitly. Feels per-transaction to the
partner without touching trade value.

**Model C — Success fee, partner-shared.** *Requires amending A1. Phase 3+.*
Platform invoices the **supplier** 0.4–0.75% of accepted-deal value, capped at
~$1,500/deal (~₹1.25L/deal), billed only after both parties confirm shipment;
partner keeps 40–50%. On a $40k (~₹33.2L) median deal: fee $200–300
(~₹16.6k–24.9k), partner takes $100–150 (~₹8.3k–12.5k) — **on top of** the
1–3% they still earn from their own principal. Needs: A1 amended, the N3.6
guard rewritten from *"never fee a deal"* to *"never route trade value"*, a
supplier T&C change, and GST/TDS handling.

### Recommendation

**A now → B at Phase 2 → C only if partner-sourced GMV proves out.** Price the
money to be sufficient; sell the moat — the introduction record, portfolio-wide
cert-expiry monitoring, and a public verified-partner profile. The pitch is
**"keep your commission, we protect it and make you faster"**, never *"earn from us."*

---

## 4. Leakage, fraud and attribution

| Risk | Mitigation |
|---|---|
| **Off-platform disintermediation** — parties meet here, then move to WhatsApp | Put value where it only exists on-platform: verified doc pack, deal summary PDF, comparison export, cert-expiry alerts, shipment doc pack (R2). Align, don't police — under Model B the *partner* is the one who wants the Deal record created. Track quotes with no deal record against supplier-reported shipments. |
| **Phantom deals for bounty** | Bounty only on *new* buyer–supplier pairs; both parties confirm independently; ops sample-audit against a PI or BL; clawback clause; per-partner cap; independence screen on shared directors / GST / address. |
| **Attribution disputes** | First invite wins, sealed at signup, 90-day pending window, **no retroactive claims**, visible to both partners. |
| **Kickback to an employee of a transacting party** | Payouts only to registered entities (GST/CIN) — never individuals; conflict-of-interest declaration machine-checked against `Organization.regNumber` and a declared-relationships table. |

### Compliance guardrails (India-first — confirm with counsel and a CA)

- **Tax:** commission is a service → 18% GST; TDS u/s 194H for resident partners;
  overseas partners raise FEMA / export-of-service / s.195 questions. **To verify.**
- **Licensing:** no drug licence is needed while the partner never takes title or
  handles goods. Enforce that boundary in the data model.
- **Anti-bribery:** a **published rate card, identical for every partner, no
  discretionary payments.** Discretionary payments are exactly what turns a
  referral programme into something an MNC buyer's compliance officer blocks.
  (UCPMP governs promotion to healthcare professionals and does not reach B2B
  ingredient trade — but the MNC procurement policy on the buyer's side does.)
- **DPDP / GDPR:** representation scopes are consented at invitation, revocable,
  and every delegated action and document access is written to `AuditLog`
  (F0.7, F7.2).

---

## 5. Viability

### Year-1 model — every number below is an assumption to validate

| Line | Value (USD) | Value (INR, ~₹83/$1) |
|---|---|---|
| Partners recruited / active | 25 / 12 | — |
| Orgs brought per active partner | 4 suppliers + 6 buyers | — |
| Suppliers / buyers onboarded | 48 / 72 | — |
| Conversion to paid (25% / 15%) | 12 + 11 = **23 Growth accounts** | — |
| Gross channel ARR (23 × $799 × 12) | **$220k** | **~₹1.83Cr** |
| Less Model A margin (27.5%) | −$61k → **net ≈ $160k** | −₹50.6L → **net ≈ ₹1.33Cr** |
| Attributable deals (12 × 2/mo × 12) | **288** | — |
| Attributable GMV (median deal $40k) | **≈ $11.5M** | **≈ ₹95.5Cr** |
| Model B bounty cost (avg ≈ $105 / ₹8,715) | **≈ $30k/yr** | **≈ ₹24.9L/yr** |
| CAC per paying account | ≈ **$1,300** vs LTV ≈ $24k (2.5 yr) | ≈ **₹1.08L** vs LTV ≈ ₹19.9L |
| Model C hypothetical (0.5%, capped) | platform ≈ $25k, partners ≈ $20k total — **$1.7k each** | platform ≈ ₹20.75L, partners ≈ ₹16.6L total — **~₹1.41L each** |

### The sobering number

At year-1 volume the per-transaction pot is **~$1.7k (~₹1.41L) per partner per
year**. It does not rival a 1–3% commission on real shipments and only
becomes material somewhere north of **$100M (~₹830Cr) attributable GMV**. Do
not lead with it.

### Verdict

| | |
|---|---|
| **The role** | Viable and differentiated. Delegation, portfolio console and the introduction record are cheap on the existing schema and no competitor offers them. |
| **The incentive** | Viable only as a bridge. Position as protection + speed, not income. |
| **The positioning conflict** | The real risk. PharmaLink sells verified **direct** access without hidden intermediaries; a partner channel reintroduces intermediaries. Resolve it in writing: partners are **disclosed**, **platform-paid** (never embedded in the unit price), and **never a gate** in front of a supplier. Unresolved, the trust thesis and the channel thesis eat each other. |

**Green light, with conditions:** build the role, attribution and Model A now;
run a **90-day pilot with 5 hand-picked partners** — 2 indentors, 2 sourcing
consultants, 1 regulatory consultant — before committing to the bounty engine or
the success fee.

---

## 6. Build plan on the existing codebase

### Data model

| Model | Purpose |
|---|---|
| `Organization.kind` += `partner`, `User.role` += `partner` | The role itself |
| `Partner` | code, status, rate card version, tax registration, payout details |
| `PartnerRepresentation` | partnerId, orgId, scopes, consentAt, revokedAt |
| `Introduction` | partnerId, buyerOrgId, supplierOrgId, productId?, createdAt — **immutable** |
| `PartnerAttribution` | orgId → partnerId, sealedAt, source, expiresAt |
| `PartnerPayout` | period, lines, status — mirrors the existing `Invoice` pattern |

### Reuse rather than rebuild

- `AuditLog` for every delegated action (already `#`-subscribed by Audit service).
- `Invoice` + the R8 billing surface for payout statements.
- `plans.ts` for the Model A margin; add a `partnerConsole` entitlement.
- `contact-visibility.ts` — extend so representation is a **first-class
  visibility grant**, not a bypass of the existing rules.
- An N3.6-style guard + failing test: a `PartnerPayout` line may never reference
  `Deal.totalValue` under Models A and B.

### Effort (2 engineers)

| Slice | Estimate |
|---|---|
| Role, attribution, portfolio console, introduction record | 4–6 weeks |
| Bounty engine, verification workflow, payouts | 3 weeks |
| Success fee (Model C) | 2 weeks + legal/tax |

### Backlog changes required

- **New `EPIC N7 — Sourcing Partner channel`** in PART C, stories at P1/P2.
- **New assumption `A6`** in the working-assumptions table recording the A1
  boundary reading: *acquisition spend is permitted; a cut of trade value is not.*
- Cross-reference from **A1**, **R8**, **R38** and **N3.6**.

---

## 7. Personas

Reconciled from `PharmaLink_Agent_Framework.docx`'s two personas — the detail
is good field research and worth keeping; the "PharmaLink Need" row is edited
where it assumed escrow.

### 7.1 Ravi Sharma — Independent Indenting Agent (primary persona)

| Attribute | Detail |
|---|---|
| Role | Independent Pharma Sourcing Consultant, Hyderabad, 48. 18 years as Senior Purchase Manager at Dr. Reddy's before founding an independent practice in 2015. |
| Specialisation | Antidiabetic and cardiovascular APIs. 28 direct manufacturer contacts across Gujarat and Zhejiang. |
| Scale | ~₹38 Cr (~$4.5M) annual GMV. 2.5–4% commission per deal. 4 active client companies. Maps to archetype 1 in §1's table — 5/5 recruitability, the primary target for the 90-day pilot (§5). |
| Pain today | All coordination over WhatsApp. Commission disputes are common. Buyers bypass him once they have the manufacturer's contact. No formal digital profile that enterprise procurement will accept. |
| What PharmaLink gives him | A verified partner profile enterprise buyers accept (N7.3); a portfolio console instead of a WhatsApp thread (N7.4); an **introduction record**, not escrow, as the anti-bypass protection (N7.5); GMP cert verification on his linked suppliers without a site visit, via the existing verified-document trail (N7.8) — not the original doc's Hyperledger CoA claim. |

### 7.2 GlobalPharma Sourcing Pvt. Ltd. — Trading Company (secondary persona)

| Attribute | Detail |
|---|---|
| Entity | Registered sourcing company, 8-person team, Mumbai HQ + Hong Kong office, founded 2009. |
| Specialisation | Oncology APIs, hormones/steroids, immunosuppressants, DEA/NDPS-controlled substances. |
| Scale | 50+ supplier relationships across India, China, Germany. ~$18M (~₹149Cr) annual GMV. Maps to archetype 2 (merchant trader) or 6 (buying house) depending on whether a given deal takes title — see §2's "explicitly cannot" boundary: the moment it takes title it is a `trader` seller org, not a partner. |
| Pain today | Manual commission math across 50+ transactions/month. No bank-acceptable proof of GMV for a working-capital loan. Supplier relationships are a key-person risk if staff leave. |
| What PharmaLink gives it | Team seats with role-based access (Enterprise plan, `plans.ts`); an earnings ledger instead of spreadsheets (N7.9 — this is Model A/B accrual, **not** an escrow P&L); a client-facing mandate portal (N7.4/N7.6); a bank-acceptable PharmaLink GMV statement, generated from `AuditLog` + `Introduction` records, the same evidentiary pattern the platform already uses for R8 invoices. |

---

## 8. Day-to-day screen inventory

Nine touchpoints, reconciled from `Agent_Framework.docx`'s screen list. Column
4 states plainly what changed and why — mostly "escrow/blockchain step
replaced with an existing A1-safe mechanism."

| # | Screen | Actor | Purpose | Reuses | What changed |
|---|---|---|---|---|---|
| 1 | Partner Onboarding | New partner | Type → identity → specialisation → network → references → go live (N7.2). | F2 upload/review-queue pattern | "Blockchain T&C" → platform T&C + anti-bribery declaration + rate-card ack (§4 compliance guardrails). |
| 2 | Partner Public Profile | Buyers, suppliers | Trust signals, specialisation, represented-org **count**, reviews, track record (N7.3, N7.7). | F1.4 public-profile pattern | GMV shown as a band, not exact figure, and represented orgs by count only — consistent with the "cannot see other partners' portfolios" boundary in §2 and the exposure-tier discipline N6.2 already applies platform-wide. |
| 3 | Portfolio Console | Partner | Day-to-day dashboard: cert-expiry, RFQ pipeline, response rate, deals closed, GMV represented, earnings-to-date (N7.4). | R4 expiry alerts, R16 matching signals | "AI opportunity feed" driven by the same non-AI-ranking relevance signals as F1.5/N5 — no opaque scoring exception carved out for partners. |
| 4 | Mandate / Representation Workspace | Partner + buyer + supplier | Claim mandate → source → quote (supplier price + declared commission shown **separately**, kept from the original doc — it's a genuine transparency win) → negotiate → principal accepts → ship → confirm → payout accrues (N7.5, N7.6, N7.9). | F4.1/F4.3/F4.4/F4.6, R2 shipment tracking | The original 8-step **escrow** flow (PharmaLink holds funds at step 5, Hyperledger-verifies CoA at step 7, auto-releases both legs at step 8) is replaced: step 5 creates a `Deal` **directly** between buyer and supplier, settled off-platform per A1; CoA confirmation uses the existing document-verification flow, not Hyperledger; step 8 becomes "Introduction sealed → Model A/B payout accrues in `PartnerPayout`," never a fund release, because no fund was ever held. |
| 5 | Partner Network CRM | Partner | Supplier/buyer network management: linked vs. offline, cert expiry, relationship notes (N7.8 supplier-facing half; buyer-facing network view is the same console, N7.4). | R4, `Document` | Unchanged in spirit — this screen never touched money in the original doc either. |
| 6 | Partner Search (buyer-side) | Buyer | Find and hire a verified partner; filter by category/geo/GMP/tier (N7.7). | F1.5 search | Ranking constrained to the same non-AI relevance rule as the rest of the catalog — no partner-specific AI ranking. |
| 7 | Earnings Dashboard | Partner | Full P&L: Model A reseller margin + Model B bounty, status, monthly chart, GST/TDS, payout request (N7.9). | R8 invoicing, N3.4 GST pattern | "Commission escrow status" / "bank withdrawal from escrow" → **payout request against an accrued `PartnerPayout` balance**, PharmaLink → partner, never buyer/seller funds. Color coding below is adjusted to match. |
| 8 | Supplier Partner Hub | Supplier | Authorise partners, share price tiers, monitor partner-generated vs. direct GMV (N7.8). | `PartnerRepresentation`, `ProductPriceTier` | Purely informational analytics in both versions — no change needed. |
| 9 | Partner Mobile | Partner | 5-tab: alerts / mandates / network / quote builder / earnings. | R19 native mobile (buyer-first) | **Deferred, not built here.** A4 fixes MVP as web-only with native mobile on the roadmap; this rides on R19 rather than shipping as separate partner-only mobile work. |

---

## 9. Design & interaction principles carried over

The NNg-heuristics application and visual design system in `Agent_Framework.docx`
are UI craft, not money mechanics — both reuse cleanly with one substitution
running through all of them: **every "blockchain-timestamped" claim becomes
"`AuditLog`-timestamped"** (existing infra, no new ledger to build or explain
to a buyer's compliance team).

| Element | Carried over as-is | Adjusted |
|---|---|---|
| Visual system | **Corrected against the real app** (`web/tailwind.config.ts`, `web/src/app/globals.css`) — the June-2026 doc's Syne/DM Sans/DM Mono/`#7C3AED`/glassmorphism spec doesn't match what's actually shipped and was never reconciled against it. Real tokens: **violet `#8B7CF6`** (deep `#6D5AE0`, pale `#EFECFE`) — an *existing* app token, already used for the signed-in user's avatar hex, not a new color invented for this doc. Type is **Space Grotesk** (display/headings), **Inter** (body), **JetBrains Mono** (figures, reference codes) via `next/font/google`. `rounded-card` 18px, no glassmorphism outside the marketing hero — app screens use flat `.card` (white, 1px `line` border, `shadow-card`). Light-only, by product decision — no dark variant exists to add one to. | — |
| Error prevention | The commission calculator ("your 3% adds $1.49/kg... confirm?") is genuinely useful even with no funds held — it's disclosure tooling, not an escrow control. | — |
| Recognition over recall, flexibility, help/docs, aesthetic minimalism | Keep as specified. | — |
| Visibility of system status | 8-step progress bar. | Steps re-labelled per §8 row 4; "commission escrow status" → "payout accrual status." |
| Color coding | Green/amber/red/blue/grey stage colors. | Maps to the app's **reserved** status tokens (`ok`/`warn`/`danger` — "never reused as brand or a chart series" per `tailwind.config.ts`), not new hexes: `ok` = **payout confirmed** (was "released/earned"); `warn` = **payout accrued, pending settlement window** (was "in escrow/pending"); violet-pale = "active/quoting" (partner-flavoured, distinct from teal's "verified" meaning). Nothing here implies PharmaLink is holding money. |

Five mockup screens built against this corrected system — Portfolio Console,
Mandate Workspace, Network/CRM, Earnings, and the buyer-facing Public
Profile — are in the Sourcing Partner Screens design canvas (linked from the
conversation that added this section; ask if you need it re-shared).

---

## 10. Prohibited behaviours — auto-enforcement (N7.12)

| Prohibited behaviour | Detection | Consequence |
|---|---|---|
| Quoting from an unverified supplier | Supplier ID cross-checked against the verified registry at quote submission. | Quote blocked, warning issued. |
| Double commission (charging both buyer and supplier) | Declared commission cross-checked against the partner's own payout ledger (N7.9) — there is no separate supplier-payment leg to cross-analyse, because PharmaLink never routes one. | Partner suspended; `PartnerPayout` held pending review. |
| Hidden markup in an inflated supplier price | R7 price-benchmark model flags a quote >15% above market with no declared commission. | Quote/mandate invalidated; remedy runs through the existing reputation-and-record workflow (R10), **not** a refund — PharmaLink never held funds to refund. |
| Sharing buyer RFQ data with a competitor | Every delegated action and document access already writes to `AuditLog` (F0.7/F7.2). | Permanent ban; potential legal action, unchanged from the original doc. |

---

## 11. Success metrics — reconciled against §5's bottom-up model

`Agent_Framework.docx`'s OKRs and this program's own §5 Year-1 model were
built independently and **do not agree** — worth stating plainly rather than
quietly averaging them.

| Metric | Agent_Framework.docx target | This program's §5 bottom-up model | Read |
|---|---|---|---|
| Active partners | 50 by month 6, 200+ by month 18 | 25 recruited / **12 active** in year 1 | §5's model is bottom-up from the 90-day pilot (5 partners); treat it as the committed number and Agent_Framework's as aspirational. |
| Partner-mediated GMV | $5M/quarter (~₹41.5Cr) by month 6, **$40M annualised** (~₹332Cr) by month 18 | **≈$11.5M** (~₹95.5Cr) attributable GMV in year 1 (288 deals × $40k median) | The month-18 figure assumes an escrow-driven trust ramp this design doesn't have. Nearer to Agent_Framework's own *month-6* target, not month-18. |
| Commission dispute rate | <1% → <0.5%, attributed to escrow protection | Not modelled in §5 | Re-attribute to the **introduction record**, not escrow — it's the mechanism actually being built (N7.5). |
| Agent NPS, mandates/partner/month, new buyers via partners, supplier profiles linked, 12-month retention | Kept as directional targets | — | No structural conflict with the non-escrow design; track as originally specified. |

**Use §5's model for OKR-setting and board reporting.** Revisit Agent_Framework's
month-18 figures only after the 90-day pilot produces real attributable-GMV
data — not before.

---

*Prepared 2026-08-19; §§7–11 added 2026-08-29 reconciling `PharmaLink_Agent_Framework.docx`.
Market figures are directional and sourced from public trade reporting;
commission ranges are industry rules of thumb and must be validated against
real partner conversations before the rate card is published.*
