# Hospital registration upgrade — schema proposal (GATE A)

**Branch:** `feat/hospital-registration-upgrade`
**Stop point:** Do NOT migrate until this proposal is reviewed and the three open questions in §6 are answered.

This document proposes the additive schema changes needed to upgrade hospital onboarding from a thin account-creation flow into a full institution-onboarding system (per `prompts/hospital-registration-upgrade-kickoff.md`). It does not implement code, run migrations, or touch shipped migration files.

---

## 1. Principles applied to the schema design

- **Additive only.** Every existing migration stays untouched. New columns use `ADD COLUMN IF NOT EXISTS`; new tables use `CREATE TABLE IF NOT EXISTS`; the lifecycle enum gains values via `ALTER TYPE … ADD VALUE`.
- **RLS deny-by-default.** Every new table gets `ENABLE + FORCE ROW LEVEL SECURITY` with explicit policies; `audit_log_changes()` trigger attached so every mutation lands in `audit_log`.
- **Tenant isolation real.** Hospital-scoped tables join `hospital_id` against `user_roles` via the existing `user_has_role('hospital_admin', hospital_id)` helper. Superadmin sees everything; hospital admin sees only their own hospital(s).
- **Agreement is load-bearing.** The DPA-acceptance table is the gate for `active`. Both the applicant path and the superadmin-created path go through it — the kickoff is explicit that superadmin creation may relax _verification_ friction, never the _agreement gate_ (kickoff §1).
- **Selection over free text reflected in CHECKs.** Every enum-shaped column lands as a `text` with a CHECK list (the existing pattern), not a Postgres enum — easier to extend additively.
- **Encryption hooks.** Anything that's PII at applicant scope (e.g. callback-contact phone) is plain text in this proposal; we'll wrap with `lib/encryption.ts` at write time in GATE B if review wants encryption at rest. **Flag for review.**

---

## 2. Lifecycle enum extension

Current values (`public.lifecycle_state` from migration 0007):

```
unverified · verified · pending_approval · approved · active · rejected · suspended · deactivated
```

The kickoff §H specifies a richer machine:

```
lead → applied → under_review → verified → agreement_signed → provisioning → active
```

Plus side states `rejected · suspended · offboarded · agreement_expired`.

### Mapping the kickoff names onto existing values

| Kickoff state       | Maps to existing enum value?                                                                                                | Notes                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `lead`              | NO — `hospital_leads.state` has its own CHECK ('new','contacted','invited','archived'); keep as-is, semantically equivalent |
| `applied`           | `pending_approval`                                                                                                          | Existing value, what `hospital_applications` lands in on INSERT today                   |
| `under_review`      | NEW — needs ADD VALUE                                                                                                       | A second triage step before a decision                                                  |
| `verified`          | `verified`                                                                                                                  | Existing value, reused with the institution-level meaning                               |
| `agreement_signed`  | NEW — needs ADD VALUE                                                                                                       | Gate state; cannot advance to `provisioning` without a signed `hospital_agreements` row |
| `provisioning`      | NEW — needs ADD VALUE                                                                                                       | Setup wizard incomplete                                                                 |
| `active`            | `active`                                                                                                                    | Existing                                                                                |
| `offboarded`        | NEW — needs ADD VALUE                                                                                                       | Terminal; distinct from `deactivated` (operator-initiated) and `suspended` (temporary)  |
| `agreement_expired` | NEW — needs ADD VALUE                                                                                                       | Side state requiring renewal flow (schema-only this phase)                              |

### Proposed enum additions (migration `00XX_lifecycle_state_extension`)

```sql
DO $$ BEGIN
  ALTER TYPE public.lifecycle_state ADD VALUE IF NOT EXISTS 'under_review';
  ALTER TYPE public.lifecycle_state ADD VALUE IF NOT EXISTS 'agreement_signed';
  ALTER TYPE public.lifecycle_state ADD VALUE IF NOT EXISTS 'provisioning';
  ALTER TYPE public.lifecycle_state ADD VALUE IF NOT EXISTS 'offboarded';
  ALTER TYPE public.lifecycle_state ADD VALUE IF NOT EXISTS 'agreement_expired';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
```

`ALTER TYPE … ADD VALUE` runs without locking the type, but each statement must be its own top-level statement (cannot be wrapped in a single transaction in some Postgres versions). The migration will use separate statements outside any explicit `BEGIN`.

