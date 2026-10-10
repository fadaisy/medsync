# ADR 0231 — What pharmacy staff may read: the server read model and the read log

**Status:** Accepted — 2026-10-10 (owner, also the CSO), Pharmacy Phase 0 GATE A, D-PH0-05, -06, -15, RV-1..RV-7, E-PH0-03
([gate-a-proposal](../pharmacy/phase-0/gate-a-proposal.md) §5.2, §5.2a).

## Context

Opening the pharmacy widens who reads prescriptions. Data Protection and Privacy Act 2019: pharmacy staff read the
minimum needed to supply a medicine safely.

## Decision

1. The read list, signed: each line as stored; its indication (a restricted indication is shown, every open is
   logged); stored check answers and the line's reasons; the prescriber's cadre and the encounter's department;
   co-sign and state. For the patient: two identifiers, sex, age, allergies, latest weight and creatinine, each with
   its own date. Nothing else from the chart.
2. Reads are server functions with explicit field lists (`lib/pharmacy/read.ts`), as the owner, after
   `requirePharmacyScope`; hospital from the scope only.
3. Identities through `identitiesFor` (one batched reveal per load). Opening a prescription writes one `audit_log` row
   (`pharmacy_prescription_view`), none if the same viewer opened it in the last minute. Links to a prescription never
   prefetch.
4. Find takes a patient number in a request body, never a URL.

## Consequences

- Weight, creatinine and allergies are current values: nothing is stored at prescribing.
- The basis for each field is recorded in the proposal's read list.

## Alternatives considered

A broad RLS grant on chart tables (a client could read beyond the list).
