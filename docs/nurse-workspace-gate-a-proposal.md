# Nurse Workspace — GATE A Proposal

> **Status: Awaiting Caroline / Usama sign-off + Clinical Safety Officer review of §2.**
> Nothing migrated, deployed, or merged. This is a reviewable design doc consolidating recon + the nursing cadre→capability mapping + supervision/access-basis design + admin-view rules + reuse-vs-stub matrix + open questions.
>
> The §2 cadre→capability matrix is a **clinical-safety artifact** — it gates what an enrolled nurse can do independently vs what routes for senior nurse / nurse-in-charge oversight, and what counts as a high-alert medication that needs extra confirmation. **Please walk through it with a clinician (CSO) before sign-off.**

## 1. What's reuse vs net-new

| Piece                                                                                      | Status                    | Note                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UNMC cadres + grades + roles                                                               | **Reuse**                 | `NURSE` (d08), `MIDWIFE` (d09), `SPECIALIST_NURSE` (d0a) cadres; `ENROLLED` / `REGISTERED` / `SPECIALIST` grades; `NURSE_IM` / `NURSE_SPEC_IM` roles in [reference-data seed 0009](supabase/migrations/0009_reference_data_seed.sql).                                  |
| `staff_affiliations` (cadre + grade + role + department)                                   | **Reuse**                 | Drives nurse scope just as it drives doctor scope.                                                                                                                                                                                                                     |
| MFA-required for clinical roles                                                            | **Reuse**                 | `nurse` already in `MFA_REQUIRED_ROLES`.                                                                                                                                                                                                                               |
| `clinical_supervision` table                                                               | **Reuse**                 | Built for doctors (migration 0030); the supervisor↔supervisee pairing model works identically for enrolled→registered / in-charge nursing supervision.                                                                                                                 |
| `clinical_cosign_policies` + `clinical_cosign_requests`                                    | **Reuse + extend**        | Built for doctors (migration 0030). Extend the `action_kind` CHECK with two nursing actions (`high_alert_med_administration`, `independent_complex_procedure`) and seed default policies for the three nursing cadres. **Additive only — does not alter doctor rows.** |
| `clinical_phi_access_log`                                                                  | **Reuse**                 | Nursing views/decrypts go through the same audited path. The `surface` text column distinguishes nurse vs doctor surfaces.                                                                                                                                             |
| `queue_entries` + `encounters` + `appointments`                                            | **Reuse**                 | Day-view queue rail + arrival/rooming support reuses the doctor scheduling rework.                                                                                                                                                                                     |
| `MedSyncCalendar` + `AppointmentDetailSheet`                                               | **Reuse**                 | Same calendar component the doctor workspace uses.                                                                                                                                                                                                                     |
| Responsive primitives (`ResponsiveSheet`, `BottomActionBar`, `MobileTabBar`, `StepWizard`) | **Reuse**                 | These are exactly what bedside-on-tablet vitals/MAR needs.                                                                                                                                                                                                             |
| Hospital-admin shell pattern + `FEATURE_AREAS` registry                                    | **Reuse as the template** | We build `NurseShell` modelled on `DoctorShell` (which itself mirrors the admin shell). Promoting to a shared shell primitive is a future refactor when the fourth workspace lands; premature now.                                                                     |
| Encryption helper + audited-decrypt pattern (`fetchPatientSummaryAudited`)                 | **Reuse**                 | The nurse-side decrypt helper mirrors the doctor's — same access-basis enforcement, same write to `clinical_phi_access_log`.                                                                                                                                           |

**Net-new in this feature (migration 0031):**

