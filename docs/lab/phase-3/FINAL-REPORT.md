# Lab Phase 3: final report

Branch `feat/lab-quality-registers` (worktree `medsync-lab3`), 13 Oct 2026. It builds `PROMPT-LAB-PHASE-3.md`
(registers, reports and quality). Every GATE A decision was taken as recommended, on the owner's instruction; no
clinical value, wording or mapping is signed by that. The branch has local commits only: nothing is pushed or merged.
Migrations **0112–0118** are written and **not applied**. ADRs **0300–0311** are written (Accepted, 13 Oct 2026). The
step-by-step record is in `STOP-REPORTS.md`; the hazard log in `hazard-log.md`; the user guide in `user-guide.md`;
screenshots in `shots/`.

## Checks

| Check                                  | Result                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Typecheck (`tsc --noEmit`)             | Clean                                                                                              |
| Lint (`npm run lint`)                  | 0 errors (2 old warnings in `scripts/embed-bench.mjs`)                                             |
| Full suite with the PGlite lane on     | 469 files passed, 22 skipped; 10,460 tests passed, 4 expected failures (outside Phase 3), 0 failed |
| Production build                       | Passes (STOP 11 code; and again in the harness after the Step 11 fixes)                            |
| Screenshot harness (1440 and 390 px)   | 23 views, 45 PNG + 1 PDF; axe on 44 page states: **0 serious or critical** after the fixes         |
| Timed human trials (QC run, delivery…) | **Not run**: no lab users in this session (owner action)                                           |

### The screenshot harness (Step 11)

A local harness (`~/Desktop/lab3-harness`, never the repo) boots the PGlite lane with every migration, 0112–0118
included, seeds the Phase 0/1 fixture and a Phase 3 fixture through the app's own store functions (every name a
fixture label), serves it on a local socket, and runs a production build of this branch with the eight Phase 3 flags
and the Phase 1/2 flags they need. Auth and the fresh second factor are patched in the harness copy only; nothing in
the repo changed for it. No remote database was touched.

Captured at 1440 and 390 px (`shots/`, `a01`…`a13b`): Quality today (artboard 1); the QC run with the Levey-Jennings
chart (2); release held on the result entry page with the override card (3); Quality control analysers and Kits and
stains (4); Stock and the item panel (5); Receive a delivery with the lots waiting for acceptance (6); Equipment and the
down machine's panel (7); EQA and the round panel (8); the nonconformity with its look-back, and the list (9); the
nurse's Device checks and the lab's Bedside quality (10); HMIS 105, the HMIS desk and the mapping editor (11); the daily
register and its A4 landscape print (12, PDF and PNG); Lab reports and the admin's Laboratory section (13).

**What the harness found, fixed in this commit (each small):**

1. `/lab/quality/eqa` **crashed** once a round was scored: the server page called `outcomeChip()`, a function exported
   from a `"use client"` module. Moved to the server-safe chip module; a new guard
   (`tests/design/client-call-from-server.test.ts`) fails on the old code and scans every Phase 3 tree.
2. `/lab/quality/qc` read drafts through the global client inside its own transaction (a second pool connection per
   request; it hung the one-connection harness and could starve the pool under load). Reads through the transaction.
3. axe `definition-list` (serious) on the QC run page: a `<p>` inside the plan's `<dl>`. Moved out.
4. The run form offered the material's first lot for every level, so level 2 showed "No target for this lot"; it now
   defaults to the lot the plan has a target for. A lab target with no recorded runs read "from ? runs between ? and
   ?"; it now reads "This lab's own".
5. The back-in-service checklist named components by concept id (`obs.haemoglobin`); it now names the analyte.

**Left as found (not serious):** axe `empty-table-header` (minor) on Stock, Receive and Equipment (an actions column
with no header text). The down machine's panel shows the breakdown's "since" time while "What doctors see" shows the
hub problem's report time; they differ when the lab enters a past start time. The harness could not print
`/lab/hmis/print` to PDF (headless Chrome stalls on it; the screen view renders); not investigated further.

