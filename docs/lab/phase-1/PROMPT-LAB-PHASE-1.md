# PROMPT: Lab Phase 1 — the safety floor (critical alerts, fixed units, reference ranges, downtime, one result path)

> **For Claude Code.** Work at the repo root on a new branch `feat/lab-safety-floor`, cut from the branch where `feat/lab-front-door` (lab Phase 0) has merged. If Phase 0 has not merged, **STOP at Step 0**: this slice depends on its lab permissions, navigation registry and `criticalFlaggingActive`. First copy this prompt into `docs/lab/phase-1/`.
>
> **Mode:** gated. Nine steps (0–8), each ending in a **STOP**. They are called steps because "Phase 1" already names this slice of the lab roadmap.
>
> - Documents use Stage 1: draft → critique against the checklist → revise (max two passes) → present → STOP.
> - Code uses Stage 2: build → run the real checks → fix → re-run until green → report numbers → STOP.
> - Self-refinement never replaces a real check.
>
> **Assume nothing in this slice is built.** Section 3 lists what an earlier code read claimed. Verify every line. Build what Step 0 proves is missing; reuse what it proves exists.
>
> **The CSO is Fadhul.** This slice is clinical safety work. Nothing in it reaches a production hospital without his signature on: the critical limits, the response times, the reference ranges, who may acknowledge, every string a clinician reads in an alert, and the hazard log (Section 14, Appendix A, Appendix B).

---

## 0. What we are building, in one paragraph

Today a critical result leaves the lab silently. Nothing flags it, nobody is told, and the doctor finds it only by opening the results page. Units and reference ranges are typed by hand on each result, the lab stops when the network stops, and a hospital can run two different result paths. This slice builds the floor a hospital must stand on before it uses the lab for real patients. **A technologist can mark a result critical, and that mark reaches a doctor, is acknowledged or escalates, and is never lost.** Once limits are signed, MedSync flags critical values itself. Every result carries **a unit fixed by the catalogue** and **a range from a signed store**. The lab can **work on paper during downtime and enter results afterwards with their true times**. And each hospital is moved onto **one result path**.

