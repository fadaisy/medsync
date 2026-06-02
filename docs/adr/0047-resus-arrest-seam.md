# ADR 0047 — Cardiac-arrest detection is a clean seam; the ALS algorithm is a separate module

**Status:** Accepted — CLINICAL-SAFETY artifact (CSO authorised the seam boundary, 2026-06-02)
**Context:** A patient in a resus can arrest at any point. The full ALS cardiac-arrest algorithm (CPR quality, rhythm assessment, defibrillation energies, the 2-minute cycles, **adrenaline/amiodarone dosing + timing**, advanced airway in arrest, the 4 Hs & 4 Ts, ROSC/post-arrest care) is the highest-risk, most dose-and-timing-critical logic in emergency medicine. It must be its own focused, separately-2025-verified, separately-signed-off build — NOT smuggled into this surface.

## Decision

This surface ships **only the detection seam** (`lib/resus/arrest.ts`, 5 tests; `markResusArrest` in the record layer):

1. **Detect** — `detectArrest({responsive, breathingNormally, centralPulse})`: arrest when **unresponsive AND (not breathing normally — agonal gasps count as not normal — and/or no central pulse / no signs of life)**, checkable at any letter. Insufficient signs ⇒ not arrest.
2. **Prompt + route + stamp** — on detection: surface an unmistakable **"Start CPR"** prompt, stamp `resus_episodes.arrest_detected_at`, append `arrest_detected` + `cpr_started` timeline events, audit `detect_resus_arrest`, and label the route target **"ALS cardiac-arrest module — to follow."**
3. **Hard boundary — built here: NOTHING past the route.** No rhythm assessment, no defibrillation/energy logic, no CPR rate/depth/ratio logic, **no arrest drug dosing whatsoever**, no 4Hs/4Ts workflow. Peri-arrest arrhythmias are likewise flagged-not-built. The seam is a single hand-off interface the ALS module will later own.

## Consequences

**Positive:** the surface reliably recognises arrest and prompts CPR + the team, with the transition permanently timestamped — while the dose-and-timing-critical arrest logic stays quarantined for its own verified, signed-off build (no half-built arrest algorithm can ship by accident). **Negative:** after the seam fires, the team continues on paper/the ALS module until that module exists — disclosed in the UI ("module to follow"). The seam asserts arrest from a one-tap declaration (the clinician is asserting the criterion); the structured 3-sign check is available via the action for completeness.

## Related

- `lib/resus/arrest.ts`, `lib/resus/record.ts` (`markResusArrest`), `app/nurse/resus/actions.ts` (`detectResusArrestAction`), `lib/resus/reference/abcde-catalog.ts` (`ARREST_SEAM`)
- `docs/resus-abcde-gate-a-proposal.md` §A.5; `resuscitation-abcde-clinical-reference.md` §11
