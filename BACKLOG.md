# PharmaLink Global — Product Backlog

**Source:** PharmaLink MVP Understanding Document v1.0 (July 8, 2026) — 6-Week MVP definition + roadmap, based on the v3 interactive design (17 screens).
**Scope of this backlog:** The 6-week MVP "marketplace spine" (onboard → verify → list → discover → RFQ → quote → compare → accept → hand-off) plus a classified roadmap for everything deferred.
**Product:** B2B marketplace connecting pharma buyers with GMP-verified API / intermediate / KSM / excipient suppliers.

> **MVP trust principle:** Week-one trust comes from **human-verified GMP credentials + responsive operations**, *not* AI or blockchain. Deals close on-platform; money and logistics settle off-platform in the MVP.

---

## Legend

- **Priority** — `P0` (MVP, must ship in 6 weeks) · `P1` (Phase 2, months 2–4) · `P2` (Phase 3, months 5–9) · `P3` (Phase 4, months 10+)
- **Type** — `MVP` = in the 6-week spine · `Must` = roadmap Must-Have · `Good` = roadmap Good-to-Have
- **Story IDs** map to feature blocks: `F1`–`F7` (MVP) and `R#` (roadmap), `G#` (gap-analysis items).
- Estimates are relative T-shirt sizes (S/M/L/XL) for a 2-engineer team.

---

## Working assumptions (confirm before sprint 1)

| # | Assumption | Status |
|---|-----------|--------|
| A1 | **Payments are permanently off-platform.** Buyers and sellers settle directly (advance/LC). The platform never holds, escrows or routes trade value and takes **no commission** — revenue is **subscription only** (see Part B, R8). This is a product decision, not a phasing decision. | ✅ Confirmed 2026-07-17 |
| A2 | **India-first** supply launch: seed 30–50 verified Indian API suppliers; buyers domestic or international. | ☐ Confirm |
| A3 | Team of **5–6**: 2 full-stack eng, 1 designer, 1 PM/QA, 1–2 ops/verification. | ☐ Confirm |
| A4 | MVP is a **responsive web app**; native mobile is roadmap. | ☐ Confirm |
| A5 | Platform **fees waived** during MVP (free listing, free RFQs). | ☐ Confirm |

---

# PART A — MVP BACKLOG (P0, 6 weeks)

## EPIC F0 — Foundations & platform (cross-cutting)

| ID | Story | Acceptance criteria | Size | Week |
|----|-------|---------------------|------|------|
| F0.1 | As a platform, I need repo, environments and CI/CD so the team can ship safely. | Mono-repo, dev/stage/prod envs, CI runs lint+test+build on every PR, one-command deploy. | M | 1 |
| F0.2 | As a user, I can register/sign in with **email + OTP** (and phone/WhatsApp OTP). | OTP delivered via email + SMS/WhatsApp; expiry + rate-limit; session issued; failed-attempt lockout. | M | 1 |
| F0.3 | As the platform, I enforce **RBAC** across roles (buyer / seller / both / admin). | Route + API guards per role; "both" account can switch context; admin cannot be self-assigned. | M | 1 |
| F0.4 | As a data model, I persist companies, users, documents, products, RFQs, quotes, deals. | Normalized schema + migrations; company↔user↔role links; soft-delete + audit columns. | L | 1 |
| F0.5 | As a designer/dev, I have a shared **design system** (tokens, components) matching brand. | Syne/DM Sans type scale, indigo/cyan palette, buttons, inputs, cards, badges, tables, stepper, toasts documented. | M | 1 |
| F0.6 | As the platform, I capture **analytics events** against the success metrics. | Event schema defined (signup, verify, list, RFQ, quote, accept…); events fire; dashboard-queryable. | S | 1 |
| F0.7 | As a compliance owner, sensitive actions are written to an **audit log**. | Verify/reject, doc access, role change, impersonation all logged with actor + timestamp + reason. | S | 1–6 |

## EPIC F1 — Public website & catalog

