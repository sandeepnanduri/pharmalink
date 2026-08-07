# ADR-001 — Monolith vs. Microservices for the PharmaLink MVP

**Status:** Proposed (recommendation)
**Date:** 2026-07-16
**Context:** PharmaLink is a B2B pharma-API marketplace. Expected early scale **~500–1000 users**, team of **5–6**, **6-week MVP**. The current `ARCHITECTURE.md` specifies ~10 microservices. This ADR asks: *is that right, or should the MVP be a monolith that can split into services later?*

---

## TL;DR — recommendation

> **Build the MVP as a modular monolith — a single deployable, but internally organised as the same bounded-context modules with hard boundaries and an event bus. Keep it event-driven (publish domain events to RabbitMQ for async work), keep database ownership per-module, and extract microservices later, one at a time, only where a concrete trigger appears.**

For this scale and team, full microservices are **over-engineering that taxes the exact thing an MVP cannot spare: delivery speed.** The good news: **~90% of the architecture already designed carries over unchanged** — same bounded contexts, same domain events, same JWT/cookie/security model, same compliance controls, same RabbitMQ for async. Only the *deployment and data topology* changes (1 deployable + 1 database instead of 10 + 10).

This is not "monolith **instead of** microservices." It is "**modular monolith now, microservices when you've earned the right** — and built so the split is cheap."

---

## 1. Scale reality check — what 500–1000 users actually means

Numbers matter here, because the whole microservices case rests on scale that this application does not have.

- **500–1000 is total registered users, not concurrent.** Realistic peak concurrency for a B2B sourcing tool: ~20–50 active users.
- **Napkin load:** 1000 users × ~20 requests/session × ~2 sessions/day ≈ **40k requests/day ≈ 0.5 req/s average, maybe 5–10 req/s at peak.**
- **A single modest app server (2–4 vCPU) handles thousands of req/s.** You would be using well under **1%** of one server's capacity. One PostgreSQL instance handles this load for *years* without breaking a sweat.
- RFQ/quote/deal volume in this window is **tens to low-hundreds per day** — trivial.

**Conclusion:** at this volume, "scale" is a non-problem. Microservices' headline benefit — *independent horizontal scaling of hot services* — solves a problem you will not have for a long time, if ever, at this user count.

---

## 2. What microservices actually buy you — and whether you need it now

