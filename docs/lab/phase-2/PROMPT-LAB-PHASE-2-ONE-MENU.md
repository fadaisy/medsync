# PROMPT: Lab Phase 2 — one menu, one record (test menu, catalogue v2, payment, collection checks, live bench, bedside tests, NCD feed, high-risk warning)

> **For Claude Code.** Work at the repo root on a new branch, `feat/lab-one-menu`. Cut it from the branch where `feat/lab-safety-floor` (lab Phase 1) has merged.
>
> - **If Phase 1 has not merged, STOP at Step 0.** This slice builds on Phase 1's units, component versions, range store, snapshots, critical-alert engine and lab navigation.
> - First, copy into `docs/lab/phase-2/`:
>   - this prompt;
>   - the research file `lab-catalogue-research.v1.json`;
>   - its notes, `LAB-CATALOGUE-RESEARCH-NOTES.md`.
>
> **Mode: gated.** There are eleven steps, numbered 0–10, and each ends in a **STOP**.
> - **Documents** follow Stage 1: draft, critique against the checklist, revise (at most two passes), present, STOP.
> - **Code** follows Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
> - Self-refinement never replaces a real check.
>
> **Assume nothing in this slice is built.** Section 3 lists what earlier reads claimed. Verify every line. Build what Step 0 proves is missing, and reuse what it proves exists.
>
> **The CSO is Fadhul.** Nothing in this slice reaches a production hospital without his signature on:
> - every decision scheme and every flag basis;
> - the elevation setting;
> - the restricted class on each test;
> - the eGFR reference;
> - the high-risk warning wording;
> - the HIV testing algorithm configuration;
> - every string a clinician, collector or cashier reads in Appendix A;
> - the hazard log (Section 14, Appendices A–C).

---

## 0. What we are building, in one paragraph

Today doctors order from one list while the hospital's services hub knows another. Nobody learns that an analyser is down until a sample has already been drawn. The NCD registry asks clinicians to retype HbA1c values the lab has already released. A bedside glucose lives in a nursing note, not beside the lab glucose. Nothing checks that the tube in a nurse's hand belongs to the patient in the bed.

This slice connects the lab to ordering, the bedside and chronic care:

- **One menu.** Each orderable test is linked to its service. What the lab can do today shows before the order, and the same status drives the worklist.
- **A catalogue that can hold the truth.** The researched concepts and analyser profiles come in. Methods are declared. Diagnostic cut-offs are held as signed **decision schemes**, separate from reference intervals, and each hospital chooses per result which one flags it.
- **Payment status on the order.** It never holds an emergency.
- **A label check at collection**, so the tube proves which patient it belongs to.
- **A live bench:** scan to receive, and new specimens appear without a refresh.
- **The clinical question travels with the tube.** The chart stays private unless it is opened.
- **A high-risk specimen warning** follows the tube everywhere.
- **Bedside tests** are recorded with the device, the lot and the operator.
- **The NCD visit fills itself** from released results.