### `lib/lifecycle.ts` transition table updates

After the enum changes, `LIFECYCLE_TRANSITIONS` extends as:

```
applied      → under_review · rejected · deactivated      (was pending_approval; alias)
under_review → verified · rejected · deactivated
verified     → agreement_signed · rejected · suspended    (institution-level meaning)
agreement_signed → provisioning · suspended
provisioning → active · suspended
active       → suspended · offboarded · agreement_expired (added offboarded + agreement_expired)
agreement_expired → agreement_signed · offboarded         (renewal path)
offboarded   → []  (terminal)
```

User-scoped semantics (`verified → active` for patients) stay unchanged — the enum is shared but the transition table is consulted with the row context.

---

## 3. Column additions to `hospital_applications`

All additive — migration `00XX_hospital_applications_extended_profile`. Wrapped in `ADD COLUMN IF NOT EXISTS` so re-running is idempotent.

### 3.1 Institution profile (§B)

```sql
ALTER TABLE public.hospital_applications
  ADD COLUMN IF NOT EXISTS hospital_aka                text,
  ADD COLUMN IF NOT EXISTS year_established            integer,
  ADD COLUMN IF NOT EXISTS main_phone                  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS official_email              text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website                     text,
  ADD COLUMN IF NOT EXISTS region_id                   uuid REFERENCES public.regions(id)  ON DELETE RESTRICT;

ALTER TABLE public.hospital_applications
  ADD CONSTRAINT hospital_applications_year_sane CHECK (
    year_established IS NULL OR (year_established BETWEEN 1900 AND EXTRACT(YEAR FROM now())::int)
  );
```

The `NOT NULL DEFAULT ''` on `main_phone` + `official_email` is the standard idempotent pattern for adding NOT NULL columns to a table that already has rows. A follow-up `ALTER COLUMN … DROP DEFAULT` after the data is backfilled keeps the schema honest going forward.

### 3.2 Clinical & operating profile (§C, §D, §E)

Departments + clinics + diagnostics + services are **multi-value** selections. Two storage choices, both used elsewhere in the codebase:

- **`text[]`** column with a `CHECK (… <@ ARRAY[…])` — denser, simpler, but harder to validate against the seeded reference data
- **Junction table** `hospital_application_departments` (and one per multi-select) — properly normalised, joinable, but five new tables

**Proposed:** mixed approach. Anything keyed off **seeded reference data** (departments → `roles.department_family`, specialties → `specialties` table) gets a junction table. Anything **freeform-selectable** (clinics, services-offered) gets `text[]` with a CHECK list.

