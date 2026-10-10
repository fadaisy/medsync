# Pharmacy Phase 0 — STOP reports

Prompt: [PROMPT-PHARMACY-PHASE-0.md](PROMPT-PHARMACY-PHASE-0.md). Branch `feat/pharmacy-front-door`, worktree
`~/Desktop/medsync-pharm0`, cut from **`feat/lab-front-door` @ `29dc006`** (not from `main`; see Q1).

---

## STOP 0 — Discovery and baseline

No product code changed. Added: this file, the prompt copy, `docs/NUMBERS.md` (the ledger, E-PH0-05), and
`tests/pharmacy/phase-0-baseline.test.ts`.

### Verdict

**STOP: the prompt's own dependency gate is not met.** Lab Phase 0 is finished (STOP 0–5, migration 0097, ADRs
0221–0226), but only on the local branch `feat/lab-front-door`. It is not pushed and not on `main` (Q1). This
branch is stacked on it so that Step 0 could read the modules the slice will reuse.

Three more findings would each stop the build on their own, and they change the plan before GATE A:

1. **Nothing groups the lines of a prescription (PQ-1).** `prescriptions` has one row per medicine. There is no
   header, basket, placement id or number (Q3, Q4). Under PQ-1 GATE A must choose between a grouping key and
   grouping by encounter, prescriber and placement time (D-PH0-08). One fact helps the second option: every line
   of one Plan placement shares the same `created_at`, because the write sets `now` once per transaction. Today
   that is an inference, not a key.
2. **The emergency-dose table the prompt names is empty.** `emergency_administrations` and `crash_carts` exist,
   because 0039 must be applied: 0074, applied in production on 27 Sep, alters `prescriptions`. **No code writes
   either table.** Every dose given on the resus desk is a `resus_timeline_events` row of kind `drug`, with the
   cart as free text of up to 48 characters, a witness id or name, and the amount (Q8). Section 5.5 has to read
   the timeline, or show nothing.
3. **Every prescription is already readable by any affiliated staff member, in the database.**
   `prescriptions_select_scoped` (0039:98-110) lets any active or approved affiliation at the hospital SELECT
   every row: reception, lab and pharmacy staff included, restricted indications included. The same is true of
   `emergency_administrations` and the cart tables (0039:150-172, 227-239). The app reads through the owner
   connection, so no screen shows this. A direct PostgREST call with a staff JWT would return the rows, if the
   platform's default grants to `authenticated` apply; they are not in the repo. Section 7's probe table
   ("Lab staff, reception: denied") cannot pass without changing this policy, and §7 says "no change to
   prescriptions". This is a new decision (D-new-3).

The other findings fit inside GATE A as decisions: no prescription number, no print record, check outcomes only
partly stored, no snapshot of weight, creatinine or allergies, and a lane that is known only after the visit
closes.

### Q1 — Lab Phase 0 and what is lab-specific

- **Not merged.** `origin/main` is 4087e4c. It has none of `lib/auth/landing.ts`, `lib/lab/access.ts`,
  `lib/lab/nav.ts`, `lib/lab/feature.ts`, `content/lab.ts`, `components/medsync/page-header.tsx` or 0097.
  `feat/lab-front-door` (29dc006, 9 commits ahead of main) has all of them. `git ls-remote` shows no remote
  branch.
- **Everything the pharmacy reuses is lab-specific today.** Only these parts are workspace-neutral: `PageHeader`,
  the `SidebarNav*` primitives, the `SignedCopy` type (but it lives in `content/lab.ts`), the landing helper
  `isSameOriginPath`, and the "`1` or a comma list of hospital ids" flag form.

| Piece                                      | Lab-specific parts                                                                                                                                                                                 | Generalise by                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Permission model `lib/lab/access.ts`       | imports the lab map (`:1`); `LAB_PERMISSIONS` (`:12-19`); `LabAccessFacts.headOf` laboratory/sections (`:35-40`); `PermissionMap` type not exported (`:22-27`)                                     | the map type and "signed map + cadre → permissions" as a neutral module; lab and pharmacy each pass their map |
| Grant `0097` `private.sync_lab_access`     | cadres hard-coded `IN ('LAB_TECH','LAB_TECHNOLOGIST')` (`:59`); role `'lab_tech'` (`:65,70`); audit `table_name 'lab_access'`; the backfill script (`scripts/lab/backfill-lab-access.ts:65,86`)    | a sibling `private.sync_pharmacy_access` of the same shape; 0097 is shipped and immutable                     |
| `resolveLanding` `lib/auth/landing.ts`     | `CadreGroup` has no pharmacy (`:14`); `LandingFacts.active` is `{doctor, lab}` (`:16-24`); `mayOpen` knows `/lab` only (`:88-94`); the loader `cadreGroup` (`app/(auth)/sign-in/landing.ts:33-40`) | add `pharmacy` to the group, the facts and `mayOpen`; the 37-row lab table test must stay unchanged           |
| Navigation `lib/lab/nav.ts`                | `LabNavId`, `/lab` hrefs, the `LabPermission` type (`:10-42`); renderer `lab-nav.tsx` with a lab icon map and a "Laboratory" crumb (`:17,101`)                                                     | a generic `NavItem<Id, P>` and `navFor`; each workspace registers its items                                   |
| Notice                                     | `flagging-notice.tsx:10-23` takes no props and is wired to `CRITICAL_FLAGGING_NOTICE`                                                                                                              | a `CautionNotice` taking `SignedCopy` text                                                                    |
| Flag and CF-3 `lib/lab/feature.ts:12-28`   | env name `LAB_WORKSPACE`; the production block imports the lab notice                                                                                                                              | `workspaceLiveFor(envName, hospitalId, notices)`                                                              |
| Refused page `app/not-authorised/page.tsx` | knows `?for=lab` only (`:22-31`)                                                                                                                                                                   | a `for` → copy map                                                                                            |

### Q2 — The earlier claims

