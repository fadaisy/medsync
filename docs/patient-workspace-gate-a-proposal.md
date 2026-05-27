# Patient Workspace — GATE A Proposal

> **Status: Awaiting Caroline / Usama sign-off.** Nothing migrated, deployed, or merged. This is a reviewable design doc consolidating the schema additions + open-question answers + what's reuse vs net-new.

## 1. What's reuse vs net-new

| Piece                                                                                           | Status                                    | Note                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/patient/*` route, layout, `MobileTabBar` chrome                                               | **Reuse**                                 | Shipped in scheduling GATE C. Today: Home (greeting + book card + upcoming-3), `/patient/book` wizard, `/patient/appointments` (with cancel).                                                                                                         |
| Responsive primitives (`ResponsiveSheet`, `BottomActionBar`, `MobileTabBar`, `StepWizardShell`) | **Reuse**                                 | All four live at `components/responsive/`. ADR 0025.                                                                                                                                                                                                  |
| `patient_profiles.knownConditions text[]`                                                       | **Reuse**                                 | Used to seed default reading kinds on the log-a-reading sheet.                                                                                                                                                                                        |
| `patient_profiles.primaryFacilityId`                                                            | **Reuse as the care-relationship intent** | A patient picking a new hospital updates this column. Honest, durable, no new schema needed. (The kickoff calls for a "care-relationship intent" — this column IS it; we keep the semantics by surfacing it consistently as "Your primary hospital.") |
| Booking wizard (`/patient/book`)                                                                | **Reuse**                                 | The scheduling feature's patient flow. The Patient Workspace just deep-links into it from the home + the Hospitals directory.                                                                                                                         |
| Sign-in routing → `/patient` for users with a `patient_profiles` row                            | **Reuse**                                 | Fixed yesterday (PR #29).                                                                                                                                                                                                                             |
| MFA-optional for patients                                                                       | **Reuse**                                 | `patient_profiles` not in `MFA_REQUIRED_ROLES`; the scope helper allows `verified` or `active`.                                                                                                                                                       |

**Net-new in this feature:**

| Surface                              | What lands                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home redesign                        | Connection-state banner; bottom-anchored quick actions; today's tracking glance.                                                                        |
| Section A — Self-tracking            | "Log a reading" sheet · trends view · self-medications + adherence · personal notes. **All clearly labelled "for your own tracking — not yet shared."** |
| Section B — Hospital directory       | Browse + search + filter MedSync hospitals (`active` only); select → updates `primaryFacilityId`; deep-link to book.                                    |
| Section D — My care (locked)         | Inviting "available once you connect" panel when unaffiliated; placeholder for the clinical-module-driven view when affiliated.                         |
| Section E — Profile + consent centre | View/edit own profile; consent-and-sharing list; notification prefs; optional MFA enrolment.                                                            |

## 2. Schema additions (migration 0029)

**Additive only. Two new tables, both patient-owned.**

### 2.1 `personal_health_logs` — self-logged readings + symptoms + notes

Single table with a `kind` discriminator. Two numeric value slots cover all the shapes we need today (glucose / weight / SpO2 / temperature use slot 1; BP uses 1 + 2 for systolic + diastolic). `note` for free text on any kind. `severity` for symptoms (1–5). Cheap to query for trends — no JSONB unpacking.

```sql
CREATE TABLE public.personal_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
    -- glucose | bp | weight | spo2 | temperature | symptom | note | other
  recorded_at timestamptz NOT NULL DEFAULT now(),
  numeric_value_1 numeric,
  numeric_value_2 numeric,
  unit text,        -- 'mg/dL', 'mmol/L', 'kg', 'lb', '%', '°C', '°F'
  severity smallint,  -- 1..5 for symptoms
  note text,
  state text NOT NULL DEFAULT 'active',  -- active | deleted (soft delete)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind IN ('glucose','bp','weight','spo2','temperature','symptom','note','other')),
  CHECK (state IN ('active','deleted')),
  CHECK (severity IS NULL OR severity BETWEEN 1 AND 5)
);
CREATE INDEX personal_health_logs_patient_kind_idx
  ON public.personal_health_logs (patient_user_id, kind, recorded_at DESC);
```

**RLS:** Patient SELECT/INSERT/UPDATE/DELETE on own rows (`patient_user_id = auth.uid()`). No clinician access yet — this is genuinely personal until a clinician-driven care relationship later elevates it (out of scope here; the seam is the existence of the table).

### 2.2 `self_medications` + `self_medication_takes`

Self-managed meds with a schedule pattern (daily, twice daily, as-needed, etc) and confirmed-taken events. We compute "today's doses" + adherence streak from these — no separate generated-schedule table, no batch job.

```sql
CREATE TABLE public.self_medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,           -- "Metformin"
  dose text,                    -- "500 mg"
  instructions text,            -- "with food"
  schedule_pattern text NOT NULL DEFAULT 'as_needed',
    -- as_needed | once_daily | twice_daily | thrice_daily | custom
  schedule_times time[],        -- specific reminder times (interpreted as
                                -- local-to-patient; PRD §1.5 timezone-safe note)
  started_on date,
  ended_on date,
  state text NOT NULL DEFAULT 'active',  -- active | paused | ended
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state IN ('active','paused','ended')),
  CHECK (schedule_pattern IN ('as_needed','once_daily','twice_daily','thrice_daily','custom'))
);
CREATE INDEX self_medications_patient_idx
  ON public.self_medications (patient_user_id, state);

CREATE TABLE public.self_medication_takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES public.self_medications(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_for timestamptz,  -- null for as-needed
  taken_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX self_medication_takes_patient_taken_idx
  ON public.self_medication_takes (patient_user_id, taken_at DESC);
CREATE INDEX self_medication_takes_med_idx
  ON public.self_medication_takes (medication_id, taken_at DESC);
```

**RLS:** Same pattern — patient owns + manages own rows.

### 2.3 `sa_audit_log` widening

No new actions needed — patient self-tracking is patient-private and doesn't touch sa_audit_log (which is god-mode / sensitive-elevation territory). Inserts / updates / deletes on these tables are picked up by the existing trigger-driven `audit_log` (the per-tenant ledger) for completeness.

## 3. Answers to open product calls

1. **Booking — reuse vs stub?** **Reuse.** Scheduling is shipped; `/patient/book` works. The patient workspace just deep-links into it from the home and from the hospitals directory.
2. **Responsive primitives — reuse vs build?** **Reuse the four shipped from scheduling.** No new primitives needed; sheets + bottom action bar + step wizard + mobile tab bar cover every surface in this kickoff.
3. **Care-relationship intent — new table or reuse `primaryFacilityId`?** **Reuse `primaryFacilityId`.** The hospital directory's "Select this hospital" action just updates the column. We surface it consistently as "Your primary hospital" everywhere. (If a richer multi-hospital intent ever lands, the migration is straightforward — add `patient_hospital_relationships` and backfill from `primaryFacilityId`. Don't pre-build for it.)
4. **Self-logged vs clinician-prescribed — distinct tables?** **One table for self-logged** (`personal_health_logs`); clinician-prescribed observations land in a separate table when the clinical module ships (`clinical_observations` or similar — not built here). The boundary is honest because the schema literally separates them.
5. **Reminder dispatcher — SMS / push?** **Out of scope** for this feature, same as scheduling. We store reminder _times_ on `self_medications.schedule_times`, but no Edge Function fires them. UI tells the patient "we'll remind you here" — i.e. the next time they open the app, today's doses appear. The Africa's Talking SMS dispatcher is a separate ticket.
6. **Profile edit scope — what can patients change?** **Phone, address, NoK details, language, notification prefs, conditions.** Identity fields (first/surname/DoB/sex/ID number/patientCode) stay locked — changing those affects identity verification + audit linkage. Captured in the consent centre as "request a change" for the locked ones (deferred to a future surface).
7. **MFA enrolment surface** — show in profile settings as an optional "add two-factor sign-in" CTA pointing to the existing `/onboarding/mfa-setup`. Don't reinvent that flow.

## 4. Out of scope (explicit — flagged at GATE G)

- Africa's Talking SMS / push dispatcher (reminders stored, not sent).
- Clinician-prescribed monitoring (`clinical_observations` table + the "elevate self-tracking → shared monitoring" flow — that's the clinical module).
- Care-team chat / messages (clinical module).
- Multi-hospital care-relationship intent (single `primaryFacilityId` for now).
- Symptom-to-clinician escalation (notes stay personal until a clinician is connected).
- Patient-side encounter detail (records — that's the clinical module).
- Tele-consult video for virtual appointments (only the `type=virtual` flag from scheduling).

## 5. Asks of you before I migrate anything

Please confirm or override. Anything unspoken, I'll proceed with the recommendation.

1. **Schema (§2)** — `personal_health_logs` shape (8 kinds, 2 numeric slots, unit + severity + note); `self_medications` schedule_pattern values (`as_needed | once_daily | twice_daily | thrice_daily | custom`); `self_medication_takes` for adherence. OK?
2. **Care-relationship intent stays as `primaryFacilityId`** (no new table). OK?
3. **Self-tracking is patient-private** (no clinician access from this table) — the "elevate to shared monitoring" lands in the clinical module via a separate `clinical_observations` table. OK?
4. **Reminders stored but not dispatched** (consistent with scheduling). OK?
5. **Profile edit scope** — phone / address / NoK / language / notification prefs / conditions are editable; identity fields locked. OK?
6. **Out-of-scope list (§4)** — anything you want pulled back in?

Once signed off, I'll write migration 0029, redesign the home, then GATE B → G in order.
