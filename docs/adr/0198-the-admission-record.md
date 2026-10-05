# ADR 0198 — The admission record

**Status:** Proposed — 2026-10-03.

## Context

There is no admission anywhere: completing a visit as `admitted` writes a word on the encounter. Bed assignments
(ADR 0194) link a patient and optionally an encounter to a bed, but nothing says that a patient was admitted, by
whom, to which ward, for what, or that they are still waiting for a bed.

## Decision

1. **`admissions`**, one row per inpatient stay: hospital, patient, `source_encounter_id` (the visit that decided it,
   unique), `inpatient_encounter_id` (set on arrival), `ward_id`, `decided_by`, `decided_at`,
   `leading_condition_id` (the leading problem from 09 Impression, when there is one), `status`, the wait reason
   (`bed_wait_reason` code and an optional encrypted note), and `arrived_at/by`, `cancelled_at/by`, `cancel_reason`.
2. **Statuses for this build:** `awaiting_bed`, `bed_allocated`, `arrived`, `cancelled`. Moves:
   `awaiting_bed → bed_allocated | cancelled`; `bed_allocated → arrived | awaiting_bed | cancelled`;
   `arrived` is final until the follow-up prompt adds `discharged`, `transferred` and `died`.
3. **One open admission per patient** (a partial unique index over the three open statuses).
4. **Kept for good.** A guard trigger allows only the moves above, sets each time once, and never deletes. Row
   audit (`audit_log_changes`) and RLS like `bed_assignments` (admins, superadmins, active clinical staff of the
   hospital); no client writes.
5. **The wait is data (D2).** Admitted with no bed, the reason is a code: `no_free_bed`, `extra_bed`, `floor`,
   `other` (with a note). The wording is a draft for the CSO.
6. **The live topic.** Changes broadcast `{ kind, ward_id, at }` on `ward-beds:<hospital>`, as the bed tables do.

## Consequences

- Waiting for a bed is visible per ward, and how long, which the board could not say.
- Discharge, transfer and death on the ward write this row later; nothing here needs to change for them.
- **Only where beds are tracked** (`WARD_BUILDER` on for the hospital). Elsewhere nobody could ever give the bed,
  and an open admission that never moves would block the patient's next one; the close then records the ward on
  the visit (`disposition_detail.ward`), as before, and no co-sign request is raised.
