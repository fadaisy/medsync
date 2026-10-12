# ADR 0270 — The patient's medicine list from supplies, the refill date, messages that name no medicine

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), ML-1 to ML-6, MS-1 to MS-5, D-PH1-30, D-PH1-31 (provisional until legal question 7), D-PH1-39.

## Decision

1. Each supplied line writes one entry to the patient's own list, naming its source; a reversal or correction withdraws
   it. Lines not given show in the signed patient wording.
2. A refill date exists only from days covered recorded by the dispenser, or a course code supplied in full; nothing is
   estimated.
3. Messages come only from approved templates, name the hospital by its signed message name, and never name a
   medicine, condition, clinic, point or prescriber; a banned-term scan enforces it. Live SMS is off by default and
   stays off in production while patient wording is unsigned.

## Consequences

- "In stock today" is sent only when a person presses it.

## Alternatives considered

- Medicine names in SMS: rejected (Law 12).
