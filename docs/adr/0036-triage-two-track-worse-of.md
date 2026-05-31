# ADR 0036 — Triage acuity is the WORSE of score and red-flag (two-track), never averaged

**Status:** Accepted — CLINICAL-SAFETY ARTIFACT, pending CSO sign-off (2026-05-31)
**Context:** A physiological score (NEWS2) and a clinical red-flag list (SATS-style discriminators) can disagree. A patient with normal vitals but cardiac-sounding chest pain scores low yet is high-acuity. How the engine combines the two tracks is the difference between catching and missing that patient. Per research doc §4/§9 and kickoff §1.

## Decision

The final acuity is the **WORSE (most acute) of the score-derived acuity and the discriminator-derived minimum acuity** — never an average, never the score alone. This is the validated SATS two-track design.

```
level = min(scoreAcuity, discriminatorMinAcuity)   // lower number = more acute
```

Layered on top, in strict order (research doc §9):

1. **Step 0 — life-threat screen** short-circuits everything → Level 1, scoring bypassed (resus).
2. **Worse-of** (above) produces the base level.
3. **Trend escalation** can only _raise_ acuity (a worsening trajectory vs a prior level); it never auto-improves — a downgrade is a human decision, not an engine inference.
4. **Baseline adjustment** (for chronically-abnormal-baseline patients) can temper over-triage, but is bounded by an **absolute floor**: it can never pull below a fired red-flag discriminator or a Step-0 life-threat.

### The bias-up invariants (under-triage is the catastrophic failure)

- Uncertainty escalates: no numeric score AND no red-flag (paeds/obstetric with nothing fired) → provisional **Yellow**, not Green.
- A missing vital makes the result `provisional` and is never treated as a normal value.
- Trend and baseline are asymmetric by construction: trend only escalates; baseline-temper has a hard floor.

These are encoded in `lib/triage/engine.ts` and tested in `tests/triage/engine.test.ts` (worse-of, trend-never-improves, baseline-floor-absolute).

## Consequences

**Positive:** a low score can never hide a high-acuity red-flag; the safest signal always wins; the chronically-ill aren't blindly over-triaged, but never under a real flag.
**Negative:** deliberate over-triage bias means more patients sit at higher acuity than strictly necessary — accepted per research doc §0 ("under-triage kills; over-triage is merely inefficiency"). Local validation (§10) will measure the rate.

## Related

- ADR 0035 (deterministic scoring), ADR 0037 (override authority)
- `lib/triage/engine.ts`, `lib/triage/scoring/evaluate-discriminators.ts`
