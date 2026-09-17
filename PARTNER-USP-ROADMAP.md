# Sourcing Partner — comprehensive feature audit & USP roadmap

**Purpose:** a market-research-grounded answer to "what makes the Sourcing
Partner role a real competitive differentiator, not just a role that
exists" — what's built, what was already specified and never built, and
what fresh competitive research adds. Companion to `PARTNER-PROGRAM.md`
(the business case), `PARTNER-ECOSYSTEM.md` (adjacent services),
`PARTNER-INCENTIVES.md` (the rewards ladder).

---

## 1. The thesis

Every general B2B chemical/pharma marketplace (eChemi, Chemondis, ChemDmart,
IndiaMART) sells the same thing: a verified catalog and RFQ matching. None of
them productize the **sourcing agent** — the person who actually closes the
deal in this industry today, per this platform's own persona research
(§7.1/7.2 of `PARTNER-PROGRAM.md`). Real-world sourcing-agent research
confirms why that gap matters: buyers' #1 complaint about agents is hidden
markup and opaque fee structure, and the signal buyers actually look for is
"a transparent fee structure — the agent discloses the factory price, adds
their commission as a separate line item, and provides the factory's
original quotation for verification."<sup>[1]</sup> A platform that makes
that disclosure *structural* — not a policy an agent might follow, but a UI
they can't avoid — is the actual USP. Everything else (portfolio console,
earnings, rewards) is table stakes once that trust mechanic exists; **it is
currently the single biggest gap between what's built and what makes this
role defensible.**