## §13 numbers

"Tests" means the PGlite-lane and engine tests named; there is no production data (migrations unapplied, flags off).

| Metric                                                                          | Baseline                                     | Target | Result                                                                                                                                                  |
| ------------------------------------------------------------------------------- | -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Results released from a failed-QC analyte without an override (hold on)         | Step 0: no QC check (baseline test a)        | 0      | **0**: held on the server in every release path (S18); completion and amendment refused while held; baseline (a) passes                                 |
| Overrides, with reason and audit                                                | —                                            | report | Every override needs `lab.qc.override` and a reason, is audited and joins the look-back (S20). Live count: **not measured** (no live data)              |
| Rejected QC runs with a nonconformity and a look-back                           | —                                            | 100 %  | **100 %** in tests (S16, S21) and in the harness (1 of 1, 2 look-back items)                                                                            |
| Look-back results without a decision on closed nonconformities                  | —                                            | 0      | **0**: closing is refused while any is undecided (S22/S23, NC-4)                                                                                        |
| Lots used for patients before acceptance                                        | —                                            | 0      | **0**: refused on the server at bench, analyser and bedside (S2, LA-4)                                                                                  |
| Expired or quarantined lots selectable                                          | Step 0: expired selectable (baseline test c) | 0      | **0** (S6; baseline (c) passes)                                                                                                                         |
| Released results without a lot snapshot (stock on)                              | all                                          | 0      | **0** without a `lots` entry (S4, LU-3); where no lot is set in use on the device the entry says `not_recorded` (seen in the harness), never a guess    |
| Machines back in service without post-repair QC                                 | —                                            | 0      | **0** (S12)                                                                                                                                             |
| Bedside results from a blocked device or a lapsed operator                      | Step 0: accepted (baseline test b)           | 0      | **0** (S33, S36; baseline (b) passes)                                                                                                                   |
| Orderable in-house tests unmapped in HMIS                                       | —                                            | 0      | Signing is refused while any is unmapped (S40). At the test hospital: **not measured** (no mapping made; OA-1)                                          |
| HMIS rows differing from the paper tally, unexplained, after the parallel month | —                                            | 0      | **Not measured**: the parallel month (S45) is an owner action (OA-10)                                                                                   |
| Signed HMIS reports changed without a revision                                  | —                                            | 0      | **0**: frozen by trigger, also as `service_role` (S42, S52); changes need a revision (S43)                                                              |
| Restricted-class tests on the general register                                  | —                                            | 0      | **0** (S38, DR-3)                                                                                                                                       |
| Patient rows visible to hospital admin                                          | —                                            | 0      | **0** (S48; RLS probe table)                                                                                                                            |
| Indicators returning 0 where the source is empty                                | —                                            | 0      | **0** (QI-2 for every indicator; S46 empty month)                                                                                                       |
| Clinical numbers in code, seeds or copy                                         | —                                            | 0      | **0**: every number in tests and the harness is a named fixture; the HMIS form file holds no values; plans, ranges and levels are signed in the product |
| Hazards without a control and a test                                            | —                                            | 0      | **0 of 30** (`hazard-log.md`, draft for the CSO)                                                                                                        |
| Rule IDs without a test                                                         | —                                            | 0      | **0**: every rule ST-1 … QI-4 has at least one test (STOP 3 table)                                                                                      |
| RLS probes passed                                                               | —                                            | 100 %  | **100 %**: 23 tables and the aggregate functions × 10 actors (`lab-phase3-data`), plus S48                                                              |
| axe serious or critical                                                         | S0: not run on these screens (new)           | 0      | **0** on 44 harness page states after the fixes above (1 serious and 1 crash found and fixed)                                                           |
| Red or green on new routes                                                      | —                                            | 0      | **0** (S51, `red-reserved.test.ts`: a red test and a green test over every Phase 3 tree)                                                                |

### §11 performance (server-side, PGlite in process; fixture data)

