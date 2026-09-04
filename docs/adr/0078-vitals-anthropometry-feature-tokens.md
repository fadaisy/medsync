# ADR-0078 — Vitals + anthropometry as diagnosis feature tokens

**Status:** Accepted. Built on `feat/clerkship-vitals-tokens` (stacked on the weight_loss chunk).
**Context:** extends the clerkship agent (ADR 0065) and the ranked differential (smart-differential spec, 2026-06-17). Surfaced by the adversarial review of the `weight_loss` sourced differential (chunk 17), which found that three of the diagnoses it was asked to rank could not be ranked on the evidence that actually decides them. **No migration** — clerkship sections persist as JSONB (`encounter_sections.section_data`), so new `RecordedVitals` fields need no schema change.

## Context

Chunk 17 sourced a cited differential for unintentional weight loss. A completeness critic then found the file was being asked to reason about a body it could not measure:

1. **No anthropometry existed anywhere.** `RecordedVitals` carried hr/rr/spo2/sbp/dbp/tempC/glucose/GCS only. A grep for `weightKg`, `heightCm`, `bmi` or `MUAC` across `lib/clerkship` returned nothing. This is the weight-loss complaint in an EMR that cannot record a weight.
2. **Recorded vitals never reached the diagnosis scorer.** `buildFeatureIndex` consumed HPC, ROS, PMH and the exam arrays; `examVitals` was read only by `vitalFlags`. So a random glucose of 19 could not rank "New diabetes mellitus", and a temperature of 39 could not rank anything at all.

The consequence was worse than a missing feature: it silently changed what the weights files could express. Sourcing agents proposed thresholds drawn from WHO HIV staging, the GLIM/Fearon cachexia criteria and the ADA diagnostic cut-offs — all of which were uncomputable, so the weights had to lean on self-reported proxies instead.

## Decision

**Vitals and anthropometry become first-class feature tokens.**

- `RecordedVitals` gains `weightKg`, `heightCm`, `muacCm`. A pure `bmi()` helper derives BMI and returns `undefined` unless **both** weight and height are recorded — a missing height is never a default height.
- MUAC is carried deliberately alongside BMI: it is the standard adult nutrition screen in Ugandan TB/HIV programmes and needs only a tape measure, not a working scale. On a ward where the scale is broken, MUAC is the measurement that still happens.
- A new `indexVitals` pass emits **threshold tokens** into the feature index, so weight files opt in by naming a token exactly as they do for any catalog display.

### Token set (every threshold is a named, cited cut-off)

| Token                      | Threshold     | Source                                                  |
| -------------------------- | ------------- | ------------------------------------------------------- |
| `random glucose over 11.1` | ≥ 11.1 mmol/L | WHO/ADA diabetes diagnostic threshold                   |
| `glucose under 3.9`        | < 3.9 mmol/L  | ADA level-1 hypoglycaemia alert value                   |
| `glucose under 2.2`        | < 2.2 mmol/L  | WHO severe-malaria hypoglycaemia criterion              |
| `febrile 38 or above`      | ≥ 38.0 °C     | WHO fever definition                                    |
| `hypothermic under 36`     | < 36.0 °C     | NEWS2 low-temperature band                              |
| `systolic under 90`        | < 90 mmHg     | NEWS2 / sepsis screen                                   |
| `tachycardia over 100`     | > 100 bpm     | NEWS2                                                   |
| `bradycardia under 50`     | < 50 bpm      | NEWS2                                                   |
| `hypoxia under 92`         | < 92 %        | NEWS2                                                   |
| `bmi under 18.5`           | BMI < 18.5    | WHO adult underweight                                   |
| `bmi under 16`             | BMI < 16      | WHO severe thinness                                     |
| `muac under 23`            | MUAC < 23 cm  | adult MUAC cut-off, Ugandan TB/HIV nutrition programmes |

### Safety properties (deliberate, and tested)

- **Not-measured is never normal.** A token is emitted only when the measurement was actually recorded. An empty vitals set produces an empty index; a normal set produces no tokens. This preserves the discipline the rest of the clerkship already holds ("a low/0 NEWS2 score ≠ normal").
- **No invented thresholds.** Every cut-off above is a published one. Where NEWS2 already defines a band, NEWS2's band is reused rather than a new one authored.
- **Tokens are one-directional facts.** `febrile 38 or above` asserts a measurement, not a diagnosis. Nothing is inferred and nothing auto-fills.
- **Opt-in.** A complaint that names none of these tokens is byte-for-byte unaffected; the change cannot perturb an existing chunk's ranking by accident.
- **Gating is unchanged.** These tokens feed `packs.rankedMaps` scoring exactly as catalog displays do, so they remain behind `AGENT_DDX_RANKING_CSO_SIGNED`.

### UI

The vitals panel gains a **Nutrition** row (weight · height · MUAC) with a derived BMI chip. Per the design system, colour is never the only signal — the chip reads `BMI 15.6 · severe thinness`. Clinical-red is used only for BMI < 16, which is a genuine emergency on a wasting ward; underweight is amber.

## Consequences

- `weight_loss` now ranks on nutritional evidence: TB, HIV/AIDS and inadequate intake weight `bmi under 18.5` and `muac under 23`; "New diabetes mellitus" weights `random glucose over 11.1` at +4, so it surfaces on the actual diagnostic test rather than on a history token.
- `dizziness` gains the glucose tokens on Hypoglycaemia — an unconditional must-not-miss whose confirmatory bedside test could not previously move its rank.
- Every future chunk can reference measured evidence. `fatigue` (chunk 18) is the immediate beneficiary — anaemia, hypothyroidism and chronic disease all key off measurements.

### Deliberately NOT done here

**"New diabetes mellitus" is not renamed.** Its risk token `diabetes mellitus` aliases to the PMH screen key, so a _known_ diabetic scores a _new_-diagnosis hypothesis. The correct fix is to rename it `Diabetes mellitus — new or uncontrolled`, but weight entries match the approved map by **exact dx name**, so a rename is a change to CSO-approved clinical content in `enriched-reasoning-maps.json` and is not ours to make unilaterally. Mitigated instead: the known-DM token is held at +1 while the glucose token carries +4. **Recommended as a CSO action.**

**Vitals do not yet flow into `vitalFlags` differently.** This ADR only adds an index pass; the existing escalation reducer is untouched.

### Follow-ups recorded

- Weight/height are already nurse observation kinds (`db/schema/nurse-workspace.ts`); carrying the most recent nurse-recorded weight forward into the clerkship, as triage vitals already are, would avoid re-measuring.
- A documented previous weight (rather than a self-reported "over 5% in 6 months" chip) would let %-loss be computed rather than tapped.
- Site-specific pigmentation chips (buccal, palmar-crease, scar) for adrenal insufficiency, whose textbook rule-in is unreliable in very dark skin.
