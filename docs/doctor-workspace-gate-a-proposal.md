# Doctor Workspace — GATE A Proposal

> **Status: Awaiting Caroline / Usama sign-off + Clinical Safety Officer review of §2.**
> Nothing migrated, deployed, or merged. This is a reviewable design doc consolidating recon + the cadre→capability mapping + supervision/access-basis design + reuse-vs-stub matrix + open questions.
>
> The cadre→capability mapping (§2) is a **clinical-safety artifact** — it gates what an intern can do independently vs what routes for senior co-sign. Please walk through it with a clinician before sign-off.

## 1. What's reuse vs net-new

| Piece                                                                                                       | Status                    | Note                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cadre catalog (UMDPC / AHPC / UNMC / Pharmacy Board)                                                        | **Reuse**                 | `cadres`, `cadre_grades`, `roles`, `councils` in [reference-data.ts](db/schema/reference-data.ts). INTERN_DOCTOR, MEDICAL_OFFICER, MEDICAL_OFFICER_SG, CONSULTANT seeded in [migration 0009](supabase/migrations/0009_reference_data_seed.sql).                                                                                                                                                                          |
| `staff_affiliations` (cadre + role + department)                                                            | **Reuse**                 | Has `cadreId`, `cadreGradeId`, `roleId`, `specialtyId`, `departmentId`, `hospitalId`, `state` — everything we need to derive scope.                                                                                                                                                                                                                                                                                      |
| Clinician scope helper                                                                                      | **Reuse**                 | [lib/clinician/scope.ts](lib/clinician/scope.ts) — pins to most-recent active affiliation; enforces auth + AAL2. We extend it to expose `cadreCode + roleCode + capabilities` (computed).                                                                                                                                                                                                                                |
| Hospital-admin shell (sidebar + ⌘K + scope provider + FEATURE_AREAS registry)                               | **Reuse as the template** | [hospital-shell.tsx](app/hospital-admin/_components/hospital-shell.tsx) + [features.ts](app/hospital-admin/_lib/features.ts). We build `DoctorShell` + `DoctorFeatureAreas` modelled on it. **Not a copy-paste** — separate component because the auth basis, the scope shape, and the sidebar items differ. (Promoting to a shared shell primitive is a future refactor when the third workspace lands; premature now.) |
| MFA-required for clinical roles                                                                             | **Reuse**                 | `MFA_REQUIRED_ROLES` already includes `clinician`. Doctor workspace inherits.                                                                                                                                                                                                                                                                                                                                            |
| PHI encryption library                                                                                      | **Reuse**                 | [lib/encryption.ts](lib/encryption.ts). Per §5, we add an **audited-decrypt helper** for clinician reads (separate from `fetchPatientProfileView` which is patient-scoped).                                                                                                                                                                                                                                              |
| Audit infrastructure (`audit_log` + `audit_log_changes()` trigger; `sa_audit_log` for sensitive elevations) | **Reuse**                 | Per-tenant ledger captures every write. PHI access audit (read) is the new addition (see §5).                                                                                                                                                                                                                                                                                                                            |
| Scheduling (availability, appointments, encounters seam, urgent-from-alert)                                 | **Reuse**                 | Migration 0028. The doctor schedule surface deep-links into the existing `/clinician/schedule` view.                                                                                                                                                                                                                                                                                                                     |
| Encounter row                                                                                               | **Reuse the seam**        | Minimal table (id + appointment + state). The doctor workspace can **open / mark-arrived / start** encounters; SOAP notes / clinical documentation are NOT in scope here — that's the clinical/EMR module.                                                                                                                                                                                                               |

**Net-new in this feature (migration 0030):**

