# ADR 0209 — The registry person and day-level appointments, with seams to the canonical tables

**Status:** Proposed — 2026-10-05. NCDSync build (PROMPT-NCDSYNC-BUILD-v2 §3).

## Context

The prompt asks registry rows to reference a canonical patient table if one exists, and next-visit dates to create
appointments through an existing engine. MedSync has `patient_profiles` (one row per auth account), `provisional_patients`
(the hospital desk's queue, reconciled by `ha-reconcile-identity`) and a slot-based appointment engine booked through Edge
Functions.

## Decision

1. `ncd_person` holds the registry person with encrypted identifiers and keyed blind indexes. It carries nullable
   `patient_user_id` and `provisional_patient_id` links for later reconciliation, never set for a synthetic person.
2. `ncd_appointment` holds day-level next-visit dates, created only by closing a visit. A will-return promise on a recall
   call is recorded on the call and books nothing (D-22).

## Consequences

- No registry person (and no demo person) appears in reception search or identity reconciliation.
- Linking to an account, and booking into the clinician scheduling engine, are seams to build when a site needs them.
