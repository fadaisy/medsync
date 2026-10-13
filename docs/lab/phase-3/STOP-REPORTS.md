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

## STOP 2: Data layer (13 Oct 2026)

Migrations written, never applied (the owner applies them). All six are GATED, additive and re-runnable; every new
table has RLS enabled and forced, INSERT, UPDATE, DELETE and TRUNCATE revoked from `anon` and `authenticated`, the
`audit_log_changes` trigger, and SELECT for `medsync_clinical_reader` only, scoped to `private.current_hospital_id()`.

### Migrations

| File                           | What it adds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0112_lab_stock.sql`           | Reader helpers `private.lab_reader()` (lab cadre, or open head of LABORATORY or a section, substantive or acting) and `private.bedside_device_ids()` (a live bedside operator's bedside devices on a ward of their department, or on no ward). `lab_signed_configs`: eight new kinds, `lsc_signed_by_two` with lead-only kinds. `lab_settings.quality`. `lab_stock_items`, `lab_stock_lots` (state guard), `lab_stock_lot_events`, `lab_deliveries`, `lab_stock_counts`, `lab_stock_transactions`, `lab_lot_acceptances`, `lab_lots_in_use` (accepted-lot guard). `lab_result_snapshots.lots`, `.qc`. The `poct_lots` move, the foreign-key repoint and the count check |
| `0113_lab_equipment.sql`       | `devices`: twelve equipment kinds, states `down` and `blocked`, `section_id`, `details`, `linked_concepts`, `linked_tests`, `schedules`. `analyser_profiles.device_id`. `lab_equipment_logs`, `lab_breakdowns` (closed once; one open per device)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `0114_lab_qc.sql`              | `lab_qc_runs`, `lab_qc_status`, `lab_control_checks`, `lab_nonconformities` (opened facts kept, frozen when closed), `lab_nc_events`, `lab_lookback_items` (decided once; PHI policy), `diagnostic_reports.qc_held`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `0115_lab_eqa.sql`             | `lab_eqa_schemes`, `lab_eqa_rounds`, `lab_alt_assessments`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `0116_lab_bedside_quality.sql` | `lab_competencies` (a reassessment is a new row; only the revocation is ever set, once)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `0117_lab_registers_hmis.sql`  | `hmis_designations` with `private.hmis_designated()` and `private.hospital_admin_reader()`; `lab_register_prints`; `lab_hmis_reports` (frozen once signed, never deleted) with `private.lab_hmis_aggregates()`; `encounter_orders.test_purpose`; seven specimen types                                                                                                                                                                                                                                                                                                                                                                                                   |

Code beside them: Drizzle `db/schema/lab-quality.ts` (23 tables) and the new columns on `devices`, `specimens`
(CHECK), `diagnostic_reports`, `encounter_orders`, `lab_settings`, `lab_result_snapshots`, `analyser_profiles`;
`SPECIMEN_TYPES` gains the seven; eight flags in `lib/lab/feature.ts` behind `LAB3_COPY_STATUS` (draft) in
`content/lab-phase-3.ts`, which holds Appendix A word for word (`hmisCountingRules` is the nine HM-3 texts of §8.3);
five permissions in `lib/lab/access.ts`; `lib/lab/hmis-designations.ts` (`hmisRolesFor`).

**Permissions.** `lab.qc.override`, `lab.eqa.manage` and `lab.hmis.check` come with `lab.manage` from headship
(the scope already counts acting heads); no cadre can carry them. `lab.stock.manage` and `poct.assess` are in
`data/lab/permission-map.v2.json`, **draft**: until the CSO signs it, 1.0.0 stays in force and no cadre holds them.

### RLS probe table (every object × every actor; `tests/emr-db/lab-phase3-data.test.ts`)

Fixtures in hospital A: two bedside meters (one on the nurse's ward, one on another), an analyser, a strip item with
two moved lots, a reagent item and lot, one row or more in every table. "read" = every hospital-A row; "own" = only
the rows below; "0" = nothing. The test asserts exact counts.

| Object                                                                                                        | Lab staff                       | Lead (acting head) | In-Charge              | Focal                  | Nurse operator                          | Hospital admin         | Clinician                  | Other hospital | Superadmin | Anon |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------ | ---------------------- | ---------------------- | --------------------------------------- | ---------------------- | -------------------------- | -------------- | ---------- | ---- |
| `lab_stock_items`                                                                                             | read                            | read               | 0                      | 0                      | own (the item of her device's lot)      | 0                      | 0                          | 0              | 0          | 0    |
| `lab_stock_lots`                                                                                              | read                            | read               | 0                      | 0                      | own (lots in use on her ward's devices) | 0                      | 0                          | 0              | 0          | 0    |
| `lab_lots_in_use`                                                                                             | read                            | read               | 0                      | 0                      | own (her ward's devices)                | 0                      | 0                          | 0              | 0          | 0    |
| `lab_stock_lot_events`, `lab_stock_transactions`, `lab_deliveries`, `lab_stock_counts`, `lab_lot_acceptances` | read                            | read               | 0                      | 0                      | 0                                       | 0                      | 0                          | 0              | 0          | 0    |
| `lab_equipment_logs`                                                                                          | read                            | read               | 0                      | 0                      | own (her ward's devices)                | 0                      | 0                          | 0              | 0          | 0    |
| `lab_breakdowns`                                                                                              | read                            | read               | 0                      | 0                      | 0                                       | 0                      | 0                          | 0              | 0          | 0    |
| `lab_qc_runs`, `lab_qc_status`                                                                                | read                            | read               | 0                      | 0                      | 0                                       | 0                      | 0                          | 0              | 0          | 0    |
| `lab_control_checks`                                                                                          | read                            | read               | 0                      | 0                      | own (her ward's device checks)          | 0                      | 0                          | 0              | 0          | 0    |
| `lab_nonconformities`, `lab_nc_events`                                                                        | read                            | read               | 0                      | 0                      | 0                                       | 0                      | 0                          | 0              | 0          | 0    |
| `lab_lookback_items` (PHI)                                                                                    | read (patients they may access) | read (same)        | 0                      | 0                      | 0                                       | **0**                  | 0                          | 0              | 0          | 0    |
| `lab_eqa_schemes`, `lab_eqa_rounds`, `lab_alt_assessments`                                                    | read                            | read               | 0                      | 0                      | 0                                       | 0                      | 0                          | 0              | 0          | 0    |
| `lab_competencies`                                                                                            | read                            | read               | 0                      | 0                      | own row                                 | 0                      | 0                          | 0              | 0          | 0    |
| `lab_register_prints`                                                                                         | read                            | read               | 0                      | 0                      | 0                                       | 0                      | 0                          | 0              | 0          | 0    |
| `lab_hmis_reports` (table)                                                                                    | read                            | read               | 0                      | 0                      | 0                                       | 0                      | 0                          | 0              | 0          | 0    |
| `private.lab_hmis_aggregates()`                                                                               | 1 report                        | 1 report           | 1 report, no `sources` | 1 report, no `sources` | 0                                       | 1 report, no `sources` | 0                          | 0              | 0          | —    |
| `hmis_designations`                                                                                           | read (2)                        | read (2)           | own (1)                | own (1)                | 0                                       | read (2)               | 0                          | 0              | 0          | 0    |
| `diagnostic_reports.qc_held`                                                                                  | as today                        | as today           | —                      | —                      | —                                       | 0                      | read (may open the result) | 0              | 0          | 0    |

Also proved: staff of hospital B asserting hospital A's id read nothing in any table; a CONSULTANT who is the
substantive head of the Laboratory (no lab cadre) reads the quality records and no look-back item (no access basis
to the patient); any `authenticated` client INSERT fails and UPDATE or DELETE touches no row, in all 23 tables.
Indicator drill-down functions are Step 10 (none exists yet).

### Append-only proofs

- `lab_stock_lot_events`, `lab_stock_transactions`, `lab_deliveries`, `lab_stock_counts`, `lab_lot_acceptances`,
  `lab_lots_in_use`, `lab_equipment_logs`, `lab_qc_runs`, `lab_control_checks`, `lab_nc_events`,
  `lab_register_prints`: UPDATE and DELETE raise `append-only` for the owner **and as `service_role`** (which
  bypasses RLS and keeps its grants: only the trigger stops it).
- Once-only, also as `service_role`: a breakdown is closed once and nothing else changes; a look-back item is decided
  once; a competency is revoked once; a nonconformity keeps what was opened and is frozen once closed; a signed HMIS
  report changes only to record its export, once, and no report is ever deleted. None of these deletes.
- Lots: a lot starts `received` (or moved in as `before_medsync`); its state changes only along §5.1 and only with a
  matching `lab_stock_lot_events` row in the **same transaction** (an event from an earlier transaction is refused);
  received → in use is refused; a lot is never deleted and its item and number never change; `lab_lots_in_use`
  refuses a lot that is not accepted (LU-2).
- Signers: a `kit_qc_rule` signs with the lead alone; a `qc_plan` with the lead alone is refused (`lsc_signed_by_two`).

### `poct_lots` count check

In the migration (0112 refuses to finish otherwise) and in the test: `count(poct_lots) = count(lab_stock_lots WHERE
accepted_basis = 'before_medsync' AND id IN (SELECT id FROM poct_lots))`, every `diagnostic_reports.lot_id` resolves
in `lab_stock_lots`, and the foreign key now targets `lab_stock_lots`. The test writes a lot with the copy trigger
off (as before 0112), runs 0112 twice: 3 = 3 lots, 3 events, 3 lots-in-use rows; the old lot kept its id, number,
use-by and device; two meters on one strip lot are one item with two lots. The reverse plan is in the 0112 header.

### Admin aggregates only (RLS level)

The hospital admin, the In-Charge and the focal person read no row of `lab_hmis_reports` directly; through
`private.lab_hmis_aggregates()` they get the report with its cells and **without** `sources` (the record ids). A
clinician, a nurse, another hospital and a superadmin get nothing. The admin reads no look-back item and no
diagnostic report.

### Differences from the proposal (for Step 3 onward)

- **`poct_lots` copy trigger.** Phase 2's bedside screens still write `poct_lots`; until Step 4 moves them onto the
  ledger, `poct_lots_into_ledger` copies each new lot (same id) so the repointed foreign key always resolves. Step 4
  drops the trigger with the readers' move.
- **Lot uniqueness.** `UNIQUE (item_id, lot)` exempts the moved `before_medsync` rows: Phase 2 kept lots per device,
  so two meters on one strip lot arrive as two rows that must keep their ids.
- **Lot transitions** add `in_acceptance → quarantined` (the proposal's own Determine example, §5.1). `lib/lab/stock.ts`
  does not list it yet.
- **`lab_register_prints.register`** is `general`, `hiv`, `tb`, `mental_health` or `sexual_reproductive_health`
  (the restricted classes) in place of the proposal's placeholder `class`.
- Columns the proposal left implicit: `id` on `lab_stock_lot_events` and `lab_nc_events`; `lab_qc_runs."values"` is a
  reserved word (quoted in SQL; Drizzle quotes it); `lab_nonconformities.owner` is nullable (an automatic
  nonconformity at a lab with no lead still opens); `lab_hmis_reports.mapping_config_id` may be empty until the report
  is signed; `lab_register_prints.config_id` is empty while the canvas defaults are used (OA-3).
- **Specimen types:** the catalogue's sputum tests already name `sputum` and no stool or swab test exists, so no
  catalogue row changes.
- **Signed-config payloads** (`PAYLOADS`, `KIND_WORDS`, the sign-off page) for the eight kinds are not added here:
  each lands with the step that first writes it.
- **Bedside nurse scope** reads devices on a ward of her affiliation's department, or on no ward
  (`private.bedside_device_ids()`).

### Checks

- `npx tsc --noEmit`: clean (0 errors).
- `npm run lint`: 0 errors (2 warnings, both in `scripts/embed-bench.mjs`, there before this step).
- `vitest run tests/emr-db tests/lab tests/design` on the PGlite lane: 93 files, 1281 passed, 3 expected failures
  (the Step 0 baseline `it.fails`, still in place), 0 failed. The count includes the engine tests the parallel Step 3
  work added. Baseline before this step: 82 files, 1090 passed, 3 expected failures.
- New tests: `tests/emr-db/lab-phase3-data.test.ts` (13), `tests/lab/feature.test.ts` Phase 3 flags and Appendix A
  word for word (3), `tests/lab/access.test.ts` (LA-1 now names eleven permissions; two Phase 3 cases).

**Next:** Step 3, the engines (pure, no UI).

## STOP 3: Engines (13 Oct 2026)

Pure engines for §6.1–6.12, no UI and no I/O: input in, output out; no `@/db`, no `server-only`, no clock (every
function takes `now`/`at` and the time zone). Hospital-local days reuse `localDateKey` and `endOfLocalDay` from
`supabase/functions/_shared/slots.ts` (`DEFAULT_TIME_ZONE`), through five small day helpers in `lib/lab/stock.ts`.
Reused: `computeFlag` (`lib/lab/flags.ts`) for the look-back sort, `releasedTurnaround` (`lib/lab/turnaround.ts`)
for the turnaround indicators. Nothing committed.

**Files.** `lib/lab/{stock,acceptance,lots-in-use,equipment,qc-kits,qc-rules,qc,lookback,eqa,nonconformity,
bedside-quality,register,hmis105,indicators}.ts` (none was I/O only, so none was skipped);
`data/lab/hmis105-2019-09.json` (134 rows from research Part A §1, every row `verified: false`, `hasPositive: null`,
every eHMIS id null); tests in `tests/lab/phase-3/` (11 files, `_fixtures.ts`, and `fixtures/count105-month.ts`,
`fixtures/count105-expected.json`, `fixtures/count105-expected.md`). Every number in a test is a named fixture;
Westgard rule definitions are the only structure in code.

**Tests.** 175 new tests, all green (`stock` 13, `acceptance` 31 incl. lots in use, `qc-rules` 28, `qc` 14,
`lookback` 11 incl. nonconformities, `qc-kits` 10, `equipment` 6, `eqa-bedside` 11, `register` 6, `hmis105` 25,
`indicators` 20); the three Step 0 baseline `it.fails` are unchanged. Every list and count is shown with two hospitals.
The count105 fixture caught two engine bugs before this report (a positive column ignored its row's stain-method
filter; an empty expired quantity came out as `-0`); both fixed.

### Choices the proposal left open (engine level; each in a comment where it lives)

- `hmis_mapping` needs, beyond §3.1's list: `visits` (encounter type → LV01/LV02), `hivTests`, `kits` (algorithm kit
  name → 10.3 row), `kitItems` (stock item → 10.3 row, for IQC), `purposes` (→ 10.3 column) and `excluded` (menu
  tests the lead does not report); `reasons` takes a `none` key for orders placed before the snapshot carried a
  reason. For the Zod payload at Step 9.
- The EQA look-back runs "to scoring", so the engine takes a `scoredOn` date; `lab_eqa_rounds` has no such column
  (add one, or take the time the scores were entered).
- An amended result counts in the month of its first release, with the current version's answers (HM-3 a, g).
- 10.3: an inconclusive outcome counts once, on the kit of the last step performed; Total is every patient kit test,
  purpose recorded or not (IQC and EQA are their own columns).
- QH-5 offers any in-service analyser whose latest run was accepted (`passed`, `warning`, `provisional_target`), not
  held.
- `per_run` QC frequency reads as the hospital-local day (analyser runs are not modelled); QQ-3's minimum span counts
  distinct hospital-local days.
- ST-4 averages the whole months before the current one; the history must reach the window's start.
- LB-2 with two failed levels takes the larger estimate (it only sorts).
- EQ-6 "Reading not recorded": the day is split into `readingsPerDay` equal windows; an ended window with no reading
  is missing.
- Indicators count stock-out days only for days that have ended.
- The form file's SHA-256 is left to the caller (Step 9).

### Rule coverage (rule → number of tests → one test name)

| Rule  | n   | Test                                                                                                                               |
| ----- | --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| ST-1  | 1   | `stock.test.ts`: ST-1 an item carries kind, tests per unit, linked tests, tracer code and levels                                   |
| ST-2  | 1   | `stock.test.ts`: ST-2 lot states move only along GATE A §5.1, and expired is the clock's verdict                                   |
| ST-3  | 1   | `stock.test.ts`: ST-3 on hand is the sum of the ledger, per item, lot and hospital                                                 |
| ST-4  | 3   | `stock.test.ts`: ST-4 uses the issues of the last whole months, net of returns                                                     |
| ST-5  | 1   | `stock.test.ts`: ST-5 quantity to reach maximum is max × use − on hand, never negative; below minimum flagged                      |
| ST-6  | 2   | `stock.test.ts`: ST-6 nextLotToUse returns the selectable lot with the earliest use-by                                             |
| ST-7  | 1   | `stock.test.ts`: ST-7 counts days at 0 at the end of the hospital-local day, across a month boundary                               |
| ST-8  | 1   | `stock.test.ts`: ST-8 expiry alerts at the window, and expired lots cannot be issued or selected                                   |
| ST-9  | 1   | `stock.test.ts`: ST-9 expected versus issued lists a difference beyond the tolerance, and informs only                             |
| ST-10 | 1   | `stock.test.ts`: ST-10 the count lists items due; a discrepancy needs a reason and adjusts the ledger                              |
| LA-1  | 1   | `acceptance.test.ts`: LA-1 each method decides from its own evidence                                                               |
| LA-2  | 1   | `acceptance.test.ts`: LA-2 the plan states its triggers                                                                            |
| LA-3  | 17  | `acceptance.test.ts`: LA-3 { absolute: 0.5, combine: 'larger' }: current 4, candidate 4.5 → within                                 |
| LA-4  | 7   | `acceptance.test.ts`: LA-4 received → not_accepted (bench lots in use, analyser and bedside share this check)                      |
| LA-5  | 1   | `acceptance.test.ts`: LA-5 comparison samples are shown as Sample n with their level, recorded by result id                        |
| LA-6  | 1   | `acceptance.test.ts`: LA-6 go-live lots are accepted (before MedSync) only with the lead's statement                               |
| LU-1  | 1   | `acceptance.test.ts`: LU-1 the lots in use per analyser and component: reagent, calibrator, control                                |
| LU-2  | 1   | `acceptance.test.ts`: LU-2 changing a lot in use needs the lot accepted or in use, not expired                                     |
| LU-3  | 1   | `acceptance.test.ts`: LU-3 a release snapshots the lots at the result time; downtime without a time is 'lot not recorded'          |
| EQ-1  | 1   | `equipment.test.ts`: EQ-1 the register's linked components and kits decide what back in service needs                              |
| EQ-2  | 1   | `equipment.test.ts`: EQ-2 marking down reports a hub problem for tests whose only in-service machine this is                       |
| EQ-3  | 1   | `equipment.test.ts`: EQ-3 back in service needs a repair and an accepted run after it for every linked component                   |
| EQ-4  | 1   | `equipment.test.ts`: EQ-4 maintenance tasks are overdue by days or count; only 'required before use' blocks                        |
| EQ-5  | 1   | `equipment.test.ts`: EQ-5 calibration items fall due from their schedule                                                           |
| EQ-6  | 1   | `equipment.test.ts`: EQ-6 an out-of-range reading opens a nonconformity and suggests quarantine; missing readings are listed       |
| KQ-1  | 1   | `qc-kits.test.ts`: KQ-1 a rule per kit: triggers, controls, expected answers, required before use or informs                       |
| KQ-2  | 5   | `qc-kits.test.ts`: KQ-2 nothing done: every trigger is due                                                                         |
| KQ-3  | 2   | `qc-kits.test.ts`: KQ-3 a failed control quarantines the lot at once and opens a nonconformity                                     |
| KQ-4  | 1   | `qc-kits.test.ts`: KQ-4 a pass on a new lot whose acceptance plan is qc_pass accepts the lot                                       |
| KQ-5  | 1   | `qc-kits.test.ts`: KQ-5 stain QC passes only when every signed criterion is ticked                                                 |
| KQ-6  | 1   | `hmis105.test.ts`: KQ-6 HIV rapid-test QC events are counted in 10.3 as IQC, by kit                                                |
| QQ-1  | 1   | `qc.test.ts`: QQ-1 a control lot level has the target and SD of the plan version in force                                          |
| QQ-2  | 1   | `qc.test.ts`: QQ-2 a plan needs levels, reject rules, targets and an n for per-sample frequency                                    |
| QQ-3  | 2   | `qc.test.ts`: QQ-3 the lab's target needs the signed minimum runs over the signed minimum days, accepted runs only                 |
| QR-1  | 1   | `qc-rules.test.ts`: QR-1 breaks report their scope and the points that break them (run ids)                                        |
| QR-2  | 1   | `qc-rules.test.ts`: QR-2 a computer evaluation applies every configured rule; 1-2s is never a gate                                 |
| QR-3  | 1   | `qc-rules.test.ts`: QR-3 history resets on a control lot change and on a new plan version                                          |
| QR-4  | 25  | `qc-rules.test.ts`: QR-4 1-2s alone: [] then [2.3,0.4] → 1-2s/point                                                                |
| QH-1  | 4   | `qc.test.ts`: QH-1 no plan, then not run, then passed, warning, failed, provisional                                                |
| QH-2  | 2   | `qc.test.ts`: QH-2 with the hold on, a failed component is held and the others release                                             |
| QH-3  | 1   | `qc.test.ts`: QH-3 not run in the window holds only when the plan says; otherwise 'QC not run today' is recorded                   |
| QH-4  | 1   | `qc.test.ts`: QH-4 override: a holder with a reason releases with the signed line and joins the look-back                          |
| QH-5  | 1   | `qc.test.ts`: QH-5 'Run on another analyser' lists in-service analysers with an accepted run, this hospital only                   |
| QH-6  | 1   | `qc.test.ts`: QH-6 the status at release is snapshotted per component                                                              |
| LB-1  | 1   | `lookback.test.ts`: LB-1 lists results released from the last accepted run to the rejected run on that analyser, plus overrides    |
| LB-2  | 2   | `lookback.test.ts`: LB-2 the bias is the failed level's mean z × SD, labelled estimate (GATE A §5.3 worked example)                |
| LB-3  | 1   | `lookback.test.ts`: LB-3 one decision per result, with actor and time, set once                                                    |
| LB-4  | 1   | `lookback.test.ts`: LB-4 'n of m reviewed'; complete only when every result is decided                                             |
| EA-1  | 1   | `eqa-bedside.test.ts`: EA-1 schemes enrol tests per hospital                                                                       |
| EA-2  | 1   | `eqa-bedside.test.ts`: EA-2 a tester with no patient release for the scheme's tests in the window is warned about                  |
| EA-3  | 1   | `eqa-bedside.test.ts`: EA-3 scores are the provider's; MedSync only reads them                                                     |
| EA-4  | 2   | `eqa-bedside.test.ts`: EA-4 an unacceptable result opens a nonconformity with a look-back from receipt to scoring                  |
| EA-5  | 1   | `eqa-bedside.test.ts`: EA-5 coverage: a scheme, or an alternative assessment within the lead's period, else counted                |
| EA-6  | 1   | `hmis105.test.ts`: EA-6 HIV EQA panel tests are counted in 10.3 under EQA, by kit                                                  |
| NC-1  | 1   | `lookback.test.ts`: NC-1 automatic sources are opened by MedSync with the lead as owner; only a QC reject halts                    |
| NC-2  | 1   | `lookback.test.ts`: NC-2 numbers and actions as events                                                                             |
| NC-3  | 1   | `lookback.test.ts`: NC-3 resumption needs a passing run after the reject, the look-back finished and the lead                      |
| NC-4  | 1   | `lookback.test.ts`: NC-4 closing needs cause, look-back decided, actions done or cancelled with reason, effectiveness met, lead    |
| NC-5  | 1   | `lookback.test.ts`: NC-5 overdue actions are listed; nothing auto-closes                                                           |
| BQ-1  | 2   | `eqa-bedside.test.ts`: BQ-1 triggers: each day, new strip lot, new control vial, after a drop or error                             |
| BQ-2  | 1   | `eqa-bedside.test.ts`: BQ-2 a failed check blocks the device until a check passes; selection is refused                            |
| BQ-3  | 1   | `eqa-bedside.test.ts`: BQ-3 not done today informs, and blocks only when the rule says required before use                         |
| BQ-4  | 1   | `eqa-bedside.test.ts`: BQ-4 competency per test: valid to from the signed validity; lapsed and revoked refused; grace at switch-on |
| BQ-5  | 1   | `eqa-bedside.test.ts`: BQ-5 the result snapshots the device check status and the operator's competency                             |
| DR-1  | 2   | `register.test.ts`: DR-1 the day's received, released and rejected lines in lab-number order, hospital-local                       |
| DR-2  | 1   | `register.test.ts`: DR-2 columns come from the hospital's configuration                                                            |
| DR-3  | 1   | `register.test.ts`: DR-3 restricted classes never print on the general register; their own register needs access                   |
| DR-4  | 1   | `register.test.ts`: DR-4 each print writes a print event with the pages printed                                                    |
| DR-5  | 1   | `register.test.ts`: DR-5 a later amendment appears on the register of the day it was made, marked Amended                          |
| HM-1  | 1   | `hmis105.test.ts`: HM-1 the form version is data: the research transcription, every row unverified, eHMIS ids null                 |
| HM-2  | 1   | `hmis105.test.ts`: HM-2 the mapping cannot be signed while the form is unverified, a row is unknown or a menu test is unmapped     |
| HM-3  | 11  | `hmis105.test.ts`: HM-3 count105 on the fixture month equals the reviewed expected output (count105-expected.md)                   |
| HM-4  | 1   | `hmis105.test.ts`: HM-4 10.1 visits are patient × hospital-local day × OPD/IPD by specimen column; SC01 counts specimens           |
| HM-5  | 1   | `hmis105.test.ts`: HM-5 10.3 HIV tests by kit × purpose; inconclusive on the last kit; no purpose listed, never guessed            |
| HM-6  | 1   | `hmis105.test.ts`: HM-6 10.4 volume is a manual cell until referral tracking                                                       |
| HM-7  | 1   | `hmis105.test.ts`: HM-7 10.5 by the availability reason; orders from before the reason count under Others                          |
| HM-8  | 1   | `hmis105.test.ts`: HM-8 10.6 AMR is entered by hand                                                                                |
| HM-9  | 1   | `hmis105.test.ts`: HM-9 Section 6 tracer stock: consumed, days out of stock, on hand at month end, expired                         |
| HM-10 | 1   | `hmis105.test.ts`: HM-10 draft → checked (lead) → signed (In-Charge, fresh second factor) → exported                               |
| HM-11 | 1   | `hmis105.test.ts`: HM-11 changed since signing: the cells, old and new, and the records that caused them                           |
| HM-12 | 1   | `hmis105.test.ts`: HM-12 the CSV follows the form's order; blanks absent, zeros present; cells without eHMIS ids listed            |
| HM-13 | 1   | `hmis105.test.ts`: HM-13 a reminder from the 1st to the 7th while the previous month is unsigned                                   |
| QI-1  | 17  | `indicators.test.ts`: QI-1 every indicator is defined with an id, name, unit and WG-LEPS code where one applies                    |
| QI-2  | 1   | `indicators.test.ts`: QI-2 a zero denominator or no source rows is no_data, never 0 %                                              |
| QI-3  | 1   | `indicators.test.ts`: QI-3 computed at read time with the as-of time                                                               |
| QI-4  | 1   | `indicators.test.ts`: QI-4 drill-down records go to lab roles only; hospital admin gets aggregates                                 |

### count105 fixture review (`fixtures/count105-expected.md` walks every cell)

Month September 2026, Africa/Kampala; hospital A, with hospital B rows mixed in.

| Rule                                                                | Fixture rows that prove it                                                                                                                            | Expected                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| (a) result time in the month, hospital-local; downtime by form time | fbc-2 (30 SEP 23:30 Kampala, 20:30Z) in; fbc-3 (1 OCT 00:30 Kampala, 30 SEP in UTC) out; fbc-4 entered 9 OCT, form 29 SEP, in; fbc-18 preliminary out | HE02 = 3 (fbc-1, fbc-2, fbc-4)                                                     |
| (b) chemistry per analyte                                           | ue-5 (Na, K, Cl, HCO3, urea, creatinine, eGFR); creat-6                                                                                               | RP04 +1, RP03 +1, RP01 +1, RP05 +2 (two sources), CX07 +2; eGFR nowhere            |
| (c) QC and EQA not in 10.2                                          | potassium EQA round eqa-chem; malaria kit control check (hmisIqc false); Determine control (hmisIqc true)                                             | RP03 = 2 and PS02 = 4 unchanged; Determine IQC = 1                                 |
| (d) rejected specimens in 10.7 only                                 | sp-6 FBC `clotted`; sp-5 urine `insufficient`; sp-9 `wrong_container` (unmapped)                                                                      | RS14 Blood = 1, RS01 Urine = 1, HE02 unchanged; `rejection:wrong_container` listed |
| (e) referred-out in 10.5, never 10.2                                | ord-1 viral load `equipment_down`; ord-2 with no reason; ord-3 October                                                                                | 10.5 Equipment break down = 1, Others = 1; IG02 blank                              |
| (f) outside results never counted                                   | hba1c-9 `performer: external`                                                                                                                         | CX07 sources hold only ue-5's chloride and bicarbonate                             |
| (g) an amended result counts once, as its current version           | ue-7 (v2 corrected in October); rpr-8 (v1 non-reactive, v2 reactive); fbc-20 (v2 entered in error)                                                    | RP03 counts ue-7 once; SR01 done 1, positive 1; fbc-20 not counted                 |
| (h) bedside counted in its row, share stored                        | rdt-10, rdt-11 bench; rdt-12, rdt-13 bedside                                                                                                          | PS02 done 4 (bedside 2), positive 2 (bedside 1)                                    |
| (i) blank off the menu, 0 on the menu with none done                | HE06 mapped to a test off the menu; CX02 not mapped; ESR and the ZN smear on the menu, none done                                                      | HE06 blank, CX02 absent, HE04 = 0, MB02 = 0 / 0                                    |

Also proven on the same month: 10.1 visits (LV01 Blood 5 from P1 twice on 10 SEP counted once, P1 again on 11 SEP,
P5 at 23:30 on 30 SEP) against specimens (SC01 Blood 6); 10.3 by kit × purpose with one "Purpose not recorded";
Section 6 (SS07 consumed 15, on hand 82, expired 3, with a 1 OCT 00:30 issue left in October; SS11 3 days out of
stock); manual cells (VS02, Repeat testers) and a manual value for a computed cell ignored; hospital B counts only
its own rows; the revision diff (a late downtime FBC and a second correction of rpr-8) names the cells, old and new,
and the record ids.

### Checks

- `npx vitest run tests/lab/phase-3`: 12 files, 175 passed, 3 expected fail (the Step 0 baseline).
- `npx tsc --noEmit`: clean (whole repository, at the time of the run).
- `npx eslint lib/lab tests/lab/phase-3`: clean. Prettier run over every file this step wrote.

**Next:** Step 4, stock, lots and acceptance behind `labStock`.

## STOP 4: Stock, lots and acceptance, behind `labStock` (13 Oct 2026)

Built on the Step 2 tables and the Step 3 engines; no new migration. 0112 (unapplied, unshipped) was edited: the
`poct_lots_into_ledger` copy trigger is gone (dropped if present), because the bedside code now reads and writes
the ledger itself; the one-time move, the foreign-key repoint and the count check are unchanged.

**Code.** `lib/lab/stock-store.ts` (receive, issue, adjust / write off / return, count, quarantine and release,
accept and reject a lot, lots in use, switch-on, the lots-at-release snapshot), `lib/lab/stock-read.ts` (one read
per page: on hand, use, levels, FEFO, days out, expiry, count due, expected versus issued, plans),
`lib/lab/stock-actions.ts` (the house contract), `lib/lab/nc-store.ts` (the automatic nonconformity and the
lead's in-app notice, shared with Step 5). Signed config kind `acceptance_plan` (Zod payload, words, lead-only
signing: `LEAD_ONLY_KINDS` in `signed-config.ts`, `signConfig` puts a lead-only kind in force on the lead's
signature). Screens `/lab/stock` (artboard 5: filters with counts, level bar with the minimum mark and the number,
item panel in a centred `EditorDialog`, lot actions, plan editor), `/lab/stock/receive` (artboard 6: delivery,
lines with on-arrival checks, lots waiting with the comparison by "Sample n · level" and the plan card),
`/lab/stock/order` (print). Nav: a **Quality** group, "Stock and lots" behind `labStock` and `lab.view`.

**Bedside moved onto the ledger.** `recordBedsideResult` reads `lab_stock_lots` through `lab_lots_in_use` (the lot
must have been set in use on that device) and refuses with `lotRefusal` at the time measured, hospital-local
(`bedsideErrors` gained the lot state and the zone); the nurse form (`_lib/load.ts`, `usableLots`) offers only
selectable lots, FEFO first; the lab settings register and the result reader name the ledger lot. Phase 2's
"add a lot" writes the ledger with stock off (in use at once, basis "before MedSync", the lead's own entry) and is
refused with stock on (lots arrive by delivery and acceptance and are set in use from Stock). With all flags off
the bedside behaves as Phase 2 except the UTC-day defect (c) is fixed.

**Release snapshot (LU-3, Law 4).** `prepareFixedUnits` (`lib/lab/units.ts`), where Phase 1/2 write
`lab_result_snapshots`, now also writes `lots` when `labStock` is on: per component, the lots in use on the device
at the result time (bedside device, or the pinned analyser profile's `device_id`), with their numbers, or
`"not_recorded"`. A downtime result is read at the form's result time (`enterResults` takes `resultedAt`).

### Scenarios (`tests/emr-db/lab-stock.test.ts`, PGlite lane, 12 tests)

| #   | Result | What the test proves                                                                                                                                      |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | pass   | 10 lines, one with 2 crushed packs: 98 enter stock (8 on that line), the line keeps received 10 / accepted 8 / rejected 2                                 |
| S2  | pass   | New creatinine lot in acceptance; set in use refused; within on 5 samples but no QC refused; with an accepted run accepted, then in use                   |
| S3  | pass   | One sample outside: Accept refused; Reject records the reason, the lot is rejected, NC-YYYY-001 opens (`lot_rejected`)                                    |
| S4  | pass   | A bedside release snapshots `{strip, control}` lot ids and numbers; a new strip lot set in use later leaves it unchanged                                  |
| S5  | pass   | FEFO: the later lot needs a reason (recorded as `fefo_reason`); the earlier one issues without; panel marks it Use first                                  |
| S6  | pass   | Use-by 13 OCT: issue at 23:00 Kampala passes, at 01:30 (22:30 UTC, same date) refused; bench in-use refused; bedside expired and quarantined lots refused |
| S7  | pass   | 30 issued over 3 whole months: use 10, on hand 70, 7 months, to maximum 0; 1 month of history: Not enough history                                         |
| S8  | pass   | A count of 9 against 12 without a reason refused; with one, a `count` row of −3 and on hand 9; count no longer due                                        |
| S9  | pass   | Strips issued 40 against the released bedside tests this month at a fixture tolerance: listed as possible wastage; nothing blocked                        |
| S10 | pass   | Switch-on without a statement refused; with it, accepted / before MedSync / the statement, opening receipt on the ledger                                  |
| —   | pass   | Law 8: an item with no plan: line "no_plan", lot waits, Accept says "no signed acceptance plan"                                                           |
| —   | pass   | The move: with stock off "add a lot" writes the ledger and a bedside result points at it; with stock on it is refused                                     |

Baseline test (c) flipped from `it.fails` to `it` and passes. **S1 timing:** `receiveDelivery` with 10 lines took
**26 ms** server-side (PGlite, in process; budget p95 < 800 ms, asserted in the test). The human timed trial
(median ≤ 4 min) is Step 11's.

### Migration check

0112 replayed in the lane (all migrations, then 0112 twice in `lab-phase3-data`): `poct_lots` 3 = moved 3, 3 events,
3 lots-in-use rows; every report's lot resolves; the foreign key targets `lab_stock_lots`; **no**
`poct_lots_into_ledger` trigger exists after the run.

### Differences from the prompt (and why)

- **recordLotComparison** is not its own write: the comparison is evaluated live on the screen (the pure engine)
  and stored once, with the decision, on `lab_lot_acceptances.pairs` by Accept or Reject (append-only; no draft
  state to manage). Pairs carry `sample-n` references, not result ids: picking result ids needs a result search
  the slice does not have (LA-5's "never patient identity" holds either way).
- **setItemLevels** is part of `saveStockItemAction` (lead); **adjustStock** and **writeOff** are one
  `recordMovementAction` (kind adjustment, write_off or return).
- **Stock permission**: receiving, issuing, counting, quarantine, acceptance and lots in use accept
  `lab.stock.manage` **or** `lab.manage`: map 2.0.0 is unsigned, so no cadre holds `lab.stock.manage` yet.
- **Certificate** is a reference text (`certificate_path`), not an upload (no storage path in the lab yet).
- **QC on the new lot** is evidenced by accepted `lab_qc_runs` or passing `lab_control_checks` the user ticks; Step 6
  writes those rows.
- **A new shipment of an accepted lot** only informs ("controls") when the plan lists `new_shipment`; the lot is not
  sent back to acceptance (§5.1 has no such move).
- **Operational defaults**: look-back 3 months and a weekly count are D-LAB3-09's accepted operational values,
  used until the lead sets them; the expiry window and the ST-9 tolerance have none ("not set" shows).
- **Lots-in-use place** for a release is the device; bench-only (section) lots join when results carry a section.

### Checks

`tsc --noEmit` clean; `npm run lint` 0 errors (the 2 old warnings in `scripts/embed-bench.mjs`);
`vitest run tests/emr-db tests/lab tests/design tests/emr` on the PGlite lane: **133 files, 4383 passed, 2 expected
failures** (baseline (a) and (b)), 0 failed. Red scarcity: a Lab Phase 3 block asserts no red and no green on
`/lab/stock`, the shared date helper, the Phase 3 copy and the bedside form. Screenshots against artboards 5 and 6
are in the Step 11 harness pass.

**Next:** Step 5, equipment and temperature behind `labEquipment`.

## STOP 5: Equipment and temperature, behind `labEquipment` (13 Oct 2026)

No new migration (0113 as written at Step 2). **Code.** `lib/lab/equipment-store.ts` (register, schedule,
mark down, repair and other logs, back in service, temperature), `lib/lab/equipment-read.ts` (one read per page:
state, open breakdown, what doctors see now through Phase 2's `menuToday`, tasks due, latest temperature against its
range, readings not recorded today, lots stored there), `lib/lab/equipment-actions.ts` (the house contract; the hub
is called through `callEdge("ha-services-hub", …)` with the user's session). Screen `/lab/equipment` (artboard 7:
the machine list with status, maintenance, calibration and temperature; the panel in a centred `EditorDialog` with
the down block, "What doctors see now", specimens moved, the back-in-service checklist whose button opens only when
both are met; the maintenance checklist, the temperature form with the Quarantine suggestion; the register and the
schedule editors for the lead). Nav: "Equipment" under Quality, behind `labEquipment` and `lab.view`. The bedside
register on Lab settings now lists bedside kinds only (lab equipment shares `devices`).

**Through the hub's own action (Law 2).** Mark down: the tests whose only in-service machine this is
(`testsLosingService` over `devices.linked_tests`) are mapped to their hub offering (`lab_test_services`) and each is
reported with `report_problem` (subject `test`, state `unavailable`, reason `equipment_down`); the problem ids are
written on the breakdown (written once), the device goes `down`. If anything after the first hub call fails, the
reported problems are resolved again (no hub "down" without a lab breakdown). Back in service: `backInServiceErrors`
(a repair after the breakdown, an accepted or warning QC run after the repair for every linked component), then
`resolve_problem` for each problem, the breakdown closed once with the repair, the time, who and the downtime minutes.

### Scenarios (`tests/emr-db/lab-equipment.test.ts`, PGlite lane, 5 tests)

The hub is injected: the fake records each call and writes what `ha-services-hub` writes (`availability_events`),
queued until the lab's transaction ends, as the edge function commits on its own connection.

| #   | Result | What the test proves                                                                                                                                                                                                                                                                                                      |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S11 | pass   | Exactly one `report_problem` call with the FBC offering, `unavailable`, `equipment_down`; `menuToday` turns FBC from in house to `down_referred` ("Analyser down since …") in the same request; 1 received specimen counted to To refer; the panel's "What doctors see now" says the same                                 |
| S12 | pass   | Refused with no repair; with a repair, refused while one component has only a run before the repair and the other a rejected run; refused while one is still missing; with both after the repair: one `resolve_problem`, FBC back to in house, downtime ≥ 119 min, closed by the lead, device in service                  |
| S13 | pass   | A calibration done 40 days ago on a fixture 30-day schedule: overdue, `blocks: false`; the daily task done today: not overdue; the analyser stays in service                                                                                                                                                              |
| S14 | pass   | 5 °C in a fixture 2–8 °C range: logged, nothing opened; 11.5 °C: logged out of range, nonconformity `temperature` owned by the lead with the Appendix A sentence, a `notified` event to the lead, the stored lot listed as a suggestion and left `accepted`; a day with no reading lists the ended window as not recorded |
| —   | pass   | A hub refusal leaves nothing: no breakdown, the machine still in service                                                                                                                                                                                                                                                  |

### Differences from the prompt (and why)

- **recordRepair, recordMaintenance, recordCalibration** are one `recordEquipmentLogAction` (kind repair,
  maintenance, calibration, error or drop) on the one append-only log (GATE A P3).
- **Kit and stain QC after a repair** (EQ-3, "where linked"): `devices` has no linked kit items, so back in service
  checks the linked quantitative components only; the engine already takes kit checks when a link exists.
- **Registering equipment** records the lead as its verifier (0110's `devices_verified` needs a verification for a
  device in service): "Registered in service by the laboratory lead."
- **Who records**: the register, schedules, down and back need `lab.manage` (the hub's head check applies too);
  repairs, maintenance, calibration and temperature readings need `lab.result.release` or `lab.manage`.
- **Certificates and records attached** (EQ-5) are a reference text on the log (`file_path`), not an upload.
- **No temperature range set**: the reading is logged with "in range" unknown and nothing opens (the list says
  "Not monitored" until the lead sets the range).

### Checks

`tsc --noEmit` clean; `npm run lint` 0 errors (the 2 old warnings); `vitest run tests/emr-db tests/lab tests/design
tests/emr` on the PGlite lane: **134 files, 4388 passed, 2 expected failures** (baseline (a), (b)), 0 failed. Red
scarcity covers `/lab/equipment` and the shared pop-up (no red, no green). Screenshots against artboard 7 are in the
Step 11 harness pass.

**Next:** Step 6, quality control, the hold, the look-back and nonconformities.

## STOP 6: Quality control, the hold, the look-back and nonconformities, behind `labQc`, then `labQcHold` (13 Oct 2026)

No new migration (0114 as written at Step 2; nothing in it needed changing). **Code.** `lib/lab/qc-store.ts`
(`qcRowsFor`, `recordQcRun`, `setLabTarget`, `recordKitQc`, the look-back fill and `joinLookBackOnOverride`,
`decideLookbackItem`, `openNonconformity`, `ncAction`, `authoriseResumption`, `closeNonconformity`),
`lib/lab/qc-read.ts` (`loadQcPlans`, `loadQcSeries`, `holdFor`, `otherAnalysersFor`, `heldReports`, `loadKits`,
`loadNcs`, `loadNc`), `lib/lab/qc-actions.ts` (the house contract; signing and closing with a fresh second factor).
Signed kinds `qc_plan`, `qc_policy` (lead + CSO, countersigned in the existing sign-off console) and `kit_qc_rule`
(lead alone) in `PAYLOADS` and `KIND_WORDS`. `nc-store.ts` gained `nextNcNumber` and the subject concept.

**The hold (QH-1..QH-6, E-LAB3-08).** `writeReportVersion` (`lib/emr/write/results.ts`) calls `qcGate` for every
`final` lab version made on an analyser (the pinned profile's `device_id`), so `releaseResults`, `enterResults`
final, `releaseWithCriticalMark` and downtime are all covered. One query (`qcRowsFor`: plan in force joined to the
cached `lab_qc_status` row and its run) reads every component; `qcStatusFor` and `qcReleasePlan` decide. Held
components are written `preliminary` inside the `final` report and listed in `qc_held`; `releaseResults` on such a
report writes a completion version (`final` after `final`, held components only, no correction alert); an amendment
refuses a held value. The override (`qcOverride: { reason }` on the release action) needs `lab.qc.override`, marks
the observation `qcOverride`, snapshots `{status, runId, override: {by, reason}}`, joins the open QC
nonconformity's look-back and records a `note` event (audited by trigger). Every gated component's status is
snapshotted on `lab_result_snapshots.qc` (QH-6). The doctor's review shows "{Analyte} to follow: held for quality
control." for a held value and "Released while QC had failed. …" for an override. Bedside results are not gated
here (device checks are Step 8).

**Screens.** `/lab/quality` (artboard 1), `/lab/quality/qc` with Analysers and Kits and stains tabs (artboards 2
and 4), `/lab/quality/qc/run` (artboard 2: the Levey-Jennings chart, this run, the plan card), `/lab/quality/
nonconformities` and `/[id]` (artboards 3 and 9: actions, the look-back panel, resumption, closure), and the result
entry page (artboard 3: the QC word per component, the amber hold block with `role="alert"`, "QC not run today",
"Run on another analyser" for Immediate orders, the override card for holders only, the completion release). Nav:
Quality today, Quality control, Nonconformities behind `labQc` and `lab.view`. Red scarcity covers
`app/lab/quality` and the hold actions (no red, no green).

### Scenarios (`tests/emr-db/lab-qc.test.ts`, PGlite lane, 13 tests)

| #        | Result | What the test proves                                                                                                                                                                                                                                                |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S15      | pass   | A two-level run with L1 +2.3, L2 +0.4: decision warning, breaks `[1-2s warning]`, status warning, not held; timed                                                                                                                                                   |
| S16      | pass   | The next L1 +2.1: 2-2s across runs; refused when the screen expected "warning" and without a first step; recorded rejected, status failed and held, NC `qc_reject` halted, owned by the lead                                                                        |
| S17      | pass   | +2.1 then −2.2 on L1 across runs: no R-4s (two warnings); +2.1 / −2.2 within one run: R-4s, within_run, rejected                                                                                                                                                    |
| S18      | pass   | Release of a U&E: potassium preliminary in the final report, `qc_held = [obs.potassium]`, sodium and creatinine final; the doctor sees "Potassium to follow: held for quality control."; completion and amendment refused while held; `enterResults` final held too |
| S19      | pass   | An Immediate order offers analyser 2 (passed today); a routine order offers none                                                                                                                                                                                    |
| S20      | pass   | A technologist's override refused (`forbidden`); no reason refused; the lead's completion version releases potassium with the signed line, snapshot `override`, look-back item and `note` event, audit rows                                                         |
| S21      | pass   | Bias estimate 0.22 (mean z 2.2 × fixture SD 0.1), labelled estimate; 5.1 `flag_might_change` listed before 4.2 `unchanged`; Amend refused before the Phase 1 amendment, then linked to it; decided once                                                             |
| S22, S23 | pass   | Close refused while halted; resumption refused with no passing run, then with the look-back undecided; a passing run keeps the hold until the lead resumes; close refused without a cause or effectiveness; closed by the lead; frozen                              |
| S24      | pass   | Maker's targets: status provisional_target; no policy refused; 19 runs over 19 days refused; at 20 over 20 a new plan version 2 (draft, level 1 `lab`, 20 runs; level 2 unchanged); version 1 stays in force                                                        |
| S25      | pass   | A Determine lot in acceptance is due "new lot" and blocks; both controls as expected accept it; a failed control quarantines the other lot and opens `kit_qc_fail` (not halting); `hmis_iqc` recorded                                                               |
| S26      | pass   | Giemsa due each day of use; a partial checklist fails; the full signed checklist passes (subject `stain`, the ticked criteria stored); then not due                                                                                                                 |
| S27      | pass   | Syphilis RDT `new_operator`: due for a second technologist (blocks, required before use) and not for the first; their own pass clears it                                                                                                                            |
| S28      | pass   | `labQc` on, `labQcHold` off: a rejected creatinine run opens the NC, release is not held, the snapshot records `failed` with the run id, the hold view says not blocked                                                                                             |

Baseline (a) flipped from `it.fails` to `it` and passes; (b) stays for Step 8.

**Timings (PGlite, in process).** `recordQcRun` with rule evaluation, history and the status write: **6 ms**
(budget p95 < 300 ms, asserted). `qcStatusFor` at release: **one query for all three components, 1.6 ms**; the
engine over the cached rows **0.056 ms** (budget < 2 ms, asserted). The human timed trial is Step 11's.

**Rule test table:** STOP 3's table stands (QR-1..QR-4 in `tests/lab/phase-3/qc-rules.test.ts`, 28 tests; QH-_,
QQ-_, LB-_, NC-_, KQ-\* as listed there); S15–S28 add the database proofs above. Screenshots against artboards 1–4
and 9 are in the Step 11 harness pass.

### Differences from the prompt (and why)

- **`decideQcRun` is part of `recordQcRun`** (GATE A P5): the screen previews the decision with the pure engine; the
  server evaluates again and refuses a different answer (`expect`), so the person confirms what the chart decided.
- **`signQcPlan` / `signKitQcRule`** are one `signQcConfigAction` (lead, fresh factor); the CSO countersigns QC
  plans and the policy in the existing sign-off console (`loadConfigsWaitingForCso`).
- **`overrideQcHold`** is the release action itself (`qcOverride` on `releaseResults`), checked in the one release
  path, so no second write path can skip the hold.
- **QH-5 "Run on another analyser"** names the analysers that passed today in the hold block; moving the specimen
  to that analyser's profile is not built (no re-pinning action exists).
- **LB-3 "Repeat when QC passes"** is recorded as the decision; no worklist task is created (no task store on the
  lab worklist). **Amend** is the Phase 1 path (the result page's Amend, whose action sends CA-10 correction
  alerts); the look-back records it once the amended version exists.
- **Look-back window time** for a downtime result is its entry time, not the paper form's result time
  (`ponytail:` comment); critical limits for `critical_nearby` are every signed age band for the component.
- **`per_n_samples`** counts as in window (samples since the run are not counted yet), as STOP 3's engine note.
- **Closing a halted nonconformity** first needs resumption (§5.4's state diagram: halted → open → closed).
- **The QC column** is a word with its icon under each analyte's name (the entry grid keeps its five columns).

### Names Step 7+ must know

`qcRowsFor`, `recordQcRun`, `openQcNc`, `joinLookBackOnOverride`, `passingRunAfterReject` (qc-store);
`holdFor`, `blocks`, `loadKits`, `loadNc` (qc-read); `qcGate` and `VersionSpec.qcOverride` (results.ts);
`FixedUnits.snapshot(rows, reportId, qc?)`; `ReviewValue.labNote` carries the to-follow and override lines;
`ResultEntryData.report.qcHeld`; `EntryComponent.qc`; `app/lab/quality/_lib/{copy,status,scope}.ts`,
`_components/{qc-chip,qc-forms,nc-forms,lj-chart}.tsx`. EQA's unacceptable result (EA-4) opens through
`openAutomaticNc` and can fill `lab_lookback_items` like `fillLookBack` (no bias unless the provider gives one).

### Checks

`tsc --noEmit` clean; `npm run lint` 0 errors (the 2 old warnings in `scripts/embed-bench.mjs`); the full suite on the
PGlite lane (`vitest run`): **461 files passed, 23 skipped; 10,339 passed, 5 expected failures, 248 skipped**, 0
failed. With all Phase 3 flags off the gate is never entered (`labQcLiveFor` false) and Phase 2's tests are green.

**Next:** Step 7, external quality assessment behind `labEqa`.

## STOP 7: External quality assessment, behind `labEqa` (13 Oct 2026)

**Migration edit (unapplied, unshipped).** 0115 gains `lab_eqa_rounds.scored_on date` (the provider's report date;
the EA-4 look-back runs receipt → scoring) with `scored_on >= received_on`; Drizzle `labEqaRounds.scoredOn` beside
it (parity green). Nothing else changed in the data layer.

**Code.** `lib/lab/eqa-store.ts` (`saveScheme`, `recordRound`, `recordEqaResults`, `recordEqaScores`,
`recordAltAssessment`, `eqaSettings`, `releasesBy`, `eqaRoundsFor`, `toRound`), `lib/lab/eqa-read.ts` (`loadEqa`,
`inHouseTests`), `lib/lab/eqa-actions.ts` (the house contract). Screen `/lab/quality/eqa` (artboard 8): the coverage
chip ("{n} of {m} tests have no EQA", Appendix A `noEqa`) opening the list; the schemes table (Scheme (provider) ·
Covers · Rounds · Next · Last round); rounds with the round panel in a centred `EditorDialog` (Sample · Analyte ·
Ours · Target · Score as given, "n of m acceptable", tested by with Appendix A `eqaTester` and the EA-2 warning, the
nonconformity link, the report reference); our results, the provider's scores, alternative assessments and the
operational settings as `EditorDialog` forms. Nav: "External quality" under Quality, behind `labEqa` and
`lab.view`. Nonconformities (list, page, look-back decisions, actions, resumption, closure) open with `labQc` **or**
`labEqa` (`ncLiveFor`), since an EQA nonconformity must be workable with QC off.

**Rules on the server.** Scores are entered once, only after our results and the submitted date, exactly as the
provider reports them (`score`, `scoreKind`, `scoreValue`, `limit`, `target`; MedSync never re-scores, EA-3).
Unacceptable → `openAutomaticNc` (source `eqa_unacceptable`, owner the lead, not halting) and look-back items for each
unacceptable analyte: every in-house released numeric result of that component (any analyser, first release of each
value) from the start of the receipt day to the end of the scoring day, hospital-local (`eqaLookBack`); sorted by
the provider's bias only when its report gives one, otherwise all "unchanged" (no estimate). The tester check
(EA-2) reads patient releases (`diagnostic_reports`, in-house, final/amended/corrected, `recorded_by_user_id`) of
the scheme's tests in the window before receipt, and only warns.

### Scenarios (`tests/emr-db/lab-eqa.test.ts`, PGlite lane, 4 tests)

| #   | Result | What the test proves                                                                                                                                                                                                                                                                                                                        |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S29 | pass   | Scores before results refused; tested by the tech (a U&E released 20 days before receipt) and tech2 (none): only tech2 warned, saved anyway; scored from the report (SDI / % with the provider's limits, stored as given), `scored_on`, report reference; a second scoring refused; the page shows the same warning and "2 of 2 acceptable" |
| S30 | pass   | Potassium unacceptable, sodium acceptable: outcome `mixed`, NC `eqa_unacceptable` owned by the lead, opened by MedSync, not halted; look-back = the potassium released 20 days ago (inside receipt 25 days ago → scoring today), not the one 40 days ago, never sodium; sort `unchanged` (no bias given); `nc_id` on the round              |
| S31 | pass   | In-house U&E, FBC, ESR, HIV rapid: U&E covered by a scheme, hospital B's FBC scheme ignored; an ESR split-sample assessment does not count while the period is unset (shown on the page), counts once the lead sets it; an FBC assessment older than the period does not                                                                    |
| S32 | pass   | An HIV panel (two samples on fixture kit A, one on kit B) submitted this month: `count105` over `eqaRoundsFor` gives kit A EQA 2, kit B EQA 1, Total 0 and the purpose column 0; no `diagnostic_reports` row was written (hazard 23)                                                                                                        |

### Differences from the prompt (and why)

- **`enrol`** is part of `saveScheme`: `covers` is the enrolment (GATE A P8).
- **The provider's report** is a **reference text** (`report_path`: a scan's file name, folder or the provider's
  reference), as certificates (Step 4) and equipment records (Step 5) were: the lab has no storage bucket and adding
  one needs a storage migration and policies.
- **EA-2 window**: the prompt's 30 days is used, labelled operational, until the lead sets `eqaTesterWindowDays`.
  **EA-5 period** has no default: until the lead sets `altPeriodDays` no alternative assessment covers a test, and the
  page says so (Law 8).
- **Who records**: schemes, scores, alternative assessments and the settings need `lab.eqa.manage` (with
  `lab.manage`); receiving a panel and our results also take `lab.result.release`.
- **Look-back window** is calendar days (receipt day start → scoring day end), hospital-local; a downtime result is
  placed by its entry time (as Step 6).

### For Step 9 (HMIS 10.3)

HIV EQA panel tests live in `lab_eqa_rounds.samples[]` with `kit` (the signed algorithm's kit name, the same names
`hmis_mapping.kits` maps to 10.3 rows); the round's month is `submitted_on`; read them with `eqaRoundsFor(tx,
hospitalId)` and pass to `count105({ eqaRounds })`. The purpose is implicit (an EQA round is the EQA column). IQC
events are `lab_control_checks` rows with `hmis_iqc = true` and the kit's `item_id` (`kitItems`). Patient HIV tests
are released `diagnostic_reports` with the algorithm version on the outcome's context and `encounter_orders.test_purpose`.

### Checks

`tsc --noEmit` clean; `npm run lint` 0 errors (the 2 old warnings in `scripts/embed-bench.mjs`); the full suite on
the PGlite lane (`vitest run`): **462 files passed, 23 skipped; 10,343 passed, 5 expected failures, 248 skipped**, 0
failed. Red scarcity already covers `app/lab/quality` (the EQA page and its forms: no red, no green). Screenshots
against artboard 8 are in the Step 11 harness pass.

**Next:** Step 8, bedside quality behind `labPoctQuality`.

## STOP 8: Bedside quality, behind `labPoctQuality` (13 Oct 2026)

No migration change (0116's `lab_competencies`, 0114's `lab_control_checks` with subject `device`, 0113's device
state `blocked`, 0112's `lab_stock_lots.insert_ranges`, all as written). **Code.** `lib/lab/bedside-quality-store.ts`
(`deviceStatus`, `bedsideGate`, `recordDeviceCheck`, `recordDeviceError`, `setStripLotRanges`, `recordCompetency`,
`grandfatherOperators`, `loadDeviceChecks`, `loadBedsideQuality`), `lib/lab/bedside-quality-actions.ts` (the house
contract). Signed kinds `device_qc_rule` (key = test code: triggers, levels, required before use, source) and
`competency_validity` (key = test code: methods, valid days, grace days, source) in `PAYLOADS` and `KIND_WORDS`,
lead-only (E-LAB3-12), signed with `signConfig` behind `secondFactorFresh()`. The engine `bedsideQuality` now refuses
the event triggers (below); `bedsideErrors` gained `device_blocked`.

**Where it runs.** `recordBedsideResult` calls `bedsideGate` at the time measured (labPoctQuality on, or whenever the
device is `blocked`): a blocked device is refused with Appendix A `deviceBlocked`; a competency that is not valid or
in grace with `competencyLapsed` (or the new `competencyNone`); a check the rule or an event requires with the new
`deviceCheckRequired`. Each observation's context records `bedsideQuality: {deviceCheck, competency, checkId}`
(BQ-5), and the doctor's review adds "Control check not done today." (Appendix A `deviceCheckNotDone`) when the
day's check was not done. The bedside form never offers a blocked device (it lists it with the `deviceBlocked`
line), shows `deviceCheckNotDone` on a device whose daily check is due and the new `stripLotNeedsCheck` on an
unchecked strip lot. `recordDeviceCheck` (operator: a live grant and a valid or grace competency for the device's
test) scores the readings against the **strip lot's** `insert_ranges` (a level with no range refuses: "the
laboratory has not entered the accepted ranges"), writes the `lab_control_checks` row (each control with its
expected range, reading, pass and the control vial in use), and sets the device `blocked` on a fail and back to
`in_use` on a pass.

**Screens.** Nurse workspace: "Bedside tests" → `/nurse/bedside/devices` (artboard 10): per device the status, the
`deviceBlocked` line (`role="alert"`), the control rows (Control · Reading · Accepted range for this strip lot,
read-only · Result), strip lot and control vial, **Save check**, "Record a drop or error message", the canvas's two
sentences, and "Who may record {test} here" with her own assessment (lapsed amber with `competencyLapsed`). Lab:
"Bedside quality" under Quality → `/lab/quality/bedside`: per test the device rule and the competency validity
(draft, sign), **Switch on** for existing operators, strip lots with their ranges ("Ranges not entered" amber,
**Enter ranges**), and every operator × test with assessed, valid to (lapsed amber) and **Record an assessment**.
All forms are centred `EditorDialog`s; red scarcity now also covers `app/nurse/bedside` and the bedside screen.

### Scenarios (`tests/emr-db/lab-bedside-quality.test.ts`, PGlite lane, 7 tests)

| #               | Result | What the test proves                                                                                                                                                                                                                                                  |
| --------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S36 (switch-on) | pass   | No assessment: result and check refused ("You have no assessment for …"); switch-on adds one grandfathered row (no assessor, valid to today + the fixture grace period); a second switch-on adds none                                                                 |
| S35             | pass   | A strip lot never checked on this meter: the result is refused in inform mode ("A control check is needed before the next patient result …")                                                                                                                          |
| S33             | pass   | A check within the strip lot's ranges passes (the row stores the lot's ranges, the readings and the lot); the result saves; a fail sets the meter `blocked`; the result is refused with "Fixture meter FX-1 failed its control check at HH:MM. …"; a pass unblocks it |
| S35 (continued) | pass   | The second strip lot: result refused; its check refused until the lab enters its ranges; ranges set once (a second entry refused); check passes; result saves; a recorded drop requires a check again                                                                 |
| S37             | pass   | The result's context: `{deviceCheck: "passed", competency: "grace", checkId}`                                                                                                                                                                                         |
| S34             | pass   | Meter 2 checked yesterday: due `each_day_of_use` only; the result saves with `deviceCheck: "not_done"`; the doctor's review says "Control check not done today."; with the rule signed "required before use" the next result is refused until today's check           |
| S36 (lapsed)    | pass   | A nurse assessed longer ago than the fixture validity: result and check refused ("Your assessment for … lapsed on DD MMM YYYY. Ask the laboratory for reassessment."); reassessed today: the result saves with `competency: "valid"`                                  |

Baseline (b) flipped from `it.fails` to `it` and passes: a failed check gives `deviceState: "blocked"` and
`bedsideErrors` refuses a blocked device. No `it.fails` remains in the Phase 3 baseline. Engine test added: the event
triggers refuse in inform mode (`eqa-bedside.test.ts`).

### Differences from the prompt (and why)

- **The event triggers block** (S35 "requires a check before the next patient result"): a new strip lot, a new
  control vial, and a drop or error message need a passing check before the next result even in inform mode; only
  the daily trigger informs (D-LAB3-15) unless the rule says "required before use".
- **Refusal order**: a stopped device, then who may record, then the check.
- **The snapshot** is in each observation's `context` (`bedsideQuality`), written once with the observation, not on
  `lab_result_snapshots` (a bedside result has no snapshot row when units and ranges are off). `checkId` names the
  last passing check.
- **The control vial** is the newest `control` lot in use on the device (`lab_lots_in_use`), recorded on each
  control of the check (`controlLotId`); no new column.
- **Strip-lot ranges** take `lab.stock.manage` or `lab.manage`, and are entered once (checks were scored against
  them). **Assessments** take `poct.assess` or `lab.manage` (permission map 2.0.0 is unsigned, as Step 4 did for
  stock). Revocation is not built (no action in §8).
- **Book reassessment** has no booking store: the nurse's lapsed line says to ask the laboratory, and the lab page
  lists lapsed operators (amber) with **Record an assessment**. The nurse page shows her own assessment only (RLS:
  an operator reads her own row).
- **New copy** (draft, with the rest): `deviceCheckRequired`, `competencyNone`, `stripLotNeedsCheck` and the nurse
  labels `LAB3_BEDSIDE` in `content/lab-phase-3.ts`.

### Checks

`tsc --noEmit` clean; `npm run lint` 0 errors (the 2 old warnings); the full suite on the PGlite lane (`vitest
run`): **463 files passed, 23 skipped; 10,352 passed, 4 expected failures, 248 skipped**, 0 failed (the expected
failures are outside Lab Phase 3; the Phase 3 baseline has none left). Screenshots against artboard 10 are in the
Step 11 harness pass.

**Next:** Step 9, registers and HMIS 105 behind `labHmis`.

## STOP 9: Daily registers and HMIS 105, behind `labHmis` (13 Oct 2026)

No migration change (0117's `hmis_designations`, `lab_register_prints`, `lab_hmis_reports` with its freeze trigger
and `private.lab_hmis_aggregates()`, `encounter_orders.test_purpose` and the specimen types, all as written).
**Code.** `lib/lab/hmis-store.ts` (`inHouseMenu`, `mappingVersions`, `mappingForCount`, `monthSources` — one read
of the month's source rows — `countMonth`, `generateHmis`, `prepareRevision`, `manualKeys`, `saveManualCells`,
`checkHmis`, `signHmis`, `exportHmis`, `changedSinceSigning`, `saveMapping`, `mappingBlocks`, `signMapping`,
`setDesignation`, `endDesignation`, `loadHmisMonth`, `recordsFor`), `lib/lab/register-store.ts`
(`REGISTER_DEFAULTS`, `registerConfigFor`, `loadRegisterDay`, `withIdentities`, `classAccessFor`, `recordPrint`),
`lib/lab/hmis-form.ts` (`hmisForm()`: the form file and its SHA-256), `lib/lab/hmis-scope.ts` (`hmisDeskScope`),
`lib/lab/hmis-actions.ts` (the house contract), `lib/lab/hiv-purpose.ts`. Signed kinds `hmis_mapping` (key = the
form version; the payload carries `formHash`, `orgUnitCode`, `rows`, `visits`, `specimenColumns`, `rejection`,
`reasons` with `none`, `hivTests`, `kits`, `kitItems`, `purposes`, `tracers`, `excluded`, `visitsDefinition`) and
`register_config` (lead-only) in `PAYLOADS`, `KIND_WORDS` and the sign-off readers. `signConfig` gained the
`focal` slot: the HMIS mapping's second signature is the HMIS focal person's (designation checked), never the
CSO's; the CSO console no longer lists `hmis_mapping`.

**The order (D-LAB3-21, P17).** The order sheet asks "Purpose of this HIV test" on HIV rapid-test lines when
`labHmis` is on; `placeOrders` refuses a clinician's own HIV rapid order without it and a purpose on any other
test, and writes `encounter_orders.test_purpose` (the order is already restricted). The availability snapshot now
carries the hub's `reason` (P17), so 10.5 counts by reason; orders from before count under the mapping's `none`.

**Screens.** `/lab/register` (artboard 12; Reports group): section, day, register (general, and HIV and the other
classes only for staff holding `lab.result.release`), A4 landscape print CSS, black on white, 12 px, 1 px rules,
two identifiers (patient and hospital number), "Rejected: {reason}", "entered {date}" and "Amended", the
footer lines; **Print** writes `lab_register_prints` first, then opens the print dialog; the lead's **Register
columns** dialog (tick, rename, reorder, save, sign alone with a fresh factor). `/lab/hmis` (artboard 11): month,
status chip, the amber "Changed since signing" block with every changed cell (old → new, records added and
removed) and **Prepare revision**, the eight section tabs, the table (grouped rows; a dash only where the verified
form has no positive column, "positive column not verified" meanwhile; "incl. n bedside" in the sky tint; every
number a link with an accessible name to `/lab/hmis/records`, which lists the records with two identifiers and hides
restricted ones from staff without `lab.result.release`), How the numbers are counted, Still entered by hand (the
hand-count dialog), Send (due date, Count the month, Check, Print form, Download CSV), Not mapped (Law 8), earlier
revisions (readable). `/lab/hmis/mapping`: the mapping editor (every 10.2 row in a centred dialog: sources by test
or component, "only when", positive answers per column; 10.1/10.7 columns, visits, rejections, 10.5 reasons, 10.3
tests, kits, kit items and purposes, tracer items, org unit code, "not reported") with what stops the signature
in words. `/lab/hmis/print`: the form, A4 landscape. `/hmis` (new, AAL2, in `proxy.ts`): the HMIS desk for the
In-Charge (sign the checked month, fresh factor), the focal person (co-sign the mapping) and the hospital admin
(designate and end designations); reports read through `private.lab_hmis_aggregates()` only, numbers without
records (Law 10). HM-13: the due reminder on Quality today (and on the desk) from the 1st to the 7th.

**HM-11.** "Changed since signing" is computed on every view of the month. The repository has a cron pattern
(`app/api/cron/*`, `vercel.json`), so a nightly job was added too: `/api/cron/hmis-changes` (01:00, CRON_SECRET)
recounts every signed month and logs the number of changed cells per hospital (aggregates only).

### Scenarios (`tests/emr-db/lab-hmis.test.ts`, PGlite lane, 9 tests)

| #         | Result | What the test proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-LAB3-21 | pass   | An HIV rapid order without a purpose is refused with `labHmis` on; with `hct` it is written, the order restricted                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| S40       | pass   | Lead signature refused on the committed form ("not yet verified against eHMIS", OA-1); on a verified copy refused while `test.urinalysis_dipstick` is on the menu and in no row; put explicitly into CX07 (Others) the lead signs; the focal person is refused until designated, then co-signs (`cso_signed_by` = focal), version in force                                                                                                                                                                                                                                                      |
| S41       | pass   | September counted from database rows: (a) FBC at 30 SEP 23:30 Kampala in, 1 OCT 00:30 out; (b) U&E per analyte (RP03, RP04); (g) the October correction counts once; (d) a clotted FBC only in RS14 × Blood; (f) the outside HbA1c not counted (CX07 = 0 on the menu); (i) ESR 0, INR blank; (h) PS02 2 with "incl. 1 bedside", positive 1; (e) 10.5 Equipment break down 1, Others 1 (no reason recorded); (c) the HIV kit IQC check and the HIV EQA sample in 10.3 (Determine IQC 1, EQA 1, HCT 1, Total 1), the potassium EQA sample nowhere; 10.1 visits; Section 6 consumed 10, on hand 90 |
| S42       | pass   | A computed cell refused as a hand cell, a 10.4 cell saved; signing before the check refused; the lead as signer refused (not In-Charge); a stale second factor refused (`reauth`); the In-Charge signs; an UPDATE of the signed cells is refused by the trigger ("frozen"); counting again refused ("Prepare a revision")                                                                                                                                                                                                                                                                       |
| S43       | pass   | Two malaria RDTs on downtime forms dated 29 SEP, entered 9 OCT: Changed since signing names PS02 Number Done 2 → 4 (both records added) and Number Positive 1 → 2, cause downtime; revision 2 prepared (hand cell carried), checked, signed; revision 1 still reads 2; no change left after revision 2                                                                                                                                                                                                                                                                                          |
| S44       | pass   | CSV of revision 2: with the committed form every valued cell is a `# null,null,value,period,null,cell` comment (ids never invented), zeros present (HE04 0), blanks absent (HE06), the data part the header alone; with a FIXTURE form carrying ids every non-blank cell is a row in form order, zeros included; the export is recorded once (`exported`)                                                                                                                                                                                                                                       |
| S38       | pass   | The general register for the HIV test's day is empty (restricted classes never print there) in the default columns; the HIV register is refused for a viewer without `lab.result.release` and shows purpose and "{kit}: non reactive" for one with it; a rejected FBC prints "Rejected: clotted"; an HIV print by a viewer refused; a general print writes `lab_register_prints` (40 rows → 3 pages, defaults: no config id)                                                                                                                                                                    |
| S39       | pass   | The two back-entered RDTs sit on the 29 SEP register, each marked "entered 2026-10-09" (shown "entered 09 OCT 2026")                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| S45       | owner  | The one-month parallel run with the paper tally: template in `docs/lab/phase-3/parallel-run.md` (OA-10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Timing.** `generateHmis` (the one read of the month's sources plus `count105`) for the fixture month:
**12.8 ms** server-side (PGlite, in process; budget p95 < 5 s, asserted in S41).

### The CSV with null ids (S44, revision 2 of the fixture month)

```
# HMIS 105 laboratory, 2026-09, revision 2, signed.
# Organisation unit code: null (not set in the signed mapping).
# eHMIS data-element ids: null for 20 cells (not yet supplied, owner action OA-2). These cells are not rows of this file; nothing is invented:
# null,null,5,202609,null,LV01|Blood
# null,null,5,202609,null,SC01|Blood
# null,null,1,202609,null,HE02|Number Done
# null,null,0,202609,null,HE04|Number Done
# null,null,4,202609,null,PS02|Number Done
# null,null,2,202609,null,PS02|Number Positive
# null,null,1,202609,null,RP03|Number Done
# null,null,1,202609,null,RP04|Number Done
# null,null,0,202609,null,CX07|Number Done
# null,null,1,202609,null,Determine|HCT
# null,null,1,202609,null,Determine|IQC
# null,null,1,202609,null,Determine|EQA
# null,null,1,202609,null,Determine|Total
# null,null,0,202609,null,Determine|Inconclusive Results
# null,null,3,202609,null,VS02|Average Turn Around Time (Days)
# null,null,1,202609,null,RS14|Blood
# null,null,10,202609,null,SS07|Quantity consumed
# null,null,0,202609,null,SS07|Days out of stock
# null,null,90,202609,null,SS07|Stock on hand
# null,null,0,202609,null,SS07|Quantity expired
dataElement,categoryOption,value,period,orgUnit
```

### Differences from the prompt (and why)

- **The mapping payload** carries the extra keys the engine needs (STOP 3) and `formHash`, the SHA-256 of
  `data/lab/hmis105-2019-09.json`, read at request time (`outputFileTracingIncludes` names the file for `/lab/**`,
  `/hmis` and the cron route); a mapping made for another file is refused at save and blocked at signing. The
  counting rules are not copied into the payload: they are the copy (`LAB3.hmisCountingRules`, CSO-signed with the
  rest) and the engine; the mapping pins the form hash they apply to.
- **Signing the mapping** needs the form verified (OA-1). Until the owner verifies the rows nothing can be signed;
  S40 signs on a verified copy of the same file to prove the rest of the rule.
- **A month counted with an unsigned mapping** can be counted, given hand cells and checked (so the lab can work
  before OA-1), but not signed: the report must be counted again once the mapping is signed (`lhr_mapping`).
- **Counting again** (Count the month) is allowed on a draft or a checked report (a checked one returns to draft);
  a signed month only gets a revision.
- **Hand cells** are every cell of 10.4 and 10.6, 10.3's repeat testers and DNA-confirmed, and 10.5's confirmatory
  and QA re-testing columns, as the form file has them. The file has no 10.6 rows (the antibiotic list was not
  transcribed, OA-1) and 10.5's rows are free text, so 10.6 has nothing to enter yet and 10.5 shows the tests
  counted there; neither appears in the CSV until the verified form gives them rows and ids.
- **The CSV** keeps the engine's five columns; cells without eHMIS ids are listed as comment lines with `null` ids
  and the cell name, so nothing is invented and the file says why it is not importable.
- **D-LAB1-12 for the report**: the person who checked does not also sign when another In-Charge is designated.
- **"Users with HIV access"** = holders of `lab.result.release` (GATE A §4), for the HIV register and every class.
- **Register lines**: one per specimen and test; a later amendment is its own line on its day, marked Amended; a
  pending specimen prints with "—" released. Rows per A4 page for the print event is a fixed estimate (18).
- **The register's `sections[]`** in GATE A's `register_config` was not built: the register is per section already.
- **Designations** are set on the HMIS desk by the hospital admin (no admin-console page was added).
- **10.1 SC02** stays 0 (no referral-in until Phase 4); every specimen is "collected here".

### Names Step 10 must know

`loadHmisMonth`, `recordsFor`, `monthSources`, `countMonth`, `inHouseMenu`, `changedSinceSigning`, `StoredCell`,
`joinCells` (hmis-store); `hmisForm` (hmis-form); `hmisDeskScope` (hmis-scope); `HmisTable`
(`components/lab/hmis-table.tsx`, `drill` null for aggregates); `classAccessFor`, `loadRegisterDay` (register-store);
`app/lab/hmis/_lib/month.ts` (`dueMonth`, `monthOptions`, `monthWords`, `dueWords`); the nav's **Reports** group
(`group: "reports"`, ids `register`, `hmis`; Lab reports joins it); `LAB3_HMIS`, `LAB3_REGISTER`, `LAB3_HMIS_DESK`,
`LAB3_HIV_PURPOSE` in `content/lab-phase-3.ts`; the drill-down pattern for lab roles (`/lab/hmis/records`).

### Checks

`tsc --noEmit` clean; `npm run lint` 0 errors (the 2 old warnings); the full suite on the PGlite lane (`vitest
run`): **464 files passed, 23 skipped; 10,362 passed, 4 expected failures, 248 skipped**, 0 failed (the expected failures are outside Lab Phase 3). Red scarcity now covers `app/lab/hmis`, `app/lab/register`, `app/hmis` and
`components/lab/hmis-table.tsx`. Screenshots against artboards 11 and 12 are in the Step 11 harness pass.

**Next:** Step 10, lab reports and quality indicators behind `labReports`.

## STOP 10: Lab reports and quality indicators, behind `labReports` (13 Oct 2026)

**Migration (new, unapplied).** `0118_lab_indicators.sql`: one SQL definition of what each indicator counts,
`private.lab_indicator_source(hospital, from, to)` (never granted), read two ways through SECURITY DEFINER functions
granted to `medsync_clinical_reader`: `private.lab_indicator_rows(from, to)` returns the source rows with record and
patient ids to **lab readers only** (`private.lab_reader()`), and `private.lab_indicator_counts(from, to, now,
targets)` returns **numbers only** (no id, no patient, no event time) to the lab, the In-Charge, the HMIS focal person
and the hospital admin (Law 10, QI-4). No table, so Drizzle parity is unchanged. Computed at read time for any month
or range, closed months included (QI-3; no cache, P13).

**Definitions (the rows).** Released = the first `final` version of each in-house lab report whose release time is
in the period; a downtime result keeps the paper's times (released when resulted on paper, turnaround from the
paper's collection, DT-7); corrected = a later `amended`/`corrected` version exists. Specimens = received or rejected
in the period (as 10.7). Wrong label caught = a Phase 2 label check whose outcome is not `match`. Criticals = Phase 1
alerts sent in the period with a signed time; in time = acknowledged at or before `due_at`; median minutes to
acknowledge. QC runs by `run_at`. Equipment = the 0113 lab kinds; downtime hours clipped to the period and to now.
Ward or clinic = the encounter's department; section = the hub offering's section (D5, D6); priority = the order's.
The lab's stated turnaround = the hub's `stated_tat` when it is one figure (`parseStatedTat`), else none (no default).

**Code.** `lib/lab/report-store.ts` (`reportRows`, `statedTargets`, `departmentNames`, `filtered`, `DRILL`,
`drillRows`, `reportFromRows` over the engine `computeIndicators`, `reportFromCounts` from the counts function,
`reportCsv`, `monthPeriod`, `dayPeriod`); the engine now exports `pct`, `count`, `NO_DATA`. Screens:
`/lab/reports` (artboard 13: month or From/To range, ward or clinic, section, priority, the eight tiles with their
basis, "incl. n bedside" in the sky tint, turnaround p90 per section as SVG bars from tokens with the stated
turnaround as a black mark, "Scale 0 to {n} h|min" and units, rejections by reason with the ward most affected,
Download CSV, "As of {date time}"), `/lab/reports/records` (every number's records: two identifiers through the
audited reveal, restricted rows only for `lab.result.release`, a Counted column), and a **Laboratory** section on
`/hospital-admin/reports` (the same tiles over the admin's window, no links). Nav: "Lab reports" in the Reports group,
behind `labReports` and `lab.view`. Copy `LAB3_REPORTS` (draft, with the rest). Shared view
`components/lab/lab-report-view.tsx`; no client JavaScript added (server components, a `data:` CSV link).

### Scenarios (`tests/emr-db/lab-reports.test.ts`, PGlite lane, 4 tests)

| #   | Result | What the test proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S46 | pass   | September by hand: released 8 (1 bedside; August and hospital B not counted), late 3 of 6 with a stated time = 50 %, rejected 4 of 10 = 40 %, criticals 1 of 3 in time (median 10 min), QC 2 of 4 rejected, wrong label 2, corrected 1 of 8 = 12.5 %, downtime 42 h (analyser 6, fridge 36 still down); clotted 3 most from the OPD clinic (2). Filters: the clinic (2 released, criticals and labels "No data", corrected a true 0 of 2), section 2 (3, analyser 6 h), urgent (1). An empty month: every tile "No data", machines 0 h. CSV: 13 lines, `no_data` in words, no patient id |
| S47 | pass   | The downtime RDT is placed on 29 SEP 10:30 with receipt 09:00 (the paper's times), not its 9 OCT entry; p90 over 30, 45, 60, 60, 90, 120, 180 = 180 (nearest rank); section 1 (30, 60, 90, 180) p90 180 with stated 30 and 120 (no single mark); section 2 (45, 60, 120) p90 120, stated 60                                                                                                                                                                                                                                                                                              |
| S48 | pass   | The late tile drills to r2, r4 and the downtime RDT, each with its patient, for the technologist; the hospital admin's `lab_indicator_counts` equals the lab's tiles, turnaround and rejections exactly, carries no patient id, and `lab_indicator_rows` returns nothing; as the admin, `SELECT count(*)` on `diagnostic_reports`, `specimens`, `specimen_events`, `critical_alerts`, `lab_identity_checks`, `encounter_orders` is 0 (RLS) and `lab_indicator_source` is "permission denied"; a clinician gets no rows and no numbers                                                    |
| S49 | pass   | The criticals tile equals a hand SQL count over `critical_alerts` for the month: 3 with a signed time, 1 acknowledged in time, median minutes from the alerts                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Timing.** The reports page's data for one month (the rows read as the clinical reader plus the engine): **8.5–9.5
ms** over five runs (PGlite, in process, fixture month; budget p95 < 2 s TTFB, asserted in S46). QI-3 holds without
a month cache.

### Differences from the prompt (and why)

- **The five other indicators** (`tat_p50` is in the rows; `no_iqc`, `no_eqa`, `eqa_unacc`, `stockout_days`) are not
  tiles on §5.13: they stay where their facts live (the EQA coverage chip, stock's days out of stock). The engine
  computes all fourteen (STOP 3's tests).
- **The admin's window** is the admin page's own (7, 28 or 90 days), with no ward, section or priority filter; the
  lab page has the filters. The In-Charge and focal person may call the counts function (RLS), but no desk view was
  added for them.
- **QC runs and equipment** have no ward or priority: those filters leave them whole, and the page says so.
- **The stated-turnaround mark** is drawn only when a section's tests share one stated time; otherwise the times are
  listed in words ("Stated times differ by test").
- **CSV** is a `data:` link built on the server (aggregates only), so no route or client code was added.
- **Screenshots** against artboard 13 are in the Step 11 harness pass, as earlier steps.

### Checks

`tsc --noEmit` clean; `npm run lint` 0 errors (the 2 old warnings); the full suite on the PGlite lane (`vitest
run`): **465 files passed, 23 skipped; 10,366 passed, 4 expected failures, 248 skipped**, 0 failed. Red scarcity
now covers `app/lab/reports`, `components/lab/lab-report-view.tsx` and the admin section (no red, no green).

**Next:** Step 11 (code): S50–S53, the LB-3 repeat task, reduced motion, client JS.