**Done when:**
- doctors order from one menu;
- an in-house HbA1c is never typed into the NCD registry;
- a bedside glucose shows on the same results list as a lab glucose;
- no specimen is marked collected without a label check where the check is on;
- no emergency order has been held for payment.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt, the roadmap and the canvas. Report every disagreement at STOP 0.
2. **The plan.** The *MedSync Laboratory Roadmap*, version 2, section "Phase 2: One menu, one record" (https://claude.ai/artifact/SQPdW66RcaAnu3QWQTYVTw).
3. **The catalogue research.** `docs/lab/phase-2/lab-catalogue-research.v1.json` and its notes. The product owner accepted CD-01 to CD-09 on 12 Oct 2026, and LD-02 as the default proposed to the lab lead and the CSO. The other LD items are recommendations awaiting their signatures.
4. **The UI reference.** The design canvas *Lab Phase 2 UI Preview* (https://claude.ai/artifact/LQqsGKR9Rk4fGBRAN3NW4k). It has artboards 1–14, and Section 5 names the artboard for each screen.
   - It is drawn in MedSync Chroma. Build with the design system in force on this branch (Law 15).
   - Every patient, range, cut-off, price, elevation, device, lot and code on it is **an example, not a signed value**. Copy none of them into code or seeds.
   - Where this prompt and the canvas differ, this prompt wins. The known differences are in 5.15.
5. **The Phase 1 canvas** (https://claude.ai/artifact/HUw8JeHp5qin66iZ8hC3Kv) for the screens this slice extends: result entry, the catalogue and ranges.
6. **Design documents and ADRs:**
   - `DESIGN-medsync.md`;
   - HARMONISATION §9 (the nullable offering code on `test_catalogue`);
   - the hub's design notes ("informs, never blocks"; the stated turnaround is the facility's operational figure);
   - the Phase 0 and Phase 1 lab ADRs;
   - ADR 0097 (plum = place).
7. **Prompts this builds on.** Read the copies under `docs/`.
   - `PROMPT-LAB-PHASE-1.md`: units UN-*, ranges RR-*, flags FL-*, criticals CM-*/CA-*, the house action contract, the red-scarcity law and its amendment D-LAB1-18.
   - `PROMPT-LAB-PHASE-0.md`: permissions, the navigation registry, the worklist ordering rule LW-7.
   - `PROMPT-HOSPITAL-SERVICES-HUB.md`: offerings, statuses, hours, machine status, section, the four-eyes mechanism, print CSS.
   - `PROMPT-CLERKING-DESK-V2.md` and `PROMPT-CLERKING-EXAM-V2.md`:
     - the working diagnosis;
     - the fever-with-bleeding rule and `outbreak_mode`;
     - signed `REF-*` references ("a rule whose reference is unsigned does not fire");
     - restricted classes;
     - the identity reveal and its audit.
   - `PROMPT-RESUS-DESK-V2.md`: orders proposed from the resus desk, and their source marker.
   - `PROMPT-NCDSYNC-BUILD-v2.md` and `HANDBACK-NCD-DIABETES.md`: the registry's visit fields, the diabetes pack reading results, the hazard log pattern.
   - `PROMPT-DOCTOR-WORKSPACE-UNIFIED.md`: lanes, review, live updates (E2).
8. **Code to read:**
   - `app/lab/**`, `app/doctor/**`, `app/nurse/**` (or wherever collection happens), `app/ncd/**`;
   - the cashier or reception surfaces;
   - `lib/lab/**`, `lib/emr/**`, `lib/ncd/**`;
   - the hub module and the clerking desk rules;
   - `test_catalogue` and the component versions from Phase 1;
   - the realtime setup;
   - `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

1. **Engine-first.** Every surface reads or writes an engine with real tables, real RLS policies and passing tests. The engine is built in an earlier step than the surface.

2. **One store per fact.**
   - Availability, hours, section and machine status live in the hub. The menu reads them and never copies them.
   - Units and component versions live in the Phase 1 catalogue.
   - Payment lives on the order.
   - The NCD registry reads lab results. It never holds a copy that can drift.

3. **No remembered numbers.** This covers:
   - reference intervals;
   - decision cut-offs;
   - category boundaries;
   - the altitude adjustment table;
   - the eGFR constants;
   - NCD look-back windows;
   - the HIV algorithm.

   All of them come only from signed, versioned, sourced data. An unsigned scheme never flags.

   The research JSON is the only permitted seed for clinical values, and it lands as **drafts**. Test fixtures use invented values, named as fixtures.

4. **The record keeps what was true.** Each result snapshots:
   - its flag basis (reference band or scheme, with id and version);
   - the category it fell into;
   - every adjustment applied (elevation, pregnancy context);
   - the analyser profile and method;
   - the availability shown when it was ordered;
   - the payment state at collection;
   - the identity check.

   Later changes never rewrite a released result.

5. **Informs, never blocks care.**
   - Availability, payment status and a missing range inform. They never stop a clinician treating.
   - **An Immediate order, or one raised from the resus desk, is never held for payment.**
   - The only hard stops protect the record:
     - no "collected" without a matching label where the check is on;
     - no bedside result from an expired or unregistered lot or device;
     - no ordering a test that is not linked to a service, or that the hub says is not offered here;
     - Phase 1's stops.

6. **No bench conversion.** Phase 1's UN-4 stands: a bench result is entered in the component's unit. A plain-factor conversion is accepted **only** for an outside result typed into the NCD registry, and the original value and unit are kept. Affine conversions (HbA1c IFCC) are display-only.

7. **Bedside is labelled, never silently diagnostic.** A bedside result always carries its tag, device, lot and operator. A decision scheme applies to it only if the scheme names the bedside method explicitly.

8. **Fail loud.**
   - An availability the system cannot determine reads *"Not known today"*, never "available".
   - A realtime channel that drops falls back to polling, and the worklist says so.
   - An NCD field with no usable result says why.

9. **Restricted classes stay restricted** (`hiv`, `tb`, `mental_health`, `sexual_reproductive_health`):
   - the cashier sees a count, never a name;
   - a working diagnosis in a restricted class is masked for viewers without access;
   - the NCD feed and the realtime payloads carry no restricted content.

10. **Read is recorded.** Opening the clerking working diagnosis from the lab writes an access event, as the identity reveal does. The clinical question typed on the order is part of the order, and reading it is not separately audited.

11. **No treatment advice.** A category is the name from the signed scheme ("Moderate anaemia", "G3b"). It never gives a dose, a drug or an instruction.

12. **Red is a safety property.**
    - The high-risk specimen warning is **amber**, with a bordered block, an icon and strong words. It is never red.
    - A flagged category uses the existing out-of-range value style with an arrow or the word.
    - Payment states, availability and workflow states are neutral chips. Awaiting payment and "Not linked" are amber with an icon.
    - Extend the red-scarcity tests to every new component.

13. **Two identifiers everywhere** a patient appears: the collection screen, the cashier, the label, the request form, the worklist, the bedside form and the NCD visit.

14. **No PHI in realtime payloads, logs, URLs, analytics or prices.** The live worklist channel carries ids and event names only.

15. **Behind flags, stack as found.**
    - There are eight per-hospital flags, all off by default: `labCatalogueV2`, `labOneMenu`, `labPayment`, `labCollectionCheck`, `labBench`, `labHighRiskWarning`, `labBedside`, `ncdLabFeed`.
    - With all eight off, behaviour matches the Phase 1 baseline.
    - Use the ORM, package manager, flag mechanism and tokens on the branch.
    - TypeScript strict, no `any`. Zod on every action. AAL2.
    - No new dependencies without stopping to flag them.
    - Tokens only, no hex. Chroma arrives through its own branch (D-CV-11).

16. **en-GB.** The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU) wherever copy mentions it. Dates show as `12 OCT 2026`.

---

## 3. What earlier reads claimed (verify every line at Step 0)

| # | Claim | Where | Severity |
|---|---|---|---|
| G1 | Two menus exist. Doctors order from the EMR `test_catalogue` (44 tests). The hub's diagnostic offerings (in-house, referred, not offered, hours, machine down) are read by nothing | `test_catalogue`, hub | Delay, wasted samples |
| G2 | HARMONISATION §9 already calls for a nullable offering code on `test_catalogue` | docs | Context |
| G3 | No payment status exists anywhere in MedSync | — | Adoption at PNFP and private sites |
| G4 | The label number prints. No check at collection, no scan to receive | labels, `/lab` | **Safety: wrong-patient sample** |
| G5 | Realtime broadcasts on `chart:<patient>` only (migration 0073). The worklist refreshes on action. Phase 1 added a per-user alert channel | realtime | Bench delay |
| G6 | The clerking desk holds a working diagnosis and a fever-with-bleeding rule used with `outbreak_mode` | clerking desk | **Safety: lab exposure** |
| G7 | The NCD registry has HbA1c typed in by hand. The diabetes pack in the clerking desk reads results itself | `/ncd`, clerking | Transcription error |
| G8 | The specimen path assumes a tube and a bench. There is no bedside result path | `lib/emr/**` | Bedside results lost |
| G9 | Resus-desk orders carry a source marker | resus desk | Emergency detection |
| G10 | Phase 1 delivered: component versions with fixed UCUM units, the range store and resolver, snapshots, the critical-alert engine, the catalogue and ranges set-up | `lib/lab/**` | Dependency |
| G11 | There is no phlebotomy role. Nurses or doctors collect | roles | Context |
| G12 | Pregnancy status and gestation are recorded somewhere: the clerking desk, an ANC record or the encounter | clerking, maternity | Needed for the Hb scheme |
| G13 | The hospital record has no elevation field | hospital settings | Needed for the Hb scheme |

---

## 4. Design direction

**Eight rules**
1. **One menu, one truth.** Whatever the doctor sees when ordering is exactly what the lab's worklist and the hub say.
2. **Say it before the needle.** "Analyser down, will be referred, about 2 days" shows at ordering, not after the sample is drawn.
3. **Emergencies are never held.** No setting, role or state can hold an Immediate or resus order for payment.
4. **The tube proves who it belongs to.** Scan or type the label against the patient before "collected" exists.
5. **Scan, don't search.** A USB scanner, acting as a keyboard, receives a specimen in one action.
6. **The question travels; the chart stays private.** The order's clinical question is on the request. The working diagnosis opens on demand and is recorded.
7. **Bedside is first-class, and labelled.** Same list, same review, its own tag, its own provenance.
8. **Type a result once in the whole hospital.** If the lab released it, no clinician retypes it.

**Budgets** (measured at Step 0 where a baseline exists; met by Step 10)

| Measure | Budget |
|---|---|
| Scan to "Received", one action, server | p95 ≤ 1 s |
| Collector taps from "label scanned" to "collected" | ≤ 2 |
| New specimen visible on an open worklist | ≤ 5 s realtime, ≤ 15 s polling |
| Ordering search, keystroke to results | p95 ≤ 150 ms (client) |
| Recording a bedside glucose in the timed trial | median ≤ 45 s |
| NCD fields typed by hand when an in-house result exists | 0 |
| Immediate or resus orders ever held for payment | 0 |
| Specimens marked collected without a matching check (flag on) | 0 |
| Research-use analyser parameters released | 0 |

---

## 5. Interface specification

### 5.1 Ordering from one menu (artboard 1)
- The existing order sheet, the clerking Plan basket and the resus proposals all read one availability engine (6.6). Do not build a fourth ordering surface.
- **Search** matches test names and synonyms. Each result shows **Today at this hospital**:

  | State | Shown as | Orderable? |
  |---|---|---|
  | In the lab here | *In the lab here · {hours} · usually {turnaround}* | Yes |
  | Referred | *Will be referred, result in about {n}* (amber) | Yes |
  | Analyser or machine down, referred | *Analyser down since {time}. Will be referred, result in about {n}* (amber) | Yes |
  | Outside hours | *Done from {time}* | Yes |
  | Not offered | *Not offered at {hospital}* | **No.** No Add button |
  | Not linked to a service | Hidden from doctors. Shown to the lab in set-up | No |
  | Unknown | *Not known today* | Yes |

- **Bedside alternative.** Where a bedside test exists for the same concept on this ward, a line links to the bedside form (5.7).
- **The basket** lists each test with its availability as captured, a priority (Routine · Urgent · Immediate) and **Clinical question for the lab**:
  - optional, at most 280 characters;
  - **Insert working diagnosis** copies the current working diagnosis from the clerking desk, unless it is in a restricted class the order's own tests do not share (D-LAB2-07).
- **Payment line.** Shown only when `labPayment` is on and the hospital collects before the sample (D-LAB2-02), with the never-held rule in words.
- Placing the order snapshots each test's availability on the order line (OM-6).

### 5.2 Collection: payment, identity, high-risk (artboard 2)
- The collector's list shows patient (two identifiers), tests, priority, **Payment** and the high-risk tag.
- **Payment chips:** Paid · R-…, Insured, Waived, Emergency · not held (all neutral); Awaiting payment (amber with clock); hidden when payment is not collected at this hospital.
- **Awaiting payment** under `inform` mode (the default): the collector may collect after recording a reason, "Clinician asked to proceed" or other text. Under `hold` mode: **Mark collected** is unavailable until a payment state is recorded. **Emergency orders are never held in either mode.**
- **High-risk block** (amber, bordered, icon) above the panel: *"High-risk specimen: suspected viral haemorrhagic fever. Follow this hospital's high-risk specimen procedure before you collect or handle these tubes."*, with **Open the procedure** (the link from settings, 5.14) and its source and time.
- **Identity check** (when `labCollectionCheck` is on):
  - **Scan or type the label on the tube.**
  - A match shows a teal confirmation with both identifiers and the test.
  - A mismatch shows an amber block naming the other patient (two identifiers) and *"Do not use this tube. Print a new label."*, and **Mark collected stays disabled**.
  - There is no override for a mismatch (D-LAB2-04).
- **Wristband checked** checkbox, recorded.
- **Buttons:** Reprint label · **Mark collected**.

### 5.3 Cashier (artboard 3)
- A new surface for users with `lab.payment.record`, reached from the cashier or reception navigation.
- It lists **lab orders awaiting payment**: patient (two identifiers), order number, tests, ordered at and from where.
  - **Restricted tests are counted, never named:** *"Full blood count, and 1 restricted test"*.
  - Emergencies are never listed.
- **Record payment:** Paid (receipt number) · Insured (insurer, authorisation number) · Waived (reason, approver from a staff search).
- No prices. MedSync does not hold them in this slice (the billing seam, Section 15).
- The cashier sees no results, no clinical question and no working diagnosis.

### 5.4 Label and request form (artboard 4)
- The existing label (Phase 0/1 print CSS) gains a **HIGH-RISK SPECIMEN** box when the order carries the warning. Black on white, legible in greyscale, at least 12 px body text on the form.
- The request form gains:
  - the clinical question;
  - the payment state;
  - the high-risk box at the top, in black;
  - **Label checked against wristband ☐**;
  - a lab-use row with *Procedure followed ☐*.
- No PDF dependency.

### 5.5 Live worklist and scan to receive (artboard 5)
- **Scan field** at the top of the worklist:
  - focused on load;
  - a keyboard-wedge scanner types the number and Enter;
  - one action receives the specimen (6.9).
- The last receipt is shown in a polite live region with **Undo** (SR-5).
- **Live indicator:** *"Live · new specimens appear by themselves"*. If the channel drops: *"Live updates paused. Refreshing every 15 seconds."* (amber).
- **Columns:** Patient · Test and clinical question · From · Priority · Payment · Stage · Waiting · action. Order follows LW-7 (priority first) unchanged.
- A row with the high-risk warning shows the **High-risk specimen** tag, and its action is **Open procedure** until the receiver confirms *Procedure followed*.
- A new navigation item, **To refer**, lists specimens for tests the hub marks as referred today. It is a list only; the send-out flow is Phase 4.
- **Find a specimen** (sidebar) searches by label number, order number or MRN.

### 5.6 Result entry: analyser profile, flag basis, clinical question (artboard 6)
- The page header shows the **analyser profile** chip (6.2).
- Rows come from the profile:
  - clinician-visible rows first;
  - then a collapsed line, *"{n} more shown to clinicians"*;
  - then *"{n} kept for the lab only"* (eye-off icon);
  - the footer line *"The analyser's research-use parameters are never imported or released."*
- **Flagged against** replaces the Phase 1 "Reference range" column:
  - for a reference basis, the band (`3.2 – 9.0`);
  - for a scheme, the scheme name and the population it applied (*"WHO 2024, non-pregnant women, adjusted for 1,200 m"*).
- **Flag:** High/Low/In range for references; the **category label** for schemes, with an arrow when the category is abnormal.
- An information line under the table states the basis whenever a scheme flags: *"{result} is flagged against {scheme} at this hospital. The lab's reference interval, {band}, is shown to the doctor for information."*
- **Pregnancy context:** shown in the identity bar from the record (*"not pregnant (recorded 09:41)"*, *"pregnant, 22 weeks"* or *"pregnancy not recorded"*).
- **Clinical question card** (right):
  - *From the order* (the text) and *Ordered by*;
  - then **Show the working diagnosis**, which reveals the clerking desk's current working diagnosis, its source and time;
  - each reveal is an audited event, and the card states it;
  - a restricted-class diagnosis is masked for a viewer without access: *"A diagnosis is recorded that you do not have access to."*
- **This specimen** card: payment, identity at collection (how and when), analyser and bench.

### 5.7 Bedside tests (artboard 7)
- Reached from a ward patient (nurse workspace), the doctor's patient page, and the "Also at the bedside" link at ordering.
- Users with `poct.record` only (D-LAB2-09).
- **Test:** a segmented choice of the bedside tests registered for this ward.
- **Context questions per test.** Glucose asks *"When did the patient last eat?"* (Fasting, 8 hours or more · Not fasting, or not sure). This chooses `obs.glucose_fasting` or `obs.glucose`.
- **Device**, from registered devices on this ward or hospital-wide, and **strip or kit lot**, from current lots with use-by dates.
  - An expired lot shows an amber block, and **Save is disabled** (PC-3).
  - A device in state "Not verified yet" cannot be chosen (D-LAB2-11).
- **Result:**
  - a quantity uses the component's locked unit;
  - a coded answer set uses buttons (malaria RDT lines, dipstick pads);
  - **meter-range codes are first-class:** *Above the meter's range* (HI) and *Below the meter's range* (LO) are answers, never typed numbers (PC-6).
- **Measured at** defaults to now. It may be up to 24 hours earlier with a reason, and never in the future.
- **Interpretation.** If no signed scheme applies to the bedside method: *"Not for diagnosis. The diabetes thresholds signed at this hospital apply to laboratory plasma glucose, so a glucometer reading gets no category."* (wording per test, Appendix A).
- **Mark critical** is available as in Phase 1. A bedside critical goes through the Phase 1 alert engine with source `bedside` (PC-9).
- **How the doctor sees it** preview: value, unit, **Bedside** tag, device, lot, operator, time.

### 5.8 Results lists and reports (artboard 8)
- Doctor lanes, `/doctor/results`, the patient chart and printed reports show:
  - bedside and lab results **in one list**, with the **Bedside** tag on bedside rows;
  - for scheme-flagged results, the category beside the value (*"HbA1c 8.1 % · Diabetes range"*);
  - for eGFR, the value, the category from its scheme (*"G3b"*), the source line, and the signed caveat *"eGFR assumes creatinine is stable. It is not valid in acute kidney injury."*;
  - the **previous value** of the same concept with its date (read-only; delta checks are Phase 5).
- Bedside results are reviewed and acknowledged with the existing action.

### 5.9 NCD visit filled from released results (artboard 9)
- Behind `ncdLabFeed`. The registry's lab fields (HbA1c, eGFR, fasting glucose, lipids, UACR and any others the registry defines) are filled by the feed (6.14).
- **Each row** shows the field, the value and unit, **where it came from** (lab or bedside, release time, calculated-from line for eGFR), the previous value, and a **Filled** chip.
- **A filled value cannot be typed over.** Footer: *"To correct it, the lab amends the result."*
- **No usable result:** *"No result in the last {window}"*, with **Order** (opens the order sheet with the test in the basket) and **Outside result**.
- **Outside result** panel:
  - value;
  - **unit as printed** (from the concept's accepted units);
  - date of the test;
  - laboratory name (required).
  - It shows the converted value in the canonical unit and keeps the original (NF-7). It is labelled *Outside result* everywhere and never counts in lab reports.
- **A result in another unit** is listed under the row as *"{value} {unit} on {date} could not be used: unit differs"*, never silently dropped.

### 5.10 Set-up: the test menu (artboard 10)
- This replaces "Test catalogue" in the lab Set-up navigation. Phase 1's measurement panel (unit, decimals, LOINC, entry check, versions) stays and is reached from each row.
- **Table:** Test · Today (from the hub) · Bedside · Restricted. Filters: All · Not linked · Bedside · Restricted. A header chip counts tests that cannot be ordered yet.
- **Panel:**
  - **Service** (pick the hub offering);
  - read-only Today, Hours and Turnaround from the hub;
  - **Method** (from the method register: enzymatic, Jaffe compensated, Jaffe uncompensated, and others per concept);
  - **Traceable to IDMS**;
  - **Report eGFR with each adult result** (creatinine only);
  - **Restricted class**, which needs the CSO's signature to change.
- Section, hours and status are never edited here (Law 2).

### 5.11 Set-up: analyser profiles (artboard 11)
- Profile cards: model, bench, kind (5-part, 3-part, chemistry, other), count of parameters.
- **Mapping table:**
  - On the analyser (code) · Result in MedSync (concept, component version) · Unit · **Who sees it** (Clinicians and lab · Lab only · Never released);
  - research-use codes appear once as a locked **Never released** row and cannot be mapped.
  - Amber notes flag what still needs confirming (*"Measured or calculated? Confirm in the manual"*, *"Unit to confirm on the printed report"*).
- **Before this profile is used:**
  - every reportable parameter mapped;
  - open confirmations resolved;
  - reference ranges verified on this analyser.

  **Use this profile** opens only when all three are done.
- A side card explains that MID and GRAN are never neutrophils.

### 5.12 Set-up: ranges and cut-offs (artboard 12)
- This renames "Reference ranges" to **Ranges and cut-offs**. The Phase 1 band editor is reached for reference intervals.
- **What flags {result}:** two choices, **Reference interval** or **Decision cut-offs: {scheme}**. This is the flag basis, signed with the scheme.
- **The scheme table:**
  - Applies to (sex, age band, context: not pregnant, trimester 1/2/3, fasting) · category columns with boundaries;
  - "below" or "from" wording per scheme;
  - gaps listed in amber (*"Children, 6 months to 14 y: not loaded. Children are flagged on the reference interval."*).
- **Adjustments and limits:**
  - altitude, from the signed elevation setting, with the rule in words;
  - the pregnancy source;
  - **Results from**: lab analysers and/or bedside methods (Law 7);
  - the ages not covered.
- **Sign-off:** the laboratory lead and the CSO, each with a fresh second factor. Until both sign, the previous basis stays in force, and the card says which.

### 5.13 Set-up: research drafts (artboard 13)
- Three summary cards:
  - **{n} new results to add** (the concept addendum, with **Review the addendum**);
  - **{n} range and cut-off drafts**;
  - **Not imported**: kit-specific tests, which the lab enters from its own insert.
- **Table:** Result · Kind (Reference, Cut-offs) · Source · Confidence · State.
- **States:** Ready to review · Two sources disagree (amber) · Check needed (amber, from `band.verification`) · No band ("No range for this age").
- **Panel for a draft with a verification problem:** the problem in an amber block; *What you found* (matches, or corrected); *Page or table checked*. **Record the check** clears the blocker and is audited. Until then, **Send for sign-off** is unavailable for that draft.
- Every band shows its source, table or page, population, method and confidence reason.

### 5.14 Set-up: lab settings (artboard 14)
- **Payment before the sample:**
  - on or off;
  - mode `inform` or `hold` (D-LAB2-02);
  - recorded by (cashier role);
  - ways to pay;
  - **Never held** as a fixed line that cannot be edited.
- **Bedside devices and kits:** device or kit · test · where · current lot with use-by · state (In use · Not verified yet · Retired). **Add**, plus a lot editor.
- **Hospital elevation:**
  - metres, and where the figure comes from;
  - a change needs the CSO's signature, and the signed date is shown;
  - empty means no altitude adjustment, stated in the scheme (DS-7).
- **High-risk specimen procedure:** a link or document title shown with every warning. Owned by the laboratory and the infection prevention lead.

### 5.15 Navigation, flags and known differences
- **Lab navigation after this slice:**
  - Worklist · Criticals · Released today · **To refer** · Rejected · Downtime entry;
  - then **Set-up:** **Test menu** · **Analyser profiles** · **Ranges and cut-offs** · Critical limits · **Research drafts** · **Lab settings**.
  - Each item appears only when its flag is on and the viewer holds the permission.
- **Flags:**

  | Flag | Covers |
  |---|---|
  | `labCatalogueV2` | 5.6 profile and basis, 5.8 categories, 5.10 method fields, 5.11–5.14 except payment |
  | `labOneMenu` | 5.1, 5.10 service link, To refer |
  | `labPayment` | 5.2 payment, 5.3, 5.14 payment |
  | `labCollectionCheck` | 5.2 identity, 5.4 checkbox |
  | `labBench` | 5.5, 5.6 clinical question |
  | `labHighRiskWarning` | 5.2 block, 5.4 box, 5.5 tag, 5.14 procedure |
  | `labBedside` | 5.7, 5.8 bedside rows, 5.14 devices |
  | `ncdLabFeed` | 5.9 |

- **Differences from the canvas, where this prompt wins:**
  - the canvas shows the ordering surface as one page; build it into the existing order sheet, Plan basket and resus proposals;
  - the "Insert working diagnosis" button is not drawn;
  - the "Live updates paused" state is not drawn;
  - "Find a specimen" has no artboard;
  - the canvas's ordering board shows Creatinine as referred while artboard 8 shows a creatinine released in-house for another patient; both are examples;
  - the 3-part profile's mapping table is not drawn;
  - the outside-result panel shows mg/g; the accepted units per concept come from the concept's `otherUnits`, never from the canvas.

---

## 6. Engines (pure, no I/O unless stated; every rule has an ID and at least one test)

### 6.1 Catalogue v2 (`lib/lab/catalogue.ts`, extended)

**Concepts and the addendum**
- **CC-1** The research file's `concepts[]` becomes a **concept addendum** in the existing concept store, as drafts.
  - Existing ids are kept unchanged (`obs.chol_total`, `obs.urine_leukocytes_dipstick` and the others).
  - New ids are added as listed.
  - The addendum is signed once by the laboratory lead and the CSO. Nothing in it is orderable until signed.
- **CC-2** Each concept carries:
  - `valueType` (quantity, coded, ordinal, text);
  - canonical unit (quantities);
  - accepted `otherUnits` with a plain `multiplyBy` or, for affine relations, a `formula` (display-only, Law 6);
  - coded `answers[]` with `abnormal`;
  - `role` (core, supplementary, flag_only);
  - `measurement` (measured, analyser-derived, calculated);
  - LOINC (verified or not; alternatives).
- **CC-3** **Fasting glucose** is its own concept, `obs.glucose_fasting`, used by `test.glucose_fasting` and by the bedside fasting answer. Results recorded before this slice under `obs.glucose` on a fasting test keep their concept, and are shown with *"recorded before fasting glucose had its own result"*.
- **CC-4** **Troponin** splits into `obs.troponin_i_hs` and `obs.troponin_t_hs`:
  - `obs.troponin` is retired for new results; old results keep it.
  - Each hospital enables the one its assay measures.
- **CC-5** **D-dimer** becomes FEU with the unit `mg/L{FEU}`; a separate `obs.d_dimer_ddu` (`mg/L{DDU}`) is used for analysers that report DDU. **They are never converted into each other.** If the existing unit is plain `mg/L`, Step 0 reports how many results exist. Those results keep their unit and are marked *"basis not recorded"*.
- **CC-6** **Blood group:** `obs.blood_group` holds ABO only; RhD moves to `obs.rhd_type`. Old combined results keep their concept.
- **CC-7** **Test splits:**
  - `test.syphilis` becomes the treponemal rapid test only;
  - add `test.rpr`, `test.tpha` and `test.dual_hiv_syphilis_rdt`;
  - add `test.coag_screen` (PT, INR, APTT).

  The dual RDT's HIV line feeds the HIV algorithm (AL-*) and never sets a final HIV status alone.
- **CC-8** **Restricted class per test** (signed by the CSO):
  - hiv: `test.hiv_rapid`, `test.hiv_viral_load`, `test.cd4`, `test.dual_hiv_syphilis_rdt`;
  - tb: `test.tb_xpert`, `test.tb_lam`, `test.sputum_afb`;
  - sexual_reproductive_health: `test.syphilis`, `test.rpr`, `test.tpha`, `test.pregnancy_urine`.
  - CrAg is not restricted.
  - The class propagates to every result of the test.
- **CC-9** **HbA1c IFCC** is a display value computed from the NGSP %. The formula and its constants come from a signed `REF-HBA1C-IFCC` entry (source NGSP), shown to 0 dp. It is never stored as a result.
- **CC-10** A coded answer's `abnormal` drives the abnormal marker for coded results. Coded results are still never auto-flagged critical (Phase 1 FL-7).

**HIV testing algorithm (configuration, signed)**
- **AL-1** The national serial algorithm is a **versioned configuration**: the ordered assays (kit names), the rule table from per-assay results to the outcome, and the retest interval. Each version has an in-force-from date and two signatures.
- **AL-2** `deriveHivOutcome(version, t1, t2, t3?)` is pure and table-tested on every path: negative; positive; inconclusive and retest; second inconclusive and refer; discrepant.
- **AL-3** Each test event records the kit name and lot per assay, and the algorithm version used.
- **AL-4** The outcome stored on `obs.hiv_test` names the version. A later version never re-derives an old result.

### 6.2 Analyser profiles (`lib/lab/profiles.ts`)
- **AP-1** A profile is data: model, bench, kind, and a mapping of analyser code → concept and component version → visibility (`clinician`, `lab_only`, `never`).
- **AP-2** Research-use codes are held in a per-model blocklist with `never` and cannot be mapped to a component. Test: mapping one is refused.
- **AP-3** **MID** and **GRAN** map only to `obs.mid_*` and `obs.granulocytes_*`. A mapping of a 3-part code to a 5-part concept, or the reverse, is refused. Test it.
- **AP-4** A profile can be used only when:
  - every reportable code is mapped;
  - its open confirmations are resolved;
  - each mapped quantity's reference range or scheme has been marked verified on this analyser (the laboratory lead records the verification, per CLSI EP28: 20 samples, at most 2 outside).
- **AP-5** A specimen is pinned to the bench's in-use profile **at receipt**. Result rows come from that profile. A later profile change never alters pinned specimens.
- **AP-6** `lab_only` rows are stored, visible to lab users, excluded from clinician views, prints, the NCD feed and exports. `never` rows are not stored.
- **AP-7** Until an interface exists (Phase 4), values are typed. The profile still decides which rows appear.

### 6.3 Methods and eGFR (`lib/lab/methods.ts`, `lib/lab/egfr.ts`)
- **ME-1** A method register per hospital per component: method code, IDMS traceability (creatinine), and the date in force. The method in force is snapshotted on each result.
- **ME-2** A reference band may name a method. The resolver uses method-specific bands first, then bands that name no method. A band for another method is never used.
- **EG-1** eGFR is calculated, never typed. It needs all of:
  - a released numeric creatinine in µmol/L;
  - age 18 or over at collection;
  - sex recorded;
  - the creatinine method declared IDMS-traceable;
  - "Report eGFR" on for the hospital.
- **EG-2** When any condition fails, no eGFR row appears, and the creatinine report says which condition failed.
- **EG-3** The equation's constants come from a signed `REF-EGFR-CKDEPI-2021` entry (source: the NKF page for the 2021 equation). The code implements the equation's shape only. Test against fixture constants.
- **EG-4** eGFR is stored as a calculated result with its inputs snapshotted. It is recalculated, with a new version, when the creatinine is amended.
- **EG-5** The eGFR caveat line is signed copy (Appendix A) and always shown with the value.

### 6.4 Decision schemes and the flag basis (`lib/lab/interpretation.ts`)
- **DS-1** A scheme is a signed, versioned set for one concept and unit. It holds:
  - categories (code, label, abnormal or not, lower bound and inclusivity, upper bound and inclusivity);
  - applies-to rows (sex, age from/to in days per RR-4, context such as `not_pregnant`, `pregnant_t1`/`t2`/`t3` or `fasting`);
  - **methods applied to** (`lab`, `bedside`, or both);
  - adjustments (for example the elevation table);
  - a source per row.
- **DS-2** The **flag basis** is per hospital per concept: `reference` (Phase 1 RR-*) or `scheme:{id}`. It is signed with the scheme, and a change starts a new draft. The previous basis stays in force until both signatures land.
- **DS-3** `resolveInterpretation({ componentVersion, hospital, sex, ageDaysAtCollection, context, method, at })` returns:
  - the basis;
  - the band or the category;
  - a flag (`high`, `low`, `in_range`, or the category with abnormal true/false);
  - every adjustment applied;
  - the reference band **for information** when the basis is a scheme;
  - or a reason: `no_scheme_for_patient`, `no_band_for_age`, `sex_or_age_missing`, `context_not_recorded`, `method_not_covered`.
- **DS-4** **Fallback.** A scheme that does not cover the patient (a child, a person over 65, an uncovered context, a bedside method not named) falls back to the reference interval, and the reason is stored and shown. **The fallback never borrows a category from another population.**
- **DS-5** **Pregnancy context** comes only from the record: a pregnancy status with a gestation recorded on or before collection, in the same encounter or a linked ANC record (D-LAB2-22). Missing → the non-pregnant row, with *"pregnancy not recorded"* on the result.
- **DS-6** **Elevation adjustment.** The scheme's adjustment table (signed data) maps the hospital's signed elevation to an amount applied as the scheme states: added to each cut-off, or subtracted from the observed value. Both representations are tested to give the same category.
- **DS-7** With no signed elevation, no adjustment applies, and the result says *"altitude not adjusted"*.
- **DS-8** Bounds and inclusivity are applied exactly as signed. Table-test every boundary value for each seeded fixture scheme.
- **DS-9** The resolved interpretation is snapshotted on the result (Law 4). Signing a new scheme or a new basis never changes a released result.
- **DS-10** A category scheme with no abnormal categories (for example lipid classification) shows categories and produces no flag.
- **DS-11** Critical limits (Phase 1 FL-4) are independent of the basis.

### 6.5 Research import (`lib/lab/research-import.ts`, script plus action)
- **RI-1** It reads `docs/lab/phase-2/lab-catalogue-research.v1.json`, validates it against a Zod schema written from the file's `conventions`, and records the file's SHA-256. Re-importing the same hash is a no-op.
- **RI-2** It creates:
  - the concept addendum (CC-1);
  - reference-range **drafts** (Phase 1 store);
  - decision-scheme **drafts** (DS-1).

  Each band carries its source citation, where, link, population, method, confidence, reason and strand.
- **RI-3** **Nothing is signed, in force or orderable** after import. A test proves no resolver returns an imported value before two signatures.
- **RI-4** Bands are imported only when:
  - their unit equals the component's canonical unit;
  - their ages follow RR-4.

  Others are listed in an import report with the reason.
- **RI-5** A band with `verification` blocks **Send for sign-off** for its draft until **Record the check** is completed (audited: who, what, which table or page).
- **RI-6** Where two sources give bands for the same concept, sex and age, both remain in the draft view, labelled by source, and **Two sources disagree** is shown. The laboratory lead chooses one before sign-off. The resolver never averages.
- **RI-7** Kit-specific concepts (troponin, TSH, FT4, FT3, PT, APTT, D-dimer) are not imported as drafts. They are listed under **Not imported**.
- **RI-8** The import report lists counts by kind, rejections with reasons, verification blockers and gaps (from `gaps[]`). It goes into `docs/lab/phase-2/import-report.md` at Step 4.

### 6.6 One menu and availability (`lib/lab/availability.ts`)
- **OM-1** `test_catalogue.offering_code` (nullable, HARMONISATION §9) links a test to a hub offering. A test with no link is not orderable while `labOneMenu` is on.
- **OM-2** `availabilityFor({ test, hospital, at })` reads the hub (status, hours, machine status, referral, stated turnaround) and returns `in_house | referred | down_referred | outside_hours | not_offered | unknown`, with the reason, the since-time and the expected turnaround. It is pure over a hub snapshot. It never writes.
- **OM-3** `unknown` when the hub has no status, or the read fails. Orderable, labelled *"Not known today"* (Law 8).
- **OM-4** `not_offered` → not orderable in-house. The order sheet offers no Add.
- **OM-5** The turnaround shown is the hub's stated figure, labelled as this lab's figure, never as a clinical target. Phase 0's turnaround decision stands.
- **OM-6** The availability returned at ordering is snapshotted on the order line.
- **OM-7** Availability changing after ordering never cancels an order. A test that turns `down_referred` after ordering moves to **To refer** on the worklist, and the order shows the new state to the doctor.
- **OM-8** The ordering search is client-side over a hospital menu snapshot, refreshed on hub change events or every 5 minutes. That interval is an operational setting, not a clinical number.

### 6.7 Payment (`lib/lab/payment.ts`)
- **PY-1** An order line's payment state is one of:
  - `not_required` (the hospital does not collect before the sample);
  - `awaiting`;
  - `paid` (receipt number);
  - `insured` (insurer, authorisation number);
  - `waived` (reason, approver);
  - `emergency`.
- **PY-2** `emergency` is set automatically, and cannot be changed by a cashier, when the priority is Immediate **or** the order was raised from the resus desk. Raising a priority to Immediate later sets `emergency` at that moment, with an event.
- **PY-3** `canCollect(order, setting)` returns:
  - **always true** for `emergency`, `not_required`, `paid`, `insured` and `waived`;
  - for `awaiting`: true with a recorded reason in `inform` mode, false in `hold` mode.

  Property test: no input makes `canCollect` false for an Immediate or resus order.
- **PY-4** Every payment change is an event (actor, time, previous and new state). The cashier never changes `emergency`.
- **PY-5** Cashier queries return test names only for unrestricted tests and a count for restricted ones. Test it at the query and RLS level, not only in the UI.
- **PY-6** No price is stored or shown in this slice.

### 6.8 Identity at collection (`lib/lab/collection.ts`)
- **ID-1** `checkLabel({ labelNo, patientId, orderId })` returns `match`, `other_patient` (with that patient's two identifiers), `other_order_same_patient`, `unknown_label` or `voided_label`.
- **ID-2** With `labCollectionCheck` on, `markCollected` requires a `match` for each specimen in the same transaction. Otherwise it is refused on the server.
- **ID-3** Every check writes an event: result, method (scan or typed), actor and time. A mismatch is an event even though nothing else changes.
- **ID-4** A mismatch has no override (D-LAB2-04). The path is a new label.
- **ID-5** Reprinting a label prints the same number, unless the collector chooses **Void and print new**, which voids the old number (ID-1 then returns `voided_label` for it).
- **ID-6** The wristband checkbox is recorded with the check. It is not a substitute for ID-2.
- **ID-7** Specimens collected before the flag was on are not re-checked.

### 6.9 Scan to receive (`lib/lab/receive.ts`)
- **SR-1** `receiveByLabel({ labelNo, actor, clientKey })` finds the specimen in the actor's hospital and receives it through the existing receive action. It is idempotent per client key: a second scan of a received specimen returns *"Already received at {time} by {cadre}"*.
- **SR-2** Results by case:
  - not found: *"No specimen with label {n} at this hospital"*;
  - another hospital's label: the same text (no cross-hospital disclosure);
  - not collected yet: *"Not marked collected. Check with the ward."*, with **Receive anyway** recording a reason;
  - rejected or voided: says so.
- **SR-3** A high-risk specimen is received only after the receiver ticks *Procedure followed*. The tick is recorded.
- **SR-4** The scanner is a keyboard wedge. The field accepts digits and the label prefix, ignores a trailing Enter for submission, and keeps focus after each receipt.
- **SR-5** **Undo** within 5 minutes (operational) writes a reversal event and returns the specimen to "To receive". After that, the existing reject or amend paths apply.

### 6.10 Live worklist (`lib/lab/live.ts`)
- **LV-1** A private, hospital-scoped channel, `lab:{hospitalId}`, authorised by RLS on `realtime.messages` for lab users of that hospital. It carries `{ specimenId, event, at }`, where event is one of collected, received, resulted, released, referred or flagged-high-risk. No PHI.
- **LV-2** The client refetches the affected rows through the normal scoped query. Section filtering stays client-side over the scoped result.
- **LV-3** If the subscription fails or drops, poll every 15 seconds while visible, and show the amber line from 5.5.
- **LV-4** New rows are announced once in a polite live region, rate-limited to one announcement per 10 seconds, summarising counts. No sound.
- **LV-5** Two-hospital test: a lab user of hospital B receives nothing from hospital A's channel.

### 6.11 Clinical context (`lib/lab/context.ts`)
- **CX-1** The clinical question is an order field (≤ 280 characters), stored with the order, printed on the request form and shown on the worklist and the specimen page.
- **CX-2** **Insert working diagnosis** copies the clerking desk's current working diagnosis text at ordering. If that diagnosis is in a restricted class the order's tests do not share, the insert is refused with a reason (D-LAB2-07).
- **CX-3** `revealWorkingDiagnosis({ specimenId, actor })` returns the current working diagnosis, its author and its time, and writes an access event like the identity reveal.
- **CX-4** A restricted-class diagnosis returns `masked` for an actor without access.
- **CX-5** No working diagnosis is cached on the specimen or the worklist.

### 6.12 High-risk specimen warning (`lib/lab/high-risk.ts`)
- **HR-1** Sources:
  - (a) the clerking desk's fever-with-bleeding rule firing for the encounter, with `outbreak_mode` per that prompt;
  - (b) a clinician's manual flag on the order, *"Suspected high-risk infection"*, with a reason (D-LAB2-06).
- **HR-2** The warning attaches to every open and future order and specimen of that encounter until a clinician clears it with a reason. The lab cannot clear it. Clearing is an event.
- **HR-3** It is shown on the collection list and panel, the label, the request form, the worklist row and the specimen page. A test asserts every surface.
- **HR-4** It never changes routing, testing or release. The testing pathway is the Ministry of Health's. MedSync shows the warning and links the hospital's procedure.
- **HR-5** It survives downtime: the downtime form (Phase 1) gains a high-risk box, ticked when printed for a flagged encounter.

### 6.13 Bedside tests (`lib/lab/bedside.ts`)
- **PC-1** A bedside result is a `diagnostic_report` of kind `point_of_care`, with no specimen and no receipt step. It is released when saved, by the operator, and appears in the same lanes as lab results.
- **PC-2** Required:
  - a registered device in state `in_use` for this hospital (and ward, if scoped);
  - a current lot;
  - an operator with `poct.record`;
  - the patient's two identifiers.
- **PC-3** A lot past its use-by date at `measured_at` is refused on the server.
- **PC-4** `measured_at` is not in the future. Earlier than 24 hours before entry needs a reason (operational).
- **PC-5** Units, ranges, schemes and flags run as for lab results, with `method = bedside`. A scheme that does not name `bedside` is not applied (Law 7, DS-4), and the result shows the signed "not for diagnosis" line.
- **PC-6** Meter-range codes (`above_range`, `below_range`) are coded answers on bedside quantity components. They are never converted to numbers. **An `above_range` glucose prompts the operator to consider marking it critical**: a prompt, never automatic, because Phase 1 FL-7 keeps coded results manual.
- **PC-7** Glucose context (fasting or not) picks the concept (CC-3).
- **PC-8** Snapshot: device, lot, operator, method, context.
- **PC-9** A bedside result can be marked critical through Phase 1's `releaseWithCriticalMark` with source `bedside`. The check before release uses the same options, with "Repeated" meaning a second reading.
- **PC-10** A device in `not_verified` cannot be selected (D-LAB2-11). The laboratory lead moves it to `in_use` with a recorded verification.

### 6.14 NCD feed (`lib/ncd/lab-feed.ts`)
- **NF-1** Each registry lab field maps to a concept, an accepted unit, accepted methods (lab, bedside) and a look-back window. All are registry settings, signed by the NCD lead and the CSO. **There are no defaults in code.**
- **NF-2** `latestForField({ patient, field, at })` returns the latest **released, current-version** result within the window that matches the concept, unit and method, or a reason: `none_in_window`, `unit_differs` (with the result), `method_not_accepted`, `restricted`.
- **NF-3** It is a read model (a view or query), not a copy. An amended source result changes the field, and the visit shows *"Updated from an amended result at {time}"*.
- **NF-4** Filled fields are read-only in the visit form. The visit stores a reference to the result (report id and version), not the number.
- **NF-5** eGFR fills from the calculated result (EG-*) only.
- **NF-6** Manual entry remains only for outside results (NF-7) and for fields with no concept mapping.
- **NF-7** An outside result stores:
  - the value and unit as printed;
  - the date;
  - the laboratory name;
  - the canonical value computed by a plain-factor `multiplyBy` from the concept;
  - the entering user.

  It is tagged `outside` and excluded from every lab report, HMIS output and turnaround figure.
- **NF-8** The diabetes pack in the clerking desk switches to `latestForField` behind the same flag, so there is one reader.

### 6.15 Display (`lib/lab/display.ts`)
- **DP-1** One formatter for a result line: value, unit, flag or category, bedside tag, basis line and previous value. It is used by lanes, reports, prints and the NCD feed.
- **DP-2** `lab_only` rows never reach the formatter for a clinician.
- **DP-3** The previous value is the latest earlier released result of the same concept and unit. A different unit or method shows *"previous result not comparable"*.

---

## 7. Data changes (only what GATE A approves; additive; next free migration numbers)

**Catalogue**
- Concept addendum rows, with:
  - `value_type`;
  - `other_units` (JSON: unit, multiply_by, formula);
  - `answers` (JSON: code, display, abnormal);
  - `role`;
  - `measurement`;
  - LOINC alternatives.
- `test_catalogue.offering_code` (nullable) and `restricted_class`. New tests per CC-7.
- `analyser_profiles`, `analyser_profile_mappings`, `analyser_research_codes`.
- `component_methods` (hospital, component, method, idms_traceable, in force from).

**Interpretation**
- `decision_scheme_versions` (hospital, concept, unit, status, signatures, in force from).
- `decision_scheme_rows` (applies-to, methods, source).
- `decision_scheme_categories`.
- `decision_scheme_adjustments`.
- `flag_basis_versions` (hospital, concept, basis, signatures).
- Hospital settings: `elevation_m`, `elevation_source`, `elevation_signed_by` and the time.

**Results**
- On the result component:
  - `basis_kind` and `basis_id`, `basis_version`;
  - `category_code`;
  - `adjustments` (JSON);
  - `context_snapshot`;
  - `profile_id`;
  - `method_code`;
  - `calculated_from` (eGFR);
  - `meter_range_code`.
- On reports: `kind` (`lab`, `point_of_care`), `device_id`, `lot_id`, `operator_id`, `measured_at`, `outside`.

**Orders and specimens**
- On the order line:
  - `availability_snapshot` (JSON);
  - `clinical_question`;
  - `payment_state` with its fields;
  - `high_risk` and `high_risk_source`.
- `payment_events`, `identity_check_events`, `high_risk_events` (append-only, by trigger).
- On specimens: `profile_id` pinned at receipt; `received_via` (`scan`, `click`); `procedure_followed_at`.

**Bedside**
- `poct_devices` (hospital, ward scope, kind, test, state, verified by and at).
- `poct_lots` (device kind, lot, use-by).

**HIV algorithm**
- `hiv_algorithm_versions`, `hiv_algorithm_rules`.
- On `obs.hiv_test` results: `algorithm_version`, per-assay kit and lot.

**NCD**
- `ncd_field_mappings` (field, concept, units, methods, window, signatures).
- `ncd_outside_results`.
- The visit stores result references.

**Research**
- `research_imports` (file hash, imported at, by, report).
- `draft_verifications` (draft band, finding, table or page, actor).

**Access**
- `clinical_context_access_events`.

**Realtime**
- The `lab:{hospitalId}` channel with RLS on `realtime.messages`.

**Permissions**
- `lab.payment.record`.
- `poct.record`.
- `lab.profile.manage` (or fold it into `lab.manage`; Step 0 decides).
- `ncd.mapping.manage`.

**RLS probes** for every new or changed object:

| Actor | Access |
|---|---|
| Lab staff, same hospital, with the permission | As the permission allows. Set-up read-only without `lab.manage` |
| Cashier (`lab.payment.record`), same hospital | Orders awaiting payment: identifiers, order number, unrestricted test names, restricted count. **No results, no clinical question, no working diagnosis** |
| Nurse with `poct.record`, same hospital | Create bedside results for patients they may open; read devices and lots |
| Collector (nurse or clinician), same hospital | Payment state and high-risk flag on orders they collect; identity check events they write |
| Clinician, same hospital | Read results, categories and bedside results for patients they may open; reveal-and-audit working diagnosis only through CX-3 |
| NCD clinician | Read the feed for registry patients; write outside results |
| Clinician without restricted access | Restricted tests, results and diagnoses denied or masked |
| Reception without `lab.payment.record` | Denied |
| Hospital admin | Lab settings payment and elevation (elevation requires CSO signature to take effect); no PHI |
| Staff of another hospital | Denied, including the realtime channel |
| Superadmin without break-glass | Denied |
| Anonymous | Denied |
| Any client, direct INSERT, UPDATE or DELETE | Denied everywhere |
| Any actor, UPDATE or DELETE on `payment_events`, `identity_check_events`, `high_risk_events`, `clinical_context_access_events` | Denied, including the service-role path |

## 8. Server actions

The house contract applies to every write:

`'use server'` → Zod with an idempotent client key → auth (`getUser()`) → AAL2 → permission → hospital-scope check → one transaction → PII-redacted log → audit row → `{ id, serverTime }`.

Notification failures never throw.

| Group | Actions |
|---|---|
| Catalogue | `importResearchFile` · `recordDraftCheck` · `signConceptAddendum` · `setTestService` · `setComponentMethod` · `setRestrictedClass` (CSO) · `saveProfile` · `recordProfileVerification` · `activateProfile` |
| Interpretation | `saveSchemeDraft` · `signSchemeVersion` · `saveFlagBasisDraft` · `signFlagBasis` · `setElevation` · `signElevation` · `saveHivAlgorithmDraft` · `signHivAlgorithm` |
| Ordering | Extend the existing place-order actions: availability snapshot, `clinicalQuestion`, `insertWorkingDiagnosis`, emergency payment state |
| Payment | `recordPayment` · `setPaymentMode` |
| Collection | `checkLabel` · `markCollected` (extended, ID-2, PY-3) · `voidAndReprintLabel` · `flagHighRisk` · `clearHighRisk` |
| Bench | `receiveByLabel` · `undoReceive` · `revealWorkingDiagnosis` · `recordProcedureFollowed` |
| Bedside | `recordBedsideResult` · `registerDevice` · `setDeviceState` · `addLot` |
| NCD | `saveFieldMapping` · `signFieldMappings` · `saveOutsideResult` |

Signing actions require a fresh second factor and refuse a signer who authored the draft's last change when a second person is available (D-LAB1-12 carries over).

---

## 9. Steps and gates

### Step 0 — Discovery and baseline (no product changes)

**Answer and report:**
- **Q1** Is `feat/lab-safety-floor` merged? List the Phase 1 engines, tables and flags present. **If not, STOP.**
- **Q2** Confirm or correct G1–G13, each with its file and line.
- **Q3** The hub:
  - offering shape;
  - status values;
  - machine status;
  - hours;
  - referral fields;
  - how a test would link (HARMONISATION §9);
  - change events.

  Count orderable tests with no plausible hub match.
- **Q4** The three ordering surfaces (order sheet, Plan basket, resus proposals): where each builds its list, and how a shared availability call would enter each.
- **Q5** Orders: the priority field; the resus source marker; how often orders are Immediate; where a clinical question could live.
- **Q6** Collection today:
  - who marks collected, where, and with what action;
  - label numbering and reprint behaviour;
  - whether a label can be voided.
- **Q7** Receive today: the action; whether receipt is idempotent; the rejection path.
- **Q8** Realtime: the channels from migration 0073 and Phase 1, their authorisation, and whether a hospital-scoped private channel can be authorised by RLS.
- **Q9** The clerking desk:
  - where the working diagnosis lives;
  - how the identity reveal is audited (reuse it);
  - the fever-with-bleeding rule and `outbreak_mode`;
  - how restricted diagnoses are tagged.
- **Q10** Pregnancy status and gestation: where they are recorded and how often present for women 15–49 with lab orders (G12).
- **Q11** The NCD registry:
  - its lab fields, their units and how they are stored;
  - the diabetes pack's reader;
  - how many visits in 90 days have hand-typed HbA1c where an in-house HbA1c existed (the "before" number).
- **Q12** The catalogue after Phase 1:
  - components with units;
  - existing concept ids versus the research file's existing ids;
  - which tests use `obs.glucose` for fasting;
  - D-dimer's unit and result count;
  - troponin result count;
  - blood group storage.
- **Q13** Cashier and reception: what exists; what roles and permissions; whether any money or receipt data is stored anywhere.
- **Q14** Nurses: the nurse workspace; which cadres may record observations; where a bedside test would sit.
- **Q15** Devices: is there any device or asset register (the hub lists machines)? Can bedside devices reuse it?
- **Q16** Hospital settings: where an elevation and a procedure link would live.
- **Q17** The research file: validate it against the Zod schema now and report the counts. It should show 119 concepts, 33 tests, 64 range sets, 497 bands, 38 gaps and 21 decisions. Report any id the repo does not know.
- **Q18** Print: the label template, the request form, the downtime form, and their print CSS.
- **Q19** Playwright, axe and a fake-clock utility; a keyboard-wedge simulation in Playwright (typing plus Enter). If Playwright or axe is missing, STOP and flag.
- **Q20** Tokens on the branch for the amber caution pair, the teal confirmation, the sky tint (for the bedside tag) and the neutral chip.

**Baseline:**
- Screenshots of the order sheet, collection, the worklist, result entry, `/doctor/results` and an NCD visit.
- A scripted run: order HbA1c; collect; receive; release; open the NCD visit. Record every number typed by hand. This is the "before".
- **Failing tests** that reproduce:
  - G1 (an order placed for a test the hub marks not offered);
  - G4 (collection with a label of another patient succeeds);
  - G7 (the NCD visit does not show a released HbA1c).

  Do not fix them yet.

**STOP 0.** Report Q1–Q20, the prompt-versus-repo differences, the failing tests and the baseline.

### Step 1 — GATE A proposal (documents only)

Write `docs/lab/phase-2/gate-a-proposal.md`. It contains:
- annotated wireframes of every screen in Section 5, starting from the canvas;
- the interpretation resolver as a decision table with worked examples:
  - a woman of 34, not pregnant, at 1,200 m;
  - pregnant at 22 weeks;
  - pregnancy not recorded;
  - a girl of 9 (fallback);
  - a bedside glucose (method not covered);
- the payment state machine with every transition and the never-held proof;
- the identity check outcomes with the void and reprint path;
- the schema diff, the RLS probe plan and the realtime design;
- **the sign-off packs** (Appendix C):
  - concept addendum;
  - decision schemes;
  - flag basis;
  - elevation;
  - HIV algorithm;
  - restricted classes;
  - NCD field mappings;
  - eGFR reference.

  The packs are blank templates, pre-listing the research drafts' sources. **Propose no values beyond what the research file holds as drafts.**
- every string in Appendix A, with its status;
- **the hazard log** (Appendix B), each hazard with its cause, effect, control, the test that proves the control, and the residual risk;
- the test plan, the rollout plan per flag and the ADR drafts;
- the decision table (Section 14) with a signature block.

**STOP 1.** Nothing proceeds without Fadhul's signature on the D-decisions.

### Step 2 — Data layer
- Approved migrations.
- The append-only triggers.
- The flags.
- The `lab:{hospitalId}` channel and its authorisation.
- The permissions.
- The RLS probes.

**STOP 2.** Report:
- the migration diff;
- the RLS probe table (every object × every actor);
- the append-only proofs;
- the realtime authorisation and two-hospital isolation test;
- the cashier restricted-name test at RLS level.

### Step 3 — Engines (pure, no UI)
Build Sections 6.1–6.15, with tests:
- every rule ID covered;
- `resolveInterpretation`:
  - table tests at every boundary;
  - contexts;
  - elevation present or absent;
  - the fallback reasons;
  - bedside method;
  - snapshot immutability after a new scheme and a new basis are signed;
- `deriveHivOutcome` on every path;
- `canCollect` property test (PY-3);
- `checkLabel` on all outcomes;
- `receiveByLabel` idempotency;
- the eGFR conditions (EG-1/2), fixture constants (EG-3) and recalculation on amendment (EG-4);
- `availabilityFor` for every hub state, including read failure;
- `latestForField` for every reason;
- the research import on the real file:
  - counts;
  - rejections;
  - verification blockers;
  - "nothing resolvable before signatures";
- two-hospital fixtures for every list and resolver.

**STOP 3.** Report test counts, the rule coverage table, property-test results and the import report.

### Step 4 — Catalogue v2 and the research import (behind `labCatalogueV2`)
Build:
- research drafts and the verification check;
- the concept addendum review and sign-off;
- analyser profiles;
- the method register and eGFR;
- ranges and cut-offs with the flag basis;
- the elevation setting;
- the HIV algorithm configuration;
- result entry by profile and basis;
- the display formatter.

Scenarios:
- **S1** Import the research file. The counts match Q17. Nothing resolves. A second import of the same file does nothing.
- **S2** The CD4 draft from Lugada cannot be sent for sign-off until **Record the check** is done. After it, it can.
- **S3** Creatinine shows **Two sources disagree**. The laboratory lead chooses one; the other stays visible as a rejected alternative with the reason.
- **S4** The concept addendum is signed by both signers. New concepts become available to tests; existing results are untouched.
- **S5** The DH-615 profile cannot be used while HCT and PDW confirmations are open. After they are resolved and verification is recorded, it can. A specimen received before activation keeps its old row set.
- **S6** Mapping a research-use code is refused. Mapping GRAN to neutrophils is refused.
- **S7** P-LCR set to Lab only is visible to the technologist and absent from the doctor's report, the print and the NCD feed.
- **S8** The Hb scheme and basis are signed with elevation 1,200 m signed. A woman of 34, not pregnant, with Hb 10.4 g/dL gets **Moderate anaemia**, with the basis line and the reference band for information.
- **S9** The same patient with pregnancy recorded at 22 weeks gets the second-trimester row. Pregnancy not recorded gets the non-pregnant row with *"pregnancy not recorded"*.
- **S10** A girl of 9 falls back to the reference interval, with the reason shown.
- **S11** Elevation removed: categories are computed without adjustment, and the result says *"altitude not adjusted"*.
- **S12** A new scheme version is signed. A result released before keeps its category and basis.
- **S13** Creatinine with an IDMS-traceable enzymatic method yields eGFR for an adult. With the method undeclared, or for a 17-year-old, no eGFR row appears and the creatinine report says why.
- **S14** An amended creatinine recalculates eGFR as a new version.
- **S15** The HIV algorithm version is signed. Every outcome path derives correctly; a later version does not re-derive an old result.
- **S16** `test.syphilis`, `test.rpr`, `test.tpha` and `test.dual_hiv_syphilis_rdt` each order only their own components. The dual RDT's HIV line never sets `obs.hiv_test` alone.
- **S17** HbA1c shows its IFCC value to 0 dp from the signed formula. No IFCC result is stored.
- **S18** With `labCatalogueV2` off, result entry and display match Phase 1.

**STOP 4.** Report:
- scenario results;
- screenshots against artboards 6, 8 (category display), 11, 12 and 13;
- the import report;
- the count of concepts by state.

### Step 5 — One menu (behind `labOneMenu`)
Build:
- the service link in the test menu;
- availability in the order sheet, Plan basket and resus proposals;
- the To refer list;
- the bedside alternative line.

Scenarios:
- **S19** The hub marks the creatinine analyser down with a referral. The doctor sees *"Analyser down since 08:10. Will be referred, result in about 2 days"* before adding it, in all three ordering surfaces.
- **S20** A test the hub marks not offered has no Add button anywhere. The G1 failing test now passes.
- **S21** A test with no service link is hidden from doctors and counted in set-up.
- **S22** The hub read fails. Tests show *"Not known today"* and remain orderable.
- **S23** A test turns down after ordering. The specimen moves to **To refer**, and the doctor's order shows the new state. The order is not cancelled.
- **S24** The availability shown at ordering is on the order line's snapshot after the hub changes.
- **S25** Typed search returns within the budget on a menu of 100 tests.

**STOP 5.** Report scenario results, screenshots against artboards 1 and 10, and the count of tests linked or not linked.

### Step 6 — Payment, collection and the high-risk warning (behind `labPayment`, `labCollectionCheck`, `labHighRiskWarning`)
Build:
- the cashier screen;
- payment states;
- the collector's list and panel;
- the identity check;
- void and reprint;
- the high-risk flag and its surfaces, including label, request form and downtime form;
- lab settings for payment and procedure.

Scenarios:
- **S26** An Immediate order is `emergency`, absent from the cashier list, and collectable at once in both payment modes.
- **S27** A resus-desk order is `emergency` regardless of priority.
- **S28** A routine order awaiting payment:
  - in `inform` mode, it is collected with a recorded reason;
  - in `hold` mode, **Mark collected** is unavailable until the cashier records Paid.
- **S29** Raising a routine order to Immediate sets `emergency` with an event. The cashier cannot change it back.
- **S30** The cashier sees *"Full blood count, and 1 restricted test"*. A direct query for the restricted test's name, as the cashier, is denied by RLS.
- **S31** The collector scans the right label: the match is shown and **Mark collected** works in 2 taps.
- **S32** The collector scans another patient's label: a mismatch naming the other patient by two identifiers; **Mark collected** refused on the server; the event is recorded. The G4 failing test now passes.
- **S33** Void and reprint: the old number returns `voided_label`.
- **S34** The fever-with-bleeding rule fires in `outbreak_mode`. The warning appears on collection, the label, the request form, the worklist and the specimen page.
- **S35** A clinician flags *Suspected high-risk infection* by hand with a reason. The same surfaces show it. The lab cannot clear it; a clinician clears it with a reason.
- **S36** A downtime form printed for a flagged encounter carries the high-risk box.
- **S37** All three flags off: collection matches the Phase 1 baseline.

**STOP 6.** Report:
- scenario results;
- screenshots against artboards 2, 3 and 14;
- a photograph or PDF print of the label and request form against artboard 4.

### Step 7 — The bench (behind `labBench`)
Build:
- scan to receive and undo;
- the live channel and polling fallback;
- Find a specimen;
- the clinical question on the worklist and request;
- reveal-and-audit of the working diagnosis;
- *Procedure followed* for high-risk receipt.

Scenarios:
- **S38** A keyboard-wedge scan receives a specimen in one action within the budget. The field keeps focus. A second scan says *"Already received at {time}"*.
- **S39** Another hospital's label number says *"No specimen with label {n} at this hospital"* and discloses nothing.
- **S40** A specimen not marked collected needs **Receive anyway** with a reason.
- **S41** **Undo** within 5 minutes returns the specimen to To receive with a reversal event.
- **S42** A specimen collected on a ward appears on an open worklist within the realtime budget. With the channel blocked, the amber line shows and polling picks it up within 15 s.
- **S43** A lab user of hospital B receives no event from hospital A.
- **S44** Revealing the working diagnosis writes an access event. A restricted-class diagnosis is masked for a technologist without access.
- **S45** A high-risk specimen cannot be received until *Procedure followed* is ticked.

**STOP 7.** Report scenario results, timing numbers, screenshots against artboards 5 and 6, and axe.

### Step 8 — Bedside tests (behind `labBedside`)
Build:
- the device and lot register;
- the bedside form for glucose, malaria RDT, urine dipstick and HbA1c;
- bedside results in lanes and reports;
- bedside criticals.

Scenarios:
- **S46** A nurse records a fasting glucose on a registered glucometer with a current lot. It appears in the doctor's results list with the Bedside tag, device, lot and operator, and **no diagnostic category**.
- **S47** An expired lot is refused on the server.
- **S48** An unregistered or not-verified device cannot be chosen.
- **S49** The meter shows HI. The nurse records *Above the meter's range*. No number is stored. The critical prompt appears; marking it critical sends a Phase 1 alert with source `bedside`.
- **S50** A malaria RDT records the coded answer. A positive is marked abnormal.
- **S51** A 10-pad dipstick records each pad. Bilirubin and urobilinogen are present.
- **S52** A bedside HbA1c device is unusable until the laboratory lead records its verification.
- **S53** A `measured_at` in the future is refused. One more than 24 hours ago needs a reason.
- **S54** The timed trial meets the budget.

**STOP 8.** Report scenario results, screenshots against artboards 7, 8 and 14, and the timed trial.

### Step 9 — The NCD feed (behind `ncdLabFeed`)
Build:
- field mappings and their sign-off;
- the feed in the NCD visit;
- outside results;
- the diabetes pack switched to the same reader.

Scenarios:
- **S55** A released in-house HbA1c fills the NCD visit with source and date. The field cannot be typed over. The G7 failing test now passes.
- **S56** The lab amends that HbA1c. The visit shows the new value and *"Updated from an amended result"*.
- **S57** eGFR fills from the calculated result. A creatinine with no eGFR (EG-2) leaves the field empty with the reason.
- **S58** A fasting bedside glucose fills the fasting glucose field, where the mapping accepts bedside, with its tag.
- **S59** No UACR within the window: *"No result in the last {window}"*, Order, Outside result. An outside result in mg/g is stored as typed, shown converted, tagged Outside, and absent from lab reports.
- **S60** A result whose unit differs from the field is listed as not used, never dropped.
- **S61** The diabetes pack and the NCD visit show the same value for the same patient.
- **S62** Mappings unsigned: the feed fills nothing and the visit says so.

**STOP 9.** Report:
- scenario results;
- screenshots against artboard 9;
- the "after" count of hand-typed HbA1c where an in-house result existed (target 0).

### Step 10 — Hardening and documentation
- **S63** All eight flags off at a hospital: behaviour matches the Phase 1 baseline.
- **S64** Red-scarcity tests on every new component. The high-risk warning is never red.
- **S65** The banned-term scan (Phase 1 MS-2) passes over every new SMS or push-capable string and the realtime payload fixtures.
- **S66** Every audit and event table is append-only, including through the service-role path.

Then:
- the timed trials (collection, scan, bedside, NCD visit) with two or three users if available;
- reduced motion;
- the performance budgets;
- the user guide, one page each for:
  - the doctor;
  - the collector;
  - the cashier;
  - the technologist;
  - the laboratory lead;
  - the NCD clinician;
- the completed hazard log;
- the ADRs;
- the final report.

**STOP 10 (final).** The table in Section 13, filled in.

---

## 10. Accessibility, motion, colour
- WCAG 2.2 AA. Targets at least 44 × 44 px on touch.
- **The scan field:**
  - has a visible label, or a programmatic label with a visible placeholder;
  - keeps focus after each receipt;
  - announces the outcome politely;
  - announces a mismatch or "not found" assertively.
- **The identity mismatch** is a region with a heading. Focus moves to it. **Mark collected** is disabled with an explanation linked by `aria-describedby`.
- **The high-risk block:** `role="alert"` once, on first render of the panel; never repeated on refresh. Text plus icon, amber with a 2 px border; never colour alone.
- **Categories** are words. A flagged category carries an arrow and the word.
- **The bedside tag** is text plus icon.
- **Live updates:** a polite region, rate-limited (LV-4). No sound, no flashing.
- **Colour:**
  - teal for actions, focus and the label-match confirmation;
  - plum or the lab hue for the active navigation item;
  - amber for awaiting payment, not linked, check needed, disagreeing sources, expired lot and the high-risk warning;
  - sky tint for the bedside tag;
  - the critical tint only where D-LAB1-18 signed it;
  - nothing green.
- **Print** (label, request form, downtime form): black on white, the high-risk box legible in greyscale, body text at least 12 px.

## 11. Performance budgets

| Measure | Budget |
|---|---|
| `receiveByLabel` (server) | p95 < 300 ms |
| Scan to row updated on the scanning screen | p95 ≤ 1 s |
| New specimen visible on another open worklist | p95 ≤ 5 s realtime, ≤ 15 s polling |
| `availabilityFor` per test (from the menu snapshot) | < 1 ms; menu snapshot fetch p95 < 300 ms |
| `resolveInterpretation` per report | < 5 ms, no extra round trip per component |
| `latestForField` for a full NCD visit | p95 < 200 ms |
| Bedside save (server) | p95 < 400 ms |
| Added JS on `/lab`, the order sheet, the nurse workspace and `/ncd` | report each; flag anything above 40 KB gzipped |

## 12. Security, privacy, audit
- AAL2 on every route here. Hospital scope on every read and write.
- **The cashier** has no access to results, the clinical question or the working diagnosis, in the app or in the database.
- **Audited** with actor, time and hospital:
  - every payment change;
  - every identity check;
  - every high-risk flag or clear;
  - every working-diagnosis reveal;
  - every receipt and undo;
  - every bedside result;
  - every device, lot or profile change;
  - every signature;
  - every draft check;
  - every import;
  - every outside result.
- Event tables are append-only by trigger.
- Realtime payloads, logs, analytics and URLs carry no PHI and no restricted content.
- **The research file:**
  - is data, not code;
  - its hash is recorded;
  - its sources stay attached to every band;
  - no number from it is used before signatures.
- The governance gap stays documented: Fadhul holds the superadmin, CSO and audit-reviewer roles at once. D-LAB1-12 applies to every signature in this slice.

---

## 13. Numbers to report at the final STOP

| Metric | Baseline | Target | Result |
|---|---|---|---|
| Ordering surfaces reading one availability engine | 0 of 3 | 3 of 3 | |
| Orders placed for a test the hub marks not offered (flag on) | — | 0 | |
| Immediate or resus orders held for payment | — | 0 | |
| Restricted test names visible to the cashier | — | 0 | |
| Specimens marked collected without a matching label (flag on) | all | 0 | |
| Identity mismatches recorded and blocked | — | report | |
| Scan to received, p95 | — | ≤ 1 s | |
| New specimen visible on an open worklist, p95 | refresh only | ≤ 5 s / ≤ 15 s | |
| Working-diagnosis reveals without an access event | — | 0 | |
| High-risk surfaces missing the warning | — | 0 of 6 | |
| Bedside results without device, lot and operator | — | 0 | |
| Bedside results given a diagnostic category by a scheme not naming bedside | — | 0 | |
| Research-use parameters released | — | 0 | |
| `lab_only` parameters in clinician views or prints | — | 0 | |
| Imported values resolvable before two signatures | — | 0 | |
| Released results whose basis or category changed after a set-up edit | — | 0 | |
| Hand-typed NCD HbA1c where an in-house result existed (90 days) | Q11 | 0 | |
| NCD fields filled from a result in a different unit | — | 0 | |
| Clinical numbers in code, seeds or copy | — | 0 | |
| Hazards without a control and a test | — | 0 | |
| Rule IDs without a test | — | 0 | |
| RLS probes passed | — | 100 % | |
| axe serious or critical | S0 | 0 | |
| Red outside signed uses on new routes | — | 0 | |

## 14. GATE A decisions (Fadhul owns; recommendations given)

| # | Decision | Recommendation |
|---|---|---|
| D-LAB2-01 | Flag basis per concept (CSO with the laboratory lead) | Reference interval for every concept, except: haemoglobin (WHO 2024 anaemia scheme with altitude; accepted as the default on 12 Oct 2026), fasting glucose and HbA1c (WHO diagnostic thresholds, lab method only), eGFR and UACR (KDIGO categories), CD4 (WHO categories), HIV viral load (Uganda MoH), lipids (category display only, no flag). Each needs its scheme signed; until then the reference interval stays |
| D-LAB2-02 | Payment mode | `inform` by default: awaiting payment shows, and collection needs a recorded reason. `hold` per hospital where management requires it. Emergencies are never held in either mode, and that is not configurable |
| D-LAB2-03 | Who records payment | Staff with `lab.payment.record` (cashier role). Restricted tests are counted, never named. No prices in this slice |
| D-LAB2-04 | Label mismatch override | None. The path is a new label. A damaged label may be typed; a mismatch can never be overridden |
| D-LAB2-05 | Colour of the high-risk warning | Amber, 2 px border, icon and strong words. Not red: red stays for critical results and the Emergency affordance |
| D-LAB2-06 | Sources of the high-risk warning | The clerking desk's fever-with-bleeding rule under `outbreak_mode`, plus a clinician's manual flag with a reason. Cleared only by a clinician with a reason. The lab cannot clear it |
| D-LAB2-07 | Clinical question | Optional, 280 characters, on the order. **Insert working diagnosis** on request, never automatic; refused for a restricted diagnosis the order does not share |
| D-LAB2-08 | Working diagnosis in the lab | Revealed on demand, audited per reveal, masked when restricted. Never cached on the specimen |
| D-LAB2-09 | Who may record bedside tests | Nurses, midwives and clinicians granted `poct.record` by the laboratory lead. A competency record is a Phase 3 seam |
| D-LAB2-10 | Bedside results and diagnostic schemes | A scheme applies to bedside results only if it names the bedside method. Glucose and HbA1c diagnostic schemes are signed for laboratory methods only. Glucometer readings are for monitoring, and POC HbA1c is for diagnosis only with a device cleared for that use |
| D-LAB2-11 | Bedside HbA1c and other devices | Usable only after the laboratory lead records a verification. A device starts as "Not verified yet" |
| D-LAB2-12 | Expired lots | Refused, no override |
| D-LAB2-13 | Meter range codes (HI, LO) | Coded answers, never numbers. HI glucose prompts the operator to consider a critical mark; it never auto-flags |
| D-LAB2-14 | NCD look-back windows and accepted methods per field | Set and signed by the NCD lead and the CSO. No defaults in code. Bedside fasting glucose accepted, labelled; bedside HbA1c only if D-LAB2-10 allows |
| D-LAB2-15 | Outside results | Plain-factor conversion at entry, original kept, tagged Outside, excluded from lab reports and HMIS |
| D-LAB2-16 | Not-offered tests | Not orderable in-house. The doctor refers the patient through existing referral paths (out of scope) |
| D-LAB2-17 | Unknown availability | Orderable, labelled "Not known today" |
| D-LAB2-18 | Live worklist channel | One private channel per hospital; section filtering client-side over the scoped query |
| D-LAB2-19 | Scan undo window | 5 minutes, an operational setting |
| D-LAB2-20 | eGFR | CKD-EPI 2021 race-free, adults only, IDMS-traceable creatinine only, constants from a signed REF entry. No paediatric eGFR in this slice |
| D-LAB2-21 | Elevation | A hospital setting signed by the CSO, with its source. Empty means no adjustment, stated on each result |
| D-LAB2-22 | Pregnancy context | From a recorded pregnancy status with gestation on or before collection. Never inferred from age, sex or ward |
| D-LAB2-23 | Research import | Drafts only. Verification blockers must be cleared. Disagreeing sources are chosen by the laboratory lead, never averaged. Kit-specific tests are not imported |
| D-LAB2-24 | Restricted classes on tests (CSO) | As CC-8. CrAg not restricted |
| D-LAB2-25 | Test splits | As CC-7 |
| D-LAB2-26 | Analyser profile activation | Only after mapping, confirmations and on-analyser verification (CLSI EP28: 20 samples, at most 2 outside) |
| D-LAB2-27 | HIV algorithm | A versioned configuration signed by the laboratory lead and the CSO, in force from a date. The kit list follows the Ministry of Health's current circular, which the laboratory lead confirms at sign-off |
| D-LAB2-28 | Rollout order | `labCatalogueV2` (import, addendum, profiles) → `labOneMenu` → `labCollectionCheck` and `labHighRiskWarning` → `labBench` → `labPayment` (only at sites that charge) → `labBedside` → `ncdLabFeed` |
| E-LAB2-01 | Availability | Read from the hub at query time over a menu snapshot; never copied into the catalogue |
| E-LAB2-02 | Interpretation | One resolver wrapping Phase 1's `resolveRange`, returning basis, flag or category, adjustments and the reference band for information |
| E-LAB2-03 | Analyser profiles | Data, not code. Specimens are pinned at receipt |
| E-LAB2-04 | Live worklist | A PHI-free hospital channel with a 15-second polling fallback |
| E-LAB2-05 | Bedside | A report kind on the existing report model, not a parallel table |
| E-LAB2-06 | NCD feed | A read model with result references, not copied numbers |
| E-LAB2-07 | Research file | Committed under `docs/`, imported by hash, validated by a Zod schema |

## 15. Out of scope (leave clean seams)

**Roadmap Phase 3 and later:**
- HMIS 105 and registers;
- lab management reports;
- reagents, lots and equipment for the lab bench;
- EQA;
- QC, including bedside device QC and operator competency;
- the referred-test send-out flow and results back (To refer is a list only);
- A-LIS exchange;
- analyser interfaces (profiles are ready for them);
- microbiology workflow;
- blood bank;
- histopathology.

**Not here:**
- prices and billing (payment state is the seam);
- patients seeing results;
- delta checks (the previous value is shown, not judged);
- autoverification;
- pregnancy-specific reference intervals beyond the Hb scheme;
- paediatric eGFR;
- the mobile (Expo) app (Gate CG);
- an offline worklist;
- unit conversion on the bench;
- the WHO child anaemia cut-offs (a gap in the research file);
- a phlebotomy role.

## 16. ADRs (next free numbers)
- One test menu: availability read from the hub, snapshots on order lines.
- Reference intervals versus decision schemes, and the signed flag basis.
- Elevation and pregnancy context in interpretation.
- Analyser profiles and visibility (clinician, lab only, never).
- Methods, IDMS traceability and eGFR as a calculated, versioned result.
- The research import: drafts, verification blockers, disagreeing sources.
- Payment state on the order and the never-held rule.
- Identity at collection and the no-override mismatch.
- Scan to receive and the hospital realtime channel.
- Clinical question versus revealed working diagnosis.
- The high-risk specimen warning: sources, surfaces, clearing.
- Bedside results as a report kind; meter range codes; methods in schemes.
- The NCD feed as a read model; outside results.
- The HIV algorithm as signed configuration.

## 17. Definition of Done
- [ ] G1, G4, G5 (worklist), G7 and G8 resolved; the others confirmed or corrected and recorded.
- [ ] Doctors order from one menu in all three ordering surfaces. Not-offered tests cannot be ordered. Unknown says so.
- [ ] No emergency order has been, or can be, held for payment. The cashier never sees a restricted test's name.
- [ ] No specimen is marked collected without a matching label where the check is on. Mismatches are recorded and blocked.
- [ ] Specimens are received by scan in one action, and appear live on other worklists, with a loud fallback.
- [ ] The high-risk warning appears on all six surfaces and on the downtime form, and only clinicians clear it.
- [ ] Bedside results carry device, lot and operator; expired lots are refused; no unnamed method gets a diagnostic category.
- [ ] The research file is imported as drafts with its sources. Nothing from it flags before two signatures. Verification blockers work.
- [ ] Analyser profiles hide lab-only rows from clinicians and never release research-use parameters.
- [ ] Interpretation snapshots never change after a set-up edit. The Hb scheme applies elevation and recorded pregnancy exactly as signed.
- [ ] The NCD visit fills from released results, never from a different unit, and no in-house HbA1c is typed by hand.
- [ ] No clinical number exists in code, seeds or copy.
- [ ] Every rule ID has a test. RLS probes are green. Event tables are append-only.
- [ ] axe clean. Red-scarcity tests green. Reduced motion honoured.
- [ ] S1–S66 pass. With all flags off, behaviour matches the Phase 1 baseline.
- [ ] The hazard log is complete and signed. User guides, ADRs and the final report exist. The diff on `feat/lab-one-menu` is reviewable.

---

## Appendix A — Copy to be signed (all `draft` until the CSO signs)

| Key | Text |
|---|---|
| Availability, in house | In the lab here · {hours} · usually {turnaround} |
| Availability, referred | Will be referred, result in about {n} |
| Availability, down | Analyser down since {time}. Will be referred, result in about {n} |
| Availability, outside hours | Done from {time} |
| Availability, not offered | Not offered at {hospital} |
| Availability, unknown | Not known today |
| Bedside alternative | Also at the bedside. {test} can be measured on the ward {device kind}. |
| Payment line, ordering | Payment is taken at the cashier before the sample is drawn. An Immediate order is never held for payment. |
| Payment chips | Paid · {receipt} · Insured · Waived · Emergency · not held · Awaiting payment |
| Collect awaiting, inform | Payment not recorded. Give a reason to collect now. |
| Collect awaiting, hold | Payment not recorded. The cashier must record it before this sample is collected. |
| Cashier restricted count | {tests}, and {n} restricted test(s) |
| Cashier footer | Restricted tests (for example HIV or TB tests) are counted, never named, on this screen. |
| Label match | {label} is {patient}, {MRN}. {test}. |
| Label mismatch | {label} belongs to {other patient}, {other MRN}, not {patient}. Do not use this tube. Print a new label for {patient}. |
| Label unknown | No label {label} at this hospital. Check the number or print a new label. |
| Wristband | Wristband checked: name and hospital number match. |
| High-risk block | **High-risk specimen: suspected viral haemorrhagic fever.** Follow this hospital's high-risk specimen procedure before you collect or handle these tubes. |
| High-risk, manual | **High-risk specimen: suspected high-risk infection.** Follow this hospital's high-risk specimen procedure before you collect or handle these tubes. |
| High-risk label box | HIGH-RISK SPECIMEN |
| High-risk form box | HIGH-RISK SPECIMEN: SUSPECTED VIRAL HAEMORRHAGIC FEVER. Follow the hospital's high-risk specimen procedure before handling. Do not open or process on the open bench. |
| High-risk footer, form | MedSync shows this warning because the clerking desk flagged the patient. The testing pathway for suspected viral haemorrhagic fever is set by the Ministry of Health. |
| Scan, received | Received {label} · {test} · {patient} · {time} |
| Scan, already | Already received at {time} by {cadre}. |
| Scan, not found | No specimen with label {label} at this hospital. |
| Scan, not collected | Not marked collected. Check with the ward. |
| Live, on | Live · new specimens appear by themselves |
| Live, paused | Live updates paused. Refreshing every 15 seconds. |
| Working diagnosis, button | Show the working diagnosis |
| Working diagnosis, recorded | You opened this at {time}. Each opening is recorded. |
| Working diagnosis, masked | A diagnosis is recorded that you do not have access to. |
| Basis line, scheme | {result} is flagged against {scheme} at this hospital. The lab's reference interval, {band}, is shown to the doctor for information. |
| Fallback | Flagged on the reference interval: {reason}. |
| Pregnancy not recorded | Pregnancy not recorded: the non-pregnant cut-off was used. |
| Altitude not adjusted | Altitude not adjusted: no elevation is signed for this hospital. |
| eGFR caveat | eGFR assumes creatinine is stable. It is not valid in acute kidney injury. |
| eGFR not reported | eGFR not reported: {reason}. |
| Profile, lab only | {n} kept for the lab only |
| Profile, research use | The analyser's research-use parameters are never imported or released. |
| Bedside, not for diagnosis (glucose) | Not for diagnosis. The diabetes thresholds signed at this hospital apply to laboratory plasma glucose, so a glucometer reading gets no category. |
| Bedside, doctor line | Not for diagnosis: confirm with a laboratory plasma glucose. |
| Bedside, expired lot | Lot {lot} expired on {date}. A result from an expired lot cannot be saved. Use a strip from a current lot. |
| Bedside, HI prompt | The meter reads above its range. Consider marking this result critical. |
| Bedside, not checked | Bedside results are not checked by the lab. |
| NCD filled | {source}, released {date time} |
| NCD read-only | A filled value cannot be typed over. To correct it, the lab amends the result. |
| NCD none | No result in the last {window} |
| NCD unit differs | {value} {unit} on {date} could not be used: unit differs. |
| NCD amended | Updated from an amended result at {time}. |
| Outside result | Outside result · {laboratory} · {date} |
| Draft check | Read {table or page} in the paper before this goes for sign-off. Two readings of the table gave different numbers. |
| Drafts header | Nothing here is in force. A draft is used only after you and the Clinical Safety Officer sign it. |

## Appendix B — Hazard log seed (complete each at Step 1; close each with a test)

For each hazard: cause, effect, control built, the test that proves the control, and residual risk.

1. A sample is drawn into a tube labelled for another patient, and the result is filed on the wrong record.
2. A label is reprinted and the old, wrongly labelled tube is still used.
3. An emergency order is held for payment.
4. The cashier screen reveals a restricted test (HIV, TB, sexual and reproductive health).
5. Availability says "in the lab" when the analyser is down, and a referral is delayed.
6. A not-offered test is ordered and sits forever.
7. A referred specimen is lost between "To refer" and the reference lab (open until Phase 4).
8. A scan receives the wrong specimen, or one from another hospital.
9. The live worklist silently stops updating, and a specimen waits unseen.
10. The working diagnosis reveals a restricted condition to a technologist.
11. A high-risk specimen reaches the open bench without a warning.
12. A high-risk warning is cleared wrongly, or never shown on one surface.
13. A bedside result comes from an expired strip or an unverified device.
14. A bedside glucose is read as a diagnosis of diabetes.
15. A meter's HI or LO is typed as a number.
16. An analyser profile maps GRAN to neutrophils, and neutropenia logic is fed wrong data.
17. A research-use parameter is released as a clinical result.
18. A flag basis or scheme change silently changes old results.
19. A wrong elevation misclassifies anaemia across the hospital.
20. Pregnancy status is wrong or missing, and the wrong Hb row is applied.
21. eGFR is shown in acute kidney injury and read as stable function.
22. eGFR is calculated from a non-traceable Jaffe creatinine.
23. A researched draft is signed with unverified numbers (the Lugada CD4 case).
24. Two disagreeing sources are averaged or silently chosen.
25. The troponin split leaves old results unreadable or mislabelled.
26. D-dimer FEU and DDU are mixed, and a cut-off is applied to the wrong basis.
27. An NCD field is filled from a result in another unit, or from an outdated or amended version.
28. An outside result is counted in hospital lab reports or HMIS.
29. The HIV algorithm version changes, and old outcomes are re-derived.
30. The dual RDT's HIV line is taken as a final HIV diagnosis.

## Appendix C — Sign-off packs (templates only; pre-list the research drafts and their sources; propose no other values)

- **Concept addendum.** Columns:
  - concept id;
  - existing or new;
  - display;
  - type;
  - unit;
  - other units and factors;
  - answers with abnormal;
  - role;
  - measurement;
  - LOINC (verified or not);
  - laboratory lead note;
  - CSO decision.
- **Decision schemes, per concept.** Columns:
  - applies to (sex, age, context);
  - categories with bounds and inclusivity;
  - methods;
  - adjustments;
  - source and page;
  - laboratory lead note;
  - CSO decision.

  The research file holds drafts for haemoglobin (WHO 2024), fasting glucose and HbA1c (WHO; ADA alternatives), eGFR and UACR (KDIGO 2024), CD4 (WHO), HIV viral load (Uganda MoH 2022; WHO 2023), and lipids (ATP III; ESC/EAS).
- **Flag basis.** One row per concept: reference or scheme, and why.
- **Elevation.** Metres, source, date, CSO.
- **HIV algorithm.** Version, in force from, ordered assays with kit names, the rule table, retest interval, the circular it follows, signatures.
- **Restricted classes.** Test, class, reason, CSO.
- **NCD field mappings.** Field, concept, unit, accepted methods, look-back window, NCD lead, CSO.
- **eGFR reference.** Equation, constants, source page, CSO.
- **Analyser verification.** Analyser, concept, 20 local samples, number outside, accept or reject, laboratory lead.

## Appendix D — Sources checked (12 Oct 2026; re-verify at build time)

- **MedSync lab catalogue research v1**, with its notes. It holds:
  - 119 concepts, 64 range sets and 497 bands, each with its source;
  - spot-checks against Eller 2008, Karita 2009 and Lugada 2004;
  - the Lugada CD4 verification flag.

  `docs/lab/phase-2/lab-catalogue-research.v1.json` and `LAB-CATALOGUE-RESEARCH-NOTES.md`.
- **WHO 2024, *Guideline on haemoglobin cut-offs to define anaemia in individuals and populations***, as summarised by Guideline Central. It gives:
  - adults 15–65 years: < 120 g/L non-pregnant women and < 130 g/L men;
  - pregnancy: < 110 / < 105 / < 110 g/L by trimester;
  - an altitude adjustment of 8 g/L at 1,000–1,499 m.

  The WHO PDF itself was not opened; read it before signing. https://guidelinecentral.com/guideline/3534081
- **ISO 15189:2022.**
  - 7.2.4 covers sample collection.
  - 7.2.6 covers sample receipt.
  - 7.3.5 covers biological reference intervals and clinical decision limits.

  The point-of-care requirements of ISO 22870 are folded into ISO 15189:2022, with Annex A summarising them, and ISO 22870 is replaced as of December 2025.
  - https://info.s4dx.com/wp-content/uploads/2025/05/ISO-15189_2022_S4DX_May25.pdf
  - https://thebiomedicalscientist.net/science/point-care-testing-and-new-iso-151892022
- **Point-of-care HbA1c for diagnosis.** ADA's recommendation, as reported from a joint ADA–AACC session, limits POC A1C for diagnosis to assays cleared for that use, in the setting they are cleared for. https://www.adameetingnews.org/experts-debate-efficacy-of-point-of-care-a1c-for-diabetes-diagnosis-in-joint-ada-aacc-session
- **CKD-EPI 2021 creatinine equation** (race-free), from the National Kidney Foundation page cited in the research file. Load its constants into the signed REF entry from that page at build time. https://www.kidney.org/ckd-epi-creatinine-equation-2021-0
- **KDIGO 2024 CKD guideline:** the GFR categories G1–G5 and albuminuria A1–A3, as cited in the research file with table and page.
- **Uganda Consolidated HIV guidelines 2022:** the serial algorithm (Determine → Stat-Pak → SD Bioline tie-breaker), as cited in the research file. A November 2024 Ministry of Health circular changed the kits; this was seen only in a May 2025 news report. The laboratory lead confirms the kits in force at sign-off (D-LAB2-27).
- **WHO malaria microscopy SOPs (MM-SOP-08/09, 2016):** density counted against 200 or 500 white cells, assuming 8,000/µL when the patient's count is unknown, as cited in the research file. This informs the bedside and bench malaria answer sets.
- **CLSI EP28-A3c**, as summarised in the Phase 1 sources: verify a transferred interval on 20 local samples, accepting it if no more than 2 fall outside.
