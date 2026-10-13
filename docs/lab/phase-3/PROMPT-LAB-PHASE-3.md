# PROMPT: Lab Phase 3 — registers, reports and quality (QC, stock and lots, equipment, EQA, nonconformities, bedside quality, daily register, HMIS 105, lab reports)

> **For Claude Code.** Work at the repo root on a new branch, `feat/lab-quality-registers`. Cut it from the branch where `feat/lab-one-menu` (lab Phase 2) has merged.
>
> - **If Phase 2 has not merged, STOP at Step 0.** This slice builds on Phase 2's analyser profiles, bedside devices and lots, the test menu, To refer, and payment, and on Phase 1's units, ranges, criticals, downtime and amendments.
> - First, copy into `docs/lab/phase-3/`:
>   - this prompt;
>   - `LAB-PHASE-3-RESEARCH.md`.
>
> **Mode: gated.** There are twelve steps, numbered 0–11, and each ends in a **STOP**.
>
> - **Documents** follow Stage 1: draft, critique against the checklist, revise (at most two passes), present, STOP.
> - **Code** follows Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
> - Self-refinement never replaces a real check.
>
> **Assume nothing in this slice is built.** Section 3 lists what earlier reads claimed. Verify every line. Build what Step 0 proves is missing, and reuse what it proves exists.
>
> **The CSO is Fadhul.** Nothing in this slice reaches a production hospital without the signatures this prompt names:
>
> - **The laboratory lead signs:**
>   - QC plans and rules;
>   - lot acceptance plans;
>   - kit and stain QC rules;
>   - bedside device QC rules;
>   - competency validity;
>   - the HMIS 105 mapping, with the hospital's HMIS focal person.
> - **The CSO countersigns:**
>   - the QC release hold and its override;
>   - every string a clinician reads in Appendix A;
>   - the hazard log.
> - **The Health Unit In-Charge** signs each monthly HMIS 105 before it leaves the hospital.

---

## 0. What we are building, in one paragraph

A lab adopts a system for its registers and reports first, and keeps it for its quality. Today the lab keeps paper registers and a paper tally for the HMIS 105, so it enters everything twice. Its quality work lives in exercise books, if anywhere: QC charts, reagent lots, maintenance, EQA scores, nonconformities.

This slice moves all of it onto the same record as the results:

- **QC** for analysers, kits, stains and bedside meters:
  - Levey-Jennings charts and Westgard rules where there are numbers;
  - **release held** when QC has failed, as ISO 15189:2022 7.3.7.2 g) requires;
  - a **look-back** of results released since the last good run.
- **Stock and lots:** first-expiry-first-out, minimum and maximum levels, and **lot acceptance before use**. Each result records the lot it was run on.
- **Equipment:** maintenance, calibration and temperature. A breakdown sets the test menu to "referred" by itself.
- **EQA** rounds and scores.
- **Nonconformities** with look-back, resumption and closure.
- **Bedside quality:** device controls and operator competency.
- **The daily register** printed from records.
- **The lab section of the HMIS 105** generated from records, signed by the In-Charge, with revisions when data changes after signing.
- **Lab reports and quality indicators.** Every number opens the records behind it.

**Done when:**

