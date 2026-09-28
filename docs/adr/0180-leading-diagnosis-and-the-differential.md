# ADR 0180 — The leading diagnosis is the visit's primary; the differential's order and likelihood live in the note; a must-not-miss stays until reasoned

**Status:** Accepted — 2026-09-28. GATE A (summary and impression) signed by the CSO (D-SI-05 to D-SI-07, D-SI-10,
D-SI-13, D-SI-16, D-SI-19 to D-SI-21).

## Context

Diagnoses could be added twice to one visit (S-3), the differential had no order or likelihood, and nothing stopped a
must-not-miss diagnosis from quietly falling off.

## Decision

1. **Leading = primary (D-SI-05).** One per visit. Make leading is one action that writes both versions
   (`setLeadingDiagnosis`); Move to differential leaves no leading diagnosis. Demoting or moving a Final needs
   final-diagnosis authority (D-SI-21).
2. **One of each per visit (S-3).** The same term, or the same typed words normalised, is refused: "Already on this
   visit", on screen and on the server.
3. **Reasoning in the note (D-SI-10).** Order, Likely/Possible/Unlikely (no numbers, D-SI-07), reasons, accepted
   evidence and meta live in the draft keyed by logical id (D-SI-19); the record holds the diagnoses. No new table.
4. **Pinned until reasoned (SI5, D-SI-06).** A must-not-miss stays above the rest of the differential until it is
   marked Unlikely with a reason of at least three words; until then the step reads "Reason needed", the sign bar
   names it, and the server refuses to sign.
5. **Remove with a reason (D-SI-13).** Added by mistake, Duplicate, Ruled out (with text) or Other (with text); the
   diagnosis is entered in error.
6. **Signing snapshot (D-SI-20).** Signing writes `impression.snapshot` (each diagnosis's logical and version id,
   display, verified code, rank, status, sensitivity, co-signature state) into the content before the HMAC, so the
   signed note never changes when the record does.
7. **Details in place (D-SI-16, ADR 0161).** At 1280 px and up Details replaces the note column with "Back to the
   note"; below, a centred dialog. Nothing slides in from an edge.

## Consequences

- A visit's Impression reads the same in the desk, the note and the signed record.
- Deploying before migration 0084 breaks only a junior's Final (ADR 0181); everything else here needs no migration.
