# ADR 0354 — Move: steps, activities and the energy they use, seen by the care team

**Status:** Accepted, 2026-10-18. Owner decisions: build Move fully, the care team (a nutritionist especially) can see what the patient logs, and the reference values count as signed off by the owner.

## Decision

1. **Steps** come from the phone's own motion counter (`expo-sensors`, which works in Expo Go).
   - iPhone keeps seven days even with the app closed. They are read when Move opens and once a minute while it stays open.
   - Android counts only while MedSync is open.
   - Each day's total is written to `personal_health_logs` as kind `steps`. The latest row of a day is that day's total, and only an increase of 50 or more is written.
   - Apple Health and Health Connect replace the phone counter in a development build (next phase).
2. **Activities.**
   - The patient can start one live (a timer with pause) or log one done earlier, with minutes and, where it matters, effort.
   - There are 13 activities, each costed from the **2024 Adult Compendium of Physical Activities** (Herrmann, Willis, Ainsworth et al., J Sport Health Sci 2024;13(1):6–12) by its Compendium code.
   - Energy used is MET × the patient's latest logged weight × hours. With no weight logged it is not shown, and the patient is asked to log one.
   - Stored as kind `exercise`: minutes in `numeric_value_1`, kcal in `numeric_value_2`, and the activity and effort in `unit`.
3. **Aims, not targets.**
   - A common aim of about 7,000 steps a day (Paluch et al., Lancet Public Health 2022;7(3):e219–e228).
   - The existing common goal of 150 minutes a week.
   - Both say "Ask your care team what is right for you".
4. **The care team reads it** (migration 0174). Anyone with a clinical relationship to the patient (`has_clinical_relationship`, the clinical record's own test) may read the patient's active self-logged rows. Only the patient writes them.
5. **Unchanged:** the safety card, quick water glasses and the plate guide.

## Consequences

- The owner applies migration 0174.
- A staff screen that shows these logs (nutritionist first) comes with the meal tracker.