- the lab submits its monthly HMIS 105 laboratory section from MedSync, after a one-month parallel run with the paper tally, with no paper tally afterwards;
- turnaround and rejection rate are visible by ward;
- no patient result has been released from an analyte whose latest QC failed, except through a recorded override;
- no lot has been used for patients before it was accepted.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt, the roadmap, the research notes and the canvas. Report every disagreement at STOP 0.
2. **The plan.** The _MedSync Laboratory Roadmap_, version 2, section "Phase 3: Registers, reports and quality" (https://claude.ai/artifact/SQPdW66RcaAnu3QWQTYVTw).
   - **Site profiles:** a public hospital on **A-LIS** skips this phase. The lab keeps its QC, stock and HMIS in A-LIS.
3. **The research notes.** `docs/lab/phase-3/LAB-PHASE-3-RESEARCH.md`, compiled 13 Oct 2026, with sources and a confidence mark on each fact.
   - Part A: HMIS 105, registers, A-LIS and stock tools.
   - Part B: ISO 15189:2022 clauses, Westgard, CLSI C24, WHO LQMS, kit and stain QC, Uganda EQA, SLIPTA v3, IFCC quality indicators, inventory and CLSI EP26.
4. **The UI reference.** The design canvas _Lab Phase 3 UI Preview_ (https://claude.ai/artifact/WyFvKanF3KcGNCYMDhXphi). It has artboards 1–13, and Section 5 names the artboard for each screen.
   - It is drawn in MedSync Chroma. Build with the design system in force on this branch.
   - Every patient, target, SD, range, stock level, count, score and HMIS figure on it is **an example, not a real or signed value**.
   - HMIS row codes on the canvas follow the September 2019 print version and must be checked (H1).
   - Where this prompt and the canvas differ, this prompt wins. The known differences are in 5.14.
5. **Phase 1 and Phase 2 canvases**, for the screens this slice extends:
   - result entry;
   - the bedside form;
   - the test menu;
   - lab settings.
6. **Design documents and ADRs:**
   - `DESIGN-medsync.md`;
   - the hub's design notes (machines, statuses, "informs, never blocks", stated turnaround);
   - the lab Phase 0–2 ADRs;
   - the hospital-admin reports module.
7. **Prompts this builds on.** Read the copies under `docs/`.
   - `PROMPT-LAB-PHASE-2.md`:
     - availability OM-\*;
     - analyser profiles AP-\*;
     - bedside PC-\*;
     - devices and lots;
     - research drafts;
     - the house contract.
   - `PROMPT-LAB-PHASE-1.md`:
     - units UN-_, ranges RR-_, flags FL-\*;
     - criticals CA-\* and correction alerts CA-10;
     - downtime DT-\*;
     - snapshots (Law 8);
     - the red law and D-LAB1-18.
   - `PROMPT-LAB-PHASE-0.md`: permissions, navigation, the turnaround decision.
   - `PROMPT-HOSPITAL-SERVICES-HUB.md`: machines, statuses, four-eyes, print CSS.
8. **Code to read:**
   - `app/lab/**`, `app/nurse/**` (bedside);
   - the hospital-admin reports;
   - `lib/lab/**`, `lib/emr/**`;
   - the hub module;
   - the rejection codes;
   - `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

1. **Engine-first.** Every surface reads or writes an engine with real tables, real RLS policies and passing tests. The engine is built in an earlier step than the surface.

2. **One store per fact.**
   - Machines live in the hub. The equipment register **extends** a hub machine; it never copies it. Up and down status is written through the hub's own status action, so availability (Phase 2 OM-2) follows by itself.
   - Lots live in the stock ledger. Phase 2's bedside lots move into it (E-LAB3-02).
   - Released results are the only source for HMIS counts and reports. Nothing is tallied by hand that the record already holds.

3. **No remembered numbers.** None of the following comes from code, seeds or copy:
   - QC targets and SDs;
   - QC rules;
   - acceptance limits;
   - control ranges;
   - competency validity;
   - minimum and maximum stock levels;
   - alert windows;
   - the HMIS mapping.

   Each comes from the lab's own data, a manufacturer's insert, or a signed setting with its source. Operational settings (alert windows, count frequency, consumption look-back) are labelled as operational, never as clinical.

4. **The record keeps what was true.**
   - Each released result snapshots:
     - the QC status of its analyte and analyser at release (run id, decision);
     - the reagent, calibrator and control lots in use.
   - A signed HMIS 105 is frozen. Later data changes produce a **revision**, never a silent rewrite.

5. **Release is held when QC has failed** (ISO 15189:2022 7.3.7.2 g; SLIPTA 8.15).
   - Results for that analyte on that analyser cannot be released while its latest run is rejected.
   - The only path past the hold is a **recorded override** by a named holder of `lab.qc.override`, with a reason. The result then carries _"Released while QC had failed"_ to the doctor and joins the look-back.
   - This is the one place this slice stops a release, and it protects patients from wrong numbers.

6. **Informs, never blocks care, except to protect the record or the patient from a wrong result.** The hard stops in this slice are:
   - the QC hold (Law 5);
   - a lot that is quarantined, rejected, expired or not yet accepted cannot be selected for patient testing;
   - a bedside device whose last control check failed cannot be used;
   - an operator whose competency for a bedside test has lapsed cannot record it.

   Everything else, such as QC not run yet, a low stock level or an overdue calibration, informs in words.

7. **Every number is traceable.**
   - Every count, rate and indicator opens the records it counts, for a viewer allowed to see them.
   - **"No data" and 0 are different** and are shown differently.
   - Every report shows its period and its as-of time.

8. **Fail loud.**
   - A QC plan with no target, a lot with no acceptance plan, an unmapped test in the HMIS, or a missing temperature reading each shows in words to the person who can fix it.
   - Nothing is skipped silently.

9. **Restricted classes stay restricted.**
   - HIV tests have their own register and their own HMIS rows (10.3).
   - The general daily register never prints a restricted-class test.
   - Report drill-downs honour Phase 1 Law 12.
   - The HMIS export is aggregate only.

10. **Hospital admin sees aggregates, never patients.** Drill-down to records needs a lab role (Phase 1 RLS: hospital admin has no PHI).

11. **Red is a safety property.**
    - QC failed, held, quarantined, below minimum, overdue, lapsed and changed-since-signing are **amber**, with an icon and a word. A rejected QC run uses the dark amber chip.
    - Nothing in this slice is red.
    - Nothing is green either: passed and in-stock are neutral chips with a check.

12. **Two identifiers everywhere** a patient appears: look-back lists, lot comparisons that show patients (they should not, 5.6), the register and drill-downs.

13. **Behind flags, stack as found.**
    - There are eight per-hospital flags, all off by default: `labStock`, `labEquipment`, `labQc`, `labQcHold`, `labEqa`, `labPoctQuality`, `labHmis`, `labReports`.
    - With all eight off, behaviour matches the Phase 2 baseline.
    - At an A-LIS site all eight stay off (D-LAB3-25).
    - Use the ORM, package manager, flag mechanism and tokens on the branch.
    - TypeScript strict, no `any`. Zod on every action. AAL2.
    - No new dependencies without stopping to flag them; charts are SVG built from tokens.
    - Tokens only, no hex.

14. **en-GB.** The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU) wherever copy mentions it. Dates show as `13 OCT 2026`.

---

## 3. What earlier reads claimed (verify every line at Step 0)

| #   | Claim                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Where           | Severity                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------- |
| H1  | HMIS 105, "Print Version September 2019" (the 2020 revision), puts the lab in **Section 10: LABORATORY**, pp. 25–29. Subsections: 10.1 visits and specimens; 10.2 routine tests (Number Done, Number Positive; no age or sex split; rows coded HE, BT, SR, MB, IG, ML, PS, MS, RP, LP, LC, CX, CS); 10.3 HIV tests by kit × purpose, with IQC and EQA columns; 10.4 referrals with average TAT and pending; 10.5 tests not done here, by reason; 10.6 AMR; 10.7 rejection by reason (RS01–RS14) × specimen type. Filled from "Table 17a (Laboratory Tests Daily Summary)". Due the 7th of the following month, signed by the Health Unit In-Charge. Row labels were read by text extraction, not from a printed copy | research Part A | **Reporting accuracy**       |
| H2  | HMIS 105 Section 6 reports lab tracer items monthly (SS07–SS12: HIV kits, CD4 reagent, malaria RDTs, GeneXpert cartridges; SS26 blood): consumed, days out of stock, stock on hand, expired                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | research Part A | Reporting                    |
| H3  | A-LIS v3 (June 2021) auto-generates a printable HMIS 105 lab summary; DHIS2 upload "later"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | research Part A | Benchmark                    |
| H4  | MoH lab registers (2010 numbering): HMIS 055A1–A4, 089 TB, 090 clinical chemistry, 092, 093, 094, 095. **Their columns were not obtained**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | research Part A | Register layout              |
| H5  | The hub lists machines. There is no stock, lot, maintenance, QC or EQA anywhere in MedSync                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | roadmap         | Gap                          |
| H6  | Phase 2 delivered: analyser profiles, bedside devices and `poct_lots`, the test menu, To refer, and the availability snapshot with its reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `lib/lab/**`    | Dependency                   |
| H7  | Coded rejection reasons exist on specimen rejection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `/lab`          | Needed for 10.7              |
| H8  | Hospital-admin reports have no lab metrics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | admin reports   | Gap                          |
| H9  | Phase 1 delivered: critical alerts and acknowledgement times, amendments with correction alerts, downtime back-entry with true times                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `lib/lab/**`    | Needed for QIs and look-back |
| H10 | The HIV rapid-test order has no testing purpose (HCT, eMTCT, clinical diagnosis, SMC, verification, recency)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | orders          | Needed for 10.3              |

---

## 4. Design direction

**Eight rules**

1. **Quality is a morning view.** The laboratory lead opens one page and sees what failed, what is due, what is held, what is running out and what is down.
2. **The chart decides, the person confirms.** Westgard rules are evaluated by the system; the technologist records the decision and the first corrective step.
3. **Held is not hidden.** A held result says why, what to do next, and who can release it if the patient cannot wait.
4. **Look back, then close.** A failure is not finished until the results it may have touched have each had a decision.
5. **A lot must earn its place.** Received → accepted → in use. Use first what expires first.
6. **A machine's state reaches the doctor.** A breakdown changes what doctors see at ordering, in the same minute.
7. **Count once, from the record.** No tally sheet, no double entry, no hidden zeros.
8. **Paper stays possible.** The register and the HMIS form print; the CSV matches the eHMIS data elements.

**Budgets** (measured at Step 0 where a baseline exists; met by Step 11)

| Measure                                                                        | Budget                                |
| ------------------------------------------------------------------------------ | ------------------------------------- |
| Recording a two-level QC run, from opening the form to saved                   | median ≤ 45 s in the timed trial      |
| Rule evaluation for a run (server)                                             | p95 < 100 ms                          |
| `qcStatusFor` per component at release                                         | < 2 ms, from a cached status row      |
| Receiving a 10-line delivery                                                   | median ≤ 4 min in the timed trial     |
| HMIS 105 section 10 for one month, one hospital                                | p95 < 5 s to generate                 |
| Lab reports page for one month                                                 | p95 < 2 s TTFB, with as-of time shown |
| Patient results released from a failed-QC analyte without an override          | 0                                     |
| Lots used for patients before acceptance                                       | 0                                     |
| HMIS rows differing from the paper tally after the parallel month, unexplained | 0                                     |

---

## 5. Interface specification

Lab navigation after this slice:

- Worklist · Criticals · Released today · To refer · Rejected · Downtime entry;
- **Quality:** Quality today · Quality control · Stock and lots · Equipment · External quality · Nonconformities;
- **Reports:** Daily register · HMIS 105 · Lab reports;
- Set-up (unchanged from Phase 2, with QC plans and acceptance plans reached from each test).

Each item appears only when its flag is on and the viewer holds the permission.

### 5.1 Quality today (artboard 1)

- For `lab.manage` and lab users.
- **Four tiles**, each a link:
  - QC still to run today;
  - results held by QC;
  - lots expiring within the alert window;
  - equipment down.
- **Quality control, today:** one row per QC item (analyte group on an analyser, kit lot, stain, bedside meter), with where, last run and **Status**:

  | Status                       | Chip                     |
  | ---------------------------- | ------------------------ |
  | Passed                       | Neutral, with a check    |
  | Warning 1-2s, accepted       | Amber                    |
  | Failed {rules}, release held | Dark amber, links to 5.3 |
  | New lot, run controls        | Dashed                   |
  | Due today                    | Dashed                   |
  | Not run today                | Dashed                   |
  | No QC plan                   | Amber                    |

- **Needs you:** equipment down (with what doctors now see), stock below minimum, EQA results due, open nonconformities, temperature excursions.

### 5.2 Quality control: a quantitative run (artboard 2)

- Header: analyte, unit, analyser, and a level switcher.
- **Levey-Jennings chart:**
  - the last 20 runs (choosable: 20, 50, 90 days);
  - mean and ±1, 2, 3 SD lines;
  - points joined;
  - a point that broke a rule is drawn filled, and the chart has a text alternative listing the breaks;
  - each point is focusable, showing value, SD distance, time, operator and lots.
- **This run:** one row per level: result (component unit, decimal rules from Phase 1), target ± SD, distance in SD, and the rules broken.
- **Decision block:**
  - **Rejected** (amber hold block): names the rules, says what they suggest ("systematic shift", "random error") from a signed text table, and states the hold.
  - **First corrective step:** recalibrate, new control vial, check reagent lot, other.
  - Primary button: **Reject run and hold {analyte}**.
- A warning (1-2s alone) shows _"Warning: accepted"_, with **Accept run**. The warning is recorded.
- **QC plan card:** levels, frequency, reject and warn rules, the target source (this lab's own, from N runs between dates, or the maker's range, provisional), the signature and date, and the action on failure.
- **Note:** a new control lot starts with the maker's range, marked provisional, until enough runs give the lab's own target (D-LAB3-04).

### 5.3 Release held and look-back (artboard 3)

- **On result entry** (Phase 1/2 screen):
  - an analyte whose analyser's latest run is rejected shows **Held** in a QC column, with the amber hold block at the top;
  - the other components can be released, and the doctor sees _"{analyte} to follow: held for quality control"_.
- **If the patient cannot wait:** **Release {analyte} anyway**, visible only to holders of `lab.qc.override`. It needs a reason, and the released result carries the signed line to the doctor.
- **Look-back panel**, opened automatically with a nonconformity on rejection:
  - the window (from the last accepted run to the rejected run);
  - the number released;
  - the estimated bias from the failed level, **labelled estimate**;
  - results whose flag or critical status **might** change if the bias is removed, listed first;
  - a per-result decision: Result stands · Repeat when QC passes · Amend (Phase 1 amendment and correction alerts);
  - progress _"{n} of {m} reviewed"_;
  - a link to the nonconformity.

### 5.4 Kits and stains (artboard 4)

- Tabs: Analysers · **Kits and stains** · Bedside devices.
- **Table:** kit or stain (with lot or batch) · why it is due (each day of use, new lot, new shipment, new operator, schedule, after maintenance) · controls · last · status.
- **Panel:**
  - the control material lot;
  - each control's result as the coded answers of the test (Reactive, Non-reactive, Invalid; for stains, the signed pass criteria as checkboxes);
  - the outcome line.
- **Pass on a new lot** accepts the lot (5.6). **A failed control** quarantines the lot at once and opens a nonconformity.
- HIV kit controls show _"Counted on HMIS 105 section 10.3 as IQC, not as patient tests."_

### 5.5 Stock and lots (artboard 5)

- Actions: **Receive a delivery** · **Record a stock count**.
- Filters: All · Below minimum · Expiring within the alert window · Quarantined · HMIS tracer items.
- **Table:** item (and pack) · on hand · **months of stock** (a level bar with the minimum mark, and the number) · nearest expiry · status.
- **Item panel:**
  - average monthly use (and its basis);
  - minimum and maximum, in months of stock;
  - the quantity to reach maximum;
  - days out of stock this month;
  - the HMIS tracer code if any;
  - **lots** with quantity, use-by and state; the lot to use first is marked **Use first**.
- Buttons: **Issue to a bench** · **Print order request** (a printable request for the store; no supplier ordering integration in this slice).

### 5.6 Receive a delivery and accept a lot (artboard 6)

- **Delivery:** from (NMS, JMS, other), delivery note number, received at.
- **Lines:** item · lot · quantity · use-by · **On arrival** (condition checks: sealed, cold chain kept, damaged quantity) · **Next** (acceptance needed, controls needed, partly rejected).
- Only accepted quantities enter stock. Rejected quantities are recorded against the supplier.
- **Acceptance** for a lot that needs it:
  - **Lot comparison:** a table of samples (labelled _Sample 1 … n_ with their level; patient identity is **not shown** on this screen) with current lot, new lot, difference and within-limit. The plan card shows method, number of samples, the acceptance criterion and "also QC passes on the new lot".
  - **Controls:** links to 5.4.
  - **Certificate:** attach the certificate of analysis where the plan allows.
- **Accept lot** / **Reject lot**. A lot that is not accepted cannot be chosen at the bench or bedside.

### 5.7 Equipment (artboard 7)

- The machine list from the hub, extended:
  - status (In service · Down since {time} · Retired);
  - maintenance (last done, next due);
  - calibration (next due, or amber overdue);
  - temperature-monitored items with the latest reading and range.
- **A down machine's panel:**
  - since, cause, reported to and ticket;
  - **What doctors see now** (the services whose only in-service machine this is, now _Down · referred_);
  - the count of specimens moved to To refer;
  - **Back in service when:** repair recorded, and QC passed on every analyte after the repair.

  The button opens only when both are done.

- **Maintenance:** each task from the schedule with a checkbox and who and when; overdue amber.
- **Temperature:** readings with time and who; out-of-range opens a nonconformity and suggests (never forces) quarantining the stock stored there.

### 5.8 External quality assessment (artboard 8)

- **Schemes table:** scheme and provider · covers (tests) · rounds a year · next (results due) · last round outcome.
- **Coverage chip:** _"{n} of {m} tests have no EQA"_, opening the list. Each test without a scheme needs an **alternative assessment** record (split samples with another lab, interlaboratory comparison, retained samples).
- **Round panel:**
  - samples and analytes;
  - our result;
  - target;
  - score as the provider reports it (acceptable or unacceptable, and %, SDI or z as given);
  - who tested it (it must be staff who run patient samples);
  - attach the provider's report.
- **Unacceptable** opens a nonconformity with a patient look-back over the round period.
- HIV EQA panels are counted on HMIS 105 10.3 under EQA.

### 5.9 Nonconformity (artboard 9)

- Title, status chip (Open · testing halted / Open / Closed).
- **What happened:**
  - source (QC failure, EQA, equipment, temperature, lot rejected, complaint, other), linked;
  - linked nonconformities;
  - the risk to patients, in words.
- **Actions:** action · who · by · state. The automatic actions (hold, look-back) are listed with MedSync as the actor.
- **Resume testing:** conditions (QC passes after correction; look-back finished), then **Authorise resumption** (laboratory lead).
- **Close:**
  - cause category;
  - how effectiveness will be checked;
  - the check met;
  - the laboratory lead's signature.

### 5.10 Bedside device checks and competency (artboard 10)

- In the nurse workspace, under Bedside tests.
- **Control check:** one row per control level, with reading, **accepted range for this strip lot** (entered once per strip lot by the lab from the vial) and result. Due: each day the meter is used, each new strip lot or control vial, after a drop or an error message.
- A failed check stops the device. Not done today shows _"Control check not done today"_ on the bedside form (D-LAB3-15).
- **Who may record {test} here:** staff, assessed date, valid to; lapsed rows amber. **Book reassessment**. A lapsed operator cannot record that test.

### 5.11 HMIS 105, laboratory (artboard 11)

- Month picker; a status chip: Draft · Checked by the laboratory lead · Signed {date} by the In-charge · Revision {n}.
- **Changed since signing** (amber): what changed, why (for example, back-entered downtime results), and **Prepare revision**.
- **Section tabs:** 10.1 Visits · 10.2 Routine tests · 10.3 HIV tests · 10.4 Referred · 10.5 Not done here · 10.6 AMR · 10.7 Rejections · 6 Tracer stock.
- **Table:** code · lab test · Number done · Number positive.
  - Group rows as on the form.
  - Every number links to the results it counts.
  - A dash where the form has no positive column.
  - Bedside share shown inline where present.
- **How the numbers are counted:** the signed counting rules in words (6.11).
- **Still entered by hand:** 10.6 AMR (until microbiology), and the 10.4 turnaround and pending columns (until referral tracking).
- **Send:**
  - the due date;
  - **Print form**;
  - **Download CSV** in eHMIS data-element order;
  - **Check** (laboratory lead) → **Sign** (Health Unit In-Charge, fresh second factor).

### 5.12 Daily register (artboard 12)

- A4 landscape, print CSS, black on white.
- Per section, per day.
- Columns configurable to match the hospital's current paper register (D-LAB3-24); default columns: lab no., received, patient, hospital no., age, sex, OPD or ward, specimen, test, result, done by, released.
- Rejected specimens appear with their reason.
- **HIV tests are on their own register**, printable only by users with HIV access. Other restricted classes are excluded from the general register.
- Footer: printed-from-records time; "Checked by \_**\_ Date \_\_**".
- Each print writes a print event.

### 5.13 Lab reports and quality indicators (artboard 13)

- Filters: month (or range), ward or clinic, section, priority.
- **Tiles**, each a defined indicator (6.12):
  - tests released (bench and bedside);
  - reports later than the lab's stated time;
  - specimens rejected;
  - criticals acknowledged in the signed time;
  - QC runs rejected;
  - wrong label caught at collection;
  - reports corrected after release;
  - equipment downtime.
- **Turnaround:** 90th percentile from receipt to release per section, with the lab's stated turnaround as a mark. The scale and units are stated.
- **Rejected specimens by reason**, with the ward or clinic most affected.
- Download CSV. **As of {time}** on every view.

### 5.14 Known differences from the canvas

- The canvas's tiles and figures are examples. The indicator set and definitions come from 6.12.
- The register columns on the canvas are defaults, not the MoH register (H4).
- HMIS row labels on the canvas are transcriptions to verify against the eHMIS dataset (H1).
- The analyser tab of 5.4, the temperature log editor, the maintenance checklist editor, the QC plan editor, the acceptance plan editor, the HMIS mapping editor, the HIV register print and the alternative-assessment form have no artboards. Build them from these specifications with the same components.
- The look-back's "estimated bias" is an estimate and must say so everywhere.

---

## 6. Engines (pure, no I/O unless stated; every rule has an ID and at least one test)

### 6.1 Stock ledger (`lib/lab/stock.ts`)

- **ST-1** Stock items:
  - kind: reagent, kit, control, calibrator, stain, consumable;
  - unit of issue and pack;
  - tests per unit where meaningful;
  - linked components or tests;
  - storage location;
  - HMIS tracer code (Section 6) if any.
- **ST-2** Lots:
  - item, lot number, use-by, received, condition on receipt, date opened;
  - **state:** `received` → `in_acceptance` → `accepted` → `in_use` → `finished`, or `quarantined`, `rejected`, `expired`.
  - Transitions are events.
  - `expired` is set by the clock at the end of the use-by day.
- **ST-3** An append-only ledger of transactions: receipt, issue (to a bench, analyser or ward), adjustment (with reason), count (with the counted quantity and discrepancy), write-off (expired or damaged), return.
  - Stock on hand is derived from the ledger, never stored as an editable number.
- **ST-4** Average monthly use = issues over the consumption look-back (operational setting; default 3 months, labelled operational) ÷ months.
  - Months of stock = on hand ÷ average monthly use.
  - With fewer than the look-back months of history, the item shows _"Not enough history"_, never a number.
- **ST-5** Minimum and maximum are set per item in months of stock by the laboratory lead (operational).
  - Quantity to reach maximum = max × average use − on hand, never negative.
- **ST-6** **First expiry, first out:** `nextLotToUse(item, place)` returns the accepted lot with the earliest use-by.
  - Choosing another lot needs a reason, which is recorded.
- **ST-7** Days out of stock in a period = days on which stock on hand was 0 at the end of the hospital-local day.
- **ST-8** Expiry alerts at the alert window (operational).
  - Expired lots cannot be issued or selected (Law 6).
- **ST-9** **Expected versus issued:**
  - for items with tests per unit, the expected use from released tests in the period is shown beside the issues;
  - a difference beyond the operational tolerance is listed as possible wastage or unrecorded use;
  - it informs only.
- **ST-10** The weekly count (operational frequency) lists items due. A discrepancy needs a reason and adjusts the ledger.

### 6.2 Lot acceptance (`lib/lab/acceptance.ts`)

- **LA-1** Each item has a signed **acceptance plan**:
  - `qc_pass` (kits, stains, controls; links to the item's QC rule);
  - `lot_comparison` (number of samples across the measuring range, an acceptance criterion as absolute and/or percentage difference, "whichever is larger" or "both", and whether QC must also pass on the new lot);
  - `certificate` (a certificate of analysis accepted, where the plan allows it);
  - `none` (consumables that do not affect results).
- **LA-2** The plan states its triggers: new lot, new shipment of the same lot, new formulation.
- **LA-3** `evaluateLotComparison(plan, pairs)` is pure and table-tested at the criterion boundaries.
- **LA-4** A lot in `received` or `in_acceptance` cannot be selected for patient testing (Law 6). Test it at the server for the bench, the analyser lots-in-use and the bedside form.
- **LA-5** The samples used for comparison are recorded by result id. They are shown as _Sample n_ with their level, never with patient identity on this screen.
- **LA-6** **Grandfathering at go-live:** lots on hand when `labStock` is first switched on are recorded as `accepted (before MedSync)`, with a statement by the laboratory lead. This is listed in the hazard log.

### 6.3 Lots in use (`lib/lab/lots-in-use.ts`)

- **LU-1** For each analyser or bench and component, the lots in use: reagent, calibrator, control.
  - Bedside devices hold their strip or kit lot (Phase 2, now in the ledger).
- **LU-2** Changing a lot in use is an event, and needs the lot to be `accepted` or `in_use`.
- **LU-3** Releasing a result snapshots the lots in use at the result time (Law 4). Back-entered downtime results use the lots in use at the form's result time if recorded, otherwise _"lot not recorded"_.

### 6.4 Equipment (`lib/lab/equipment.ts`)

- **EQ-1** The register extends the hub's machine record with:
  - serial, model, location;
  - service provider and contact;
  - installation date;
  - linked components;
  - maintenance schedule;
  - calibration items;
  - temperature monitoring (range, readings per day).
- **EQ-2** **Marking down:**
  - writes a breakdown record (since, cause, reported to, ticket);
  - **sets the hub machine's status through the hub's own action** (Law 2), so `availabilityFor` returns `down_referred` for services whose only in-service machine this is.
  - The number of specimens moved to To refer is shown.
- **EQ-3** **Back in service** requires a repair record **and** an accepted QC run, after the repair time, for every linked quantitative component (and the kit or stain QC where linked).
  - The hub status returns through the hub's action.
  - Downtime hours are recorded.
- **EQ-4** Maintenance tasks come from the schedule (daily, weekly, monthly, by count), each with done-by and time. Overdue is amber. Nothing blocks testing (Law 6), unless the laboratory lead marks a task "required before use".
- **EQ-5** Calibration items (analyser calibration, pipettes, centrifuge speed, thermometers, timers) have due dates from their schedule, with the certificate or record attached. Overdue is amber.
- **EQ-6** **Temperature readings:** a reading outside the item's range opens a nonconformity, notifies the laboratory lead in the app, and lists the stock stored there with a **Quarantine** suggestion. A missing reading at a due time shows _"Reading not recorded"_ (amber).

### 6.5 QC for kits, stains and qualitative tests (`lib/lab/qc-kits.ts`)

- **KQ-1** A QC rule per kit or stain item, signed by the laboratory lead, with:
  - triggers: `each_day_of_use`, `new_lot`, `new_shipment`, `new_operator`, `schedule` (for example weekly on a weekday), `after_maintenance`;
  - the controls;
  - the expected result per control;
  - whether QC is **required before use** (blocks selection) or informs.
- **KQ-2** `kitQcDue(item, lot, operator, date)` is pure and returns the triggers outstanding.
- **KQ-3** A failed control **quarantines the lot** at once and opens a nonconformity. Releasing from quarantine needs the laboratory lead and a passing rerun.
- **KQ-4** A pass on a new lot whose acceptance plan is `qc_pass` accepts the lot (LA-1).
- **KQ-5** Stain QC uses the signed pass criteria as a checklist (for example, Giemsa: red or pink nucleus, blue cytoplasm, Schüffner's dots visible; ZN: positive control smears positive and negative smears negative). Criteria are signed data, not code.
- **KQ-6** HIV rapid-test QC events are counted in HMIS 105 10.3 as IQC, by kit (HM-6).

### 6.6 QC for quantitative tests, the release hold and the look-back (`lib/lab/qc.ts`, `lib/lab/qc-rules.ts`, `lib/lab/lookback.ts`)

**Plans and materials**

- **QQ-1** A control material lot has: item, level, analyte or components, use-by, the manufacturer's range (if any) and the lab-established target and SD (once established).
- **QQ-2** A **QC plan** per component per analyser, signed by the laboratory lead, has:
  - levels;
  - frequency (each day of testing before patient samples, by default; per run; per number of samples);
  - **reject rules** and **warn rules** from the rule library;
  - the target source;
  - "hold release when not run in the window" (on or off, D-LAB3-02).

  The hold behaviour is countersigned by the CSO.

- **QQ-3** **Establishing a target.** A new control lot uses the manufacturer's mean and SD, marked `provisional`. After the configured minimum of runs over the configured minimum span (defaults 20 runs over 20 days, signed data with sources WHO LQMS and CLSI C24 Ed4 via Westgard), **Set this lab's target** computes the mean and SD from accepted runs and creates a new plan version.
  - There is **no rolling recalculation**.
  - Targets change only by this action.

**Rules**

- **QR-1** `evaluateRules(plan, run, history)` is pure. It works in SD units relative to the target and returns each broken rule with its scope (within run across levels; across runs within a level).
- **QR-2** The rule library:

  | Rule                               | Kind              | Scope                                                                |
  | ---------------------------------- | ----------------- | -------------------------------------------------------------------- |
  | 1-2s                               | warning           |                                                                      |
  | 1-3s                               | reject            |                                                                      |
  | 2-2s                               | reject            | within run across levels, and across consecutive runs within a level |
  | R-4s                               | reject            | **within run only**                                                  |
  | 4-1s                               | reject            | across runs                                                          |
  | 10-x                               | reject            | across runs and, if the plan says, across levels                     |
  | 2of3-2s, 3-1s, 6-x, 8-x, 9-x, 12-x | optional variants | for three-level plans or sigma-based selection                       |
  - Definitions are as quoted in the research notes from westgard.com.
  - A computer evaluation applies every configured rule directly. It does not use 1-2s as a gate (Westgard).

- **QR-3** History for across-run rules uses runs of the same control lot and the same plan version. A control lot change starts a new history.
- **QR-4** Table tests for every rule with fixtures: each rule broken alone; combinations; R-4s never across runs; 10-x across runs.

**Status and the hold**

- **QH-1** `qcStatusFor({ analyser, component, at })` returns `passed`, `warning`, `failed`, `not_run_in_window`, `no_plan` or `provisional_target`, with the run id. It is cached in a status row updated on every run decision.
- **QH-2** With `labQcHold` on, releasing a result of a component whose status is `failed` is **refused on the server** (Law 5). Other components on the report can be released; the held component shows _"to follow: held for quality control"_ to the doctor.
- **QH-3** `not_run_in_window` holds only if the plan says so (D-LAB3-02). Otherwise the technologist sees _"QC not run today"_ and the release is recorded with that status.
- **QH-4** **Override:** a holder of `lab.qc.override` (the laboratory lead, or the delegate named for the shift) releases with a reason. The result carries the signed line _"Released while QC had failed"_, the override is audited, and the result is added to the look-back.
- **QH-5** Bench release for an Immediate order offers, in the hold block, **Run on another analyser** when another in-service analyser has a passed status for the component.
- **QH-6** The status at release is snapshotted on the result (Law 4).

**Look-back**

- **LB-1** On a rejected run, `lookBack(analyser, component)` lists results released from the last accepted run to the rejected run on that analyser.
- **LB-2** The estimated bias is the failed level's mean deviation × SD, **labelled estimate**. Each result gets:
  - `flag_might_change` if removing the bias crosses a signed range limit;
  - `critical_nearby` if it crosses or comes within the bias of a signed critical limit.

  These sort the list. They decide nothing.

- **LB-3** A decision per result: `stands`, `repeat` (a repeat task on the worklist once QC passes), or `amend` (the Phase 1 amendment path, which sends correction alerts per CA-10). Every decision is recorded with actor and time.
- **LB-4** The look-back belongs to the nonconformity (NC-3). The nonconformity cannot close while any result lacks a decision.

### 6.7 External quality assessment (`lib/lab/eqa.ts`)

- **EA-1** Schemes: provider, covered components or tests, rounds per year. Enrolments per test.
- **EA-2** Rounds:
  - received date;
  - results due date;
  - samples (scheme ids) with analytes;
  - **tested by** (a user who released patient results for that component in the 30 days before; operational check, warning only);
  - results entered;
  - submitted date.
- **EA-3** Scores are entered as the provider reports them (acceptable or unacceptable; %, SDI or z with the provider's limits), and the report file is attached. MedSync does not re-score.
- **EA-4** An unacceptable result opens a nonconformity with a patient look-back over the period between the round's receipt and its scoring (LB-\* without the bias estimate, unless the provider's report gives a bias).
- **EA-5** **Coverage:** every orderable in-house test is enrolled in a scheme or has an **alternative assessment** record within the period set by the laboratory lead (split samples, interlaboratory comparison, retained samples, with results and a conclusion). Tests with neither are counted (Intra-EQA).
- **EA-6** HIV EQA panel tests are counted in HMIS 105 10.3 under EQA, by kit.

### 6.8 Nonconformities (`lib/lab/nonconformity.ts`)

- **NC-1** **Sources:**
  - automatic: QC reject, kit QC fail, EQA unacceptable, temperature excursion, lot rejected after acceptance testing;
  - manual: equipment, complaint, specimen issue, other.
  - Automatic ones are opened by MedSync with the laboratory lead as owner.
- **NC-2** Fields:
  - what happened;
  - linked records;
  - risk to patients (text);
  - actions (who, by, state);
  - testing halted (yes or no, linked to holds);
  - users notified (and how);
  - cause category;
  - effectiveness check;
  - status (`open`, `closed`).
- **NC-3** A look-back attaches to its nonconformity. **Resumption** (lifting a QC hold or putting a machine back in service) needs its conditions met and the laboratory lead's authorisation.
- **NC-4** **Closing** needs:
  - the cause category;
  - every look-back result decided;
  - every action done or cancelled with a reason;
  - the effectiveness check recorded as met;
  - the laboratory lead's signature.
- **NC-5** Overdue actions are amber on Quality today. Nothing auto-closes.

### 6.9 Bedside quality (`lib/lab/bedside-quality.ts`)

- **BQ-1** Device control rules (signed), with triggers:
  - each day of use;
  - new strip lot;
  - new control vial;
  - after a drop or an error message (recorded by the operator);
  - the controls and **accepted ranges per strip lot** (entered by the lab from the vial; never typed by the operator).
- **BQ-2** A failed check sets the device to `blocked` until a check passes. Selection is refused on the server (Law 6).
- **BQ-3** Not done today: the bedside form shows _"Control check not done today"_ and records it on the result. It blocks only if the rule says "required before use" (D-LAB3-15).
- **BQ-4** **Competency per bedside test:** assessed date, assessor (a lab user), method (training, observed test, known-value sample), valid to (validity period signed, operational).
  - `poct.record` (Phase 2) becomes per test.
  - A lapsed operator is refused on the server.
  - **Grandfathering:** existing holders are valid for the grace period set at switch-on (D-LAB3-16).
- **BQ-5** Bedside results snapshot the device check status and the operator's competency status at measurement.

### 6.10 Daily register (`lib/lab/register.ts`)

- **DR-1** `dailyRegister({ hospital, section, date })` is a read model over specimens received and results released or rejected that day (hospital-local), in lab number order. Back-entered downtime results appear on the form's date, with _"entered {date}"_.
- **DR-2** Columns are a per-hospital configuration (D-LAB3-24), versioned.
- **DR-3** Restricted classes:
  - excluded from the general register;
  - HIV tests print only on the HIV register, for users with HIV access;
  - other restricted classes print only on their class register, for users with that access.
- **DR-4** Each print writes a print event (user, section, date, pages).
- **DR-5** Results shown are as released at print time; a later amendment appears on the register of the day it was made, marked _Amended_.

### 6.11 HMIS 105 (`lib/lab/hmis105.ts`)

**Mapping**

- **HM-1** The **form version** is data:
  - version label (`2019-09-print`);
  - sections;
  - rows (code, label, section, group, has-positive, sub-columns such as ML01's MTB+ and RR);
  - eHMIS data-element ids per cell (obtained at Step 0, Q4).

  Labels are verified against the live eHMIS dataset before signing.

- **HM-2** The **mapping**, versioned and signed by the laboratory lead and the HMIS focal person:
  - test, component or coded-answer → row;
  - the **positive rule** per row (specific coded answers, for example MTB detected at any level for ML01 MTB+, rifampicin resistance detected for RR; malaria parasites seen or RDT Pf/Pan positive; reactive for serology);
  - specimen type → 10.1 and 10.7 columns;
  - MedSync rejection codes → RS01–RS14;
  - availability reasons → 10.5 columns;
  - stock items → Section 6 tracer rows.
  - **Unmapped orderable tests are listed** on the report. A test goes to an "Others" row (HE09, MB08, CX07) only by an explicit mapping.

**Counting**

- **HM-3** `count105({ hospital, month, mappingVersion })` is pure over a snapshot of source rows. The rules (signed, shown on the report):
  - (a) released results whose result time (the form's time for downtime back-entry) falls in the month, hospital-local;
  - (b) chemistry per analyte, as the form asks;
  - (c) QC and EQA tests excluded from 10.2;
  - (d) rejected specimens counted in 10.7 only;
  - (e) referred-out tests counted in 10.4 or 10.5, never in 10.2;
  - (f) outside results (Phase 2 NF-7) never counted;
  - (g) an amended result counts once, as its current version;
  - (h) bedside tests done in this hospital counted in their row, with the share stored for display (D-LAB3-19);
  - (i) a row for a test not on the hospital's menu is **blank**; a row for a test on the menu with none done is **0** (D-LAB3-22).
- **HM-4** **10.1 visits:** distinct patient × hospital-local day × OPD or IPD with at least one specimen received, by specimen type (D-LAB3-20, to confirm with the Division of Health Information).
  - SC01 collected (in) and SC02 received (out) per the mapping's definition, confirmed at Step 0.
- **HM-5** **10.3 HIV tests:**
  - by kit (from the HIV algorithm's per-assay kit records, Phase 2 AL-3) × purpose (the new order field, H10);
  - IQC and EQA columns from 6.5 and 6.7;
  - inconclusive from the algorithm outcome;
  - **repeat testers** and **DNA-confirmed** entered by hand unless the HTS record holds them (Step 0).
- **HM-6** **10.4:** volume referred from To refer and referral events; average TAT and pending results entered by hand until referral tracking (Phase 4).
- **HM-7** **10.5:** tests not done here, by reason, from the availability snapshot reason on orders (equipment breakdown, reagent or supplies stock-out, power, no expertise, no equipment, confirmatory, QA retesting, other).
- **HM-8** **10.6 AMR:** entered by hand until microbiology (Phase 4).
- **HM-9** **Section 6 tracer stock:** consumed (issues in the month), days out of stock (ST-7), stock on hand at month end, quantity expired in the month.

**Lifecycle**

- **HM-10** States: `draft` → `checked` (laboratory lead) → `signed` (Health Unit In-Charge, fresh second factor) → `exported`.
  - Signing freezes a snapshot of every cell, its source counts and the mapping version.
- **HM-11** After signing, a nightly job (and every view) compares the snapshot to a fresh count. Differences show **Changed since signing** with the cells, old and new, and the records that caused them. **Prepare revision** creates revision n (draft → checked → signed). Old revisions stay.
- **HM-12** **Export:**
  - the printed form (print CSS, laid out as section 10 and section 6 rows);
  - a CSV in eHMIS data-element order (data element, category option, value, period, organisation unit code).
  - No DHIS2 push in this slice.
- **HM-13** A reminder on Quality today from the 1st to the 7th while the previous month is unsigned.

### 6.12 Reports and quality indicators (`lib/lab/indicators.ts`)

- **QI-1** Each indicator is defined in code with an id, name, formula, numerator and denominator queries, unit, the IFCC WG-LEPS code where one applies, and its source tables. Definitions are listed in the user guide.

  | Id                   | Indicator                                                     | Definition                                                                                                 |
  | -------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
  | `workload`           | Tests released                                                | Bench and bedside, by section, test, ward and priority                                                     |
  | `tat_p50`, `tat_p90` | Turnaround                                                    | Receipt to release, by section, test and priority. Downtime results use form times                         |
  | `late_pct`           | Late reports (Post-OutTime)                                   | Reports released after the lab's stated turnaround ÷ reports                                               |
  | `reject_pct`         | Specimens rejected                                            | Rejected ÷ specimens received, by reason and ward                                                          |
  | `misid_caught`       | Wrong label caught at collection                              | Phase 2 identity mismatch events                                                                           |
  | `crit_ack_in_time`   | Criticals acknowledged in the signed time (Post-InsCR family) | Critical alerts acknowledged within the signed time ÷ critical alerts; plus the median time to acknowledge |
  | `corrected_pct`      | Reports corrected after release (Post-RectRep)                | Amended reports ÷ released reports                                                                         |
  | `qc_reject_pct`      | QC runs rejected (Intra-UnIQC)                                | Rejected runs ÷ runs                                                                                       |
  | `no_iqc`             | Tests without IQC (Intra-IQC)                                 | Orderable in-house tests with no QC plan or kit rule ÷ orderable in-house tests                            |
  | `eqa_unacc`          | Unacceptable EQA results (Intra-Unac)                         | Count per year                                                                                             |
  | `no_eqa`             | Tests without EQA (Intra-EQA)                                 | Tests with no scheme and no alternative assessment ÷ tests                                                 |
  | `stockout_days`      | Stock-out days                                                | Tracer items, per item                                                                                     |
  | `downtime_h`         | Equipment downtime                                            | Hours, per machine                                                                                         |

- **QI-2** **"No data"**: a denominator of 0 or no source rows returns `no_data`, never 0 % (Law 7).
- **QI-3** Indicators are computed from source tables at read time for the current month. Closed months may be materialised nightly; the as-of time is always shown.
- **QI-4** Drill-down returns records only to lab roles. Hospital admin receives aggregates only (Law 10). Test both at the RLS level.

---

## 7. Data changes (only what GATE A approves; additive; next free migration numbers)

**Stock**

- `stock_items`.
- `stock_lots`, with the state machine and events.
- `stock_transactions` (append-only).
- `stock_counts` and `stock_count_lines`.
- `deliveries` and `delivery_lines`.
- Migrate Phase 2 `poct_lots` into `stock_lots` (E-LAB3-02), keeping ids or a mapping table.

**Acceptance**

- `acceptance_plans` (versioned, signed).
- `lot_acceptances` with `lot_comparison_pairs`.

**Lots in use**

- `lots_in_use` (analyser or bench, component, kind, lot, from, to).
- On result components: `lot_snapshot` (JSON) and `qc_status_snapshot`.

**Equipment**

- `equipment_ext` (FK to the hub machine).
- `maintenance_schedules`, `maintenance_tasks`.
- `calibration_items`, `calibration_records`.
- `temperature_points`, `temperature_readings`.
- `breakdowns`.

**QC**

- `qc_materials`, `qc_material_lots`.
- `qc_plans` (versioned, signed).
- `qc_runs`, `qc_run_values`, `qc_rule_breaks`, `qc_decisions`.
- `qc_status` (cached, one row per analyser × component).
- `kit_qc_rules`, `kit_qc_events`.
- `stain_criteria`.

**Look-back and nonconformities**

- `lookbacks`, `lookback_items`.
- `nonconformities`, `nc_actions`, `nc_links`.

**EQA**

- `eqa_schemes`, `eqa_enrolments`.
- `eqa_rounds`, `eqa_samples`, `eqa_results`.
- `eqa_reports` (file reference).
- `alt_assessments`.

**Bedside**

- `device_qc_rules`, `device_qc_ranges` (per strip lot), `device_qc_checks`.
- `competencies`.
- Device state `blocked`.

**Registers and HMIS**

- `register_configs` (versioned).
- `register_prints`.
- `hmis_form_versions`, `hmis_rows`, `hmis_cells` (with eHMIS data-element ids).
- `hmis_mappings` (versioned, signed).
- `hmis_reports` (month, revision, state, snapshot JSON, signers).
- `hmis_manual_cells` (10.4 TAT and pending, 10.6, 10.3 manual columns).

**Orders**

- `hiv_test_purpose` on HIV rapid-test order lines (restricted).

**Indicators**

- Optional `indicator_month_cache` (hospital, month, indicator, value, as of).

**Permissions**

- `lab.qc.override`.
- `lab.stock.manage`.
- `lab.eqa.manage`.
- `lab.hmis.check` (laboratory lead).
- `hmis.sign` (Health Unit In-Charge).
- `hmis.focal` (HMIS focal person, mapping co-signer).
- `poct.assess` (lab users who assess competency).

**RLS probes** for every new or changed object:

| Actor                                                                                                                                                                                                  | Access                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Lab staff, same hospital, with the permission                                                                                                                                                          | As the permission allows. Set-up and plans read-only without `lab.manage`                                 |
| Laboratory lead (`lab.manage`, `lab.qc.override`, `lab.hmis.check`)                                                                                                                                    | All of the above, override, sign plans, check the HMIS                                                    |
| Health Unit In-Charge (`hmis.sign`)                                                                                                                                                                    | Read the HMIS report and sign it; aggregates only; no patient drill-down unless they also hold a lab role |
| HMIS focal person (`hmis.focal`)                                                                                                                                                                       | Read and co-sign the mapping; read reports; aggregates only                                               |
| Nurse with `poct.record`, same hospital                                                                                                                                                                | Device checks for their ward's devices; read their own competency                                         |
| Hospital admin                                                                                                                                                                                         | Lab reports aggregates and HMIS read-only; **no patient rows**                                            |
| Clinician                                                                                                                                                                                              | The "released while QC had failed" and "to follow" lines on results they may open; nothing else here      |
| Staff of another hospital                                                                                                                                                                              | Denied                                                                                                    |
| Superadmin without break-glass                                                                                                                                                                         | Denied                                                                                                    |
| Anonymous                                                                                                                                                                                              | Denied                                                                                                    |
| Any client, direct INSERT, UPDATE or DELETE                                                                                                                                                            | Denied everywhere                                                                                         |
| Any actor, UPDATE or DELETE on `stock_transactions`, `qc_runs`, `qc_run_values`, `qc_decisions`, `kit_qc_events`, `device_qc_checks`, `temperature_readings`, `register_prints`, signed `hmis_reports` | Denied, including the service-role path                                                                   |

## 8. Server actions

The house contract applies to every write:

`'use server'` → Zod with an idempotent client key → auth (`getUser()`) → AAL2 → permission → hospital-scope check → one transaction → PII-redacted log → audit row → `{ id, serverTime }`.

Notification failures never throw.

| Group           | Actions                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stock           | `receiveDelivery` · `issueStock` · `adjustStock` · `recordCount` · `writeOff` · `setItemLevels` · `quarantineLot` · `releaseLotFromQuarantine`       |
| Acceptance      | `saveAcceptancePlan` · `signAcceptancePlan` · `recordLotComparison` · `acceptLot` · `rejectLot`                                                      |
| Lots in use     | `setLotInUse`                                                                                                                                        |
| Equipment       | `markDown` · `recordRepair` · `markBackInService` · `recordMaintenance` · `recordCalibration` · `recordTemperature` · `saveSchedule`                 |
| QC              | `saveQcPlan` · `signQcPlan` · `recordQcRun` · `decideQcRun` · `setLabTarget` · `recordKitQc` · `saveKitQcRule` · `signKitQcRule` · `overrideQcHold`  |
| Look-back       | `decideLookbackItem`                                                                                                                                 |
| Nonconformities | `openNonconformity` · `addNcAction` · `updateNcAction` · `authoriseResumption` · `closeNonconformity`                                                |
| EQA             | `saveScheme` · `enrol` · `recordRound` · `recordEqaResults` · `recordEqaScores` · `recordAltAssessment`                                              |
| Bedside quality | `saveDeviceQcRule` · `setStripLotRanges` · `recordDeviceCheck` · `recordCompetency` · `recordDeviceError`                                            |
| Register        | `saveRegisterConfig` · `printRegister`                                                                                                               |
| HMIS            | `saveHmisMapping` · `signHmisMapping` · `generateHmis105` · `saveManualCells` · `checkHmis105` · `signHmis105` · `prepareRevision` · `exportHmis105` |
| Orders          | Extend the HIV rapid-test order with `purpose`                                                                                                       |

Signing actions require a fresh second factor and refuse a signer who authored the draft's last change when a second person is available (D-LAB1-12 carries over).

---

## 9. Steps and gates

### Step 0 — Discovery and baseline (no product changes)

**Answer and report:**

- **Q1** Is `feat/lab-one-menu` merged? List the Phase 2 engines and tables present (profiles, devices, `poct_lots`, To refer, availability reasons). **If not, STOP.**
- **Q2** Confirm or correct H1–H10, each with its file, line or source.
- **Q3** **HMIS 105:** obtain the current HMIS 105 data set from the hospital's records office or the Division of Health Information:
  - a printed or scanned form, and the eHMIS data-element export;
  - **compare every Section 10 and Section 6 row** with the research transcription;
  - list the differences;
  - confirm which 10.2 rows have a positive column, and the definitions of SC01/SC02 and LV01/LV02.

  If neither the form nor the export can be obtained, STOP and flag. The mapping cannot be signed without it.

- **Q4** The eHMIS data-element and category-option ids for every cell (for the CSV).
- **Q5** **Registers:** photograph the hospital's current paper lab registers (general, chemistry, haematology, HIV, TB), with patient details covered, and list their columns. These set the default register configurations.
- **Q6** The hub's machine model: fields, status action, link to services, change events.
- **Q7** Phase 2 bedside devices and lots: the schema and the migration path into the stock ledger.
- **Q8** Rejection codes in use and their counts over 90 days; a proposed mapping to RS01–RS14.
- **Q9** HIV testing:
  - where kit names and lots are recorded per assay (Phase 2 AL-3);
  - whether the HTS record holds purpose, repeat testers and DNA confirmation.
- **Q10** The lab's current paper QC records:
  - which analytes have QC;
  - how many levels;
  - control materials in use;
  - whether targets are manufacturer or lab-established.

  This sets the go-live list of plans.

- **Q11** The lab's stock practice: stock cards, bin cards, counting frequency, the store location, NMS/JMS ordering cycle.
- **Q12** EQA schemes the lab is enrolled in, with provider names as the lab knows them. The research could not verify a scheme called "UNEQAS"; record the real names.
- **Q13** Turnaround data quality:
  - fraction of released results in 90 days with receipt and release times;
  - fraction from downtime back-entry.
- **Q14** Hospital-admin reports: the module, its access model, and where lab reports would sit.
- **Q15** Who holds the Health Unit In-Charge role at the test hospital, and how a second factor is enforced for them.
- **Q16** Print CSS and SVG chart patterns already on the branch. Whether a charting library exists (do not add one without stopping).
- **Q17** Playwright, axe and a fake-clock utility. If Playwright or axe is missing, STOP and flag.
- **Q18** A one-month **paper tally** of HMIS 105 section 10 from the test hospital for a recent month, with patient details absent. It is the "before" for the parallel run.

**Baseline:**

- Screenshots of `/lab`, result entry, the hub's machines and hospital-admin reports.
- A count, by hand or script, of what section 10 would hold for a recent month from the records alone. This shows the gap between the records and the paper tally before any mapping.
- **Failing tests** that reproduce:
  - a result released while its analyser has a recorded failed QC;
  - a bedside result from a device whose control check failed;
  - an expired lot selectable at the bedside.

  Do not fix them yet.

**STOP 0.** Report Q1–Q18, the prompt-versus-repo differences, the HMIS row comparison, the failing tests and the baseline.

### Step 1 — GATE A proposal (documents only)

Write `docs/lab/phase-3/gate-a-proposal.md`. It contains:

- annotated wireframes of every screen in Section 5, starting from the canvas;
- the lot state machine, the QC decision and hold flow, the look-back flow and the nonconformity lifecycle, each as a diagram and a table with worked examples;
- the rule library with a worked example per rule;
- **the HMIS mapping**, row by row, against the verified form (Q3), with every orderable test mapped or listed as unmapped;
- the counting rules (HM-3) with a worked example per rule;
- the register configurations from Q5;
- the schema diff, the RLS probe plan and the migration of `poct_lots`;
- **the sign-off packs** (Appendix C). They are templates pre-filled only from the lab's own current practice (Q10–Q12) and the research sources. Propose no targets, SDs, ranges or limits;
- every string in Appendix A, with its status;
- **the hazard log** (Appendix B), each hazard with its cause, effect, control, the test that proves the control, and the residual risk;
- the test plan, the rollout plan per flag (including the one-month parallel HMIS run), the user-guide outline and the ADR drafts;
- the decision table (Section 14) with a signature block.

**STOP 1.** Nothing proceeds without Fadhul's signature on the D-decisions.

### Step 2 — Data layer

- Approved migrations.
- The append-only triggers.
- The `poct_lots` migration with a reversible plan.
- The flags.
- The permissions.
- The RLS probes.

**STOP 2.** Report:

- the migration diff;
- the RLS probe table (every object × every actor);
- the append-only proofs;
- the `poct_lots` migration count check;
- the admin-aggregates-only test at the RLS level.

### Step 3 — Engines (pure, no UI)

Build Sections 6.1–6.12, with tests:

- every rule ID covered;
- the Westgard rule table tests (QR-4);
- `qcStatusFor` transitions;
- the hold refusal at the server (QH-2) and the override path (QH-4);
- look-back bias estimate and sorting (LB-2), labelled estimate;
- `evaluateLotComparison` at boundaries;
- FEFO;
- months of stock with insufficient history;
- days out of stock across a month boundary;
- `count105` on a fixture month covering every counting rule (a)–(i), with an expected-output file reviewed by a person;
- the revision diff (HM-11);
- every indicator's numerator, denominator and `no_data`;
- two-hospital fixtures for every list and count.

**STOP 3.** Report test counts, the rule coverage table and the `count105` fixture review.

### Step 4 — Stock, lots and acceptance (behind `labStock`)

Build:

- items;
- deliveries and receiving;
- the ledger;
- counts;
- levels;
- FEFO;
- quarantine;
- acceptance plans and lot comparison;
- lots in use with release snapshots;
- the Phase 2 bedside lot migration;
- grandfathering.

Scenarios:

- **S1** A 10-line delivery is received with 2 damaged packs. Only accepted quantities enter stock; the rejection is recorded against the supplier. The timed run meets the budget.
- **S2** A new creatinine reagent lot cannot be selected as the lot in use until accepted. Lot comparison within the criterion on all samples, and QC passing on the new lot, accepts it.
- **S3** A comparison with one sample outside the criterion cannot accept the lot. **Reject lot** records the reason.
- **S4** A released result snapshots the reagent, calibrator and control lots. Changing the lot in use afterwards does not change the snapshot.
- **S5** FEFO offers the earliest-expiring accepted lot first. Choosing another needs a reason.
- **S6** A lot expires at midnight. It can no longer be issued or selected at the bench or bedside. The expired-lot failing test from Step 0 now passes.
- **S7** Months of stock and quantity to maximum compute from issues. An item with 1 month of history shows "Not enough history".
- **S8** A weekly count with a discrepancy needs a reason and adjusts the ledger.
- **S9** Expected use from released tests differs from issues beyond the tolerance; the item is listed as possible wastage. Nothing blocks.
- **S10** Lots on hand at switch-on are recorded as accepted (before MedSync) with the laboratory lead's statement.

**STOP 4.** Report scenario results, screenshots against artboards 5 and 6, and the migration check.

### Step 5 — Equipment and temperature (behind `labEquipment`)

Build:

- the register extending hub machines;
- breakdowns writing hub status;
- back in service with conditions;
- maintenance;
- calibration;
- temperature readings and excursions.

Scenarios:

- **S11** Marking an analyser down sets its services to _Down · referred_ at ordering within the same request. Specimens move to To refer.
- **S12** Back in service is refused without a repair record, and refused until QC passes on every linked component after the repair. When both are met, the hub status returns and downtime hours are recorded.
- **S13** An overdue calibration shows amber and blocks nothing.
- **S14** A fridge reading out of range opens a nonconformity, notifies the laboratory lead and lists stored lots with a Quarantine suggestion. A missed reading shows "Reading not recorded".

**STOP 5.** Report scenario results and screenshots against artboard 7.

### Step 6 — Quality control, the hold, the look-back and nonconformities (behind `labQc`, then `labQcHold`)

Build:

- QC materials and lots;
- QC plans and signatures;
- run entry;
- the rule evaluator and Levey-Jennings chart;
- decisions;
- lab-target establishment;
- kit and stain QC with quarantine;
- Quality today;
- the hold at release, with override;
- the look-back;
- the nonconformity register.

`labQc` runs first, logging only. `labQcHold` is switched on per hospital after D-LAB3-27's conditions are met.

Scenarios:

- **S15** A two-level run is recorded within the budget. A 1-2s alone is accepted as a warning.
- **S16** Two consecutive level-1 runs above +2 SD break 2-2s (across runs). The run is rejected and the status becomes failed.
- **S17** R-4s across two runs is not reported; within one run it is.
- **S18** With `labQcHold` on, releasing that analyte from that analyser is refused on the server. The other components release; the doctor sees "to follow: held for quality control". The failing test from Step 0 now passes.
- **S19** An Immediate sample shows **Run on another analyser** when one has passed today.
- **S20** The laboratory lead overrides with a reason. The doctor sees "Released while QC had failed"; the result joins the look-back; the override is audited. A technologist without `lab.qc.override` cannot see the button, and the action is refused on the server.
- **S21** The look-back lists results since the last accepted run, with the estimate labelled and flag-might-change results first. "Amend" sends Phase 1 correction alerts.
- **S22** A nonconformity opened by the rejection cannot close until every look-back result has a decision, the cause is recorded, the effectiveness check is met and the laboratory lead signs.
- **S23** Resumption is refused until a run passes after the corrective action.
- **S24** A new control lot runs with the maker's range, marked provisional. After 20 accepted runs over 20 days, **Set this lab's target** creates a new plan version. No target changes otherwise.
- **S25** A new Determine lot cannot be selected until both controls give the expected result. A failed control quarantines the lot and opens a nonconformity.
- **S26** Giemsa is due each day of use. The pass criteria checklist records the result.
- **S27** A new operator triggers the syphilis rapid-test QC before their first patient test.
- **S28** `labQc` on, `labQcHold` off: failures are logged and shown, and release is not held.

**STOP 6.** Report scenario results, timing numbers, screenshots against artboards 1–4 and 9, and the rule test table.

### Step 7 — External quality assessment (behind `labEqa`)

Build:

- schemes, enrolments and rounds;
- results, scores and reports;
- coverage and alternative assessments;
- unacceptable → nonconformity with look-back.

Scenarios:

- **S29** A round is recorded, tested by a user who runs patient samples, submitted and scored from the provider's report.
- **S30** An unacceptable result opens a nonconformity with a patient look-back over the round period.
- **S31** Coverage lists tests with no scheme. Recording an alternative assessment removes a test from the list for the period.
- **S32** HIV EQA panel tests count in HMIS 10.3 under EQA, not as patient tests.

**STOP 7.** Report scenario results and screenshots against artboard 8.

### Step 8 — Bedside quality (behind `labPoctQuality`)

Build:

- device QC rules;
- strip-lot ranges;
- device checks;
- blocking;
- competency per test;
- grandfathering.

Scenarios:

- **S33** A glucometer check within the strip lot's ranges passes. A failed check blocks the device; it cannot be chosen on the bedside form (server refusal). The failing test from Step 0 now passes.
- **S34** No check today: the bedside form says "Control check not done today" and the result records it (inform mode).
- **S35** A new strip lot requires a check before the next patient result.
- **S36** A nurse whose glucose competency has lapsed cannot record bedside glucose (server refusal). The grace period works at switch-on.
- **S37** A bedside result snapshots the device-check status and the operator's competency.

**STOP 8.** Report scenario results and screenshots against artboard 10.

### Step 9 — Registers and HMIS 105 (behind `labHmis`)

Build:

- register configurations and prints (general and HIV);
- the HIV purpose on orders;
- the HMIS form version and mapping with signatures;
- `count105`;
- manual cells;
- check and sign;
- revisions;
- print and CSV.

Scenarios:

- **S38** The general register for a day prints in the configured columns, A4 landscape, with no HIV or other restricted test. The HIV register prints only for a user with HIV access.
- **S39** A downtime result back-entered later appears on the form's date, marked "entered {date}".
- **S40** The mapping cannot be signed while any orderable in-house test is unmapped, unless explicitly mapped to an Others row.
- **S41** September is generated:
  - every counting rule (a)–(i) holds on the real data;
  - QC and EQA tests are absent from 10.2 and present in 10.3 for HIV;
  - rejected specimens appear in 10.7 only;
  - bedside RDTs count in PS02 with their share shown.
- **S42** The laboratory lead checks and the In-Charge signs with a fresh second factor. The snapshot freezes.
- **S43** Two downtime RDTs for 29 September are entered on 9 October. The signed report shows "Changed since signing" with both cells and records. A revision is prepared, checked and signed. Revision 1 stays readable.
- **S44** The CSV matches the eHMIS data-element ids for every non-blank cell. Blank rows are absent from the CSV; zero rows are present as 0.
- **S45** **Parallel run.** For one full month the lab keeps its paper tally. Every row is compared, and each difference is explained (a mapping fix, a counting rule, or a paper error).

**STOP 9.** Report:

- scenario results;
- screenshots against artboards 11 and 12;
- the printed form and CSV;
- **the parallel-run comparison table**.

### Step 10 — Lab reports and quality indicators (behind `labReports`)

Build:

- the indicator engine;
- the reports page with filters, tiles, turnaround and rejections;
- drill-downs;
- CSV;
- the admin aggregates view.

Scenarios:

- **S46** Each indicator matches a hand count on a fixture month, including `no_data` cases.
- **S47** Turnaround uses form times for downtime results. A report's p90 matches a hand calculation.
- **S48** Drill-down from a tile opens the records for a lab user. Hospital admin sees the same tiles with no drill-down; a direct query for patient rows as admin is denied at the RLS level.
- **S49** Critical-acknowledgement-in-time matches Phase 1 alert events for the month.

**STOP 10.** Report scenario results and screenshots against artboard 13.

### Step 11 — Hardening and documentation

- **S50** All eight flags off at a hospital: behaviour matches the Phase 2 baseline.
- **S51** Red-scarcity tests on every new component. Nothing in this slice is red or green.
- **S52** Every append-only table refuses UPDATE and DELETE, including the service-role path.
- **S53** Signing actions refuse an author signing their own draft when a second person exists.

Then:

- the timed trials (QC run, delivery, bedside check) with two or three lab users if available;
- reduced motion;
- the performance budgets;
- the user guide, one page each for:
  - the technologist (QC run, hold, look-back);
  - the laboratory lead (plans, acceptance, nonconformities, EQA, HMIS check);
  - the store;
  - the nurse (device checks);
  - the In-Charge (signing the HMIS 105);
  - hospital admin (reports);
- the completed hazard log;
- the ADRs;
- the final report.

**STOP 11 (final).** The table in Section 13, filled in.

---

## 10. Accessibility, motion, colour

- WCAG 2.2 AA. Targets at least 44 × 44 px on touch.
- **The Levey-Jennings chart:**
  - has a text alternative naming the rules broken and the last values;
  - each point is focusable with its details;
  - a data table view of the same points is one click away;
  - the SD lines differ in dash pattern as well as colour.
- **The hold block:** `role="alert"` once, on first render; it states the reason and the next step in words.
- **Status chips** are words with icons; never colour alone.
- **Level bars** carry their number as text beside them.
- **Tables:** real headers; numbers right-aligned with tabular figures; every drill-down number is a link with an accessible name ("PS02 malaria RDTs, number done, 3,905, open the results").
- **Colour:**
  - teal for actions and focus;
  - plum or the lab hue for the active navigation item;
  - amber and dark amber for warnings, failures, holds, quarantine, lapsed, overdue and changed-since-signing;
  - sky tint for the bedside share;
  - neutral chips for passed and in stock;
  - **no red, no green.**
- **Print** (register, HMIS form): black on white, body at least 12 px, rules at least 1 px.

## 11. Performance budgets

| Measure                                     | Budget                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| `recordQcRun` with rule evaluation (server) | p95 < 300 ms                                                  |
| `qcStatusFor` at release                    | < 2 ms from the cached row; no extra round trip per component |
| Levey-Jennings data for 90 days             | p95 < 300 ms                                                  |
| `receiveDelivery`, 10 lines (server)        | p95 < 800 ms                                                  |
| `count105` for one month, one hospital      | p95 < 5 s                                                     |
| Revision diff, nightly                      | under 1 min per hospital                                      |
| Lab reports page, current month             | p95 < 2 s TTFB                                                |
| Added JS on `/lab` and the nurse workspace  | report each; flag anything above 40 KB gzipped                |

## 12. Security, privacy, audit

- AAL2 on every route here. Hospital scope on every read and write.
- **Audited** with actor, time and hospital:
  - every QC run, decision and override;
  - every lot state change;
  - every acceptance;
  - every stock transaction;
  - every equipment status change;
  - every temperature reading;
  - every nonconformity action;
  - every EQA entry;
  - every device check and competency change;
  - every register print;
  - every HMIS check, signature, revision and export.
- The HMIS export carries aggregates only. The register print carries PHI and is restricted to lab users. Restricted classes go only to class registers for users with access.
- Hospital admin, the In-Charge and the HMIS focal person see aggregates only, unless they also hold a lab role.
- The lot-comparison screen never shows patient identity.
- The governance gap stays documented: Fadhul holds the superadmin, CSO and audit-reviewer roles at once. D-LAB1-12 applies to every signature in this slice.

---

## 13. Numbers to report at the final STOP

| Metric                                                                          | Baseline | Target | Result |
| ------------------------------------------------------------------------------- | -------- | ------ | ------ |
| Results released from a failed-QC analyte without an override (hold on)         | Step 0   | 0      |        |
| Overrides, with reason and audit                                                | —        | report |        |
| Rejected QC runs with a nonconformity and a look-back                           | —        | 100 %  |        |
| Look-back results without a decision on closed nonconformities                  | —        | 0      |        |
| Lots used for patients before acceptance                                        | —        | 0      |        |
| Expired or quarantined lots selectable                                          | Step 0   | 0      |        |
| Released results without a lot snapshot (stock on)                              | all      | 0      |        |
| Machines back in service without post-repair QC                                 | —        | 0      |        |
| Bedside results from a blocked device or a lapsed operator                      | Step 0   | 0      |        |
| Orderable in-house tests unmapped in HMIS                                       | —        | 0      |        |
| HMIS rows differing from the paper tally, unexplained, after the parallel month | —        | 0      |        |
| Signed HMIS reports changed without a revision                                  | —        | 0      |        |
| Restricted-class tests on the general register                                  | —        | 0      |        |
| Patient rows visible to hospital admin                                          | —        | 0      |        |
| Indicators returning 0 where the source is empty                                | —        | 0      |        |
| Clinical numbers in code, seeds or copy                                         | —        | 0      |        |
| Hazards without a control and a test                                            | —        | 0      |        |
| Rule IDs without a test                                                         | —        | 0      |        |
| RLS probes passed                                                               | —        | 100 %  |        |
| axe serious or critical                                                         | S0       | 0      |        |
| Red or green on new routes                                                      | —        | 0      |        |

## 14. GATE A decisions (Fadhul owns; recommendations given)

| #         | Decision                     | Recommendation                                                                                                                                                                                                                                                                                          |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-LAB3-01 | QC failure and release (CSO) | Hold release of that analyte on that analyser while its latest run is rejected (ISO 15189:2022 7.3.7.2 g; SLIPTA 8.15). Override only by a holder of `lab.qc.override` with a reason; the doctor sees "Released while QC had failed"; the result joins the look-back                                    |
| D-LAB3-02 | QC not run in the window     | Inform by default ("QC not run today", recorded on the result). The laboratory lead may set "hold" per plan                                                                                                                                                                                             |
| D-LAB3-03 | Westgard rules               | Default reject set 1-3s, 2-2s, R-4s (within run only), 4-1s, 10-x; 1-2s as a warning. Editable per plan by the laboratory lead. All rules applied directly by the computer; no 1-2s gate. Sigma-based selection is a later option once TEa, bias and CV are recorded                                    |
| D-LAB3-04 | Targets and SDs              | Manufacturer's range, marked provisional, until 20 accepted runs over at least 20 days (WHO LQMS; CLSI C24 Ed4 via Westgard), then the lab's own by an explicit action creating a new plan version. No rolling recalculation                                                                            |
| D-LAB3-05 | Levels and frequency         | At least two levels for quantitative tests, each day of testing before patient samples, unless the laboratory lead's risk-based plan says otherwise (C24 is risk-based)                                                                                                                                 |
| D-LAB3-06 | Kit and stain QC triggers    | HIV rapid tests: daily or weekly, plus each new lot, new shipment and new operator (WHO 2015). Stains: each day of use, plus each new batch (WHO LQMS, MM-SOP-03C, GLI). Malaria RDTs: each new lot and shipment, plus a schedule. Each rule signed by the laboratory lead                              |
| D-LAB3-07 | Lot acceptance               | Required before patient use for every reagent, kit, control and calibrator that affects results (ISO 15189:2022 6.6.3; SLIPTA 8.13). Analyser reagents by comparison on patient samples (CLSI EP26), kits and stains by controls. Lots on hand at go-live are grandfathered with a statement            |
| D-LAB3-08 | Look-back                    | From the last accepted run to the rejected run on that analyser. The bias estimate is labelled an estimate and only sorts the list. Every result gets a decision before the nonconformity closes                                                                                                        |
| D-LAB3-09 | Stock levels                 | Minimum and maximum in months of stock per item, set by the laboratory lead; average monthly use from the last 3 months of issues; a weekly count. All operational, not clinical                                                                                                                        |
| D-LAB3-10 | HMIS Section 6 tracer stock  | Consumed = issues in the month; days out of stock = days with 0 on hand at the end of the day; stock on hand at month end; expired in the month                                                                                                                                                         |
| D-LAB3-11 | Equipment down               | Marking down sets the hub status at once and reversibly. Back in service needs a repair record and QC passed after the repair                                                                                                                                                                           |
| D-LAB3-12 | Temperature                  | Readings at the frequency set per item (operational). Out of range opens a nonconformity and suggests quarantine; it never quarantines automatically                                                                                                                                                    |
| D-LAB3-13 | EQA                          | Scores entered as the provider reports them. Unacceptable opens a nonconformity with a patient look-back. Tests without a scheme need an alternative assessment within the period the laboratory lead sets                                                                                              |
| D-LAB3-14 | Nonconformity closure        | Cause, every look-back decided, actions done, effectiveness met, the laboratory lead's signature. Nothing auto-closes                                                                                                                                                                                   |
| D-LAB3-15 | Bedside device checks        | Each day of use, each new strip lot or control vial, after a drop or error. A failed check blocks the device. Not done today informs, unless the rule says "required before use"                                                                                                                        |
| D-LAB3-16 | Bedside competency           | Required per test, assessed by the lab, valid for a period the laboratory lead sets. Lapsed operators are refused. Existing holders get a grace period at switch-on                                                                                                                                     |
| D-LAB3-17 | HMIS mapping                 | To the September 2019 print version, verified against the live eHMIS dataset at Step 0. Signed by the laboratory lead and the HMIS focal person. "Others" rows only by explicit mapping                                                                                                                 |
| D-LAB3-18 | HMIS counting rules          | HM-3 (a)–(i) as written, shown on the report, signed with the mapping                                                                                                                                                                                                                                   |
| D-LAB3-19 | Bedside tests in HMIS        | Counted in their row (they are done in this facility), with the bedside share shown                                                                                                                                                                                                                     |
| D-LAB3-20 | 10.1 lab visits              | One per patient per hospital-local day per OPD or IPD with a specimen received, by specimen type. Confirm with the Division of Health Information before signing                                                                                                                                        |
| D-LAB3-21 | HIV testing purpose          | A required field on HIV rapid-test orders (HCT, eMTCT, clinical diagnosis, SMC, verification, recency), restricted with the test                                                                                                                                                                        |
| D-LAB3-22 | Blank versus zero            | Blank for a test not on the hospital's menu; 0 for a test on the menu with none done. The CSV omits blanks and includes zeros                                                                                                                                                                           |
| D-LAB3-23 | HMIS lifecycle               | The laboratory lead checks, the In-Charge signs with a fresh second factor, the snapshot freezes, later changes produce revisions. Print and CSV only; no DHIS2 push in this slice                                                                                                                      |
| D-LAB3-24 | Daily register               | Columns configured to the hospital's current paper register (from Step 0 photographs). HIV on its own register. Other restricted classes excluded from the general register                                                                                                                             |
| D-LAB3-25 | A-LIS sites                  | All Phase 3 flags stay off; the lab keeps its QC, stock and HMIS in A-LIS (roadmap site profile)                                                                                                                                                                                                        |
| D-LAB3-26 | Who sees reports             | Lab roles drill down to records; hospital admin, the In-Charge and the HMIS focal person see aggregates only                                                                                                                                                                                            |
| D-LAB3-27 | Rollout order                | `labStock` → `labEquipment` → `labQc` (logging only, at least 20 days to establish targets) → `labQcHold` (only when every live quantitative test has a signed plan) → `labEqa` → `labPoctQuality` → `labReports` → `labHmis` (one-month parallel run with the paper tally, then the paper tally stops) |
| E-LAB3-01 | Stock                        | An append-only ledger; stock on hand derived, never edited                                                                                                                                                                                                                                              |
| E-LAB3-02 | Bedside lots                 | Phase 2 `poct_lots` migrate into the stock ledger; one store for every lot                                                                                                                                                                                                                              |
| E-LAB3-03 | QC rules                     | A pure evaluator in SD units with a rule library as data                                                                                                                                                                                                                                                |
| E-LAB3-04 | QC status                    | A cached status row per analyser × component, updated on each decision, read at release                                                                                                                                                                                                                 |
| E-LAB3-05 | HMIS                         | The form version and mapping as versioned data; `count105` pure over a snapshot; signed reports frozen                                                                                                                                                                                                  |
| E-LAB3-06 | Indicators                   | Defined in code with formulas; computed from sources; closed months may be materialised with an as-of time                                                                                                                                                                                              |
| E-LAB3-07 | Nonconformities              | A generic engine that later modules (microbiology, blood bank) reuse                                                                                                                                                                                                                                    |

## 15. Out of scope (leave clean seams)

**Roadmap Phase 4 and later:**

- analyser interfaces (QC values typed until then; plans and status are ready for interfaced values);
- referred-test tracking (10.4 TAT and pending stay manual);
- microbiology and AMR (10.6 stays manual);
- A-LIS and DHIS2 exchange (CSV only);
- blood bank (BT rows map from existing blood group tests only);
- histopathology.

**Not here:**

- supplier ordering integration with NMS or JMS (a printed order request only);
- costing and prices;
- Sigma metrics and rule selection by sigma;
- patient-based real-time QC (moving averages);
- delta checks;
- autoverification;
- HMIS 108 (inpatient), unless Step 0 finds lab rows there (then report and stop);
- staff training records beyond bedside competency;
- the mobile (Expo) app (Gate CG).

## 16. ADRs (next free numbers)

- The stock ledger, lot states and FEFO.
- Lot acceptance before use, and grandfathering.
- Lots in use and result snapshots.
- Equipment as an extension of hub machines; breakdowns writing hub status.
- QC plans, targets (provisional to lab-established), the rule library and the cached status.
- Holding release on failed QC; the override; the look-back.
- Nonconformities as a generic engine.
- EQA records, coverage and alternative assessments.
- Bedside device checks and competency.
- The daily register as a configured read model; restricted-class registers.
- HMIS 105 form version, mapping, counting rules, signing and revisions.
- Quality indicators: definitions, `no_data`, and aggregate-only access.

## 17. Definition of Done

- [ ] H1–H10 confirmed or corrected and recorded. The HMIS rows are verified against the live dataset.
- [ ] No result is released from a failed-QC analyte without a recorded override. Every rejected run has a nonconformity and a look-back, and no nonconformity closes with an undecided result.
- [ ] No lot is used for patients before acceptance. Expired and quarantined lots cannot be selected. Every result carries its lots.
- [ ] A breakdown changes what doctors see at ordering. No machine returns to service without post-repair QC.
- [ ] Bedside devices with a failed check, and lapsed operators, are refused.
- [ ] EQA rounds, scores and coverage are recorded. Unacceptable results open nonconformities.
- [ ] The daily register prints from records with no restricted test. The HIV register is separate.
- [ ] The HMIS 105 laboratory section and Section 6 tracer rows are generated, checked, signed, revised when data changes, printed and exported as CSV. The parallel month is reconciled, and the paper tally stops.
- [ ] Lab reports show turnaround and rejection by ward. Every number drills down for lab roles. "No data" is never 0. Admin sees aggregates only.
- [ ] No clinical number exists in code, seeds or copy.
- [ ] Every rule ID has a test. RLS probes are green. Append-only tables hold.
- [ ] axe clean. No red or green. Reduced motion honoured.
- [ ] S1–S53 pass. With all flags off, behaviour matches the Phase 2 baseline.
- [ ] The hazard log is complete and signed. User guides, ADRs and the final report exist. The diff on `feat/lab-quality-registers` is reviewable.

---

## Appendix A — Copy to be signed (all `draft` until signed; the CSO signs those a clinician reads)

| Key                        | Text                                                                                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hold block                 | **{Analyte} release is held.** QC on {analyser} failed at {time} ({rules}). Rerun QC after the corrective action, or run this sample on another analyser that has passed QC today.                                                                                     |
| To follow (doctor)         | {Analyte} to follow: held for quality control.                                                                                                                                                                                                                         |
| Override line (doctor)     | Released while QC had failed. The lab is reviewing this result.                                                                                                                                                                                                        |
| QC not run                 | QC not run today for {analyte} on {analyser}.                                                                                                                                                                                                                          |
| Rejected run               | **Rejected: {rules} on {level}.** {meaning}. {Analyte} results from {analyser} will be held until a run passes.                                                                                                                                                        |
| Warning run                | Warning: {rule} on {level}. The run is accepted and the warning recorded.                                                                                                                                                                                              |
| Rule meanings              | 1-3s: a large random error or a big shift is likely. 2-2s: a systematic shift is likely. R-4s: random error within this run. 4-1s: a smaller systematic shift. 10-x: a sustained shift to one side. (Wording to be checked by the laboratory lead against the source.) |
| Provisional target         | Target from the maker's range, provisional until this lab has {n} runs.                                                                                                                                                                                                |
| Look-back estimate         | Level {n} suggests results read about {bias} {unit} {high or low} (estimate).                                                                                                                                                                                          |
| Look-back sort             | Flag might change · Critical limit nearby · Flag unchanged                                                                                                                                                                                                             |
| Lot not accepted           | Lot {lot} has not been accepted yet. It cannot be used for patients.                                                                                                                                                                                                   |
| Lot quarantined            | Lot {lot} is quarantined after a failed control. It cannot be used until the laboratory lead releases it.                                                                                                                                                              |
| Use first                  | Use first: the lot that expires first is offered first at the bench and the bedside.                                                                                                                                                                                   |
| Not enough history         | Not enough history to estimate monthly use.                                                                                                                                                                                                                            |
| Machine down               | {Machine} is down since {time}. {Services} show "Referred" to doctors.                                                                                                                                                                                                 |
| Back in service conditions | Repair recorded · QC passed on every analyte after the repair                                                                                                                                                                                                          |
| Temperature out            | {Point} read {value} at {time}, outside {range}. A nonconformity is open. Check the items stored here.                                                                                                                                                                 |
| Reading missing            | Reading not recorded for {point} at {time}.                                                                                                                                                                                                                            |
| EQA tester                 | EQA samples must be tested by staff who run patient samples for this test.                                                                                                                                                                                             |
| No EQA                     | {n} of {m} tests have no EQA. Each needs an alternative check until a scheme is found.                                                                                                                                                                                 |
| Device blocked             | {Device} failed its control check at {time}. It cannot be used until a check passes.                                                                                                                                                                                   |
| Device check not done      | Control check not done today.                                                                                                                                                                                                                                          |
| Competency lapsed          | Your assessment for {test} lapsed on {date}. Ask the laboratory for reassessment.                                                                                                                                                                                      |
| HMIS counting rules        | (the HM-3 rules in plain words, as on artboard 11)                                                                                                                                                                                                                     |
| HMIS changed               | **{n} numbers changed after signing.** {reason}. The signed report is kept; a revision shows what changed.                                                                                                                                                             |
| HMIS manual                | {Section} is entered by hand until {module} is in MedSync.                                                                                                                                                                                                             |
| HMIS due                   | HMIS 105 for {month} is due on {date}.                                                                                                                                                                                                                                 |
| Register footer            | Printed from MedSync records at {time}. Results are as released; later amendments appear on the day they were made.                                                                                                                                                    |
| Register HIV               | HIV tests are on their own register and are not printed here.                                                                                                                                                                                                          |
| No data                    | No data                                                                                                                                                                                                                                                                |

## Appendix B — Hazard log seed (complete each at Step 1; close each with a test)

For each hazard: cause, effect, control built, the test that proves the control, and residual risk.

1. A result is released from an analyser whose QC has failed, and a wrong value is acted on.
2. The QC hold delays an urgent result for a patient who cannot wait.
3. The override is used routinely and the hold becomes meaningless.
4. A wrong target or SD lets a shifted method pass QC.
5. A rolling recalculation of the mean hides a slow drift.
6. Across-run rules are evaluated across a control lot change and give false alarms or misses.
7. The look-back misses results, or a result is never decided.
8. The bias estimate is taken as a correction and applied to patient results.
9. A lot that was never accepted is used for patients.
10. An expired or quarantined lot is used at the bedside.
11. Grandfathered lots at go-live hide a bad lot.
12. Stock runs out because levels or use were wrong; tests stop.
13. HMIS Section 6 misreports consumption or stock-outs.
14. A machine is down but ordering still shows "in the lab"; samples are drawn and wait.
15. A machine returns to service without QC and gives wrong results.
16. A fridge temperature excursion goes unnoticed and reagents degrade.
17. EQA samples are run by the best technologist, not routine staff, and hide a real problem.
18. An unacceptable EQA result is not acted on, or patient results are not reviewed.
19. A nonconformity is closed without a cause or effectiveness check.
20. A bedside meter that failed its control check is used.
21. An operator with lapsed competency records bedside results.
22. The HMIS mapping is wrong, and tests are miscounted, double-counted or missed.
23. QC, EQA or rejected specimens are counted as patient tests in 10.2.
24. A signed HMIS report changes silently after submission.
25. Blank and zero are confused, and the district reads "none done" as "not offered" or the reverse.
26. The daily register prints restricted-class results, or prints left on a bench expose patients.
27. Hospital admin sees patient rows through a report drill-down.
28. An indicator shows 0 % where there was no data, and a problem looks solved.
29. Turnaround is computed from entry times for downtime results and looks worse or better than true.
30. The HIV purpose field is missing or wrong, and 10.3 misreports programme activity.

## Appendix C — Sign-off packs (templates only; pre-fill only from the lab's current practice and the research sources; propose no values)

- **QC plan, per analyte per analyser.** Levels, control material and lot, frequency, reject and warn rules, target source (maker provisional, or this lab's N runs between dates), hold when not run (yes or no), laboratory lead, CSO countersign for the hold.
- **Kit and stain QC rules.** Item, triggers, controls, expected results, pass criteria (stains), required before use (yes or no), source (WHO 2015 HIV POCT; WHO LQMS; WHO MM-SOP-03C; GLI handbook), laboratory lead.
- **Acceptance plan, per item.** Method, triggers, samples and spread, criterion (absolute, percentage, which applies), QC also required, source (ISO 15189:2022 6.6.3; CLSI EP26 Ed2), laboratory lead.
- **Stock levels, per item.** Minimum and maximum in months of stock, consumption look-back, count frequency, alert windows (all operational), laboratory lead.
- **Equipment.** Maintenance schedule and calibration items from each manual, temperature ranges and reading frequency, laboratory lead.
- **EQA.** Schemes, enrolments, rounds per year, alternative-assessment period, laboratory lead.
- **Bedside.** Device check triggers, strip-lot ranges source (the vial), competency method and validity, grace period, laboratory lead.
- **HMIS mapping.** Form version, every row with its mapping and positive rule, counting rules, 10.1 definition, rejection-code map, availability-reason map, tracer items, laboratory lead and HMIS focal person.
- **Register configuration.** Columns per register from the Step 0 photographs, laboratory lead.

## Appendix D — Sources checked (13 Oct 2026; re-verify at build time)

Full notes, quotes and confidence marks are in `docs/lab/phase-3/LAB-PHASE-3-RESEARCH.md`.

- **HMIS 105 Health Unit Outpatient Monthly Report**, "Print Version September 2019", Section 10 Laboratory (pp. 25–29) and Section 6 tracer rows. The text was extracted, not checked against a printed copy. https://www.malariaconsortium.org/gallery-file/06081045-69-hmis105healthunitoutpatientmonthlyreport.pdf
- **MoH HMIS Health Unit Procedure Manual, Vol. 1 (2010)**: register and stock tool numbers; register columns not obtained. https://www.gou.go.ug/sites/default/files/media-files/THE%20HEALTH%20MANAGEMENT%20INFORMATION%20SYSTEM_0.pdf
- **A-LIS user guide v3 (June 2021)**: the HMIS105 report is auto-generated; DHIS2 upload later. https://cphl.go.ug/web/sites/default/files/2024-10/ALIS%20User%20Guide.pdf
- **CPHL Lab SPARS guide (2017)** and the HMIS tools review page. https://cphl.go.ug/web/sites/default/files/2024-10/Lab%20SPARS%20Data%20Collection%20%26%20Support%20Supervision%20Guide%2024062017.pdf · https://cphl.go.ug/node/246
- **ISO 15189:2022**: 6.4 equipment, 6.5 calibration, 6.6 reagents (6.6.3 acceptance, 6.6.4 inventory, 6.6.7 records), 7.3.7.2 IQC (g: prevent release when IQC fails), 7.3.7.3 EQA, 7.3.7.4 comparability, 7.5 nonconforming work, 8.8.2 quality indicators.
  - Full text: https://www.mofe.gov.bn/Shared%20Documents/SDT%202024/ISO%2015189;2022%20ed.4%20-%20id.76677%20Publication%20Word%20(en).pdf
  - Cross-check: SADCAS F134(c). https://sadcas.org/sites/default/files/2024-03/SADCAS_F134_%28c%29_-_Assessment_Cycle_Matrix_for_Medical_Laboratories_-_ISO_15189_-_2022_%5BIssue_1%5D.pdf
- **Westgard rules and Sigma rules.** https://www.westgard.com/westgard-rules.html · https://westgard.com/lessons/westgard-rules/westgard-rules/westgard-sigma-rules.html · https://www.westgard.com/blog/q-a-establishing-new-control-ranges-for-unassayed-chem-controls.html
- **CLSI C24 Ed4 (2016)**, risk-based QC (summary: Parvin, _J Appl Lab Med_ 2017). https://clsi.org/shop/standards/c24/ · https://academic.oup.com/jalm/article/1/5/581/5587376
- **WHO Laboratory Quality Management System handbook (2011)**: QC, Levey-Jennings (20 points over 20–30 days), inventory (FEFO, weekly counts). https://stacks.cdc.gov/view/cdc/12202/cdc_12202_DS1.pdf
- **WHO, _Improving the quality of HIV-related point-of-care testing_ (2015)**: QC daily or weekly plus new lot, shipment and operator; EQA 1–3 times a year. https://new.aidsdatahub.org/sites/default/files/resource/improving-quality-hiv-related-point-care-testing-2015.pdf
- **WHO MM-SOP-03C, Giemsa QC (2016).** https://www.who.int/docs/default-source/wpro---documents/toolkit/malaria-sop/gmp-sop-03c.pdf
- **GLI, _Laboratory diagnosis of TB by sputum microscopy_ (2013)**: new stain batch on 2 positive and 2 negative smears. https://stoptb.org/file/10502/download
- **SLIPTA checklist v3 (2023)**: sections 5 equipment, 6 assessments, 7 supplier and inventory, 8 process management, 10 nonconforming events. https://old.aslm.org/wp-content/uploads/2023/12/SLIPTA-Checklist-V3-2023.pdf
- **IFCC WG-LEPS model of quality indicators** (Sciacovelli et al., _CCLM_ 2017). https://www.degruyterbrill.com/document/doi/10.1515/cclm-2017-0412/html
- **CLSI EP26 Ed2 (2022)**, reagent lot change on patient samples. https://clsi.org/shop/standards/ep26
- **Uganda EQA:**
  - UVRI HIV proficiency panels, quarterly: https://www.uvri.go.ug/node/50
  - TB smear blinded rechecking since 2008: Nsawotebba et al., _BMC Infect Dis_ 2023.
  - Xpert proficiency testing since 2015: Kabugo et al., _PLoS ONE_ 2021. https://doaj.org/article/365bdb1af19243b899c79407cdc352ec
  - Malaria RDT proficiency panels by the national reference laboratories: https://www.cphl.go.ug/node/129
  - A scheme named "UNEQAS" was not found; confirm names at Step 0 (Q12).
