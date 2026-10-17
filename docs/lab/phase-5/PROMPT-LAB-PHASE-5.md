# PROMPT: Lab Phase 5 — beyond a standard LIS (patients see their results, delta checks, selective autoverification, the infection prevention feed)

> **For Claude Code.** Work at the repo root on a new branch, `feat/lab-beyond-lis`. Cut it from the branch where `feat/lab-connect-outward` (lab Phase 4) has merged.
>
> - **If Phases 1–4 have not merged, STOP at Step 0.** This slice builds on:
>   - Phase 1: acknowledgement and "Mark reviewed", criticals (CA-\*), amendments and correction alerts (CA-10), restricted classes, snapshots (Law 8), and the `hold_from_patient` seam;
>   - Phase 2: the test menu, decision schemes, bedside results, the method register, the high-risk mark;
>   - Phase 3: QC status at release and the hold (QH-\*), nonconformities, rejection codes;
>   - Phase 4: interfaced results and their analyser flags, referred results and their provenance, outbreak referrals (RF-7), the exchange module.
>
>   Phase 3 and 4 flags may be off at a site; their code must be on the branch.
>
> - **The patient web app must exist.** This slice adds a Results area to it. If Step 0 finds no patient web surface with a verified link between a patient account and a hospital record, Steps 6–8 stop and report.
> - First, copy into `docs/lab/phase-5/`:
>   - this prompt;
>   - `LAB-PHASE-5-RESEARCH.md`.
>
> **Mode: gated.** There are twelve steps, numbered 0–11, and each ends in a **STOP**.
>
> - **Documents** follow Stage 1: draft, critique against the checklist, revise (at most two passes), present, STOP.
> - **Code** follows Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
> - Self-refinement never replaces a real check.
>
> **Assume nothing in this slice is built.** Section 3 lists what earlier reads claimed. Verify every line. Build what Step 0 proves is missing, and reuse what it proves exists.
>
> **Two steps are conditional.** They end in a written gap report and no code when their inputs are missing:
>
> - **Step 9, autoverification:** needs an analyser live on the Phase 4 bridge after its signed shadow run, delta checks live for at least the period D-LAB5-14 sets, and current QC on that analyser.
> - **Step 10, the microbiology feed and AMR export:** needs the microbiology module (a separate prompt) to emit isolates with organism, phenotype and susceptibility. **GATE M.**
>
> **No Expo work.** Patients see results in the responsive web app only. Gate CG stays open: no mobile clinical PHI read ships until Fadhul signs a governance artifact as CSO. Step 1 drafts the results section of that artifact; it does not build anything mobile.
>
> **The CSO is Fadhul.** Nothing in this slice reaches a production hospital without the signatures this prompt names:
>
> - **The CSO signs:**
>   - what patients see, and when (the release table, 5.5), and every plain-language text a patient reads;
>   - the results-ready SMS;
>   - the rule for children and adolescents, **after a Ugandan legal opinion** (D-LAB5-08);
>   - the delta rule set and every autoverification rule set (countersigning the laboratory lead);
>   - every string a clinician or patient reads in Appendix A, and the hazard log.
> - **The laboratory lead signs** each delta, panel and pattern rule, each autoverification rule set, the shadow run, and the daily review sample.
> - **The facility IPC lead signs** the alert list with the laboratory lead. **The surveillance focal person** checks the notify-now list against the IDSR technical guidelines.
> - **The data protection lead signs** the patient-results privacy notice and the consent wording.
> - **Production sign-ups and patient access stay closed** until the privacy notice, the terms and the hospital's PDPO registration are published (MedSync standing decision).

---

## 0. What we are building, in one paragraph

A standard laboratory system stops at the doctor. MedSync holds the whole record, so it can do four things a separate LIS cannot.

- **Patients see their own results** in the patient web app, but only after a clinician has reviewed them, and a critical result only after the clinician has spoken to the patient. Results come with the usual range on a number line, signed plain words, an action line and the doctor's note. HIV, the other restricted classes, pregnancy and tissue results never appear; they are given in person, as the HIV and AIDS Prevention and Control Act 2014 requires for HIV. A patient who asks gets an SMS that results are ready, with no test name and no value, following the wording NHLDS's own results system uses.
- **Delta checks** compare each result with the patient's previous one and ask about the sample when the change is bigger than biology allows. They are decision support: the technologist records an outcome; the system never blocks on its own judgement.
- **Selective autoverification** releases only normal, interfaced results that pass current QC, every delta check and every other check, opt-in per test, after a shadow run, with a daily review sample and a suspend button anyone in the lab can press.
- **The infection prevention feed** tells the IPC link nurse and the ward, within a minute of release, that a result needs precautions (Xpert MTB, rifampicin resistance, cholera, measles, a suspected VHF referral), puts a flag on the patient's record that follows them to readmission, and gives the surveillance focal person the lab-confirmed counts for the weekly IDSR report. Organism and resistance alerts, HAI surveillance and the WHONET export arrive when microbiology does.

**Done when:**

