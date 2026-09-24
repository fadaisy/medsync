# ADR 0108 — Resus Desk v2: level-of-care recommender and capability-aware disposition

**Status:** Accepted — 2026-09-24 (CSO-signed `docs/clinical/resus-closeout-clinical-catalog.md`; D6, D24; E5)
**Context:** v1's disposition was a bare list (ward, ICU, theatre, …) with no link to how sick the patient was or
what the receiving unit could actually do. In Ugandan hospitals the gap between the level a patient needs and the
level available is the norm, and it must be recorded honestly rather than hidden.

## Decision

1. **A deterministic recommender** (`lib/resus/closeout/level-of-care.ts`, CO-R1..R16) maps the record — airway
   and ventilation support, vasoactive need, post-ROSC and obeys-commands (comatose → L3; awake after a brief arrest
   → ≥ L2 with continuous ECG, D6), organ support, BMI > 40 (D24), pregnancy — to a suggested level (ward | L1 | L2 |
   L3) using ICS 2021 levels of care, with every reason carrying its rule ID and source. It suggests; the clinician
   chooses.
2. **Care units** are a new minimal table `hospital_care_units` (E5 — no existing model): unit type, level and
   declared capabilities. Destinations are matched on required capabilities; a chosen level below the suggestion
   records a **mismatch code** (no bed, ceiling of care, family declined, transfer arranged, clinical judgement) —
   the gap becomes data.
3. **No fabricated facts:** units and bay defibrillator profiles are declared by the hospital in a JSON file loaded
   by `scripts/seed-resus-units.ts` (format `docs/resus-v2/hospital-resus.example.json`); the migration seeds nothing.
   With no units the sheet lets the clinician name the destination manually.
4. Disposition gains `hdu`, `labour_ward`, `discharged`; v2 records deaths as `mortuary` + an outcome code
   (`deceased` stays readable for v1 rows). The admission request is a `decision` event with
   `seam: "pending_intent"` — no bed management in v2.

## Consequences

**Positive:** disposition is tied to clinical need and to what the hospital really has; the mismatch between the
two is measurable per hospital. **Negative:** the recommender is only as good as the declared capabilities; until a
hospital loads its units the destination list is empty.

## Related

`docs/clinical/resus-closeout-clinical-catalog.md`, `lib/resus/reference/levels-of-care.ts`,
`tests/resus/v2/closeout/**`, ADR 0105, ADR 0107.
