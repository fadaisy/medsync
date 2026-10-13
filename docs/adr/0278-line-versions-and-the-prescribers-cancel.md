# ADR 0278 — A line version is a prescription row; the prescriber's cancel action

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), D-PH1-41, D-PH1-49; owner's answer at STOP 0 item 5.

## Decision

1. A placed line never changes except its `state`, so the prescription row is the line version (Step 0, Q4).
2. A new prescriber action, `cancelPrescriptionLine`, moves `active` → `cancelled` with a coded reason and, when the line
   was changed rather than stopped, the line that replaces it, recorded in `prescription_cancellations` (migration
   0130). No column is added to `prescriptions`.
3. "Change the prescription" is the existing dialog placing a new line, then the cancel of the old one; the pharmacy
   groups the new line with the prescription it replaces through `replaced_by`.
4. A line set `completed` at visit close was not continued; for the pharmacy it is closed, never supplied
   (gate-a-proposal §1, H1).
5. The doctor's prescription print records `prescription_print_events`, so "changed since printing" can be worked out;
   the paper is unchanged.

## Consequences

- RQ-9 and SU-2 compare row ids; a supply decision on a cancelled row is refused.

## Alternatives considered

- A version column on `prescriptions`: rejected; it changes how a prescription is written.
