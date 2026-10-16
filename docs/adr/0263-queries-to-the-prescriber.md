# ADR 0263 — Queries to the prescriber: sent, seen, answered; phone answers; no escalation

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), RQ-2 to RQ-11, D-PH1-08 to D-PH1-10, D-PH1-41, D-PH1-47.

## Decision

1. A query and everything that happens to it are append-only events. Recipients are the prescriber and the current
   responsible clinician, resolved when sending; inactive ones are listed as skipped.
2. The query commits first; notification is a second step that never throws. The pharmacy reads delivery from the
   events and never says the prescriber knows before an answer. The nudge is `{kind, ref, at}` on `user:<id>`.
3. Any clinician who may prescribe for the patient answers; the first answer wins under a lock per query. Keep needs a
   coded reason; change places a new line that cancels the old one in the same transaction; stop cancels.
4. A logged phone "keep" answers, naming both people, and can be disputed; any other phone answer changes nothing.
5. A not-supplied notice needs no answer; "Leave it as it is" is recorded in its own table (0132). No escalation.

## Consequences

- Answers are the prescriber's own writes, kept in `lib/emr/write/pharmacy-answers.ts`; `lib/pharmacy` never writes a
  prescription.

## Alternatives considered

- Automatic escalation: out of scope for this slice.