**Done when:** every result marked critical has an alert, and an acknowledgement or an escalation, inside the signed time. No result is released without a catalogue unit. The site has run one downtime drill.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt, the roadmap and the design canvas. Report every disagreement at STOP 0.
2. **The plan:** the _MedSync Laboratory Roadmap_, version 2, "Phase 1: The safety floor" and "The floor: six conditions" (https://claude.ai/artifact/SQPdW66RcaAnu3QWQTYVTw).
3. **The UI reference:** the design canvas _Lab Phase 1 UI Preview_ (https://claude.ai/artifact/HUw8JeHp5qin66iZ8hC3Kv). Artboards 1–14 are this slice. Section 5 names the artboard for each screen.
   - The canvas is drawn in MedSync Chroma. Build with the design system in force on this branch (Law 14).
   - Every patient, range, limit, response time and code on the canvas is **an example and not a signed value**. Copy none of them into code or seeds.
   - Where this prompt and the canvas differ, this prompt wins. The known differences are listed in 5.10.
4. **Design and decisions:** `DESIGN-medsync.md`, ADR 0097 (plum = place), ADR 0077 (two-step validation and its open follow-up), HARMONISATION §9, Owner Runbook §8, and the lab Phase 0 ADRs (access model, worklist, turnaround, flagging state).
5. **Prompts this builds on** (read the copies under `docs/`):
   - `PROMPT-LAB-PHASE-0.md` (permissions, navigation registry, `criticalFlaggingActive`, the notice);
   - `PROMPT-DOCTOR-WORKSPACE-UNIFIED.md` (lane registry §5.7, the page header and Emergency affordance §5.6, Law 6 on red, live updates E2, `patients.deceased_at` D2);
   - `PROMPT-CLERKING-DESK-V2.md` and `PROMPT-CLERKING-EXAM-V2.md` (signed references: `REF-*` entries with a source and a status; "a rule whose reference is unsigned does not fire"; restricted classes; plausibility confirm; decimal commas);
   - `PROMPT-NCDSYNC-BUILD-v2.md` (the SMS provider interface, template statuses with two-person approval, the banned-term scan, the hazard log);
   - `PROMPT-HOSPITAL-SERVICES-HUB.md` (heads and in-charges, print CSS only, four-eyes, "informs, never blocks");
   - `PROMPT-RESUS-DESK-V2.md` §8–9 (the action contract, notification failures never throw).
6. **Code:** `app/lab/**`, `app/doctor/**` (workspace, `/doctor/results`, acknowledgement), `lib/lab/**`, `lib/emr/**` (orders, specimens, `diagnostic_reports`, `lib/emr/fhir.ts`), `test_catalogue`, the signed-reference module, the notification and SMS modules, the four-eyes module, the realtime setup, the scheduler (if any), `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

1. **Engine-first.** Every surface here reads or writes an engine with real tables, real RLS policies and passing tests, built in an earlier step than the surface.
2. **An alert sent is not an alert received.** The system never says or implies that a doctor knows until a doctor has acknowledged, or the lab has logged a phone call with read-back to a clinician. "Sent", "seen" and "acknowledged" are three different words on screen and three different events in the record.
3. **A critical is never lost.** An open critical alert leaves every list only through acknowledgement. Nothing auto-closes, expires or is filtered out. At the last escalation level it stays open and visible.
4. **Fail loud, not silent.** If a notification cannot be queued, a recipient cannot be resolved, a response time is unsigned or the escalation job is behind, the lab sees it in words at once and is told to phone. Release of the result still succeeds.
5. **No remembered numbers.** Critical limits, response times, reference ranges and entry-check bands come only from signed, versioned, sourced data. An unsigned limit never fires. Nothing in code, seeds or copy carries a clinical number. Test fixtures use invented limits and ranges, named as fixtures.
6. **No treatment advice.** An alert shows the value, the unit, the range, the lab's check and the lab's note. No dose, no drug, no instruction to the clinician, anywhere.
7. **No patient details off the platform.** SMS and any push text never name the patient, the test or the value. Prove it with the banned-term scan.
8. **The record keeps what was true.** Each result stores a snapshot of its unit, its range band and, when flagged, its limit and version. Later changes to the catalogue, ranges or limits never rewrite a released result.
9. **True times.** A result entered after downtime keeps the collection and result times written on the form, and says that it was entered afterwards. Elapsed times use the server clock.
10. **Red is a safety property.** Red appears on critical result values (existing meaning) and on the Emergency affordance. This slice adds one use, the critical-result alert, **only as GATE A signs it (D-LAB1-18)**. Late, overdue, unsigned and "not sent" are **amber** with an icon and a word. Workflow states are neutral chips. Extend the red-scarcity tests to every new component.
11. **Two identifiers everywhere** a patient appears, including the alert, the panel, the lists and the back-entry screen.
12. **Restricted classes stay restricted.** A result in a restricted class (`hiv`, `tb`, `mental_health`, `sexual_reproductive_health`) is alerted in the app only to clinicians with access, and is excluded from SMS, push, prints for patients and exports.
13. **Informs, never blocks care.** No alert, flag or missing range stops a clinician ordering, treating or acknowledging. The only hard stops in this slice protect the record: no release without a catalogue unit, and no release of an auto-flagged critical without a recorded check.
14. **Behind flags, stack as found.** Three per-hospital flags, off by default: `labCriticals`, `labUnitsRanges`, `labDowntime`. With all three off, behaviour matches the Phase 0 baseline. Use the ORM, package manager, flag mechanism and design tokens on the branch. TypeScript strict, no `any`. Zod on every action. AAL2. No new dependencies without stopping to flag. Tokens only, no hex. Chroma arrives through its own branch (D-CV-11).
15. en-GB throughout. The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU) wherever copy mentions it.

---

## 3. What the earlier code read claimed (verify every line at Step 0)

| #   | Claim                                                                                                   | Where                           | Severity                   |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------- |
| F1  | A critical call can be recorded. All limits are unsigned, so nothing flags                              | lab result screen, `REF-CRIT-*` | **Safety**                 |
| F2  | The notification fan-out for criticals is a TODO                                                        | `app/lab/actions.ts:219`        | **Safety**                 |
| F3  | A critical result is released like any other. Nobody is told                                            | release action                  | **Safety: fails silently** |
| F4  | Preliminary then final exist, but the same person can do both. No second check for criticals            | ADR 0077                        | Safety                     |
| F5  | The reference range is typed by the technologist on each result                                         | result entry                    | Safety, data               |
| F6  | Whether a unit is fixed per test was not assessed. `lib/emr/fhir.ts` maps specimens and reports to FHIR | `test_catalogue`, FHIR map      | Safety, data               |
| F7  | Doctors review at `/doctor/results` with batch acknowledgement and "results to review" lanes            | doctor workspace                | Context                    |
| F8  | No downtime procedure was found                                                                         | —                               | Continuity                 |
| F9  | With `EMR_V1` off, `/lab` falls back to an older one-value-per-order table                              | `/lab`                          | Two result paths           |
| F10 | The worklist refreshes on action only. Realtime broadcasts on `chart:<patient>` only (migration 0073)   | realtime                        | Alerts need a channel      |
| F11 | The catalogue holds 44 tests                                                                            | `test_catalogue`                | Context                    |

---

## 4. Design direction

**Seven rules**

1. **Three words, never blurred:** sent, seen, acknowledged (Law 2).
2. **One tap to acknowledge.** A doctor in the middle of a ward round can acknowledge in one tap and add nothing.
3. **The technologist sees the numbers while confirming.** Marking a result critical happens in a panel beside the results, never in a pop-up that hides them.
4. **The lab always knows who has not answered.** One list, open criticals first, with the clock in words.
5. **Type the number, nothing else.** Units and ranges come from the system. The technologist types a value.
6. **Say when the system cannot help.** No range for this age. No limit signed. Alert not sent. Each is a sentence on screen, never a blank.
7. **Paper is a first-class path.** The downtime form mirrors the screen, and entering it afterwards takes less time than writing it did.

**Budgets** (measured at Step 0 where a baseline exists; met by Step 8)

- Taps for a doctor to acknowledge from the alert: **1**.
- Taps for a technologist from "result typed" to "released and alerted", with a repeat recorded: **≤ 4**, plus the repeat value.
- Release of a critical → alert visible on the ordering doctor's open workspace: **≤ 5 s** p95 with realtime, **≤ 15 s** with polling.
- Past the signed time → escalation event written: **≤ 60 s**.
- Units typed by hand: **0**. Ranges typed by hand once a range is signed: **0**.
- Back-entering one paper form with four results: **≤ 90 s** in the timed trial.
- Critical marks without an alert: **0**. Open alerts past the last level without an event: **0**.

---

## 5. Interface specification

### 5.1 Result entry: units, ranges and flags (artboards 1 and 4)

- **The result field** takes a number only. Decimal commas are accepted as decimal points. The catalogue's decimal places format the display; they never round the stored value silently: a value with more decimals than allowed is rejected with the fix ("Potassium takes 1 decimal place").
- **The unit** is read from the catalogue, shown beside the field with a lock mark, and cannot be typed or changed here.
- **The reference range** comes from the range store for this patient's sex and age at collection (6.2). States:
  - a signed band applies: the range is shown;
  - no band covers the patient: _"No range for this age"_; no flag;
  - sex or date of birth is missing and only sex- or age-specific bands exist: _"No range: sex or age not recorded"_; no flag;
  - the test has only an unsigned draft: D-LAB1-09 decides (recommended: the technologist types the range as today, and the result is marked _"unsigned range"_).
- **The flag** is computed: High, Low or In range. Out-of-range values use the existing out-of-range value style with an arrow and the word. The technologist may change a flag with a reason; the doctor then sees _"Flag changed by the lab: {reason}"_.
- **The entry check.** If the catalogue holds an entry-check band and the typed value is outside it, the screen asks _"{value} {unit} is outside the usual entry range for {test}. Confirm this is the value on the analyser."_ One confirm tap. The confirm is recorded.
- **A test with no unit** cannot be resulted. The row says who can fix it and links to the catalogue for a viewer with `lab.manage`.
- **The notice** (from Phase 0) reads from `criticalFlaggingActive`. With `labCriticals` on:
  - false: the amber notice, with the Phase 1 wording in Appendix A ("…mark critical results by hand"). With `labCriticals` off, the Phase 0 wording stays;
  - true: a neutral line, _"Critical limits are signed. MedSync flags critical values itself. You can still mark any other result critical by hand."_
- **Mark critical.** Every row with a value has the action. It is a quiet secondary button on out-of-range rows and sits in the row's overflow on in-range rows.
- **With limits signed (artboard 4):** a value at or beyond a signed limit shows the Critical status pill in its row at once, and the footer reads _"1 critical value needs a check before release."_ The primary button becomes **Check and release**. Releasing without the check is refused on the server.
- **Footer:** Save as preliminary · Release final (or Check and release).

### 5.2 Marking a result critical (artboard 2)

The right-hand column becomes the **Mark as critical** panel. The results stay visible and locked while it is open.

- **Head:** the value, unit and direction, large; then the test and its reference range.
- **Check before release** (one choice required):
  - _Repeated on the same sample_, with the repeat value (same unit, same validation);
  - _Sample checked, not repeated_;
  - _Could not check_, with a coded reason: not enough sample · analyser down · no reagent · other (with text).
- **Sample checks:** one checkbox, wording signed (Appendix A).
- **If the repeat changes the picture:** the technologist chooses **Edit results**, corrects the value, and the mark is cancelled with the reason recorded. The panel never releases a value other than the one in the result field.
- **Who is alerted:** the resolved recipients for level 0 and the first escalation, by role and place, with the escalation time shown as a clock time (6.5, 6.6). If a level resolves to nobody, the panel says so in amber: _"Nobody is set up to receive this at the next level. Phone the ward now."_
- **Note to the doctor:** optional, 280 characters. Shown verbatim to the doctor as "From the lab".
- **Second check** (only when the hospital setting is on, D-LAB1-06): a second lab user with `lab.result.release` confirms with their own sign-in. _Working alone_ records a reason and proceeds.
- **Buttons:** Cancel · **Release and alert**.
- **After release:** the panel is replaced by the alert's status (5.3), never by a bare success message. If the alert could not be queued: an amber block, _"Released. The alert was NOT sent. Phone the ward now and log the call."_

### 5.3 Criticals: the lab's list and the call log (artboard 3)

- A new navigation item, **Criticals**, registered through the Phase 0 registry, with a neutral count of open alerts.
- **The list:** open alerts first (longest open first), then alerts acknowledged today. Columns: Patient · Result · Marked · Alert.
- **The Alert cell, in words:**
  - `Sent · waiting 3 min`, neutral;
  - `Not acknowledged · 6 min`, amber, once past half the signed time (D-LAB1-19) or any time after the signed time;
  - `Escalated 10:57 · waiting`, amber;
  - `Not sent · phone the ward`, amber;
  - `Acknowledged 10:59 by {cadre}`, neutral;
  - `Acknowledged by phone 10:48 · logged by {cadre}`, neutral.
- **The detail panel:** two identifiers; the timeline of events (6.4), each with its time and actor; then **Log a phone call**:
  - _Who did you speak to?_ A staff search limited to this hospital, plus "Someone not on MedSync" with name and role as text;
  - _They read the result back correctly_ (checkbox);
  - **Log call**. A call with read-back to a clinician who may acknowledge stops the escalation clock (CA-9). A call to anyone else is recorded as _Ward informed_ and does not;
  - **Could not reach anyone**: escalates at once.
- Acknowledged alerts leave the list at hospital-local midnight and stay on the patient's record and in the audit trail.

### 5.4 The doctor's alert (artboards 5, 7 and 8)

- **Where it appears:**
  - a pinned alert at the top of the doctor Workspace, above every lane, for each open critical the viewer is a recipient of;
  - a **Critical results** lane through the lane registry, placed after Resus, listing the viewer's open alerts and, for heads and contacts, their department's;
  - a count in the page header of every doctor page while any alert is open for the viewer;
  - on the patient's chart, for any clinician who opens that patient while the alert is open, whether or not they were a recipient;
  - if `doctorWorkspace` is off at a hospital: the pinned alert renders at the top of `/doctor/results` and of the doctor home, and the header count still shows.
- **The alert says:** _Critical result: {test} {value} {unit}, {high|low}._ Then two identifiers, the place, who marked it and how long ago. Buttons: **Acknowledge** (primary) · Open chart.
- **The detail panel:** the whole report with ranges and flags; "From the lab" (the check and the note); then **Acknowledge**:
  - three one-tap responses, wording signed: _Reviewing the patient now_ · _Asked the ward team to act_ · _Already aware_;
  - an optional note;
  - **Acknowledge** works with no response chosen (the default is recorded as "Acknowledged");
  - **Call the lab** shows the lab's number from the hospital's settings as text. If none is set, the button is absent.
- **After acknowledging:** the alert collapses to one neutral line for the rest of the shift (_"Acknowledged 10:59"_) with Open chart. The report also counts as reviewed (CA-12).
- **Escalated alert (artboard 8):** the title is _Escalated to you_, with an amber line, _"Not acknowledged for {n} minutes by {role, place}."_ The timeline is shown. The primary button is **Acknowledge and take over**.
- **Corrected result:** if the lab amends a result that was alerted, every recipient so far gets a new alert, _Corrected result_, showing the old and new values. It needs its own acknowledgement (CA-10).
- **Phone (artboards 7 and 8):** this is the responsive web Workspace at 390 px. Sticky footer with Acknowledge at 48 px; the responses stack. **No Expo work in this slice** (Gate CG is open).
- **Announcements:** a new alert is announced once in an assertive live region, rate-limited. No sound, no flashing.

### 5.5 Messages (artboard 6)

- **SMS** goes at the same time as the in-app alert, through the existing SMS provider interface. Live sending is a hospital setting, **off by default**; with it off, the logging mock is the transport and the lab's panel says _"SMS is off at this hospital. Phone the ward."_
- **Templates** (Appendix A) carry a status: `draft` → `approved` by two different users. Only approved templates send.
- **No patient, test or value** in any template. The message names the ward or department and asks the reader to open MedSync or call the lab.
- **Push** is specified (same text) and **not built**: it arrives with the mobile app after Gate CG.

### 5.6 Set-up: the test catalogue (artboard 9)

For viewers with `lab.manage`. Registered under a **Set-up** group in the lab navigation.

- **The table:** Test · Section · Result type (Number, Positive or negative, Text) · Unit · Decimals · LOINC · State (Ready, Needs a unit).
- **The panel:**
  - **Unit:** chosen from a UCUM-coded list, shown in clinical notation (`µmol/L`, `×10⁹/L`). Once any result exists for the test, the unit is locked; **New version** creates a new version of the test, and old results keep theirs (UN-4);
  - **Decimal places**;
  - **LOINC code:** optional, validated against the imported LOINC table, shown with its long name;
  - **Entry check:** an optional low and high. Values outside ask for a confirm (5.1).
- A header chip counts tests that cannot be resulted yet.
- Section, name and where the test is offered stay with the Departments and services hub. This page edits measurement facts only (one store per fact).

### 5.7 Set-up: reference ranges (artboard 10)

- **Left to right:** the editor for one test; a list of tests with their state (Signed {date}, Draft, No range, Needs a unit); a preview, _What the technologist sees_, for three example patients.
- **Bands:** Sex (Female, Male, Any) · Age from · Age to · Low · High · Source. Either bound may be empty (a one-sided range). Ages are entered in days, months or years and stored in days.
- **Validation:** bands for the same sex must not overlap. Gaps are allowed and are listed in a neutral notice with what the technologist will see for a patient in the gap.
- **Sign-off:** two signatures, the laboratory lead and the CSO, each with a fresh second factor. Any edit after signing creates a new draft version; the signed version stays in force until the new one is signed.
- **Source** is required for every band (for example, the kit insert and how it was verified locally).

### 5.8 Set-up: critical limits, response times and contacts (artboard 11)

- **The limits table:** Test · Unit (from the catalogue) · Applies to (All ages, or an age band) · Critical at or below · Critical at or above · Reference id · Source. An empty limit never fires.
- **Response times:** _Acknowledge within {n} minutes_; then each escalation level with its recipients and its own time. All values are typed by the hospital and signed. The page ships with **no defaults**.
- **Critical-results contacts** (not on the canvas; build it on this page): per department, an ordered list of staff for escalation level 1, defaulting to the head of department from the hub; and a hospital-level list for level 2. A department with no level-1 contact shows amber, _"Nobody will receive escalations for {department}."_
- **Sign-off:** the same two signatures as ranges. Limits and response times are signed as two separate sets, so response times can be signed first and hand-marked alerts can go live before any limit exists.
- **The banner** states the truth for this hospital: not signed, so MedSync does not flag automatically; or signed, with the date and version.

### 5.9 Downtime (artboards 12 and 13) and cut-over (artboard 14)

**The paper form (12).** A4, print CSS only, black on white, legible in greyscale, no PDF dependency. Sections: Patient · Request · Specimen · Results (test, result, unit, range used, high or low) · Critical result (phoned to, time, read back) · Release and entry. **Print blank forms** reserves a run of form numbers on the server and prints one number on each sheet (DT-2).

**Downtime entry (13).** A navigation item, **Downtime entry**, with a count of forms still to enter.

- **Record a downtime:** start, end and reason (network, power, system, other). Recorded after the event by any lab user.
- **Enter a form:** the form number; the patient, found by MRN or name (a patient who is not registered cannot be created here: _"Register this patient at reception first"_); the test; _Collected, from the form_; _Result time, from the form_; _Released on paper by_; then the same results table as 5.1, with the same units, ranges, flags and entry checks.
- **Was any result marked critical on the form?** If yes: who was phoned, their role, the time, and whether they read it back. If nobody was phoned, saving opens a live alert now (DT-6).
- **Buttons:** Save · Save and next form. The footer shows _"Saved as: resulted 13:40, entered 14:52."_
- **How the doctor sees it:** the result carries a neutral tag, _Entered after downtime_, with _"Resulted 13:40 · entered 14:52 · paper form DT-00031"_.
- **Record a drill:** date, who took part, what was done, problems found. A drill writes no patient record.

**One result path (14).** In the hospital admin's Departments and services area, under Laboratory. Four conditions, each with its state and its action: the old list is clear · set-up is complete · a downtime drill is recorded · the lab and wards are briefed. **Switch to the new path** opens only when all four are met and needs a second approver through the existing four-eyes mechanism. After the switch the old list is read-only (CO-4).

### 5.10 Navigation, flags and known differences from the canvas

- **Lab navigation after this slice:** Worklist · Criticals · Released today · Rejected · Downtime entry, then **Set-up:** Test catalogue · Reference ranges · Critical limits. Each item appears only when its flag is on and the viewer holds the permission.
- **Flags:** `labCriticals` (5.2–5.5, 5.8) · `labUnitsRanges` (5.1, 5.6, 5.7) · `labDowntime` (5.9 downtime). Cut-over is not a flag: it is the audited switch of `EMR_V1` for one hospital.
- **Differences from the canvas, where this prompt wins:**
  - "Senior on call" on the canvas means the level-1 critical-results contact. MedSync has no on-call roster;
  - the push notification is not built;
  - the phone artboards are the responsive web, not the mobile app;
  - the sidebar's "Find a specimen" box is not built (roadmap Phase 2);
  - the limits table gains an "Applies to" column;
  - the contacts editor in 5.8 has no artboard.

---

## 6. Engines (pure, no I/O unless stated; every rule has an ID and at least one test)

### 6.1 Units and the catalogue (`lib/lab/catalogue.ts`)

- **UN-1** Every numeric test component has exactly one unit: a UCUM code and a display string. A component without one cannot be resulted.
- **UN-2** A result stores the value, the unit code, the display unit and the component version at the moment of entry. These never change after release.
- **UN-3** Values are stored at full entered precision as a decimal, never as a float. Display follows the component's decimal places.
- **UN-4** A unit can change only by creating a new component version. Results on the old version keep it. **No value is ever converted** between units by the system.
- **UN-5** `parseResultInput` accepts decimal commas, rejects anything that is not a number, and rejects more decimals than the component allows. It is pure and tested at the edges (empty, "7,2", "7.20", "<0.1", "-", exponent forms).
- **UN-6** The entry check: outside the band needs a recorded confirm. With no band there is no check.
- **UN-7** LOINC is optional per component. A code must exist in the imported table. The FHIR mapping emits the LOINC code and UCUM unit when present, and never invents either.
- **UN-8** Results that predate this slice (typed units and ranges) are shown as typed, marked _"unit as typed"_. They are never parsed into the new fields.

### 6.2 Reference ranges (`lib/lab/ranges.ts`)

- **RR-1** `resolveRange({ componentVersion, hospital, sex, ageDaysAtCollection, at })` returns one band, or a reason: `no_band_for_age`, `sex_or_age_missing`, `no_signed_range`, `not_numeric`.
- **RR-2** Only a signed, in-force version is used. Draft versions are invisible to the resolver.
- **RR-3** A sex-specific band beats an "Any" band for the same age. Two matching bands of equal standing is a data error: the resolver returns none and reports it.
- **RR-4** Age is taken at **collection**, in days. Boundaries: `from` is inclusive, `to` is exclusive.
- **RR-5** A missing date of birth or sex resolves only to bands that do not need it.
- **RR-6** The range's unit is the component's unit. A mismatch makes the version unsignable.
- **RR-7** The resolved band (low, high, band id, version) is stored on the result as a snapshot.
- **RR-8** The adult range is never used for a child, and no band is extended beyond its ages.

### 6.3 Flags (`lib/lab/flags.ts`)

- **FL-1** `computeFlag(value, band)`: Low if value < low; High if value > high; otherwise In range. Bounds are inclusive of normal. A one-sided band flags one side only.
- **FL-2** No band, no flag.
- **FL-3** A manual flag change stores the computed flag, the chosen flag, the reason and the actor.
- **FL-4** `evaluateCritical(value, limits)`: critical low if value ≤ the low limit; critical high if value ≥ the high limit. Only signed, in-force limits for this hospital, this component version, this unit and this patient's age are used.
- **FL-5** A limit whose unit differs from the component's unit is invalid and never fires. Set-up shows the error.
- **FL-6** No limit covers the patient's age: not auto-flagged, and the row says _"No critical limit for this age"_.
- **FL-7** Coded and text results are never auto-flagged in this slice. They can be marked by hand.

### 6.4 Critical marks and alerts (`lib/lab/criticals/**`)

**Marks**

- **CM-1** A mark belongs to one result component on one report. Source: `manual` or `auto`. An auto mark stores the limit id, version and direction.
- **CM-2** A mark is committed only in the same transaction that releases the report as final. There is no marked-but-unreleased state outside the open panel.
- **CM-3** Every mark carries its check: `repeated` (with the value), `checked_not_repeated`, or `could_not_check` (with a reason), plus the sample-checks answer, the actor and the time. An auto-flagged value cannot be released without one.
- **CM-4** A technologist cannot remove an auto mark. They can correct the value; if the corrected value is not critical the mark does not arise.
- **CM-5** With the second-check setting on: a second lab user with release permission, different from the first, confirms; or the solo reason is recorded.

**Alerts**

- **CA-1** One alert per released report that has at least one mark. Several critical components on one report share one alert.
- **CA-2** States: `open` → `acknowledged`. Sub-state while open: `sent`, `not_sent`, `escalated(level)`. There is no `expired`, `dismissed` or `closed` state.
- **CA-3** The alert is created in the release transaction. Delivery is queued after commit. **A delivery failure never rolls back or throws** (Law 4).
- **CA-4** Events are append-only: `created`, `notified` (recipient, channel, outcome), `seen` (recipient), `call_logged`, `could_not_reach`, `escalated` (level, recipients), `acknowledged` (actor, response, note, via), `corrected`.
- **CA-5** `seen` is written when a recipient's client renders the alert's detail. It is never shown to the lab as acknowledgement.
- **CA-6** Acknowledgement is allowed to a clinician at the same hospital who may order tests (D-LAB1-03), whether or not they were a recipient. The first acknowledgement wins; a second attempt returns the first, unchanged.
- **CA-7** Acknowledgement records the actor, the time, the response code (or none), the note and the channel (`app`).
- **CA-8** Idempotency: a repeated release or acknowledge with the same client key returns the existing row. A double tap creates one alert and one acknowledgement.
- **CA-9** A logged phone call with read-back to a clinician who may acknowledge sets the alert to `acknowledged` with `via: phone`, naming that clinician and the lab user who logged it. The named clinician sees _"The lab recorded your phone acknowledgement at 10:48"_ and can dispute it, which reopens the alert at its current level. A call to anyone else writes `call_logged` and changes no state.
- **CA-10** Amending a report that has an alert writes `corrected` and creates a linked **correction alert** to every recipient notified so far and to whoever acknowledged. It follows the same rules, whether or not the new value is critical.
- **CA-11** An alert for a patient recorded as deceased or discharged is still created and routed. Nothing suppresses a critical.
- **CA-12** Acknowledging the alert also records the report as reviewed by that clinician, through the existing acknowledgement action. A report with an open critical alert is excluded from batch acknowledgement.
- **CA-13** Every critical alerts, including a repeat critical for the same patient and test. No suppression rule exists in this slice (D-LAB1-15).
- **CA-14** Property tests: every mark has exactly one alert; no alert exists without a released report; no sequence of events reaches a state outside CA-2; every open alert past its due time has an `escalated` event or is at the last level.

### 6.5 Recipients (`lib/lab/criticals/recipients.ts`)

- **RC-1** Level 0: the clinician who placed the order, and the patient's current responsible clinician if different (the active assignment or the open encounter's owner).
- **RC-2** Level 1: the ordering department's critical-results contacts, in order.
- **RC-3** Level 2: the hospital's critical-results contacts.
- **RC-4** A recipient who is deactivated, has left the hospital or cannot open the result (restricted class) is skipped and listed as skipped.
- **RC-5** A level that resolves to nobody is reported to the lab in words, and the alert moves to the next level at once. If every level is empty, the alert is `not_sent` and the lab is told to phone.
- **RC-6** Recipients are resolved at the moment of sending and stored on the event. A later change of contacts does not rewrite history.
- **RC-7** The ward's nurse in charge may be added as an **informed** party who cannot acknowledge (D-LAB1-05). Informed parties never stop the clock.

### 6.6 Escalation (`lib/lab/criticals/escalation.ts`)

- **ES-1** `dueAt = sentAt + the signed "acknowledge within"`. Each level has its own signed time. **With no signed response times there is no automatic escalation**: the lab's panel says so, and "Could not reach anyone" still escalates by hand.
- **ES-2** `runEscalations(now)` is a pure planner over open alerts, plus a thin executor that writes events and queues deliveries. It is idempotent: running it twice for the same `now` writes nothing new.
- **ES-3** It is called three ways: by the production scheduler every minute; lazily on every read of alerts; and by tests with a fixed clock. If the branch has no scheduler, **STOP and flag** at Step 0; do not rely on browsers to run it.
- **ES-4** At the last level the alert stays open and is listed for the lab, the department's contacts and the hospital's contacts until someone acknowledges.
- **ES-5** A heartbeat records each scheduler run. If the last run is older than 3 minutes, the lab's Criticals page shows amber: _"Escalations may be delayed. Phone the ward for any open critical."_ (The 3 minutes is an operational setting, not a clinical number.)

### 6.7 Messages (`lib/lab/criticals/messages.ts`)

- **MS-1** One renderer per channel takes the alert kind and the place, and nothing else about the patient.
- **MS-2** The banned-term scan runs in CI over every template and every rendered fixture: patient names from fixtures, MRN patterns, every catalogue test name and synonym, digits adjacent to a unit, and the restricted-class terms. Any match fails the build.
- **MS-3** SMS goes only from an approved template, only when the hospital's live-sending setting is on, only to a staff number on file. One message per recipient per alert per level. Delivery receipts are recorded when the provider returns them.
- **MS-4** In-app delivery uses a private realtime channel carrying `{ alertId, kind, at }` and no PHI, authorised for the recipient. If the browser cannot subscribe, the client polls every 15 seconds while visible.

### 6.8 Downtime (`lib/lab/downtime.ts`)

- **DT-1** A downtime period has a start, an end, a reason and a recorder. It is a record, not a mode: nothing in the system changes behaviour while it is open.
- **DT-2** Form numbers are reserved on the server in runs, unique per hospital. Each number is `unused`, `entered` or `voided`. A number can be entered once.
- **DT-3** A back-entry creates what is missing (order, specimen, report) through the existing engine in one transaction, with `collected_at` and `resulted_at` from the form, `entered_at` from the server, the form number and `entered_after_downtime = true`.
- **DT-4** Validation: no time in the future; result time not before collection; both inside a recorded downtime period, or the user confirms and gives a reason.
- **DT-5** Units, ranges, flags, entry checks and critical evaluation run exactly as for a live result, using the patient's age at the **form's** collection time and the ranges and limits in force **then**.
- **DT-6** A critical on the form: with a phone call to a clinician and read-back recorded, the alert is created already `acknowledged` (`via: phone`, during downtime). Otherwise a live alert opens at save.
- **DT-7** Turnaround and "Released today" use the form's times. The doctor's review lanes treat the result as new at `entered_at`.
- **DT-8** A drill writes a drill record and nothing else.

### 6.9 Cut-over (`lib/lab/cutover.ts`)

- **CO-1** `cutoverReadiness(hospital)` returns four conditions with their evidence: open legacy items (count), set-up complete (every orderable in-house test has a unit; the notice and alert wording are signed; response times are signed and every live department has a level-1 contact), a drill recorded, a briefing recorded.
- **CO-2** The switch needs all four and a second approver. It is one audited transaction.
- **CO-3** A hospital with no legacy items meets the first condition at once.
- **CO-4** After the switch the legacy list is read-only and reachable from Released today as "Older results". No legacy write action remains callable for that hospital. Prove it with a test per action.
- **CO-5** Reversal is a superadmin action with four-eyes and a reason.

### 6.10 Flagging state (`lib/lab/critical-flagging.ts`, from Phase 0)

- **CF-1** The body now reads the signed critical-limits set for the hospital. The callers do not change.
- **CF-2** True only when at least one signed, in-force limit exists **and** response times are signed.

---

## 7. Data changes (only what GATE A approves; additive; next free migration numbers)

**Catalogue**

- On the test component: `result_type`, `unit_ucum`, `unit_display`, `decimal_places`, `loinc_code`, `entry_check_low`, `entry_check_high`, `version`, `superseded_by`.
- `ucum_units` (the curated list offered in set-up) and `loinc_codes` (imported, with the release version and the licence notice).

**Results**

- On the result component: `value_decimal`, `unit_ucum`, `unit_display`, `component_version`, `range_low`, `range_high`, `range_band_id`, `range_version`, `flag_computed`, `flag_final`, `flag_change_reason`, `entry_check_confirmed_by`.
- Existing typed columns stay, untouched (UN-8).

**Ranges and limits**

- `reference_range_versions` (hospital, component, status, signatures, in force from) and `reference_range_bands`.
- `critical_limit_versions` and `critical_limits` (component, age band, low, high, reference id, source), reusing the signed-reference mechanism if Step 0 finds one (E-LAB1-02).
- `critical_response_versions` (acknowledge-within and the level times) and `critical_contacts` (department or hospital, level, user, order).

**Criticals**

- `critical_marks`, `critical_alerts`, `critical_alert_events` (append-only, enforced by trigger), `escalation_heartbeats`.

**Downtime and cut-over**

- `downtime_periods`, `downtime_form_numbers`, `downtime_drills`; on reports: `entered_after_downtime`, `downtime_form_no`, `entered_at`.
- `lab_cutover` (hospital, conditions snapshot, approvers, switched at).

**Messages**

- SMS templates for the two kinds, in the existing template store.

**Realtime**

- A private channel per recipient, or the existing per-user channel, with RLS on `realtime.messages`.

**RLS probes** for every new or changed object:

| Actor                                                  | Access                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| Lab staff, same hospital, with the permission          | As the permission allows                                   |
| Lab staff without `lab.manage`                         | Set-up tables read-only                                    |
| Recipient clinician, same hospital                     | Their alerts: read and acknowledge                         |
| Other clinician, same hospital, who may order          | Read and acknowledge any alert for a patient they may open |
| Clinician without access to a restricted class         | That alert's result denied                                 |
| Nurse, same hospital                                   | "Informed" items only, if D-LAB1-05 is yes                 |
| Reception, hospital admin                              | No PHI. Hospital admin: the cut-over page only             |
| Staff of another hospital                              | Denied                                                     |
| Superadmin without break-glass                         | Denied                                                     |
| Anonymous                                              | Denied                                                     |
| Any client, direct INSERT, UPDATE or DELETE            | Denied everywhere                                          |
| Any actor, UPDATE or DELETE on `critical_alert_events` | Denied, including the service role path                    |

## 8. Server actions

The house contract applies to every write: `'use server'` → Zod with an idempotent client key → auth (`getUser()`) → AAL2 → permission → hospital-scope check → one transaction → PII-redacted log → audit row → `{ id, serverTime }`. **Notification failures never throw.**

| Group                | Actions                                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Results              | Extend the existing save and release actions: numeric parsing, unit and range snapshots, the entry-check confirm, refusal without a unit, refusal of an unchecked auto-flagged critical. `changeFlag`                       |
| Criticals, lab       | `releaseWithCriticalMark` (release + mark + alert, one transaction) · `logCriticalCall` · `escalateNow`                                                                                                                     |
| Criticals, clinician | `acknowledgeCriticalAlert` · `disputePhoneAcknowledgement` · `recordAlertSeen`                                                                                                                                              |
| Escalation           | `runEscalations` (scheduler and lazy)                                                                                                                                                                                       |
| Set-up               | `upsertComponentMeasurement` · `createComponentVersion` · `saveRangeDraft` · `signRangeVersion` · `saveCriticalLimitsDraft` · `signCriticalLimits` · `saveResponseTimesDraft` · `signResponseTimes` · `setCriticalContacts` |
| Downtime             | `recordDowntime` · `reserveFormNumbers` · `enterDowntimeForm` · `voidFormNumber` · `recordDrill`                                                                                                                            |
| Cut-over             | `getCutoverReadiness` · `recordBriefing` · `requestCutover` · `approveCutover`                                                                                                                                              |
| Messages             | Template approval through the existing two-person flow                                                                                                                                                                      |

Signing actions require a fresh second factor and refuse a signer who authored the draft's last change when a second person is available (D-LAB1-12).

---

## 9. Steps and gates

### Step 0 — Discovery and baseline (no product changes)

**Answer and report:**

- **Q1** Is `feat/lab-front-door` merged? Are the lab permissions, the navigation registry and `criticalFlaggingActive` present? **If not, STOP.**
- **Q2** F1–F11: confirm or correct each, with file and line.
- **Q3** The report and result model: where a result value, unit, range and flag are stored today; their types; how panels hold components; how amendment versions are kept.
- **Q4** Counts for the test hospital: tests and components; components with any unit information; results in the last 90 days by test; distinct typed units per test (this exposes mixed units); results with a typed range.
- **Q5** The signed-reference mechanism: does a `REF-*` store with status, source and signature exist? Can it hold per-hospital, versioned, two-signature sets?
- **Q6** The four-eyes mechanism and the two-person template approval: their contracts.
- **Q7** Notifications: what exists (kinds, in-app surface, per-user channel)? SMS: the provider interface, the template store, the live-sending setting. Is anything sent today?
- **Q8** Realtime: which channels exist, how they are authorised, and whether a per-user private channel is available. The polling fallback pattern.
- **Q9** **The scheduler.** What runs timed work in production (pg_cron, scheduled functions, a queue)? What runs locally? If nothing does, STOP and flag (ES-3).
- **Q10** The doctor side: is `doctorWorkspace` on? The lane registry; `/doctor/results`; the acknowledgement action and batch acknowledgement; where a header count could live.
- **Q11** Who may order tests today, by cadre (this drives who may acknowledge).
- **Q12** How the ordering clinician and the patient's current responsible clinician can be resolved from an order. How often the ordering user is missing on recent orders.
- **Q13** The hub: heads of department, ward in-charges, department of an order, the lab's phone number. Are they on this branch?
- **Q14** Patient sex and date of birth: how often is either missing on patients with lab orders? How is an estimated age stored?
- **Q15** Restricted classes on tests and results: how they are tagged and filtered today.
- **Q16** The legacy path: tables, actions, and the count of open legacy items per hospital. Owner Runbook §8.
- **Q17** `lib/emr/fhir.ts`: what it emits for units and codes today.
- **Q18** Print styles available; whether any PDF dependency exists (none should be added).
- **Q19** Playwright, axe and a fake-clock test utility. If Playwright or axe is missing, STOP and flag.
- **Q20** The LOINC and UCUM sources to import, their licences and the notices they require. Report the size of the LOINC table to be stored.
- **Q21** The design tokens on the branch for the critical tint, the amber caution pair, the neutral chip and the lock mark.

**Baseline:**

- Screenshots of result entry, the released report as a doctor sees it, `/doctor/results` and the Workspace.
- A scripted run: release a result that would be critical by any standard, and record what each actor sees. This is the "before".
- **Failing tests** that reproduce F3 (no alert on a critical), F5 (range typed) and F9 (two paths). Do not fix them yet.

**STOP 0.** Report Q1–Q21, the prompt-versus-repo differences, the failing tests and the baseline.

### Step 1 — GATE A proposal (documents only)

Write `docs/lab/phase-1/gate-a-proposal.md`:

- annotated wireframes of every screen in Section 5, starting from the canvas;
- the alert state machine as a diagram and a table, with one worked example per rule;
- the recipient ladder with real examples from the test hospital, including a level that resolves to nobody;
- the schema diff, the RLS probe plan and the scheduler design;
- **the sign-off packs** (Appendix C): blank templates for critical limits, response times and reference ranges, with the sources to consult. **Propose no values.**
- every string in Appendix A, with its status;
- **the hazard log** (Appendix B), each hazard with its cause, effect, control, the test that proves the control, and the residual risk;
- the test plan, the rollout plan per flag, and the ADR drafts;
- the decision table (Section 14) with a signature block.

**STOP 1.** Nothing proceeds without Fadhul's signature on the D-decisions.

### Step 2 — Data layer

Approved migrations, the append-only trigger, imports (UCUM list, LOINC table), the flags, the realtime channel and its authorisation, the heartbeat, and the RLS probes.

**STOP 2.** The migration diff; the RLS probe table (every object × every actor); the append-only proof; the realtime authorisation test; import counts.

### Step 3 — Engines (pure, no UI)

Sections 6.1–6.10 with tests:

- every rule ID covered;
- table tests for `resolveRange` (sex, age boundaries in days, neonates, gaps, missing sex or date of birth, two-way and one-way bands) and for `evaluateCritical`;
- the state machine and the CA-14 property tests;
- `runEscalations` under a fixed clock: on time, late, two levels, an empty level, the last level, run twice;
- the banned-term scan (MS-2) with a fixture that must fail;
- the two-hospital fixture for every list and resolver;
- snapshot immutability (Law 8): change a range and a limit after release; the released result is unchanged.

**STOP 3.** Test counts, the rule coverage table, property-test results.

### Step 4 — Criticals by hand (behind `labCriticals`)

The mark panel, release with a mark, the alert, the doctor's alert and acknowledgement, the Criticals list and call log, recipients, escalation with signed response times, the contacts editor, messages with the mock transport, and corrections.

Scenarios:

- **S1** A technologist marks potassium critical, records a repeat and releases. One transaction; one alert; the ordering doctor's open workspace shows it within the budget; the lab's list shows "Sent".
- **S2** The doctor acknowledges in one tap. The lab's list shows "Acknowledged" with the time and cadre. The report counts as reviewed. Batch acknowledgement had excluded it.
- **S3** Nobody acknowledges. At the signed time an `escalated` event is written and the level-1 contact sees "Escalated to you". They acknowledge and take over.
- **S4** Level 1 resolves to nobody. The panel warned the technologist before release; the alert moved to level 2 at once.
- **S5** Every level is empty. The alert is "Not sent · phone the ward". Release still succeeded.
- **S6** The delivery queue is made to fail. The result is released; the lab sees "The alert was NOT sent"; nothing threw.
- **S7** The lab logs a call with read-back to a doctor. The alert is acknowledged `via: phone`. The doctor sees the line and disputes it; the alert reopens.
- **S8** The lab logs a call to a nurse. "Ward informed" is recorded. The clock keeps running.
- **S9** "Could not reach anyone" escalates at once.
- **S10** Two doctors acknowledge at the same moment. One acknowledgement exists; the second doctor sees the first.
- **S11** A double tap on Release and alert creates one alert.
- **S12** The lab amends the alerted result. A correction alert reaches every earlier recipient and the acknowledger, and needs its own acknowledgement.
- **S13** Response times are unsigned. The alert is sent; no automatic escalation happens; the panel says so; "Could not reach anyone" still works.
- **S14** The scheduler is stopped for 4 minutes. The Criticals page shows the delay notice. On the next read the lazy path writes the overdue escalation.
- **S15** A restricted-class result is marked critical. A recipient without access is skipped and listed as skipped. No SMS text carries anything but the place.
- **S16** A clinician of another hospital cannot see or acknowledge. A receptionist cannot.
- **S17** `doctorWorkspace` off: the alert appears on `/doctor/results` and in the header count.
- **S18** Phone viewport: S1–S3 from the doctor's side, one-handed.
- **S19** `labCriticals` off: behaviour matches the baseline. In production, switching it on is refused while any alert wording it uses is `draft`, or while a live department has no level-1 contact.

**STOP 4.** Scenario results; the timing numbers; screenshots against artboards 2, 3, 5, 6, 7 and 8; axe; red-scarcity tests.

### Step 5 — Units, codes and ranges (behind `labUnitsRanges`)

The catalogue set-up, result entry with fixed units, the range set-up and sign-off, computed flags, the entry check, snapshots, and the FHIR mapping.

Scenarios:

- **S20** A test without a unit cannot be resulted, and the row says who can fix it.
- **S21** "7,2" is accepted as 7.2. "7.25" for a one-decimal test is rejected with the fix.
- **S22** A typed value outside the entry check asks for a confirm; the confirm is recorded.
- **S23** A woman of 58 gets the female adult band. A girl of 9 gets "No range for this age". A patient with no date of birth gets only bands that need no age.
- **S24** A range is signed by the laboratory lead and then by the CSO. Until the second signature, the resolver does not use it.
- **S25** A signed range is edited. The signed version stays in force until the new draft is signed. A result released before the change keeps its snapshot.
- **S26** A unit is changed through a new version. Old results keep the old unit; nothing is converted.
- **S27** A technologist changes a computed flag with a reason. The doctor sees the change and the reason.
- **S28** A result from before this slice displays as typed, marked "unit as typed".
- **S29** `labUnitsRanges` on is refused in production while any orderable in-house test lacks a unit.

**STOP 5.** Scenario results; screenshots against artboards 1, 9 and 10; the count of tests ready and not ready.

### Step 6 — Automatic flagging

The limits set-up and sign-off, auto marks, the check gate, and `criticalFlaggingActive`.

Scenarios:

- **S30** Limits are signed by both signers. A value at the limit is flagged at entry. The notice changes to the neutral line.
- **S31** Release without a check is refused on the server. With the check it releases and alerts.
- **S32** A limit in the wrong unit never fires, and set-up shows the error.
- **S33** No limit covers a child: "No critical limit for this age". The hand mark still works.
- **S34** Editing a signed limit clears both signatures on the new draft; the signed version stays in force.
- **S35** The technologist corrects a mistyped value below the limit. No mark arises, and the correction is in the audit trail.
- **S36** The second-check setting is on: a second user confirms; working alone records a reason.

**STOP 6.** Scenario results; screenshots against artboards 4 and 11.

### Step 7 — Downtime (behind `labDowntime`)

The printable form, form numbers, downtime periods, back-entry, drills.

Scenarios:

- **S37** Print 10 forms: 10 numbers are reserved, and each sheet carries one. The page prints on A4, legible in greyscale.
- **S38** Enter a form with four results. The record shows the form's times, "Entered after downtime" and the form number. The timed run meets the budget.
- **S39** A form number cannot be entered twice.
- **S40** A result time in the future is refused. A time outside the recorded downtime needs a reason.
- **S41** A critical on the form with a phone call and read-back: the alert is created acknowledged, `via: phone`. Without a call: a live alert opens at save.
- **S42** Ranges and limits in force at the form's collection time are the ones applied.
- **S43** A patient who is not registered cannot be created from this screen.
- **S44** A drill is recorded and writes no patient record.

**STOP 7.** Scenario results; a photograph or PDF print of the form; screenshots against artboards 12 and 13.

### Step 8 — One result path, hardening and documentation

The cut-over page and switch, then:

- **S45** A hospital with open legacy items: the switch is closed and shows the count.
- **S46** All four conditions met: admin A requests, admin A cannot approve their own request, admin B approves, the switch is audited.
- **S47** After the switch every legacy write action is refused for that hospital, and the old list is readable under "Older results".
- **S48** All three flags off at a hospital that has not switched: behaviour matches the Phase 0 baseline.

Then: the timed trial of the acknowledgement and back-entry budgets with two or three clinicians and lab staff if available; reduced motion; the performance budgets; the user guide (one page each for technologist, doctor, lab lead, hospital admin); the hazard log, completed; the ADRs; the final report.

**STOP 8 (final).** The table in Section 13, filled in.

---

## 10. Accessibility, motion, colour

- WCAG 2.2 AA. Targets at least 44×44 px on touch; 48 px for Acknowledge on phones.
- The alert is announced once, assertively, with its full text. Updates to the same alert are polite.
- Result fields have real labels. Units are part of the accessible name ("Potassium, millimoles per litre").
- The mark panel is a region with a heading; focus moves to it when it opens and returns to the row when it closes.
- Every state is a word. The Critical pill carries its icon and the word. Amber chips carry an icon and words.
- The timeline is a list in time order with times as text.
- No sound, no flashing, no animation on alerts. Reduced motion honoured.
- Colour: teal for actions and focus; plum (or the lab hue's tint) for the active navigation item; amber for late, overdue, unsigned and not sent; the critical tint only where D-LAB1-18 signs it; nothing green.
- The paper form: body text at least 12 px, rules at least 1 px, no colour needed to read it.

## 11. Performance budgets

| Measure                                          | Budget                                                      |
| ------------------------------------------------ | ----------------------------------------------------------- |
| Release with a mark (server, excluding delivery) | p95 < 500 ms                                                |
| Alert visible to an online recipient             | p95 ≤ 5 s realtime, ≤ 15 s polling                          |
| Acknowledge (server)                             | p95 < 300 ms                                                |
| Escalation written after the due time            | ≤ 60 s                                                      |
| Criticals list TTFB                              | p95 < 400 ms                                                |
| Range resolution per report                      | < 5 ms, no extra round trip per component                   |
| Added JS on `/lab` and on the doctor Workspace   | report both numbers; flag anything above 40 KB gzipped each |

## 12. Security, privacy, audit

- AAL2 on every route here. Hospital scope on every read and write. Reception blocked in the app and in the database.
- Every mark, alert event, acknowledgement, call log, signature, contact change, back-entry and switch is audited with the actor, time and hospital.
- `critical_alert_events` is append-only by trigger.
- Realtime payloads, SMS, logs, analytics and URLs carry no PHI.
- Staff phone numbers are used only for these alerts and are never shown to other staff.
- The LOINC and UCUM licence notices are included as their terms require.
- If the server client still reads a legacy `service_role` key, flag it.
- The governance gap stays documented: Fadhul holds superadmin, CSO and audit-reviewer roles at once. Signing as CSO and approving as the second approver must be two different people wherever a second person exists (D-LAB1-12).

---

## 13. Numbers to report at the final STOP

| Metric                                                              | Baseline | Target         | Result |
| ------------------------------------------------------------------- | -------- | -------------- | ------ |
| Critical marks without an alert                                     | all      | 0              |        |
| Open alerts past the last level without an event                    | —        | 0              |        |
| Alerts closed by anything but an acknowledgement                    | —        | 0              |        |
| Screens that say or imply "the doctor knows" before acknowledgement | —        | 0              |        |
| Taps for a doctor to acknowledge                                    | —        | 1              |        |
| Release → alert visible, p95                                        | —        | ≤ 5 s / ≤ 15 s |        |
| Due time → escalation written                                       | —        | ≤ 60 s         |        |
| Results released without a catalogue unit (flag on)                 | all      | 0              |        |
| Units typed by hand (flag on)                                       | all      | 0              |        |
| Released results whose snapshot changed after a set-up edit         | —        | 0              |        |
| Unsigned limits or ranges that fired                                | —        | 0              |        |
| Clinical numbers in code, seeds or copy                             | —        | 0              |        |
| Templates failing the banned-term scan                              | —        | 0              |        |
| Back-entry of a four-result form, median                            | —        | ≤ 90 s         |        |
| Legacy write actions callable after the switch                      | all      | 0              |        |
| Hazards without a control and a test                                | —        | 0              |        |
| Rule IDs without a test                                             | —        | 0              |        |
| RLS probes passed                                                   | —        | 100 %          |        |
| axe serious or critical                                             | S0       | 0              |        |
| Red outside signed uses on the new routes                           | —        | 0              |        |

## 14. GATE A decisions (Fadhul owns; recommendations given)

| #         | Decision                                                           | Recommendation                                                                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-LAB1-01 | Who may mark a result critical                                     | Any lab user with `lab.result.release`. The lab's own critical-call procedure governs their judgement                                                                                                                                                         |
| D-LAB1-02 | The check before release                                           | One of: repeated on the same sample, sample checked, or could not check with a reason. A second person is not required (see 06)                                                                                                                               |
| D-LAB1-03 | Who may acknowledge (CSO)                                          | Any clinician at the hospital who may order tests: doctors and clinical officers. Nurses may be informed, never acknowledge                                                                                                                                   |
| D-LAB1-04 | Phone acknowledgement                                              | A logged call with read-back to a clinician who may acknowledge closes the alert, names that clinician, and can be disputed by them. A call to anyone else does not stop the clock                                                                            |
| D-LAB1-05 | Informing the ward's nurse in charge                               | Yes, if the nurse workspace has a notifications surface on this branch. Otherwise record the seam and leave it to the nurse workspace prompt                                                                                                                  |
| D-LAB1-06 | Second verifier for criticals                                      | A per-hospital setting, off by default, with a recorded solo reason. A lone technologist at night must never have to hold a critical                                                                                                                          |
| D-LAB1-07 | The escalation ladder                                              | Level 0: ordering clinician and current responsible clinician. Level 1: the department's critical-results contacts, defaulting to the head of department. Level 2: the hospital's contacts. MedSync has no on-call roster, so these contacts stand in for one |
| D-LAB1-08 | Response times (CSO)                                               | The hospital sets and signs them. No default ships. Consult RCPath G158 (rapid communication within 2 hours for its type A results) and the lab's own procedure. With none signed, alerts still send and nothing escalates automatically                      |
| D-LAB1-09 | A test whose range is not yet signed                               | The technologist types the range as today and the result is marked "unsigned range". The alternative is to show no range                                                                                                                                      |
| D-LAB1-10 | Critical limits (CSO, with the laboratory lead)                    | Per hospital, per test, with an age band and a source for each. RCPath G158 Appendix A is a starting point to adapt, and it expects local agreement. No value is proposed in this prompt                                                                      |
| D-LAB1-11 | Signatures                                                         | Two for ranges and for limits: the laboratory lead and the CSO, each with a fresh second factor. Any edit starts a new draft and leaves the signed version in force                                                                                           |
| D-LAB1-12 | One person, several roles                                          | Where a second eligible person exists, the author of a change cannot be its only signer, and the CSO cannot also be the four-eyes approver. Where none exists, record the exception in words on the signature                                                 |
| D-LAB1-13 | Sample-check wording (CSO)                                         | Appendix A. One checkbox, generic across tests                                                                                                                                                                                                                |
| D-LAB1-14 | The three acknowledgement responses (CSO)                          | Appendix A. Optional; a bare Acknowledge is valid                                                                                                                                                                                                             |
| D-LAB1-15 | Repeat criticals for the same patient and test                     | Every critical alerts in this slice. A signed suppression rule can follow once there is data on alert load                                                                                                                                                    |
| D-LAB1-16 | Coded results (a positive blood culture, malaria in a young child) | Hand mark only in this slice. Coded critical rules come with microbiology and a signed list                                                                                                                                                                   |
| D-LAB1-17 | SMS                                                                | On per hospital only after the templates are approved by two people and staff numbers are confirmed. Off by default. With it off, the lab is told to phone                                                                                                    |
| D-LAB1-18 | Colour of the critical-result alert (amends the red law)           | The critical tint with the triangle icon and the words "Critical result", on the pinned alert and the Critical pill only. Everything else amber or neutral                                                                                                    |
| D-LAB1-19 | When the lab's list turns amber                                    | At half the signed acknowledge time, or at once after it. This is a display threshold derived from a signed number                                                                                                                                            |
| D-LAB1-20 | The entry check                                                    | Optional per test, set by the laboratory lead. A confirm tap, never a block                                                                                                                                                                                   |
| D-LAB1-21 | Pregnancy-specific ranges                                          | Not in this slice. Record the gap in the hazard log                                                                                                                                                                                                           |
| D-LAB1-22 | A patient with no date of birth or sex                             | Only bands that need neither apply. Nothing is guessed                                                                                                                                                                                                        |
| D-LAB1-23 | Downtime entry: who                                                | Any lab user with `lab.result.release`. The person who released on paper is recorded separately                                                                                                                                                               |
| D-LAB1-24 | Cut-over                                                           | Four conditions and a second approver. Reversal by a superadmin with four-eyes                                                                                                                                                                                |
| D-LAB1-25 | Rollout order                                                      | `labCriticals` first (hand marks, with response times signed), then `labUnitsRanges`, then limits, then `labDowntime`, then the switch                                                                                                                        |
| E-LAB1-01 | Criticals as their own engine                                      | Yes. They do not wait for a general notifications engine, and a general engine later delivers for them                                                                                                                                                        |
| E-LAB1-02 | Storage of limits and ranges                                       | Reuse the signed-reference mechanism if it supports per-hospital, versioned, two-signature sets. Otherwise dedicated tables shaped the same way                                                                                                               |
| E-LAB1-03 | Result values                                                      | Decimal, never float. Typed legacy columns stay untouched                                                                                                                                                                                                     |
| E-LAB1-04 | Escalation                                                         | A pure planner, a thin executor, three callers (scheduler, lazy read, tests), and a heartbeat                                                                                                                                                                 |
| E-LAB1-05 | Delivery                                                           | A PHI-free private realtime channel with a 15-second polling fallback                                                                                                                                                                                         |
| E-LAB1-06 | Print                                                              | Print CSS only                                                                                                                                                                                                                                                |
| E-LAB1-07 | LOINC                                                              | Import the table with its release version. Codes are optional and validated                                                                                                                                                                                   |

## 15. Out of scope (leave clean seams)

**Roadmap Phase 2 and later.** One test menu · payment status · point-of-care tests · identity check at collection · scan to receive and specimen search · the live worklist · clinical context on the specimen · the NCD registry reading results · the high-risk specimen warning · HMIS outputs · QC · reports · referred tests · A-LIS exchange · analyser interfaces · microbiology · blood bank · histopathology.

**Not here.** Patients seeing results (the alert leaves a `hold_from_patient` seam: nothing critical reaches a patient before acknowledgement) · delta checks · autoverification · suppression of repeat criticals · pregnancy-specific ranges · an on-call roster · the mobile (Expo) app and push · an offline worklist · unit conversion of any kind · the nurse workspace's alert surface beyond D-LAB1-05.

## 16. ADRs (next free numbers)

- Critical results as a dedicated engine: marks, alerts, append-only events.
- "Sent, seen, acknowledged", and what may close an alert.
- The recipient ladder and critical-results contacts in the absence of a roster.
- Escalation: the planner, its three callers and the heartbeat.
- Phone acknowledgement and dispute.
- Corrections to an alerted result.
- Fixed units, component versions and "no conversion".
- The reference-range store, its resolver and snapshots.
- Critical limits and response times as signed, per-hospital sets with two signatures.
- Downtime: form numbers, back-entry with true times, drills.
- The cut-over to one result path.
- The amendment to the red law for critical-result alerts (if D-LAB1-18).

## 17. Definition of Done

- [ ] F1–F9 resolved. F10 partly (alerts are live; the worklist is not) and recorded.
- [ ] Every critical mark has one alert. Every alert ends in an acknowledgement. Nothing else closes one.
- [ ] No screen says or implies a doctor knows before acknowledgement.
- [ ] A failed delivery, an empty level, unsigned times and a late scheduler each tell the lab to phone, in words.
- [ ] No clinical number exists in code, seeds or copy. No unsigned limit or range has fired.
- [ ] No result is released without a catalogue unit. Snapshots never change after release. Nothing is converted.
- [ ] SMS templates pass the banned-term scan. Restricted classes are honoured.
- [ ] A paper form can be printed, entered with its true times, and seen by the doctor as entered after downtime. A drill is recorded.
- [ ] A hospital can be switched to one path with four conditions and two people, and the legacy writes are then refused.
- [ ] Every rule ID has a test. RLS probes are green; client writes are denied; the event table is append-only.
- [ ] axe is clean. Red-scarcity tests are green. Reduced motion is honoured.
- [ ] S1–S48 pass. With the flags off, behaviour matches the Phase 0 baseline.
- [ ] The hazard log is complete and signed. The user guide exists. ADRs written. The final report has its numbers. The diff on `feat/lab-safety-floor` is reviewable.

---

## Appendix A — Copy to be signed (all `draft` until the CSO signs)

| Key                                     | Text                                                                                                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notice, flagging off                    | **Automatic critical flagging is off.** MedSync will not flag critical values at this hospital until the critical limits are signed. Follow the lab's critical-call procedure and mark critical results by hand. |
| Notice, flagging on                     | **Critical limits are signed.** MedSync flags critical values itself. You can still mark any other result critical by hand.                                                                                      |
| Sample checks                           | The label matches this patient, and there is no visible haemolysis or clot.                                                                                                                                      |
| Could not check, reasons                | Not enough sample · Analyser down · No reagent · Other                                                                                                                                                           |
| Panel footnote                          | All results on this report are released as final. The mark, the check and every alert are recorded against your name.                                                                                            |
| Not sent                                | Released. The alert was NOT sent. Phone the ward now and log the call.                                                                                                                                           |
| Empty level                             | Nobody is set up to receive this at the next level. Phone the ward now.                                                                                                                                          |
| No response times                       | No response time is signed for this hospital, so this alert will not escalate by itself. Phone the ward now.                                                                                                     |
| Escalations delayed                     | Escalations may be delayed. Phone the ward for any open critical.                                                                                                                                                |
| Alert title                             | Critical result: {test} {value} {unit}, {high or low}.                                                                                                                                                           |
| Escalated title                         | Escalated to you                                                                                                                                                                                                 |
| Escalated line                          | Not acknowledged for {n} minutes by {role, place}.                                                                                                                                                               |
| Correction title                        | Corrected result: {test} was {old}, is now {new} {unit}.                                                                                                                                                         |
| Responses                               | Reviewing the patient now · Asked the ward team to act · Already aware                                                                                                                                           |
| Phone acknowledgement, to the clinician | The lab recorded your phone acknowledgement at {time}. Not you? Tell us.                                                                                                                                         |
| SMS, level 0                            | MedSync: a critical lab result on {place} needs your acknowledgement. Open MedSync, or call the lab on {lab number}.                                                                                             |
| SMS, escalation                         | MedSync: a critical lab result on {place} has not been acknowledged. It is now with you. Open MedSync, or call the lab on {lab number}.                                                                          |
| No range                                | No range for this age · No range: sex or age not recorded · Unsigned range                                                                                                                                       |
| No limit                                | No critical limit for this age                                                                                                                                                                                   |
| Entry check                             | {value} {unit} is outside the usual entry range for {test}. Confirm this is the value on the analyser.                                                                                                           |
| No unit                                 | This test has no unit yet, so it cannot be resulted. Ask the laboratory lead to set it in the test catalogue.                                                                                                    |
| Downtime tag                            | Entered after downtime · Resulted {time} · entered {time} · paper form {number}                                                                                                                                  |
| Not registered                          | Register this patient at reception first.                                                                                                                                                                        |

## Appendix B — Hazard log seed (complete each at Step 1; close each with a test)

For each: cause, effect, control built, the test that proves the control, residual risk.

1. A critical result is released and no alert is created.
2. An alert is created and reaches nobody (no recipient, delivery failure, phone off).
3. An alert reaches the wrong clinician, or a clinician who has gone off duty.
4. An alert is acknowledged by someone who cannot act on it.
5. The lab believes the doctor knows when the doctor does not ("sent" read as "acknowledged").
6. The escalation job stops and nobody notices.
7. Too many alerts: clinicians start ignoring them.
8. A wrong critical value is alerted and acted on, and the correction does not reach the same people.
9. A result is attached to the wrong patient, in live entry or in back-entry.
10. A value is typed in the wrong unit (mg/dL into a µmol/L field).
11. A unit is changed and old results are read in the new unit.
12. A range is applied to the wrong sex or age, or an adult range to a child.
13. A critical limit is mis-set, too tight or too loose, or in the wrong unit.
14. A limit or range is changed and a released result silently changes its flag.
15. An SMS reveals a patient, a test or a value.
16. A restricted-class result is shown to a clinician without access through an alert.
17. A back-entered result carries the entry time as its result time, and treatment decisions are read against the wrong time.
18. A paper form is never entered, or is entered twice.
19. A critical recorded on paper during downtime is never communicated.
20. A hospital runs two result paths and a result is looked for in the wrong one.
21. A single person signs their own limits and approves their own switch.
22. The device clock is wrong and elapsed times mislead.
23. A pregnant patient's result is flagged against a non-pregnant range (open: no control in this slice).

## Appendix C — Sign-off packs (templates only; propose no values)

**Critical limits, per hospital.** Columns: test · unit · age band · critical at or below · critical at or above · source and page · the laboratory lead's note · CSO decision. Sources to consult: the lab's current critical-call list; RCPath G158 (May 2026), Appendices A and B; the kit inserts; any Ministry of Health or national laboratory guidance the laboratory lead holds.

**Response times, per hospital.** Rows: acknowledge within · level 1 after · level 2 after · who is level 1 for each department · who is level 2. Sources: RCPath G158; the hospital's own escalation practice.

**Reference ranges, per test.** Columns: sex · age from · age to · low · high · unit · source · how it was verified locally. Guidance: an interval taken from a kit insert or the literature is verified on 20 local reference samples, and accepted if no more than 2 fall outside (CLSI EP28-A3c).

## Appendix D — Sources checked (10 Oct 2026; re-verify at build time)

- **RCPath G158, _The communication of critical and unexpected pathology results_, version 2, May 2026.** Critical results go only to the clinical team; where results are pushed to apps or records, the care team is informed first. Rapid communication within 2 hours for its type A results. Each communication records who communicated, to whom, and when. Laboratories need a procedure for when the responsible person cannot be reached. Thresholds are suggestions for local agreement. It does not mention read-back. https://www.rcpath.org/asset/BB86B370-1545-4C5A-B5826A2C431934F5/
- **ISO 15189:2022.** Clause numbers confirmed from an accreditation body's mapping: 7.4.1.3 critical result reports, 7.4.1.8 amendments to reported results, 7.3.5 biological reference intervals and clinical decision limits, 7.6.4 downtime plans, 7.8 continuity and emergency preparedness planning. An assessment checklist confirms that critical results require notification of the user "as soon as relevant" and an escalation procedure when the responsible person cannot be contacted. **The clause's list of what to record, including verification that the communication was accurate (read-back), was not confirmed from the standard's text.** Confirm it from the laboratory lead's copy before the hazard log is signed. Mapping: https://sadcas.org/sites/default/files/2024-03/SADCAS_F_134%28d%29_-_ISO_15189_-_2022_Gap_Analysis_and_Transition_Plan_%5BIssue_1%5D.pdf Checklist: https://www.sadcas.org/sites/default/files/2024-03/SADCAS_F134_%28b%29_-_Vertical_Assessment_ISO_15189_-_2022_for_Medical_Laboratories_%5BIssue_2%5D.pdf
- **Why acknowledgement is measured.** An audit at a South African teaching hospital (African Journal of Laboratory Medicine, 2024) found 68.6 % of critical chemistry results viewed within 24 hours, a registered clinician on only 23.1 % of samples, and results often given to ward staff, not the treating clinician. https://scielo.org.za/pdf/ajlm/v13n1/20.pdf
- **Verifying a transferred reference interval** (CLSI EP28-A3c, as summarised by UC Davis Health): 20 samples; verified if 2 or fewer fall outside. https://health.ucdavis.edu/blog/lab-best-practice/reference-intervals-the-process-to-verify-outside-sources/2022/04
- **LOINC.** Checked on loinc.org: 2823-3 potassium, 14682-9 creatinine and 22664-7 urea, each moles per volume in serum or plasma, all active. The other codes on the canvas were not checked. Import from the release; do not copy from the canvas. https://loinc.org/2823-3/
- **SLIPTA checklist version 3 (2023)** is based on ISO 15189:2022. https://aslm.org/wp-content/uploads/2024/07/1720161712-resource_file-Changes-of-SLIPTA-Checklist-V-3-and-Transition-Plan.pdf
