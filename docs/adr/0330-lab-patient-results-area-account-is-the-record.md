# ADR 0330 — The patient's results area: the account is the record, guardians by hospital link, no device copy

**Status:** Accepted — 17 Oct 2026 (owner, also the CSO, signing Lab Phase 5 [GATE A](../lab/phase-5/gate-a-proposal.md) as recommended). Built on `feat/lab-beyond-lis`; migrations 0154–0157 are GATED and owner-applied.

## Context

Phase 5 opens the first view of hospital results to patients. It must never show the wrong record, must protect children, and must not leave results on a shared phone.

## Decision

1. The signed-in patient account is the record (`patient_user_id`); no search and no hospital-number entry by the patient (PR-10). The header shows two identifiers.
2. A guardian opens a child's results only through a live `guardian_links` row made and verified at the hospital, and only for the groups the signed minors rule allows; until it is signed, nobody under 18 is shown in the app (PR-11).
3. No result is written to `localStorage`, IndexedDB or the service-worker cache; titles carry no name, test or value (PR-14). The page is rendered per request; there is no offline copy.
4. Opening a result records `patient_result_views` (who, when, device class), which the doctor sees as "Seen by the patient" (PR-13).

## Consequences

Lanes S28 to S38. Not having an offline copy is stricter than §5.1 asked; it removes the clearing problem entirely.
