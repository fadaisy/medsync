# ADR 0199 — Doctors allocate a bed; the ward confirms arrival

**Status:** Proposed — 2026-10-03. Supersedes ADR 0194 §1 (states) and §3 (who may act) **in part**.

## Context

ADR 0194 lets only the hospital admin, the ward's in-charge and the ward's nurses put a patient in a bed. The owner
decided (D1) that the admitting doctor picks the bed and the ward confirms when the patient is in it.

## Decision

1. **A sixth derived state, Arriving:** an open assignment made for an admission (`admission_id` set) with no
   `arrived_at`. Order: Arriving (or Occupied) from an open assignment, then Out, then the latest event, then Free.
   Arriving counts as not available. An assignment made directly by ward staff for a patient already there has no
   admission and is Occupied at once, as before.
2. **The word and the paint:** "Arriving" (short "Arr"), the card fill with a dashed teal edge; never colour alone.
3. **Who may allocate:** the admitting clinician, **only inside the admission** (the close of their own encounter,
   ADR 0200), and ward staff (ADR 0194's list) from the ward's waiting list. A doctor cannot release a bed, set a
   state, or touch another patient: the hub's ward ops are unchanged for them.
4. **Arrived** (ward staff): sets `arrived_at/by` once, moves the admission to `arrived`, opens the inpatient
   encounter (ADR 0200). Arriving becomes Occupied.
5. **Cancel the allocation** (ward staff), with a reason: patient went elsewhere, died before arrival, left, other.
   The assignment ends; the admission goes back to the waiting list or, when the patient will not come, ends as
   `cancelled`.
6. **Nothing auto-releases** a held bed. A bed held as Arriving longer than **4 hours** (a proposed value for the
   owner) is listed under the ward's _Needs attention_.
7. **Doctors never see other patients' names** in the bed picker: it reads the board with `patients: "none"`.

## Consequences

- `bed_assignments` gains `admission_id`, `arrived_at`, `arrived_by`; its guard lets `arrived_at` be set once on an
  open row. Existing rows have no admission and stay Occupied: no backfill.
- The board's legend, counts, filters and `bedState()` gain `arriving`.