```sql
-- Reference-data-anchored picks
CREATE TABLE IF NOT EXISTS public.hospital_application_departments (
  application_id uuid NOT NULL REFERENCES public.hospital_applications(id) ON DELETE CASCADE,
  department_family text NOT NULL,           -- matches public.roles.department_family
  is_primary boolean NOT NULL DEFAULT false, -- exactly one TRUE per application (CHECK below)
  PRIMARY KEY (application_id, department_family)
);

CREATE TABLE IF NOT EXISTS public.hospital_application_specialties (
  application_id uuid NOT NULL REFERENCES public.hospital_applications(id) ON DELETE CASCADE,
  specialty_id  uuid NOT NULL REFERENCES public.specialties(id) ON DELETE RESTRICT,
  PRIMARY KEY (application_id, specialty_id)
);

-- Primary-department uniqueness (partial unique index — one TRUE per application)
CREATE UNIQUE INDEX IF NOT EXISTS hospital_application_primary_dept_unique
  ON public.hospital_application_departments (application_id) WHERE is_primary;

-- Freeform-selectable picks (clinics, diagnostics, services) — text[] + CHECK
ALTER TABLE public.hospital_applications
  ADD COLUMN IF NOT EXISTS specialised_clinics    text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS specialised_clinics_other text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS diagnostic_services    text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS support_services       text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS services_offered       text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS has_onsite_pharmacy    boolean,
  ADD COLUMN IF NOT EXISTS bed_capacity_band      text,
  ADD COLUMN IF NOT EXISTS clinical_staff_band    text,
  ADD COLUMN IF NOT EXISTS daily_opd_band         text,
  ADD COLUMN IF NOT EXISTS internet_connectivity  text,
  ADD COLUMN IF NOT EXISTS power_backup           text,
  ADD COLUMN IF NOT EXISTS existing_emr           text,
  ADD COLUMN IF NOT EXISTS existing_emr_name      text;

-- CHECK lists (concise enum sets — extend additively)
ALTER TABLE public.hospital_applications
  ADD CONSTRAINT hospital_applications_clinics_subset CHECK (
    specialised_clinics <@ ARRAY[
      'diabetes','hypertension_cardiac','renal_dialysis','oncology','hiv_art',
      'tb','antenatal_maternal','asthma_copd','mental_health'
    ]::text[]
  ),
  ADD CONSTRAINT hospital_applications_diagnostics_subset CHECK (
    diagnostic_services <@ ARRAY[
      'lab_chem','lab_haem','lab_micro','lab_histo',
      'img_xray','img_ultrasound','img_ct','img_mri','img_mammography',
      'ecg','echo','endoscopy'
    ]::text[]
  ),
  ADD CONSTRAINT hospital_applications_support_subset CHECK (
    support_services <@ ARRAY[
      'pharmacy','blood_bank','operating_theatres','mortuary','ambulance'
    ]::text[]
  ),
  ADD CONSTRAINT hospital_applications_services_subset CHECK (
    services_offered <@ ARRAY[
      'opd','inpatient','day_care','emergency_24_7','referral'
    ]::text[]
  ),
  ADD CONSTRAINT hospital_applications_capacity_band CHECK (
    bed_capacity_band IS NULL OR bed_capacity_band IN ('<25','25-99','100-299','300-799','800+')
  ),
  ADD CONSTRAINT hospital_applications_staff_band CHECK (
    clinical_staff_band IS NULL OR clinical_staff_band IN ('<10','10-49','50-199','200-499','500+')
  ),
  ADD CONSTRAINT hospital_applications_opd_band CHECK (
    daily_opd_band IS NULL OR daily_opd_band IN ('<25','25-99','100-299','300-799','800+')
  ),
  ADD CONSTRAINT hospital_applications_connectivity CHECK (
    internet_connectivity IS NULL OR internet_connectivity IN ('reliable','intermittent','limited')
  ),
  ADD CONSTRAINT hospital_applications_power CHECK (
    power_backup IS NULL OR power_backup IN ('yes','generator','unreliable')
  ),
  ADD CONSTRAINT hospital_applications_emr CHECK (
    existing_emr IS NULL OR existing_emr IN ('none','paper','existing')
  );
```

### 3.3 Verification & authority (§E6)

```sql
ALTER TABLE public.hospital_applications
  ADD COLUMN IF NOT EXISTS licensing_body                text,
  ADD COLUMN IF NOT EXISTS facility_licence_path         text,
  ADD COLUMN IF NOT EXISTS applicant_full_name           text,
  ADD COLUMN IF NOT EXISTS applicant_work_email          text,
  ADD COLUMN IF NOT EXISTS applicant_phone               text,
  ADD COLUMN IF NOT EXISTS applicant_council_number      text,
  ADD COLUMN IF NOT EXISTS authority_officer_name        text,
  ADD COLUMN IF NOT EXISTS authority_officer_title       text,
  ADD COLUMN IF NOT EXISTS authority_letter_path         text,
  ADD COLUMN IF NOT EXISTS callback_contact_value        text,     -- phone OR email
  ADD COLUMN IF NOT EXISTS callback_contact_kind         text,     -- 'phone' | 'email'
  ADD COLUMN IF NOT EXISTS email_domain_mismatch         boolean NOT NULL DEFAULT false;

ALTER TABLE public.hospital_applications
  ADD CONSTRAINT hospital_applications_licensing_body_check CHECK (
    licensing_body IS NULL OR licensing_body IN ('moh','umdpc','other')
  ),
  ADD CONSTRAINT hospital_applications_callback_kind_check CHECK (
    callback_contact_kind IS NULL OR callback_contact_kind IN ('phone','email')
  ),
  ADD CONSTRAINT hospital_applications_callback_pair CHECK (
    (callback_contact_value IS NULL) = (callback_contact_kind IS NULL)
  );
```

`callback_contact_value` will be wrapped through `lib/encryption.ts` at write time in GATE B (no `bytea` column needed; ciphertext fits as base64 `text`). **Flag if review wants a `bytea`-typed column instead.**