- a patient can see an acknowledged result in the app, and no sensitive result has been released automatically (the roadmap's "done when");
- no result has been visible to a patient before a clinician reviewed it, and no critical before the clinician spoke to the patient;
- no SMS has carried a test name or a value;
- every delta alert has a recorded outcome, and each rule's usefulness is measured;
- every listed IPC condition released in the replay test raised an alert, and precautions were recorded for it;
- at a site that meets Step 9's inputs, one test is autoverified with no result changed after release by rule.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt, the roadmap, the research notes and the canvas. Report every disagreement at STOP 0.
2. **The plan.** The _MedSync Laboratory Roadmap_, version 2, section "Phase 5: Beyond a standard LIS" (https://claude.ai/artifact/SQPdW66RcaAnu3QWQTYVTw): patient results in the app (flag, CSO wording, data protection); delta checks and selective autoverification (CSO-signed rules); the infection prevention feed from microbiology (needs microbiology, IPC lead).
3. **The research notes.** `docs/lab/phase-5/LAB-PHASE-5-RESEARCH.md`, compiled 17 Oct 2026, with sources and a confidence mark on each fact.
   - Part A: patient access to results in Uganda (DPPA 2019 s.24, the Patients' Charter, the HIV Act, the Mental Health Act, the UCC SMS regulations, LabRDS), international practice (US information-blocking rule, NHS App) and evidence on displaying results.
   - Part B: delta checks and autoverification (CLSI EP33 2nd ed. 2023, AUTO15, ISO 15189:2022 7.4.1.5, CAP, SLIPTA v3, RCV and the EFLM database, published performance, wrong blood in tube).
   - Part C: the IPC feed (Uganda IPC Guidelines 2nd ed. 2025, WHO core components and minimum requirements, IDSR 3rd ed. 2021, NAP-AMR II, GLASS and WHONET, alert organism lists, precautions by result, evidence for electronic alerts).
4. **The UI reference.** The design canvas _Lab Phase 5 UI Preview_ (https://claude.ai/artifact/L9SEUqBWyCUaU1f83YmPfa). It has artboards 1–12, and Section 5 names the artboard for each screen.
   - Drawn in MedSync Chroma. Build with the design system in force on this branch.
   - Every patient, value, range, delta limit, autoverification count, alert, plain-language text and SMS on it is **an example, not a real or signed value**. "[limit]" on artboard 7 is deliberate: no limit is proposed.
   - Where this prompt and the canvas differ, this prompt wins. The known differences are in 5.13.
5. **Earlier canvases**, for the screens this slice extends: result entry and the critical alert (Phase 1), the doctor's results (Phases 2 and 4), interfaced results (Phase 4), the QC hold and nonconformity (Phase 3).
6. **Design documents and ADRs:** `DESIGN-medsync.md`; the patient workspace prompt and its ADRs (patient account linking, dark mode on the patient side, the persistent Emergency button); the notifications engine, if built; the lab Phase 0–4 ADRs.
7. **Prompts this builds on** (copies under `docs/`): `PROMPT-LAB-PHASE-4.md` (interfaced and referred results, RF-7, the exchange), `PROMPT-LAB-PHASE-3.md` (QC status, hold, nonconformities), `PROMPT-LAB-PHASE-2.md` (menu, schemes, bedside, method register, the house contract), `PROMPT-LAB-PHASE-1.md` (acknowledgement, criticals, amendments, restricted classes, `hold_from_patient`).
8. **Code to read:** the patient web app (`app/(patient)/**` or as found), `app/lab/**`, the doctor's results views, `lib/lab/**`, `lib/emr/**`, any notifications or SMS module (Africa's Talking), admission and ward records (for the IPC location), `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

1. **Engine-first.** Every surface reads or writes an engine with real tables, real RLS policies and passing tests. The engine is built in an earlier step than the surface.

2. **The clinician first, then the patient.** A result is visible to a patient only through `visibleToPatient` (PR-1): released, reviewed by a clinician, a critical only after the clinician recorded speaking to the patient, no hold, consent on. Autoverification and the lab's release never count as review. **No time-based auto-release** in this slice (no Ugandan law requires immediate release; aged results are escalated to clinicians instead, PR-16).

3. **Some results are never in the app or in a message.** The never-shown groups (PR-3) are a floor in code: the restricted classes `hiv`, `tb`, `mental_health`, `sexual_reproductive_health`; pregnancy tests; histology and cytology. Configuration can add to the floor, never remove from it. Their names, their pending state and the timing of their results never reach a patient surface or an SMS. HIV results are given only by a practitioner with post-test counselling (HIV and AIDS Prevention and Control Act 2014 s.3 and s.18).

4. **A message that is safe on someone else's phone.** The results-ready SMS carries no test name, no value, no condition-revealing clinic or sender name, and no link that opens PHI without sign-in.

5. **Machines propose, people decide.**
   - Delta, panel and pattern rules inform; the technologist records an outcome.
   - IPC alerts suggest precautions; the IPC team decides and records.
   - Autoverification releases only what passes every check, and a person can stop it at once.

6. **No remembered numbers.** None of the following comes from code, seeds or copy: delta limits and windows; RCV inputs; autoverification limits, intervals and sample sizes; serum-index limits; the alert list and its precautions; the notify-now list; plain-language texts; harm anchors; release rules; the aged-result window; hold maxima. Each is signed data with its source. Operational settings (batching windows, SMS hours as set by regulation, escalation timers, cache lifetimes) are labelled operational.

7. **The record keeps what was true.** Every delta flag stores both values, the rule version and the outcome. Every result released by rule stores the rule set version and every check's value. Every patient view and every IPC action is audited. Signed rule sets and lists are versioned; a change is a new version.

8. **Minimum necessary.** The IPC team sees the condition, the patient's two identifiers, the place and the precaution, not the chart or the full result. The patient app caches nothing on the device beyond the session (PR-14). Exports to WHONET (Step 10) follow the field list signed by the data protection lead.

9. **Restricted classes stay restricted** (Phase 1 Law 12), with one explicit exception: IPC staff holding `ipc.alerts` see that a patient has an alert condition in the `tb` class (for example rifampicin-resistant TB) through the IPC alert only, audited. They do not gain access to the class's results.

10. **Children are protected by default.** Until the legal opinion and the CSO's rule (PR-11) are signed, patients under 18 and their guardians see nothing in the app.

11. **Red is a safety property.** On patient surfaces only the Emergency button is red; outside-range results are words with an arrow (amber text), never red, and the word "critical" never appears to a patient. In the lab and IPC views, delta alerts, IPC alerts, held, suspended and not-yet-visible are **amber or neutral** with an icon and a word. Phase 1's critical styles are unchanged. Nothing is green.

12. **Two identifiers everywhere** a patient appears, including the patient's own header, the IPC alert and the released-by-rule list.

13. **Behind flags, stack as found.**
    - Per-hospital flags, all off by default: `labDeltaChecks`, `ipcLabFeed`, `patientResults`, `patientResultsSms`, `labAutoverify`, `ipcMicroFeed`.
    - Autoverification is also opt-in per test per analyser by a signed rule set.
    - With all flags off, behaviour matches the Phase 4 baseline.
    - Use the ORM, package manager, flag mechanism and tokens on the branch. TypeScript strict, no `any`. Zod on every action. AAL2 for staff; the patient app's own authentication for patients, as found.
    - No new dependencies without stopping to flag them.

14. **en-GB.** The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU) wherever copy mentions it. Dates show as `17 OCT 2026`.

---

## 3. What earlier reads claimed (verify every line at Step 0)

| #   | Claim                                                                                                                                                                                                                                                                                                                                                                                                   | Where                                 | Severity                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------ |
| H1  | DPPA 2019 **s.24**: on proof of identity the data subject may learn what is held, get a description and learn who had access; the controller responds within **30 days** (s.24(9)); the only exception is other people's data. No harm exception                                                                                                                                                        | ULII, Act 9 of 2019                   | **Legal basis**                |
| H2  | Patients' Charter 2009 **Art. 16**: right to a copy of one's medical records. **Art. 10**: information may be withheld where "likely to cause severe harm"                                                                                                                                                                                                                                              | MoH Patients' Charter                 | Holds                          |
| H3  | Mental Health Act 2018 **s.57(2)**: access may be denied where it would seriously prejudice the patient                                                                                                                                                                                                                                                                                                 | ULII                                  | Holds                          |
| H4  | HIV and AIDS Prevention and Control Act 2014: **s.3(1)** pre- and post-test counselling in all cases; **s.18(1)** results released only by a practitioner or qualified officer to the person tested; **s.18(2)(a)** parent or guardian of a minor (under 12); **s.42** criminal penalty for breach of confidentiality. Section numbers from the ULII revised edition: cross-check with the gazetted Act | ULII                                  | **Never-shown floor**          |
| H5  | HIV testing guidance (2022 consolidated guidelines): those aged 12 and over consent to HIV testing alone; self-testing from 15. Children Act: a child is under 18. DPPA s.8: parental consent to process a child's data; "child" not defined in the Act                                                                                                                                                 | MoH; ULII                             | **Minors rule**                |
| H6  | NHLDS **LabRDS** sends: "Your PCR_1 test results are ready. Please go to the health facility to pick your results and speak to a health care worker." No value                                                                                                                                                                                                                                          | ASLM/NHLDS 2023                       | SMS precedent                  |
| H7  | **UCC (Text and Multimedia Messaging) Regulations, S.I. 83 of 2019:** accurate sender identification (reg. 10); free STOP opt-out honoured within 24 hours (reg. 12); no commercial messages 19:00–06:00, health emergencies exempt (reg. 19); government bodies exempt (reg. 2(2)); private facilities are not                                                                                         | Uganda Gazette                        | SMS rules                      |
| H8  | Africa's Talking: alphanumeric sender ID about UGX 250,000 a month, about 2 weeks to set up; numeric sender IDs not supported on Ugandan networks                                                                                                                                                                                                                                                       | Provider pages                        | Cost, set-up                   |
| H9  | US information-blocking rule treats delaying results for clinician review as likely interference, with a harm exception (45 CFR 171.201). NHS App shows results usually within a few days after professional review, with sensitive and "not for disclosure" exclusions, from age 16. **Neither binds Uganda**; they show the range of practice                                                         | eCFR; NHS                             | Context                        |
| H10 | Steitz et al. 2023: 95.7 % of 8,139 patients preferred immediate release; 16.5 % with abnormal results reported more worry. Number lines beat tables (Zikmund-Fisher 2017); harm anchors reduce needless alarm (2018); display alone did not stop misreading (Fraccaro 2018)                                                                                                                            | JAMA Netw Open; JAMIA; JMIR; BMC MIDM | Display design                 |
| H11 | **CLSI EP33 2nd ed. (2023)**: each delta rule has a type, a limit and a look-back window; limits from biological variation (RCV) or local patient-data percentiles; post-implementation review. Method names from secondary sources                                                                                                                                                                     | CLSI sample; reviews                  | Delta model                    |
| H12 | RCV = √2 × Z × √(CVA² + CVI²); EFLM Biological Variation Database grades studies and gives CVI. **No sourced default limits exist**                                                                                                                                                                                                                                                                     | Fraser; biologicalvariation.eu        | No defaults                    |
| H13 | Most delta alerts are physiological or treatment-related (CAP Q-Probes about 60 %; an MCV study 95 % invalid, mostly transfusion); simple per-analyte deltas detect wrong blood in tube poorly; earlier specimens were often implicated and rarely checked                                                                                                                                              | CAP; AKU; Tan 2020                    | Decision support only          |
| H14 | **ISO 15189:2022 7.4.1.5** (automated selection, review, release and reporting): criteria approved and understood; validated before use, reviewed regularly, re-verified after changes; auto-selected results identifiable with date and time; rapid suspension. Paraphrase via SADCAS                                                                                                                  | SADCAS                                | Autoverification               |
| H15 | CLSI AUTO15 (2019) current; excludes transfusion medicine and microbiology; stops on analyser malfunction flags. CAP GEN.43875 (validate, test at least annually), .43878 (QC acceptable first), .43887 (audit trail), .43890 (include every delta check). SLIPTA v3 9.6(h), 8.15(a)                                                                                                                    | CLSI; CAP via secondary; ASLM         | Autoverification               |
| H16 | **Uganda National IPC Guidelines, 2nd ed., January 2025**: the **IPC Link Nurse** coordinates HAI surveillance "in collaboration with laboratory services"; MDRO carriers to a single room or isolation ward, else cohort; side rooms preferred for pulmonary TB, VHF and MDROs. Chapters 5–6 not read                                                                                                  | MoH (third-party copy)                | IPC recipient                  |
| H17 | **IDSR 3rd ed. (Sept 2021)**: immediately reportable list in Table 2 (p. 105), weekly in §2.2.1; case-based lab form Annex 2G; weekly data to DHIS2 by Monday 12:00; lab-confirmed MDR/XDR-TB is weekly-reportable; eIDSR has a lab module. **Table 2 contents not extracted**                                                                                                                          | IDSR 3rd ed.; UNIPH 2022              | **Notify-now list**            |
| H18 | **NAP-AMR II (2024/25–2028/29)**: National Microbiology Reference Laboratory "at Butabika"; colonisation screening for priority MDROs; AMR early warning. GLASS sentinel sites since 2016; WHONET weekly; unusual resistance confirmed by the NMRL                                                                                                                                                      | WHO NAP library; JMIR 2021            | Step 10                        |
| H19 | WHO BPPL 2024 critical: CRAB, 3GC-R and carbapenem-R Enterobacterales, RR-TB. NHS Scotland alert list (2026): one isolate from a healthcare-associated case is an alert; ESBL and VRE in high-risk units only                                                                                                                                                                                           | WHO; ARHAI Scotland                   | Alert list seed                |
| H20 | Precautions by result (CDC Isolation Precautions Appendix A, page updated Sept 2026): TB airborne; measles airborne 4 days after rash; _C. difficile_ and MDROs contact; cholera contact if incontinent; meningococcal droplet until 24 h of therapy                                                                                                                                                    | CDC                                   | Suggested precautions          |
| H21 | Electronic alerts work best when IPC acts in the record: correct isolation 15 % → 57 % with emailed alerts, 86–90 % when IPC ordered isolation electronically (Kac 2007); a persistent readmission flag speeds precautions (VA Bug Alert)                                                                                                                                                               | Arch Intern Med; VA                   | Flag design                    |
| H22 | Phase 1 left a `hold_from_patient` seam: nothing critical reaches a patient before acknowledgement                                                                                                                                                                                                                                                                                                      | `PROMPT-LAB-PHASE-1.md`               | Dependency                     |
| H23 | A patient web app exists with a persistent Emergency button, dark mode, and an account-to-record link                                                                                                                                                                                                                                                                                                   | patient workspace prompt              | **Blocks Steps 5–7 if absent** |
| H24 | SMS is sent through Africa's Talking on this branch                                                                                                                                                                                                                                                                                                                                                     | stack notes                           | Dependency                     |

---

## 4. Design direction

**Eight rules**

1. **The doctor first, then the patient.** Nothing reaches a patient before a clinician has reviewed it. A critical result reaches the patient only after the clinician has spoken to them.
2. **Some results are given in person, always.** HIV, the other restricted classes, pregnancy and tissue results never appear in the app or in a message.
3. **Plain words, signed.** Every explanation a patient reads is signed by the CSO. A test without signed words shows its number and range only, with "Ask your doctor what this means".
4. **A message that is safe on someone else's phone.** The SMS says results are ready, never which test, never the value.
5. **The previous result is a witness.** A change bigger than biology allows is a question about the sample, asked before release.
6. **The machine releases only the boring ones.** Autoverification is for normal results that passed every check, opt-in per test, proven in a shadow run, and stoppable by anyone in the lab at once.
7. **Infection prevention hears it in the same minute.** A result that needs isolation reaches the IPC team with the ward, the bed and the precaution, not with the whole chart.
8. **Nothing counted from memory.** Delta limits, autoverification limits, the alert list, plain words and release rules are signed data, never code.

**Budgets** (measured at Step 0 where a baseline exists; met by Step 11)

| Measure                                                                   | Budget                                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A reviewed result visible in the patient's app                            | p95 < 60 s after review                                                    |
| Patient results page on a mid-range Android phone over 3G                 | p95 < 3 s to first content; under 150 KB transferred                       |
| "Results ready" SMS sent after the first visible result                   | p95 < 5 min; at most one SMS per patient per batching window (operational) |
| Delta evaluation at result save (server)                                  | p95 < 50 ms per component                                                  |
| Autoverification decision per specimen (server)                           | p95 < 200 ms                                                               |
| IPC alert raised after release                                            | p95 < 60 s                                                                 |
| Results visible to a patient before review                                | 0                                                                          |
| Restricted, pregnancy or tissue results visible to a patient or in an SMS | 0                                                                          |
| Results released by rule that failed any check                            | 0                                                                          |
| IPC alerts for listed conditions missed in the replay test                | 0                                                                          |

---

## 5. Interface specification

**Patient side** (the patient web app, responsive, built and tested at 390 px first; no Expo): Home · Visits · **Results** · Me. The Emergency button stays on every screen (MedSync principle).

**Lab navigation** after this slice:

- Worklist · Criticals · Released today · **Released by rule** · To refer · Referrals · Rejected · Downtime entry;
- Quality, Reports and Exchange (unchanged);
- Set-up gains **Delta checks**, **Autoverification** and **Patient release**.

**Infection prevention workspace** (new, for `ipc.alerts`): **Lab alerts** · **Alert list** · **Surveillance and AMR**.

Each item appears only when its flag is on and the viewer holds the permission.

### 5.1 Patient: my results (artboard 1)

- Header: hospital, the patient's name and hospital number (two identifiers).
- **Not ready to show yet:** tests ordered for this patient that are not yet visible, each with one line:
  - "Your doctor looks at this first. It will appear here after that." (released, not yet reviewed, or held);
  - "Sent to another lab. Expected back about {date}." (Phase 4 referral with a stated turnaround);
  - "Waiting for the lab." (not yet released).
  - **Never listed:** tests in the never-shown groups (PR-3). They appear nowhere in the app, not even as a name.
- **Ready:** one card per visible result: test, date, value and unit, a **plain status word** (PR-8), and one line ("Your doctor has seen this and will talk with you on {date}", the doctor's note if any, or the test's short line).
- Footer line: Appendix A "In person".
- An empty state says "No results yet", never a blank list.
- Pull to refresh; the page works offline from the last copy with "Last updated {time}" (no PHI cached beyond the session's service-worker store, cleared at sign-out; PR-14).

### 5.2 Patient: one result (artboard 2)

- Value and unit, the status word, a **range line** (the usual range shaded, the value as a dot, labels at the range ends; text alternative in words), "Ranges differ between labs".
- **What this test is:** the signed plain words (PW-\*) in the patient's language; if none are signed, "Ask your doctor what this means".
- Calculated values derived by the lab (eGFR) with their one-line signed explanation.
- **Earlier results:** the same concept's visible results, newest first (trend as a list in this slice).
- **Next:** the clinician's note to the patient if written, the next visit if booked, and the fixed line: "If you feel very unwell before then, press Emergency or go to the nearest health facility."
- Provenance in one line: released by {lab} on {date}; seen by your doctor on {date}; done at {partner} for referred tests; "Measured on the ward" for bedside tests.
- A corrected result shows "Corrected on {date}" and the earlier value struck through with its date.

### 5.3 Results-ready SMS and settings (artboard 3)

- **The SMS** (Appendix A "Results-ready SMS"): hospital name, "new results in MedSync", open the app or ask at the next visit. No test name, no value, no link that opens PHI without sign-in.
- **Settings:**
  - Show my results in the app (consent, with the date given; turning it off hides results at once and stops SMS);
  - Text me when results are ready (number shown masked);
  - Language for explanations (only languages with signed words are offered);
  - Who else can see my results (guardian links are made at the hospital, never in the app);
  - Ask for a copy of all my results (opens a request the records office fulfils; PR-15).

### 5.4 Doctor: review and release to the patient (artboard 4)

- Extends the doctor's results list with a column **The patient sees it**:

  | State                                    | Chip                 |
  | ---------------------------------------- | -------------------- |
  | When you mark it reviewed                | Neutral              |
  | After you have spoken to them (critical) | Amber                |
  | In person only (never-shown group)       | Neutral with a lock  |
  | Held until {date}                        | Amber                |
  | Seen by the patient {time}               | Neutral with a check |
  | Patient has not agreed to see results    | Dashed               |

- **Critical result panel:** the Appendix A "Critical to patient" note; how you told them (in person, by phone, through their guardian); an optional note the patient will see, with the clinician's name; **I have spoken to them**; **Hold from the patient**.
- **Hold from the patient:** a reason (explain in person first; seeing it now could harm the patient) and an until-date. Holds are audited and listed for the CSO's monthly review (PR-7).

### 5.5 What patients see, and when (artboard 5)

- For `lab.manage` (draft) and the CSO (sign).
- **Release table** by group: routine; critical; referred; bedside; corrected after the patient saw it; HIV; the other restricted classes; pregnancy; tissue and cytology. For each: in the app (when), results-ready SMS (yes or no), plain words (count signed).
- **Plain words** per test and language: text, status (signed, draft, none), signer and date. Tests without signed words show "Shown as number and range only".
- **Patients under 18:** the guardian rule (PR-11), signed.
- Versioned; signing needs the CSO's fresh second factor (D-LAB1-12 applies).

### 5.6 Result entry with a delta check (artboard 6)

- Extends Phase 1 result entry and Phase 4 interfaced entry.
- A header chip "{n} delta checks" when any rule fires.
- The **Last time** column shows the previous value of the same concept; when a rule fires, it becomes an amber chip "{value} · delta".
- **Delta block** (amber, `role="alert"` once): Appendix A "Delta check" for the component, with the rule's signed meaning (for example, a suspected wrong sample).
- **Side panel** per fired rule: previous (time, lab number, released), now, change (absolute and per cent, and the interval), the rule id and its source line; **Your decision**: hold and ask for a new sample; confirmed this patient's sample with the ward; explained by treatment or transfusion; and **What you checked** (required).
- **Release stays disabled** until every fired rule has a decision (DL-6).

### 5.7 Delta check rules (artboard 7)

- For `lab.manage`.
- **Table:** rule, component, compared as (absolute change, per cent change, change beyond the reference change value), limit, previous result within, flagged in the last 30 days (rate; "No data" when none), status (draft, signed, flags often · review).
- **Try it on past results:** pairs in the last 90 days, how many would have flagged, how many of those were known mislabels (from nonconformities). The trial reads released results only and writes nothing.
- **How a rule is set:** limit source written down, signed by the laboratory lead, the set countersigned by the CSO, flag rate reviewed monthly. A rule without a signed limit never runs.

### 5.8 Autoverification for one test (artboard 8)

- For `lab.manage`; the CSO countersigns.
- Header: test and analyser, state (Off · Shadow day {n} of {m} · On · Suspended), **Suspend now** (any lab user with result release).
- **Checks** (all must pass; AV-2), each in words.
- **Shadow run:** results seen, rule would release (count and per cent), of those a technologist changed or held (must stay 0).
- **Before it goes on:** each check tested with a passing and failing case; shadow complete with nothing changed; laboratory lead signs; CSO countersigns.
- **Revalidate** interval and triggers, and the **daily review sample** size (both signed settings).

### 5.9 Released by rule (artboard 9)

- For lab users.
- **Tiles:** released by rule; waited for a person; daily review sample (done of required); changed after release by rule (this month).
- **Table:** sample, patient (two identifiers), released, checks passed with the QC run, review (a button, or reviewed by).
- **Why they waited:** a bar per failed check with counts. Every number opens its results.
- **Suspensions:** who, when, why, when resumed.

### 5.10 Infection prevention: lab alerts (artboard 10)

- For `ipc.alerts` (the IPC link nurse and the IPC team); the ward in charge sees alerts for their ward.
- **Segments:** Open · Closed this week · Flagged patients, with counts; live.
- **Alert row:** time released; condition (from the alert list, with the test that triggered it); patient (two identifiers), ward and bed (from the current admission or the visit); the suggested precaution and the IDSR route in one line; state chip:

  | State                      | Chip                                    |
  | -------------------------- | --------------------------------------- |
  | New · {minutes}            | Amber with a clock                      |
  | Escalated                  | Dark amber                              |
  | Precautions started {time} | Neutral with a check                    |
  | Already in precautions     | Neutral with a check                    |
  | Not needed: {reason}       | Neutral                                 |
  | Notified {time}            | Neutral with a check (IDSR-only alerts) |
  | Contacts to trace          | Amber                                   |

- **Side panel:** the minimum dataset (IC-5): sex, age, place, admission date; suggested precaution and the stop line from the signed list ("decided by the clinician and IPC" where the list says so); who told the ward and when; also goes to (the surveillance focal person for IDSR items); **What was done** (precautions started, already in precautions, not needed with a reason), **Where** (side room, cohort bay, no side room free), **List contacts** (a count and a note in this slice), **Record**.
- **Patient flag note:** a flag now sits on the record and shows at readmission, transfer, registration and triage; only IPC clears it (IC-8).
- Footnote: Appendix A "IPC minimum".

### 5.11 Alert list (artboard 11)

- For `ipc.manage` (the facility IPC lead) with the laboratory lead; read-only for the IPC team.
- **From tests this lab reports today:** trigger (test and result), suggested precaution, IPC alert (yes, or "test not on this menu"), also to the surveillance focal person (notify now · weekly IDSR item · TB programme route · none), source.
- **From microbiology:** organism or resistance, where it alerts (every ward, or high-risk units only), precaution, confirm at the reference laboratory. Shown with "Waiting for the microbiology module" until GATE M; editable, not evaluated.
- **How the list works:** signers, recipients, the notify-now list's source (IDSR 3rd ed. as checked at set-up), the one-alert rule.
- Versioned; signing by the IPC lead and the laboratory lead with a fresh second factor.

### 5.12 Surveillance and AMR (artboard 12)

- For `ipc.alerts` (read) and `ipc.manage`.
- **Tiles:** lab alerts this week (open, closed), release to precautions (median, with the number of alerts that have a time), flagged patients readmitted, isolates sent for confirmation ("No data" until microbiology).
- **Lab-confirmed counts for the weekly IDSR report** by IDSR item for the epi-week (Monday to Sunday), each count a link to its results for users allowed to see them; the DHIS2 deadline line; footer: Appendix A "IDSR support".
- **AMR export** and **Healthcare-associated infections:** shown as "Needs microbiology" with what will come (Step 10). No zeros where there is no source: "No data".
- **Print the weekly digest** for the IPC committee (aggregates only).

### 5.13 Known differences from the canvas

- Artboard 1 shows a lipid profile "sent to another lab" as not ready; that line comes from the Phase 4 referral and is shown only for groups the patient may see (PR-3 applies to pending tests too).
- Artboard 3's settings toggles are drawn with the checkbox style; build them as real switches (`role="switch"` on a `<button>`).
- Artboard 4 shows a pregnancy test as "In person only". Pregnancy tests are in the never-shown floor (PR-3); build exactly that.
- Artboard 6's MCV values and artboard 7's flag rates are examples; "[limit]" means no limit is proposed.
- Artboard 8 shows "Revalidate every 12 months" and a daily sample of 5: both are examples of signed settings (CAP asks for at least annual testing; the laboratory lead signs the interval).
- Artboard 10 shows a measles IgM from a referred result; referred results raise alerts when filed (IC-2).
- Artboard 12 shows malaria counts: weekly IDSR items come from the signed list at Step 0, not from the canvas.

## 6. Engines (pure, no I/O unless stated; every rule has an ID and at least one test)

### 6.1 Patient release (`lib/lab/patient-release.ts`)

- **PR-1** `visibleToPatient(result, context)` is true only when **all** hold:
  - the result is released (Phase 1), and no amendment of it is pending;
  - its test is not in a never-shown group (PR-3);
  - the patient's results consent is on (PR-12), and the viewer is the patient or a linked guardian allowed by PR-11;
  - a clinician has **reviewed** it (PR-2);
  - if it was critical, a clinician has recorded **spoken to the patient** (PR-4);
  - no active hold (PR-7);
  - the group's signed release rule allows it (5.5).

  It is pure over a snapshot and returns `{ visible, reason }`. The reason drives the "Not ready to show yet" line and the doctor's chip.

- **PR-2** **Reviewed** is the Phase 1 acknowledgement or "Mark reviewed" by a clinician who may open that order (the ordering clinician or a member of the patient's care team, per the patient-access basis signed at Gate A of the workspaces). Autoverification (AV-\*) and the lab's release never count as review.
- **PR-3** **Never-shown groups** (a floor in code that configuration can add to and never remove from): the Phase 1 restricted classes (`hiv`, `tb`, `mental_health`, `sexual_reproductive_health`); pregnancy tests; histology and cytology. Tests in these groups are absent from every patient surface, every SMS trigger and every patient export, including as names on "Not ready to show yet".
- **PR-4** **Critical results** need a `patient_told` event (how: in person, phone, through the guardian; by whom; when). Until then the patient sees "Not ready to show yet". A repeat critical on the same concept needs its own event.
- **PR-5** **Corrected results** (Phase 1 CA-10): when a visible result is amended, the patient sees "This result is being checked" in place of the value until the clinician acknowledges the correction alert; then the corrected value shows with "Corrected on {date}" and the earlier value struck through.
- **PR-6** **Referred** (Phase 4) and **bedside** (Phase 2) results follow their test's group, with the done-at or "Measured on the ward" line.
- **PR-7** **Holds** are a per-result clinical decision, never a blanket rule (therapeutic privilege: Patients' Charter Art. 10, information "likely to cause severe harm"; Mental Health Act 2018 s.57(2)). The DPPA has no harm exception, so a hold delays the app view only (PR-15). A hold records reason (`explain_in_person`, `harm_to_patient`), until-date (required, no more than the signed maximum), clinician. Holds are audited, listed for the CSO monthly, and expire into review, not into visibility: an expired hold asks the clinician again.
- **PR-8** **Status words** come only from the result's own flag against the range snapshotted on it (Phase 1 Law 8): "Within the usual range", "Higher than the usual range", "Lower than the usual range", "No range for this test". Decision-scheme categories (Phase 2) show to patients only where the CSO has signed patient wording for that scheme. The word "critical" never shows to a patient.
- **PR-9** The range line uses the snapshotted range and the value; scale bounds are computed from them (pure, tested at the edges: value far outside, open-ended ranges such as "< 5", qualitative results show no line).
- **PR-10** **Identity:** a patient account sees only the hospital records linked to it through the verified link the patient workspace uses (Step 0 Q4). No search, no MRN entry by the patient. The header shows two identifiers.
- **PR-11** **Children and adolescents** (D-LAB5-08; a Ugandan legal opinion is required before switch-on):
  - **under 12:** results show to the guardian linked at the hospital (identity checked by staff, recorded), matching the HIV and AIDS Prevention and Control Act 2014 s.18(2)(a) model of a parent or guardian receiving a minor's result. PR-3 groups stay in person;
  - **12 to 17:** the guardian sees only groups the CSO signs as guardian-visible; PR-3 groups never go to the guardian. Whether the adolescent has their own account follows the legal opinion (DPPA 2019 s.8 needs parental consent for a child's data; Uganda's HIV testing guidance lets those aged 12 and over consent to an HIV test alone);
  - **until the opinion and the CSO's rule are signed, patients under 18 see nothing in the app** and guardians see nothing either;
  - **18 and over:** no proxy without the patient's recorded consent.
- **PR-12** **Consent:** "Show my results in the app" is a separate, recorded, withdrawable choice (date, channel, version of the notice shown). Withdrawal hides results at once and stops SMS.
- **PR-13** **Audit:** every patient or guardian view of a result (who, when, which result, device class) is recorded; the doctor sees "Seen by the patient {time}".
- **PR-14** **Device privacy:** no PHI in `localStorage` or IndexedDB; the offline copy lives only in the service-worker cache for the session and is cleared at sign-out and at session expiry (operational setting); the page never shows PHI in the browser tab title or in notifications.
- **PR-15** **Copy of results:** "Ask for a copy" creates a records request (Section 7) that the records office fulfils under the patient's right of access (DPPA 2019 s.24; response within 30 days, s.24(9); Patients' Charter 2009 Art. 16, a copy of one's records). **A hold in the app never blocks a lawful access request**; the records office sees held results flagged so the clinician can be asked first. The app never generates a full-record export itself in this slice.
- **PR-16** **Aged results:** a visible-to-be result still unreviewed after the signed window (recommended 7 days) is listed for the reviewing clinician and their head of department, so results do not sit unreleased indefinitely. The patient still sees "Not ready to show yet".
- **PR-17** **Language:** plain words show in the patient's chosen language only when signed in that language; otherwise English with "Not yet available in {language}".

### 6.2 Results-ready SMS (`lib/notify/results-ready.ts`)

- **PS-1** One fixed template per language, signed by the CSO (Appendix A). It never contains a test name, a value, a clinic name that reveals a condition (no "ART clinic", "TB clinic"), or a link that opens PHI without sign-in.
- **PS-2** Sent only when a result **becomes visible** under PR-1 for a group whose rule allows SMS, to a patient who opted in with a verified number. Never for PR-3 groups, so the timing of an SMS never hints at a restricted test.
- **PS-3** **Batching and hours:** at most one SMS per patient per batching window (operational). Sent only between 06:00 and 19:00 local time; later results wait for the morning (the Uganda Communications (Text and Multimedia Messaging) Regulations, S.I. 83 of 2019, reg. 19, apply to private facilities; MedSync applies the same hours everywhere). Delayed, never dropped.
- **PS-4** **Identity and opt-out:** a neutral, registered alphanumeric sender ID per hospital that names no condition-specific clinic (reg. 10); every message carries a free STOP route honoured within 24 hours (reg. 12), and STOP turns off PS for that patient and records it.
- **PS-5** For patients under 18, the SMS goes to the linked guardian only.
- **PS-6** Sending runs in the notification worker; failure is logged and retried, and never throws into the release path. Delivery status is stored without the message body.
- **PS-7** The sender ID, the provider (Africa's Talking on this branch) and any registration the provider or the regulator requires are confirmed at Step 0 (Q11).

### 6.3 Plain words (`lib/lab/plain-words.ts`)

- **PW-1** Per test concept and language: "what this test is" (required), a one-line short form, and optional lines for calculated values. Versioned; signed by the CSO.
- **PW-2** Written to plain-language rules (short sentences, everyday words, no abbreviations unexplained). Each text records a readability score from a named method at signing (reported, not a gate).
- **PW-3** No diagnosis, no dosing, no instruction to change treatment, no reassurance that depends on the value ("this is nothing to worry about"). A lint lists banned phrases (signed list).
- **PW-4** A translation is signed only with a forward translation, an independent back translation and the reviewer's name.
- **PW-5** An **action line** per test result band, signed (for example "No action needed", "Your doctor will talk with you about this"). Display alone does not stop patients misreading results; the action line and the clinician's note carry the meaning. A "harm anchor" (where most doctors start to be concerned) is shown only where the CSO has signed the threshold for that test.
- **PW-6** A test with no signed words shows the number, the unit, the range line and "Ask your doctor what this means".

### 6.4 Delta checks (`lib/lab/delta.ts`)

- **DL-1** A rule follows CLSI EP33 (2nd edition, 2023): **type**, **limit** and **look-back window**. Type: `absolute`, `percent`, `rate_absolute` (change per day), `rate_percent`, `rcv`. Limit: one value, or separate rise and fall limits; for `rcv`, the analytical CV source and the within-subject biological variation with its source. **Basis** recorded: `rcv`, `local_patient_percentile` (from this lab's own pairs) or `clinical`, with the approver. Look-back window: per rule, no hidden default (no window is shown to be best); optional applicability (age band, specimen, ward); a signed meaning (for example "may be another patient's sample"); the limit's source written down. Versioned; signed by the laboratory lead; the set countersigned by the CSO.
- **DL-2** **Previous result:** the most recent released result of the same concept for the same patient within the interval, converted only through the unit registry, excluding values amended away. Different method groups (Phase 2 method register) are compared only if the rule says so; otherwise the panel says "Earlier result by a different method; not compared".
- **DL-3** **Evaluation** (pure): `absolute`: |now − previous| > limit; `percent`: |now − previous| / previous × 100 > limit; `rate_*`: the same divided by the days between the results; `rcv`: per cent change > RCV, with **RCV = √2 × Z × √(CVA² + CVI²)** (Fraser), Z chosen on the rule (two-sided 1.96 or 2.58; one-sided 1.65 or 2.33), CVA from this lab's Phase 3 QC data for that analyser and level, CVI from the EFLM Biological Variation Database entry named on the rule. A log-normal (asymmetric) RCV is offered for skewed analytes. **No numeric limit ships in code or seeds**; the RCV calculator proposes, the laboratory lead signs.
- **DL-4** A fired rule produces a delta flag on the result component with the rule version, both values, times and the computed change.
- **DL-5** Context shown, never used to suppress: a transfusion, dialysis or surgery recorded between the two results is listed in the panel.
- **DL-6** **Release needs a decision** on every fired rule, from a structured list: `physiological_or_treatment`, `transfusion_or_dialysis`, `confirmed_same_patient` (with whom), `contamination_suspected`, `previous_specimen_suspect`, `recollect`, `mislabel_confirmed`. The note is required. The panel always prompts **"Check the previous specimen too"** (in published audits the earlier sample was often the wrong one, and rarely checked). This is a soft stop: the technologist decides, the system records. Most delta alerts are real physiological change, so the outcome list is how each rule's usefulness is measured (DL-9).
- **DL-7** `hold_new_sample` rejects the specimen through the Phase 1 rejection path with reason "Possible wrong sample (delta check)" and tells the ward; a later sample is linked. A confirmed wrong sample opens a Phase 3 nonconformity (wrong blood in tube).
- **DL-8** `trialRule(rule, releasedPairs)` (pure): counts pairs, flags, and flags that match known mislabel nonconformities. It writes nothing.
- **DL-9** Monthly per rule: flag rate and the share of each outcome (its positive predictive value for sample errors); above the operational threshold, the rule shows "Flags often · review" (EP33's post-implementation review).
- **DL-10** **Panel rules:** "send to a person if at least k of N components fail their delta", signed per test. Per-component rules across a large panel multiply false alarms.
- **DL-11** **Pattern rules**, described in words and signed by the laboratory lead with the lab's own thresholds: suspected EDTA contamination (potassium high with calcium low, with or without low magnesium and ALP) and suspected drip-arm dilution (many analytes falling together with glucose rising). A pattern rule informs and needs a decision like a delta rule. None ships with numbers.
- **DL-12** Interfaced (Phase 4) and referred results are evaluated too. A delta flag always sends the result to a person (AV-2).
- **DL-13** Restricted classes: delta runs and shows only to users with access to the class.

### 6.5 Autoverification (`lib/lab/autoverify.ts`)

- **AV-1** Opt-in per test per analyser. A rule set is versioned and signed by the laboratory lead and countersigned by the CSO. No rule set, no autoverification.
- **AV-2** **Checks** (all must pass; each recorded with its value):
  1. every component came from the analyser (Phase 4) and was not edited;
  2. the latest QC run for every component on that analyser is accepted **and current for today** (Phase 3 `qcStatusFor`), and no QC hold applies. **No current QC means a person releases** (stricter than systems where missing QC "neither clears nor blocks");
  3. no analyser flag or message on the specimen or any component;
  4. every value inside the analytical measuring range and inside the reference range snapshotted on the result (or inside narrower autoverification limits if the rule set gives them, never wider);
  5. no critical value;
  6. every delta, panel and pattern rule passed, or there is no earlier result (DL-\*; the same rules a technologist sees, never fewer);
  7. the specimen was received, has no comment or rejection note and no open nonconformity, was tested within the time from collection the rule set allows, and its serum indices (haemolysis, icterus, lipaemia), where the analyser sends them, are below the signed limits;
  8. the patient is not excluded (rule-set exclusions; always excluded: the patient's first result for the test, and the PR-3 groups).
- **AV-3** **States:** `off → shadow → on`, and `suspended` from `on`. Shadow lasts the signed period or count, whichever is later; the rule decides and logs, a technologist still releases. Promotion to `on` needs zero shadow results where the rule would release and the technologist changed or held, plus both signatures.
- **AV-4** **Suspend** is available to any lab user who can release results; it takes effect for the next result, needs a reason, and is audited. **Resume** needs `lab.manage` and a passed QC run.
- **AV-5** **Automatic suspension** on: a QC rejection on that analyser (Phase 3), the analyser marked down or the bridge not heard from (Phase 4), any change to the analyser's code mapping, the test's reference ranges, the delta rules for its components, or the rule set itself (a changed rule set returns to `shadow`).
- **AV-6** **Release by rule** is a release event by the service identity `svc.autoverify`, carrying the rule set version and every check's value. Downstream it is an ordinary release: criticals cannot occur (check 5), the doctor sees a released result, and the patient sees it only after review (PR-2).
- **AV-7** **Daily review sample:** the signed number of results released by rule is drawn at random each day for a technologist to review. Any change after review opens an amendment and **suspends** the rule set until the laboratory lead reviews it.
- **AV-8** **Revalidation:** at the signed interval and after any AV-5 trigger, the rule set re-runs its check cases and a short shadow before `on` again.
- **AV-9** The record of a result released by rule is identifiable in the audit trail and the lab's result view, with the date, time and rule set version (ISO 15189:2022 7.4.1.5; CAP GEN.43887). Any change to the analyser's message set reruns the end-to-end interface test before `on`.
- **AV-10** Never in this slice: blood bank and microbiology (excluded by design, as CLSI AUTO15 excludes them), autoverification of typed results, of referred results, of bedside results, or of any qualitative result.

### 6.6 The infection prevention feed (`lib/ipc/lab-alerts.ts`)

- **IC-1** **Alert list entries** (versioned; signed by the facility IPC lead and the laboratory lead): trigger (a test and a result answer or flag from the catalogue; a Phase 4 high-risk outbreak referral; later, an organism and phenotype); scope (every ward, or high-risk units named by the hospital); suggested precaution type and the stop line (signed text with its source); IPC alert yes or no; IDSR route (`notify_now`, `weekly_item` with the IDSR item name, `programme_route`, `none`); confirmation needed (for screening tests and unusual resistance); source.
- **IC-2** **Evaluation** (pure over the released result and the list): on every release (typed, interfaced, released by rule, bedside), on every referred result filed (Phase 4), and on the creation of an outbreak referral (Phase 4 RF-7). An amendment that removes the triggering answer closes the alert with "Result corrected" and tells the recipients.
- **IC-3** **One alert per patient per condition per admission** (or per visit for outpatients); later matching results attach to it.
- **IC-4** **Recipients:** the IPC link nurse on duty (the hospital's roster if one exists, else every holder of `ipc.alerts`) and the in-charge of the patient's ward; `notify_now` and `weekly_item` entries also go to the facility surveillance focal person (`surv.focal`). In-app live. An optional SMS to the on-duty IPC link nurse says only "New IPC lab alert at {hospital}. Open MedSync." (no patient, no condition).
- **IC-5** **Minimum dataset** in the alert: the patient's two identifiers, sex, age, current place (ward and bed from the admission, or the clinic and date of the visit), admission date, the condition, specimen date, release time, suggested precaution. **Not** the result values, other results or the chart.
- **IC-6** **Actions** (append-only): `precautions_started` (type, place, time), `already_in_precautions`, `not_needed` (reason), `contacts_listed` (count and note), `notified` (to whom, channel, time). Closing needs one of the first three, or `notified` for IDSR-only alerts.
- **IC-7** **Escalation:** an alert with no action within the signed window (operational) escalates to the IPC lead and the ward in-charge, and shows "Escalated".
- **IC-8** **Patient flag:** `precautions_started` (or a listed condition the IPC team confirms) sets a flag on the patient record (condition, precaution, set by, set at). It shows on ward lists, the bed view, registration and triage at every later encounter. Only `ipc.manage` or `ipc.alerts` clears it, with a reason (for example the clearance criterion the IPC policy sets); history is kept.
- **IC-9** **Readmission and transfer:** registering, admitting or transferring a flagged patient raises an IPC alert "Flagged patient {admitted or moved} to {place}".
- **IC-10** **IDSR support:** counts of lab-confirmed results per IDSR item per epi-week (Monday to Sunday, hospital local time), each opening its results for users allowed to see them. MedSync **does not report cases** to DHIS2 or eIDSR in this slice; the surveillance focal person does. A printable case-based laboratory form (IDSR Annex 2G) is pre-filled only with fields Step 0 confirms on the current form.
- **IC-11** **Screening results** (for example a cholera rapid test) are labelled "Screening result: confirm" where the list says confirmation is needed, and the alert shows whether a confirmatory specimen was sent (Phase 4 referral).
- **IC-12** **Nothing changes a patient's care automatically.** The suggestion is text; the IPC team's recorded action sets the flag. Ordering precautions in a nursing record waits for the inpatient module (seam left: the flag is the input it will read).
- **IC-13** **Weekly digest** (aggregates only) for the IPC committee: alerts by condition and ward, release-to-precaution times, flags open, flagged readmissions, and, after Step 10, isolates awaiting confirmation and HAI candidates.
- **IC-14** **Restricted class `tb`:** IPC staff see the condition through the alert only (Law 9). The alert view is audited. They cannot open the TB result itself without class access.

### 6.7 Microbiology feed and AMR export (`lib/ipc/micro.ts`; GATE M, Step 10 only)

- **MB-1** Evaluated only when the microbiology module emits `isolate_reported` events (organism, specimen type, phenotype flags such as ESBL, carbapenemase and MRSA screen, susceptibility results with method and guideline). Alert list entries with organism or phenotype triggers then evaluate (IC-2). Scope `high_risk_units` uses the hospital's unit list.
- **MB-2** **Unusual resistance** (as the list marks it: carbapenemase, vancomycin or linezolid non-susceptibility, _Candida auris_, and others the IPC lead adds) is shown as **presumptive** and creates a Phase 4 referral of the isolate to the national reference laboratory; the alert shows the confirmation state.
- **MB-3** **WHONET export:** isolate-level CSV with stable lab, specimen and isolate ids, specimen date, **admission date**, ward and location type, specimen type coded to GLASS categories, organism, phenotype flags, and one column per antibiotic with guideline and method. Column names and codes are verified against the current WHONET documentation at Step 10 (the research list is secondary). The field list is signed by the data protection lead; names are excluded unless the national surveillance plan requires them.
- **MB-4** **GLASS deduplication** (first isolate per patient, specimen type, pathogen and period) applies only in the aggregate view, never to the raw export.
- **MB-5** **Origin** (hospital or community) is derived from the admission date and the specimen date by the rule in the current GLASS manual, verified at Step 10.
- **MB-6** **HAI support:** positive cultures by ward and unit, linked to device and procedure dates where the inpatient record holds them; denominators (patient-days, device-days, operations) only where those records exist. Definitions follow the national HAI surveillance plan once published; until then the IPC team adjudicates and the view says so.

---

## 7. Data changes (only what GATE A approves; additive; next free migration numbers)

**Patient release**

- `patient_release_rules` (group, in-app rule, SMS allowed; versioned; CSO-signed).
- `never_shown_groups` (the floor as a check constraint plus additions).
- `result_reviews` (if Phase 1's acknowledgement does not already record the reviewer per result).
- `patient_told_events` (result, how, by, at).
- `patient_holds` (result, reason, until, by; append-only events for set, extend, release, expire).
- `patient_result_views` (append-only: viewer, result, at, device class).
- `patient_results_consents` (patient, state, date, channel, notice version; append-only).
- `guardian_links` (if not present: guardian, patient, verified by, at, scope).
- `records_requests` (patient, requested at, fulfilled at, by).
- `plain_words` (concept, language, texts, action lines, harm anchor, version, signer).
- `clinician_notes_to_patient` (result, text, author, at).

**SMS**

- `sms_consents`, `sms_opt_outs` (append-only), `sms_sends` (patient, template version, provider id, status; no body).

**Delta**

- `delta_rules` (type, limits, window, basis, CVA and CVI sources, Z, applicability, meaning; versioned, signed), `panel_rules`, `pattern_rules`.
- `delta_flags` (result component, rule version, previous result id, values, change, interval) and `delta_outcomes` (append-only).

**Autoverification**

- `av_rule_sets` (test, analyser, checks configuration, limits, exclusions, shadow period, review sample, revalidation interval; versioned; signed twice), `av_states` (append-only state changes with reason), `av_decisions` (specimen, rule set version, each check's value, decision), `av_reviews`.
- On result components: `released_by` (`person` or `rule`), `av_decision_id`.

**IPC**

- `ipc_alert_list` (versioned, signed), `ipc_alerts`, `ipc_alert_actions` (append-only), `patient_ipc_flags` and `patient_ipc_flag_events` (append-only), `ipc_unit_types` (high-risk units).
- Step 10 only: `isolate_events` (from microbiology), `isolate_referrals` (links to Phase 4 referrals), `whonet_exports` (append-only record of each export: who, when, period, field list version).

**Permissions**

- `patient.results.release` (clinicians; part of the existing review permission if found).
- `patient.release.rules` (draft) and the CSO signature.
- `lab.delta.manage`, `lab.av.manage` (laboratory lead); `lab.av.suspend` (every user who can release).
- `ipc.alerts` (IPC link nurse and team), `ipc.manage` (facility IPC lead), `surv.focal` (surveillance focal person), `ward.incharge` (as found).
- Service identity `svc.autoverify` (release by rule only, for rule sets in state `on`).

**RLS probes** for every new or changed object:

| Actor                                                                                                                                                                                                                      | Access                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient, own linked record                                                                                                                                                                                                 | Only results where `visibleToPatient` is true, their own consents, settings, requests and SMS state. **Never** a PR-3 group, never another patient |
| Guardian                                                                                                                                                                                                                   | As PR-11 allows, for linked children only                                                                                                          |
| Clinician who may open the order                                                                                                                                                                                           | The patient-sees state, holds, told events, notes; sets them                                                                                       |
| Lab staff                                                                                                                                                                                                                  | Delta flags and outcomes; released-by-rule lists; suspend (with permission)                                                                        |
| Laboratory lead                                                                                                                                                                                                            | Rules and rule sets; shadow and review data                                                                                                        |
| CSO                                                                                                                                                                                                                        | Sign release rules, plain words, the minors rule, delta sets, AV rule sets                                                                         |
| IPC link nurse (`ipc.alerts`)                                                                                                                                                                                              | Alerts for their hospital with the IC-5 minimum dataset; actions; flags. **No result values, no chart**                                            |
| Ward in-charge                                                                                                                                                                                                             | Alerts for patients on their ward; flags on their ward's patients                                                                                  |
| Surveillance focal person                                                                                                                                                                                                  | IDSR counts and the alerts routed to them; no other patient rows                                                                                   |
| Hospital admin                                                                                                                                                                                                             | Aggregates of patient-results uptake and IPC digests; **no patient rows**                                                                          |
| `svc.autoverify`                                                                                                                                                                                                           | Insert a release by rule for a rule set in `on`; nothing else                                                                                      |
| Staff of another hospital                                                                                                                                                                                                  | Denied                                                                                                                                             |
| Superadmin without break-glass                                                                                                                                                                                             | Denied                                                                                                                                             |
| Anonymous                                                                                                                                                                                                                  | Denied                                                                                                                                             |
| Any client, direct INSERT, UPDATE or DELETE                                                                                                                                                                                | Denied everywhere                                                                                                                                  |
| Any actor, UPDATE or DELETE on `patient_result_views`, `patient_told_events`, hold events, consent rows, `sms_opt_outs`, `delta_outcomes`, `av_states`, `av_decisions`, `ipc_alert_actions`, flag events, `whonet_exports` | Denied, including the service-role path                                                                                                            |

---

## 8. Server actions

The house contract applies to every write:

`'use server'` → Zod with an idempotent client key → auth (`getUser()`) → AAL2 for staff (the patient app's own assurance level for patients) → permission → hospital-scope check → one transaction → PII-redacted log → audit row → `{ id, serverTime }`.

Notification failures never throw.

| Group                  | Actions                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient release        | `saveReleaseRules` · `signReleaseRules` · `savePlainWords` · `signPlainWords` · `saveMinorsRule` · `signMinorsRule` · `recordPatientTold` · `holdFromPatient` · `releaseHold` · `writeNoteToPatient` |
| Patient                | `setResultsConsent` · `setSmsConsent` · `setLanguage` · `requestRecordsCopy` · `recordResultView` (server-side on read)                                                                              |
| Records office         | `fulfilRecordsRequest`                                                                                                                                                                               |
| SMS                    | `stopSms` (from the provider's inbound STOP)                                                                                                                                                         |
| Delta                  | `saveDeltaRule` · `signDeltaRule` · `countersignDeltaSet` · `savePanelRule` · `savePatternRule` · `trialRule` (read-only) · `recordDeltaOutcome`                                                     |
| Autoverification       | `saveAvRuleSet` · `signAvRuleSet` · `countersignAvRuleSet` · `startAvShadow` · `goAvLive` · `suspendAv` · `resumeAv` · `reviewAvSample`                                                              |
| IPC                    | `saveAlertList` · `signAlertList` · `recordIpcAction` · `clearPatientFlag` · `printWeeklyDigest`                                                                                                     |
| Microbiology (Step 10) | `exportWhonet` · `referIsolate`                                                                                                                                                                      |

Release by rule runs in the result pipeline as `svc.autoverify` (AV-6), not as a user action. Signing actions require a fresh second factor and refuse a signer who authored the draft's last change when a second person is available (D-LAB1-12 carries over).

---

## 9. Steps and gates

### Step 0 — Discovery and baseline (no product changes)

**Answer and report:**

- **Q1** Are lab Phases 1–4 merged? List the engines and tables this slice uses (acknowledgement and review, criticals, amendments, `hold_from_patient`, decision schemes, bedside, method register, QC status, nonconformities, interfaced results with analyser flags, referred results, outbreak referrals). **If not, STOP.**
- **Q2** Confirm or correct H1–H24, each with its file, line or source.
- **Q3** **The patient web app:** routes, authentication and its assurance level, the Emergency button, dark mode, any service worker or offline store, and what PHI it shows today. **If there is none, Steps 6–8 stop and report.**
- **Q4** **Account-to-record link:** how a patient account is linked to a hospital record, how the link is verified, how guardians are linked (if at all), and how many linked accounts exist at the test hospital.
- **Q5** **Review today:** does Phase 1 record, per result, which clinician reviewed it and when? How are criticals acknowledged? Where does `hold_from_patient` sit?
- **Q6** **SMS:** the notifications module, the Africa's Talking account, any registered sender ID, inbound message handling (for STOP), and delivery receipts.
- **Q7** **Legal opinion** (ask the hospital's counsel, through Fadhul): (a) children and adolescents: DPPA s.8 against the HIV Act s.18 and the HIV testing guidance (12 and over); who may see an adolescent's results and from what age; (b) the basis for showing results in an app and for SMS (consent under s.7 and s.9, or another basis); (c) whether holds as designed (PR-7, PR-15) meet s.24. **Record the request date. This blocks Steps 6–8 going live, not their build.**
- **Q8** **Publication status** of the privacy notice, the terms and the hospital's PDPO registration. Patient access stays closed until all three are published.
- **Q9** **DPPA Regulations 2021:** the access-request form, any fee, any extension of the 30 days; the records office's process today for copies of records.
- **Q10** **National guidance on disclosure:** the National HTS Policy and Implementation Guidelines 2022 (results in person, mature minors), the TB and leprosy manual and maternal guidelines on giving TB and pregnancy results. Any newer consolidated HIV guideline than November 2022.
- **Q11** **SMS rules for this hospital:** government or private (UCC S.I. 83 of 2019 reg. 2(2)); the sender ID to register (neutral, no clinic name); cost and set-up time.
- **Q12** **Delta data:** for each candidate concept (MCV, haemoglobin, creatinine, potassium, sodium, calcium), the number of same-patient pairs in 90 days and the interval distribution; whether transfusions, dialysis and surgery are recorded in MedSync; the analytical CV per analyser and level from Phase 3 QC.
- **Q13** **Known sample errors:** Phase 3 nonconformities coded as mislabel or wrong blood in tube in the last 12 months (for DL-8 trials).
- **Q14** **Autoverification readiness:** which analysers are live on the Phase 4 bridge, their shadow sign-off dates, which analyser flags and serum indices arrive in messages, and the share of results with current QC.
- **Q15** **IPC at the test hospital:** who is the IPC lead, the IPC link nurse(s) and the surveillance focal person; any duty roster; whether admissions record ward and bed; which tests on the menu match the alert triggers (Xpert MTB/RIF, cholera rapid test, measles serology, _C. difficile_ toxin, influenza or SARS-CoV-2).
- **Q16** **IDSR:** obtain the IDSR technical guidelines, 3rd edition (2021), and **transcribe Table 2 (immediately reportable) and the weekly list** with the surveillance focal person; confirm the fields of Annex 2G (case-based laboratory form). **The notify-now entries cannot be signed without it.**
- **Q17** **IPC guidance:** read the Uganda National IPC Guidelines, 2nd edition (January 2025), Chapters 5 (transmission-based precautions) and 6 (HAI surveillance), and reconcile every suggested precaution in the seed list with them; obtain the national HAI surveillance plan approved at the TWG from the MoH IPC unit, if it may be shared.
- **Q18** Playwright, axe, a fake-clock utility, and a way to test on a mid-range Android phone over a throttled connection. If Playwright or axe is missing, STOP and flag.

**Baseline:**

- Screenshots of the patient web app, the doctor's results, result entry, interfaced result entry.
- **Failing tests** that reproduce:
  - a full blood count whose MCV moved far from yesterday's is released with no prompt;
  - a released "MTB detected, rifampicin resistance detected" reaches no one in infection prevention;
  - (if a patient surface shows any result today) a result visible to a patient before review.

  Do not fix them yet.

**STOP 0.** Report Q1–Q18, the prompt-versus-repo differences, the legal-opinion request, the IDSR transcription, the failing tests and the baseline.

### Step 1 — GATE A proposal (documents only)

Write `docs/lab/phase-5/gate-a-proposal.md`. It contains:

- annotated wireframes of every screen in Section 5, starting from the canvas, at 390 px for patient screens;
- `visibleToPatient` (PR-1) as a decision table with a worked example for every reason, including critical, held, corrected, referred, bedside, guardian, under 12, 12 to 17, consent off;
- the release table (5.5) proposed per group, the never-shown floor, and the plain-words process (drafting, readability, translation, signing);
- the SMS template, its hours, opt-out and sender ID;
- the delta model (type, limit, window, basis), the RCV calculator with a worked example using this lab's CVA and an EFLM CVI, the outcome list, panel and pattern rules, and DL-8 trial results on this lab's data for each proposed rule. **Propose no limit without its basis and trial**;
- the autoverification checks (AV-2), states, suspension triggers, the shadow plan and the review sample, mapped to ISO 15189:2022 7.4.1.5, CLSI AUTO15 and the CAP items in H15;
- the IPC alert list seed (H19, H20, Q15–Q17) with each entry's source, the routes and recipients, the minimum dataset, escalation, the patient flag;
- **the results section of the Gate CG governance artifact** (what a mobile app may show, cache and notify), for Fadhul to sign later; no mobile build;
- the schema diff and RLS probe plan;
- **the sign-off packs** (Appendix C), pre-filled only from the hospital's practice and the sources;
- every string in Appendix A, with its status;
- **the hazard log** (Appendix B), each with cause, effect, control, the test that proves the control, and the residual risk;
- the test plan, the rollout plan per flag, the user-guide outline and the ADR drafts;
- the decision table (Section 14) with a signature block.

**STOP 1.** Nothing proceeds without Fadhul's signature on the D-decisions.

### Step 2 — Data layer

Approved migrations, append-only triggers, the never-shown floor as a database constraint and a test, flags, permissions, the service identity, RLS probes.

**STOP 2.** Report the migration diff, the RLS probe table (every object × every actor, including patient, guardian and `svc.autoverify`), and the append-only proofs.

### Step 3 — Engines (pure, no UI)

Build Sections 6.1–6.6 with tests:

- every rule ID covered;
- `visibleToPatient` over the full decision table, and a **property test** that no PR-3 result is ever visible, whatever the inputs;
- PR-9 range-line bounds at the edges;
- PS-2 and PS-3: no SMS for PR-3 groups, batching, hours across midnight;
- DL-3 for every type, rise and fall limits, RCV with both Z conventions and the log-normal form, unit conversion through the registry, different method groups;
- DL-8 on a fixture of pairs with known mislabels;
- AV-2 with a passing and a failing case for every check, AV-3 and AV-5 transitions;
- IC-2 on every trigger kind, IC-3 de-duplication, IC-9 readmission;
- two-hospital fixtures for every list and count.

**STOP 3.** Report test counts and the rule coverage table.

### Step 4 — Delta checks (behind `labDeltaChecks`)

Build 5.6 and 5.7, panel and pattern rules, outcomes, the trial, monthly review.

Scenarios:

- **S1** An MCV far from yesterday's fires DC-MCV-1: the panel shows both values, the change and the interval, prompts to check the previous specimen, and Release stays disabled until an outcome is recorded.
- **S2** `recollect` rejects the specimen with "Possible wrong sample (delta check)" and tells the ward; the new sample is linked.
- **S3** `mislabel_confirmed` opens a nonconformity.
- **S4** A transfusion recorded between the two results is listed in the panel; the rule still fires.
- **S5** An RCV rule computes from this lab's CVA and the signed CVI; changing the QC data changes the RCV only in a new rule version.
- **S6** A previous result by a different method group is shown as "not compared".
- **S7** A panel rule (k of N) fires once for the specimen, not once per component.
- **S8** A pattern rule for suspected EDTA contamination informs with its signed meaning.
- **S9** A rule with no signed limit never runs.
- **S10** The trial on 90 days of released pairs writes nothing and reports flags and known mislabels; the monthly review shows each rule's outcome shares.

**STOP 4.** Report scenario results and screenshots against artboards 6 and 7.

### Step 5 — The infection prevention feed (behind `ipcLabFeed`)

Build 5.10–5.12 without microbiology: the alert list, alerts, actions, escalation, the patient flag, readmission alerts, IDSR counts, the weekly digest.

Scenarios:

- **S11** A released "MTB detected, rifampicin resistance detected" raises an alert within the budget to the IPC link nurse and the ward in-charge, with the IC-5 minimum dataset and no values; the surveillance focal person gets the weekly-item routing.
- **S12** **Replay test:** every listed trigger in a fixture month of released results raises exactly one alert per patient per condition per admission.
- **S13** An IPC user without `tb` class access sees the alert and cannot open the TB result; the view is audited.
- **S14** No action within the window escalates to the IPC lead.
- **S15** "Precautions started" sets the patient flag; the flag shows on the ward list and at the next registration; only IPC clears it, with a reason.
- **S16** A flagged patient admitted three weeks later raises a readmission alert.
- **S17** A cholera rapid test is labelled "Screening result: confirm", and the alert shows whether stool was referred.
- **S18** A suspected VHF outbreak referral (Phase 4 RF-7) raises an alert at referral, before any result.
- **S19** An amendment that removes the triggering answer closes the alert with "Result corrected" and tells the recipients.
- **S20** IDSR counts per epi-week match a hand count of the fixture week; every count opens its results for allowed users; hospital admin sees only the digest.

**STOP 5.** Report scenario results, the replay test, and screenshots against artboards 10–12.

### Step 6 — Release rules and the clinician's side (behind `patientResults`; no patient UI yet)

Build 5.4 and 5.5: the release table, plain words, the minors rule, the patient-sees column, told events, holds, notes, aged results.

Scenarios:

- **S21** A routine result shows "When you mark it reviewed"; reviewing makes it eligible.
- **S22** A critical result is eligible only after "I have spoken to them" with how; a repeat critical needs its own event.
- **S23** An HIV viral load, a pregnancy test and a tissue result show "In person only" and can never be made eligible, by any setting.
- **S24** A hold needs a reason and an until-date within the signed maximum; expiry returns it to the clinician, not to the patient; holds appear on the CSO's monthly list.
- **S25** A result unreviewed past the signed window lists for the clinician and the head of department.
- **S26** Release rules and plain words cannot go live unsigned; signing needs the CSO's fresh second factor and refuses the author.
- **S27** A plain-words text containing a banned phrase fails the lint.

**STOP 6.** Report scenario results and screenshots against artboards 4 and 5.

### Step 7 — Patients see their results (behind `patientResults`; live only after Q7 and Q8 are cleared)

Build 5.1 and 5.2 in the patient web app: Results, the result view, earlier results, consent, guardian view, views audit, copy requests.

Scenarios:

- **S28** A reviewed creatinine appears within the budget with its range line, status word, plain words, action line and the doctor's note.
- **S29** An unreviewed result shows "Not ready to show yet" with the right reason; a referred test shows its expected date.
- **S30** **No PR-3 test appears anywhere** on patient surfaces, including as a name on "Not ready to show yet" (asserted across the whole fixture).
- **S31** A corrected result shows "This result is being checked" until the clinician acknowledges the correction, then the new value with "Corrected on {date}".
- **S32** Turning consent off hides results at once.
- **S33** A guardian of a child under 12 sees the child's routine results; a guardian of a 15-year-old sees only CSO-signed groups; before the minors rule is signed, neither sees anything.
- **S34** The doctor sees "Seen by the patient {time}".
- **S35** Sign-out clears the offline copy; nothing with PHI is in `localStorage` or IndexedDB; the tab title carries no PHI.
- **S36** "Ask for a copy" creates a records request; a held result is flagged to the records office, not withheld from the request.
- **S37** The page meets the 3G budget on a mid-range Android phone; it works at 390 px, in dark mode, and with the Emergency button on every screen.
- **S38** A patient can open only results from their own verified record (RLS probe with two patients and two hospitals).

**STOP 7.** Report scenario results, the phone trial, and screenshots against artboards 1 and 2.

### Step 8 — Results-ready SMS (behind `patientResultsSms`)

Build 5.3: opt-in, the template, batching, hours, STOP, delivery status.

Scenarios:

- **S39** A visible result sends one SMS within the budget, with the signed template only; three visible results in the window send one.
- **S40** A result made visible at 21:00 sends at 06:00.
- **S41** A PR-3 result never triggers or delays an SMS (timing test: an HIV result released between two routine ones changes nothing).
- **S42** STOP from the patient's phone turns SMS off within 24 hours and records it.
- **S43** A provider failure retries and never blocks the release; no message body is stored.

**STOP 8.** Report scenario results and the delivered message on a test handset.

### Step 9 — Selective autoverification (conditional; behind `labAutoverify`)

**Only if Q14 shows an analyser live on the bridge with a signed shadow run, delta checks have been live for the period D-LAB5-14 sets, and QC is current.** Otherwise write `docs/lab/phase-5/autoverify-gap.md` and STOP.

Build 5.8 and 5.9 for one test on one analyser.

Scenarios:

- **S44** Each AV-2 check, failed alone, sends the result to a person with that check named.
- **S45** No QC today: every result goes to a person.
- **S46** An analyser flag (platelet clumps) sends the result to a person.
- **S47** A value one unit outside the range, or a critical, goes to a person.
- **S48** A delta, panel or pattern flag goes to a person.
- **S49** The patient's first result for the test goes to a person.
- **S50** Shadow: the rule logs, a technologist releases; promotion is refused while any shadow result the rule would release was changed or held.
- **S51** **Suspend now** by a technologist takes effect for the next result; resume needs `lab.manage` and passed QC.
- **S52** A QC rejection, the analyser marked down, a mapping change and a range change each suspend automatically; a rule-set change returns it to shadow.
- **S53** A daily review that changes a released-by-rule result opens an amendment and suspends the rule set.
- **S54** A result released by rule is identifiable with the rule set version and every check's value; the patient still sees it only after a clinician's review.

**STOP 9.** Report scenario results, the shadow comparison and the signatures.

### Step 10 — Microbiology feed, AMR export and HAI support (conditional; behind `ipcMicroFeed`; GATE M)

**Only if the microbiology module is merged and emits isolates as MB-1 describes.** Otherwise write `docs/lab/phase-5/micro-gap.md` and STOP.

Scenarios:

- **S55** A carbapenemase-producing _K. pneumoniae_ from a blood culture raises an alert on every ward, marked presumptive, with a referral of the isolate to the national reference laboratory.
- **S56** An ESBL _E. coli_ raises an alert only on a high-risk unit.
- **S57** The WHONET export carries the verified columns, the admission date and per-drug results; raw rows are not de-duplicated; the aggregate view applies the GLASS rule.
- **S58** HAI views show "No data" where denominators are missing, never 0.

**STOP 10.** Report scenario results, the export checked in WHONET, and the data protection lead's field-list signature.

### Step 11 — Hardening and documentation

- axe on every new route, patient routes at 390 px and in dark mode; keyboard paths; reduced motion; screen-reader pass of the range line and the delta panel.
- Load: a morning's releases for the test hospital replayed; the budgets in Section 11.
- Security: the RLS suite, the PR-3 property test, a privacy review of every patient surface and the SMS, the service identity's limits.
- The hazard log closed with tests; user guides (patients, clinicians, lab, IPC); ADRs; the final report.

**STOP 11.** Report Section 13 and the Definition of Done.

---

## 10. Accessibility, motion, colour

- WCAG 2.2 AA. Targets at least 44 × 44 px on touch; patient screens designed at 390 px first.
- **Patient language:** short sentences, everyday words, en-GB, with the signed translations only. Values never stand alone: always a status word and an action line.
- **The range line** has a text alternative in words ("Your result, 168, is above the usual range of 53 to 106 micromoles per litre"); the shaded band and the dot differ in shape and lightness, not hue alone.
- **Switches** in settings are real buttons with `role="switch"` and their state announced.
- **The delta block and the IPC "New" row** use `role="alert"` once, on first render; live counts update politely and never steal focus.
- **Status chips** are words with icons; never colour alone.
- **Colour:** teal for actions and focus; the lab hue for active navigation; amber and dark amber for delta alerts, IPC alerts, escalated, held, suspended and not-yet-visible; amber text with an arrow for a patient's outside-range result; **red only for the Emergency button on patient screens** and Phase 1's unchanged critical styles in staff views; **no green**.
- **Dark mode** is supported on the patient side (MedSync standing decision); every patient screen is checked in both themes.
- **Print** (weekly IPC digest): black on white, body at least 12 px.

## 11. Performance budgets

| Measure                                           | Budget                                           |
| ------------------------------------------------- | ------------------------------------------------ |
| `visibleToPatient` for one patient's results list | p95 < 50 ms server-side                          |
| Patient Results page, 3G, mid-range Android       | p95 < 3 s to first content; < 150 KB transferred |
| Review to visible to the patient                  | p95 < 60 s                                       |
| SMS enqueue after first visible result            | p95 < 5 min, within allowed hours                |
| Delta evaluation at save                          | p95 < 50 ms per component                        |
| Autoverification decision                         | p95 < 200 ms per specimen                        |
| IPC alert after release                           | p95 < 60 s                                       |
| `trialRule` over 90 days                          | p95 < 10 s, read-only                            |
| Added JS on patient routes                        | report; flag anything above 30 KB gzipped        |
| Added JS on `/lab` and the IPC workspace          | report; flag anything above 40 KB gzipped        |

## 12. Security, privacy, audit

- AAL2 on every staff route. The patient app's assurance level as found at Q3; viewing results needs a fresh sign-in after the session idle limit (operational).
- **Audited** with actor, time and hospital: every patient and guardian view of a result; every consent change; every told event, hold, note and release-rule signature; every SMS send and opt-out (no body); every delta flag, outcome and rule signature; every autoverification decision, state change, suspension and review; every IPC alert, view, action, flag set and clear; every IDSR count opened; every WHONET export.
- **Patients:** RLS confines a patient to their verified record; guardians to linked children within PR-11; the never-shown floor is enforced in the database as well as the engine; nothing with PHI on the device beyond the session.
- **SMS:** content-free by template; neutral sender ID; consent and STOP recorded; provider receives the number and the template only.
- **IPC:** minimum dataset only; the `tb` exception audited (Law 9).
- **Breach:** a suspected disclosure (for example a PR-3 result visible to a patient) is a breach path: the feature flag is turned off for the hospital, the data protection lead is notified, and the PDPO is notified as DPPA s.23 requires. Rehearsed at Step 11.
- The governance gap stays documented: Fadhul holds the superadmin, CSO and audit-reviewer roles at once. D-LAB1-12 applies to every signature in this slice.

---

## 13. Numbers to report at the final STOP

| Metric                                                                         | Baseline | Target            | Result |
| ------------------------------------------------------------------------------ | -------- | ----------------- | ------ |
| Results visible to a patient before clinician review                           | Step 0   | 0                 |        |
| Criticals visible to a patient before a told event                             | —        | 0                 |        |
| PR-3 results, names or pending states on any patient surface or SMS            | —        | 0                 |        |
| SMS containing a test name, value or clinic name                               | —        | 0                 |        |
| SMS sent outside 06:00–19:00                                                   | —        | 0                 |        |
| Patients under 18 or guardians seeing results before the minors rule is signed | —        | 0                 |        |
| Holds without a reason or an until-date                                        | —        | 0                 |        |
| Records requests delayed by a hold                                             | —        | 0                 |        |
| Delta flags released without an outcome                                        | Step 0   | 0                 |        |
| Delta rules running without a signed limit and basis                           | —        | 0                 |        |
| Results released by rule that failed any check                                 | —        | 0                 |        |
| Results released by rule changed after release                                 | —        | 0, else suspended |        |
| Results released by rule without current QC                                    | —        | 0                 |        |
| Listed IPC triggers without an alert in the replay                             | Step 0   | 0                 |        |
| IPC alerts showing result values or chart data                                 | —        | 0                 |        |
| IPC alerts with no action and no escalation                                    | —        | 0                 |        |
| Clinical numbers in code, seeds or copy                                        | —        | 0                 |        |
| Hazards without a control and a test                                           | —        | 0                 |        |
| Rule IDs without a test                                                        | —        | 0                 |        |
| RLS probes passed (including patient, guardian, `svc.autoverify`)              | —        | 100 %             |        |
| axe serious or critical (both themes on patient routes)                        | S0       | 0                 |        |
| Red outside the Emergency button and Phase 1 critical styles; any green        | —        | 0                 |        |

## 14. GATE A decisions (Fadhul owns; recommendations given)

| #         | Decision                                            | Recommendation                                                                                                                                                                                                                                         |
| --------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-LAB5-01 | Scope of this slice                                 | Patient results (web), SMS, delta checks, the IPC feed from current tests; autoverification and the microbiology feed as conditional steps. No mobile (Gate CG)                                                                                        |
| D-LAB5-02 | When a patient sees a result (CSO)                  | After clinician review; a critical only after a told event; no time-based auto-release. Uganda has no law requiring immediate release (US and UK practice noted, not adopted)                                                                          |
| D-LAB5-03 | Never-shown floor (CSO)                             | The four restricted classes, pregnancy tests, histology and cytology, as a floor in code and database. Consider adding hepatitis B and C serology and syphilis and other STI tests at signing                                                          |
| D-LAB5-04 | HIV results                                         | Never in the app or SMS; given by a practitioner with post-test counselling (HIV Act s.3, s.18). Revisit only with a national policy that allows electronic return to clients                                                                          |
| D-LAB5-05 | Holds                                               | Per result, with a reason and an until-date within a signed maximum; therapeutic-privilege basis (Charter Art. 10; MHA s.57(2)); never blocks a s.24 access request; CSO monthly review                                                                |
| D-LAB5-06 | Aged results                                        | Listed for the clinician and the head of department after 7 days unreviewed (signed); never auto-released                                                                                                                                              |
| D-LAB5-07 | Consent                                             | A separate, recorded, withdrawable "show my results in the app" choice, and a separate SMS opt-in; wording signed by the data protection lead; basis confirmed by the legal opinion (Q7)                                                               |
| D-LAB5-08 | Children and adolescents (CSO, after legal opinion) | Under 12: guardian sees routine groups. 12–17: guardian sees only CSO-signed groups; adolescent's own access per the opinion. PR-3 groups never to a guardian. Nothing for under-18s until signed                                                      |
| D-LAB5-09 | Plain words                                         | CSO-signed per test and language, with action lines; harm anchors only where a threshold is signed; translations forward and back; tests without words show number and range with "Ask your doctor"                                                    |
| D-LAB5-10 | Status words                                        | From the result's own flag against its snapshotted range; never "critical"; decision-scheme words only where signed for patients                                                                                                                       |
| D-LAB5-11 | Results-ready SMS (CSO)                             | LabRDS-style content-free wording; neutral registered sender ID; 06:00–19:00 for every hospital; STOP honoured; one per batching window                                                                                                                |
| D-LAB5-12 | Delta model                                         | EP33 type, limit and window per rule, with its basis; RCV calculator from this lab's CVA and EFLM CVI; no numeric defaults; outcome recorded for every alert; monthly review                                                                           |
| D-LAB5-13 | Delta as a soft stop                                | Release needs a recorded outcome on every fired rule; the technologist decides                                                                                                                                                                         |
| D-LAB5-14 | Autoverification readiness                          | Only for interfaced results, after delta checks have been live 3 months on that test, on an analyser past its Phase 4 shadow; then a 4-week shadow or 500 results, whichever is later, with zero changed                                               |
| D-LAB5-15 | Autoverification scope                              | Normal results only (inside the reference range and measuring range), no critical, no flags, current QC, all deltas passed, not the first result, no PR-3, no blood bank or microbiology, no typed, referred, bedside or qualitative results           |
| D-LAB5-16 | Suspension                                          | Any user who can release may suspend at once; automatic on QC rejection, analyser down, mapping, range, delta-rule or rule-set change; resume by `lab.manage` after passed QC                                                                          |
| D-LAB5-17 | Review and revalidation                             | A daily random review sample (signed size); revalidation at least yearly and after any trigger; any change after review suspends                                                                                                                       |
| D-LAB5-18 | IPC recipient                                       | The IPC link nurse (Uganda IPC Guidelines 2025) and the ward in-charge; the surveillance focal person for IDSR routes                                                                                                                                  |
| D-LAB5-19 | Alert list                                          | Signed by the facility IPC lead and the laboratory lead; seeded from current tests (TB, RR-TB, cholera, measles, outbreak referral) and, after GATE M, WHO BPPL 2024 critical and high groups with the NHS Scotland split (all wards, high-risk units) |
| D-LAB5-20 | Notify-now list                                     | Transcribed from IDSR 3rd ed. Table 2 at Step 0 and checked by the surveillance focal person; MedSync counts and routes, the focal person reports                                                                                                      |
| D-LAB5-21 | IPC data access                                     | Minimum dataset; `tb` class exception through the alert only, audited                                                                                                                                                                                  |
| D-LAB5-22 | Patient flag                                        | Set by IPC's recorded action; shown at every later encounter; cleared only by IPC with a reason                                                                                                                                                        |
| D-LAB5-23 | Precautions                                         | Suggested in text from a signed list (CDC Appendix A reconciled with the Uganda IPC Guidelines 2025); never ordered automatically in this slice                                                                                                        |
| D-LAB5-24 | WHONET export (Step 10)                             | Isolate-level, raw, verified columns, admission date included, names excluded unless the national plan requires them; field list signed by the data protection lead                                                                                    |
| D-LAB5-25 | Mobile                                              | No Expo work; Step 1 drafts the results section of the Gate CG governance artifact                                                                                                                                                                     |
| D-LAB5-26 | Rollout order                                       | `labDeltaChecks` → `ipcLabFeed` → `patientResults` (after Q7 and Q8 clear, with a pilot group of consenting adult patients) → `patientResultsSms` → `labAutoverify` (one test) → `ipcMicroFeed` (after GATE M)                                         |
| E-LAB5-01 | Engine                                              | `visibleToPatient` is the single gate every patient surface, SMS and future mobile read uses                                                                                                                                                           |
| E-LAB5-02 | Rules as data                                       | Delta, autoverification, alert list and release rules are versioned, signed data; engines are pure over them                                                                                                                                           |
| E-LAB5-03 | IPC module                                          | `lib/ipc/**` is a module of its own, which the inpatient, microbiology and outbreak modules will reuse                                                                                                                                                 |

## 15. Out of scope (leave clean seams)

**Separate prompts:**

- **microbiology** (the source of organism, phenotype and susceptibility events for Step 10);
- **blood bank** (its own historical-group check is the transfusion analogue of a delta check);
- **histopathology and cytology** (never shown to patients in this slice);
- the **inpatient and ward module** (precaution orders in the nursing record; HAI denominators);
- the **notifications engine**, if it does not exist (this slice uses what is found and leaves an interface).

**Not here:**

- the mobile (Expo) app, push notifications and any mobile PHI (Gate CG);
- time-based auto-release to patients;
- patients downloading their full record (the records office fulfils requests);
- results in SMS, USSD or WhatsApp;
- patient messaging with the care team;
- trend charts for patients (a list in this slice);
- autoverification of anything outside D-LAB5-15;
- patient-based real-time QC, delta checks as QC;
- reporting cases to DHIS2 or eIDSR, and contact tracing beyond a count and a note;
- the national HAI surveillance system itself.

## 16. ADRs (next free numbers)

- One gate for patient visibility (`visibleToPatient`), and the never-shown floor.
- Review before release to patients; holds and therapeutic privilege; access requests.
- Consent, children and guardians.
- Plain words and action lines as signed data.
- The content-free results-ready SMS.
- Delta checks as decision support: the EP33 model, RCV, outcomes.
- Autoverification: checks, shadow, suspension, review.
- The IPC feed: alert list, minimum dataset, the `tb` exception, the patient flag.
- The microbiology seam and the WHONET export.

## 17. Definition of Done

- [ ] H1–H24 confirmed or corrected and recorded. The legal opinion is requested and, before patient access goes live, received. The IDSR lists are transcribed and checked.
- [ ] A patient sees a reviewed result, with its range line, plain words, action line and note, in the web app. No result is visible before review, and no critical before a told event.
- [ ] No PR-3 result, name or pending state appears on any patient surface or SMS, proven by the property test and the fixture sweep.
- [ ] Holds, aged results, consent, guardians and access requests behave as specified.
- [ ] The SMS is content-free, within hours, opt-in, and stops on STOP.
- [ ] Delta, panel and pattern rules run only when signed with a basis; every alert has an outcome; rules are reviewed monthly.
- [ ] IPC alerts reach the link nurse and ward within the budget with the minimum dataset; the replay test misses nothing; flags follow the patient; IDSR counts match.
- [ ] Step 9 is built for one test with zero changed after release by rule, or its gap report exists.
- [ ] Step 10 is built past GATE M, or its gap report exists.
- [ ] No clinical number exists in code, seeds or copy.
- [ ] Every rule ID has a test. RLS probes are green. Append-only tables hold.
- [ ] axe clean in both themes on patient routes. Red only where allowed, no green. Reduced motion honoured.
- [ ] S1–S58 pass (conditional steps: their scenarios, or the gap report). With all flags off, behaviour matches the Phase 4 baseline.
- [ ] The hazard log is complete and signed. User guides, ADRs and the final report exist. The diff on `feat/lab-beyond-lis` is reviewable.

---

## Appendix A — Copy to be signed (all `draft` until signed; the CSO signs patient and clinician text; the IPC lead signs IPC text)

| Key                             | Text                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not ready, review               | Your doctor looks at this first. It will appear here after that.                                                                                                  |
| Not ready, lab                  | Waiting for the lab.                                                                                                                                              |
| Not ready, referred             | Sent to another lab. Expected back about {date}.                                                                                                                  |
| Not ready, held                 | Not ready to show yet.                                                                                                                                            |
| In person                       | Some tests are always given to you in person by a health worker, not in the app.                                                                                  |
| Status, within                  | Within the usual range                                                                                                                                            |
| Status, higher                  | Higher than the usual range                                                                                                                                       |
| Status, lower                   | Lower than the usual range                                                                                                                                        |
| Status, no range                | No range for this test                                                                                                                                            |
| Range note                      | The shaded part is the usual range for this lab. Ranges differ between labs.                                                                                      |
| No plain words                  | Ask your doctor what this means.                                                                                                                                  |
| Next, fixed                     | If you feel very unwell before then, press Emergency or go to the nearest health facility.                                                                        |
| Seen by doctor                  | Your doctor has seen this and will talk with you on {date}.                                                                                                       |
| Being checked                   | This result is being checked.                                                                                                                                     |
| Corrected                       | Corrected on {date}.                                                                                                                                              |
| Provenance                      | Checked and released by the {hospital} laboratory on {date}. Seen by your doctor on {date}.                                                                       |
| Results-ready SMS               | {Hospital}: you have new results in MedSync. Open the app, or ask at your next visit. Reply STOP to stop these messages.                                          |
| Consent                         | Show my results in the app. You can turn this off at any time.                                                                                                    |
| Critical to patient (clinician) | A critical result appears in the patient's app only after you record that you have spoken with them about it.                                                     |
| Hold (clinician)                | Holding is recorded with your reason and reviewed. The patient sees "Not ready to show yet".                                                                      |
| Delta check                     | **{Component} changed more than this lab expects in {interval}.** {Signed meaning}. Check the label and the request, and the previous specimen, before releasing. |
| Delta note                      | Delta checks inform. Release needs a decision on each one.                                                                                                        |
| Released by rule (lab)          | Released by rule {rule set} v{n}: {n} of {n} checks passed.                                                                                                       |
| Waited (lab)                    | Waited for a person: {check}.                                                                                                                                     |
| Suspended                       | Autoverification for {test} on {analyser} is suspended: {reason}. Results wait for a person.                                                                      |
| IPC minimum                     | Alerts come from released results that match the signed alert list. IPC sees the condition, the place and the precaution, not the whole result or chart.          |
| IPC alert SMS (to staff)        | New IPC lab alert at {hospital}. Open MedSync.                                                                                                                    |
| Screening result                | Screening result: confirm.                                                                                                                                        |
| Patient flag                    | A flag now sits on this patient's record. If they are readmitted or moved, the ward and IPC see it at once. Only IPC clears it.                                   |
| Readmission alert               | Flagged patient {admitted or moved} to {place}: {condition}.                                                                                                      |
| IDSR support                    | These support the surveillance focal person. Cases are reported by the focal person, not sent from here.                                                          |
| Needs microbiology              | Waiting for the microbiology module.                                                                                                                              |
| No data                         | No data                                                                                                                                                           |

## Appendix B — Hazard log seed (complete each at Step 1; close each with a test)

For each hazard: cause, effect, control built, the test that proves the control, and residual risk.

1. A patient sees a result before the clinician, and acts on it alone.
2. A patient sees a critical result before anyone has spoken to them.
3. An HIV, TB, mental health, SRH, pregnancy or tissue result, its name or its pending state reaches the patient app or an SMS.
4. The timing of an SMS reveals that a restricted test was done.
5. An SMS is read by someone else and reveals a condition (test name, value, clinic or sender name).
6. A patient misreads a value (no range, unclear words, wrong range from another lab).
7. Plain words reassure falsely or advise treatment.
8. A guardian sees an adolescent's sensitive result; or a child's results go to the wrong guardian.
9. A patient sees another patient's results (linking error, RLS gap).
10. Results stay on a shared phone after sign-out.
11. A hold blocks a patient's lawful access request, or holds become routine.
12. Unreviewed results sit for weeks and the patient never learns of them.
13. A corrected result shows the old value without warning.
14. A delta alert is clicked through and a wrong-patient result is released.
15. Delta alerts fire so often that staff stop reading them.
16. A delta limit is typed from memory with no basis.
17. A wrong-patient sample is detected but the earlier wrong sample is not.
18. Autoverification releases a wrong result (failed QC, missing QC, analyser flag, haemolysis, wrong patient).
19. Autoverification hides a slowly drifting method because no person looks.
20. A rule set change is put live without revalidation.
21. Suspension is not possible quickly when the analyser misbehaves.
22. An IPC-relevant result reaches no one, or reaches IPC hours late.
23. IPC staff see more of the patient's record than they need, or a TB result beyond the alert.
24. A flagged patient is readmitted and placed on an open ward.
25. A screening result is treated as confirmed, or a confirmed one as screening.
26. The notify-now list is wrong and an immediately reportable condition is reported late.
27. Precautions are applied or stopped automatically against clinical judgement.
28. A WHONET export leaks identities, or deduplication hides isolates.

## Appendix C — Sign-off packs (templates only; pre-fill only from the hospital's practice and the sources; propose no values)

- **Release table.** Group, in app (when), SMS, plain words count, never-shown floor and additions, CSO.
- **Plain words.** Test, language, what this test is, short line, action lines per band, harm anchor and its threshold source (if any), readability method and score, translator and back-translator, CSO.
- **Minors rule.** Age bands, guardian-visible groups, adolescent access, the legal opinion reference, CSO.
- **Consent and privacy notice.** Wording, version, basis, data protection lead.
- **SMS.** Template per language, sender ID, hours, batching window, STOP handling, CSO.
- **Delta rule.** Component, type, limits (rise, fall), window, basis (RCV with CVA source and CVI source and Z; local percentile with the data period; clinical), meaning, trial result, laboratory lead; the set countersigned by the CSO.
- **Panel and pattern rules.** Definition in words, components, thresholds and their basis, meaning, laboratory lead.
- **Autoverification rule set.** Test, analyser, checks, limits, exclusions, serum-index limits, sample age, shadow period and count, review sample, revalidation interval, laboratory lead, CSO.
- **Alert list.** Trigger, scope, precaution and stop line with source (CDC Appendix A; Uganda IPC Guidelines 2025 chapter and page), IPC alert, IDSR route with the IDSR item and table reference, confirmation, IPC lead and laboratory lead; the surveillance focal person's check of the notify-now entries.
- **WHONET field list** (Step 10). Columns, coding, identity fields, data protection lead.

## Appendix D — Sources checked (17 Oct 2026; re-verify at build time)

Full notes, quotes and confidence marks are in `docs/lab/phase-5/LAB-PHASE-5-RESEARCH.md`.

**Patients and the law**

- Data Protection and Privacy Act 2019 (s.7, s.8, s.9, s.23, s.24): https://www.ulii.org/akn/ug/act/2019/9
- HIV and AIDS Prevention and Control Act 2014 (s.3, s.18, s.20, s.42): ULII revised edition
- Mental Health Act 2018 (s.57): ULII
- MoH Patients' Charter 2009 (Art. 10, Art. 16)
- Uganda Communications (Text and Multimedia Messaging) Regulations, S.I. 83 of 2019 (regs 2, 10, 12, 19)
- ASLM/NHLDS, LabRDS (Dec 2023): https://aslm.org/wp-content/uploads/2024/04/Timely-Access-Utilization-of-Laboratory-Test-Results-Using-LabRDS-in-Uganda.pdf
- 45 CFR 171.201 (preventing harm exception): https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-D/part-171
- Steitz BD et al., JAMA Netw Open 2023;6(3):e233572
- Zikmund-Fisher BJ et al., JAMIA 2017 (number lines); JMIR 2018;20:e98 (harm anchors); Fraccaro P et al., BMC Med Inform Decis Mak 2018

**Delta checks and autoverification**

- CLSI EP33 2nd ed. (2023): https://clsi.org/shop/standards/ep33/
- CLSI AUTO15 (2019): https://clsi.org/shop/standards/auto15/
- ISO 15189:2022 7.4.1.5 (via SADCAS guidance); SLIPTA checklist v3 (ASLM, 2023)
- EFLM Biological Variation Database: https://biologicalvariation.eu
- CAP Q-Probes on delta checks (Schifman et al.); Tan RZ et al., Ann Clin Biochem 2020; Wang Z et al. 2019; Krasowski MD et al. 2014; Zhu J et al. 2022; Dzik WH et al. 2003 (wrong blood in tube)

**Infection prevention**

- Uganda National IPC Guidelines, 2nd ed., January 2025 (MoH)
- WHO, Guidelines on core components of IPC programmes (2016): https://www.who.int/publications/i/item/9789241549929 ; Minimum requirements (2019)
- Uganda IDSR Technical Guidelines, 3rd ed., Sept 2021: https://www.afro.who.int/sites/default/files/2021-09/2_Uganda%203rd%20IDSR%20Tech%20Guideline_PrintVersion_10Sep2021.pdf
- Uganda NAP-AMR II 2024/25–2028/29: https://www.who.int/publications/m/item/uganda-second-antimicrobial-resistance-national-action-plan-2024-25-2028-29
- Nabadda S et al., JMIR Public Health Surveill 2021;7(10):e29954 (Uganda GLASS)
- WHO GLASS: https://www.who.int/initiatives/glass/glass-routine-data-surveillance ; WHONET: https://whonet.org/
- WHO Bacterial Priority Pathogens List 2024: https://www.who.int/news/item/17-05-2024-who-updates-list-of-drug-resistant-bacteria-most-threatening-to-human-health
- NHS Scotland alert organism list (NIPCM Appendix 13): https://nipcm.hps.scot.nhs.uk/web-resources-container/appendix-13-nhsscotland-alert-organismcondition-list
- CDC Isolation Precautions, Appendix A: https://www.cdc.gov/infection-control/hcp/isolation-precautions/appendix-a-type-duration.html
- Kac G et al., Arch Intern Med 2007;167(19):2086–90
