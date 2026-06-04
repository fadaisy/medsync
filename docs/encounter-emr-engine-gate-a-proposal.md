# Encounter / EMR engine + clerkship — GATE A proposal (schema + access model + clerkship structure)

**Status:** Proposed — **awaiting CSO sign-off before the migration is applied.** Built A→E on `feat/encounter-emr-engine` under "go through all gates"; the **DB migration is written but GATED (not applied to prod)** — applying the clinical-data-spine schema is hard-to-reverse and needs explicit, named authorization (same posture as migration 0039).
**Scope:** the **encounter / EMR engine** (the clinical-data spine) with its **clinical documentation realised as a structured Hutchison CLERKSHIP** (history → examination → differential → initial management), per `encounter-emr-engine-kickoff.md` (the primary spec) + `encounter-engine-clerkship-addendum.md` + the committed clinical source `docs/clinical/clerkship-clinical-reference.md`.

> **Spec reconciliation (2026-06-04).** The primary spec **`encounter-emr-engine-kickoff.md` has now been provided** and this proposal is reconciled against it. The spine designed earlier (when only the addendum was available) holds up; the key corrections the real spec forces are:
>
> 1. **Access basis (kickoff §2): "never any clinician sees any patient."** The earlier spine shipped a looser predicate (any clinical staff at a hospital where the patient has an encounter). **Corrected** to the kickoff's legitimate-access basis, which the repo **already implements** for the doctor/nurse workspaces: `active_encounter` → `department_recent` → `care_team` (seam) → `break_glass` (`lib/doctor/patient-access.ts`, `lib/nurse/patient-access.ts`). The engine now resolves this basis in `lib/encounter/scope.ts` and logs reads to the canonical **`clinical_phi_access_log`** (not a private audit event), so it is ONE access model, not two.
> 2. **Standards as versioned reference data (kickoff §1/§5):** ICD-10 (diagnoses/problems) + LOINC (orders/results) must be **sourced + seeded as versioned reference tables**, not free-text only (planned for GATE C).
> 3. **Objects still to add for full §1 coverage:** `care_plan`, an encounter **type** vocabulary (OPD/inpatient/emergency/follow-up/tele) + `planned` status, and a defined **vitals-link interface** (monitoring engine is later — interface only).
>    The two areas the kickoff says the CSO signs — the **access basis / cadre-write rules** and the **core-object schema** — are §B + §C; treat them as the sign-off surface.

---

## A. What already exists (build ON, don't recreate)

Recon of the repo found the foundations the engine builds on already shipped:

- **`encounters`** table ALREADY EXISTS (migration 0028; `db/schema/scheduling.ts`): `id, hospital_id, appointment_id, patient_user_id, clinician_user_id, department_id, started_at, ended_at, state (in_progress/completed/cancelled), completion_reason`. RLS: patient / clinician / superadmin / hospital_admin / nurse. **The engine EXTENDS this** (adds disposition + triage link + clerkship documentation/diagnoses/problem-list/allergies/meds/orders/results/timeline), it does not recreate it. `resus_episodes`, `queue_entries`, prescribing, nurse-workspace all already FK to it.
- **Access primitives:** `staff_affiliations` ⋈ `cadres` (with `is_clinical` — the reception-exclusion predicate used across resus/triage RLS), `user_has_role(role, hospital)`, `sa_break_glass_grants` (break-glass), `consent_records`/`consent_versions`, `audit_log` + `audit_log_changes()` (write-audit trigger) + `audit_log_block_modify()` (append-only enforcement), the `require…Scope` server-side access pattern (e.g. `requireResusScope`).
- **Triage** engine (`triage_records`) — the handoff source (disposition + recommendation intents + a `vitals_snapshot`).
- **0039 is gated/unapplied** (prescribing v1 uses the immutable resus timeline), so no clinical objects exist in prod yet. Note 0039 _does_ contain a `CREATE TABLE IF NOT EXISTS public.patient_allergies` block — so `patient_allergies` is **shared** between 0039 and 0040. 0040 is the **authoritative owner**: it (re)creates the table idempotently and supersedes 0039's hospital-scoped RLS policy with the relationship-based one. The **prescribing allergy check will read `patient_allergies`** — but today it reads the resus-timeline allergy capture (`lib/prescribing/administration.ts`), so **pointing the prescribing engine at `patient_allergies` is a HARD dependency before this feature is turned on** (otherwise clerked allergies silently do not gate prescribing). See §E.

## B. Access model (INFERRED — CSO ratify) — "legitimate relationship", least-privilege, audited

