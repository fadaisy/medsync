# ADR 0103 — Resus Desk v2: patient context once, one arrest state, vitals-derived findings

**Status:** Accepted — 2026-09-24 (CSO decisions D18, D19, D20 at GATE A, 2026-09-23)
**Context:** v1 asked for the same context in every step (trauma toggles in all five, allergen trigger in A/B/C,
head injury in C/D), had five separate "No signs of life" / "No pulse" toggles, and inferred step state only from
tapped findings. The live desk showed C "Clear" beside SBP 70 / MAP 63 / shock index 1.86 (P3), and a step bar that
read "Clear" while the step's own engine said "Not yet assessed" (P4). Root cause (STOP 0 Q10): v1's `deriveProgress`
counted any vitals or assessment event under a letter as "assessed" (vitals were logged under C) and took threat
only from a `danger` flag.

## Decision

1. **Patient context is entered once** (`context` event, latest wins) and mapped by a pure function
   (`lib/resus/survey/context.ts`) onto each step's exact v1 context object. Flags are independent except the signed
   co-variances (Trauma → A/C/E; Allergen → A/B/C; Head injury → C/D; Spinal injury → C and A's trauma/C-spine;
   Pregnancy confirmed → C and D). An equivalence suite proves every v1 combination per step is reproducible and
   engine outputs are identical.
2. **One patient-level arrest state** (D20), set only through the existing multi-sign confirm (`lib/resus/arrest.ts`),
   feeds all five legacy inputs and clears on ROSC. "Apnoea with a pulse → bag-mask, not CPR" is unchanged.
3. **Vitals-derived Measure findings** (D18, `lib/resus/survey/vitals-bands.ts`): only the codes whose signed catalog
   entry carries an explicit number (A GCS ≤ 8; B RR ≥ 25 / ≥ 30 / ≤ 8, SpO₂ < 92 %, < 94 % on air; C HR > 100 / < 60,
   SBP ≤ 90 or MAP < 65, shock index > 0.9 / ≥ 1.0, narrow pulse pressure; D glucose < 3.0), from adult (≥ 16 y) vitals
   recorded in this episode ≤ 15 min ago (the carried-in triage reading never derives), excluding values marked
   artefact. Derived and recorded pairs come from one measurement (MAP / pulse pressure / shock index are never built
   from different readings).
4. **Worsen-only floor** (`lib/resus/survey/floor.ts`): displayed state = the step engine over recorded ∪ derived
   findings, never better than recorded alone; normal vitals never produce "Clear"; an unassessed step keeps its "not
   yet assessed" marker even when vitals push it to a threat ("Active threat · from vitals · not yet assessed").
5. **The step bar reads each step's own engine** (assessed = a recorded findings set that classifies), fixing P4;
   the active-threat predicates are v1's (ADR 0049) unchanged.
6. Vitals are no longer logged under a step.

## Consequences

**Positive:** context is typed once; a shocked patient's C turns red from vitals before anyone taps a chip; P3/P4
regression tests pass; the signed A–E logic is untouched and proven equivalent. **Negative:** derivation is adult-only
and number-only by design — codes without a signed number stay manual; the co-variance list is a signed clinical
choice that must be revisited if the catalogs change.

## Related

`docs/resus-v2-gate-a-proposal.md` §4–§5, `tests/resus/v2/equivalence-*.test.ts`,
`tests/resus/v2/step-bar-regression.test.ts`, ADR 0045, ADR 0049.