| ID | Story | Acceptance criteria | Size | Week |
|----|-------|---------------------|------|------|
| F1.1 | As a visitor, I see a **landing page** with value prop, how-it-works and category browse. | Hero + CTA to register; how-it-works (5 steps); category tiles (APIs, intermediates, KSMs, excipients); featured verified suppliers. | M | 3 |
| F1.2 | As a visitor, I can read **static trust content**: how verification works, about, T&Cs, privacy. | Pages published + linked in footer; "how verification works" explains the human SOP. | S | 3 |
| F1.3 | As a visitor, I browse a **public, SEO-indexable product directory**. | Product page: name, CAS, category, pharmacopeia grade, supplier certs; server-rendered; sitemap + meta tags. | L | 3 |
| F1.4 | As a visitor, I browse **public supplier profile pages**. | Company overview, verified certs + expiry chips, product count, export markets; "Verified Supplier" badge. | M | 2–3 |
| F1.5 | As a visitor, I use **Search v1**: keyword (name/CAS) + filters. | Filters: category, certification (FDA/EU GMP, WHO PQ, CDSCO), country, MOQ. Sort by verification level then recency. **No AI ranking.** | L | 3 |
| F1.6 | As a visitor, contact/quote actions **require login**. | "Request quote" / "Message" gated behind auth wall with return-to-intent redirect. | S | 3 |

## EPIC F2 — Seller onboarding & verification (4 steps)

| ID | Story | Acceptance criteria | Size | Week |
|----|-------|---------------------|------|------|
| F2.1 | As a seller, **Step 1 – Account**: work email + phone/WhatsApp OTP, role, password, company name, country. | OTP verified before proceeding; duplicate-company detection warns. | M | 2 |
| F2.2 | As a seller, **Step 2 – Company & sites**: legal entity, GST/CIN or reg no., DUNS (opt), manufacturing sites w/ per-site certs, export markets, profile. | Add multiple sites; per-site certification claims; validation on GST/CIN format. | M | 2 |
| F2.3 | As a seller, **Step 3 – Regulatory documents**: upload GMP certs, mfg licence, company reg; declare DMF/CEP. | Secure upload (PDF/img); per-doc status **Pending → Verified / Rejected (reason)**; file-type/size limits; virus scan. | L | 2 |
| F2.4 | As a seller, **Step 4 – Products & terms**: add products manually or via CSV/Excel bulk import; default commercial terms. | Manual form (name, CAS, category, grade, purity, MOQ, price range opt, lead time); CSV template + validation report; Incoterms/payment defaults. | L | 2–3 |
| F2.5 | As **ops**, every seller is human-reviewed against issuing authorities before going live. | Docs cross-checked vs FDA/EudraGMDP/CDSCO; company-existence + call-back check; only **verified** sellers appear in search / receive RFQs. **SLA ≤ 48h.** | M | 2 |
| F2.6 | As a buyer, I see **visible trust output** on every profile/listing. | "Verified Supplier" badge, verification date, verified cert chips with **expiry dates**. | S | 3 |

## EPIC F3 — Buyer onboarding & verification (3 steps)

| ID | Story | Acceptance criteria | Size | Week |
|----|-------|---------------------|------|------|
| F3.1 | As a buyer, **Step 1 – Account**: role (procurement/R&D/QA/trader), work email + OTP, company, country. | OTP verified; role captured for routing. | S | 3 |
| F3.2 | As a buyer, **Step 2 – Company & licence**: company type, GST/reg no., drug/wholesale licence upload where applicable. | Upload optional-by-type; **light KYB by ops before RFQ posting is enabled** (two-sided trust). | M | 3 |
| F3.3 | As a buyer, **Step 3 – Sourcing preferences**: API categories, regulatory markets, preferred origins. | Preferences drive rule-based RFQ routing + personalised catalog view; **no payment capture** (fees waived). | S | 3 |
| F3.4 | As **ops**, I run light buyer KYB before enabling RFQ posting. | Buyer KYB queue; approve/reject with reason; RFQ posting locked until approved. | S | 3 |

## EPIC F4 — RFQ & quoting workflow (transaction core)

