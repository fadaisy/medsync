# ADR 0174 — Vital signs as immediate observation sets; NEWS2 reuse

**Status:** Accepted — 2026-09-28. E6, E8, D-EX-10, D-EX-11, HX1–HX3, HX9 signed by the CSO.

## Decision

1. **"Save as a new set"** writes one `recordObservations` batch keyed by a reading-set id (a resend is the same set): BP from one field with position, arm and cuff; pulse with rhythm; SpO₂ with air or oxygen, modality, flow and scale; temperature with site; capillary glucose with its context (random → non-fasting; fasting; two hours after food → non-fasting with a meal challenge, 120 min: HX1 adds `challenge` to the writer); weight and height with how obtained; waist with the WHO protocol; ACVPU and GCS.
2. **Save needs air or oxygen and consciousness**, so no set is saved incomplete for lack of them (E-3). The loader reads them back into NEWS2.
3. **ACVPU C, interim (HX3).** The CFC `obs.avpu` has no "new confusion" answer, and adding one would regenerate the shipped seed migration 0072. Until the CFC addendum ships its own seed, a set with C writes no `obs.avpu` and carries `acvpu` in each line's context; the loader reads it.
4. **Units and plausibility (E8).** Decimal commas accepted; mg/dL converted with the repo's factor; a value outside the catalogue's plausible range needs a confirm tap and is marked in the line's context and in the note. A stepper's start value is never stored until touched.
5. **Offline**, the set is queued in the desk's write queue, shown as pending, and marked saved when it lands.

## Consequences

- The triage set stays read-only beside the new one; nothing is copied between sets.