`email_domain_mismatch` is computed at write time (applicant's work email's domain ≠ `institutional_email_domain`) and used by the superadmin queue to flag-for-stricter-review without hiding the row.

### 3.4 Agreement reference (§E7)

The agreement _acceptance_ itself goes in a new `hospital_agreements` table (§4.2). On `hospital_applications`, we record only the toggle answers + signatory metadata so the application row is self-contained for review:

```sql
ALTER TABLE public.hospital_applications
  ADD COLUMN IF NOT EXISTS signatory_name      text,
  ADD COLUMN IF NOT EXISTS signatory_title     text,
  ADD COLUMN IF NOT EXISTS authorised_to_bind  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agreement_accepted_version uuid REFERENCES public.hospital_dpa_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS agreement_accepted_at      timestamptz;
```

### 3.5 State CHECK extension (existing table-level CHECK was implicit in `lifecycle_state`)

`hospital_applications.state` is `text` (not enum-typed today). Extend the implicit list by aligning it with the new enum:

```sql
ALTER TABLE public.hospital_applications
  DROP CONSTRAINT IF EXISTS hospital_applications_state_check;
ALTER TABLE public.hospital_applications
  ADD CONSTRAINT hospital_applications_state_check CHECK (
    state IN (
      'pending_approval',  -- legacy alias for 'applied'
      'applied',
      'under_review',
      'verified',
      'agreement_signed',
      'provisioning',
      'active',
      'rejected',
      'suspended',
      'deactivated',
      'offboarded',
      'agreement_expired'
    )
  );
```

(`pending_approval` retained as a legacy alias so existing rows keep working without backfill.)

---

## 4. New tables

Five new tables. Each gets RLS + audit trigger + tests in GATE B/C/D as it's first written to.

### 4.1 `hospital_dpa_versions`

Versioned text of the Data-Processing Agreement / MoU. Pattern mirrors `consent_versions` (migration 0006). Append-only.

```sql
CREATE TABLE IF NOT EXISTS public.hospital_dpa_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version         text NOT NULL,                -- e.g. 'v1', 'v1.1'
  effective_date  date NOT NULL,
  body            text NOT NULL,                -- the full agreement text
  body_sha256     text NOT NULL,                -- SHA-256 hex of body (proof)
  legal_review_status text NOT NULL DEFAULT 'placeholder',
  supersedes_id   uuid REFERENCES public.hospital_dpa_versions(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hospital_dpa_versions_legal_status_check
    CHECK (legal_review_status IN ('placeholder','under_review','approved'))
);

CREATE UNIQUE INDEX IF NOT EXISTS hospital_dpa_versions_unique ON public.hospital_dpa_versions(version);
CREATE INDEX IF NOT EXISTS hospital_dpa_versions_effective_idx ON public.hospital_dpa_versions(effective_date DESC);

ALTER TABLE public.hospital_dpa_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_dpa_versions FORCE ROW LEVEL SECURITY;

-- Public SELECT: applicants and hospital admins must be able to read the active version.
CREATE POLICY hospital_dpa_versions_select_all ON public.hospital_dpa_versions
  FOR SELECT TO anon, authenticated USING (true);

-- INSERT: superadmin only (service-role bypasses, but defence in depth).
CREATE POLICY hospital_dpa_versions_insert_superadmin ON public.hospital_dpa_versions
  FOR INSERT TO authenticated WITH CHECK (public.user_has_role('superadmin'));
```

Seeded in a follow-up migration `00XX_hospital_dpa_v1.sql` with `{{LEGAL REVIEW — placeholder terms}}` body. The seed row has `legal_review_status = 'placeholder'`; flipping to `'approved'` is a separate operator action when the lawyer signs off.

### 4.2 `hospital_agreements`

Per-hospital acceptances, one row per signing. Replaces previous version when renewed; the row chain via `supersedes_id` gives full history.

