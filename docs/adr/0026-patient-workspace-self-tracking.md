# ADR 0026 — Patient workspace: self-tracking is patient-private

**Status:** Accepted (2026-05-27)
**Context:** Patient Workspace feature, GATE A (per [`docs/patient-workspace-gate-a-proposal.md`](../patient-workspace-gate-a-proposal.md)). The defining case is the self-registered patient who has NOT yet selected a hospital and has no clinician connection. The workspace must be useful in that state — and the most natural "useful thing" for them is logging their own readings, medications, and notes.

## Decision

**Patient self-tracking is a separate, patient-owned table family. Clinician-prescribed monitoring is a different table family that ships with the clinical module.**

Three new tables in migration 0029:

| Table                   | Owner                | RLS                                                                                                 |
| ----------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| `personal_health_logs`  | patient (`auth.uid`) | patient SELECT/INSERT/UPDATE/DELETE on own rows; superadmin SELECT for support; no clinician policy |
| `self_medications`      | patient              | same                                                                                                |
| `self_medication_takes` | patient              | same                                                                                                |

Plus a reuse: `patient_profiles.primary_facility_id` IS the care-relationship intent. The hospital directory's "Set as primary" action UPDATEs that column. No new `patient_hospital_relationships` table.

## Why

**1. Honest boundaries between self-logged and clinician-prescribed.** When a clinician later prescribes "log your blood pressure twice a day," that observation belongs in a different table (`clinical_observations`, shipping with the clinical module). The boundary isn't a CHECK constraint on a single table — it's the schema itself. A clinician viewing a patient's record cannot accidentally read the patient's private notes; the policy can't be confused, because the table can't be queried.

**2. Useful for the unaffiliated patient.** The kickoff insisted: the unaffiliated patient is the defining case, and their home must not be empty. Self-tracking gives them a real reason to open the app daily — and a real surface that doesn't pretend a clinician is involved.

**3. Reminders stored, not dispatched.** `self_medications.schedule_times` (`time[]`) is captured today; the SMS / push dispatcher is out of scope (same as appointment reminders in [ADR 0023](0023-appointment-lifecycle.md)). The UI shows today's doses on next app open. Africa's Talking integration is a separate ticket.

**4. Reuse `primary_facility_id` over a new join table.** Multi-hospital care intent is a real future need but doesn't justify pre-building. When it arrives, the migration is a straightforward `patient_hospital_relationships` table with a backfill from `primary_facility_id`. Today's reality (one primary) maps cleanly to one column.

## What this is NOT

- **Not a clinician feed.** No clinician sees `personal_health_logs` until a clinical-module surface explicitly ingests it (via a future "elevate to shared monitoring" flow). Today: zero clinician read paths.
- **Not a medical record.** The patient app is explicit about this — every self-tracking surface carries "for your own tracking — not yet shared with a clinician." We never imply diagnosis, advice, or that a clinician is watching.
- **Not a substitute for the clinical module.** `clinical_observations` (clinician-prescribed monitoring), encounter records, prescriptions, and care-team messages all belong to the clinical module. The patient `/care` surface today is an inviting placeholder for that future.

## Consequences

- New patient-facing data lands in patient-owned tables by default. If a clinician needs visibility, the right answer is a separate table + a join-table mediated by patient consent — not loosening the RLS on self-tracking.
- The audit trail (per-tenant `audit_log` via `audit_log_changes()` trigger) captures every patient write to their own data. The trigger is attached at migration 0029.
- The tab bar replaces `Book` with `Track` as the second-position tab. Booking remains accessible (Home quick action, Visits header CTA, hospitals deep-link) but isn't a top-level destination for the unaffiliated patient — for whom it can't work yet.
