# ADR 0039 — Triage implements the ESI v5 mandatory-vitals + reassess-up rule

**Status:** Accepted — CLINICAL-SAFETY artifact, pending CSO sign-off (2026-05-31)
**Context:** The v1 triage engine computed NEWS2 + worse-of but missed the change ESI **5th Edition** (ENA, 2023-03-28) introduced over v4 — the most important under-triage safeguard in current US emergency triage. v2 implements it. Verified current at build against ENA / literature sources (`docs/triage-v2-gate-a-proposal.md` §1; confidence: high for the adult rule).

## The rule (ESI v5, verified)

Two things v4 did **not** require, which v5 does:

1. **Mandatory vitals.** HR, RR, and SpO₂ must be measured for **every** patient not already assigned Level 1 or 2 (v4 required them only for would-be Level 3). The rationale is documented under-triage: low-acuity-looking patients with deranged vitals were being missed.
2. **Reassess upward.** When a high-risk ("danger-zone") vital is present, acuity is reassessed **up**.

Verified adult danger-zone thresholds: **HR > 100, RR > 20, SpO₂ < 92.** (Paediatric numeric cutoffs live in the paid ENA handbook and were **not fabricated** — paeds stays provisional.)

## Decision

`lib/triage/scoring/esi-v5.ts` — a pure, boundary-tested function (`assessEsiV5`) that the engine folds into its worse-of as a **third track**, alongside the physiological score and the discriminator red-flags:

- **Missing any of HR/RR/SpO₂** (for a non-Step-0 patient) → `incompleteVitals = true`, acuity **floored to L3** (cannot issue a reassuring L4/L5), `provisional = true`, and a clinician-facing flag _"Assessment incomplete — obtain …"_. A reassuring score on incomplete data is exactly the falsely-reassuring failure ESI v5 closes.
- **Any danger-zone vital** → acuity floored to **L2** (reassess-up), with the firing vital named in the reasoning.
- The **danger floor (L2) is absolute** — a clinician baseline-temper can never cross it (same status as a fired red-flag). The **incomplete floor (L3) is NOT absolute** — it's a "needs assessment" default a reasoned, audited baseline-temper may cross (a clinician who knows the patient may legitimately complete the picture).

Thresholds are named constants in `constants.ts` (`ESI_V5_ADULT_DANGER = { PULSE_GT: 100, RESP_RATE_GT: 20, SPO2_LT: 92 }`) citing this ADR + the ENA source. Every boundary is unit-tested both sides — HR 100 vs 101, RR 20 vs 21, SpO₂ 92 vs 91 — in `tests/triage/esi-v5.test.ts` (14 cases). The comparison operators are strict (`> 100`, `> 20`, `< 92`), so 100/20/92 are _not_ danger; 101/21/91 are.

## Transparency

The engine emits the danger-zone line into `reasoning[]` and the incomplete-vitals line into `flags[]`; the triage dialog already renders both (`result.reasoning.map`, `result.flags.map`) plus the `provisional` badge — so the nurse sees _why_ the level moved up with no extra UI work.

## Consequences

**Positive:** closes the v1 under-triage gap; the engine now refuses to call an incompletely-assessed patient "Green"; danger-zone vitals can't hide behind a modest aggregate. Bias-up, as every guideline intends.
**Negative:** more patients sit provisional / floored-up until vitals are complete — accepted (under-triage is the catastrophic failure). Adult-only danger thresholds; paeds/obstetric remain provisional pending the paywalled rubrics (flagged, not faked).

## Verification (GATE E)

An adversarial, independent re-read of the engine fold (`runTriage` worse-of, the absolute-danger / crossable-incomplete floor split, the `assessEsiV5` operators, and the `provisional` OR) confirmed the logic matches this ADR with no off-by-one in any threshold comparison; all 182 triage tests pass.

## Related

- ADR 0035 (deterministic scoring), 0036 (worse-of), 0037 (override authority)
- `lib/triage/scoring/esi-v5.ts`, `tests/triage/esi-v5.test.ts`, `docs/triage-v2-gate-a-proposal.md`
