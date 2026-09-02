# PharmaLink Global — Partner incentives: getting the whole book of business on-platform

**Question:** A partner trying PharmaLink for one mandate is easy to get. Getting
them to run their *entire* trading business through it — instead of keeping
WhatsApp and a spreadsheet running for the deals they don't bother moving
over — needs a real incentive scheme: bonuses, gift vouchers, maybe a better
loan rate. What actually works, and what turns into a compliance problem?

**Answer in one line:** A published, milestone-based rewards ladder — fixed
amounts or counts, never a percentage of deal value — distributed through one
rewards-API vendor rather than custom Amazon/Flipkart integrations, plus a
genuinely negotiable NBFC rate advantage for top-tier partners. Rewarding a
partner for bringing you business is a normal channel/referral programme, not
a compliance problem; the one rule worth keeping is A1's own. None of it
should be the main pitch, though — `PARTNER-PROGRAM.md` §3 already showed the
money is never big enough to be.

*(All figures below are shown in USD / INR at an illustrative ≈₹83/$1 — round
for readability, not a quoted rate, and every amount here is directional
pending §7's recommendation.)*

**Companion docs:** `PARTNER-PROGRAM.md` (§3 "the money", §4 "leakage, fraud
and attribution" — this doc's compliance rules extend that section directly),
`PARTNER-ECOSYSTEM.md` (§3 row 4, the NBFC/trade-finance thread this reuses),
`BACKLOG.md` (`EPIC N7`, `N7.9` — the `PartnerPayout` model this scheme's
rewards ride on).

---

## 1. The behaviour actually worth buying

Not "sign up" — the ask was to get the *whole book of business* moving
through the platform. That's five distinct behaviours, and a scheme that
rewards only the first one (signup) misses the other four entirely:

| Behaviour | Why it's hard to get |
|---|---|
| **Onboarding** | Completing verification (docs, references) instead of abandoning halfway |
| **Activation** | Drafting a *first real* mandate, not just creating a profile |
| **Migration** | Moving deals they'd normally run over WhatsApp onto PharmaLink — the hardest one, since nothing forces it |
| **Breadth** | Representing several orgs on-platform, not one test client kept separate from the "real" business |
| **Advocacy** | Referring another partner, buyer, or supplier |

---

## 2. The one rule this scheme actually needs to respect

Rewarding the sourcing partner for bringing business to PharmaLink is a
normal, legal channel/referral incentive — the same model every SaaS
company, marketplace and affiliate programme runs. It is **not** insider
trading (a securities-law concept about trading a public company's stock on
non-public information — a different domain entirely) and it is **not**
bribery: the partner's whole job is bringing business, and paying them well
for doing it is the point of the programme, not a risk to manage around. An
earlier pass at this document over-hedged that distinction; this version
drops the parts that didn't actually apply to a scheme that only rewards the
partner for their own qualifying actions.

The one constraint worth keeping is self-imposed, not external regulation:
**A1's shape reappears here.** A reward that scales with a deal's value —
"2% cashback on GMV you bring" — is the escrow-shaped commission
`Agent_Framework.docx` proposed and this program already rejected, just
wearing a coupon instead of an invoice line. Every reward below is a fixed
amount or a count-based milestone, never a percentage of `Deal.totalValue` or
GMV, exactly like Model B's bounty shape.

Two practical defaults, kept for bookkeeping convenience rather than
compliance necessity: pay to the partner's registered GST entity, reusing the
exact rail Model A/B payouts already use so nothing new has to be built or
audited separately; and publish the trigger rules (§3) so eligibility is a
lookup, not a judgment call — cheaper to run at scale, not a legal requirement.

---

## 3. The rewards ladder — objective, published, milestone- or count-based

| Milestone | Trigger (objective, checkable) | Reward | Maps to `PartnerPayout.kind` |
|---|---|---|---|
| **Activation** | First mandate drafted *and* `Introduction` sealed within 14 days of verification | Fixed **$100 / ₹8,300** (choice of entity payout or voucher, §4) | `activation_bonus` |
| **Consistency** | 5 mandates in a rolling quarter | Fixed **$150 / ₹12,500** | `streak_bonus` |
| **Breadth** | ≥3 / ≥6 / ≥10 distinct orgs with a *live* (non-revoked) `PartnerRepresentation` | Fixed **$100 / ₹8,300** per tier crossed, one-time | `breadth_bonus` |
| **Advocacy** | Refers another partner who reaches Tier 1 (Registered) verification | Fixed **$75 / ₹6,200** — literally N7.11's Model B bounty shape, reused | `referral_bonus` |
| **Tier advancement** | Registered → Qualified → Specialist | Non-monetary first (featured placement, premium mandate access — already in `PARTNER-PROGRAM.md` §4.2's tier table) + a modest published voucher (**$40 / ₹3,300** suggested) at each promotion | `tier_bonus` |

Every trigger is a **count or a boolean**, never a value — `resolveActingOrgId`-
style eligibility checks the same shape of thing `N7.10`'s guard already
enforces for `PartnerPayout`: the input to every reward calculation is a
count, a date, or a tier, never `Deal.totalValue` or a GMV figure. A future
`computeIncentiveAmount()` should live in `lib/partner.ts` next to
`computePartnerPayoutAmount()` and carry the identical type-shape guard.

---

## 4. Redemption — vouchers, cash, and why not to integrate Amazon/Flipkart directly

**Don't build Amazon/Flipkart integrations.** This is the same "buy, don't
build" call `PARTNER-ECOSYSTEM.md` makes for freight visibility. A rewards-
distribution vendor (Xoxoday Plum is the recognisable India-market example —
one API, a catalogue spanning Amazon, Flipkart and 20,000+ gift-card/
experience options across 80+ countries) exists specifically so a platform
never has to negotiate with each retailer separately. PharmaLink's job is
computing *who earned what*; the vendor's job is the redemption catalogue and
delivery.

**Cap voucher-style redemption; route cash above the cap through the same
ledger as everything else.** Recommend a per-redemption ceiling — roughly
**₹10,000 / $120** — below which a partner may choose a gift voucher for
convenience, and above which the reward settles as a bank transfer to the
entity on file, GST/TDS-handled identically to the existing Model A/B
`PartnerPayout` flow. This isn't a compliance patch, just bookkeeping: every
reward is already logged in `PartnerPayout` regardless of size, so the cap
only decides *how* a partner receives money they've already earned, not
whether it's tracked.

**Funding stays off trade value.** Every reward in this scheme settles from
PharmaLink's own marketing/incentive budget — never derived from or routed
through a buyer's or supplier's payment. Same non-trade-value principle as
Model A and Model B; this is a marketing-spend line, not a second revenue
share.

---

## 5. The NBFC rate-advantage lever — the "better % loans" idea

PharmaLink can't quote a specific interest rate — that's the lender's
underwriting call, not PharmaLink's to make. What's actually negotiable: a
**preferential rate slab** with a TReDS-
connected or partner NBFC, reserved for Qualified/Specialist-tier partners
with a clean record (zero disputes in 12 months, consistent `PartnerPayout`
history). This is a realistic ask, not a novel one — Indian NBFCs are
already moving from collateral-based lending to **cash-flow-based
underwriting**, using Account-Aggregator-consented bank data, GST data and
transaction history as the signal. A verified, timestamped `AuditLog` +
`PartnerPayout` history is exactly one more input into a pattern lenders
already run on; PharmaLink doesn't need to invent the mechanism, only supply
credible data to an existing one, with the partner's explicit consent to
share it (same consent-based pattern as `PartnerRepresentation`).

**PharmaLink never underwrites, never guarantees, never lends** — this is the
same boundary `PARTNER-ECOSYSTEM.md` §5 already draws. The lever is data plus
a negotiated relationship, not a PharmaLink financial product.

---

## 6. What not to do

- **Do not scale any reward with deal or GMV value.** A "cashback %" version
  of this scheme is A1's escrow model with a different label. Every reward
  here stays fixed-amount or count-triggered — the one rule that actually
  matters (§2).
- **Keep redemption non-discretionary**, mostly for scale, not risk: a
  published, lookup-based rule set is cheaper to run and easier to explain to
  a partner than a case-by-case approval queue, the same reason `N7.12`'s
  prohibited-behaviour checks are automated rather than manually reviewed.
- **Do not lead with this in partner recruiting.** `PARTNER-PROGRAM.md` §3's
  own numbers stand: at realistic Year-1 volume the per-partner incentive pot
  is small next to a real 1–3% deal commission. This scheme's job is cutting
  *activation friction* and rewarding *loyalty*, not being the reason a
  partner switches — the pitch stays "we protect your commission and make you
  faster," never "we'll pay you to switch."

---

## 7. Build vs. partner

| Piece | Call | Notes |
|---|---|---|
| Eligibility/rewards engine | **Build** | New `computeIncentiveAmount()` in `lib/partner.ts`, new `PartnerPayout.kind` values, same guard shape as `N7.10` |
| Voucher catalogue & delivery | **Partner** | Rewards-API vendor (Xoxoday Plum-class) — do not integrate Amazon/Flipkart directly |
| NBFC rate slab | **Partner** | Same relationship track as `PARTNER-ECOSYSTEM.md`'s trade-finance row — an additional negotiated term, not a separate integration |

**Recommendation:** green light §3's rewards ladder as a Phase-2/3 addition
to `N7.9` (it's a few new `PartnerPayout` kinds and a rules engine, not new
architecture) once the 90-day pilot (`PARTNER-PROGRAM.md` §5) is running;
the rewards-API vendor and the NBFC rate-slab both need an actual commercial
negotiation before either becomes a backlog story, same gate already applied
to `PARTNER-ECOSYSTEM.md`'s rows 4–7.

---

*Prepared 2026-08-29, market signals current as of this date. Sources:
[Partner Incentive Program guide — Xoxoday Plum](https://www.xoxoday.com/blogs/plum/partner-incentive-program),
[Amazon Gift Card API for channel incentives — Xoxoday](https://solutions.xoxoday.com/api/amazon-giftcard-api),
[Plum reward API platform — Xoxoday](https://plum.xoxoday.com/platform/reward-api),
[NBFC growth and digital underwriting — Wright Research](https://www.wrightresearch.in/blog/nbfcs-growth-and-formalization-credit-frontier-unlocking-with-digital-underwriting-and-retail-segmen/),
[NBFC collaboration and partnership models](https://nbfcadvisory.com/nbfc-collaboration/).
Reward amounts (USD/INR at an illustrative ≈₹83/$1), redemption caps and
NBFC rate terms are directional and must be validated against real vendor
quotes and a founder decision before any of this is scheduled.*
