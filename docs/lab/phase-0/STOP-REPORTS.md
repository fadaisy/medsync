# Lab Phase 0 — STOP reports

Prompt: [PROMPT-LAB-PHASE-0.md](PROMPT-LAB-PHASE-0.md). Branch `feat/lab-front-door`, cut from `origin/main` @ `4087e4c`
(10 Oct 2026), worktree `~/Desktop/medsync-lab0`.

---

## STOP 0 — Discovery and baseline

No product code changed. Added: this file, the prompt copy, and `tests/lab/phase-0-baseline.test.ts`.

### Verdict

**The engine is complete (Law 1 holds), so the slice can proceed.** Four findings change the plan before GATE A:

1. **No figure exists for "Late".** All 44 catalogue tests have `turnaround_target_minutes` NULL, and the hub's
   `stated_tat` is free text (≤ 40 chars), not minutes. Under Law 5 no worklist row can ever be labelled Late on
   today's data. A number has to come from somewhere (D-LAB0-07, now a real decision).
2. **No test has a section.** `test_catalogue` has no section; the hub's `diagnostic_offerings.section_id` is keyed by
   LOINC code, while the catalogue uses `test.*` codes. Nothing joins the two (HARMONISATION §9, deferred). Every row
   would fall under "No section". Closing the seam touches `test_catalogue` or the offerings, which §7 forbids.
3. **Approval is not a transaction.** `approve-staff-affiliation` is an Edge Function making sequential REST calls.
   "Grant in the same transaction" (Law 2, LA-8) needs a SQL function called by RPC: a migration.
4. **Playwright is not installed** (Q17; Law 12 says stop and flag). STOP 4 screenshots and the Step 5 scenarios need
   it, or a decision to use scripted integration tests and manual screenshots instead.

### Q1 — Branch, stack

- `/lab` on the EMR path is on **`main`**: `app/lab/page.tsx:22` → `EmrLabWorklist` (`app/lab/_components/emr-worklist.tsx`), loader `loadEmrLabWorklist` (`app/lab/_lib/emr.ts:115-139`), result screen `app/lab/results/[orderId]/page.tsx` (EMR only, `notFound()` with the flag off, `:26`).
- Drizzle (`package.json:55`), schema `db/schema/*`, SQL migrations in `supabase/migrations/` applied by `scripts/migrate.ts`. Highest migration **0096**; next free **0097**. Next free ADR **0221**. No other branch claims either.
- **npm** (`package-lock.json`), Node 24 (`.nvmrc`). The prompt says pnpm and Node 22.

### Q2 — The lab engine (complete)

| Piece                                | Where                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Orders (`lifecycle` legacy / events) | `db/schema/encounter.ts:201-260`; priority routine / urgent / immediate / emergency (`:228`) |
| Order events                         | `db/schema/emr.ts:468-505` (proposed, placed, dismissed, cancelled, on_hold, resumed)        |
| Specimens                            | `emr.ts:507-559` (`collected_at` NOT NULL)                                                   |
| Specimen events                      | `emr.ts:561-595` (received / rejected; six coded reasons, `lib/emr/orders.ts:214-221`)       |
| Diagnostic reports (versioned)       | `emr.ts:599-652` (preliminary, final, amended, corrected, entered_in_error, cancelled)       |
| Receive / reject                     | `lib/emr/actions/orders.ts:73,77`                                                            |
| Preliminary / release / amend        | `lib/emr/actions/results.ts:89,93,97`                                                        |
| Derived order state                  | `deriveOrderStatus`, `lib/emr/orders.ts:116-210`                                             |

### Q3 — The earlier claims

