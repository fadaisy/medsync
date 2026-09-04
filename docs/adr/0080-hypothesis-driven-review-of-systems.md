# ADR-0080 — Hypothesis-driven Review of Systems

**Status:** Accepted (owner-directed, 2026-09-04). Built on `feat/ros-hypothesis-driven`.
**Extends:** [ADR 0062](0062-review-of-systems-engine.md) — ROS engine; [ADR 0063](0063-ros-pc-suppression-focused-complete.md) — PC-suppression, focused/complete, coverage honesty. Both remain in force; this adds an attention layer above the sweep and changes neither the data model nor the coverage rules.
**Governed by:** [ADR 0065](0065-clerkship-clinical-reasoning-engine.md) — the anti-anchoring spine.
**No migration.** No new persisted state, no schema change, no catalog change.

## Context

The ROS is 81 screening symptoms across 12 body systems (migration 0045). It asked the **same questions in the same order for every patient** — a 25-year-old with knee pain got the identical sweep as a 70-year-old with weight loss.

Beside it, the ranking engine already held a live, weighted differential: 17 sourced per-complaint weight files, `scoreDifferential`, `tierOf`, conditional must-not-miss pins. `discriminatorsFor()` in [`reducers/diagnosis.ts`](../../lib/clerkship/agent/reducers/diagnosis.ts) even computed each diagnosis's unmet positive features.

**The two never talked.** `RosReview` received no agent input at all. ADR 0065 stated the intent — "propagates discriminating prompts into HPC / **ROS** / History / Examination" — but the propagation was only ever built for the Assessment tab (deleted in [ADR 0079](0079-remove-assessment-tab.md)) and the rail. `discriminatorsFor` hardcodes `area: "complaint"`, so it could not route to the ROS even in principle.

A second, quieter problem: **capture had no visible payoff.** Forty taps changed nothing on screen, so the work read as data entry.

## Decision

Three lanes replace the single accordion. New pure module [`lib/clerkship/agent/ros-priority.ts`](../../lib/clerkship/agent/ros-priority.ts).

1. **Ask next** — the unanswered screens whose answer would move the differential most, capped at 6, re-ranked live.
2. **Red flags** — every unanswered must-not-miss screen (19 in the catalog), relevance-ordered, **never capped and never ranked out**.
3. **Full sweep** — the existing 12-system accordion, completely unchanged.

For each candidate the engine simulates the answer "present", re-scores the live hypotheses and measures the movement.

### The gain function, and why it is shaped this way

ADR 0065's spine is anti-anchoring — **"always plural"**, with the stated design test that the engine "must make a clinician _consider more, re-check red flags, and pause_ — never fixate. If a change would narrow/entrench, that's the signal to redesign."

A naive information-gain ranking is exactly such a change: it walks the clinician down the leading hypothesis. So gain measures **discrimination between hypotheses, not confirmation of the front-runner**:

| Term          | Meaning                                                              |
| ------------- | -------------------------------------------------------------------- |
| `separation`  | spread of the per-diagnosis deltas (`max − min`)                     |
| `LEADER_FLIP` | +3 when the answer would change the leading hypothesis               |
| `ENTRANT`     | +1 per hypothesis climbing into the top 3                            |
| `OPENS_PIN`   | +4 when the answer would satisfy an **unpinned** must-not-miss gate  |
| `ANCHOR_DAMP` | ×0.35 when the question's only effect is to raise the current leader |

Two properties are the design test, and both are asserted in `tests/clerkship/agent/ros-priority.test.ts`:

- **A uniform lift scores zero, however large.** A question that raises every live hypothesis by +9 separates nothing, so it ranks nowhere. Magnitude is not gain; spread is.
- **A confirm-the-leader question is damped below a separating one even when its raw lift is twice as big.** That is the anchoring move, named and penalised.

Safety is never subject to any of this. The pin bonus is added **after** the damp; the pin scan runs over the **whole** differential rather than the ranked window (a must-not-miss too improbable to be a contender still gets its gate watched); and the red-flag lane is populated from the catalog, not the ranking.

### Silence is the default

The engine returns nothing unless there are **≥2 live hypotheses**. With one (or none) every question can only confirm — exactly the anchoring the ADR forbids. A screen no weight file references scores 0 and is never pulled out of the sweep with an invented reason.

Vocabulary is the existing curated `FEATURE_ALIASES` bridge and nothing else. No fuzzy matching is introduced.

### Honesty of the reason line

Every question shows what it would change — _"Separates Tuberculosis from ACE-inhibitor cough"_, _"Would raise Malaria — a must-not-miss"_. A test asserts every name in every reason line is actually in the live differential for that input, so the lane cannot narrate a diagnosis the engine is not holding.

## What is deliberately unchanged

- **ADR 0063 coverage honesty in full.** Coverage is still computed from what was actually **answered**, never from what was offered. Not-reviewed is still never auto-marked negative. Lanes 1–2 are an attention layer: they re-order, and remove nothing.
- **PC-system suppression.** HPC-covered systems are excluded from both lanes — the rail's "Ask" line already prompts those, and re-asking them here would duplicate it.
- **Nothing is auto-answered.** Three-state per symptom, as before.
- **Focus is the clinician's.** The ranked lane respects it, and reports what it held back with a one-tap Include. **Red flags deliberately ignore focus** — a focused sweep is a choice about depth, not a licence to drop a must-not-miss. Those systems still document honestly as not-reviewed unless answered.

## Graceful degradation

The ranked lane needs `AGENT_DDX_RANKING_CSO_SIGNED`. With the flag off, no complaint captured, or no matching map, `rosLanes` returns an empty ranked lane and a **complete** red-flag lane, and the sweep renders exactly as it did before — the red-flag lane is catalog-driven and needs no agent at all.

## Rejected: promoting a positive screen into the HPC

The recommendation included routing a positive ROS screen into the HPC, where the full property engine lives, and dropping inline property capture entirely. **Rejected on a real coupling:** `pcSystems` is derived from _all_ `hpcItems`, so promoting one symptom would mark its whole system HPC-covered and collapse the rest of that system out of the sweep (ADR 0063 Rule 1). Fixing that means changing what "PC-owned" means, which is a clinical-content decision, not a UI one.

Instead, property capture is **kept but made opt-in**: the editor no longer springs open on every positive; a `+ detail` control opens it. This also turned out to be load-bearing — the catalog's "Weight change" screen is deliberately non-committal about direction, so it correctly scores 0 until the property distinguishes loss from gain. Aliasing it to "weight loss" would have been a fabricated match.

## Consequences

- Ranking cost is **0.74 ms** for the full 81-screen catalog (20-run mean), inside a memo — negligible.
- `ros-priority.ts` duplicates the shared-complaint reinforcement from `suggestRanked`. The drift is guarded behaviourally: a test asserts that when the ranker predicts `flipsLeader`, the rail's leading diagnosis really does change.
- The ranked lane re-orders with a FLIP transform (expo-out, 250 ms, nothing under `prefers-reduced-motion`). The motion is the payoff signal — it shows the clinician their answer changed what to ask next — and is sanctioned rather than decorative.
- **Reordering clinical questions is clinical content.** The gain function is calibration, but which question a clinician sees first is a clinical assertion. This needs CSO review before `AGENT_DDX_RANKING_CSO_SIGNED` goes to 1, alongside the differential weights it already gates.