| Measure                                    | Budget            | Result                                                                                                  |
| ------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `recordQcRun` with rule evaluation         | p95 < 300 ms      | 6 ms (S15)                                                                                              |
| `qcStatusFor` at release                   | < 2 ms, one query | one query for all components, 1.6 ms; the engine 0.056 ms                                               |
| Levey-Jennings data for 90 days            | p95 < 300 ms      | **Not measured** separately (the page rendered in the harness without delay)                            |
| `receiveDelivery`, 10 lines                | p95 < 800 ms      | 26 ms (S1)                                                                                              |
| `count105`, one month                      | p95 < 5 s         | 12.8 ms (S41)                                                                                           |
| Revision diff, nightly                     | < 1 min/hospital  | **Not measured** (the cron route exists; no production data)                                            |
| Lab reports page, current month            | p95 < 2 s TTFB    | 8.5–9.5 ms data time (S46); TTFB not measured on real hardware                                          |
| Added JS on `/lab` and the nurse workspace | report; flag > 40 | `/lab` +5.8 kB; result page +16.8 kB (was +41.6, the override dialog now loads on demand); nurse ≤ +5.7 |

## Definition of Done (§17)

| Item                                                                                       | State                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| H1–H10 confirmed or corrected and recorded; HMIS rows verified against the live dataset    | Recorded at STOP 0 (**done**). Rows verified: **owner action** (OA-1); every row is marked unverified until then                             |
| No release from failed QC without an override; every reject has an NC and a look-back      | **Done** (S16, S18, S20–S23)                                                                                                                 |
| No lot used before acceptance; expired and quarantined not selectable; results carry lots  | **Done** (S2–S6, S10); "not recorded" where no lot is set in use                                                                             |
| A breakdown changes what doctors see; no return to service without post-repair QC          | **Done** (S11, S12)                                                                                                                          |
| Bedside devices with a failed check and lapsed operators are refused                       | **Done** (S33–S37)                                                                                                                           |
| EQA rounds, scores and coverage recorded; unacceptable results open NCs                    | **Done** (S29–S32)                                                                                                                           |
| Daily register prints with no restricted test; the HIV register is separate                | **Done** (S38, S39); columns are the canvas defaults until the paper registers (OA-3)                                                        |
| HMIS 105 generated, checked, signed, revised, printed and exported; parallel month done    | Built and tested (S40–S44). **Owner action**: verify rows (OA-1), eHMIS ids (OA-2), designate people (OA-9), the parallel month (S45, OA-10) |
| Lab reports with turnaround and rejection by ward; drill-down; "No data"; admin aggregates | **Done** (S46–S49). **Gap**: four indicators live on the EQA and stock pages; no In-Charge or focal view                                     |
| No clinical number in code, seeds or copy                                                  | **Done**                                                                                                                                     |
| Every rule ID tested; RLS probes green; append-only tables hold                            | **Done** (STOP 3 table, `lab-phase3-data`, S52)                                                                                              |
| axe clean; no red or green; reduced motion honoured                                        | **Done** (harness axe 0 serious or critical; S51)                                                                                            |
| S1–S53 pass; all flags off matches Phase 2                                                 | **Done** except S45 (owner) and the timed human trials (not run); S50 proves flags off                                                       |
| Hazard log complete and signed; user guides, ADRs and final report exist; reviewable diff  | Written. **Owner action**: the CSO signs the hazard log and the user-guide wording                                                           |

## Gaps (honest list)

1. **QH-5 re-pinning** is not built: the hold block names analysers that passed QC today, but moving the specimen to
   another analyser's profile has no action; the sample is run there by the usual path.
2. **Comparison samples** in lot acceptance are stored as "Sample n · level", not as result ids (no result search).
3. **Certificates, equipment records and EQA reports** are reference text: the lab has no storage bucket.
4. **"Book reassessment"** has no booking store: the nurse's lapsed line says to ask the laboratory; the lab page lists
   lapsed operators.
5. **No competency revocation action** (the column exists and is set once; nothing sets it yet).
6. **HMIS rows are unverified**, so no mapping and no month is signable until the printed form or eHMIS export confirms
   them (OA-1); 10.6 has no rows (antibiotic list not transcribed) and 10.5's rows are free text.