| #   | Verdict              | Evidence                                                                                                                                                                                                                                                                                           |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | **Resolved already** | `app/(auth)/sign-in/landing.ts:70-72` (role) and `:142-144` (cadre) → `/lab`; `/clinician` forwards lab users (`app/clinician/layout.tsx:39`). Shipped in PRs #220, #221. Pinned by `tests/lab/routing.test.ts`.                                                                                   |
| L2  | Confirmed            | No menu links to `/lab`. `app/lab/layout.tsx` has a home link, the hospital label and Sign out only.                                                                                                                                                                                               |
| L3  | Confirmed            | `supabase/functions/approve-staff-affiliation/index.ts:159-181` writes `staff_affiliations` and `users.state` only. `assign-role` is the only writer of `lab_tech`, and no app code calls it.                                                                                                      |
| L4  | Confirmed            | `lab_tech` is the only lab role; no phlebotomy cadre. `releaseResults` sets `verifiedByUserId = ctx.actor.userId` without comparing it with `enteredByUserId` (`lib/emr/write/results.ts:528-529`); a lab user may also enter `final` directly (`:468-482`).                                       |
| L5  | Confirmed            | The loader filters by hospital only (`app/lab/_lib/emr.ts:115-139`); `scope.departmentId` is never passed (`emr-worklist.tsx:22`).                                                                                                                                                                 |
| L6  | Corrected            | The EMR worklist shows "Ordered _date time_" (`components/emr/results/lab-worklist-view.tsx:73-75`), not a waiting time. Only the legacy list shows "Waiting". `turnaround_target_minutes` is read nowhere.                                                                                        |
| L7  | Confirmed            | TODO at `app/lab/actions.ts:211-220` (legacy release). No notice on the EMR result screen; `result-entry-view.tsx:34-35` mentions it only in a comment. Every `REF-CRIT-*` entry is `pending_cso` (`lib/emr/reference/critical.ts:28-53`). The legacy footer does say it (`app/lab/page.tsx:120`). |
| L8  | Confirmed            | `app/lab/layout.tsx:15-16`.                                                                                                                                                                                                                                                                        |
| L9  | Confirmed            | `app/lab/page.tsx:23` → `lib/lab-tech/worklist.ts:74-84`.                                                                                                                                                                                                                                          |
| L10 | Confirmed            | `router.refresh()` and `revalidatePath("/lab")` only.                                                                                                                                                                                                                                              |

### Q4 — Roles and permissions

- `user_roles` holds patient, clinician, nurse, pharmacist, `lab_tech`, hospital_admin, superadmin
  (`db/schema/user-roles.ts:25-50`). The database also allows `reception` (`0033_reception_workspace.sql:56-67`);
  **the Drizzle CHECK has drifted**.
- **Nothing finer than a role for people.** The EMR uses a `surface` (doctor | nurse | clinician | lab) plus cadre
  lists (`lib/emr/actor.ts:26-65`, `requireCadre` at `lib/emr/write/orders.ts:44-57`). `lib/emr/capability.ts` is about
  what a facility can do, not a person.
- **Precedent for permissions:** the NCD registry's `ncd_capability_grant` + `ncd_staff_role`, derived from cadre
  (`0093_ncd_registry.sql:36,102`, `0094:14-41`).
- Checks run in `proxy.ts` (auth, AAL2, MFA only), the workspace scopes (`requireLabTechScope`), Edge Functions
  (`hasRole`), and RLS helpers (`user_has_role`, `is_active_clinical_staff`, `private.patient_access_basis`, …).
  **No RLS policy mentions `lab_tech`.**

### Q5 — Approval and role assignment

- `approve-staff-affiliation`: input `affiliation_id`, `reason` (≥ 8), optional `licence_valid_until`; must be
  `pending_approval`; caller superadmin or that hospital's admin; clinical cadres need a licence on file
  (`licence_missing`). Writes `sa_audit_log` first (`recordSaAudit`, `:131-142`), then the updates. **No transaction;
  no role.**
- `assign-role`: inserts `user_roles`; audited by the `audit_log` trigger only.
- `ha-assign-staff-role` changes the affiliation's role and department; `ha-set-staff-status` suspends, deactivates,
  reactivates; `sa-deactivate-user` / `sa-suspend-user` set `users.state`. **None touch `user_roles`.**
- **Cadre-change and end-affiliation code: not found.** LA-8 can hook deactivate / suspend only.

### Q6 — Lab cadres

`LAB_TECH`, `LAB_TECHNOLOGIST` (AHPC) only (`0009_reference_data_seed.sql:159-160`); roles `LAB_TECH_GENERAL`,
`LAB_TECHNOLOGIST_GENERAL`, `LAB_TECH_IM`. No assistant or phlebotomy cadre. The AHPC register categories were not
confirmed from a primary source.

### Q7 — Landing today (`app/(auth)/sign-in/landing.ts`)

