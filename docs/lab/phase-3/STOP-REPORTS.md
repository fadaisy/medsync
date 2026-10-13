# Lab Phase 3: STOP reports

## STOP 0: Discovery and baseline (13 Oct 2026)

Nothing in the product changed at this step. Branch `feat/lab-quality-registers` (worktree `medsync-lab3`), cut from
`origin/main` at 6db4e52b. The owner (Fadhul, CSO) told the session to go through every step on Claude's
recommendations, so the real-world inputs this step cannot get (the printed HMIS 105 and its eHMIS export, the paper
registers, the lab's paper QC, stock and EQA practice, the In-Charge, the paper tally) are recorded as **owner
actions** below instead of stopping. Each one becomes data the lab fills or signs later in the product; nothing is
guessed in their place.

The canvas was read (13 artboards); its inventory is in `docs/lab/phase-3/ui-canvas-notes.md`.

### The five things later steps most need to know

1. **The hub has no machine record.** There is no machine table: the hub stores only a machine _count_ on imaging
   offerings (`diagnostic_offerings.machines`, `0080_hospital_services_hub.sql:192`). Equipment state is an
   availability _problem_ on a test, lab section or imaging subject (`availability_events`, 0080:224-249, reason
   `equipment_down`), written only by the edge function `ha-services-hub`, op `report_problem` / `resolve_problem`
   (`supabase/functions/ha-services-hub/ops-services.ts:678, :756`), callable by a hospital admin or a current
   department head (`index.ts:49-56`, `common.ts:104-122`). So "extend the hub's machine" is not possible; GATE A
   proposes the machine record and keeps the hub's own action for status (A1 below).
2. **Release is per report, not per component.** Every lab release ends in `writeReportVersion`
   (`lib/emr/write/results.ts:271`), reached from `releaseResults` (:590), `enterResults(status: "final")` (:507),
   `releaseWithCriticalMark` (`lib/lab/criticals/store.ts:1262`), the downtime form (`lib/lab/downtime-store.ts:316`)
   and bedside (`lib/lab/bedside-store.ts:129`). A version carries every observation forward (:398-413). The report
   statuses have no "partial" (0071:519-520). Holding one component while releasing the others needs a design
   (A2).
3. **The two-signature store has fixed slots.** `lab_signed_configs` (0107:31-51) has `lead_signed_by` and
   `cso_signed_by`; the check `lsc_signed_by_two` (0107:49-50) needs both once out of draft. Kinds are a CHECK list
   (0107:34-35) and a Zod map (`lib/lab/signed-config.ts:74-110`). The lead slot needs `lab.manage`
   (`lib/lab/catalogue-v2-actions.ts:44-57`), the CSO slot `superadmin` at AAL2 (:147-164). D-LAB1-12 (an author
   does not sign their own draft without a written exception) is at `lib/lab/catalogue-v2.ts:281-285`; nothing
   checks that a second person exists. A precedent for another role in a slot: `ncd_mapping`'s lead slot belongs to
   the registry lead (`lib/ncd/lab-feed-actions.ts:72-87`).
4. **`poct_lots` is append-only with no state** (0110:25-34, trigger :66-68), and `diagnostic_reports.lot_id`
   references it with a both-or-neither check against `device_id` (0110:47-51). The bedside form lists every lot,
   expired ones included (`app/nurse/patients/[patientId]/bedside/_lib/load.ts:65-80`), and the server compares
   the **UTC** date of measurement with the use-by date (`lib/lab/bedside.ts:45`): baseline test (c).
5. **No Health Unit In-Charge or HMIS focal person exists** anywhere in the repo. "In-charge" means only the ward
   in-charge (`db/schema/nurse-workspace.ts:83`). GATE A proposes a small designation table (Q15).

### Q1 Phase 2

Merged: `feat/lab-one-menu` is an ancestor of `origin/main` (PR #229 and #230; the copy signed by the CSO on 13 Oct
2026, `content/lab-phase-2.ts:9`). Present:

| Phase 2 piece                        | Where                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Analyser profiles                    | `analyser_profiles` (0107:129-147: hospital, test, model, bench, kind, state, mappings); `lib/lab/profiles.ts`, `profile-store.ts`  |
| Specimen pinned to a profile         | `specimen_events.profile_id` (0109:130), written at receipt (`lib/emr/write/specimens.ts:223`)                                      |
| Bedside devices                      | `devices` (0071:114-123) + test, ward, state `not_verified/in_use/retired`, verification (0110:9-23)                                |
| Bedside lots                         | `poct_lots` (0110:25-34)                                                                                                            |
| Bedside operators                    | `poct_operators` (0110:36-45), checked by `isOperator` (`lib/lab/bedside-store.ts:38-50`)                                           |
| Test menu                            | `lab_test_services` (0109:49) linking tests to hub offerings; `menuToday` (`lib/lab/one-menu-read.ts:51-114`)                       |
| Availability                         | `availabilityFor` (`lib/lab/one-menu.ts:31-59`): in_house, referred, down_referred, not_offered, not_linked, unknown                |
| Availability snapshot on the order   | `encounter_orders.availability_snapshot` (0109:57), written as `{state, words, turnaround, at}` (`lib/emr/write/orders.ts:395-402`) |
| To refer                             | `app/lab/refer/page.tsx:27-106`, computed live from the worklist (no table, no state)                                               |
| Signed configuration                 | `lab_signed_configs` (0107:31-73), `lib/lab/signed-config.ts`, `lib/lab/catalogue-v2.ts`                                            |
| HIV algorithm (per hospital, signed) | kind `hiv_algorithm`, payload `assays[{step, kit}]`, rules, `retestDays` (`signed-config.ts:78-98`)                                 |
| Identity checks at collection        | `lab_identity_checks` (0109:93-105)                                                                                                 |

### Q2 The claims H1–H10

| #   | Verdict                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H1  | **Unverified** (owner action) | The research transcription is the only source (research Part A §1, text extraction). Not checked against a printed form or the eHMIS dataset (Q3). Known gaps in the transcription: VS18 absent; RS02–RS13 only partly read; which 10.2 rows have a positive column is unknown; MS13 versus MS01–MS12 is an inference; the 10.6 antibiotic list was not extracted                                                                                                                                |
| H2  | **Unverified** (owner action) | Research Part A §1 "Other HMIS 105 rows". Same caveat as H1                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| H3  | Confirmed as a research claim | Research Part A §5 (A-LIS user guide v3). Nothing in the repo                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| H4  | Confirmed                     | Research Part A §3: the register columns were not obtained                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| H5  | **Corrected**                 | The hub does **not** list machines: only an imaging machine count (0080:192) and availability problems (0080:224-249). Machine-like records that do exist: `devices` (bedside meters and kits, 0071:114, 0110) and `analyser_profiles` (one per test and bench, 0107:129). There is no stock, maintenance, QC, calibration log, temperature log or EQA. The only lots are `poct_lots`; the only calibration fields are `devices.calibration` and `calibrated_on` (0071:119-121), read by nothing |
| H6  | **Corrected in part**         | Profiles, devices, `poct_lots`, the menu and To refer exist (Q1). But: To refer is a live computation with no table (`app/lab/refer/page.tsx:52-54`), and **the availability snapshot has no reason** (`orders.ts:395-402`): the hub's reason code (`AVAILABILITY_REASONS`, `supabase/functions/_shared/services-hub.ts:307`) is not copied to the order, which 10.5 "by reason" needs                                                                                                           |
| H7  | **Corrected**                 | Coded rejection reasons exist, but there are **six**, not fourteen: `haemolysed`, `clotted`, `insufficient`, `unlabelled_or_mislabelled`, `wrong_container`, `delayed` (`lib/emr/write/specimens.ts:68-75`; DB check 0071:490-491). Stored on `specimen_events` (`kind = 'rejected'`, `reason_code`). Mapping to RS01–RS14 in Q8                                                                                                                                                                 |
| H8  | Confirmed                     | `/hospital-admin/reports` (`app/hospital-admin/reports/page.tsx`, `lib/hospital-admin/reports.ts`) holds booking metrics only; nothing under `app/hospital-admin` or `lib/hospital-admin` reads lab data                                                                                                                                                                                                                                                                                         |
| H9  | Confirmed                     | Critical alerts with `sent_at`, `due_at`, `acknowledged_at` (0102:67-95) against the signed `critical_response_versions.ack_within_min` (0102:29); amendments `amendResults` (`results.ts:639`) with correction alerts `correctAlerts` (`lib/lab/criticals/store.ts:1119`, `critical_alerts.correction_of` 0102:73); downtime back-entry with true times (`downtime_entries.collected_at`, `resulted_at`, `entered_at`, 0105:53-65)                                                              |
| H10 | Confirmed                     | No purpose on any order. The nearest thing, the fact qualifier `testPurpose` (`lib/facts/types.ts:147`), has a different vocabulary (screening, diagnostic, monitoring, …) and is not used by the lab. No HTS record, no repeat-tester or DNA-confirmed field                                                                                                                                                                                                                                    |

### Q3 HMIS 105 (owner action OA-1)

Neither the printed or scanned HMIS 105 nor the eHMIS data-element export could be obtained in this session. The
prompt says to stop here; the owner's instruction is to continue. So:

- The form version is built from the research transcription, marked **"unverified (research, text extraction)"**
  on every row, and the mapping **cannot be signed** until the HMIS focal person confirms each row against the
  printed form or the eHMIS export (hazard 22). The product shows "Rows not yet verified against eHMIS" until then.
- **The row comparison** (form versus transcription) cannot be done. What can be compared is the transcription
  against the canvas (artboard 11): every code on the canvas (HE02, HE04, SR01, SR07, IG04, ML01, PS01, PS02, RP03,
  RP05, CX03, CX07) matches the transcription. The open items the owner must settle from the real form: which 10.2
  rows have a positive column; RS02–RS13 labels and order; whether VS18 exists; MS13's meaning; SC01/SC02 and
  LV01/LV02 definitions; the 10.6 antibiotic list.

### Q4 eHMIS data-element ids (owner action OA-2)

Not obtained (eHMIS needs a login). The CSV columns are designed (data element, category option, value, period,
organisation unit code) and the ids are data on the form version, filled when obtained. The organisation unit code
is not stored anywhere today (the hospital's `registration_number` holds a licence or a registry code,
`app/signup/hospital/actions.ts:124`); GATE A adds it to the mapping payload.

### Q5 Registers (owner action OA-3)

No photographs. The default register columns are the canvas's (artboard 12), labelled as defaults, configurable per
hospital (D-LAB3-24). The lab lead replaces them from the paper registers before switch-on.

### Q6 The hub's machine model

As "five things" 1 above: no machine table, no per-machine status, no change events per machine. Status changes are
`availability_events` rows (append-only, audited before the change, `index.ts:116-133`), and ordering reads them
through `orderingAvailability` (`services-hub.ts:1236-1259`). A server action can call the hub's ops through
`callEdge("ha-services-hub", …)` (`lib/supabase/edge.ts:20`; used by `app/nurse/beds/actions.ts:28`), so the lab can
write status **through the hub's own action**, as Law 2 asks, without copying it.

### Q7 Bedside devices and lots, and the path into the ledger

Schema as Q1. The path: create the stock ledger's lots table, copy every `poct_lots` row into it **keeping its id**
(state `accepted (before MedSync)`, hazard 11), repoint the `diagnostic_reports.lot_id` foreign key to the new table,
keep `poct_lots` read-only for the reverse path. Details in GATE A §7.

### Q8 Rejection codes (owner action OA-4 for the counts)

Codes as H7. Counts over 90 days need the production database (query in "Baseline" below). Proposed mapping by
label, with RS numbers to confirm from the real form (only RS01 and RS14 are known by number):

| MedSync code                | HMIS 10.7 row (label as transcribed)                  |
| --------------------------- | ----------------------------------------------------- |
| `insufficient`              | RS01 Inadequate specimen volume                       |
| `haemolysed`                | Hemolyzed specimen (RS number unverified)             |
| `unlabelled_or_mislabelled` | Wrong/Unclear specimen label (unverified)             |
| `delayed`                   | Too old specimen (unverified)                         |
| `wrong_container`           | Specimen type unacceptable … (unverified)             |
| `clotted`                   | RS14 Other reasons, unless the form has a clotted row |

"Specimen without lab request form" has no MedSync code (an order always exists). The mapping is part of the signed
HMIS mapping, not code.

### Q9 HIV testing

- Kit per assay: **not recorded per test.** The hook exists (`ResultValueInput.extraContext`,
  `lib/emr/write/results.ts:91-92`, merged into `clinical_observations.context`) but only the outcome uses it
  (`lib/lab/bedside.ts:107`). The kit name for each step can be derived from the signed algorithm version
  (`assays[{step, kit}]`) and the step concept (`obs.hiv_rdt_t1..t3`, 0108:36-38), so 10.3 "by kit" is derivable
  once the algorithm version is on each kit result. Lots per assay are not recorded; lots in use (LU-1) supply them.
- Purpose, repeat testers, DNA confirmation: none recorded (H10). Repeat testers and DNA-confirmed stay manual
  cells (HM-5).

### Q10–Q12 The lab's paper QC, stock and EQA practice (owner actions OA-5, OA-6, OA-7)

Not obtainable from the repo. The sign-off packs (GATE A §9) are templates the laboratory lead fills from the lab's
own books: which analytes have QC, levels, control materials, maker or lab targets; stock cards, count frequency,
store, NMS/JMS cycle; schemes and providers by the names the lab uses. "UNEQAS" stays unverified; the canvas's
provider names are placeholders.

### Q13 Turnaround data quality (owner action OA-8)

Needs production data. Receipt is the newest `specimen_events.recorded_at` of kind `received`
(`lib/lab/read.ts:157-172`); release is the `final` version's `recorded_at` (`read.ts:385`); downtime results use
`downtime_entries.collected_at` and `resulted_at` (`read.ts:452-457`). Query in "Baseline".

### Q14 Hospital-admin reports

`/hospital-admin/reports` (`app/hospital-admin/reports/page.tsx:61`, `requireHospitalAdminScope`, AAL2 and a
`hospital_admin` role), queries in `lib/hospital-admin/reports.ts:483` (`fetchHospitalReport(hospitalId, window)`,
windows 7/28/90 days). Lab reports sit in the lab workspace (`/lab/reports`, new nav item) for drill-down, and as an
aggregates-only section on the admin reports page fed by a definer function that returns counts only (Law 10).

### Q15 Health Unit In-Charge (owner action OA-9)

No such role. Roles are `user_roles.role` (latest CHECK `0098_pharmacy_access.sql:27-37`); the hospital admin is a
`hospital_admin` row with a primary/backup roster (`db/schema/hospital-admin-roster.ts:18-41`); department heads are
`department_heads` (0080:103-119). The In-Charge (in Uganda usually the medical superintendent) is a clinician,
not the hospital admin, so GATE A proposes a designation (`hmis_designations`: in-charge or HMIS focal person, from
and to dates, set by the hospital admin). The fresh second factor exists: `secondFactorFresh()` (`lib/auth-fresh.ts:6,
13-24`, 10 minutes, `REAUTH` error). Who is In-Charge at the test hospital: owner action.

### Q16 Print and charts

- Print: `printCss()` A4 portrait with page boxes (`components/emr/print-layout.tsx:20-35`); the only A4 landscape
  rule is inline in `app/hospital-admin/departments/_components/clinics-view.tsx:410`; the downtime form uses
  `print:` utilities (`app/lab/downtime/print/page.tsx:54-65`).
- Charts: hand-built SVG only, no library. Closest to a Levey-Jennings chart: `components/emr/chart/graphs/frame.tsx`
  (`GraphSvg`, `TimeAxis`, `ValueAxis`, `ReferenceLineMark`, `PointMark`, `ValuePath`) and
  `app/ncd/_components/charts/charts.tsx` (`RankedBars`, `Meter` for level bars). No new dependency needed.

### Q17 Test tools

Playwright is **not installed** (no config). As in Phases 0–2 this is not a stop: the owner's standing decision
D-LAB0-19 uses the screenshot harness instead. axe-core and jsdom are installed (`tests/a11y/static-pages.test.ts`
pattern); fake clocks are `vi.useFakeTimers()` / `vi.setSystemTime()` directly (`tests/lab/turnaround.test.ts:109`).
The PGlite lane: `bootLane()` (`tests/emr-db/_pglite.ts:128`) replays every migration, with `actAs` and `probe` for
RLS.

### Q18 Paper tally (owner action OA-10)

Not available. It is the "before" for the parallel run (S45), which starts only when `labHmis` is switched on.

### Other differences found (repo versus prompt)

- **D1** `poct.record` is not a permission: it is a live `poct_operators` row plus a collecting cadre
  (`lib/emr/write/orders.ts:280`). Competency (BQ-4) adds a per-test validity beside it.
- **D2** `lab.manage` comes only from an open `department_heads` row for LABORATORY or one of its sections
  (`lib/lab-tech/scope.ts:166-193`; `data/lab/permission-map.v1.json` notes). Cadres get view, collect, receive,
  enter and release.
- **D3** Flags are environment variables (`"1"` or a list of hospital ids), not a table (`lib/lab/feature.ts:51-65`,
  `lib/workspace-access/flag.ts:9-29`). "Per-hospital" means the hospital-id list.
- **D4** Restricted classes are on the test (`test_catalogue.restricted_class`, 0107:116-126: `hiv` for HIV rapid,
  viral load, CD4, CrAg); reports and observations carry only `sensitivity = 'restricted'`, not the class. There is
  no per-user HIV access grant: access means an EMR access basis for the patient. "Users with HIV access" (DR-3)
  therefore needs a definition (GATE A §4).
- **D5** There is no section on a test. The section is per hospital, `diagnostic_offerings.section_id` through
  `lab_test_services`. Register "per section" and reports "by section" read it from there.
- **D6** No ward on orders. OPD or IPD comes from `encounters.encounter_type`; the ward from `admissions.ward_id`
  (0091:34); the worklist's "from" is `encounters.department_id` (`lib/lab/read.ts:93-98`).
- **D7** Pharmacy Phase 1 (`feat/pharmacy-dispensing`, unmerged) has its own stock (`pharmacy_batches`,
  `pharmacy_stock_movements`, `pharmacy_counts`, migrations 0122–0135). No name clash if the lab's tables carry a
  `lab_` prefix; the two ledgers stay separate (different items, different keepers).
- **D8** `devices` rows are readable by every authenticated user (0071:1387-1392, `USING (true)`). Not PHI, but
  Phase 3 adds service details and logs; those go in new tables with hospital-scoped RLS.

### Baseline

- **Failing tests** (`tests/lab/phase-3/baseline.test.ts`, three `it.fails`, all green as expected failures today):
  - (a) the release write has no QC check: `writeReportVersion` never asks for a QC status, so with a rejected run
    on record release would succeed. Expressed at code level (no QC table exists yet), as Phase 1's baseline did.
  - (b) a bedside result from a device whose control check failed is saved: `bedsideErrors` has no device-check
    input and returns no error.
  - (c) an expired lot can be selected and saved at the bedside: the form lists expired lots, and a reading at 01:30
    Kampala time on the day after the use-by date passes the server (UTC date comparison).
- **Screenshots** (`/lab`, result entry, hub, admin reports): taken at Step 4 with the harness on a production build,
  as Phase 2 did, so before and after are like for like.
- **What section 10 could be counted from the records alone** (no numbers here: the trial data lives in
  production). The owner can run this for a recent month (hospital-local, Africa/Kampala):

```sql
-- 10.2 by test: released lab reports (current version), result time in the month; downtime uses the form's time
WITH cur AS (
  SELECT DISTINCT ON (d.logical_id) d.*
    FROM diagnostic_reports d WHERE d.kind = 'lab' ORDER BY d.logical_id, d.version DESC)
SELECT t.code, count(*) AS done
  FROM cur JOIN test_catalogue t ON t.id = cur.test_id
  LEFT JOIN downtime_entries de ON de.report_id = cur.id
 WHERE cur.hospital_id = $1 AND cur.status IN ('final','amended','corrected') AND cur.performer <> 'external'
   AND date_trunc('month', (coalesce(de.resulted_at, cur.effective_at) AT TIME ZONE 'Africa/Kampala'))
       = date '2026-09-01'
 GROUP BY 1 ORDER BY 1;
-- 10.7: rejected specimens by reason and specimen type
SELECT e.reason_code, s.specimen_type, count(*) FROM specimen_events e JOIN specimens s ON s.id = e.specimen_id
 WHERE e.hospital_id = $1 AND e.kind = 'rejected'
   AND date_trunc('month', e.recorded_at AT TIME ZONE 'Africa/Kampala') = date '2026-09-01' GROUP BY 1, 2;
-- 10.1: patient-days with a specimen received, by encounter type and specimen type
SELECT en.encounter_type, s.specimen_type,
       count(DISTINCT (s.patient_user_id, (e.recorded_at AT TIME ZONE 'Africa/Kampala')::date))
  FROM specimen_events e JOIN specimens s ON s.id = e.specimen_id
  JOIN encounter_orders o ON o.id = s.order_id JOIN encounters en ON en.id = o.encounter_id
 WHERE e.hospital_id = $1 AND e.kind = 'received'
   AND date_trunc('month', e.recorded_at AT TIME ZONE 'Africa/Kampala') = date '2026-09-01' GROUP BY 1, 2;
-- Q13: share of released results in 90 days with a receipt time, and share from downtime back-entry
SELECT count(*) FILTER (WHERE r.id IS NOT NULL)::float / nullif(count(*), 0) AS with_receipt,
       count(*) FILTER (WHERE de.report_id IS NOT NULL)::float / nullif(count(*), 0) AS from_downtime
  FROM diagnostic_reports d
  LEFT JOIN specimen_events r ON r.specimen_id = d.specimen_id AND r.kind = 'received'
  LEFT JOIN downtime_entries de ON de.report_id = d.id
 WHERE d.hospital_id = $1 AND d.kind = 'lab' AND d.status = 'final' AND d.recorded_at > now() - interval '90 days';
```

What the records **cannot** give today, before any mapping: positives per HMIS rule (needs the mapping), 10.3 by
kit and purpose (H10, Q9), 10.4 volume (To refer has no events), 10.5 by reason (H6), 10.6 (manual), and
Section 6 (no stock). That gap is the case for this slice.

### Owner actions (none blocks Steps 1–8; OA-1, OA-2 and OA-10 block signing the HMIS mapping and S45)

| #     | Action                                                                                                           | Blocks                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| OA-1  | Printed or scanned HMIS 105 (2019 print version) or the eHMIS dataset export; confirm every Section 10 and 6 row | Signing the HMIS mapping                  |
| OA-2  | eHMIS data-element and category-option ids per cell; the hospital's organisation unit code                       | The CSV (S44)                             |
| OA-3  | Photographs of the paper registers (general, chemistry, haematology, HIV, TB), patient details covered           | Register defaults (S38 uses the canvas's) |
| OA-4  | Run the baseline queries above on production; rejection counts over 90 days                                      | Nothing; informs the mapping              |
| OA-5  | The lab's paper QC: analytes, levels, control materials, target sources                                          | Go-live list of QC plans                  |
| OA-6  | Stock practice: stock and bin cards, count frequency, store, NMS/JMS cycle                                       | Operational settings                      |
| OA-7  | EQA schemes and provider names as the lab knows them                                                             | EQA set-up                                |
| OA-8  | Turnaround data quality (query above)                                                                            | Nothing                                   |
| OA-9  | Who is the Health Unit In-Charge and the HMIS focal person at the test hospital                                  | Signing the HMIS mapping and reports      |
| OA-10 | One month of the paper tally of section 10, patient details absent                                               | The parallel run (S45)                    |

### Numbers

Migrations **0112–0119** (and spare **0150–0159**) and ADRs **0300–0319** are free on every local and remote branch;
claimed for this slice in `docs/NUMBERS.md`.

## STOP 1: GATE A (13 Oct 2026)

The proposal is `docs/lab/phase-3/gate-a-proposal.md`; the hazard log is `docs/lab/phase-3/hazard-log.md` (draft,
all 30 hazards with cause, effect, control, proving test and residual risk). The owner told the session to pass every
gate on Claude's recommendations, so every D-LAB3 and E-LAB3 decision is recorded as accepted and the build goes on.
Nothing clinical is signed by that: QC plans and targets, rules, acceptance criteria, kit and stain rules, device
rules, competency validity, stock levels, temperature ranges, the HMIS mapping and every string a clinician reads stay
drafts until they are signed in the product, and the eight flags stay off in production until the CSO signs the copy
(`LAB3_COPY_STATUS`).

**The main simplifications** (19 differences from the prompt, each with its reason, in §1 of the proposal):

- every signed thing is a new kind in Phase 2's `lab_signed_configs` (eight kinds), with lead-only kinds where the
  prompt has the laboratory lead sign alone, lead + CSO for QC plans and the QC policy, and lead + HMIS focal person
  for the mapping (E-LAB3-12);
- the machine record is the existing `devices` table, widened (the hub has none), with status written through the
  hub's own `report_problem` / `resolve_problem` (E-LAB3-09);
- one append-only log for maintenance, calibration, temperature and repairs; one row per QC run; one table for kit,
  stain and device control checks; control materials and strip lots are ordinary stock lots;
- the HMIS form version is a committed data file, every row marked unverified until OA-1;
- 23 new tables against about 50 in the prompt; six migrations, 0112–0117.

**New decisions this gate added** (accepted as recommended): E-LAB3-08 partial release (held components stay
preliminary inside a final report, released later by a completion version), E-LAB3-09 the machine record,
E-LAB3-10 seven new specimen types for the HMIS columns, E-LAB3-11 `hmis_designations` for the In-Charge and the
focal person, E-LAB3-12 the signer slots per kind.

**Open before signing (not before building):** OA-1 and OA-2 (the real HMIS 105 and eHMIS ids) block signing the
mapping and the CSV; OA-9 names the In-Charge and the focal person; OA-10 is the parallel month. Three orderable
tests need the lead's mapping choice before the mapping can be signed: `test.urinalysis_dipstick`,
`test.syphilis`, `test.islet_autoantibodies`.

**Next:** Step 2, the data layer (0112–0117, the triggers, the `poct_lots` move, flags, permissions, RLS probes).
