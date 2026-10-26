# ADR 0434: A repeat is the prescriber's record beside the line

**Status:** Accepted, 26 Oct 2026. Pharmacy Phase 4 GATE A (signed by the CSO, D-PH4-29), Steps 2 to 4. This is the draft numbered 0425 in `docs/pharmacy/phase-4/adr-drafts.md`, renumbered because 0425 was taken on other branches.

## Context

A repeat lets the pharmacy supply a line again without a new prescription. It is a prescribing decision, so it must not be something the pharmacy can create or stretch, and it must survive the line being changed or cancelled without rewriting history.

## Decision

- **Rows beside the line.** `prescription_repeat_authorisations` (0230) holds:
  - the further supplies;
  - the minimum interval;
  - the last date and the review date;
  - the rule version in force.

  It is append-only and linked to the line version. Nothing is added to `prescriptions`.

- **Written only by a prescribing action.** `lib/emr/write/repeats.ts` authorises inside the plan's send, in the same transaction, under the signed repeat rules. Out-of-range values refuse the whole line, and the controlled-drug backstop refuses whatever the list says.
- **Ended is a projection.** A stop is a `prescription_repeat_events` row (the first stop stands). A cancelled or replaced line ends its repeats. Nothing is updated in place.
- **Printed in signed wording** under the line (s.37(5)), with the prescriber's council number.

## Consequences

- No Phase 4 module writes a prescription (`tests/pharmacy/network/writers.test.ts`).
- While the repeat rules are unsigned, no Repeats step is shown.
- Dark until 0230 is applied and `PHARMACY_REPEATS` is set.