| Who                                                                          | Lands on                                                | Line    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- | ------- |
| superadmin                                                                   | `/admin`                                                | 36-38   |
| hospital_admin                                                               | `/hospital-admin`                                       | 39-44   |
| clinical role + active doctor-cadre affiliation                              | `/doctor`                                               | 67-69   |
| `lab_tech` role                                                              | `/lab`                                                  | 70-72   |
| other clinical role (nurse, pharmacist, clinician)                           | `/clinician`                                            | 73-75   |
| no role, pending hospital application                                        | `/onboarding/hospital-pending`                          | 97-99   |
| no role, latest affiliation active: doctor / nurse / reception / lab / other | `/doctor`, `/nurse`, `/reception`, `/lab`, `/clinician` | 132-148 |
| no role, latest affiliation pending or rejected                              | `/onboarding/clinical-pending`                          | 149-153 |
| patient profile                                                              | `/patient`                                              | 159-171 |
| anyone else                                                                  | `/`                                                     | 173     |

Both the password and the code step use it (`actions.ts:55`, `mfa/actions.ts:67`). `?redirect=` always wins and is
not role-aware (`errors.ts:20-22`). Quirks the table test must keep or GATE A must change: a user with only the
`nurse` **role** lands on `/clinician`; the `lab_tech` role is checked before the affiliation, so a role without a lab
affiliation lands on `/lab` and is bounced to `/`. `landingFor` queries the database; LD-1 asks for a pure resolver.

### Q8 — `departmentId` on the lab scope

`staff_affiliations.department_id`, **NOT NULL** (`db/schema/clinician-profiles.ts:71-73`; the scope comment saying
"may be null" is wrong). Sign-up now sets it to the hospital's LABORATORY department (PR #219). Lab sections are
`hospital_departments` rows whose parent is LABORATORY (`ops-structure.ts:538-541`), and an affiliation _can_ point at
one (`ha-assign-staff-role:95-104`), but sign-up never offers a section. So **section membership = an affiliation
whose department is a section**, and today nobody has one. It is the viewer's department, not the ordering ward
(LW-5).

### Q9, Q10 — Hub, sections, offerings

- `diagnostic_offerings` (`0080:182-198`): `(hospital_id, kind, code)`, lab `code` = a LOINC code; `provision`,
  `section_id` → `hospital_departments`, `hours`, `stated_tat` text, `confirmed_at`.
- `department_heads` (`0080:103-120`) is effective-dated with an acting flag and covers LABORATORY and its sections.
  **LA-5 can use it** (head of LABORATORY = whole lab; head of a section = that section).
- **No link from `test_catalogue` to offerings** (no LOINC column on the catalogue). **0 of 44 tests have a section.**

### Q11 — Turnaround targets

