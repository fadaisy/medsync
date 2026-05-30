# ADR 0032 — Reception is non-clinical by design (RLS-enforced)

**Status:** Accepted — pending CSO sign-off (2026-05-30)
**Context:** Per `docs/patient-handling-flow-gate-a-proposal.md` §4 + the receptionist-workspace kickoff. The whole reason for introducing a reception/records role is to **keep front-desk administration off clinical surfaces**. Without a hard boundary the role is a clinical backdoor — exactly the thing PDPO + hospital governance scrutinise.

## Decision

### 1. Reception is a non-clinical cadre, not a regulator-anchored cadre

`cadres` gets an `is_clinical boolean NOT NULL DEFAULT true`. The seeded `RECEPTION` cadre row is `is_clinical = false` with `council_id = NULL` (made nullable in this migration). Doctors, nurses, midwives, allied — all stay `is_clinical = true` and council-anchored. No fake regulator was invented.

### 2. The boundary is RLS, not UI

Hiding clinical surfaces in the reception shell is necessary but insufficient — a stale staff_affiliations row or a future bug would let reception read clinical content via existing helpers. So the four clinical-content SELECT policies that previously granted any "active staff_affiliation at the hospital" now also require `cadres.is_clinical = true`:

- `clinical_observations` (vitals/obs from nurse workspace)
- `medication_administration_records` (MAR)
- `shift_handovers`
- `encounters`

Reception's affiliation has `is_clinical = false` ⇒ the EXISTS clause fails ⇒ the row is invisible. The boundary holds at the database; the UI never gets a chance to leak.

Reception **CAN** still read:

- `appointments`, `queue_entries` (operational scheduling)
- `patient_intakes` (the intake row IS reception's record)
- `patient_profiles` minimal columns via the existing tenant-staff read paths (`patient_code`, `sex`, `date_of_birth` — encrypted PII stays gated)

### 3. Onboarding bypasses the council/licence gate

`/signup/clinical` is council-anchored (UMDPC / UNMC / AHPC / Pharmacy Board) — a reception applicant cannot pick a council, so they cannot reach that form. Reception onboards via a **separate admin-invite path** (deferred to a follow-up; today reception users are seeded manually). Whatever ships, the verification basis is **employment + hospital-admin approval**, never a professional licence.

### 4. The `user_roles` CHECK widens to include 'reception'

`user_roles_role_check` gets `'reception'` added. The `reception` role grant is what `lib/reception/scope.ts` requires + what sign-in routing reads.

### 5. The cadre pill says it out loud

The reception shell's top-bar cadre pill reads **"Reception · non-clinical"** in a muted neutral tone (deliberately not teal). The chrome carries the signal so the staff member knows their scope at a glance — and so a screenshot in a code review is unambiguous about who's looking at what.

## What this is NOT

- Not a permission system in the abstract. Reception is one specific non-clinical role with one specific scope. If a future "records officer" needs different access (e.g. write access to corrections), that's a separate cadre + separate policy decision — not a generalisation of this one.
- Not a substitute for tenant scoping. Reception still has `hospital_id` everywhere; the non-clinical boundary is on top of, not instead of, tenant RLS.
- Not a substitute for audit. Every check-in, register-intake, cancel-intake fires `sa_audit_log` exactly like clinical actions. The boundary doesn't make the action invisible — it makes the data invisible.

## Consequences

- A reception user cannot read clinical observations, MAR rows, handover notes, or encounter content. The headline DoD test is "if reception's UI shows clinical content, the build is broken" — RLS makes this true at the database, not just at the page boundary.
- Doctors / nurses lose nothing — their existing policies still grant their existing access (they have `is_clinical = true` cadres).
- Adding another non-clinical role later (records / billing / housekeeping) follows the same pattern: new cadre row with `is_clinical = false`, new user_roles value, mirror the reception/scope helper.
- The lifecycle write paths (`ha-complete-encounter`, `ha-cancel-intake`, `ha-check-in-patient`) work for reception because their auth accepts any active staff_affiliation, not just clinical ones.

## Related

- [ADR 0026 — Patient workspace self-tracking](0026-patient-workspace-self-tracking.md) — established the "patient-private vs clinician-recorded" boundary.
- [ADR 0028 — Patient access basis](0028-patient-access-basis.md) — established the audited-PHI-decrypt pattern.
- [ADR 0030 — Nurse cadre→capability mapping](0030-nurse-cadre-capability-mapping.md) — established the cadre-as-RLS-key pattern.
- [docs/patient-handling-flow-gate-a-proposal.md](../patient-handling-flow-gate-a-proposal.md) §4 — the proposal this ADR codifies.
