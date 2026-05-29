# ADR 0031 — Patient entry-point taxonomy + intake model + triage seam

**Status:** Accepted (2026-05-29)
**Context:** [`docs/patient-entry-points-gate-a-proposal.md`](../patient-entry-points-gate-a-proposal.md). Triage is the next build; this ADR captures the front-door decisions that triage will consume.

## Decision

### 1. Entry types are reference data, not an enum

`entry_types` is a table with 11 seeded rows (booked_arrival, walk_in, external_referral_routine, external_referral_emergency, emergency_self_presentation, self_referral_bypass, internal_transfer, inter_facility_transfer, program_visit, follow_up, virtual). Per-type flags (`is_emergency`, `default_priority_hint`, `requires_referral`, `allows_unknown_patient`, `requires_appointment_link`) drive routing + validation declaratively.

**Why** — hospitals will want tweaks (national-referral hospitals have entry types HC-IVs don't; private vs public differ). Adding a row beats bumping an enum + CHECK + types union across schema. Code paths read the row, not a literal.

### 2. Emergency never blocks — encoded in the schema

The `patient_intakes` CHECK `patient_user_id IS NOT NULL OR patient_unknown_label IS NOT NULL` is the floor. An unconscious patient brought by ambulance with no ID = `entry_type='emergency_self_presentation'` + `patient_unknown_label='Unknown female, ~30, brought by police'` + nothing else required.

The Edge Function `ha-register-intake` enforces the per-type validation: if `is_emergency = true`, none of (referral, presenting complaint, brought-by, department) are required. They land if known; they're skipped if not.

**Consent for emergency types is deferred** to post-stabilisation. Per the kickoff §3 "never block emergency care on documentation or registration completeness." Flagged for CSO sign-off before production go-live.

### 3. Patient linkage reuses onboarding, never a parallel model

`patient_intakes.patient_user_id` references `auth.users.id`. Search-or-register flow points the reception clerk at the existing `/signup/patient` if the patient isn't found — no shadow `walk_in_patients` table, no parallel identity. The unknown-patient label is **never** intended as a long-term identity; a follow-up `update_intake` flow (planned) backfills `patient_user_id` once the patient is identified.

### 4. Reception/records is NOT a new role for MVP

Hospital-admin holds the tenant-scoped, audited identity needed for reception work. `/hospital-admin/intake` is the capture surface. Nurses can register too (the Edge Function accepts any active clinical affiliation). A dedicated `reception` role + cadre + workspace lands when a hospital asks for it (the workspace surface would be a thin wrapper around the same Edge Function).

### 5. Triage seam — design now, don't build

This ADR explicitly does NOT define a `triage_assessments` table, acuity scoring, or the post-triage encounter creation flow. The interface triage will consume:

```sql
SELECT * FROM patient_intakes
WHERE hospital_id = ?
  AND status = 'awaiting_triage'
ORDER BY priority_hint DESC, arrived_at ASC;
```

Triage adds its own table for the assessment + flips `patient_intakes.status` to `'triaged'`. The intake row stays as the historical record of how the patient arrived.

### 6. "Other facility" capture instead of fabricating a registry

`referring_hospital_id` references `hospitals` (in-network). When the referring facility isn't in the registry, `referring_facility_other` accepts free text. We do not seed a fake "all Ugandan health facilities" registry — the partial-MedSync-network reality is honest.

## What this is NOT

- Not a triage build. No acuity scoring, no department routing logic. Triage decides what `awaiting_triage` becomes.
- Not a queue surface. `queue_entries` (from migration 0028) is the physical waiting line; `patient_intakes` is the front-door registration. They're related but distinct (an intake → triage → encounter → queue entry, in that order).
- Not a notification dispatcher. Emergency intakes set `is_emergency = true` via the entry_type join; the future dispatcher consumes that flag to send pages/SMS.

## Consequences

- Adding a 12th entry type = `INSERT INTO entry_types` (no migration to CHECKs).
- The Edge Function audit trail captures every intake with the arrival timestamp — the time-to-triage QI metric the next build needs is already there.
- Patient identity is single-sourced — no risk of "the John Doe table" growing parallel to `patient_profiles`.
- Reception role can land later without disrupting the data model.

## Related

- [ADR 0023 — Appointment lifecycle](0023-appointment-lifecycle.md) — `booked_arrival` intakes link an existing `appointments` row.
- [ADR 0028 — Patient access basis](0028-patient-access-basis.md) — intake access for clinical staff follows the same legitimate-access basis once triaged.
- [ADR 0030 — Nurse cadre→capability](0030-nurse-cadre-capability-mapping.md) — nurses registering intakes use their existing affiliation; no new clinical actions.
