# Patient Entry Points — GATE A Proposal

> **Status: Awaiting Caroline / Usama sign-off.** Triage is the next build — this design ends at the `awaiting_triage` handoff and deliberately ships no acuity logic.

## 1. Reuse vs net-new

| Piece                                                                  | Status                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient model + onboarding                                             | **Reuse** — search-or-register flow points back at `patient_profiles`; new-patient lightweight registration is the existing signup-patient flow at `/signup/patient` (no parallel patient model).           |
| Scheduling appointments + queue + arrival → encounter handoff          | **Reuse** — `appointments`, `queue_entries`, `encounters`, `ha-mark-arrived`, `ha-record-walkin`. Booked-arrival entry type LINKS an existing appointment; emergency entries optionally create a queue row. |
| Geography / facility reference data (referring-facility selection)     | **Reuse** — `hospitals` table for in-network referring facilities. **"Other facility" capture** as free text when not in the registry (do not fabricate a registry).                                        |
| Hospital + doctor + nurse shells, audited PHI decrypt patterns         | **Reuse**.                                                                                                                                                                                                  |
| `clinical_phi_access_log`                                              | **Reuse**.                                                                                                                                                                                                  |
| Audit infrastructure (`sa_audit_log` + per-tenant `audit_log` trigger) | **Reuse + widen with intake verbs.**                                                                                                                                                                        |

**Net-new in migration 0032 — two tables:**

| Table             | Purpose                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `entry_types`     | Reference data — the 11 entry types as rows so adding a 12th doesn't need a code release. |
| `patient_intakes` | The unified intake/encounter-precursor record. THIS is what triage consumes.              |

**Net-new code:**

- Edge Function `ha-register-intake` — the audited create path; never blocks on missing referral / consent for emergency types.
- `/hospital-admin/intake` — the capture surface (reception/records function — see §4).
- Incoming panel on `/nurse` and `/doctor` overview pages — today's `awaiting_triage` intakes filtered to the user's scope.

## 2. Entry-type taxonomy (proposed canonical set)

11 entries, all seeded as reference data:

| Code                          | Label                                       | Emergency? | Default priority hint |
| ----------------------------- | ------------------------------------------- | ---------- | --------------------- |
| `booked_arrival`              | Booked appointment arrival                  | no         | routine               |
| `walk_in`                     | Walk-in (self-presenting, non-emergency)    | no         | routine               |
| `external_referral_routine`   | External referral (routine/scheduled)       | no         | routine               |
| `external_referral_emergency` | Emergency referral                          | **yes**    | urgent                |
| `emergency_self_presentation` | Emergency self-presentation                 | **yes**    | urgent                |
| `self_referral_bypass`        | Self-referral / bypass (non-emergency)      | no         | routine               |
| `internal_transfer`           | Internal transfer / inter-department        | no         | routine               |
| `inter_facility_transfer`     | Inter-facility transfer (incoming admitted) | no         | high                  |
| `program_visit`               | Scheduled / recurring program visit         | no         | routine               |
| `follow_up`                   | Return / follow-up                          | no         | routine               |
| `virtual`                     | Virtual / tele entry                        | no         | routine               |

**Why reference data, not an enum:** Hospitals will want hospital-specific tweaks — a national-referral may need a separate "casualty department transfer" code that a HC-IV doesn't. Adding rows to a reference table is cheap; bumping an enum value across schema + types + CHECK is expensive.

## 3. The intake record

```sql
CREATE TABLE public.patient_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,

  -- Entry classification
  entry_type_code text NOT NULL REFERENCES public.entry_types(code),
  entry_point text,          -- 'casualty' | 'medical_emergency_unit' | 'assessment_centre' | 'opd' | 'ward' | 'virtual' | 'other'
  receiving_department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  receiving_ward_id uuid REFERENCES public.hospital_wards(id) ON DELETE SET NULL,

  -- Patient linkage. Nullable to allow unknown-patient emergency capture
  -- (a comatose John Doe arriving by ambulance) — the registration
  -- backfill links the patient_user_id later. NEVER blocks emergency care.
  patient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_unknown_label text,  -- "Unknown male, ~50, brought by police"

  -- Booked-arrival link (the seam to scheduling)
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,

  -- Referral fields — ALL conditional, ALL optional. The form
  -- requires them for *routine* referrals; emergency types skip
  -- (capture-fast, complete-later).
  referring_hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  referring_facility_other text,
  referring_clinician_name text,
  referral_reason text,
  referral_document_url text,
  referral_date date,

  -- Clinical context (seed for triage; not a triage decision)
  presenting_complaint text,
  brought_by text,                -- "Husband", "police", "ambulance"
  priority_hint text NOT NULL DEFAULT 'routine',
    -- 'routine' | 'high' | 'urgent'
    -- DERIVED from entry_type default at insert; can be bumped at
    -- intake (e.g. visibly unwell walk-in flagged urgent at the desk).

  status text NOT NULL DEFAULT 'awaiting_triage',
    -- 'arrived' (transient) | 'awaiting_triage' (the handoff state)
    -- | 'triaged' (triage build flips this) | 'cancelled'
  arrived_at timestamptz NOT NULL DEFAULT now(),

  registered_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intakes_priority_check
    CHECK (priority_hint IN ('routine','high','urgent')),
  CONSTRAINT intakes_status_check
    CHECK (status IN ('arrived','awaiting_triage','triaged','cancelled')),
  CONSTRAINT intakes_patient_or_unknown
    CHECK (patient_user_id IS NOT NULL OR patient_unknown_label IS NOT NULL)
);
```

