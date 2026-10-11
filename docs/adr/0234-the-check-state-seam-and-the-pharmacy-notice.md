# ADR 0234 — The check-state seam and the pharmacy notice

**Status:** Accepted — 2026-10-10 (owner, also the CSO), Pharmacy Phase 0 GATE A, D-PH0-07, CS-1..CS-5, E-PH0-04
([gate-a-proposal](../pharmacy/phase-0/gate-a-proposal.md) §5.3, §5.7).

## Decision

1. `pharmacyChecksState(hospital)` returns what is not done: dispensing not recorded, interactions not checked, and the
   signed dose references counted at run time from the shipped list (4 of 192 today). Later phases replace its body,
   never its callers.
2. "MedSync does not record dispensing yet…" renders on the queue and every prescription view while anything is not
   done: amber, a triangle, `role="status"`, no close button.
3. Every safety string is a `SignedCopy` entry. In production `PHARMACY_WORKSPACE` stays off while any is `draft`; the
   refusal is logged once. The wording ships `draft`, by the owner's choice at GATE A.

## Consequences

- No hospital sees the pharmacy in production until the CSO signs the wording in `content/pharmacy.ts`.