| #   | Verdict                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Confirmed                  | SQL CHECK `0000_nosy_thunderbird.sql:74`, last changed `0033_reception_workspace.sql:57-69` (adds `reception`); `MFA_REQUIRED_ROLES` `lib/auth.ts:11-18`. **Drift:** the Drizzle CHECK `db/schema/user-roles.ts:27,42-50` lacks `reception`.                                                                                                                                              |
| P2  | Confirmed, council differs | Both cadres are in the sign-up picker (`components/onboarding/profession-field.tsx:8-32`). The map says `council: "PHARM_BOARD"` (`lib/onboarding/profession.ts:213,223`), shown as "Pharmacy Board of Uganda" (`:14`). The seeded council's name is "Pharmacy Board" (`0009_reference_data_seed.sql:136-139`; the seed comment says "NOT PSU", `:57`).                                   |
| P3  | Confirmed                  | Both cadres are in group `other` → `/clinician` (`lib/auth/landing.ts:36-42,68-73`). The `pharmacist` role → `/clinician` (`:55-60`; pinned in `tests/lab/landing.test.ts:50`). Screenshots below.                                                                                                                                                                                        |
| P4  | Confirmed                  | No `app/pharmacy`; no `/pharmacy` prefix in `proxy.ts:38-57`. The only `/pharmacy` string is a styleguide link to a page that does not exist (`app/styleguide/_components/chroma-demos.tsx:254`).                                                                                                                                                                                         |
| P5  | Confirmed                  | Approval writes `staff_affiliations` and `users.state` only (`supabase/functions/approve-staff-affiliation/index.ts:118-188`). `assign-role` accepts `pharmacist` (`assign-role/index.ts:43-51`) and has no caller in the app. The only SQL role grant is 0097, lab cadres only.                                                                                                          |
| P6  | Confirmed, untouched       | `lib/prescribing/pharmacy.ts:15-17`; the Plan dialog shows "Pharmacy not linked yet" (`components/clerking/plan/prescribe-dialog.tsx:992-995`); the stock check returns `not_checked` (`lib/prescribing/plan-checks.ts:322-323`).                                                                                                                                                         |
| P7  | Corrected                  | One row per medicine still, but 0074 added frequency, duration, quantity, instructions (encrypted), `confirmed_flags`, `sensitivity`, `client_key`, and 0088 added the Plan columns (Q3). States unchanged. Still nothing groups rows.                                                                                                                                                    |
| P8  | Corrected                  | "In basket" exists only in the Plan draft. "Awaiting co-sign" is derived from `clinical_cosign_requests` and is not a prescription state. Answers are stored per answered check, but the reasons are **one combined encrypted string per line**. Passed and noted outcomes are not stored (Q5).                                                                                           |
| P9  | Confirmed                  | Print at `/doctor/encounters/[id]/print/prescription`, linked from the desk panel (`components/emr/prescribing/panel.tsx:37`). The Plan has no print link.                                                                                                                                                                                                                                |
| P10 | Corrected                  | Columns confirmed (0039:189-216: `drug_id`, `drug_name`, `dose`, `amount_mg`, `cart_id`, `administered_by_user_id`, `witnessed_by_user_id`, `administered_at`). Append-only by comment only; there is no blocking trigger. **No code writes them**, and the live record is `resus_timeline_events` (Verdict 2). The cart tables are readable by any affiliated staff, reception included. |
| P11 | Confirmed, nuance          | The 3 signed emergency entries cover **4** formulary medicines (sodium chloride 0.9 % and Ringer's lactate both take the crystalloid bolus; `lib/prescribing/reference/formulary-regimens.ts:153-158`). Interactions: always `not_checked` (`plan-checks.ts:493-500`); no other code.                                                                                                     |
| P12 | Confirmed                  | Q1.                                                                                                                                                                                                                                                                                                                                                                                       |
| P13 | Confirmed                  | `PHARMACY` is a support department (`supabase/functions/_shared/services-hub.ts:96`); both keys are typed in section 6 (`:525-538`) and stored in `capability_values` (0080:204-222).                                                                                                                                                                                                     |
| P14 | Not re-read                | Untouched by this slice.                                                                                                                                                                                                                                                                                                                                                                  |
| P15 | Both sides partly right    | Dental cadres are **not** in `DOCTOR_CADRE_CODES` (`lib/doctor/scope.ts:33-50`), so they land on `/clinician` (the Coverage review is right). Imaging **is** orderable from the encounter and the Plan (`encounter_orders.kind` allows `imaging`, 0071:404-407; X-ray and ultrasound seeded, 0072:293,322; the Plan calls `placeOrders`, `lib/emr/write/plan.ts:486`).                    |

### Q3 — The prescription model

- **One table, one row per medicine or fluid:** `public.prescriptions` (`db/schema/prescribing.ts:58-171`):
  - 0039 created it (`0039_smart_prescribing.sql:64-89`).
  - 0074 extended it (`:24-35`).
  - 0088 extended it again (`:23-39`).
- **Columns:**
  - who and where: `hospital_id`, `encounter_id`, `patient_user_id`, `prescriber_user_id`, `prescriber_cadre`
  - the medicine: `drug_id`, `drug_name`, `dose` (text), `concentration`, `route`, `frequency`, `duration`, `quantity`, `instructions_ciphertext`
  - the reason: `indication`, `condition_id` (the Plan problem)
  - Plan details: `regimen_id`, `edits` (`[{field, from, to}]`), `method`, `infusion_over`, `diluent`, `prn`, `start`, `kind` (`drug`|`fluid`) and the fluid columns
  - check answers: `confirmed_flags`, `check_answers`, `confirm_reason_ciphertext`
  - other: `controlled`, `is_emergency`, `sensitivity`, `client_key`, `state`, `created_at`, `updated_at`
- **States:** `active | administered | completed | cancelled`.
  - Insert sets `active`.
  - `active → cancelled` only when a senior returns the co-sign (`withdrawReturnedPrescription`, `lib/emr/write/prescriptions.ts:271-303`).
  - `active → completed` at a home close, for medicines not continued (`lib/emr/write/encounter.ts:240-276`).
  - `administered` is never written.
  - There is no `cancelled_by` or `cancelled_at`. Who and when come from the co-sign row or `audit_log`.
- **Grouping:** none (Verdict 1).
  - `placePlan` returns ids but stores no group (`plan.ts:474-566`).
  - The basket exists only in the Plan draft (`lib/clerking/plan/draft.ts:79-84`).
  - The print groups "every non-withheld row of the encounter" (`print/prescription/page.tsx:40-45`).
- **Plan versus emergency (PQ-4):**
  - Both EMR writers set `is_emergency = false` (`write/prescriptions.ts:237`, `write/plan.ts:304`), and every reader filters on it.
  - No code inserts `true`.
  - **PQ-4 holds:** queue rows are `is_emergency = false`, and resus doses are not in this table at all.
  - Plan rows always carry `condition_id`. EMR-sheet rows do not.
- **Co-sign:** `clinical_cosign_requests` (`db/schema/doctor-workspace.ts:99-150`).
  - `action_kind` is `prescription_routine | prescription_controlled`.
  - `action_payload` is `{prescriptionId, encounterId}`.
  - `state` is `pending_review | approved | returned | cancelled | expired`, plus the reviewer, time and note.
  - One request per line.

### Q4 — A number on the paper

**None.** The printout shows:

- the hospital, the patient's name and MRN, age and sex, and the date of the newest row;
- each line;
- the prescriber and cadre, and a signature line (`print/prescription/page.tsx:96-121`; `components/emr/print-layout.tsx:61-86`).

There is no number column and no sequence. **Find a prescription can take the patient number (MRN) only** (§5.7 fallback).

### Q5 — Check outcomes

- **Plan checks** (`lib/prescribing/plan-checks.ts:31-47`):
  - `allergy`, `allergy_status`, `dose_reference`, `kidney`, `weight`, `child`, `duplicate`, `indication`, `cultures`
  - `interactions` (always not checked), `stock` (always not linked), `cosign`, `controlled`
  - three engine checks (concentration, max cumulative, contraindication)
- **Stored per line, only for checks that needed an answer** (`:535-541`):
  - the code, in `confirmed_flags`;
  - the answer id, in `check_answers` (`not_allergic`, `senior_agreed`, `no_alternative`, `aware_monitor`, `result_awaited`, `other`);
  - **one combined encrypted text** for every reason and the witness, in `confirm_reason_ciphertext` (`plan.ts:282-285,307`).
- **Never stored:**
  - the outcome level (Stop, Check, Note), its message, or the value that triggered it;
  - passed or not-applicable results;
  - whether the dose was typed. This one can be derived, because `regimen_id` is null when no signed regimen resolved (`plan.ts:315`).
- **What a chip can honestly say:**

  | Chip                         | What it rests on                                                                                                                                                                                 |
  | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `Controlled drug, witnessed` | `controlled`                                                                                                                                                                                     |
  | `Child under 16`             | the `child` code answered                                                                                                                                                                        |
  | `Renal check answered`       | the `kidney` code answered                                                                                                                                                                       |
  | `Typed dose`                 | `regimen_id` null on a drug line                                                                                                                                                                 |
  | "Stop overridden"            | **none** without a code → level table. Every allergy stop is overridable, and an answered `allergy` is an overridden stop. GATE A should sign a code → level list from `plan-checks.ts` as data. |

- **"Reason given, verbatim" (§5.4):** possible only as the whole decrypted string of the line, not per check.

### Q6 — Prints and changes

- **No print event.** Print is `window.print()` (`components/emr/print-toolbar.tsx:19`). Opening the print page writes one `clinical_phi_access_log` row (`surface = emr_print_prescription`), with no prescription ids, no version and no copies.
- **No line is edited after insert.** Only `state` changes, recorded by `updated_at` and the `audit_log` trigger (0039:112-120).
- **"Changed since printing" can never be shown.** The neutral "Changed hh:mm" (PQ-7 fallback) applies to state changes only.

### Q7 — Window or ward

- Nothing on the prescription says where the patient is going.
- The Plan's disposition lives in the mutable draft (`draft.ts:46-55`). `encounters.disposition` is set only at close (`lib/emr/encounter.ts:56-87`). `admissions.source_encounter_id` marks an admission (0091:28-61).
- **The lane is known only once the visit closes:**
  - `home` or `referred_out` → window;
  - `admitted`, an admission row, or `encounter_type = 'inpatient'` → wards;
  - an open visit → unknown.
- GATE A decides where unknown rows go. They stay under "All".

### Q8 — Emergency doses and carts

- 0039 tables:
  - `crash_carts`: `id, hospital_id, department_id, label`.
  - `crash_cart_stock`: `on_hand, par_level, expires_at`.
  - `emergency_administrations` (columns as in P10).
- RLS is SELECT-only: superadmin, the patient, the giver, or any active or approved staff at the hospital, with no clinical filter.
- **Nothing reads, writes or updates them** (`db/schema/prescribing.ts:173-251` types only).
- **The live record:** `recordEmergencyAdministration` (`app/nurse/resus/actions.ts:1183`) → `appendResusEvent` writes `resus_timeline_events` (0038:97-120) with kind `drug`.
  - The payload carries `drugId`, dose, concentration, route, `amountMg`, `cart` (free text, `actions.ts:1153`), the giver and cadre, `witnessUserId` or `witnessName`, `controlled` and the override.
  - Pathway doses on the ABCDE steps are also kind `drug`, without a cart (`:570,669`).
- **Controlled-drug witness:** enforced at `actions.ts:1191-1192`.
- **D-PH0-13 stands either way:** no stock figure exists to show.

### Q9 — Approval, cadres, councils

- **`approve-staff-affiliation`:**
  - Input: `{affiliation_id, reason ≥ 8, licence_valid_until?}`.
  - Checks: the affiliation is `pending_approval`; the caller is superadmin or that hospital's admin; a clinical cadre needs a licence document (`licence_missing`).
  - It writes `sa_audit_log` first, then sequential REST updates. **It is not a transaction.**
  - The lab solved "in the same transaction" with an `AFTER` trigger on `staff_affiliations` (0097). The pharmacy can do the same.
- **Cadres:**
  - `PHARMACIST` (`0009:166`) and `PHARMACY_TECH` (`0009:167`), both `is_clinical = true`, council `PHARM_BOARD`.
  - Roles: `PHARMACIST_WARD`, `PHARMACIST_GENERAL`, `PHARMACY_TECH_GENERAL`.
  - **No pharmacy intern cadre**; the only intern cadre is `INTERN_DOCTOR`.
  - **The technician's registering body is not confirmed by any source in the repo.** The map simply places both cadres under `PHARM_BOARD` (Appendix C still applies).

### Q10 — Services hub

**On this branch and on `main`.**

- `PHARMACY` is a support department.
- Units are `hospital_departments` rows with `parent_id`; `add_unit` refuses a unit of a unit (`ops-structure.ts:534-579`).
- Heads are effective-dated (`department_heads`). Places and `service_hours` exist (0080:21-49,103-120).
- `pharmacy_dispensing_points` (count, max 50) and `pharmacy_24h` (yes/no) are typed, `routing:false`, in section 6.
- **CAP-3 derivation exists for ward bed counts only** (`derivedCapabilities(wards)`, `services-hub.ts:928-950`). A pharmacy derivation is new code.
- An affiliation can point at a unit, as lab sections do.
- **Archive:**
  - Department archive is blocked while staff are active, approved **or pending**.
  - The server archives a unit by id.
  - **The UI has no per-unit Archive button** (`departments-view.tsx:970-985`).
- Section [06] Pharmacy renders on the "Emergency & support" tab.

### Q11 — Landing today (on this branch)

| Who                                                                  | Lands on                                                                                                                               | Line (`lib/auth/landing.ts`) |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `superadmin`                                                         | `/admin`                                                                                                                               | 52                           |
| `hospital_admin`                                                     | `/hospital-admin`                                                                                                                      | 53-54                        |
| clinical role + active doctor-cadre affiliation                      | `/doctor`                                                                                                                              | 56                           |
| `lab_tech` + active lab affiliation                                  | `/lab`                                                                                                                                 | 58-59                        |
| other clinical role (`clinician`, `nurse`, **`pharmacist`**)         | `/clinician`                                                                                                                           | 60                           |
| no role, hospital application pending/under review/verified/rejected | `/onboarding/hospital-pending`                                                                                                         | 62-66                        |
| no role, latest affiliation approved/active                          | doctor `/doctor`, nurse `/nurse`, reception `/reception`, lab `/lab`, **other (incl. PHARMACIST, PHARMACY_TECH, dental) `/clinician`** | 68-73                        |
| no role, latest affiliation in another state                         | `/onboarding/clinical-pending`                                                                                                         | 74                           |
| patient profile                                                      | `/patient`                                                                                                                             | 76                           |
| anyone else                                                          | `/`                                                                                                                                    | 77                           |

- `app/clinician/layout.tsx:37-39` forwards doctors to `/doctor/schedule` and lab users to `/lab` (`isLabTechUser`, which shares the gate's query). Pharmacy users have no forward; the pattern is one `isPharmacyUser` plus one line.
- `requireClinicianScope` asks for AAL2 even when MFA is not required (`lib/clinician/scope.ts:57-58`).

### Q12 — Weight, creatinine, allergies

- **The Plan reads them live:**
  - `loadPlanFacts` (`plan.ts:64-120`) reads weight and creatinine from `clinical_observations` / `triage_records` through `lib/facts/loader.ts:162-205`.
  - Allergies come from `allergies` + `allergy_status_assertions` (`lib/emr/read/allergies.ts:7-35`).
- **No snapshot is stored on the prescription.** `weightAt` is checked but not inserted (`plan.ts:233-237`). The view can show current values with their own dates only; "at prescribing" (RV-3) never applies today.

### Q13 — Restricted classes

- **Tagged:**
  - `diagnosis_terms.sensitivity` (28 restricted terms: HIV, mental health, STIs, TB forms; 0072, 0085);
  - `conditions` and `medication_statements` carry `sensitivity`;
  - `drug_class_tags.sensitivity` (antipsychotics, boosted PIs, dolutegravir).
- **`prescriptions.sensitivity` is always `standard`** (`write/prescriptions.ts:241`, `plan.ts:308`). A restricted indication is found only through `condition_id → conditions.sensitivity`.
- **Filtering today:**
  - a RESTRICTIVE policy hides restricted rows from the patient's own client (0074:58-61);
  - the print withholds restricted items unless they are included one by one (`print/_lib/load.ts:37-46`).
- D-PH0-06 has a mechanism to act on.

### Q14 — Identity

- **`identitiesFor`** (`lib/emr/read/results.ts:58-100`):
  - takes `(viewer, patientIds, surface, database?)` and returns `{name, mrn, ageSex}`;
  - is batched: one `patient_profiles` read, then `revealPatientIdentities` (`lib/scheduling/patient-identity.ts:66-126`), which writes one multi-row `clinical_phi_access_log` insert per page;
  - fails closed to "Name withheld", with the MRN still shown.
- **`clinical_phi_access_log.surface` is free text.** `pharmacy_queue` and `pharmacy_prescription_viewed` fit with no schema change.
- **`audit_log` has no kind column.** Lab precedent: `event` goes inside `after_data`, with a free `table_name`.

### Q15 — Signed dose references (CS-3)

- **The Plan's list:** formulary MS-RX-CAT-001, **192 medicines**, all `to-verify` (`lib/prescribing/reference/general-formulary.ts:776`).
- **Signed regimens:** 4 medicines from 3 emergency entries (`formulary-regimens.ts:136-158`).
- **The numbers come from static TypeScript, global, not per hospital.** No formulary table exists.
- **CS-3 decision:** the notice can count "4 of the 192" globally from the shipped catalogue. The prompt's "3 of 212" is out of date. Alternatively, the wording without numbers is used.
- The older EMR sheet uses the 27 prescribable emergency entries, which carry their own signed reference.

### Q16 — Flags

- All flags are environment variables. The per-hospital form is `1` or a comma list of ids, chained (`lib/emr/feature.ts:13-88`).
- **Plan prescriptions exist only where `CLERKING_PLAN_V2` and `EMR_PRESCRIBING` are on.** EMR-sheet prescriptions need `EMR_PRESCRIBING`.
- Production values are not visible from the repo.

### Q17 — UI

- **Components:**
  - `PageHeader` `{place, title, subline?, right?, placeInTopBar?}` (`components/medsync/page-header.tsx`).
  - `SidebarNavItem` (`domain`, `count`, `countTone` neutral|caution) and `SidebarWorkspace` (`components/medsync/sidebar-nav.tsx`).
  - The lab shell is typed to the lab (`app/lab/_components/lab-shell.tsx:26-50`).
- **Hue:** DESIGN-medsync.md:97 gives one hue, **grape**, to "Pharmacy & lab" ("Prescribing, dispensing, e-pharmacy…"). Plum is Operations (`:98`). §5.2's "plum (ADR 0097)" is out of date: Chroma replaced it, and "ADR 0097" in the prompt is not the 0097 migration. **Grape governs.**
- **Caution:** `status-caution` tokens. `StatusWord` (`components/emr/status-word.tsx:18-57`) has a neutral and a caution tone; the caution tone uses `text-amber-800` because the token pair is 2.8:1.
- **Red scarcity:** `tests/design/red-reserved.test.ts:293-326` is the lab block. Copy it for `app/pharmacy`, `lib/pharmacy` and `content/pharmacy.ts`.

### Q18 — Test tools

- **Playwright: not installed.** Lab GATE A chose a scratch harness over new dependencies (D-LAB0-19).
- **axe-core** is a devDependency.
- **PGlite** is not a repo dependency. It is symlinked from `~/Desktop/emr-harness` (`tests/emr-db/_pglite.ts:1-11`; the `test:emr-db` lane).
- **The lab harness is forked to `~/Desktop/pharm0-harness`:**
  - ports 4001 / 54332;
  - reads this worktree;
  - `HARNESS_USER` is selectable;
  - the `lab_tech` role fallback is removed;
  - a Pharmacy department and two fixtures are added.

### Q19 — Numbers

- **Highest numbers:**
  - `origin/main`: migration 0096, ADR 0220.
  - `feat/lab-front-door` and this branch: 0097, ADR 0226.
  - No other branch is higher.
- **Collisions:** no migration number collides. **ADR 0073** has two files (one on `origin/feat/exam-consistency-qc` only).
- **Claimed in `docs/NUMBERS.md`:** migrations **0098–0117** and ADRs **0227–0241**.

### Q20 — Service key

**Flagged:** `SUPABASE_SERVICE_ROLE_KEY` is still the only key read (`lib/env.ts:16,86`; `lib/supabase/service.ts:17`; `supabase/functions/_shared/auth.ts:20-23`). This is unchanged since the lab's Q19.

### Prompt versus repo

| #   | Prompt says                                                                                                                                        | Repo has                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Cut from `main` after the lab's access step merges                                                                                                 | Lab is finished but local only; this branch is stacked on it                                            |
| 2   | Node 22 + pnpm                                                                                                                                     | npm, Node 24 (`.nvmrc`)                                                                                 |
| 3   | One row = one placed prescription; use the repo's grouping                                                                                         | No grouping, no header, no number (Verdict 1, Q3, Q4)                                                   |
| 4   | Emergency doses from `emergency_administrations` by cart                                                                                           | Table empty; doses live in `resus_timeline_events`, cart is free text (Verdict 2, Q8)                   |
| 5   | New RLS SELECT paths for `pharmacy.view`; reception and lab denied                                                                                 | Any affiliated staff can already SELECT every prescription and dose (Verdict 3)                         |
| 6   | "Changed since printing" from print events                                                                                                         | No print events; only `state` ever changes after insert (Q6)                                            |
| 7   | Checks cell from stored outcomes (overridden stop, etc.)                                                                                           | Only answered codes, answer ids and one encrypted reason per line; no level, no message (Q5)            |
| 8   | Weight, creatinine, allergies "at prescribing" when stored                                                                                         | Never stored; current values with dates only (Q12)                                                      |
| 9   | "3 of the 212 medicines"                                                                                                                           | 4 signed of 192, global, static (Q15)                                                                   |
| 10  | Plum for the active item                                                                                                                           | Grape ("Pharmacy & lab", DESIGN-medsync.md:97)                                                          |
| 11  | Lane from disposition at placement                                                                                                                 | Disposition only at close; an open visit has no lane (Q7)                                               |
| 12  | Grant "in the same transaction as the approval"                                                                                                    | Approval is an Edge Function of REST calls; a trigger on `staff_affiliations` (lab precedent) gives it  |
| 13  | Revoke on affiliation end and cadre change                                                                                                         | The 0097 trigger covers state, cadre and hospital changes and deletes; no end-affiliation action exists |
| 14  | A pharmacy intern row "until the onboarding decision"                                                                                              | No intern cadre exists; nothing to map                                                                  |
| 15  | Derived dispensing-point values (CAP-3 pattern)                                                                                                    | Derivation exists for ward beds only; new code                                                          |
| 16  | A hub row has "Archive"                                                                                                                            | Server can archive a unit; the UI has no per-unit button                                                |
| 17  | Playwright scenarios                                                                                                                               | Not installed; the lab used the scratch harness                                                         |
| 18  | Read `PROMPT-HOSPITAL-SERVICES-HUB.md`, `PROMPT-ONBOARDING-V2.md`, `PROMPT-DOCTOR-WORKSPACE-UNIFIED.md`, `PROMPT-RESUS-DESK-V2.md` "under `docs/`" | Not checked one by one; the code they describe was read directly                                        |

### Failing tests

`tests/pharmacy/phase-0-baseline.test.ts`, as `it.fails` (green while the defect exists):

- **P3:** an approved pharmacy professional lands on `/pharmacy`.
- **P4:** `/pharmacy` exists.
- **P5:** approving a pharmacy cadre grants access, audited.

Run: **3 expected-fail**.

### Baseline

| Check                                      | Result                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` (8 GB heap)            | 0 errors                                                                                                                                                              |
| `npm run lint`                             | 0 errors, 2 old warnings                                                                                                                                              |
| `npx vitest run` (`SKIP_ENV_VALIDATION=1`) | 357 files passed, 65 skipped; **8,808 passed**, 914 skipped, 0 failed                                                                                                 |
| Screenshots, pharmacist and technician     | `~/Desktop/pharm0-harness/shots/stop0/` (12 PNGs): `/clinician` and `/pharmacy` at 1440×900, 834×1194, 390×844 for each                                               |
| What they show                             | Both see **"Your availability"** under a **CLINICIAN** header: a patient-booking page that asks a pharmacist to declare bookable hours. `/pharmacy` is the public 404 |
| Where each lands at sign-in                | `/clinician` (resolver table above; the harness bypasses the password step, so landing is proven by `resolveLanding`, not a screenshot)                               |
| Budgets now                                | Navigations from sign-in to a queue: no queue exists. Sidebar items: 0. Pharmacy staff who must be told a URL: all of them                                            |
| Test-hospital counts                       | **Not taken**: production reads are blocked for this session; the query is below                                                                                      |

### Needed before Step 1

**1. The dependency (Q1).** Pick one:

- **(a)** Merge `feat/lab-front-door` to `main`. Then this branch rebases onto `main` unchanged.
- **(b)** Allow Pharmacy Phase 0 to proceed stacked on the lab branch, with both merged in order.

**2. Four decisions found here, to add to GATE A:**

- **D-new-1, grouping:** add a `placement_id` to new prescriptions (a migration and a one-line change in `placePlan` and the sheet write) and group older rows by encounter + prescriber + `created_at`, marked "grouped by time". This touches the prescribing write path, which §7 and §15 rule out, so it needs your explicit yes. Otherwise use time grouping only.
- **D-new-2, emergency doses:** read `resus_timeline_events` (kind `drug`) through a server function, and show the cart text as typed. The alternative is to drop §5.5 from this slice.
- **D-new-3, the open read:** narrow `prescriptions_select_scoped`, the cart policies and `emergency_administrations_select` to clinical cadres plus `pharmacy.view`, as a new migration. The alternative is to record the exposure and leave it.
- **D-new-4, the checks:** sign a code → level list (which `check_answers` codes are stops) so "stop overridden" rests on data. Otherwise the cell lists answered checks by name, with no "stop" wording.

**3. Baseline counts.** Run read-only in the Supabase SQL editor:

```sql
select h.name as hospital,
  (select count(*) from staff_affiliations sa join cadres c on c.id = sa.cadre_id
    where sa.hospital_id = h.id and sa.state in ('approved','active')
      and c.code in ('PHARMACIST','PHARMACY_TECH')) as approved_pharmacy_staff,
  (select count(*) from prescriptions p where p.hospital_id = h.id and not p.is_emergency
    and p.created_at > now() - interval '7 days') as rx_lines_7d,
  (select count(distinct (p.encounter_id, p.prescriber_user_id, p.created_at)) from prescriptions p
    where p.hospital_id = h.id and not p.is_emergency
      and p.created_at > now() - interval '7 days') as rx_placements_7d,
  (select json_object_agg(state, n) from (select p.state, count(*) n from prescriptions p
    where p.hospital_id = h.id and not p.is_emergency and p.created_at > now() - interval '7 days'
    group by p.state) s) as rx_by_state_7d,
  (select count(*) from prescriptions p where p.hospital_id = h.id
    and jsonb_array_length(p.check_answers) > 0) as lines_with_answers,
  (select count(*) from resus_timeline_events e join resus_episodes r on r.id = e.episode_id
    where r.hospital_id = h.id and e.kind = 'drug') as resus_drug_events,
  (select count(*) from emergency_administrations a where a.hospital_id = h.id) as emergency_admin_rows
from hospitals h order by 1;
```

The signed and listed medicine counts are static: 4 of 192.

**4. Tooling:** reuse the scratch harness, as the lab did (D-LAB0-19), rather than adding Playwright.

### STOP 0 answers (10 Oct 2026, in session)

- **Branches:** pharmacy stays on its own branch, stacked on lab Phase 0. Lab Phase 1 runs separately.
- **D-new-1:** add a placement id.
- **D-new-2:** read emergency doses from the resus timeline.
- **D-new-3:** narrow the open read policies.

---

## STOP 1 — GATE A proposal

[gate-a-proposal.md](gate-a-proposal.md) covers:

- the access model (`pharmacy_staff` carrier, trigger grant, the generalisation plan);
- the landing before and after;
- the screens, with phone rows;
- the rules with worked examples (a cancelled line and a changed row included);
- the read list, field by field;
- every string with its status;
- migrations 0098–0101, the RLS probe table, the test plan, ADR drafts 0227–0237, and decisions D-PH0-01 to -22.

**Critique pass, first round, three fixes:**

- doses in the wireframes replaced with placeholders (Law 5, canvas rule);
- the read list given a source and a reason per field;
- the Appendix B strings added with their status.

**Second round:** no further change.

**The backfill dry-run list** cannot be produced without production access; the script lists it once 0098 is applied.

**Signed 10 Oct 2026, in session:**

- D-PH0-01 to -22 and E-PH0-01 to -06, as recommended;
- the permission map v1 with both cadres (the technician's registering body to be confirmed later).

Not signed: the notice and caution wording, kept `draft` by choice; CS-5 keeps production off.

---

## STOP 2 — Access

### What was built

| Piece          | File                                                   | What it does                                                                                      |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Permission map | `data/pharmacy/permission-map.v1.json`                 | v1.0.0, signed                                                                                    |
| Access engine  | `lib/pharmacy/access.ts`                               | six names, one grant                                                                              |
| Flag           | `lib/pharmacy/feature.ts`                              | `PHARMACY_WORKSPACE`, with the CS-5 production gate over every `draft` string                     |
| Copy           | `content/pharmacy.ts`                                  | every §5.7 string; the notice and cautions `draft`                                                |
| Scope          | `lib/pharmacy/scope.ts`                                | `requirePharmacyScope`: not found with the flag off, not-authorised without `pharmacy.view`, AAL2 |
| Forward        | `lib/pharmacy/scope.ts`                                | `isPharmacyUser`, used by the 307 from `/clinician`                                               |
| Landing        | `lib/auth/landing.ts`, `app/(auth)/sign-in/landing.ts` | the `pharmacy` group, set only where the flag is on; `active.pharmacy`; `/pharmacy` in `mayOpen`  |
| Refused page   | `app/not-authorised/page.tsx`                          | `?for=pharmacy`                                                                                   |
| MFA            | `lib/auth.ts`                                          | `pharmacy_staff` in `MFA_REQUIRED_ROLES`                                                          |
| Backfill       | `npm run pharmacy:backfill-access`                     | dry run by default                                                                                |

**Generalised once:**

- `lib/workspace-access/access.ts`: a signed cadre map → permissions, and `mapProblems`.
- `lib/workspace-access/flag.ts`: the `1`-or-list flag and the production gate over signed copy.
- `content/signed-copy.ts`: the `SignedCopy` type.

The lab's `access.ts`, `feature.ts` and `content/lab.ts` now sit on these with the same exports.

**Changed from the proposal:** the shared modules live in `lib/workspace-access/`, not `lib/workspace/`. That folder is the doctor workspace's own (lanes, flow, `doctorWorkspace`). A first write overwrote its `feature.ts`; typecheck caught it and the file was restored from git unchanged.

### Migrations (GATED, owner-applied, in order)

- `0098_pharmacy_access.sql`:
  - the `user_roles` CHECK gains `pharmacy_staff` (the Drizzle CHECK also gains the missing `reception`);
  - `private.sync_pharmacy_access`, and the trigger `staff_affiliations_pharmacy_access`.
- `0099_prescription_placement.sql`:
  - `prescriptions.placement_id uuid NULL`;
  - index `(hospital_id, created_at)`.
  - The writers start filling it in Step 3.
- `0100_prescription_reads.sql`:
  - `private.reads_hospital_prescribing(hospital)`: clinical cadres except lab and pharmacy, or `pharmacy_staff` at that hospital;
  - it replaces the four 0039 SELECT policies on prescriptions, emergency administrations, crash carts and crash-cart stock.
  - Superadmin is no longer read by role.

### RLS and trigger probes

`tests/emr-db/pharmacy-access.test.ts`, PGlite, every migration replayed: **35 of 35**.

| Actor                                    | prescriptions         | emergency_administrations | crash_carts | crash_cart_stock |
| ---------------------------------------- | --------------------- | ------------------------- | ----------- | ---------------- |
| Pharmacist, same hospital, granted       | 2 (incl. restricted)  | 1                         | 1           | 1                |
| Pharmacy technician, same hospital       | 2                     | 1                         | 1           | 1                |
| Doctor, same hospital                    | 2                     | 1                         | 1           | 1                |
| Nurse, same hospital                     | 2                     | 1                         | 1           | 1                |
| Pharmacist awaiting approval             | 0                     | 0                         | 0           | 0                |
| Lab technician, same hospital            | **0** (was 2)         | **0**                     | **0**       | **0**            |
| Reception, same hospital                 | **0** (was 2)         | **0**                     | **0**       | **0**            |
| Hospital admin (role only)               | 0                     | 0                         | 0           | 0                |
| Doctor or pharmacist of another hospital | 0                     | 0                         | 0           | 0                |
| Superadmin, no break-glass               | **0** (was 2)         | **0**                     | **0**       | **0**            |
| The patient                              | 1 (restricted hidden) | 1                         | 0           | 0                |
| Anonymous                                | 0                     | 0                         | 0           | 0                |

- **Writes:** pharmacist, doctor and nurse INSERT, UPDATE and DELETE on prescriptions and emergency doses: denied or 0 rows.
- **The sync:** `authenticated` and `anon` cannot run `private.sync_pharmacy_access`. Staff cannot write `user_roles`.
- **Mutation check:** with 0100 removed, the lab, reception and superadmin rows fail (they read 2 / 1 / 1 / 1). The probes catch the old exposure.

**Trigger probes:**

- approve a Pharmacist and a Pharmacy technician (granted, audited);
- approve a nurse, lab technician, medical officer or reception (nothing);
- suspend and deactivate (revoked, audited); reactivate (granted again);
- idempotency; a cadre change; per hospital; a hand-granted row removed;
- the backfill path (granted, then unchanged);
- the lab's grant unchanged beside it.

### Audit rows

From the harness, where seeding fired the trigger:

```
{action: insert, event: pharmacy_access_granted, basis.cadre_name: "Pharmacist",          basis.council: PHARM_BOARD}
{action: insert, event: pharmacy_access_granted, basis.cadre_name: "Pharmacy Technician", basis.council: PHARM_BOARD}
```

A revocation is `action: delete`, `before_data.event: pharmacy_access_revoked`, with `reason {affiliation_id, to_state}`, asserted in the probes.

### Landing table test

- `tests/pharmacy/landing.test.ts` covers:
  - LD-P2: role path and affiliation path → `/pharmacy`;
  - flag off → `/clinician`;
  - a pending applicant;
  - LD-P3: doctor and lab outrank;
  - LD-P5: honoured, refused with prefix, open redirect ignored;
  - LD-P1 and LD-P4 by source.
- `tests/lab/landing.test.ts` (37 rows) runs **unchanged and green**.

### Lab regression

`tests/lab` (14 files) and `tests/doctor/cadre-routing.test.ts` pass unchanged. The PGlite lab lanes (`lab-access`, `lab-reads`) pass unchanged.

### Backfill dry run

Against the harness database: "0 approved pharmacy staff without pharmacy access" (both fixtures were granted by the trigger at seeding). Production: you run it after 0098.

**Caution:** from a worktree, the script loads the main checkout's `.env.local` (production), as `db:migrate` does. An explicit `DATABASE_URL` wins.

### Checks

- typecheck: 0 errors.
- lint: 0 errors, 2 old warnings.
- `vitest`: 427 files, **8,835 passed**, 1 expected-fail (P4), 0 failed.
- PGlite lane: 31 files, **521 passed**.
- P3 and P5 flipped to passing tests.

---

## STOP 3 — Engines

### The two prescribing-write changes (approved at STOP 0, signed at GATE A)

- **`lib/emr/write/plan.ts`:**
  - `placePlan` draws one `placementId` per basket and every line carries it;
  - each `check_answers` entry now stores the check's level (`{code, answer, outcome}`), from the same `checks` the writer already computed.
- **`lib/emr/write/prescriptions.ts`:** one sheet prescribe is one placement.
- **Proven on the lane:**
  - `write-plan`: both lines of a basket share one id; an allergy override stores `outcome: "stop"`; answered checks store `"check"`.
  - `write-prescriptions`: a placement id is set.
  - Every other assertion in both suites passes unchanged (18 of 18).

### Engines (pure)

| Module                              | Holds                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `lib/pharmacy/queue.ts`             | `computeQueue`, `laneOf`, `lineState`, `rowState`, `placementKey`, `defaultLane` |
| `lib/pharmacy/checks.ts`            | answered checks from stored data, the PQ-8 chips                                 |
| `lib/pharmacy/prescription-view.ts` | the read-only view model                                                         |
| `lib/pharmacy/check-state.ts`       | `pharmacyChecksState`; counts 4 of 192 at run time from the shipped catalogue    |
| `lib/pharmacy/emergency-doses.ts`   | timeline events → dose rows by cart                                              |
| `lib/pharmacy/nav.ts`               | the pharmacy's two registered items, on `lib/workspace-access/nav.ts`            |

`lib/lab/nav.ts` is rebuilt on `lib/workspace-access/nav.ts` with the same exports.

**Changed while building:**

- The lane rule also reads the legacy disposition codes the CHECK still allows: `admit` and `observe` are ward; `discharge`, `refer` and `transfer` are window.
- **"Changed hh:mm"** comes from a line no longer `active`, not from `updated_at > created_at`. The writer stamps `created_at` from the app clock and `updated_at` from the database clock, so the comparison would have marked untouched rows as changed. This is noted in the code with its ceiling: if prescribing ever edits lines in place, an event log is needed.

### Reads

`lib/pharmacy/read.ts`:

- `getPharmacyQueue` and `findPrescriptions` (exact patient number; 30-day look-back);
- `getPrescription` (by placement id or time key) and `patientFacts` (current weight, creatinine and allergies, each dated);
- `logPrescriptionViewed` (one `audit_log` row per open, none within a minute);
- `getEmergencyDoses`.

Every read is hospital-scoped, reads as the owner with an explicit field list, and returns the server time.

### New finding, fixed under the signed read list: migration 0101

- **The problem:** an RLS probe across every table found that pharmacy staff could already read `encounters` through the client. 23 client SELECT policies admit any affiliation in a clinical cadre, inline (`c.is_clinical = true`) or through `public.is_active_clinical_staff()`, and the pharmacy cadres are clinical. That reach covers:
  - encounters, observations, triage, the MAR and handovers;
  - admissions, beds and visit summaries;
  - the resus record and three realtime channels.
- **The fix:**
  - `0101_pharmacy_outside_clinical_reads.sql` takes the two pharmacy cadres, and nothing else, out of that predicate.
  - The function is redefined in place, and the nine inline policies are recreated with one added line.
  - Every other cadre, role and branch is unchanged.
- **Probes** (`pharmacy-access`, "0101"):
  - pharmacist and technician read 0 encounters, resus episodes and timeline events;
  - doctor, nurse and physiotherapist read as before;
  - the shared predicate is false for pharmacy and true for nurse, physiotherapist and lab;
  - the cadre list is checked against the signed map in all 10 places.
- **Mutation check:** without 0101, all five fail.
- **Lab, reported, not changed:** lab cadres keep the same broad reach. That is the lab's to decide.
- **Numbering:** dispensing points move to **0102**.

### Rule coverage (each ID named in at least one test)

| Rules                   | Where                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| PA-1..5                 | `tests/pharmacy/access.test.ts`                                                                                  |
| PA-6, RV-7              | `tests/emr-db/pharmacy-access.test.ts` (0100 + 0101 probes); `requirePharmacyScope` in every page from Step 4    |
| PA-7                    | `pharmacy-access` (trigger probes)                                                                               |
| PA-8, NV-P2             | `tests/lab/*` unchanged and green                                                                                |
| LD-P1..5                | `tests/pharmacy/landing.test.ts`                                                                                 |
| PQ-1, 3, 5–11, 13, DP-4 | `tests/pharmacy/queue.test.ts`; PQ-1, 3, 5, 6, 11 also on the lane (`pharmacy-reads`)                            |
| PQ-2                    | by construction: no number exists or is made (`QueueRow` has none); the screen in Step 4                         |
| PQ-12                   | Step 4: identities through `identitiesFor` at the page, one batch per load                                       |
| RV-1, 3, 6              | `pharmacy-reads`                                                                                                 |
| RV-2, 4, 5              | `tests/pharmacy/engines.test.ts`; RV-2 also on the lane (`"1/2 tab "` byte for byte)                             |
| CS-1..4                 | `engines.test.ts`                                                                                                |
| CS-5                    | `tests/pharmacy/feature.test.ts`                                                                                 |
| ED-1..5                 | `engines.test.ts`; ED-1..4 also on the lane                                                                      |
| NV-P1                   | `engines.test.ts`                                                                                                |
| DP-1..3                 | Step 5 (the hub panel)                                                                                           |
| Law 2                   | `engines.test.ts`: the only write in `lib/pharmacy` is the view log; the `/pharmacy` action scan comes in Step 4 |

### Property tests

- **PQ-13:** 500 seeded random queues (0–24 placements of 1–4 lines; 10 % from another hospital; random lanes, states, sorts). Every placement appears exactly once under All, lanes add up to All, and states add up within the lane: **500 of 500**.
- **ED-4:** 300 random timelines. Cart counts sum to the total, and each cart tab holds its count: **300 of 300**.

### Time

`periodRange` is checked at the Kampala day boundary. At 23:30 local the day started at 21:00 UTC the day before; at 00:30 a new day has begun. Yesterday, 7 days and 30 days are tested too. The client-side wrong-clock test (S18) belongs to Step 4's 30-second tick.

### Query counts

- `getPharmacyQueue` runs **4 statements**: the lines, then co-sign, encounters and cadre names in parallel. The count is the same with 4 or 10 placements (lane test).
- `getPrescription`: 5.
- `getEmergencyDoses`: 2.
- `logPrescriptionViewed`: 2.

### Checks

- typecheck: 0 errors.
- lint: 0 errors, 2 old warnings.
- `vitest`: 431 files, **8,885 passed**, 1 expected-fail (P4), 0 failed.
- PGlite lane: 32 files, **536 passed** (`pharmacy-access` 40, `pharmacy-reads` 10).