The engine's clinical data is readable only on a **legitimate care relationship**, enforced at the DB (RLS) AND in the server-side scope helper, with **audit on read AND write**:

1. **Read — legitimate-access basis (kickoff §2; reconciled to the repo's existing model).** A clinician may read a patient's clinical record only on a legitimate basis, resolved strongest-first: **`active_encounter`** (an in-progress encounter with this patient) → **`department_recent`** (an appointment/encounter in the clinician's department within 30 days) → **`care_team`** (SEAM — the care-team table arrives with that module; false today) → **`break_glass`** (an unrevoked, unexpired `sa_break_glass_grants` — audited). This is the SAME basis the doctor/nurse workspaces already enforce (`lib/doctor/patient-access.ts`, `lib/nurse/patient-access.ts`); the engine resolves it in `lib/encounter/scope.ts → resolveEncounterAccess`. **Reception (is_clinical=false) never matches** (it holds no encounters/appointments as a clinician). This replaces the earlier looser "any clinical staff at the hospital" predicate.
2. **Write** — clinical writes go through **service-role server actions only** (no direct table writes from the client), which enforce the **cadre-write rules** (below) + the **same legitimate-access basis** + stamp author/cadre + write the audit. Tables are `FORCE ROW LEVEL SECURITY` with no client INSERT/UPDATE policy.
   - **⚠️ RLS is necessary-but-not-sufficient for the engine's own paths.** The engine's reads/writes use the **service-role Drizzle client** (direct `DATABASE_URL`, table owner), which **bypasses RLS**. So the access basis is **resolved in application code** (`resolveEncounterAccess`) on **every** service-role clinical read (`loadEncounterRecord`) and write (`recordClerkshipVersion`). The RLS policies defend only client-key (anon/authenticated) access, for which there are currently no callers. (The RLS `has_clinical_relationship` predicate is being tightened to match the app basis in GATE B.)
3. **Cadre-write rules (CSO ratify):** a **doctor/clinical-officer** clerks (full history/exam/differential/plan); a **nurse** records a nursing assessment + observations + allergies but not a medical differential/diagnosis as "final"; a **junior** (intern) clerking carries a **co-sign hook** (a `cosigned_by` field, surfaced for a senior to attest) — soft, not a hard block, like the resus leader model. Reception cannot write clinical at all.
4. **Audit-on-READ** — every read of the clinical record writes a row to the canonical **`clinical_phi_access_log`** (hospital, clinician, patient, **basis**, surface) — the same "who viewed which patient" table the doctor/nurse workspaces write. It is written **after** a successful authorised fetch (no false "record read"); reads don't fire DB triggers, so it lives in the engine's read path.
5. **PHI encryption** — free-text clinical fields (the clerking narrative) are encrypted at rest (the project's existing PHI-encryption approach for note bodies); coded/structured fields (codes, flags, enums) are queryable.

## C. Schema (INFERRED — CSO ratify) — additive migration `0040`, GATED

Extends `encounters`; adds the clinical objects. All `FORCE RLS`; clinical writes via service role; documentation + timeline are **append-only** (block triggers; corrections supersede).

1. **`encounters` (ALTER)** — add `disposition` (admit/discharge/refer/observe/…), `triage_record_id`, `encounter_class` (`clerkship` | `scheduled` | `resus` | …) so a clerkship encounter is distinguishable. (Keep the existing columns/RLS.)
2. **`clinical_documentation`** — the **versioned, append-only clerkship**. One row per **version** of the clerking for an encounter: `encounter_id, patient_user_id, version, supersedes_id, section_data jsonb` (the structured Hutchison sections — history/exam/synthesis, see §D; PHI free-text encrypted), `soap` derived, `authored_by_user_id, author_cadre_code, cosigned_by_user_id, status (draft|final), created_at`. Append-only (no UPDATE/DELETE); a correction is a new version.
3. **`encounter_diagnoses`** — `encounter_id, patient_user_id, icd10_code?, text, rank, must_not_miss bool, status (working|final|excluded), authored_by, created_at`. (From the differential.)
4. **`problem_list`** — patient-level: `patient_user_id, hospital_id, item, icd10_code?, active bool, onset?, resolved_at?, source_encounter_id, authored_by`. (Acute + chronic.)
5. **`patient_allergies`** — shape matches `db/schema/prescribing.ts` exactly: `hospital_id, patient_user_id, substance, reaction, severity (mild|moderate|severe|**anaphylaxis**|unknown), recorded_by_user_id, recorded_at`. **The prescribing allergy check reads this** (see §A — shared with 0039; 0040 is the authoritative owner; wiring the prescribing engine to it is a HARD pre-launch dependency).
6. **`encounter_medications`** — `encounter_id, patient_user_id, name, dose, route, frequency, status (active|stopped|suspended), source (clerking|prescribed), authored_by`.
7. **`encounter_orders`** — `encounter_id, patient_user_id, kind (bloods|imaging|bedside|special), loinc_code?, text, justification, status (ordered|collected|resulted|cancelled), authored_by` + **`encounter_results`** — `order_id, value, unit, abnormal_flag?, loinc_code?, resulted_at` (the execution is a later seam; the record exists now).
8. **`encounter_events`** — the **append-only encounter timeline**: `encounter_id, kind (documentation|diagnosis|order|result|medication|allergy|disposition|note|access), ref_id, label, actor_user_id, recorded_at`. Mirrors the resus-timeline append-only model.
9. **`clinical_access_log`** (or reuse `sa_audit_log`) — audit-on-read rows.

**SOAP mapping** (interoperability): the clerking persists structured but is projected to SOAP — **S** = history sections; **O** = examination + results; **A** = differential/diagnoses; **P** = orders + management/disposition.

## D. The clerkship structure (CSO ratify — the Hutchison sections)

The `clinical_documentation.section_data` is the structured clerking (reference §1–§3), **structured but flexible** (sections skippable/deferrable; free-text allowed within sections; emergency presentations defer the full clerking — focused history, resus first):

- **History:** identifying/opening · PC (patient's words) · HPC (+ **SOCRATES** for pain) · PMH/PSH (+ retrospective prompt + Uganda always-asks: HIV/TB/malaria/sickle-cell) · **DH + ALLERGIES** · FH · SH (occupation/exposures, smoking pack-years, **alcohol units + CAGE**, drugs, function) · **systematic enquiry** (all systems).
- **Examination:** general inspection (end-of-bed, spot-diagnosis, vitals link, consciousness) · peripheral signs (hands→eyes→mouth→neck) · system exams (IPPA) — positives **and** relevant negatives; hypothesis-driven.
- **Synthesis:** summary/problem representation · **ranked differential incl. must-not-miss** · problem list · **investigations justified by the differential** · **management + disposition + safety-netting** · consent/shared-decision note.

**Clerkship → engine objects (reuse, no parallel store):** allergies → `patient_allergies` (→ prescribing check); meds → `encounter_medications`; differential → `encounter_diagnoses` + `problem_list` (ICD-10); investigations → `encounter_orders`/`results` (LOINC); plan/disposition → `encounters.disposition` + care plan; everything → `encounter_events`.

**Triage seeds the clerking:** the triage disposition + PC + acuity + the carried `vitals_snapshot` pre-populate the new clerking (continuation, not a blank restart).

## E. Scope (first layer vs later)

- **First (this build):** the **general-adult clerkship** — full schematic history, general + system examination capture, synthesis — on the engine, as structured versioned documentation; the access model + audit + the triage handoff + the clerkship surface.
- **Later (flagged, not built):** particular-group flows (paediatric/obstetric/older/psychiatric/emergency/fever/pain — Hutchison Section 2); system-specific structured exam templates with embedded scoring (Section 3); order **execution** + results ingestion; the monitoring/care-team/discharge/notification seams; the **admission slice** (consumes the disposition).

## F. Build order

GATE A (this) · GATE B (schema + RLS + audit + versioning, TDD on the access-policy + versioning logic) · GATE C (clerkship-as-documentation engine + SOAP + clerkship→objects wiring + orders/results, TDD) · GATE D (triage handoff + clerkship surface + record/timeline view + workspace wiring + seams) · GATE E (adversarial review + ADRs + CHANGELOG + verification + PR). **Migration stays GATED; stop at GATE E for CSO sign-off + apply authorization.**

### What I need from the CSO at this gate

1. **The access model (§B)** — ratify the hospital-clinical read predicate vs the tighter care-team+break-glass variant; the cadre-write rules + the junior co-sign hook.
2. **The schema (§C)** — ratify the objects + the append-only/versioned documentation model.
3. **The clerkship structure (§D)** — the Hutchison sections + embedded content (SOCRATES/CAGE/always-asks/must-not-miss).
4. **Confirm** the gated-migration posture (apply on your authorization) + the general-adult-first scope.
5. Ideally: **the real `encounter-emr-engine-kickoff.md`**, so I can reconcile anything I inferred against your actual primary spec before the migration is applied.