| Surface / table            | What lands                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clinical_supervision`     | Per-affiliation supervisor pairing (intern → consultant in the same hospital, per department, time-bounded). Supports the "who is my supervisor?" + "who are my supervisees?" surfaces.           |
| `clinical_cosign_policies` | Per-hospital (with optional per-department override) policy rows defining **which action types require senior co-sign** for which junior cadres. Policy-driven, not hardcoded.                    |
| `clinical_cosign_requests` | Each flagged action by a junior creates a row; the supervisor (or any senior in the cadre+department) approves / returns-with-feedback. Every transition is audited.                              |
| `clinical_phi_access_log`  | Append-only "who viewed which patient's PHI, when, why" log. Patient-access basis recorded per read. Distinct from `audit_log` (which is row-mutation, not row-read).                             |
| `app/doctor/*`             | The workspace itself: shell + patient panel + alerts (stub) + care team (stub) + schedule (deep-link) + encounters (route) + prescribing (stub w/ co-sign skeleton) + tasks/inbox + cadre layers. |
| `lib/doctor/*`             | Scope helper, capability resolver (cadre→capability), supervision helpers, co-sign helpers, PHI-access helper.                                                                                    |

**Honestly stubbed engines** (the workspace surfaces them against an interface + an empty-state panel; nothing fabricated):

- Monitoring / alerts — no engine, no data. The Alerts surface is a panel with "monitoring connects here once the engine ships" + a clear seam at `lib/doctor/alerts.ts` exposing the future contract.
- Care-team coordination — no tables. The Care-Team surface is a per-patient panel with "the care-team workspace lands with the clinical module" + a seam.
- Prescribing & orders — no `prescriptions` / `lab_orders` / `imaging_orders` tables. We ship the **co-sign skeleton** (table + flow) so the clinical-safety mechanism is in place; the actual prescribe-a-drug form is the clinical module's job.
- SOAP notes / encounter documentation — clinical module.

The doctor workspace's job is to be **the operating console + the cadre+supervision+co-sign safety scaffold** — not to build the EMR.

## 2. Cadre → capability mapping (the clinical-safety artifact)

> **Please read this with a clinician before signing off. This is the core medically-consequential decision.**

Capabilities are sorted into three tiers per cadre. Server-enforced — RLS + Edge Function role checks, not just hidden in the UI.

| Capability                                                        | Intern / JHO    | Clinical Officer  | Medical Officer                | MOSG / Consultant          |
| ----------------------------------------------------------------- | --------------- | ----------------- | ------------------------------ | -------------------------- |
| **View own patient panel** (per access basis §4)                  | ✅              | ✅                | ✅                             | ✅                         |
| **View patient summary + decrypt PHI** for own patients (audited) | ✅              | ✅                | ✅                             | ✅                         |
| **Acknowledge a monitoring alert** for own patient                | ✅              | ✅                | ✅                             | ✅                         |
| **Participate in care-team thread** (post, @mention)              | ✅              | ✅                | ✅                             | ✅                         |
| **Start / progress / end an encounter** for an assigned patient   | ✅              | ✅                | ✅                             | ✅                         |
| **Set own availability** (scheduling)                             | ✅              | ✅                | ✅                             | ✅                         |
| **Prescribe — routine (within UMDPC/AHPC scope)**                 | 🟠 **co-sign**  | 🟠 **co-sign**¹   | ✅                             | ✅                         |
| **Prescribe — controlled substances / Class A**                   | 🚫 **blocked**² | 🚫 **blocked**²   | 🟠 **co-sign**³                | ✅                         |
| **Order routine labs / imaging**                                  | ✅              | ✅                | ✅                             | ✅                         |
| **Order high-cost / specialist imaging** (CT, MRI)                | 🟠 co-sign      | 🟠 co-sign        | ✅                             | ✅                         |
| **Admit a patient**                                               | 🟠 co-sign      | 🟠 co-sign        | ✅                             | ✅                         |
| **Discharge a patient**                                           | 🟠 co-sign      | 🟠 co-sign        | ✅                             | ✅                         |
| **Be the care-team primary**                                      | 🚫              | ✅ (within scope) | ✅                             | ✅                         |
| **Be invited as the specialist on a care team**                   | 🚫              | 🚫                | 🚫                             | ✅                         |
| **Co-sign / approve a junior's flagged action**                   | 🚫              | 🚫                | ✅ (for interns in same dept)⁴ | ✅                         |
| **See "my supervisees" view + review queue**                      | 🚫              | 🚫                | partial⁴                       | ✅                         |
| **Specialty-clinic scheduling templates**                         | 🚫              | 🚫                | 🚫                             | ✅ (if role has specialty) |

**Legend:**

- ✅ = full capability, independent
- 🟠 = action allowed but routes through `clinical_cosign_requests`; takes effect only after a senior approves
- 🚫 = blocked server-side (UI shows respectful "above your current scope — please ask <supervisor>" message)

**Footnotes** (each is an explicit decision I want to confirm at sign-off):

¹ **CO routine prescribing co-sign default = ON.** Real Ugandan practice varies — some lower-level facilities expect COs to prescribe independently; at hospital level a co-sign is common. Default ON is safer; the policy row lets a hospital flip it OFF per department.

² **Interns + COs blocked from controlled-substance prescribing entirely (not just co-sign).** Reasoning: controlled substances need direct senior involvement, not async approval. They can _initiate a request to_ a senior (a different flow); they can't author the prescription.

³ **MO co-sign for controlled substances by default.** Some hospitals will want this OFF for MOs; the policy row supports.

⁴ **MO supervisory scope.** MOs can supervise interns within their own department (a real practice), but typically don't supervise other MOs. The "supervisees" view for an MO shows only interns they're paired to.

**Configurability**: every "co-sign / blocked / allowed" cell is the default. Hospitals can override per-department via `clinical_cosign_policies` rows (admin-only). The defaults are what ship; overrides are a hospital admin job.

**Where it's enforced:**

1. **Server-side**: Edge Functions for sensitive actions (`doctor-create-prescription`, `doctor-admit-patient`, etc.) read the doctor's cadre + the active policy + the patient's department, and either execute, create a `clinical_cosign_requests` row, or refuse with a respectful error.
2. **RLS**: read-side scope (patient panel queries) is RLS-enforced — a doctor only sees rows for patients matching their access basis (§4).
3. **UI**: the capability map drives what surfaces / actions render at all (no point showing a button for something blocked). UI is the third layer, not the first.

## 3. Supervision model

**Proposal: explicit pairing, time-bounded, per-hospital.**

```sql
CREATE TABLE public.clinical_supervision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  supervisee_affiliation_id uuid NOT NULL
    REFERENCES public.staff_affiliations(id) ON DELETE CASCADE,
  supervisor_affiliation_id uuid NOT NULL
    REFERENCES public.staff_affiliations(id) ON DELETE CASCADE,
  -- 'primary' is the named supervisor (shows on the intern's home);
  -- 'backup' is who the system falls back to when the primary is off.
  relationship_kind text NOT NULL DEFAULT 'primary',
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  notes text,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT supervision_kind_check
    CHECK (relationship_kind IN ('primary','backup')),
  CONSTRAINT supervision_self_pair_check
    CHECK (supervisee_affiliation_id <> supervisor_affiliation_id),
  CONSTRAINT supervision_date_order
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
```

**Who pairs?** The HOD or hospital admin does it (it's a staff-management action). Default UX: when an intern's affiliation is approved, the hospital admin is prompted to pair them with a primary supervisor in the same department before the intern can act on flagged tasks.

**Fallback**: if a junior has no current primary supervisor (gap, transition), their flagged actions route to **any consultant in their department**. The UI is explicit: "no primary supervisor assigned — any consultant in <department> can review."

**Why explicit pairing (vs department-derived)?**

- Department-derived ("any consultant in your department reviews") is simpler but **loses the named-supervisor relationship** that's genuinely important for teaching + accountability + the intern's wellbeing.
- We get the best of both: explicit pairing is the source of truth; department fallback handles gaps without blocking work.

**Asks at sign-off:**

- (Q-S1) Are we OK with HOD/hospital-admin doing the pairing, or do you want a different actor?
- (Q-S2) Should backup pairings be required or optional?
- (Q-S3) Should the intern be notified when their supervisor changes?

## 4. Patient access basis (RLS)

> The most consequential read-side decision in this build. **"Any doctor sees any patient at the hospital" is wrong** (the kickoff makes this explicit). We need a definition that's tight enough to be defensible and loose enough not to block legitimate care.

**Proposal: three legitimate access bases, OR-combined, RLS-enforced.**

A doctor at hospital H may read a patient P's clinical data if **any** of:

1. **Care-team member** — the doctor is on `patient_care_team_members` for P (table arrives with the care-team module; today's stub is the seam).
2. **Active encounter** — there is a non-completed `encounters` row with `clinician_user_id = doctor` AND `patient_user_id = P`.
3. **Department patient** — P has an appointment / encounter / admission at the doctor's `department_id` within the last 30 days (configurable per hospital). This is the "I'm on the IM team, I can see IM patients" case — necessary for ward rounds + cross-cover.

**Audit on read**: every patient-row decryption writes a row to `clinical_phi_access_log`:

```sql
CREATE TABLE public.clinical_phi_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  clinician_user_id uuid NOT NULL REFERENCES auth.users(id),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id),
  access_basis text NOT NULL,
    -- 'care_team' | 'active_encounter' | 'department_recent' | 'break_glass'
  request_id uuid,                         -- from app.request_id GUC
  surface text,                            -- e.g. 'patient_summary_panel'
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phi_access_basis_check
    CHECK (access_basis IN ('care_team','active_encounter','department_recent','break_glass'))
);
CREATE INDEX phi_access_patient_idx
  ON public.clinical_phi_access_log (patient_user_id, created_at DESC);
CREATE INDEX phi_access_clinician_idx
  ON public.clinical_phi_access_log (clinician_user_id, created_at DESC);
```

Append-only (REVOKE UPDATE/DELETE from authenticated). Patient-discoverable later ("who viewed my record?" surface in the patient consent centre — separate ticket).

**Break-glass is out of scope here** but the schema reserves the `'break_glass'` enum value so we don't have to migrate later when the break-glass flow ships.

**Asks at sign-off:**

- (Q-A1) Is the 30-day "department patient" window correct, or should it be tighter (7? 14?) or per-hospital-policy?
- (Q-A2) Is OR over the three bases correct, or do you want AND for some combinations?
- (Q-A3) Should patient PHI access be surfaced to the patient immediately in their consent centre (today's placeholder), or is that a separate gate?

## 5. Co-sign request table (the workflow object)

```sql
CREATE TABLE public.clinical_cosign_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  requested_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  requested_by_affiliation_id uuid NOT NULL
    REFERENCES public.staff_affiliations(id),
  requested_by_cadre_code text NOT NULL,

  -- What kind of action is being co-signed?
  action_kind text NOT NULL,
    -- 'prescription_routine' | 'prescription_controlled' |
    -- 'order_high_cost_imaging' | 'admit_patient' | 'discharge_patient'
  action_payload jsonb NOT NULL,
    -- Self-contained snapshot of the proposed action — drug name +
    -- dose + route + duration, or admission ward + reason, etc. So
    -- the supervisor can review without joining 6 tables.

  state text NOT NULL DEFAULT 'pending_review',
    -- pending_review | approved | returned | cancelled | expired
  reviewed_by_user_id uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text,

  expires_at timestamptz,                -- escalation timer
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cosign_state_check CHECK (state IN
    ('pending_review','approved','returned','cancelled','expired')),
  CONSTRAINT cosign_action_kind_check CHECK (action_kind IN (
    'prescription_routine','prescription_controlled',
    'order_high_cost_imaging','admit_patient','discharge_patient'
  ))
);
CREATE INDEX cosign_reviewer_queue_idx
  ON public.clinical_cosign_requests (hospital_id, state, created_at)
  WHERE state = 'pending_review';
CREATE INDEX cosign_requester_idx
  ON public.clinical_cosign_requests (requested_by_user_id, created_at DESC);
CREATE INDEX cosign_patient_idx
  ON public.clinical_cosign_requests (patient_user_id, created_at DESC);
```

**Flow:**

1. Junior triggers a flagged action via the workspace UI.
2. Edge Function (`doctor-request-cosign`) reads cadre + active policy + patient department; if action is co-sign required, INSERTs a `pending_review` row; if blocked, refuses with respectful error.
3. Supervisor (primary, or any consultant in dept on fallback) sees it in the **Review queue** (consultant cadre surface). They approve / return-with-feedback.
4. On `approved`, a follow-up Edge Function executes the actual action (creates the `prescriptions` row, etc.) — **gated by the approval, not the original request**.
5. Every transition: audited (`sa_audit_log` widened with `cosign_request` / `cosign_approve` / `cosign_return` actions).

**Policy table** (cadre × action × hospital × optional department):

```sql
CREATE TABLE public.clinical_cosign_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
    -- NULL = hospital-wide default
  cadre_code text NOT NULL,
  action_kind text NOT NULL,
  requirement text NOT NULL,
    -- 'allowed' | 'cosign_required' | 'blocked'
  notes text,
  set_by_user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cosign_policy_requirement_check
    CHECK (requirement IN ('allowed','cosign_required','blocked'))
);
CREATE UNIQUE INDEX cosign_policy_unique
  ON public.clinical_cosign_policies
  (hospital_id, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
   cadre_code, action_kind);
```

**The §2 defaults are seeded as hospital-wide policy rows for every active hospital.** Hospital admins override via the existing admin UI (separate small ticket).

**Asks at sign-off:**

- (Q-C1) Default expiry on co-sign requests — 24h? 12h? Or no expiry (must be manually cancelled)?
- (Q-C2) Should "returned" requests be re-submittable (with edits) or are they terminal (must start over)?
- (Q-C3) Should there be a "this needs the named supervisor specifically" toggle for sensitive items vs "any consultant in dept can sign"?

## 6. Engine status — reuse vs honest stub

| Engine                                                     | Status                                   | What we ship                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheduling (availability, appointments, urgent-from-alert) | **Built (migration 0028)**               | Deep-link from doctor workspace into existing `/clinician/schedule`. Move the surface under `/doctor` in a later polish pass.                                                                                                                                                                                                                                    |
| Encounters (start / progress / end)                        | **Built (minimal seam)**                 | Doctor can mark-arrived / start; SOAP / notes / orders are the clinical module's.                                                                                                                                                                                                                                                                                |
| Monitoring / alerts                                        | **NOT built — stub honestly**            | Alerts panel renders an honest empty state + the seam interface. When the engine lands, populate.                                                                                                                                                                                                                                                                |
| Care-team coordination                                     | **NOT built — stub honestly**            | Per-patient Care-Team panel renders honest "lands with clinical module" + invite-specialist seam.                                                                                                                                                                                                                                                                |
| Prescribing / orders                                       | **NOT built — stub the safety scaffold** | We ship the **co-sign request + policy + review queue** mechanism in full. The actual "prescribe a drug" form is a placeholder that creates a `clinical_cosign_requests` row with `action_payload = {placeholder: true, kind: "prescription_routine", ...}` — proves the cadre-enforced flow end-to-end. The real prescribing UI ships with the clinical module. |
| Patient panel + summary                                    | **Built in this feature**                | The patient panel is core to the doctor workspace — it's net-new here; the **access basis + audited PHI decryption** is the new safety primitive.                                                                                                                                                                                                                |

## 7. Shell decision: extend `/clinician` or create `/doctor`?

**Proposal: `/doctor/*` — net-new sibling to `/clinician/*`.**

The existing `/clinician/*` (availability + schedule from scheduling) is **cadre-agnostic** — it's for any clinician (doctor, nurse, pharmacist, lab tech) doing scheduling tasks. The doctor workspace is **cadre-specific** (the whole point is cadre tailoring). Conflating them would:

- Force nurses / pharmacists / lab techs through doctor-shaped chrome they don't need.
- Make the clinical-safety capability matrix harder to reason about (what does a "clinician" mean — any of four roles?).

**`/doctor/*`** is unambiguous: scoped to UMDPC-registered staff (cadre in `{intern, mo, mosg, consultant}`). Sign-in routing for `role = 'clinician'` AND cadre in the doctor set sends to `/doctor`; otherwise to `/clinician`. Nurse / pharmacist / lab-tech workspaces are future builds with their own roots.

**Existing `/clinician/availability` and `/clinician/schedule` stay** as the universal scheduling surfaces — the `/doctor` workspace deep-links into them rather than duplicating.

**Asks at sign-off:**

- (Q-W1) Agree with `/doctor` as a sibling root, or do you want everything under `/clinician/<cadre>`?

## 8. Out of scope (explicit — flagged at GATE F)

- SOAP notes / clinical documentation engine (clinical module).
- Real prescribing form + drug catalog + interaction checks (clinical module).
- Lab / imaging order forms + result inflow (clinical module + integrations).
- Monitoring engine (separate build).
- Care-team coordination tables + chat / threading (separate build; we ship the seam).
- Pharmacy queue (the prescription → pharmacist handoff — clean seam left).
- Break-glass / four-eyes patient access (separate gate; enum reserved).
- HOD / department-leadership surfaces (separate hospital-admin build; we link).
- Workspace switcher for multi-affiliation doctors (today: pin to most-recent-active, same as `/clinician`; multi-hospital switcher is a polish ticket).

## 9. Asks of you (and the Clinical Safety Officer) before I migrate anything

Please confirm or override. Anything unspoken, I'll proceed with the recommendation in §2–§7.

**Clinical-safety (CSO sign-off requested):**

1. **The §2 cadre→capability map** — does it match real Ugandan practice and the hospitals you intend to support? Specifically the four footnoted decisions (CO routine prescribing co-sign default, interns + COs blocked on controlled substances, MO co-sign default for controlled, MO supervisory scope).
2. **Supervision model (§3)** — explicit pairing + department fallback. OK?
3. **Patient access basis (§4)** — three OR-combined bases (care-team / active-encounter / department-recent 30d) — OK? Window length?
4. **Co-sign workflow (§5)** — pending_review → approved/returned, action executes on approval, every transition audited. Expiry default? Returned re-submittable?
5. **PHI access audit (§4)** — patient-discoverable now or later?

**Shell + reuse:** 6. **`/doctor/*` as the root** (§7), not `/clinician/<cadre>`. OK? 7. **Honest stubs for monitoring / care-team / real prescribing** with the **co-sign safety scaffold shipped end-to-end** (§6) — confirms the cadre enforcement works against a real workflow without faking clinical content. OK?

**Scope:** 8. **Out-of-scope list (§8)** — anything you want pulled back in?

Once signed off, I'll write migration 0030 (4 tables: `clinical_supervision`, `clinical_cosign_policies` + seed, `clinical_cosign_requests`, `clinical_phi_access_log`), then GATE B → F in order.
