# ADR-0083 — The examination discrimination layer

**Status:** Accepted (owner-directed, 2026-09-07). Built on `feat/ncd-diabetes`.
**Extends:** [ADR 0082](0082-ncd-protocol-engine.md) — the NCD protocol engine and its catalog grammar.
**Partially supersedes** ADR 0082's position that the module carries no differential reasoning at all. The protocol engine is unchanged and remains primary; this adds a bounded, qualitative ranking layer beside it. It does **not** reinstate the v1 weights engine removed in [ADR 0081](0081-remove-clerkship-v1.md).
**No migration.** No schema change, no data change — `clinical_documentation.section_data` is JSONB.

## Context

ADR 0082 built a protocol engine and argued the case against a differential engine: v1 asked "given these findings, what could this be?", needed a tuned weight file per complaint, and never finished covering the front door. That argument was about **an open-ended differential across all of medicine**, and it still holds.

The examination layer poses a narrower question. Within a single disease catalog, a clinician recording Kussmaul respiration, tachypnoea, dehydration and a glucose of 27 is not asking "what could this be?" across an unbounded space — they are separating **DKA from HHS from a mixed picture**, a closed set of five or six named conditions the catalog already models as `Complication`s.

The protocol engine already reaches the right verdict for that patient: `acuteInterlock()` fires DKA, staged severe, with the criterion and citation attached, and a vignette pins it. What it cannot do is:

- **order** two live possibilities against each other (HHS above DKA in the 78-year-old with no ketosis),
- carry **refuting** evidence at all — `Feature.suggests` is deliberately one-directional,
- express **why** a finding matters before its complication is established, or
- say **which unexamined finding would most change the picture**.

Those are the four things the examination surface needs, and none of them requires probabilities.

## Decision

Add a **discrimination layer**: qualitative, ordinal, fully traceable, and evaluated entirely on-device from catalog data.

### What separates this from the engine that was removed

| v1 (removed, ADR 0081)                        | This                                                      |
| --------------------------------------------- | --------------------------------------------------------- |
| Open-ended across all presenting complaints   | Closed set: conditions this catalog already names         |
| Tuned numeric weights per complaint           | Four ordinal tiers, fixed and disease-generic             |
| Weights hand-set to make output look right    | Every link carries a citation and a rationale             |
| Output was a probability-shaped score         | Output is an **order**, and says so                       |
| One weight file per complaint, never finished | One `discriminates` array per finding, validator-enforced |

**There are still no tuned weights.** `strength` is one of four published-evidence tiers; the integers the ranker uses to sort are a fixed, disease-generic ladder in engine code, identical for every catalog, and are never shown to a clinician or stored. They order a list. They are not probabilities, they do not sum to one, and nothing in the UI may present them as a likelihood.

### The four tiers

`weak` · `moderate` · `strong` · `pathognomonic`. `pathognomonic` is reserved for findings that, present, admit no other explanation within the catalog; the validator warns whenever one appears, because almost nothing qualifies.

Where a **published** likelihood ratio exists it is recorded in `lrPositive` / `lrNegative` with its citation, and the validator **rejects** a numeric LR whose citation has no URL and no `needsCsoInput`. An LR may never be invented to justify a tier; the tier is the primary datum and the LR is provenance attached to it.

### Absence carries weight

`Assessed<T>` already distinguishes `not_assessed` from `recorded`, which is what makes a recorded negative meaningful. `importantNegative.absenceRefutes` is where that meaning is written down — and it is paired with a mandatory `caveat`, because the absence of Kussmaul respiration refutes _severe_ DKA and says nothing about mild DKA, a distinction a bare list would lose.

### Signs discriminate; numbers discriminate through rules

A deliberate departure from the shape the task described. A boolean or select finding carries `discriminates` directly. A **measurement** does not: a glucose of 27 discriminates through a threshold, and a threshold belongs in a `Criterion` where it is already cited, unit-checked and reusable. Modelling `glucose_high` as a second feature beside `random_pg` would create two codes for one measurement and let them drift.

So numeric discrimination flows through `DifferentialRule.when`, reusing the existing `Predicate` / `Criterion` vocabulary — including `atLeast`, which is exactly the "2 of these 5" shape acute presentations are written in.

### Ranking is ordinal, and confidence is separate from rank

`rankDifferential()` returns conditions ordered by support, each carrying the finding codes that raised it and the finding codes that argued against it. **Traceability is structural, not decorative**: a condition cannot appear in the output without the evidence array that put it there.

Rank and confidence are independent axes. Three recorded findings can produce a clear ordering and still warrant `low` confidence, and the surface must say so rather than presenting a confident-looking list built on almost nothing — the same failure `Completeness` exists to prevent.

### Urgency is a second axis, not a louder severity

The existing `red` / `amber` vocabulary on `EmergencyAction`, `dangerSign` and `TherapyFlag` answers _how loud is this_. `Urgency` (`routine` · `same_day` · `urgent` · `immediate`) answers _by when must something happen_. They are orthogonal — an amber finding can be `immediate` (get a glucose now) and a red one `same_day`. Both are kept.

## Age bands

`AgeBand` is declared in full — `neonate` through `older_adult` — so deferred paediatric content has a home and no later migration is needed. **Only `adolescent`, `adult` and `older_adult` are populated in this increment**; neonatal, infant and child content, ISPAD/BSPED paediatric DKA thresholds, BP percentiles, BMI-for-age and Tanner staging are explicitly out of scope here and are a second pass.

`refRange` is unchanged and remains the adult default, so no existing feature churns. `ageRefRanges` is additive and resolved band-first with fallback to `refRange`, which is why adding a band to one feature cannot alter any other feature's behaviour.

## What this does not do

- **No autonomous diagnosis.** Output is `suggests` / `consistent with` / `consider`. The surface carries persistent clinician-confirmation framing, and no copy in data or UI may state that a diagnosis _is_ anything.
- **No runtime model call.** Ranking is a pure function of catalog data and captured values, and runs offline on the device. This is a hard requirement, pinned by test.
- **No scope beyond diabetes.** Mimics that fall outside the catalog (salicylate toxicity, sepsis with lactic acidosis) are recorded as **named strings to exclude**, never as rankable conditions — the engine must not imply it is reasoning about them.
- **No dose, ever.** Unchanged from ADR 0082.

## Gating

Unchanged and doubled. `NCD_CLERKSHIP_LIVE` gates the surface; `csoSigned: false` throughout gates the content. Every construct added here carries `review_status` semantics through the existing `Citation.csoSigned` flag rather than a parallel field — there is one signature mechanism, and it already exists.

## Consequences

- The validator gains a rule that **errors** when an examination `sign` carries no `discriminates`. Findings that merely document do not pass. The 30 general-examination features committed before this ADR are backfilled rather than duplicated.
- `Feature.suggests` stays. It is the weak screening-priority link and is now clearly distinguished from `discriminates`, which is an evidential claim.
- A catalog with no `rules` or `conditions` behaves exactly as before, so hypertension and CKD are unaffected until they opt in.