```sql
CREATE TABLE IF NOT EXISTS public.hospital_agreements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id    uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  dpa_version_id uuid NOT NULL REFERENCES public.hospital_dpa_versions(id) ON DELETE RESTRICT,
  signed_at      timestamptz NOT NULL DEFAULT now(),
  signed_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  signatory_name  text NOT NULL,
  signatory_title text NOT NULL,
  source         text NOT NULL,            -- 'applicant_flow' | 'superadmin_offline'
  offline_evidence_path text,              -- for superadmin path: scan of physically-signed agreement
  effective_until timestamptz,             -- null = no expiry; set when renewing under a fixed term
  superseded_by  uuid REFERENCES public.hospital_agreements(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hospital_agreements_source_check CHECK (source IN ('applicant_flow','superadmin_offline')),
  CONSTRAINT hospital_agreements_superadmin_evidence CHECK (
    source <> 'superadmin_offline' OR offline_evidence_path IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS hospital_agreements_hospital_idx ON public.hospital_agreements(hospital_id);
CREATE INDEX IF NOT EXISTS hospital_agreements_signed_at_idx ON public.hospital_agreements(signed_at DESC);

ALTER TABLE public.hospital_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_agreements FORCE ROW LEVEL SECURITY;

-- SELECT: hospital_admin of the hospital, OR superadmin.
CREATE POLICY hospital_agreements_select_scoped ON public.hospital_agreements
  FOR SELECT TO authenticated USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  );

-- INSERT: service-role only (always written by an Edge Function — applicant flow or sa-create).
-- No `authenticated` policy means: only the service-role key (which bypasses RLS) can write.
```

The agreement-gate enforcement is a server-side check, not an FK on `hospitals.state`: before `sa-*` Edge Functions flip a hospital to `active`, they assert `EXISTS (SELECT 1 FROM hospital_agreements WHERE hospital_id = $1 AND superseded_by IS NULL)`. **GATE C tests prove this on both paths.**

### 4.3 `hospital_wards`

Wards/units inside a hospital + bed capacity. Set up in the post-approval setup wizard (§F2).

```sql
CREATE TABLE IF NOT EXISTS public.hospital_wards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  name        text NOT NULL,
  slug        text NOT NULL,
  bed_count   integer NOT NULL DEFAULT 0 CHECK (bed_count >= 0),
  state       text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hospital_wards_state_check CHECK (state IN ('active','inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS hospital_wards_unique_slug ON public.hospital_wards (hospital_id, slug);
CREATE INDEX IF NOT EXISTS hospital_wards_hospital_idx ON public.hospital_wards (hospital_id);

ALTER TABLE public.hospital_wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_wards FORCE ROW LEVEL SECURITY;

CREATE POLICY hospital_wards_select_scoped ON public.hospital_wards
  FOR SELECT TO authenticated USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  );
CREATE POLICY hospital_wards_write_admin ON public.hospital_wards
  FOR ALL TO authenticated
  USING (public.user_has_role('hospital_admin', hospital_id) OR public.user_has_role('superadmin'))
  WITH CHECK (public.user_has_role('hospital_admin', hospital_id) OR public.user_has_role('superadmin'));
```

### 4.4 `hospital_admin_roster`

Tracks primary + backup hospital admins per hospital, with succession. Solves the single-admin single-point-of-failure (kickoff §F3 + §H "admin succession built").

```sql
CREATE TABLE IF NOT EXISTS public.hospital_admin_roster (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  designation text NOT NULL,                       -- 'primary' | 'backup'
  designated_at timestamptz NOT NULL DEFAULT now(),
  designated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  succeeded_at timestamptz,                        -- set when this row is no longer current
  succeeded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  succession_reason text,
  CONSTRAINT hospital_admin_roster_designation_check
    CHECK (designation IN ('primary','backup'))
);

-- Exactly one current primary per hospital (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS hospital_admin_roster_one_primary_per_hospital
  ON public.hospital_admin_roster (hospital_id) WHERE succeeded_at IS NULL AND designation = 'primary';

CREATE INDEX IF NOT EXISTS hospital_admin_roster_hospital_idx
  ON public.hospital_admin_roster (hospital_id, succeeded_at);

ALTER TABLE public.hospital_admin_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_admin_roster FORCE ROW LEVEL SECURITY;

CREATE POLICY hospital_admin_roster_select_scoped ON public.hospital_admin_roster
  FOR SELECT TO authenticated USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  );
-- Writes are service-role only (transfer flow is an Edge Function: validates two-party
-- handshake / superadmin override + audits + flips superseded_at).
```

**Note:** this is a _roster_ (intent + audit trail of who-was-when), not the authoritative grant. The grant still lives in `public.user_roles` with `role='hospital_admin'` scoped to `hospital_id`. The roster row + the `user_roles` row are created/removed atomically by the Edge Function so they never drift.

