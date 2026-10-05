# ADR 0200 — Admission is atomic, and what the close does for an admission

**Status:** Proposed — 2026-10-03. Extends ADR 0139 §2 (the one completion path) and ADR 0101 R3.

## Context

Admitting writes three things that must happen together: the admission, the bed (or the place on the waiting
list), and the close of the deciding encounter. Two doctors may pick the same bed. The close's cascade also
completes the intake (which the board read its candidates from) and ends every nursing assignment for the patient.

## Decision

1. **One SQL function**, `admit_from_encounter(jsonb)`, `SECURITY DEFINER`, executable by `service_role` only (the
   `ward_layout_publish` pattern). Under a row lock on the encounter it checks the encounter is in progress, the ward
   is the hospital's and active, and the bed is an open, free bed of that ward; inserts the admission and, with a bed,
   the assignment; and completes the encounter as `admitted` with `disposition_detail` (`admission_id`, `ward_id`,
   `bed_id`) and its `disposition` event. Any failure rolls all of it back. Two doctors on one bed: the unique index
   refuses the second, which reads "That bed was just taken" and a fresh board.
2. **`ha-complete-encounter` calls it** when the close carries `admission`, then runs the rest of the cascade as
   today (queue rows done, the intake completed, the appointment completed).
3. **Nursing assignments end on arrival, not at the close.** A patient waiting for a bed is still in EU and still
   nursed there. `confirm_bed_arrival` ends the patient's open nursing assignments on other wards (and those with no
   ward). Every other disposition keeps today's cascade.
4. **Candidates come from admissions.** The board's waiting list is the ward's `awaiting_bed` admissions, oldest
   first. The old intake candidates (`receiving_ward_id`) stay for a patient sent straight to a ward by the desk.
5. **Arrival opens the inpatient encounter** (`confirm_bed_arrival`): `encounter_type 'inpatient'`, `in_progress`,
   the admitting clinician, the ward's department, and no `visit_id`: the admission is the stay's spine
   (`admissions.inpatient_encounter_id`). One per admission, never two.
6. **Inpatient encounters are not idle-flagged.** The Workspace's 24 h idle rule is for visits; a stay is days.

## Consequences

- The boards of ADR 0101 show the closed visit as "Admitted · {ward}", and a bed or "waiting".
- Ward rounds and the inpatient note write to the inpatient encounter later.

## Alternatives considered

- **Admission in the clinician's transaction, then the Edge Function close.** Two transactions: a failed close
  leaves an admission for an open visit, or a held bed.