The `patient_or_unknown` CHECK is the **emergency never-block** rule encoded in the schema: an intake MUST identify the patient OR carry an unknown-label string. Either path lets the row land.

**Indexes:** by hospital + status (for the awaiting-triage panels), by patient + arrived_at (for patient history), by entry_type + arrived_at (for admin aggregates).

## 4. Who registers entries? — Reception/records as a future role; today it's hospital-admin + nurse

The kickoff §4 asks whether MedSync needs a reception/records role. My recommendation: **NOT a new role for MVP.** Two reasons:

1. **Hospital-admin already has the tenant-scoped, audited shell + identity** — `/hospital-admin/intake` is the natural home for the reception function. A registry clerk at a small hospital may BE the hospital admin (or work under their account); at a large hospital this becomes the dedicated reception role later.
2. **Nurses can also register entries** for their ward (especially emergency walk-ins arriving at the unit door, where a nurse is on the spot). They reuse their existing scope.

The intake Edge Function (`ha-register-intake`) accepts callers who hold any of: `hospital_admin` (scoped), an active nursing affiliation, an active doctor affiliation, or `superadmin`. The capture UI lives at `/hospital-admin/intake` primarily; a smaller "Quick intake" entry point on the nurse shell ships when needed (flagged for follow-up).

**A dedicated `reception` role + cadre + workspace lands when a hospital asks for it.**

## 5. Triage handoff seam

Intake transitions:

```
register_intake → status='awaiting_triage'   (this build ends here)
       ↓
triage build picks it up
       ↓
status='triaged' + writes a triage_assessments row (next build)
       ↓
encounter starts (existing ha-start-encounter; encounter_id back-links to intake)
```

**The interface triage will consume:** a `SELECT * FROM patient_intakes WHERE hospital_id = ? AND status = 'awaiting_triage' ORDER BY priority_hint DESC, arrived_at ASC`. That's it — triage adds its own table for the assessment + flips status. The intake row stays as the historical record of how the patient arrived.

## 6. Emergency policy (clinical/legal — flagged for CSO)

- **No required fields beyond `hospital_id` + `entry_type_code` + (patient_user_id OR patient_unknown_label) + `arrived_at`** when `entry_types.is_emergency = true`. Referral letter, presenting complaint, brought-by — all welcome, none required.
- **No consent gate** on the intake row itself for emergency types. The patient signup flow's consent capture applies to non-emergency walk-ins who register fresh; emergency capture defers consent to post-stabilisation. (Per Ugandan emergency-care practice + the kickoff's never-block rule.)
- **Audit captures every emergency** with arrival timestamp for the "time-to-triage" QI metric the next build will surface.
- **CSO sign-off requested** on the consent-deferral and unknown-patient capture rules before production go-live.

## 7. Out of scope (deferred)

- **Triage logic / acuity scoring / post-triage encounter creation** — next build. The seam stays clean.
- **Notifications dispatcher** — emergency entries set a flag the dispatcher consumes when it ships.
- **Admin aggregate metrics snippet** — `/hospital-admin/overview` gets a "Today's entries" tile in a polish pass.
- **Superadmin cross-tenant aggregates** — separate ticket.
- **Document upload** for referral letters — the schema reserves `referral_document_url`; the upload widget + Supabase Storage bucket land separately.
- **Dedicated reception role + workspace** — until a hospital asks.
- **Patient pre-queue from `/patient/appointments`** — small enhancement to existing patient surface; separate ticket.

## 8. Asks before I migrate

1. **§2 taxonomy** — 11 entry types as the canonical set. OK?
2. **§3 intake schema** — particularly `patient_user_id` nullable + the `patient_or_unknown` CHECK as the never-block encoding. OK?
3. **§4 roles** — reception/records as a future role; today hospital-admin + nurse can register. OK?
4. **§5 triage seam** — intake stays as the historical record; triage adds its own table. OK?
5. **§6 emergency policy** — CSO sign-off pending on consent-deferral + unknown-patient capture rules.

Once signed off: migration 0032 + Edge Function + capture flow + workspace surfacing in one push.