### 4.5 `hospital_staff_invitations`

Setup wizard step §F4 — "bulk-invite staff" or individual invitation. One row per invited person; on acceptance, the row links to the resulting `staff_affiliations` + `user_roles` rows.

```sql
CREATE TABLE IF NOT EXISTS public.hospital_staff_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  invited_name  text,
  invited_role_id uuid REFERENCES public.roles(id) ON DELETE RESTRICT,   -- expected role; claim verifies
  invited_council_number text,                                           -- pre-filled if known
  invitation_token_hash text NOT NULL,                                   -- bcrypt of single-use token
  invited_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invited_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at   timestamptz,
  accepted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at    timestamptz,
  revoked_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revocation_reason text,
  source        text NOT NULL DEFAULT 'individual',                      -- 'individual' | 'bulk'
  CONSTRAINT hospital_staff_invitations_source_check
    CHECK (source IN ('individual','bulk')),
  CONSTRAINT hospital_staff_invitations_state_pair CHECK (
    (accepted_at IS NULL OR revoked_at IS NULL)                          -- mutually exclusive
  )
);

CREATE INDEX IF NOT EXISTS hospital_staff_invitations_hospital_idx
  ON public.hospital_staff_invitations (hospital_id, invited_at DESC);
CREATE INDEX IF NOT EXISTS hospital_staff_invitations_open_idx
  ON public.hospital_staff_invitations (hospital_id) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS hospital_staff_invitations_email_idx
  ON public.hospital_staff_invitations (invited_email);

ALTER TABLE public.hospital_staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_staff_invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY hospital_staff_invitations_select_admin ON public.hospital_staff_invitations
  FOR SELECT TO authenticated USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  );
-- INSERT/UPDATE service-role only (Edge Functions: invite, accept, revoke).
```

**Crucial:** the invitation is a _pre-fill_ and a verification anchor. It never grants access. The invitee still goes through the council-anchored affiliation verification (`staff_affiliations` flow); the invitation simply pre-populates their fields and lets the hospital admin track who they've reached out to.

### 4.6 Inverse — what is NOT proposed here

- **No new `hospital_setup_progress` table.** Wizard state derives from facts: did `hospital_wards` get rows? Is there a primary in the roster? Did `hospital_agreements` land? — these answer "what wizard step are we on?" without a parallel state table that can drift.
- **No `agreement_renewals` table.** Renewal = new `hospital_agreements` row with `supersedes_id` set; the existing chain is the renewal history. `agreement_expired` lifecycle state + a `lastEffectiveUntil` computed column give the surface affordance.
- **Encryption columns** for callback-contact phone: deferred to GATE B as a wrap at write time (text-stored ciphertext), to keep this migration purely schema. **Flag if review wants `bytea`.**

---

## 5. Drizzle schema files (new + edits)

Will land alongside the migration:

```
db/schema/
  hospital-applications.ts        (existing — add the new columns)
  hospital-application-departments.ts   NEW (junction)
  hospital-application-specialties.ts   NEW (junction)
  hospital-dpa-versions.ts              NEW
  hospital-agreements.ts                NEW
  hospital-wards.ts                     NEW
  hospital-admin-roster.ts              NEW
  hospital-staff-invitations.ts         NEW
  index.ts                              (barrel exports)
```

No edits to `hospitals.ts` itself — the `state` column already supports the extended lifecycle.

---

## 6. Open questions (the three the kickoff calls out)

> The kickoff §I says: **Confirm at GATE A:**
> (i) callback-contact friction level (E6)
> (ii) bulk-staff-invite build-now vs stub (F4)
> (iii) superadmin-completes-setup-before-admin-exists allowance (G)

### Q1 — Callback-contact required vs optional-but-flagging?

The kickoff drafts it as **required** (strongest anti-fraud) with a noted dial-down to optional-but-flagging. The schema supports either with the existing columns; the difference is a NOT NULL constraint at the application layer.