The secondary thesis, also market-confirmed: this industry's coordination
still happens on WhatsApp, not email or in-app messaging — "an emailed quote
gets a reply in twenty minutes when sent on WhatsApp, compared to an unread
email after two days."<sup>[2]</sup> `PARTNER-PROGRAM.md`'s own persona
research says the same thing independently ("All coordination over
WhatsApp" — Ravi Sharma's stated pain, §7.1). Two-way WhatsApp actions were
already scoped as a "Build" item in `PARTNER-ECOSYSTEM.md` §3 row 1 and
never shipped. This is the second biggest gap.

---

## 2. What's actually built today (fast audit, not a re-explanation)

Onboarding, Portfolio Console, RFQ/quote delegation (`actingForOrgId`),
Network/CRM + Partner Hub grant/revoke, public profile + buyer-side search,
earnings dashboard + printable per-payout invoice, principal-visibility
notifications, invite-link attribution (Model A now actually reachable),
document delegation, a read-only mandate comparison view, a rewards
eligibility dashboard for the milestone ladder, and (as of the last two PRs)
a restored Marketplace nav link and an honest "coming soon" ecosystem-service
placeholder. This is a genuinely complete *operational* loop — a partner can
onboard, get represented, draft, earn, and see progress. What's missing is
**trust infrastructure** and **the channel through which the work actually
happens**, which is exactly what's below.

---

## 3. Tier 1 — Trust & integrity (the actual USP lever)

These three were already designed in `PARTNER-PROGRAM.md` — §8 row 4 and §10
(N7.12) — and **never implemented**. This tier is the highest-leverage work
in this document: it's the difference between "a role exists" and "buyers
trust the role."

| # | Feature | Why it matters | Effort |
|---|---|---|---|
| 1 | **Commission disclosure on the mandate itself** — when a partner drafts an RFQ/quote for a principal, show supplier price and the partner's own declared commission as two separate line items, not one blended number. | The #1 trust signal in real sourcing-agent relationships, market-confirmed<sup>[1]</sup>; explicitly designed in `PARTNER-PROGRAM.md` §8 row 4 ("supplier price + declared commission shown **separately**... a genuine transparency win") and never built. Right now a partner-drafted quote looks identical to a self-submitted one — the principal can't see what the partner is charging. | Medium — one new field on the drafting form, a computed display, no new model. |
| 2 | **Hidden-markup flag** — reuse the `marketMedian`/`vsMarketPct` benchmark `compare-queries.ts` already computes (surfaced today on the buyer comparison and the new partner mandate-detail page) to flag a partner-drafted quote priced >15% above market with no declared commission. | Directly specified as N7.12's auto-enforcement (§10): "R7 price-benchmark model flags a quote >15% above market with no declared commission... Quote/mandate invalidated." The benchmark math already exists and is already wired into the exact page this would extend — this is cheap. | Low — the hard part (the benchmark) is already built; this is a threshold check + a badge. |
| 3 | **Deal registration** (new idea, not in the existing docs) — let a partner claim a prospective buyer↔supplier↔molecule combination *before* drafting anything, the same write-once/first-claim-wins shape `Introduction` already uses, just earlier in the funnel. Standard PRM-software pattern: partners "register a deal" to protect a lead from being poached.<sup>[3]</sup> | Right now `recordIntroductionIfNew` only seals once a real RFQ/quote is drafted — a partner has no way to stake a claim while still in conversation with a prospect, which is exactly when poaching risk is highest. | Medium — one new lightweight model (or a nullable-target variant of `Introduction`), one new action, one small UI. |

---

## 4. Tier 2 — Day-to-day operational smoothness

Both already scoped as "Build" in `PARTNER-ECOSYSTEM.md` §3 and never
shipped; the third is a small, already-specified dashboard gap.

| # | Feature | Why it matters | Effort |
|---|---|---|---|
| 4 | **Two-way WhatsApp actions** — approve/quote/confirm from WhatsApp, not just one-way notifications. | `PARTNER-ECOSYSTEM.md` row 1, explicitly "Build," extending the WhatsApp Business API work already flagged in `ARCHITECTURE.md`'s risk table. Market-confirmed as the dominant B2B trade channel in this region in 2026.<sup>[2]</sup> This is the single highest-leverage "make it smooth" feature — it meets partners where they already work instead of asking them to change habits. | High — real integration work (Meta Business API, template approval, webhook receiver), genuinely Phase 2-sized, but the notification events this session just added (`rfq.draftedByPartner` etc.) are the exact hooks a WhatsApp send would attach to. |
| 5 | **Compliance document-pack generator** — one-click aggregation of a mandate's CoA + GMP + DMF status + screening result into a single exportable pack. | `PARTNER-ECOSYSTEM.md` row 3, "Build" — "pure aggregation of records already in the system (`Document`, `Certification`, `RegulatoryFiling`)." Persona pain, verbatim: *"No formal profile — rejected by enterprise procurement."* Document delegation (this session) gets documents INTO the system; this gets a coherent PACK back OUT for the partner to actually use with a buyer. | Medium — a read aggregating three existing models + the same print-page pattern already used twice this session (RFQ deal record, payout invoice). |
| 6 | **Response-rate KPI** on the Portfolio Console. | Explicitly named in `PARTNER-PROGRAM.md` §8 row 3's screen spec ("cert-expiry, RFQ pipeline, **response rate**, deals closed...") — every other metric in that list shipped, this one didn't. | Low — one more computed field in `getPortfolio`. |

---

## 5. Tier 3 — Financial credibility

| # | Feature | Why it matters | Effort |
|---|---|---|---|
| 7 | **Bank-acceptable GMV statement** — a partner's own downloadable statement, generated from `AuditLog` + `Introduction` + `PartnerPayout`, usable as working-capital-loan evidence. | Persona 7.2's stated pain, verbatim: *"No bank-acceptable proof of GMV for a working-capital loan."* Directly extends the printable-invoice pattern this session already built for `PartnerPayout` — same mechanism, one level up (a statement over many payouts/introductions, not one). Also the *data* half of `PARTNER-ECOSYSTEM.md` row 4's NBFC lever — the vendor relationship still needs a real partner, but the statement itself doesn't. | Low-medium — mostly a new aggregating query + a print page, reusing everything from the invoice work. |
| 8 | **Model B — verified-deal bounty** (N7.11, P2). | `PARTNER-PROGRAM.md` §3's own analysis: Model A "does not move" the platform's own primary persona (an indentor moving $3M/yr earns ~$60k at 2%; Model A's $2.6k/yr doesn't compete). Model B is the fixed, A1-safe, non-percentage bounty ($150 first deal, $75 after) designed specifically to close that gap — and it's still unbuilt, so the revenue story for the primary persona this whole program targets is incomplete. | Medium — `PARTNER_PAYOUT_KINDS` already reserves `model_b_bounty`'s slot conceptually (comment says exactly this); needs the trigger logic (verified Deal + attribution) and the payout-creation call site. |

---

## 6. Tier 4 — Growth & enablement

| # | Feature | Why it matters | Effort |
|---|---|---|---|
| 9 | **Tier-linked learning content** (Registered → Qualified → Specialist). | `PARTNER-ECOSYSTEM.md` row 8, "Build" — `PARTNER-PROGRAM.md` §4.2 already requires a regulatory-knowledge test for Tier 2/3, but there's no content to test on and no tier-promotion mechanism at all yet (confirmed this session — `Partner.tier` is never written anywhere beyond its default). This is the other half of the Rewards dashboard's deliberately-scoped-out "Tier advancement" milestone. | Medium — lightweight content + quiz, not an LMS; also needs the tier-promotion write path this session explicitly deferred. |
| 10 | **Confirm team seats work for partner orgs.** | Persona 7.2 (GlobalPharma, 8-person team) needs role-based multi-user access — `/account/team` likely already supports this generically for any org kind, but it's never been verified specifically for a `kind: 'partner'` org. | Very low — verification only, probably already works. |

---

## 7. Recommendation

Tier 1 is the actual answer to "USP" — it's what turns "PharmaLink has a
partner role" into "PharmaLink is the only marketplace where a partner's fee
is structurally disclosed, not just promised." It's also the cheapest tier
(#2 in particular reuses infrastructure already sitting in
`compare-queries.ts`). Tier 2's WhatsApp item is the highest ceiling but the
highest cost — worth scoping as its own phase rather than folding into a
quick pass. Tiers 3–4 are real but lower-urgency completions of already-
designed work.

**Suggested next build slice: items 1, 2, 3, 6, 7** — all Low/Medium effort,
all either already-designed-but-unbuilt or cheap extensions of what shipped
this session, and together they close the trust gap (Tier 1 in full) plus
the two smallest Tier 2/3 gaps. WhatsApp (#4) and Model B (#8) are real but
belong in a dedicated follow-up given their size.

---

*Sources: [Sourcing agent transparency and commission disclosure — TopTradeSourcing](https://www.toptradesourcing.com/sourcing-agent-vs-alibaba-cost/amp/)<sup>[1]</sup>,
[WhatsApp Business API for EU-MENA trade — AHoosh](https://ahoosh.ai/articles/2026-07-20_whatsapp-business-api-eu-mena-trade/)<sup>[2]</sup>,
[PRM software deal registration — ChannelInsider](https://www.channelinsider.com/channel-business/helpdesk-itsm-and-other-tools/prm-software/), [PartnerStack PRM guide](https://partnerstack.com/articles/everything-you-need-to-know-about-partner-relationship-management-software)<sup>[3]</sup>.
Prepared 2026-09-17.*
