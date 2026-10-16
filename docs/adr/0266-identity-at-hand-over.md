# ADR 0266 — Identity at hand-over

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), Law 6, SU-4, SU-5, D-PH1-16, H5.

## Decision

1. The person at the window says the patient's full name (attested by the supplier) and the date of birth or the
   phone number on file, which the supplier types and the server compares: the phone by blind index, falling back to
   decrypt-and-compare only where no index exists. No stored value ever reaches a pharmacy client.
2. Each attempt is logged with its outcome only. Five wrong tries per patient per Kampala day close the typed check
   until the in-charge reopens it.
3. Where neither can be given, the supplier records how the person was identified; each such hand-over is listed for
   the in-charge and counted. Nobody is turned away for lacking a document.

## Consequences

- The MedSync number does not count: it is on the screen and on the paper.

## Alternatives considered

- Reading the date of birth to the client for comparison: rejected.