| ID | Story | Acceptance criteria | Size | Week |
|----|-------|---------------------|------|------|
| F4.1 | As a buyer, I **post an RFQ** via a 3-step wizard. | Step 1: product + CAS + qty + required-by. Step 2: specs (grade, purity, mandatory certs, origin, Incoterm + destination, target price opt) + attach spec doc + **request-sample flag**. Step 3: review & post. | L | 4 |
| F4.2 | As the platform, I **rule-match & broadcast** RFQs to eligible verified sellers. | Match by product/category + mandated certs held; buyer sees matched list and can tick/untick before broadcast. **No AI scores.** | L | 4 |
| F4.3 | As a seller, I **submit a quote**. | Fields: unit price, currency, MOQ, lead time, Incoterm, payment terms, validity date, notes, attachments (CoA sample, spec sheet). | M | 4 |
| F4.4 | As a buyer, I **compare quotes** side-by-side. | Table: price, total, lead time, MOQ, certs, payment terms; **export to PDF**. No AI scoring. | M | 5 |
| F4.5 | As either party, I use a **per-RFQ Q&A / negotiation thread**. | Structured message thread per RFQ-supplier pair with attachments; replaces counter-offer engine in v1. | M | 4 |
| F4.6 | As a buyer, **accepting a quote creates a Deal record**. | Deal summary PDF (product, qty, price, terms, both parties' verified details); both sides notified; **ops alerted for white-glove hand-off** to direct settlement. | M | 5 |
| F4.7 | As the platform, RFQs follow a **lifecycle state machine** with reminders. | States: Draft → Open → Quoted → Accepted / Expired / Closed; expiry deadlines + reminder nudges. | S | 4 |
| F4.8 | As a buyer/seller, I see **dashboards v1** summarising my activity. | Buyer: KPI tiles (active RFQs, quotes to review, deals), active-RFQ table, activity feed. Seller: inquiries, quote pipeline, response rate, product table + quote-submission modal. | L | 5 |

## EPIC F5 — Communications & notifications

| ID | Story | Acceptance criteria | Size | Week |
|----|-------|---------------------|------|------|
| F5.1 | As a user, I have an **in-app notification centre + inbox** with per-RFQ threads consolidated. | Unread counts; deep-links to source; threads grouped by RFQ. | M | 5 |
| F5.2 | As a user, I get **email notifications** for all lifecycle events. | RFQ matched, quote received, message, quote accepted, verification status → transactional email. | M | 4 |
| F5.3 | As an Indian seller/buyer, I get **WhatsApp notifications** (Business API). | WhatsApp templates for key events; email fallback if WA unavailable. **Start WA API approval in week 1.** | M | 5 |

## EPIC F6 — Admin / operations console (missing from design — required)

| ID | Story | Acceptance criteria | Size | Week |
|----|-------|---------------------|------|------|
| F6.1 | As ops, I work **verification queues** for sellers, buyers and documents. | Approve/reject with reason codes + audit trail; SLA timer per item; filter by status. | L | 2 |
| F6.2 | As ops, I **moderate listings** (edit/unpublish) and manage users/companies. | Unpublish/edit listing; suspend/reactivate user or company; change role. | M | 3 |
| F6.3 | As ops, I **monitor RFQs** and nudge stuck ones. | RFQ monitor with age + quote-count; nudge seller action; flag stalled RFQs. | M | 4 |
| F6.4 | As support, I can **impersonate / view-as** a user. | Read-safe impersonation; every impersonation logged; visible banner. | S | 4 |
| F6.5 | As ops, I keep a **manual cert-expiry register**. | Register with per-cert expiry; feeds Phase-2 automated alerts; export. | S | 5 |
| F6.6 | As ops/leadership, I see an **ops metrics dashboard**. | Signups, verification SLA, active RFQs, quote rate, time-to-first-quote, deals closed. | M | 6 |

## EPIC F7 — Cross-cutting non-functionals

| ID | Story | Acceptance criteria | Size | Week |
|----|-------|---------------------|------|------|
| F7.1 | As the platform, data is **encrypted in transit and at rest**. | TLS everywhere; encrypted storage for documents + PII. | M | 1–6 |
| F7.2 | As a user, **document access is controlled**. | Cert public-summary vs private-file; downloadable only to logged-in **verified counterparties**. | M | 3 |
| F7.3 | As the platform, I am **GDPR + India DPDP aligned**. | Consent capture, data-handling policy, deletion/export request path. | M | 6 |
| F7.4 | As a mobile user, the buyer flows are **responsive / mobile-first**. | Onboarding, catalog, RFQ, quote review usable on mobile viewport. | M | 1–6 |
| F7.5 | As the platform, I ship **basic SEO** for public pages. | Meta tags, sitemap, structured data on product/supplier pages. | S | 3 |
| F7.6 | As ops, I run the **seed-liquidity plan** (weeks 4–6). | Concierge-onboard 30–50 suppliers + ~500 listings; recruit 20–30 buyers; 10+ live RFQs at launch. | — | 4–6 |

### MVP launch success criteria (first 30 days)

| Metric | Target |
|--------|--------|
| Verified suppliers live | ≥ 40 |
| Product listings | ≥ 500 |
| Verified buyers | ≥ 30 |
| RFQs posted | ≥ 25 |
| RFQs receiving ≥3 quotes in 48h | ≥ 70% |
| Median time-to-first-quote | ≤ 24 h |
| Deals accepted on-platform | ≥ 5 |
| Verification SLA (docs) | ≤ 48 h |

### Explicitly OUT of MVP (→ roadmap)
AI matching & scoring · price intelligence & forecasts · blockchain vault · integrated escrow/payments · order/shipment tracking · ratings & reviews · native mobile apps · non-pharma discovery verticals · counter-offer engine · auto-quote · compliance-hub automation · ERP integrations · team accounts · multi-language/currency · subscription billing.

---

# PART B — ROADMAP BACKLOG (Must-Have / Good-to-Have)

## Phase 2 (months 2–4) — Must-Have

| ID | Feature | Notes | Type |
|----|---------|-------|------|
| R1 | **Sample request & management** | request → dispatch → lab eval → outcome recorded; links RFQ ↔ reviews. *No bulk order without sample+CoA.* (Gap G1) | Must |
| R2 | **Order management & shipment tracking** | accepted quote → order; milestones (confirmed→delivered); per-shipment doc pack (CoA, CoO, MSDS, BL). (Gap G7 partial) | Must |
| R3 | **Ratings & reviews (transaction-gated)** | verified-transaction-only reviews (on-time, quality, docs, comms). | Must |
| R4 | **Compliance hub v1 — cert expiry & alerts** | automate ops: 60/30/7-day expiry alerts, renewal reminders, framework library (static). | Must |
| R5 | **Negotiation & counter-offer engine** | structured counter-offers (price/volume/lead-time) with history; supersedes threads. | Must |
| R6 | **Buyer team accounts, roles & approvals** | multi-user orgs, requester/approver/finance, RFQ approval flows, shared shortlists. (Gap G10) | Must |
| R7 | **Price benchmarks v1** | anonymised quote-derived ranges per API → graduate to trend charts in P3. | Must |
| R8 | **Subscription billing** ✅ **BUILT** | Starter / Growth / Enterprise tiers with entitlements + quotas; invoices issued in-app, **settled off-platform** (bank transfer / external link). **No card data stored → no PCI scope. No GMV commission.** (Gap G14) | Must |
| ~~R9~~ | ~~Integrated escrow & payments~~ | **REMOVED 2026-07-17** — the platform will not handle payments. This also removes KYC/AML, PCI scope, the payment-saga complexity and dispute-driven fund release. Buyers and sellers settle directly; the platform's value is discovery, verification and the documented deal trail. | ❌ Dropped |
| R10 | **Quality complaint & mediation** *(rescoped)* | Was escrow-dispute resolution. With no funds held, this becomes a **reputation-and-record** workflow: complaint intake (quality/qty/docs/delay), evidence upload, ops mediation, outcome recorded against the supplier and fed into ratings. **No refunds / fund release** — commercial remedy stays between the parties. | Must |

## Phase 2 — Good-to-Have

| ID | Feature | Notes | Type |
|----|---------|-------|------|
| R11 | Saved searches, shortlists & watchlists w/ alerts | lightweight, additive. | Good |
| R12 | Live market activity feed & price ticker (real data only) | social proof; never fake liquidity signals. | Good |
| R13 | Anonymised RFQs / buyer privacy | hide identity until acceptance. *(P2–P3)* | Good |
| R14 | Quality-agreement & contract templates | accelerate deal close. (Gap G5) | Good→Must |
| R15 | Controlled-substance policy + manual review | policy gating who may list/view scheduled substances; engine in P3. (Gap G13) | Good→Must |

## Phase 3 (months 5–9)

| ID | Feature | Notes | Type |
|----|---------|-------|------|
| R16 | **AI-assisted matching v1** | rank on real signals (response rate, quote competitiveness, cert completeness, fulfilment). Full 48-signal in P3+. *(P2–P3)* | Must |
| R17 | **Compliance intelligence feeds** | FDA warning letters/import alerts, EudraGMDP, recalls → "supplier flagged" + RFQ exclusion filters. | Must |
| R18 | **Blockchain document verification** | interim: signed hash registry + public verify page (90% value/10% cost); Hyperledger later. | Must (differentiator) |
| R19 | **Native mobile apps (buyer-first)** | push + biometric; PWA bridges in P2. | Must |
| R20 | **Logistics & Incoterm support** | freight-partner quotes, tracking ingestion, cold-chain flags, BL/AWB digitisation. (Gap G7) | Must |
| R21 | **Denied-party & sanctions screening** | OFAC/EU/UN screening for cross-border. (Gap G9) | Must |
| R22 | Supplier qualification questionnaires & audit-report library | makes PharmaLink part of buyers' QMS. (Gap G4) | Must (enterprise) |
| R23 | Re-qualification & periodic review scheduling | cycle-based re-qual + reminders. (Gap G6) | Must |
| R24 | Dispute/deviation/complaint (QC) mgmt | OOS, deviations, CAPA follow-through. (Gap G12) | Must |
| R25 | AI auto-import of products from FDA/DMF | one-click import; needs licensed data + entity matching. | Good |
| R26 | AI company detection at signup | auto-fill regulatory status; needs compliance-feed plumbing. | Good |
| R27 | Auto-quote / quote templates | seller auto-respond + SLA match boosts. | Good |
| R28 | ERP integrations (SAP, Oracle) + API platform | punch-out, PO/doc sync. *(P3–P4)* | Good |
| R29 | Third-party lab testing integration | partner labs for independent sample testing. *(P3–P4)* | Good |
| R30 | Data rooms / tech-pack exchange | DMF LoA, quality agreements, tech packs under NDA. | Good |
| R31 | Advanced seller analytics & market position | category ranks, price competitiveness, demand signals. | Good |
| R32 | Import/export trade-data intelligence | customs data validates supplier claims + benchmarks. (Gap G8) | Good |
| R33 | Multi-language & multi-currency | localisation + currency display. *(P3–P4)* | Good |

## Phase 4 (months 10+)

| ID | Feature | Notes | Type |
|----|---------|-------|------|
| R34 | Discovery hub — multi-category expansion | nutraceuticals, cosmetics, agro, formulations + vertical certs (COSMOS/ECOCERT/Halal/Kosher/REACH/EPA). | Good |
| R35 | FDA/EMA observer blockchain nodes | 3-node consensus w/ regulator observers — regulatory-partnership play. | Good |
| R36 | Trade financing & insurance | invoice financing/credit, cargo insurance upsell. | Good |
| R37 | White-label / enterprise portals | Enterprise seller tier. | Good |

---

# PART C — KEY RISKS (carry into sprint planning)

| Risk | Mitigation |
|------|-----------|
| Liquidity chicken-and-egg | India-first seeding (30–50 suppliers pre-launch); concierge RFQ handling; ops guarantees ≥3 quotes/RFQ in launch categories. |
| Verification bottleneck / a fake supplier passes | Strict SOP + dual review for first 100 suppliers; verify vs issuing authorities not docs alone; call-backs; incident playbook. |
| Deals go off-platform after first contact | Expected in MVP (fees waived); retain value via RFQ tooling/comparison/docs trail; add escrow + reviews + disputes in P2. |
| Regulatory/legal exposure | Marketplace-of-record legal review pre-launch; restrict MVP to non-controlled APIs/excipients; jurisdiction gating; facilitator T&Cs. |
| Overbuilding the demo (AI/blockchain/escrow early) | Scope discipline: MVP spine only; roadmap communicates vision without building it. |
| WhatsApp/3rd-party API lead times | Start WhatsApp Business API approval week 1; email fallback fully functional. |

---

# PART D — IMMEDIATE NEXT STEPS

1. Confirm assumptions **A1–A5** (payments, geography, team, web-only, fee waiver).
2. Approve & **freeze MVP scope** (Part A) for the 6-week window; park additions in roadmap.
3. Start **operations track now**: verification SOP, supplier target list of 100, legal T&Cs review.
4. Kick off **Week-1 foundations** (F0) + WhatsApp Business API application.
5. Define the **analytics event schema** (F0.6) against the success metrics before feature code.

---
*Backlog generated from the PharmaLink MVP Understanding Document. Story IDs are stable references for import into Jira/Linear.*