7. **The CSV has no data rows** until the eHMIS data-element and category-option ids and the organisation unit code are
   supplied (OA-2): valued cells are listed as comment lines with null ids.
8. **Four indicators** (no IQC, no EQA, unacceptable EQA, stock-out days) show on the EQA and stock pages, not the
   report page.
9. **The admin view uses its own window** (7, 28 or 90 days) with no filters, and there is **no In-Charge or HMIS focal
   person screen** for the indicators (the counts function allows them).
10. **Timed human trials** (QC run, delivery, bedside check) were **not run**; the server timings above are PGlite in
    process.
11. **Overrides are not a Quality-today count**; they are listed on the nonconformity.
12. **LB-3 "Repeat when QC passes"** is a list above the worklist, not a stored task; a look-back window for a downtime
    result uses its entry time, not the paper's result time.
13. **Kit and stain QC after a repair** is not linked to the machine (no linked kit items on `devices`).
14. **Permission map 2.0.0 is unsigned**: until it is, `lab.stock.manage` and `poct.assess` belong to no cadre, and
    stock, ranges and assessments take `lab.manage` (the lead).
15. **Register**: `sections[]` in the register configuration was not built (the register is per section already); rows
    per printed page in the print log is an estimate (18).
16. **10.1 SC02** stays 0 (no referral-in until Phase 4); 10.4 is entered by hand until referral tracking.
17. Not measured: Levey-Jennings 90-day data time, the nightly revision diff, reports TTFB on real hardware.
18. Harness-only findings left: minor `empty-table-header`; the down panel's two times can differ; the HMIS form PDF
    did not print headless.

## Owner actions, in order

1. Review the branch. Say when to push and open the PR.
2. Apply migrations **0112 → 0113 → 0114 → 0115 → 0116 → 0117 → 0118** after 0111, with `npm run db:migrate`.
3. Obtain the printed HMIS 105 (2019 print version) or the eHMIS dataset export and confirm every section 10 and
   Section 6 row (**OA-1**); obtain the eHMIS data-element and category-option ids and the organisation unit code
   (**OA-2**).
4. Designate the Health Unit In-Charge and the HMIS focal person at the test hospital (**OA-9**), on the HMIS desk.
5. The CSO signs the Appendix A copy (`content/lab-phase-3.ts`, then `LAB3_COPY_STATUS` to signed), the hazard log and
   the user-guide wording.
6. The CSO signs permission map v2 (`data/lab/permission-map.v2.json`).
7. The laboratory lead fills and signs the sign-off packs in the product (GATE A §9): QC plans and the QC policy (with
   the CSO's countersignature), kit and stain rules, acceptance plans, stock levels, equipment schedules and
   temperature ranges, EQA schemes, bedside device rules, strip-lot ranges and competency validity, register columns
   (from the paper registers, **OA-3**), and the HMIS mapping (with the focal person). Inputs: **OA-5** (paper QC),
   **OA-6** (stock practice), **OA-7** (EQA schemes).
8. Run the baseline queries in STOP 0 on production (**OA-4** rejection counts, **OA-8** turnaround data quality).
9. Run the timed trials (QC run, delivery, bedside check) with two or three lab users.
10. Switch the flags on per hospital in the D-LAB3-27 order: `LAB_STOCK` → `LAB_EQUIPMENT` → `LAB_QC` (logging, at
    least 20 days of runs) → `LAB_QC_HOLD` (every live quantitative test with a signed plan, the hold countersigned) →
    `LAB_EQA` → `LAB_POCT_QUALITY` (grace period starts) → `LAB_REPORTS` → `LAB_HMIS`. At an A-LIS site all eight stay
    off.
11. With `LAB_HMIS` on, run the **parallel month** with the paper tally (S45, **OA-10**) using `parallel-run.md`;
    explain every difference; then stop the paper tally.
12. Unset `DEV_SKIP_MFA` before go-live.
