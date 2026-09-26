# Departments & services hub — STOP reports

Branch `feat/hospital-services-hub`, cut from `feat/booking-app` @ `004772d`. Worktree
`~/Desktop/medsync-services`. Owner: Fadhul (founder, CSO). The owner gave a blanket sign-off on every
GATE A decision on 26 Sep 2026 ("I have signed off everything … at the end deploy").

---

## STOP 0 — Discovery and baseline (26 Sep 2026)

### Answers

| Q                       | Answer (repo wins)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1 shell contract       | `docs/hospital-admin-integration-contract.md`. Scope: `requireHospitalAdminScope()` (`lib/hospital-admin/scope.ts`, states `provisioning` + `active`, aal2) and `useHospitalScope()`. Registration: `FEATURE_AREAS` in `app/hospital-admin/_lib/features.ts` (sidebar, sheet, ⌘K). Panels: `components/ui/sheet.tsx`. **Mutations: a server action resolves scope, then `callEdge()` into a Deno Edge Function** that does Zod → auth → role → scope → audit (`recordSaAudit`, fail-closed) → mutation → PII-redacted log. Every admin area follows it (staff, scheduling, profile). ⌘K entity search: contracted, never built.                                                                                                                                                                                                                   |
| Q2 ORM / DB             | Drizzle + postgres-js, hand-written SQL migrations applied by `scripts/migrate.ts` (one tx per file, `_medsync_migrations`). Hosted Supabase only; no local stack. Enum style: text + CHECK. npm, `.nvmrc` 24 (not pnpm / Node 22). Harness: PGlite replay of 0000→0070 at `~/Desktop/services-harness/pg` (not a repo dependency).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Q3 registration upgrade | `hospital_departments(id, hospital_id, parent_id, name, slug)` — IM sub-specialties are child rows (units already). No kind, code, live, archive or start column. `hospital_wards(department_id, name, slug, bed_count, state active/inactive)`. No beds table. The start department lives only on `hospital_application_departments.is_primary`. The setup checklist (`/admin/setup`, onboarding v2) diffs departments and **deletes** unticked ones; it writes with the service role and no `sa_audit_log` row (row trigger `audit_log_changes()` only).                                                                                                                                                                                                                                                                                        |
| Q4 booking engine       | **Built** (0058–0065). Clinic = `service_lines` (has `department_id`, `confidential`, `active`, `capacity_mode`; no place, unit, audience, catalogue code). Clinic days = `session_templates` (one weekday + one start + one optional clinician, capacity + booked share, `venue` text, `valid_from/until`; **weekly only**). Instances = `clinic_sessions`. Expansion: pure `expandSessionTemplate` (`supabase/functions/_shared/slots.ts`) called on save (`ha-upsert-session-template`) and nightly (`lib/scheduling/materialise-sessions.ts`). **No holiday, blackout or closure store; nothing writes one-off sessions.** Cancel flow `ha-cancel-session`: dry-run count → audit → cancel → bookings cancelled → reminders cancelled → SMS/push with next-session rebooking offer. Confidential names are masked in the dispatch cron's SQL. |
| Q5 emergency pathway    | All on `hospitals` (0066): `emergency_capability` none/daytime/24h, `pre_alert_enabled` + `board_owner_note` (CHECK), `emergency_entrance_directions`, `emergency_sms_number`, `ambulance_number`, `latitude/longitude`. `emergency_contacts` holds the facility ambulance row (`verification_status`, verified by superadmin via `sa-verify-emergency-contact`). Hospital admins edit everything in one form (`/hospital-admin/profile` → `ha-set-hospital-emergency-settings`) **with no second person**.                                                                                                                                                                                                                                                                                                                                       |
| Q6 orders pipe          | `encounter_orders` (kind + free `text` + nullable `loinc_code`), `encounter_results` (0050/0051). **No orderables catalogue**: the only coded list is `loinc_codes` (9 LOINC tests, 0041). `/lab` is one worklist with no sections. The concurrent EMR session (`feat/emr-engine`, unmerged, unapplied) adds `test_catalogue`, `capabilities`, `facility_capabilities` in its 0071.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Q7 staff model          | `staff_affiliations(user, hospital, department_id NOT NULL, cadre, role, state …)`. No head-of-department anything. Ward in-charge **exists**: `ward_in_charge_assignments` (0031) + audit actions `assign_ward_in_charge` / `end_ward_in_charge`. Nursing cadres: `NURSE`, `MIDWIFE`, `SPECIALIST_NURSE` (`lib/nurse/scope.ts:29`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Q8 legacy arrays        | Arrays on `hospital_applications`: `specialised_clinics(_other)`, `diagnostic_services`, `support_services`, `services_offered`, `has_onsite_pharmacy`, bands, infrastructure. Departments / IM sub-specialties / primary are **junction tables** (`hospital_application_departments`, `hospital_application_specialties`), not arrays. Provisioning copies departments only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Q9 department readers   | Signup: `listDepartments` (hospital + top level). Intake/Desk: `listHospitalDepartments` (all rows). Patient queue: top level + policy. Booking: `fetchLines` via `service_lines.active`. No reader filters on live/archived (no such column).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Q10 four-eyes           | `sa_pending_approvals` + `_shared/four-eyes.ts` — superadmin-only, and its confirm function was never built. Nothing exists for hospital admins.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q11 notifications       | `sa_notifications` (kind CHECK, no reader UI anywhere). No staff notification surface to nudge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Q12 flags / tooling     | Env flags in `lib/<area>/feature.ts`. **Playwright absent** (flagged, as every prior prompt did; the CDP harness from onboarding v2 is the browser driver). `axe-core` present (jsdom). No print CSS in the app (0 `@media print`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Q13 tokens              | `DESIGN-medsync.md` + `app/globals.css @theme`: neutral chips (`Pill`), amber `status-caution-*`, plum ramp (place), `Sheet`, `SectionRule`, `StatCard`. The design system forbids plum on _filter and segmented_ tabs; the hub's tabs are sub-routes (navigation = place), so the plum underline stands (recorded in ADR 0150).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q14 datasets            | MoH Service Standards 2016 — **downloaded** (114 pp., text extracted with page numbers). National standard test menu (2017) — **not obtainable**: the CPHL link is dead (TLS mismatch on www, 404 on the bare host after the site redesign). Holidays 2026 — verified against officeholidays.com (fixed dates cross-checked with Wikipedia).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### Prompt vs repo (differences)

1. Action pattern is **server action → Edge Function**, not "server actions only"; the hub follows the repo.
2. pnpm / Node 22 → npm / Node 24.
3. Clinic days are weekly-only; CLN-3 (every N weeks, nth weekday) needs the booking engine extended, in its own pure expander.
4. No holiday/blackout/closure store exists (H11 confirmed) — new, used by both expansion paths.
5. The ordering catalogue is `loinc_codes` (9 tests); the national menu is unavailable → the test menu overlays `loinc_codes`, and the national-menu comparison stays hidden (Law 5, PS-1).
6. EMR's unmerged 0071 overlaps (test catalogue, facility capabilities). The hub keys its overlay by catalogue **code**, so the EMR merge reconciles by code; the EMR session is told.
7. Ward in-charges already have a store → reused and extended (acting), not recreated.
8. Start department moves from the application junction to the hospital's department row (the junction stays as history).
9. The emergency profile form lets one admin change routing values → CAP-5 closes that path.
10. `sa-activate-hospital` accepts superadmins only, so a hospital admin's "Go live" 403s (pre-existing; out of scope, noted).
11. Migration number: EMR holds 0071–0072; the hub takes **0080** (the migrator applies by name; gaps are fine).

### Baseline

- `/hospital-admin/departments` is the placeholder "Departments & wards" (4 "coming" bullets).
- A General Hospital's clinics, clinic days, tests and emergency/support set-up is **not possible in one place today**: departments and wards live in the setup checklist (provisioning only), clinics and templates in Scheduling, emergency values in Profile, tests nowhere.
- Failing tests written first (`tests/hospital-services/baseline.test.ts`): H3 (services not editable per hospital), H8 (reception must pick a clinical department — no department kinds), H10 (no occupancy number may render).

---

## STOP 1 — GATE A (26 Sep 2026)

`gate-a-proposal.md` recorded **signed** under the owner's blanket sign-off. Repo-driven deltas are marked Δ in
its decision table (one Edge Function with ops; in-charge reuses 0031; tests overlay `loinc_codes`; the national
test menu is pending data; one-off = single-day template; migration 0080 / ADRs 0150+).

## STOP 2 — Engines and data (26 Sep 2026)

**Built:** `supabase/migrations/0080_hospital_services_hub.sql` (GATED); `supabase/functions/_shared/services-hub.ts`
(catalogues, signed presets, every §6 rule — one self-contained module both runtimes import);
`supabase/functions/ha-services-hub/` (30 ops); `ha-upsert-session-template` (+ recurrence, holidays, closures, place;
Planned clinics may hold days); `ha-set-hospital-emergency-settings` (routing fields refused — CAP-5);
`slots.ts` `expandSessionTemplate` (+ every N weeks, nth weekday, `skip`); the nightly materialiser (same skip);
`db/schema/services-hub.ts` + columns; `lib/services/{data,profile}.ts`; consumer contracts (sign-up, intake, patient
queue, booking, USSD).

**Rule coverage** (`tests/hospital-services/*.test.ts` — rule IDs are in the test names):

| Rule    | Test                                      | Rule   | Test                                                            |
| ------- | ----------------------------------------- | ------ | --------------------------------------------------------------- |
| STR-1   | probe (kinds CHECK), catalogue suite      | CAP-1  | rules "typed values"                                            |
| STR-2   | rules ×5, probes ×4                       | CAP-2  | invariants (pathway columns, verify writes them)                |
| STR-3   | rules ×2, probes ×3                       | CAP-3  | rules "derived"                                                 |
| STR-4   | rules ×2                                  | CAP-4  | rules "routing flags"                                           |
| STR-5   | rules, probes ×2                          | CAP-5  | rules ×2, probes ×3, invariants ×2                              |
| STR-6   | probe "units keep their ids"              | AV-1   | rules, probes ×2 (append-only)                                  |
| CLN-1   | invariants (lines are service_lines)      | AV-2   | rules ×2                                                        |
| CLN-2   | invariants "hub never writes sessions"    | AV-3   | `availabilityNow` merges wards + closures (Phase 5 render test) |
| CLN-3   | rules ×4                                  | AV-4   | invariants "never read the availability store"                  |
| CLN-4   | rules ×4, invariants                      | DX-1…3 | probes (overlay table), function Zod                            |
| CLN-5   | invariants ×2 (rendered + SQL)            | DX-4   | rules ×2                                                        |
| CLN-6   | invariants (closures → ha-cancel-session) | PS-1…3 | rules ×4                                                        |
| PRF-1…3 | profile ×9 (schema walk + snapshots)      | Appx B | rules "legacy import"                                           |

**RLS / DB probes** (`~/Desktop/services-harness/pg/probe-0080.mjs`, PGlite replay 0000→0080): **95 / 95**.
Backfill (existing departments stay live; codes from slugs; start from the application, hyphenated twin preferred;
units keep ids); 8 hub tables × 7 actors (own admin ✓, nurse ✓, reception ✓, superadmin ✓, other hospital ✗, outsider
✗, anonymous ✗); holidays readable by anon; **client writes denied on 11 tables** (incl. `hospital_departments` and
`hospital_wards`, whose client-write policies 0080 drops); append-only availability; author ≠ verifier; pending shape;
beds ≤ count both ways; one start / unit never start / start stays live; one open head + one acting; one open in-charge
and one acting; closure target + dates; archived clinic never live; recurrence exclusivity; audit verbs accepted; row
audit trigger fires.

**Import reports.**

- Catalogues: 30 departments (23 + 7), 27 clinics (9 kept + 18), 8 lab sections, 11 imaging, 11 ward types, 7 reasons,
  28 capability keys (16 routing, 5 derived).
- Presets (MoH 2016, signed, page-referenced): hc3 7 items · hc4 14 · General 22 · Regional 23 · National 26.
- Holidays: 18 for 2026 (incl. 3 one-off election/inauguration days), 12 for 2027 (fixed + Easter).
- **Legacy dry run (read-only prod query, 26 Sep).** _Test Hospital 5 applied through v2: no legacy answers and no
  departments → the import is not offered; its first run is the Regional preset (23 Planned items) or the catalogue._
  Test Hospital-1's real answers map to 4 departments (Laboratory, Radiology & imaging, Pharmacy, Mortuary), 4 lab
  sections, 9 clinics, 8 imaging items, and 3 capabilities (blood source, mortuary, emergency 24 h — the two routing
  ones arrive **pending**), plus 5 notes (theatres/ambulances counts not given; OPD hours; wards; referral).
- Production state: latest applied migration `0070_onboarding_v2.sql` (0080 unapplied).

**Numbers so far:** hub tests 70 (rules 41, profile 11, invariants 18 — 1 waiting on Phase 3's actions file); slot
tests 51/51 unchanged; typecheck app + functions clean.

## STOP 3 — Departments, Wards & beds (26 Sep 2026)

**Built.**

- The hub frame: the header with real counts, and the amber "N things unavailable · View" link.
- The seven tabs as sub-routes, with the plum underline. On a phone the tabs become a `<select>`, hidden in print.
- **Departments:**
  - rows grouped by kind, with a live chip, the start department, and the head or acting head;
  - the "Add departments" catalogue sheet, and "Start from ▾" (preset or application);
  - the department panel: live switch, head / acting head with history, place and hours, units, and the tabs Wards, Clinics, Staff and History;
  - archive, which shows its consequence first.
- **Wards & beds:**
  - the table, and the ward panel: type, sex and age, bed count, the optional bed register, the in-charge / acting in-charge, and temporary closure;
  - "Occupancy arrives with the inpatient module" (there is no number without an engine behind it).

**How it was checked.**

- PGlite (0000→0080) served over a socket (`~/Desktop/services-harness/pg/serve.mjs`), with a fixture like Test Hospital 5.
- A scratch copy of the app. Sign-in is stubbed to a fixture admin, and the proxy passes everything through; neither change is in the repo.
- The CDP driver took screenshots at 1440×900 and 390×844, light and dark, with reduced motion, of every tab, panel and sheet and the ⌘K palette. They are in `~/Desktop/services-harness/shots/`.

**Fixed from the screenshots.**

- The nav label was truncated ("Departments & servi…"). It now wraps.
- Chips and toggles in dark mode. The design system's grey and teal scales invert themselves, so the added `dark:` overrides double-inverted: the "Live" chip vanished and "Not on MedSync yet" showed as a light chip. The overrides are removed, and solid chips use the `foreground`/`background` tokens.
- The amber "Limited" chip stretched across its table cell.
- Unset opening hours read "Closed". They now read "Not set" until hours are saved.
- A closure starting next month read "Closed" in two places. It now reads "Planned" until its first day, and a single-day closure shows one date.
- The ⌘K palette had an empty band above "Navigate": the "No matches" element kept its padding when empty. This was pre-existing.

## STOP 4 — Clinics (S7–S10, S16)

**Built.**

- **Timetable** (a week grid with AM/PM rows, equal-width day columns and holiday notes) and **List** views.
- **Add clinics** from the catalogue, with confidentiality defaults.
- **The clinic panel:**
  - who can book, place, department and unit, and confidentiality;
  - clinic days, through `ha-upsert-session-template`: weekly, every N weeks or nth weekday, holidays and place;
  - a one-off session;
  - upcoming exceptions, and close for some days, which previews first and then runs `ha-cancel-session` per session.
- **Print timetable** (print CSS only).

**S16.** Printed with Chrome's `Page.printToPDF`: one A4 landscape page, black and white, grouped by department, with places (`shots/timetable.pdf`, `shots/print-1.png`). The print pass also fixed:

- the phone section picker leaking into print;
- unequal column widths.

**S7–S10** at the op level, from the run below:

- A new clinic is a session-mode `service_line`, Planned until it is set live.
- `update_clinic` sets the place and who can book.
- TB and HIV/ART are confidential by default. The SMS side is covered by the CLN-5 invariants (rendered text and SQL).
- A closure for 12–16 Oct is stored, backwards dates are refused, and lifting it keeps the row, marked lifted.
- Holiday skipping is covered by the pure `skipDayFor` / `expandSessionTemplate` tests. The fixture's timetable shows "Next holiday: Fri 9 Oct, Independence Day".

## STOP 5 — Diagnostics (S11)

**Built.**

- **Laboratory:** sections, filters, a searchable test table over `loinc_codes`, bulk edit, and a test panel for where it's done, hours, stated turnaround and referral destination.
- **Imaging & other tests** (catalogue A.4).
- The line on the comparison with the national menu says plainly that it arrives when the Ministry's list is imported.

**S11 (op level).**

- HbA1c set in-house, Mon–Fri, with stated turnaround 1 day, is confirmed.
- A code outside the ordering catalogue is refused ("Not in the ordering catalogue: 25836-8"). HIV viral load can't be added until the national menu is imported.
- An unknown imaging code is refused.
- `orderingAvailability` returns where the test is done, its hours, the turnaround and the availability state.
- **Not done:** "N of 85" needs the national menu, which is pending data.

## STOP 6 — Emergency & support, Availability, Hours & places, ⌘K, onboarding (S12, S13, S15, S17)

**Built.**

- **Emergency & support:** nine numbered sections from `CAPABILITY_SECTIONS`.
  - Routing values show who verified them and when.
  - A pending change shows "needs a second admin", with Verify / Reject… for anyone who didn't write it.
  - Critical-care beds are derived from Wards & beds.
- **Availability:** "Availability now" merges problems, closed wards and closures. It has Report / Update / Still down / Resolve, and 90 days of history.
- **Hours & places:** OPD hours, public holidays with their source, closures with a consequence preview, and places.
- **⌘K:** Navigate, Actions, and entities (Departments, Wards, Clinics, Tests), loaded once when the palette opens and shown only while typing.
- **The profile's emergency form** shows the routing values read-only with a link here (CAP-5). The form itself only edits coordinates.

**S17.**

- The checklist rows link to `/hospital-admin/departments`, `/wards`, `/clinics`, `/diagnostics` and `/emergency`.
- "Departments" is done when a live start department exists (`neededTasks`), and `finaliseSetupAction` requires the same.
- This was checked in code. The harness can't open `/admin/setup`, which serves only hospitals still in provisioning.

## STOP 7 — Phase 7 (26 Sep 2026)

**Every op run for real.**

- `~/Desktop/services-harness/pg/run-ops.mjs` loads the Edge Function's own op modules in Node, mapping `npm:` imports to the repo's packages.
- It drives them through `index.ts`'s pipeline (plan → `sa_audit_log` row first → apply) against PGlite 0000→0080 with the fixture. A small supabase-js stand-in (`shim.mjs`) translates the builder calls to SQL.
- **Result: 60 / 60 checks, and all 30 ops ran.** Every call wrote exactly one audit row before it changed anything.
- The run covers S1–S7, S9–S13 and S15:
  - S1: preset → 23 Planned items, and a second apply is refused;
  - S2: Test Hospital 5 has nothing to import; decline, then accept later; routing values arrive pending; a second accept is refused;
  - S3: live off and on, the start department protected, existing staff unaffected;
  - S4: head history, acting head with an end date, a non-affiliated user refused;
  - S5: archive blocked "In use: 1 staff · 1 ward. Reassign first.", succeeds after reassignment, row kept;
  - S6: 30 generated bed labels, ICU 4 beds → `icu_beds = 4`, a doctor refused as in-charge;
  - S12: stock-out → "unconfirmed" after the date → update → still down → resolved, with the history intact and the log append-only;
  - S13: A's change pending, A can't verify, B verifies, and the pathway value lands in `hospitals`;
  - S15: a head edits only their own department.
- **Not exercised locally:** the Deno HTTP wrapper (JWT, role lookup, CORS). No Deno or Docker on this machine. It runs for the first time when deployed.

**Accessibility.** axe-core on every tab at 1440 and 390, dark mode, and ten panels and sheets: **0 violations** after these fixes:

- `Field` became a wrapping `<label>`, which fixed 68 fields in one place;
- filter selects gained names;
- group headings became `h2`;
- empty table headers got screen-reader text;
- the in-text link is underlined;
- link buttons use `teal-700`;
- the shell's level label contrast is fixed.

**Owner item.** The design system's caution pair (#D97706 on #FEF3C7) is **2.86:1**, which fails AA. The hub, the sidebar badge and the profile form use `amber-800` text in light mode (dark mode keeps the token, which passes) until the token is fixed. Scheduling still uses the token.

**Performance** (production build, local PGlite fixture, so there is no network latency in these numbers):

- tab switch p50 15 ms, **p95 33 ms**, max 36 ms (n = 21);
- panel open p50 11 ms, max 44 ms;
- test filter p50 4 ms, max 5 ms (the fixture has 9 tests, not 300);
- first byte p95 12 ms, full page p95 27 ms.

**JS.** Beyond the Staff page, each hub page adds **6–14 KB gzipped** (Departments 13, Wards 10, Clinics 14, Diagnostics 10, Emergency 9, Availability 9, Hours 6), loaded per tab. All seven tabs together come to **69 KB**, over the 60 KB line if it is read as "the whole hub at once". The tab links prefetch the other tabs' code in the background.

**Interactions: General Hospital preset vs from scratch** (22 items: 10 departments, 9 clinics, 3 imaging; counted as clicks, choices and fields).

| Part                                                                   | From scratch |      From preset |
| ---------------------------------------------------------------------- | -----------: | ---------------: |
| Add the 10 departments (open, tick, add)                               |           12 |                — |
| Add the 9 clinics                                                      |           11 |                — |
| 3 imaging items (scratch: open, in-house, save; preset: open, confirm) |            9 |                6 |
| Start from → standard → apply                                          |            — |                3 |
| **Structure the preset covers**                                        |       **32** |    **9** (−72 %) |
| Set 10 departments live (2 each)                                       |           20 |               20 |
| 9 clinics: days (6 each) and set live (1 each)                         |           63 |               63 |
| Test menu (bulk edit, 2 sections)                                      |          ~10 |              ~10 |
| Emergency & support (~12 values × 3)                                   |          ~36 |              ~36 |
| **Whole General Hospital**                                             |     **~161** | **~138** (−14 %) |

**The ≥ 70 % target is met for the structure a preset creates, but not for the whole configuration.** Under the signed decisions (D-SVC-03), presets carry no clinic days, no tests (the national menu is unavailable) and no capability values, and everything lands Planned. Meeting the target end to end would need an owner decision on one or more of:

- default clinic days in presets;
- a bulk "Set live" for Planned items;
- tests in presets once the menu is imported.

## §12 — Numbers at the final STOP

| Metric                                                               | Target             | Result                                                                                                     |
| -------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Next/Continue buttons in the hub                                     | 0                  | **0** (grep)                                                                                               |
| Interactions, General Hospital from preset vs from scratch           | ≥ 70 % fewer       | **72 %** fewer for the structure the preset adds; **~14 %** for the whole setup — **not met** (see STOP 7) |
| Stores for sessions or clinics outside the booking engine            | 0                  | **0** (clinics = `service_lines`, days = `session_templates`)                                              |
| Departments, wards, clinics or tests an admin can't edit after setup | 0                  | **0**                                                                                                      |
| Structural changes without an audit row                              | 0                  | **0** (audit row first on all 30 ops; row trigger on every hub table)                                      |
| Routing-relevant changes live without a second person                | 0                  | **0** (pending until another admin verifies; CAP-5 closes the profile form)                                |
| Numbers shown without a backing engine (e.g. occupancy)              | 0                  | **0**                                                                                                      |
| Personal-data fields in the capability profile                       | 0                  | **0** (schema walk test)                                                                                   |
| Rule IDs without a test                                              | 0                  | **0** (STOP 2 coverage table)                                                                              |
| RLS probes passed                                                    | 100 %              | **95 / 95**                                                                                                |
| axe serious/critical                                                 | 0                  | **0** (27 scans)                                                                                           |
| Tab switch p95 / test-menu filter p95                                | < 100 ms / < 50 ms | **33 ms / 5 ms** (local fixture)                                                                           |
| Red outside the Emergency affordance on hub routes                   | 0                  | **0** (`tests/design/red-reserved` covers the hub folders)                                                 |
| Added JS for the hub                                                 | ≤ 60 KB gz         | **6–14 KB per tab**; 69 KB if all seven tabs are counted together                                          |

**Checks:**

- `tsc` (app and functions) clean;
- ESLint clean on the changed areas;
- Vitest: 217 files, **3,850 passed**, 224 skipped;
- `next build` passes.

**Owner items:**

1. The caution token fails AA (above).
2. The national test menu import: the CPHL URL was unreachable when checked.
3. Holidays need a yearly top-up, with Eid dates confirmed when announced.
4. The preset scope decision behind the 70 % target.
5. A hospital with one admin needs a superadmin to verify routing values.
6. A head-facing UI, and in-charge reports of availability, are seams.
7. The EMR reconciles `test_catalogue` / `facility_capabilities` with the hub at merge (agreed).