| Microservices benefit | Real for PharmaLink MVP? |
|---|---|
| **Independent scaling** of hot services | ❌ No — total load is ~5–10 req/s. Nothing needs independent scaling. |
| **Independent deploys** by many teams | ❌ No — one team of 5–6. There is no deploy contention to relieve. |
| **Fault isolation** | 🟡 Partly — nice for *payments* later, but a well-built monolith with good error handling is plenty at MVP. |
| **Polyglot / different datastores** | ❌ No — one stack (Node/TS + Postgres) is ideal for a small team. |
| **Org scaling (Conway's law)** | ❌ No — Conway's law says match architecture to team *communication structure*. One small team ⇒ one service. |
| **Clear module boundaries** | ✅ Yes — but you get this from a **modular monolith** too, without the distribution tax. |

The only genuinely attractive item — clean boundaries — is achievable **without** distributing the system.

---

## 3. What microservices cost a small team (paid from week one)

These are not hypothetical; a 5–6 person team pays all of them immediately:

1. **Distributed-systems complexity becomes mandatory, not optional.** Network calls fail partially; you must design for retries, timeouts, idempotency, and eventual consistency *everywhere* — even for flows that are a single DB transaction in a monolith.
2. **No cross-service joins.** Data one service needs but another owns must be **duplicated via events into read models**. A trivial `JOIN` becomes an event pipeline + a projection + its own consistency bugs.
3. **Distributed transactions → sagas.** "Accept quote → create deal → notify" is one ACID transaction in a monolith. Across services it needs a **saga with compensations**. That is real code and real edge cases you do not need yet.
4. **Operational surface explodes.** Kubernetes, a service mesh (mTLS, circuit breakers), per-service CI/CD pipelines, per-service DB backups + migrations (×10), per-service secrets, distributed tracing as a *requirement* to debug anything.
5. **Local development pain.** Running 10 services + broker + mesh on a laptop, or mocking them, slows every developer every day.
6. **The velocity tax.** Realistically, a small team spends **30–50% of its effort on distribution plumbing** instead of product. In a **6-week MVP**, that is the difference between shipping and not.

**The blunt version:** microservices trade *developer productivity now* for *operational flexibility at scale later*. An MVP has no "later" if it doesn't ship, and no scale to flex for.

---

## 4. The strongest argument against splitting now: your boundaries are guesses

This is the one that matters most, independent of scale.

At MVP stage you **do not yet know** where the true seams are. Is "Matching" part of RFQ or its own thing? Does "Verification" belong with "Onboarding" or with "Compliance"? You have hypotheses, not evidence — real usage will move these lines.

- **Move a boundary in a monolith:** move code between modules. A refactor your IDE mostly does for you.
- **Move a boundary across microservices:** renegotiate service contracts, migrate data ownership between databases, coordinate multi-service deploys, version events. Days-to-weeks, not hours.

**Premature service boundaries calcify wrong guesses in the most expensive possible material.** The monolith keeps your boundaries *soft* precisely while you're still learning them — then you harden the ones that prove real by extracting them.

> Industry consensus backs this: "MonolithFirst" (Fowler), Sam Newman's caution against microservices for greenfield products, Shopify's modular monolith at massive scale, Amazon Prime Video famously *consolidating* a service back into a monolith for cost/latency. The pattern is consistent — **earn microservices with evidence; don't buy them on spec.**

---

## 5. The recommended approach — modular monolith, built to split

Not a "big ball of mud" monolith. A **modular monolith**: one deployable, disciplined internal boundaries, so extraction later is mechanical.

**Concretely:**

- **Same bounded contexts as modules.** Identity, Onboarding/Verification, Catalog, RFQ/Quoting, Matching, Notifications, Documents, Admin/Ops, Audit — now **modules in one codebase**, not separate deployables. All the design work already done stands.
- **Hard module boundaries, enforced.** A module exposes an interface; other modules call *that*, never its internals. No reaching into another module's tables. (Enforce with lint rules / package structure / architecture tests.)
- **Same domain events — in-process now.** Publish the *same event catalog* (`rfq.posted`, `seller.verified`, …) through an in-process event bus **and** to **RabbitMQ** for genuinely-async work. So it's still event-driven, and the event contracts are the future service contracts.
- **RabbitMQ stays — for async, not for splitting.** Background jobs (email/WhatsApp notifications, matching, search indexing, audit, SLA timers) run as **queue consumers**. This is the classic, sound "monolith + a message queue" pattern. You keep the whole async design.
- **Database ownership per module, one instance.** One PostgreSQL, **schema-per-module** with each module owning its tables. You get clean data ownership **and** the superpower a monolith keeps: **real ACID transactions across modules** when you need them (accept-quote → deal in one transaction — no saga).
- **The seams are pre-cut.** Because modules own their schema, talk only via interfaces + events, and never cross-join, extracting a module later = point it at its own database + flip its in-process events to the broker. The refactor is small *by design*.

**What you keep from the current architecture, unchanged:** the bounded contexts, the event catalog, JWT + HttpOnly/Secure cookies + RBAC, the compliance controls (consent, DSAR, audit, encryption, residency), RabbitMQ, the SEO/BFF frontend. **What changes:** deployment (1 app, not 10), data (1 Postgres schema-per-module, not 10 DBs), and you *drop* the mesh, per-service pipelines, and sagas until you need them.

---

## 6. When to split — triggers, not a calendar

Extract a service when a **concrete, present** trigger appears — "extract when it hurts," not on a schedule:

| Trigger | Likely first service to extract |
|---|---|
| A component needs **isolation / different compliance scope** | **Payments/Escrow** (PCI, KYC/AML) — Phase 2's natural first extraction |
| A component needs **independent scaling or a different datastore** | **Search** (OpenSearch), **Notifications** (spiky, async) |
| **Deploy contention** — the team is big enough that one deploy pipeline blocks people | whichever module changes most |
| A module needs a **different runtime/tech** | that module |
| A module's **load profile diverges sharply** from the rest | that module |

**Phased path (matches the roadmap):**
- **MVP:** modular monolith + Postgres (schema-per-module) + Redis + RabbitMQ (async workers). One deployable.
- **Phase 2:** extract **Payments/Escrow** first (isolation + PCI), then **Search** and **Notifications** if load/tech justifies. Everything else stays in the monolith.
- **Phase 3:** decompose further *only as team size and real scale demand.*

---

## 7. Decision scorecard for *this* project

| Factor | Points toward monolith | Points toward microservices |
|---|:--:|:--:|
| Users ~500–1000 | ✅✅✅ | |
| Team of 5–6 | ✅✅✅ | |
| 6-week MVP timeline | ✅✅✅ | |
| Domain boundaries still unproven | ✅✅✅ | |
| One tech stack, one datastore fits | ✅✅ | |
| Payments isolation (Phase 2) | | ✅ (later) |
| Independent scaling need | (none today) | |
| Many independent teams | (not yet) | |

The weight is lopsided. **Modular monolith wins clearly for the MVP**; microservices earn their place incrementally in Phase 2+.

---

## 8. Risks & mitigations

| Path | Risk | Mitigation |
|---|---|---|
| **Modular monolith (recommended)** | Discipline erodes → "big ball of mud" | Enforce boundaries with architecture tests / module linting; code-review the seams; schema-per-module from day one |
| | "We'll have to rewrite to split later" | Not a rewrite — extraction is mechanical *because* of the boundaries + events + schema ownership. Design for it now. |
| **Microservices now** | Blows the 6-week window; team drowns in plumbing | (avoid at MVP) |
| | Wrong boundaries calcify; expensive to move | (avoid at MVP) |

---

## 9. Recommendation (restated)

**Ship the MVP as an event-driven modular monolith with per-module schema ownership and RabbitMQ for async work. Extract services in Phase 2+ starting with Payments/Escrow, only when a concrete trigger appears.** It's faster to build, far cheaper to run, keeps your boundaries flexible while you learn them, preserves the event-driven + security + compliance design already done, and — because it's *modular* — lets you split into microservices later without a rewrite.

**Impact on deliverables if you accept:** update `ARCHITECTURE.md` §2/§3/§7/§10/§11 and the Architecture tab back to "modular monolith → extract later," keeping every other section (events, security, compliance) intact. ~1 focused pass.