| Table / surface                           | What lands                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nursing_assignments`                     | Patient ↔ nurse pairing for a shift/period (the access basis for "my patients"); ward-scoped. Time-bounded; created by the nurse-in-charge (or hospital admin).                                                                                                                                                                                                                                                                                             |
| `ward_in_charge_assignments`              | Who is currently nurse-in-charge / ward sister for a given ward. Time-bounded; signals the "in-charge" capability layer on top of cadre.                                                                                                                                                                                                                                                                                                                    |
| `clinical_observations`                   | Vitals / nursing observations records. **General clinical observations table** — nurse-recorded today; the seam mentioned in [ADR 0026](docs/adr/0026-patient-workspace-self-tracking.md) for future clinician-prescribed monitoring writes also lands here. Distinct from `personal_health_logs` (patient-private).                                                                                                                                        |
| `medication_administration_records` (MAR) | Administration events — nurse records "I gave X dose of Y at Z time, route R" against an existing prescription. Per the kickoff, **nurses never create prescriptions**; this consumes them. **Today's wrinkle**: the prescriptions table isn't built yet (doctor workspace deferred it). MAR ships with `prescription_id` as a TEXT seam (mirrors `appointments.triggered_by_alert_id`); UI shows an honest empty state until the prescribing engine lands. |
| `shift_handovers`                         | Structured between-shift handover notes per ward — the "what happened on my shift / watch for X" record. Audited; append-only modifications policy.                                                                                                                                                                                                                                                                                                         |
| `app/nurse/*`                             | The workspace itself: shell + my-patients + vitals/observations recording + MAR + alerts (stub) + tasks + handover + in-charge assignment board + supervisees (cadre layers).                                                                                                                                                                                                                                                                               |
| `lib/nurse/*`                             | Scope helper, capability resolver, patient-access helper, observation/MAR query helpers.                                                                                                                                                                                                                                                                                                                                                                    |

**Extension to existing tables (additive — `ALTER TABLE` only on CHECKs):**

- `clinical_cosign_policies.action_kind` CHECK widens to include `high_alert_med_administration`, `independent_complex_procedure`.
- `clinical_cosign_requests.action_kind` CHECK widens to match.
- `sa_audit_log` widens with new audit verbs: `record_observation`, `administer_medication`, `withhold_medication`, `submit_handover`, `assign_patient_to_nurse`, `unassign_patient`, `assign_ward_in_charge`, `escalate_to_medical_team`.

**Honestly stubbed engines** (the workspace surfaces them against an interface + honest empty-state panel):

- Monitoring alerts engine — same seam as doctor workspace; surfaces an empty alerts panel.
- Care-team coordination tables — same seam as doctor workspace; nursing notes flow into the future shared per-patient workspace.
- Real prescriptions / orders engine — clinical module. MAR ships with the safety scaffold (administration + 5-rights + high-alert co-sign) wired against a placeholder prescription seam.
- Notification dispatcher — reminders / handover notifications stored, not dispatched.

## 2. Nursing cadre → capability mapping (the clinical-safety artifact)

> **Please read this with a clinician (CSO) before signing off. This is the core medically-consequential decision for nursing.**

Capabilities are sorted into three tiers per cadre. Server-enforced — RLS + Edge Function checks, not just hidden in the UI.

| Capability                                                                         | Enrolled        | Registered           | Specialist / Nursing Officer | + In-Charge overlay¹ |
| ---------------------------------------------------------------------------------- | --------------- | -------------------- | ---------------------------- | -------------------- |
| **View own assigned patients + ward census** (per access basis §4)                 | ✅              | ✅                   | ✅                           | ✅ + see all on ward |
| **View patient summary + decrypt PHI** for assigned (audited)                      | ✅              | ✅                   | ✅                           | ✅                   |
| **Record routine vitals / observations** (BP, HR, T, RR, SpO₂, glucose, pain, I/O) | ✅              | ✅                   | ✅                           | ✅                   |
| **Record specialty observation sets** (ICU bundle, partograph, neuro obs)          | 🚫              | ✅ within scope      | ✅                           | ✅                   |
| **Administer — routine medication**                                                | ✅              | ✅                   | ✅                           | ✅                   |
| **Administer — high-alert medication²**                                            | 🟠 **co-sign**³ | ✅ (single-RN check) | ✅                           | ✅                   |
| **Withhold a dose** (with reason; audited)                                         | ✅              | ✅                   | ✅                           | ✅                   |
| **Perform complex independent procedure**⁴                                         | 🚫 **blocked**  | 🟠 **co-sign**³      | ✅                           | ✅                   |
| **Escalate to medical team** (urgent call / page)                                  | ✅              | ✅                   | ✅                           | ✅                   |
| **Be the primary nurse** for a patient                                             | 🚫              | ✅                   | ✅                           | ✅                   |
| **Submit shift handover**                                                          | ✅              | ✅                   | ✅                           | ✅                   |
| **Assign / reassign patients to nurses on shift**                                  | 🚫              | 🚫                   | 🚫                           | ✅                   |
| **Assign ward-in-charge for a shift**                                              | 🚫              | 🚫                   | 🚫                           | 🚫 (hospital admin)  |
| **Co-sign / approve an enrolled nurse's flagged action**                           | 🚫              | ✅ (same ward)       | ✅                           | ✅                   |
| **See "review queue" + supervisees view**                                          | 🚫              | partial⁵             | partial⁵                     | ✅ (ward queue)      |

**Legend:** ✅ allowed independently · 🟠 routes through `clinical_cosign_requests` (takes effect on approval) · 🚫 blocked server-side (UI shows respectful "above your current scope — please ask <senior>")

**Footnotes — each is a decision I want CSO confirmation on:**

¹ **The "in-charge overlay" is NOT a cadre.** It's a current `ward_in_charge_assignments` row that layers ward-management capabilities on top of the nurse's actual cadre (typically REGISTERED+). A registered nurse is the in-charge today; tomorrow it's another nurse on the same ward. This avoids inventing a cadre that doesn't exist in UNMC.

² **High-alert medications.** Per ISMP guidance + Ugandan formulary practice the default high-alert list seeds: **insulin, anticoagulants (heparin, warfarin), opioids (morphine, pethidine, fentanyl), concentrated electrolytes (KCl, MgSO₄ > 20%), oxytocics (oxytocin, ergometrine), neuromuscular blockers, chemotherapy, paediatric IV calculations**. This list is hospital-configurable (per-ward override possible) but defaults across every hospital on first run. Surface lives in a separate `high_alert_medications` reference list that the MAR consults; out-of-scope for migration 0031 — flagged for the prescribing engine to ship together. For migration 0031 we ship the **policy mechanism** (co-sign on `high_alert_med_administration`) without the formulary; high-alert classification is a TEXT flag on the MAR row that the future prescribing engine populates.

³ **Single-RN check vs two-RN co-sign.** Default for enrolled-nurse high-alert admin: **co-sign required** (a registered nurse on the same ward witnesses + approves; recorded as a `clinical_cosign_requests` row). Default for registered: **single-RN check** (the form requires a second confirmation step but no co-sign row). Hospitals can override per ward.

⁴ **"Complex independent procedure"** is a broad bucket (e.g. catheterisation, blood transfusion start, NG tube insertion). The MVP scopes it as a coarse boolean: when the future procedures-catalogue lands, this can become per-procedure granularity. For now: enrolled is blocked, registered routes for co-sign, specialist runs independently.

⁵ **Registered + specialist supervisees view.** A registered nurse who is paired (via `clinical_supervision`) with one or more enrolled nurses sees their pairs + any co-sign requests they raised. The full ward review queue is the in-charge's surface.

**Where each layer enforces:**

1. **Server-side**: Edge Functions for sensitive actions (`record-observation`, `administer-medication`, `escalate-to-medical-team`, `assign-patient-to-nurse`) read the nurse's cadre + active policy + ward + patient assignment, then either execute, create a `clinical_cosign_requests` row, or refuse with a respectful error.
2. **RLS**: read-side scope (my-patients / ward census queries) is RLS-enforced — a nurse only sees rows for patients matching their access basis (§4).
3. **UI**: the capability map drives what surfaces / actions render at all (no point showing a button for something blocked). Third layer, not the first.

## 3. Supervision model

**Reuse `clinical_supervision` from migration 0030.** Same schema; same primary/backup; same fallback. The nursing semantics:

- Enrolled nurses are paired with a primary registered nurse (or specialist) in the same ward.
- Registered nurses are paired with the ward in-charge for escalation visibility.
- A nurse can be both supervisee (under another nurse) and supervisor (over a more junior nurse) — the table already supports this naturally.

**Who pairs?** Defaults to the **ward in-charge** for their ward (existing capability on the in-charge overlay). The hospital admin can also pair via the existing admin staff surfaces. Pairing is time-bounded so nurses rotating between wards aren't carrying stale pairings.

**Fallback for missing pairing:** an enrolled nurse with no current primary supervisor routes flagged actions to **any registered nurse currently in-charge of the ward**. The UI is explicit about it.

## 4. Patient access basis (RLS)

The doctor workspace defined three legitimate bases (care-team / active-encounter / department-recent). For nurses the right bases are **different** — nurses don't carry encounters the way doctors do, and "department-recent 30d" is too loose for nursing (a nurse on shift today shouldn't read every patient seen in the dept this month).

**Proposal: four legitimate access bases, OR-combined, RLS-enforced.**

A nurse may read a patient's clinical data if **any** of:

1. **Assigned-patient** — current `nursing_assignments` row pairs the patient with the nurse (the everyday case).
2. **Ward census** — patient has an active admission / encounter / appointment in the nurse's `ward_id` today, AND the nurse is currently on shift on that ward (see Q-A2 below).
3. **In-charge** — the nurse holds a current `ward_in_charge_assignments` row for the ward where the patient is. (Ward sister sees everyone on the ward.)
4. **Care-team** — the future care-team module's pairing (seam; same as the doctor's `care_team` basis).

**Same audit-on-read** (`clinical_phi_access_log`) — every successful decrypt writes a row, distinguishing nurse `surface` values (`my_patients_panel`, `ward_census`, `mar_screen`, `observation_form`, `handover_view`).

**Crucial nuance:** "department-recent 30d" is NOT a nursing basis. Wrong tool for the cadre — nurses work shift-by-shift, not in 30-day windows. Doctors keep that basis (cross-cover / ward rounds).

**Asks at sign-off:**

- (Q-A1) Four-basis OR — agree, or do you want admission-only (drop appointment/encounter from ward-census)?
- (Q-A2) Ward-census basis depends on "nurse is currently on shift on that ward." Today we **don't have a shift-tracking table**. Two options for MVP:
  - **(a)** Treat any active `nursing_assignments` row as "on shift" (good enough for assigned patients but doesn't grant ward-census unless explicitly assigned).
  - **(b)** Treat any active `staff_affiliations` row + a ward column on it as "on shift" (cheap, less precise).
  - **(c)** Ship a thin `ward_shifts` table now (nurse_user_id, ward_id, starts_at, ends_at).
  - **My recommendation: (a) for MVP** — the assignment IS the shift signal; ward sisters get full ward via the in-charge basis. A real shift table lands when staffing/rostering ships.

## 5. Hospital admin & superadmin access to the nurse workspace

The kickoff §0 is explicit that **admin gets view rights, not clinical-action rights**. Defining exactly what that means:

**Hospital admin can view (read-only):**

- The **nursing roster** for their hospital — who's on which ward, cadre, in-charge status, current supervisees.
- **Aggregate nursing dashboard** — patients per nurse, ward staffing, pending oversight requests, observation/MAR throughput counts (no PHI in aggregates).
- A specific nurse's **assignment board** (which patients they're currently paired to) — for staffing troubleshooting. Audited.

**Hospital admin CANNOT (clinical-action-free):**

- Record an observation, administer a med, withhold a dose, submit handover, escalate to medical team, assign/reassign patients. The Edge Functions reject calls from `hospital_admin` for these actions (no role bypass).
- Read a patient's clinical record AT WILL. Admin reading PHI still requires patient access basis (per ADR 0028 — admin isn't a clinician). If admin needs PHI for troubleshooting, that's a break-glass action (separate flow, separate audit).

**Superadmin:** no new path. Existing god-mode / break-glass via `sa_audit_log` — loud and rare. Aggregates only for routine views.

**Asks at sign-off:**

- (Q-V1) The "view a specific nurse's assignment board" capability — is the nurse's identity/structural data sufficient for admin's view (cadre, ward, # of patients), OR does the admin also need to see the patient _codes_ in the assignment? Patient codes alone are not PHI but they're identifying-ish. My recommendation: **codes are fine** (admin already sees them in the appointments overview); decrypted names stay gated.

## 6. Schema additions — migration 0031

Five new tables. All additive. Per-tenant audit triggers attached.

### 6.1 `nursing_assignments`

```sql
CREATE TABLE public.nursing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  ward_id uuid REFERENCES public.hospital_wards(id) ON DELETE CASCADE,
    -- ward_id null = department-level assignment (e.g. OPD nurse w/o ward)
  department_id uuid NOT NULL
    REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
  nurse_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship_kind text NOT NULL DEFAULT 'primary',
    -- 'primary' (the patient's primary nurse this shift) | 'cover'
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
    -- null = open assignment ending at next ward-in-charge reassignment
  assigned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT na_kind_check CHECK (relationship_kind IN ('primary','cover')),
  CONSTRAINT na_time_order CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX nursing_assignments_nurse_active_idx
  ON public.nursing_assignments (nurse_user_id, starts_at DESC)
  WHERE ends_at IS NULL;
CREATE INDEX nursing_assignments_patient_active_idx
  ON public.nursing_assignments (patient_user_id, starts_at DESC)
  WHERE ends_at IS NULL;
CREATE INDEX nursing_assignments_ward_active_idx
  ON public.nursing_assignments (ward_id, starts_at DESC)
  WHERE ends_at IS NULL;
```

### 6.2 `ward_in_charge_assignments`

```sql
CREATE TABLE public.ward_in_charge_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.hospital_wards(id) ON DELETE CASCADE,
  nurse_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  set_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wic_time_order CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
-- One active in-charge per ward at a time (partial unique).
CREATE UNIQUE INDEX ward_in_charge_one_active
  ON public.ward_in_charge_assignments (ward_id) WHERE ends_at IS NULL;
```

### 6.3 `clinical_observations`

```sql
CREATE TABLE public.clinical_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  recorded_by_user_id uuid NOT NULL REFERENCES auth.users(id),

  observation_kind text NOT NULL,
    -- 'bp' | 'hr' | 'temperature' | 'rr' | 'spo2' | 'glucose' | 'pain'
    -- | 'weight' | 'height' | 'intake' | 'output' | 'gcs' | 'other'
  numeric_value_1 numeric,
  numeric_value_2 numeric,
  unit text,
  pain_scale text,                  -- 'nrs_0_10' | 'wong_baker' | 'flacc'
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now(),

  -- Soft-delete (per-row, audited via trigger).
  state text NOT NULL DEFAULT 'active',
    -- 'active' | 'corrected' (the row is superseded by another)
  corrected_by_observation_id uuid REFERENCES public.clinical_observations(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT obs_kind_check CHECK (observation_kind IN (
    'bp','hr','temperature','rr','spo2','glucose','pain',
    'weight','height','intake','output','gcs','other'
  )),
  CONSTRAINT obs_state_check CHECK (state IN ('active','corrected'))
);
CREATE INDEX clinical_observations_patient_kind_idx
  ON public.clinical_observations (patient_user_id, observation_kind, recorded_at DESC);
CREATE INDEX clinical_observations_recorded_by_idx
  ON public.clinical_observations (recorded_by_user_id, recorded_at DESC);
```

**Why a SEPARATE table from `personal_health_logs`:** patient self-tracked vs clinician-recorded are legally + ethically different — different RLS, different audit semantics, different downstream uses. ADR 0026 reserved this distinction. This table is the landing zone.

### 6.4 `medication_administration_records`

```sql
CREATE TABLE public.medication_administration_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  administered_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  cosigned_by_user_id uuid REFERENCES auth.users(id),

  -- Prescription seam: text until the prescribing engine lands.
  -- The MAR row carries a payload snapshot so it's self-contained for
  -- read even before the prescriptions table exists.
  prescription_id text,
  drug_name text NOT NULL,
  dose text NOT NULL,
  route text NOT NULL,
    -- 'oral' | 'iv' | 'im' | 'sc' | 'topical' | 'inhaled' | 'pr' | 'other'
  is_high_alert boolean NOT NULL DEFAULT false,

  state text NOT NULL,
    -- 'administered' | 'withheld' | 'refused' | 'wasted'
  withheld_reason text,
  scheduled_for timestamptz,
  administered_at timestamptz NOT NULL DEFAULT now(),
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mar_state_check CHECK (state IN
    ('administered','withheld','refused','wasted')),
  CONSTRAINT mar_route_check CHECK (route IN
    ('oral','iv','im','sc','topical','inhaled','pr','other')),
  CONSTRAINT mar_withheld_reason CHECK (
    (state = 'administered') OR (withheld_reason IS NOT NULL)
  ),
  CONSTRAINT mar_cosign_if_high_alert_enrolled CHECK (
    -- Enforced server-side; the CHECK here is documentation. Real
    -- enforcement: the administer-medication Edge Function reads the
    -- nurse's cadre + cosign policy.
    true
  )
);
CREATE INDEX mar_patient_idx
  ON public.medication_administration_records (patient_user_id, administered_at DESC);
CREATE INDEX mar_administered_by_idx
  ON public.medication_administration_records (administered_by_user_id, administered_at DESC);
```

### 6.5 `shift_handovers`

```sql
CREATE TABLE public.shift_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.hospital_wards(id) ON DELETE CASCADE,
  submitted_by_user_id uuid NOT NULL REFERENCES auth.users(id),

  shift_label text NOT NULL,
    -- 'day' | 'evening' | 'night' | 'custom'
  summary text NOT NULL,
    -- Free-text "the watch" — what to know going into the next shift.
  patients_of_concern jsonb,
    -- Optional structured pointer: [{patient_user_id, concern, action_due}]
  submitted_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sh_shift_label_check CHECK (shift_label IN
    ('day','evening','night','custom'))
);
CREATE INDEX shift_handovers_ward_recent_idx
  ON public.shift_handovers (ward_id, submitted_at DESC);
```

### 6.6 `clinical_cosign_policies` widening

```sql
ALTER TABLE public.clinical_cosign_policies
  DROP CONSTRAINT IF EXISTS cosign_policy_action_check;
ALTER TABLE public.clinical_cosign_policies
  ADD CONSTRAINT cosign_policy_action_check CHECK (action_kind IN (
    'prescription_routine','prescription_controlled',
    'order_high_cost_imaging','admit_patient','discharge_patient',
    -- New (nursing)
    'high_alert_med_administration','independent_complex_procedure'
  ));

-- Mirror on clinical_cosign_requests.
-- (Same shape; omitted here for brevity.)
```

And seed default policy rows for `NURSE` / `MIDWIFE` / `SPECIALIST_NURSE` cadres for every active hospital (mirroring the migration 0030 seed pattern):

| Cadre × grade                                 | `high_alert_med_administration` | `independent_complex_procedure` |
| --------------------------------------------- | ------------------------------- | ------------------------------- |
| `NURSE` (ENROLLED)                            | `cosign_required`               | `blocked`                       |
| `NURSE` (REGISTERED) / `MIDWIFE` (REGISTERED) | `allowed`                       | `cosign_required`               |
| `SPECIALIST_NURSE`                            | `allowed`                       | `allowed`                       |
| `MIDWIFE` (ENROLLED)                          | `cosign_required`               | `blocked`                       |

(Cadre grades aren't first-class on `clinical_cosign_policies` today — policy is keyed by `cadre_code`. The grade-level distinction inside `NURSE` will be enforced in the application layer by reading `staff_affiliations.cadre_grade_id`. Flagged as a possible future extension if the granularity proves too coarse.)

## 7. Engine status — reuse vs honest stub

| Engine                                   | Status                     | What we ship                                                                                                                                                              |
| ---------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cadre catalog + grades                   | **Built**                  | Reused.                                                                                                                                                                   |
| Supervision (`clinical_supervision`)     | **Built** (migration 0030) | Reused for nursing.                                                                                                                                                       |
| Co-sign workflow (`clinical_cosign_*`)   | **Built + extended**       | Two new `action_kind` values seeded per hospital.                                                                                                                         |
| Scheduling + queue + encounters          | **Built**                  | Day-view queue rail on the nurse surface reuses what the doctor surface uses.                                                                                             |
| Calendar component                       | **Built**                  | Reused for nurse's ward day view.                                                                                                                                         |
| Detail sheet (`AppointmentDetailSheet`)  | **Built**                  | Reused.                                                                                                                                                                   |
| PHI encryption + audited decrypt pattern | **Built**                  | Nurse helper mirrors doctor's.                                                                                                                                            |
| Monitoring / alerts                      | **NOT built**              | Alerts panel renders honest empty state; nurse-recorded vitals still flow into `clinical_observations` (the future alert engine reads from here).                         |
| Care-team coordination tables            | **NOT built**              | Nursing notes for now land as `shift_handovers` entries; the per-patient care-team feed lands when the clinical module ships.                                             |
| Prescriptions / orders                   | **NOT built**              | MAR ships with `prescription_id` as TEXT seam + an empty state ("no active orders"). The cosign safety scaffold (`high_alert_med_administration`) is in place end-to-end. |
| Notification dispatcher                  | **NOT built**              | Same seam as doctor / patient workspaces — stored, not sent.                                                                                                              |

## 8. Shell decision — `/nurse/*`

**Proposal: `/nurse/*` — net-new sibling to `/clinician/*` and `/doctor/*`.**

The doctor workspace established `/doctor/*` as the cadre-specific UMDPC root. The same logic for UNMC: `/nurse/*` for nursing/midwifery cadres. Sign-in routing extends: `staff_affiliations.cadres.code IN (NURSE, MIDWIFE, SPECIALIST_NURSE)` → `/nurse`. Other clinical cadres (doctors, pharmacists, lab techs) take their own roots.

The existing `/clinician/availability` + `/clinician/schedule` remain as universal scheduling surfaces (the kickoff still applies — nurses may use them today; the nurse workspace deep-links into them rather than rebuilding).

## 9. Out of scope (explicit — flagged at GATE G)

- High-alert medication formulary (`high_alert_medications` reference list) — lands with the prescribing engine.
- Real prescriptions / orders + drug catalog + interaction checks — clinical module.
- Per-procedure granularity on "complex procedure" co-sign — needs a procedures catalogue.
- Real ward shift / rostering system (today: assignment IS the shift signal).
- Care-team coordination tables (the structured per-patient feed) — clinical module.
- Monitoring engine + real alerts + alarm-fatigue throttling — separate build.
- Notification dispatcher (push + SMS).
- Pharmacy queue integration.
- HOD-of-nursing department-leadership surfaces — separate hospital-admin build.
- Workspace switcher for multi-affiliation nurses (today: pin to most-recent-active).
- Patient-discoverable PHI access log (in the patient consent centre) — separate gate.

## 10. Asks of you (and the Clinical Safety Officer) before I migrate anything

**Clinical-safety (CSO sign-off requested):**

1. **The §2 cadre→capability map** — particularly the five footnoted decisions: (i) in-charge as an overlay not a cadre; (ii) the high-alert default list; (iii) co-sign vs single-RN check defaults; (iv) coarse-bucket "complex procedure"; (v) supervisees-view scope for registered/specialist.
2. **Supervision (§3)** — reuse `clinical_supervision`; pairing by ward in-charge with department-fallback. OK?
3. **Patient access basis (§4)** — four OR-combined bases (assigned / ward-census / in-charge / care-team-stub). Confirm choice on Q-A2 (ward-census basis derives shift signal from `nursing_assignments`).
4. **Admin/superadmin view rights (§5)** — view-only structural for admin (no clinical actions, no casual PHI); superadmin unchanged. Confirm Q-V1 (patient codes visible to admin viewing the nurse assignment board).

**Schema:** 5. **Five new tables (§6)** — `nursing_assignments`, `ward_in_charge_assignments`, `clinical_observations`, `medication_administration_records`, `shift_handovers`. Two new `action_kind` values on `clinical_cosign_policies`. Default policy seed for nursing cadres. OK? 6. **MAR prescription seam as TEXT** (mirrors `appointments.triggered_by_alert_id`) — clear, honest empty state until prescribing ships. OK?

**Shell + reuse:** 7. **`/nurse/*` as the root**, sibling to `/doctor`. OK? 8. **Honest stubs** for monitoring + care-team coordination + real prescriptions, **with the MAR + cosign safety scaffold shipped end-to-end** — confirms the cadre enforcement works against a real workflow. OK?

**Scope:** 9. **Out-of-scope list (§9)** — anything you want pulled back in?

Once signed off, I'll write migration 0031 (5 tables + 2 CHECK widens + nursing cadre policy seed), then GATE B → G in order.