**0 of 44** have `turnaround_target_minutes` (seeds `0072:290-324`, `0092:49-57`; "an operational target set by each
facility; null in this default menu", `data/emr/test-catalogue.v1.json:8`). One integer per test; no per-priority
values.

### Q12 — Timestamps

| Point       | Source                                                                     | Always present |
| ----------- | -------------------------------------------------------------------------- | -------------- |
| Ordered     | `encounter_orders.created_at`; order event `placed`                        | yes            |
| Collected   | `specimens.collected_at`                                                   | yes            |
| Received    | `specimen_events.recorded_at`, kind `received` (no column on the specimen) | once received  |
| Preliminary | `diagnostic_reports` status `preliminary`: `issued_at`, `recorded_at`      | once saved     |
| Released    | `diagnostic_reports` status `final`: `issued_at`, `verified_by_user_id`    | once released  |

### Q13 — Identity

`identitiesFor` (`lib/emr/read/results.ts:58-103`) → `revealPatientIdentities` (`lib/scheduling/patient-identity.ts:66-126`):
name and MRN revealed (not masked), one batched `clinical_phi_access_log` insert per fetch; if the audit insert fails the
name is withheld ("Name withheld") and the MRN still shows. D-LAB0-13 is already the behaviour.

### Q14 — Flags

Environment variables only; no flag table. Per-hospital form: `EMR_V1` = `1` or a comma-separated list of hospital ids
(`lib/emr/feature.ts:13-28`). `LAB_RESULTS_LIVE` = `1` (`lib/encounter/feature.ts:62-64`). `labWorkspace` will follow
the `EMR_V1` form (`LAB_WORKSPACE`). Production values are not visible from the repo.

### Q15 — Signed references

`RefEntry.status: "signed" | "pending_cso"` (`lib/resus/reference/ref.ts:10,27`); the 8 `REF-CRIT-*` entries and
`REF-CRIT-TIMEFRAME` are all `pending_cso` (`lib/emr/reference/critical.ts`). `criticalFlaggingActive` can read these
and return false today. The legacy `CRITICAL_VALUES_CSO_SIGNED = false` constant (`lib/lab/critical-values.ts:21`) is a
second, older source.

### Q16 — UI

- `PageHeader` (place, title, subline, right) lives in `app/doctor/_components/page-header.tsx`, route-private. The
  shell is `doctor-shell.tsx` over `components/medsync/sidebar-nav.tsx`; the registry is `app/doctor/_lib/features.ts`.
- **Chroma is on `main`** (ADR 0162, `app/globals.css:6`). Lab's hue is **grape** (`DESIGN-medsync.md:97`); role tokens
  `--grape-tint`/`-edge`/`-text` exist. Caution pair `status-caution` with `-fg-aa`. Neutral chip in `StatusWord`
  (`components/emr/status-word.tsx:18`).
- `tests/design/red-reserved.test.ts` scans source text; **`app/lab` is not in its list** (`components/emr` is).

### Q17 — Test tools

**Playwright: not installed.** axe-core and jsdom are; the one axe test runs over pre-rendered static pages and skips
without a build. Vitest picks up `tests/**/*.test.ts` only (no `.tsx`), files run serially, no setup file. RLS suites
need a live Supabase project and skip without one; a PGlite lane exists (`tests/emr-db/_pglite.ts`, `EMR_PGLITE=1`) but
PGlite is not a dependency.

### Q18 — Hospital-local midnight

No `hospitals.time_zone`. `DEFAULT_TIME_ZONE = "Africa/Kampala"` with `startOfLocalDay` / `endOfLocalDay`
(`supabase/functions/_shared/slots.ts:191,603-615`), used by reception and triage lists.

### Q19 — Service key

Next.js reads `SUPABASE_SERVICE_ROLE_KEY` (`lib/env.ts:16,86`, `lib/supabase/service.ts:17`); Edge Functions read
`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`. **Flagged:** the legacy key names. `_shared/system-actor.ts` already
names `SUPABASE_SECRET_KEYS` as the upgrade path but does not read it.

### Prompt versus repo

| #   | Prompt says                                                   | Repo has                                                                                       |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | pnpm, Node 22                                                 | npm, Node 24 (`.nvmrc`)                                                                        |
| 2   | L1 open; landing inline in `sign-in/actions.ts`               | Resolved; `landingFor` in `app/(auth)/sign-in/landing.ts`, shared with the code step; not pure |
| 3   | "Chroma arrives through its own branch"                       | Chroma is merged (ADR 0162); lab = grape                                                       |
| 4   | Plum marks the active item                                    | Chroma gives the lab grape; the canvas uses grape                                              |
| 5   | Grant in the approval transaction                             | Approval is sequential REST calls in an Edge Function; needs a SQL function                    |
| 6   | Revoke on deactivation, affiliation end, cadre change         | Only suspend / deactivate exist; no end-affiliation or cadre-change code                       |
| 7   | Section from the offering, else the catalogue                 | Catalogue has no section and no key that joins it to offerings                                 |
| 8   | Facility stated turnaround → Late                             | `stated_tat` is free text; catalogue targets all NULL                                          |
| 9   | Playwright scenarios                                          | Not installed                                                                                  |
| 10  | RLS probes for every object                                   | Live-DB suites skip without a test project; PGlite not installed                               |
| 11  | Shared page header                                            | Route-private to `app/doctor`                                                                  |
| 12  | `departmentId` may be the viewer's or the ordering department | The viewer's; NOT NULL; the lab department, never a section today                              |
| 13  | Read "the lab-tech workspace prompt"                          | Not under `docs/` (only commits `ad13efb`, `ea967e1`)                                          |

### Failing tests

`tests/lab/phase-0-baseline.test.ts`, as `it.fails` (green while the defect exists, red once fixed, so the fixing
step must flip it): **L3** (approval grants no lab access), **L5** (loader has no section), **L7** (no notice on the
result screen). L1 is already fixed and pinned by `tests/lab/routing.test.ts`. Run: 3 passed, 3 expected-fail.

### Baseline

| Check                                             | Result                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` (`SKIP_ENV_VALIDATION=1`)     | Pass, but only with `NODE_OPTIONS=--max-old-space-size=8192`; the default heap aborts                            |
| `npm run lint`                                    | 0 errors, 2 warnings (old, `scripts/embed-bench.mjs`)                                                            |
| `npx vitest run` (`SKIP_ENV_VALIDATION=1`)        | 347 files passed, 63 skipped; 8,706 tests passed, 893 skipped; 0 failed (the skips are the live-database suites) |
| Screenshots at 390 / 834 / 1440                   | **Not taken**: no Playwright, and the app needs a database and a lab login                                       |
| Test-hospital counts, `/lab` TTFB and query count | **Not taken**: production reads are blocked for this session; no test database                                   |
| axe on `/lab`                                     | **Not taken**: the axe lane covers static pages only                                                             |

What is known from your own SQL on 9 Oct: Test Hospital-1 has one approved `LAB_TECH` (`labguy+test@gmail.com`) with
no `lab_tech` role, and an empty EMR worklist.

### Needed before Step 1

1. **Playwright** (D-new-1): add `@playwright/test` as a dev dependency for STOP 4 and Step 5, or accept scripted
   integration tests plus manual screenshots.
2. **A test database** (D-new-2): RLS probes need either PGlite added as a dev dependency (the existing `tests/emr-db`
   lane) or a dedicated Supabase test project.
3. **Baseline data**: run this read-only query in the Supabase SQL editor (or allow this session read-only access):

   ```sql
   select h.name as hospital,
     (select count(*) from staff_affiliations sa join cadres c on c.id = sa.cadre_id
       where sa.hospital_id = h.id and sa.state in ('approved','active')
         and c.code in ('LAB_TECH','LAB_TECHNOLOGIST')) as approved_lab_staff,
     (select count(*) from staff_affiliations sa join cadres c on c.id = sa.cadre_id
       join user_roles ur on ur.user_id = sa.user_id and ur.role = 'lab_tech'
       where sa.hospital_id = h.id and sa.state in ('approved','active')
         and c.code in ('LAB_TECH','LAB_TECHNOLOGIST')) as with_lab_role,
     (select count(*) from diagnostic_offerings o where o.hospital_id = h.id and o.kind = 'lab'
       and o.section_id is not null) as offerings_with_section,
     (select count(*) from diagnostic_offerings o where o.hospital_id = h.id and o.kind = 'lab'
       and o.stated_tat is not null) as offerings_with_stated_tat,
     (select count(*) from hospital_departments d join hospital_departments p on p.id = d.parent_id
       where d.hospital_id = h.id and p.catalogue_code = 'LABORATORY' and d.archived_at is null) as lab_sections
   from hospitals h order by 1;
   ```

4. The four verdict findings become GATE A decisions in the proposal.

---

## STOP 1 — GATE A proposal

[gate-a-proposal.md](gate-a-proposal.md): access model, landing table before and after, screens, rules with worked
examples, schema diff, RLS probe plan, test plan, ADR drafts 0221–0226, decision table.

- **Signed** 10 Oct 2026 by the owner's instruction, "go with your recommendation and go through all gates": D-LAB0-01
  to -19, E-LAB0-01 to -05, the permission map v1.
- **Not signed:** the notice wording (D-LAB0-11 asks for a signature before production). It ships `draft`; CF-3 keeps
  production off until it is signed.
- **Changed from the prompt:** D-LAB0-05 (no stored "last used" workspace), D-LAB0-19 (scratch harness instead of new
  dependencies, following the repo's no-new-deps rule). **New:** D-LAB0-16 (reading the hub's text), D-LAB0-17
  (sections without a catalogue link), D-LAB0-18 (grant by trigger).
- Critique pass corrected three points: `encounter_orders.loinc_code` exists but the EMR never writes it (finding 2
  stands); "From" is `encounters.department_id`; the global Emergency pill is on every page by design.

---

## STOP 2 — Access

**Built:** `data/lab/permission-map.v1.json` (signed v1.0.0), `lib/lab/access.ts`, `lib/lab/feature.ts`
(`LAB_WORKSPACE`, CF-3 production gate), `content/lab.ts` (notice `draft`), `lib/auth/landing.ts` (pure
`resolveLanding`), `app/(auth)/sign-in/landing.ts` (facts loader, five queries in parallel), the scope's access,
sections and refused path (`lib/lab-tech/scope.ts`, `/not-authorised`), the per-act guard
(`requireLabPermission` in receive, reject, enter, release), migration **0097**, `npm run lab:backfill-access`.

**Migration 0097** (`supabase/migrations/0097_lab_access_sync.sql`): `private.sync_lab_access(user, hospital,
actor, reason)` and an `AFTER INSERT OR DELETE OR UPDATE OF state, cadre_id, hospital_id, user_id` trigger on
`staff_affiliations`. No table, column or index. Both functions revoked from `PUBLIC`, `anon`, `authenticated`.

**RLS and trigger probes** (`tests/emr-db/lab-access.test.ts`, PGlite, every migration replayed): 14 of 14.

| Probe                                                        | Result                                            |
| ------------------------------------------------------------ | ------------------------------------------------- |
| SQL cadre list = signed map's cadres                         | pass                                              |
| Approve `LAB_TECH` → `lab_tech` row, `created_by` = approver | pass; one `lab_access` audit row (below)          |
| Approve `LAB_TECHNOLOGIST`                                   | pass                                              |
| Approve a nurse                                              | pass: no row, no audit                            |
| Suspend, deactivate                                          | pass: row deleted, `lab_access_revoked` audit row |
| Reactivate                                                   | pass: granted again (insert, delete, insert)      |
| Same update twice                                            | pass: one row, one audit row                      |
| Cadre changed to `NURSE`                                     | pass: revoked                                     |
| Approved at A with a pending affiliation at B                | pass: role at A only                              |
| Hand-granted `lab_tech`, nurse affiliation approved          | pass: removed (Law 3)                             |
| Backfill path (trigger off, then `sync_lab_access`)          | pass: `granted`, then `unchanged`                 |
| `authenticated` / `anon` run `private.sync_lab_access`       | pass: denied                                      |
| `authenticated` insert / update / delete `user_roles`        | pass: denied / 0 rows / 0 rows                    |

**Audit rows** (asserted in the probes): a grant writes `audit_log` `{table_name: 'lab_access', action: 'insert',
actor_id: <approver>, after_data: {event: 'lab_access_granted', user_id, hospital_id, role: 'lab_tech', basis:
{affiliation_id, cadre: 'LAB_TECH', council: 'AHPC', approved_by, approved_at, hospital_id}, reason: {op, from_state,
to_state}}}`. A revocation writes `{action: 'delete', before_data: {event: 'lab_access_revoked', …, reason:
{affiliation_id, to_state: 'suspended'}}}`; its actor is null under the service role, and the actor stays on the
`sa_audit_log` row the status function writes before it changes the affiliation.

**Landing table test** (`tests/lab/landing.test.ts`): 37 rows covering every STOP 0 branch, unchanged except the
GATE A row (`lab_tech` role without a lab affiliation → `/clinician`); LD-2, LD-3, LD-4 (`?redirect=` honoured, refused
with prefix only, ignored when not same-origin), LD-6. `tests/lab/access.test.ts` (LA-1..LA-6), `tests/lab/feature.test.ts`
(flag and CF-3).

**Backfill dry run:** not run against production from here (no access). The owner runs `npm run lab:backfill-access`
with production `DATABASE_URL`; it lists ids, cadre and approval date, no names. Expected from your 9 Oct query: one
`LAB_TECH` at Test Hospital-1.

**Checks:** typecheck 0 errors; lint 0 errors on the changed files; `tests/lab` 75 passed + 2 expected-fail (L5, L7);
PGlite lane 29 files, 479 tests passed (0097 breaks nothing). L3 flipped to a passing test.

**Not built here, by design:** permission checks on the legacy (`LAB_RESULTS_LIVE`) entry path, which Lab Phase 1
retires (L9); with the v1 map every lab cadre holds every bench permission, so its cadre check is equivalent.