- **Recommendation:** **Required** for the applicant path. Reasons:
  1. The kickoff §K explicitly warns "PDPO will ask exactly how each hospital was vetted — keep the verification trail complete."
  2. Without the independent callback channel, the only fraud check is the institutional email domain — and a malicious applicant who can spoof an institutional email needs only one barrier to be a fake hospital admin.
  3. Optional-but-flagging shifts work to manual superadmin review at exactly the wrong end of the funnel (after submission, not before).
  4. Dropping the requirement later is trivial; adding it back after a fraud incident is not.
- **Cost:** ~5 extra seconds of friction per legitimate applicant. Acceptable.

### Q2 — Bulk staff invite: build now vs stub?

The setup wizard §F4 lists three onboarding kickoff modes: individual invite, bulk invite, pre-loaded roster.

- **Recommendation:** **Build the individual invite end-to-end + stub the bulk path** (UI route exists, server-side parses CSV but returns "Bulk staff invite ships next phase").
- Reasons:
  1. `hospital_staff_invitations` schema supports both today (`source = 'individual' | 'bulk'`).
  2. The hard work is the council-anchored verification + token issuance + claim flow — building those once for individual covers 90% of the bulk path.
  3. Bulk has its own UX surface area (CSV/paste, dry-run preview, error reporting, dedup) that's worth a dedicated gate.
  4. Phase 0 has no hospitals with hundreds of staff yet; the individual flow handles the entire current scale.

### Q3 — May the superadmin complete the setup wizard before a real hospital admin exists?

The kickoff §G is cautious: "If truly needed before an admin exists, superadmin may complete setup, but the hospital-admin seat must be filled by a real hospital person before go-live — flag this."

- **Recommendation:** **No, by default.** The setup wizard runs as the hospital admin (claimed via invitation). Superadmin-created tenants land in `provisioning` with `hospital_admin_roster` empty; the invitation Edge Function is the only way to progress.
- **Carve-out:** the wizard's `confirm-departments` step (1) and `wards-capacity` step (2) can be **prefilled** by superadmin from the application/known data — but **submitting** the wizard requires the hospital_admin's session, and `active` requires a primary in the roster.
- **Why:** the kickoff's strongest principle ("superadmin creates the tenant, not a working admin … never impersonate a hospital's staff") cuts both ways. Pre-fill is helpful; commit is not.
- **Override:** if a hospital is truly mid-emergency and needs go-live before the invitation accept lands, the superadmin path is a documented **break-glass for hospital creation** — a four-eyes action lands in `sa_pending_approvals` ("override_admin_required") that requires a second SA. We don't build this today; the deferred Q is whether to even surface it.

---

## 7. Files to land at GATE A approval (no migration yet)

Just this document. **Migration files are not created until §6 questions are answered.**

After approval:

1. `lib/lifecycle.ts` — extend `LIFECYCLE_STATES` + `LIFECYCLE_TRANSITIONS` table
2. `supabase/migrations/00XX_lifecycle_state_extension.sql` — `ALTER TYPE … ADD VALUE`
3. `supabase/migrations/00YY_hospital_applications_extended_profile.sql` — column adds + CHECK extension + new junction tables
4. `supabase/migrations/00ZZ_hospital_dpa_v1_placeholder.sql` — seed first DPA version with `legal_review_status='placeholder'`
5. `supabase/migrations/00WW_hospital_agreements_wards_roster_invitations.sql` — the four new operational tables + RLS + audit triggers
6. Drizzle schemas to match each table (additive)
7. ADRs: `docs/adr/00XX-hospital-verification-model.md`, `00YY-hospital-agreement-gate.md`, `00ZZ-superadmin-hospital-create-path.md`

---

## 8. What hasn't changed

- Functional onboarding of patients / clinicians / staff affiliations — untouched
- `hospital_leads` table — untouched (the state field's existing CHECK suffices for the lead-to-application flow)
- The existing `hospitals.state` column from migration 0018 (superadmin workspace) — already supports the new enum values once they're added
- The existing approval Edge Functions (`approve-hospital-application`, etc.) — extended in GATE C to write the new state transitions, but their signatures + auth model don't change
- `sa_audit_log` schema — already supports the new actions; the `action` CHECK was extended in migration 0018 to include `activate_hospital` and friends. **It will need a small additive extension** for the new agreement / invitation actions, which the GATE C migration handles inline.

---

**Stop here.** Please answer Q1 / Q2 / Q3 in §6 (or say "go with the recommendations") and I'll write the migrations + Drizzle schemas + lifecycle.ts updates for GATE A's actual landing.
