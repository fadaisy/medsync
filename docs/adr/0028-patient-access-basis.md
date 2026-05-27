# ADR 0028 — Patient access basis (legitimate-relationship-only PHI reads)

**Status:** Accepted (2026-05-27)
**Context:** Doctor Workspace, per [`docs/doctor-workspace-gate-a-proposal.md`](../doctor-workspace-gate-a-proposal.md) §4. "Any doctor sees any patient at the hospital" is wrong — it's both a confidentiality risk and an audit failure. We need a definition of "legitimate clinical relationship" that's tight enough to defend and loose enough not to block real care.

## Decision

**A doctor at hospital H may decrypt patient P's PHI only when at least one of three legitimate access bases is true.** Every successful decrypt writes a row to `clinical_phi_access_log`. Refusals are logged warnings.

### The three bases (OR-combined)

1. **`care_team`** — the doctor is on `patient_care_team_members` for P.
   _Today_: always false. The care-team module hasn't shipped; this branch in [lib/doctor/patient-access.ts](../../lib/doctor/patient-access.ts) is a labelled stub. When the engine lands, add a fast-path query at the top of `resolvePatientAccess()`.
2. **`active_encounter`** — a non-completed `encounters` row exists with `clinician_user_id = doctor` AND `patient_user_id = P`.
   _The active-care case_: the patient is in front of you, in your encounter.
3. **`department_recent`** — P has an appointment or encounter in the doctor's `department_id` within the last 30 days.
   _The ward / cross-cover case_: the IM team can read each other's IM patients during the inpatient stay + a reasonable follow-up window.

### Audit on read, not just on write

The `clinical_phi_access_log` table is append-only at both the trigger layer and the privilege layer (`REVOKE UPDATE/DELETE`), patterned on `audit_log`. Every legitimate decrypt records: `(hospital_id, clinician_user_id, patient_user_id, access_basis, request_id, surface, created_at)`. Patient access to their own record (via the consent centre, when it ships) is a SELECT policy: the patient sees who viewed them.

### Where it's enforced

- **`fetchPatientSummaryAudited()`** is the only function that decrypts a patient row in the doctor workspace. It resolves access basis FIRST; refuses with `null` if no basis matches; logs the access AFTER decrypt succeeds (so a decrypt failure can't generate a "successful access" row).
- **`listDoctorPatientPanel()`** returns only patients matching the three bases — no PHI decryption (only patient codes + last-seen). The panel intentionally shows non-identifying data; names appear only when the doctor opens a specific patient.

### Window length

30 days for the `department_recent` basis. This is a hospital-policy default; tightening (to 7 / 14) or per-hospital-configurable is a follow-up if usage shows it's too wide.

### Break-glass

Reserved as the `break_glass` enum value in `clinical_phi_access_log.access_basis` so the schema doesn't need to migrate when the break-glass flow ships. Today: not implemented; emergency cross-relationship access is out of scope.

## What this is NOT

- **Not RLS-only.** RLS on `patient_profiles` already restricts who can `SELECT` the row, but RLS can't enforce "you may decrypt these specific encrypted columns" — encryption is application-layer. The access basis is enforced in the audited-decrypt helper, with RLS as defence in depth.
- **Not "any role at the hospital can read."** A nurse / pharmacist / lab tech has their own access basis (TBD when their workspaces ship); this ADR defines the doctor's. Don't generalise prematurely.
- **Not a substitute for tenant scope.** Tenant (hospital) isolation is enforced earlier — the doctor's scope is already pinned to their active affiliation. Access basis is the per-patient layer on top.

## Consequences

- A doctor who tries to open a patient they have no basis for sees a calm "above your current access" screen, not a 404 or a stack trace. The refusal is logged (warning level).
- The patient panel feels true to the doctor's real practice: only their actual cohort, not the whole hospital's address book.
- When the care-team module ships, adding the fast path is a one-function change and the basis label updates everywhere — no UI rewrites needed.
- The PHI access log is patient-discoverable (RLS allows `patient_user_id = auth.uid()`), unlocking the future "who viewed my record?" surface in the patient consent centre without schema work.

## Related

- [ADR 0027 — Doctor cadre→capability mapping](0027-doctor-cadre-capability-mapping.md) — the write-side complement.
- [ADR 0008 — PHI encryption](0008-phi-encryption.md) — the underlying encryption + decrypt contract this layer audits.
