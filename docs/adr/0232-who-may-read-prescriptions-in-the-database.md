# ADR 0232 — Narrowing who may read prescriptions and the chart in the database

**Status:** Accepted — 2026-10-10 (owner, also the CSO), Pharmacy Phase 0 GATE A, D-PH0-21, D-PH0-05
([gate-a-proposal](../pharmacy/phase-0/gate-a-proposal.md) §6.1–§6.2).

## Context

Migration 0039 let any approved or active affiliation at a hospital read every prescription, emergency administration
and crash-cart row through the client: reception and lab included, restricted indications included, superadmin by
role. And 23 chart policies admit any clinical cadre, which includes the pharmacy cadres.

## Decision

1. Migration 0100: `private.reads_hospital_prescribing(hospital)` — clinical cadres other than lab and pharmacy, or
   `pharmacy_staff` at that hospital — replaces the four 0039 SELECT policies, beside the patient's and the
   prescriber's or giver's own rows. Superadmin reads only through break-glass.
2. Migration 0101: the two pharmacy cadres leave the generic clinical-staff predicate (`is_active_clinical_staff` and
   nine inline policies), and nothing else changes; pharmacy staff read the chart only through the server read model.

## Consequences

- RLS probes: lab, reception, hospital admin, superadmin and other hospitals read 0 prescriptions; pharmacy staff read
  no encounter, resus record or observation through the client; doctors, nurses and allied clinicians read as before.
- Lab cadres keep their broad chart reach; reported to the lab, not changed here.

## Alternatives considered

Recording the exposure and leaving it; setting `is_clinical = false` on pharmacy cadres (drops the licence check at
approval).
