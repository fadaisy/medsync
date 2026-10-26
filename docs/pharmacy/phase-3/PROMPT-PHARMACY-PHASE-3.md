# PROMPT: Pharmacy Phase 3: clinical pharmacy and stewardship (interactions from a signed list, antibiotic stewardship by AWaRe group, reconciliation at discharge, suspected reactions, intervention review)

> **For Claude Code.** Work at the repo root on a new branch, `feat/pharmacy-clinical`, cut from the branch where `feat/pharmacy-dispensing` (pharmacy Phase 1) has merged its first and second merges (Steps 0 to 8).
>
> - If those have not merged, **STOP at Step 0**.
> - **Phase 1's third merge** (Step 9: the stock line, the ward chip, the patient's list and messages) may be deferred. If it is, reconciliation at discharge writes no patient list entry and says so (5.8).
> - **Pharmacy Phase 2** (`feat/pharmacy-stores`) is not required. Where it has merged, a suspected reaction links to its recall and quarantine (5.6); where it has not, the link is a seam.
>
> This slice extends what Phase 1 built and builds no second version of any of it:
>
> - Phase 1's prescription read model, queue, lanes, coded queries, problem-card answers and signed-content sets;
> - the prescribing dialog's checks;
> - the single allergy record;
> - the administration record.
>
> First copy this prompt into `docs/pharmacy/phase-3/`, with the candidate content files named in Section 1.
>
> **Mode: gated.** Eleven steps, numbered 0 to 10, each ending in a **STOP**. They are called steps because "Phase 3" names this slice of the pharmacy roadmap.
>
> - **Documents** follow Stage 1: draft, critique against the checklist, revise (at most two passes), present, STOP.
> - **Code** follows Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
> - Self-refinement never replaces a real check.
>
> **Assume nothing in this slice is built.** Section 3 lists what Phase 1 should have left and what earlier reads claimed. Verify every line. Build what Step 0 proves is missing; reuse what it proves exists.
>
> **The CSO is Fadhul.** This slice makes MedSync warn prescribers about medicines for the first time, prompts antibiotic reviews, changes the allergy list and the list a patient goes home with. Nothing reaches a production hospital without his signature, and that of the named pharmacist reviewer (roadmap D-PH-13), on:
>
> - every interaction entry and the alert-level mapping;
> - the AWaRe tags and the review intervals;
> - the reconciliation rules and wording;
> - the reaction report's field map;
> - every string staff or patients read;
> - the permission map, version 4;
> - the hazard log (Section 14, Appendices A to D).
>
> The hospital's antimicrobial stewardship (AMS) committee chair co-signs the stewardship settings. Where a hospital has no committee, the CSO records that in words on the signature.
>
> **How it merges.** Three merges on one roadmap phase:
>
> - Steps 0 to 6: signed content, interactions, intervention review.
> - Steps 7 and 8: stewardship, suspected reactions.
> - Steps 9 and 10: reconciliation at discharge, hardening, going live.
>
> Each part has its own flag and goes live on its own (5.10).

---

## 0. What we are building, in one paragraph

After Phase 1 every window prescription ends in a recorded outcome, and a pharmacist can ask the prescriber a coded question. What a pharmacist knows still sits in their head:

- MedSync says on every review screen that it **does not check drug interactions**;
- an antibiotic started in the emergency unit runs on the ward for a week with nobody prompted to look at it;
- a patient goes home with the tablets that were stopped on admission still in their bag;
- a rash after amoxicillin is told to the window and written nowhere;
- the pharmacist's queries are coded but nobody can see what they add up to.

**This slice turns that knowledge into signed content and recorded events:**

- **Interactions.** A short list of severe interaction pairs, signed entry by entry with a source, is checked when a doctor prescribes and when the pharmacy reviews. Every screen says how short the list is.
- **Antibiotic stewardship.** Every antibiotic carries its WHO AWaRe group as signed data. Use is shown by ward and group, and a review prompt reaches the team on a signed day.
- **Reconciliation at discharge.** The list starts from what the patient took before admission and what the ward gave, and the pharmacist confirms it before the patient goes home.
- **Suspected reactions.** One record puts a suspected allergy on the list for a doctor to confirm and prepares the National Drug Authority's report.
- **Intervention review.** Queries are shown by type, ward and answer, so the next prescribing check to sign is chosen from evidence.

**Done when** (the roadmap's three conditions, and two more):

- every pharmacist intervention is coded and answered (or withdrawn with a reason);
- antibiotic use by AWaRe group is visible by ward;
- no interaction alert fires from unsigned content;
- every discharge of an admitted patient on medicines has a reconciled list confirmed by a pharmacist, or a recorded reason why not;
- every suspected reaction recorded is on the allergy list as unconfirmed and has a printed report.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt, the roadmap and the canvases. Report every disagreement at STOP 0.
2. **The plan:** the _MedSync Pharmacy Roadmap_, "Phase 3: Clinical pharmacy and stewardship" (https://claude.ai/artifact/WfJbaaKpAKVdYvu1Tmpxkn). Where this prompt departs from it, 5.11 says where and why.
3. **The UI reference:** _Pharmacy UI Preview · Tide_ (https://claude.ai/artifact/72auX94F4FPogmCi32ELDf), boards **3.1 to 3.8**:
   - 3.1 Antimicrobial stewardship;
   - 3.2 Interaction check at review;
   - 3.3 Reconciliation at discharge;
   - 3.4 Suspected reaction;
   - 3.5 Interventions;
   - 3.6 The prescriber's side (the dialog's checks, the antibiotic review, the allergy to confirm);
   - 3.7 Clinical content to sign;
   - 3.8 The patient's list after a hospital stay.

   These are previews to react to, not specifications; 5.11 lists where this prompt overrules them. Every medicine, pair, tag, interval, count and date on any board is an example and not a signed value; interaction text appears as `[placeholders]`.

4. **Candidate content** (proposals for the pharmacist reviewer, never product content). Copy each into `docs/pharmacy/phase-3/content/`:
   - `PHARMACY-PHASE-3-RESEARCH.md`: what was read and found;
   - `interaction-candidates.json`: candidate severe pairs, each with its source;
   - `aware-candidates.json`: WHO AWaRe groups for antibiotics;
   - `pcne-codes.json`: the PCNE classification of drug-related problems;
   - `adr-report-fields.json`: the NDA report's fields and routes.

   The import (CC-3) brings these in as **drafts** only. Nothing in them acts until signed.

5. **Design:**
   - If `feat/tide-everywhere` (`PROMPT-TIDE-WEB-MIGRATION.md`) has merged its Step 2, build every screen with `components/tide/` and the app's Tide tokens.
   - If not, use the design system in force on the branch, laid out after the Tide boards, and record the gap at STOP 0.
   - `DESIGN-medsync.md` is authoritative either way.
6. **Prompts this builds on** (read the copies under `docs/`):
   - `PROMPT-PHARMACY-PHASE-1.md`, all of it, above all:
     - the lanes (6.5);
     - stages and outcomes (6.6, LO-4);
     - review and queries (6.7);
     - the problem card (5.4);
     - the stock line (5.10) as the pattern for a check in the dialog;
     - `pharmacyChecksState` (CK-1, CK-2);
     - who signs what (D-PH1-36);
     - the permission map (Appendix A).
   - `PROMPT-PHARMACY-PHASE-2.md`: recall (5.7, 6.9) and quarantine (5.6), for the reaction-to-batch link only.
   - `PROMPT-CLERKING-DESK-V2.md` and `clerking-history-catalogue.v1.json`:
     - the single allergy record (D-EMR-04);
     - allergy quick picks and reactions;
     - medicines before admission and their source;
     - "a rule whose reference is unsigned does not fire".
   - The Encounter Plan guide (https://claude.ai/artifact/X8toWLjPX8G5jgHn8jcWoD):
     - the prescribing dialog's checks and levels (Stop, Check, Note);
     - "cultures before antibiotics";
     - the drug-class map ("Draft map, not CSO-signed");
     - admission medicines with Continue, Hold or Stop.
   - The lab prompts: microbiology results (culture orders and released culture reports), and Lab Phase 5's infection prevention feed, so stewardship reads the same records.
   - `PROMPT-HOSPITAL-SERVICES-HUB.md`: committees and assignments, four-eyes, "informs, never blocks".
7. **Sources** (Appendix E lists them with dates; re-verify at build time). The main ones:
   - the WHO AWaRe classification and antibiotic book;
   - the 2024 UN political declaration on antimicrobial resistance;
   - Uganda's national AMS guidance and the National Action Plan on AMR;
   - the PCNE classification;
   - the WHO-UMC causality system and ICH E2A;
   - the National Drug Authority's suspected-reaction form and routes;
   - the WHO High 5s medication reconciliation SOP and _Medication Safety in Transitions of Care_;
   - the evidence on interaction-alert design.
8. **Code:**
   - `app/pharmacy/**`, `lib/pharmacy/**`, every Phase 1 migration and test;
   - `lib/prescribing/**` (the dialog, its checks and their store, the drug-class map);
   - the allergy record and its readers;
   - the admission-medicines record and its Continue, Hold and Stop decisions;
   - `/nurse/mar` and its tables;
   - `/patient/track/medications`;
   - the discharge flow, if one exists;
   - the lab's culture orders and reports;
   - the problem card;
   - the signed-reference module, the four-eyes module, the print module, the feature-flag module;
   - `docs/NUMBERS.md`, `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

1. **Engine-first.** Every surface reads or writes an engine with real tables, real RLS and passing tests, built in an earlier step than the surface.
2. **The pharmacy never changes a prescription** (Phase 1 Law 2). Nor does stewardship, reconciliation or a reaction record.
   - A change, a switch, a stop or a new medicine happens only through the existing prescribing actions, by a prescriber.
   - A test enumerates every action in this slice and proves none writes to a prescription row.
3. **Unsigned content never acts.** An interaction alert, an AWaRe tag, a review prompt, a lane reason, an alert level, a reconciliation rule, a report field map: each acts only from a signed, versioned entry.
   - Every alert names its entry, version and source on screen.
   - A draft is visible only in Clinical content (5.2).
   - A test proves that withdrawing a signature silences the entry at once.
4. **Say how little is checked.** The Phase 0 notice that MedSync "does not check drug interactions" becomes a signed sentence that says how many pairs are checked and what is not.
   - "No alert" never reads as "no interaction".
   - `pharmacyChecksState.interactionsChecked` stops being a boolean: it reports `none`, or `partial` with the signed pair count and the list version. It is never `complete`.
5. **Informs, never blocks care.**
   - An interaction alert uses the dialog's existing levels: a Stop is overridden with a reason, as every Stop already is.
   - A review prompt never stops a dose.
   - No antibiotic stops by itself.
   - Reconciliation never holds a discharge.
   - A suspected reaction never cancels a prescription.

   **The only new hard stops in this slice:**
   - no signing of an entry without a source;
   - no signing by the entry's own author where a second eligible signer exists;
   - no confirming or refuting an allergy by anyone but a prescriber;
   - no reconciled list confirmed with a line that has no decision;
   - no report marked submitted without its route and date.

6. **No remembered numbers.** None of these is set in code, seeds or copy:
   - review intervals;
   - look-back windows;
   - severity-to-level mappings;
   - AWaRe groups;
   - thresholds for "a check worth signing";
   - minimum counts.

   Each is signed, versioned data (Appendix D), and the sourced reference (for example the range the guidance gives) is shown beside the field, never pre-filled. While a parameter is unsigned, the rule that needs it does not run, and the screen says which parameter is missing and who sets it.

7. **One medicine list.**
   - Interaction entries, AWaRe tags and reconciliation lines key to the catalogue's medicine layer (Phase 1 CT-1), or to a class in the drug-class map **once that map is signed**.
   - Nothing is matched by name similarity. An unmatched candidate stays a draft with _"Not matched to a medicine on this hospital's list"_.
8. **As written; nothing computed.**
   - Interaction text is shown as signed.
   - Directions on a reconciled list are as the prescriber wrote them.
   - The system never proposes a dose, converts a dose, computes a duration or works out a stop date.
   - A stop date is a date a prescriber typed.
9. **A suspected reaction is a suspicion.**
   - It enters the allergy record as **unconfirmed**, shown to prescribers at once as "suspected".
   - Only a prescriber confirms it (as allergy or as intolerance) or refutes it, with a reason.
   - Nothing is ever deleted: a refuted entry stays in the record, struck through, with who refuted it and why.
   - The prescribing allergy check reads unconfirmed entries as well as confirmed ones.
10. **Nothing leaves MedSync by itself.**
    - The reaction report is printed, or copied as text, for a person to submit by the National Drug Authority's own route.
    - MedSync records that it was submitted, how, when and the reference, as typed.
    - The report carries the patient's initials, age and sex, never their name, number or address (Appendix B).
    - No stewardship figure, intervention report or reaction leaves the hospital without the hospital's agreement (hub D-SVC-14).
11. **Nothing closes by itself** (Phase 1 Law 4).
    - A review prompt stays listed until a prescriber answers it or the antibiotic ends.
    - A reconciliation stays open until confirmed or closed with a reason.
    - A reaction report stays "to submit" until recorded as submitted or closed with a reason.
    - A test advances the clock 30 days and finds every open item still open.
12. **No patient details off the platform** (Phase 1 Law 12).
    - Messages never name a medicine, a reaction, a condition or a clinic.
    - The patient's list after discharge shows medicine names only after sign-in.
    - Restricted classes stay restricted in every new list and report (an antiretroviral or a TB medicine in a reconciliation is named only to viewers who may see it).
13. **Red is a safety property.** This slice adds no red.
    - Interaction severities, overdue reviews, unreconciled lines and unconfirmed allergies are amber, each with an icon and a word.
    - AWaRe groups are **categorical tags**, not states: Access, Watch and Reserve use the three validated series colours already on board 3.1, each with its word. Reserve is never red.
    - Nothing is green.
14. **Behind flags, stack as found.**
    - Five per-hospital flags, off by default: `pharmacyInteractions`, `pharmacyStewardship`, `pharmacyReactions`, `pharmacyReconciliation`, `pharmacyInterventionReview`.
    - With all five off, behaviour matches the Phase 1 baseline, including the notice.
    - TypeScript strict, no `any`, Zod on every action, AAL2, the house action contract.
    - No new dependency without stopping to flag it (no interaction-database client is added in this slice).
    - Tokens only. Print with CSS only. Node 22 and pnpm. en-GB.
    - A pharmacy technician is never called a pharmacist. The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU). The medicines regulator is the **National Drug Authority**.

---

## 3. What Phase 1 should have left, and what earlier reads claimed (verify every line at Step 0)

| #   | Claim                                                                                                                                                                                                                                                                                                                                                                    | Where                            | Matters for                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------- |
| P1  | Phase 1's first two merges are on the branch: permissions version 2, lanes, line events, coded queries with prescriber answers on the problem card, Open lines, hand-over, supply records with batch                                                                                                                                                                     | `lib/pharmacy/**`                | **Everything**                        |
| P2  | The prescribing dialog runs its checks at three levels (Stop, Check, Note) and stores each outcome, answer and override reason per line, in a store that can hold one more check without a schema change                                                                                                                                                                 | `lib/prescribing/**`, Phase 1 Q5 | **Interaction alerts at prescribing** |
| P3  | `pharmacyChecksState` returns `interactionsChecked: false` and drives a notice on every review surface                                                                                                                                                                                                                                                                   | Phase 0, Phase 1 CK-2            | The notice (Law 4)                    |
| P4  | There is one allergy record (D-EMR-04): coded substance or class from quick picks, reaction, severity, source, a status action (still true · no known drug allergies · unable to assess). Uncoded names are flagged "not checked by prescribing". Whether it has a verification status (unconfirmed, confirmed, refuted) and an allergy-or-intolerance type was not read | clerking desk v2                 | **Reactions**                         |
| P5  | The prescribing allergy check reads the allergy record and matches by coded substance or class. How it matches a class (penicillins) to a medicine was not read                                                                                                                                                                                                          | `lib/prescribing/**`             | Reactions, interactions by class      |
| P6  | A drug-class map exists, labelled "Draft map, not CSO-signed"                                                                                                                                                                                                                                                                                                            | Encounter Plan guide             | Class-level interaction entries       |
| P7  | Medicines before admission are recorded at clerking with a source (patient, carer, medicine card, referral letter, dispensing record). The plan gives each Continue, Hold or Stop                                                                                                                                                                                        | clerking, Encounter Plan         | **Reconciliation**                    |
| P8  | A "cultures before antibiotics" check fires at prescribing; whether it reads a lab order or only asks the prescriber was not read                                                                                                                                                                                                                                        | Encounter Plan guide             | **Stewardship**                       |
| P9  | The lab records culture orders and released culture reports with organism and susceptibility as text (lab catalogue v2)                                                                                                                                                                                                                                                  | lab                              | Culture status in stewardship         |
| P10 | The administration record charts each dose against its prescription line, with a time                                                                                                                                                                                                                                                                                    | `/nurse/mar`                     | Days of therapy, reconciliation       |
| P11 | Whether a discharge event exists (an admission closed, a discharge summary) was not read. The roadmap lists "inpatient/ward + discharge" as a prompt not yet written                                                                                                                                                                                                     | inpatient                        | **The trigger for reconciliation**    |
| P12 | Whether a prescription carries an indication, a duration or a stop date was not confirmed (Phase 1 R7)                                                                                                                                                                                                                                                                   | prescriptions                    | Stewardship review                    |
| P13 | Phase 1's query codes are signed per hospital and include allergy, dose unclear or unusual, duplicate, renal function, not available and other                                                                                                                                                                                                                           | Phase 1 Appendix D               | Intervention review                   |
| P14 | The patient's medicine list exists as a web route if Phase 1's Step 9 was built; Gate CG is still open for the Expo app                                                                                                                                                                                                                                                  | Phase 1 5.11                     | The list after discharge              |
| P15 | Where a hospital records committees or assignments (an AMS committee, an infection prevention lead) in the hub was not read                                                                                                                                                                                                                                              | hub                              | Stewardship rights                    |

---

## 4. Design direction

**Eight rules**

1. **Every alert shows its working.** The pair, the source, the version, who signed it and when. A pharmacist can tell at a glance why it fired.
2. **Few alerts, each worth reading.** Only signed severe pairs interrupt. Everything else is a Note or nothing. An alert the prescriber already answered does not ask the pharmacist the same question twice; it shows the answer.
3. **The check travels with the patient.** A pair is checked across what this patient is taking now: other lines on the prescription, active prescriptions, medicines charted on the ward, and medicines supplied within the signed look-back.
4. **Stewardship is a list of patients, not a chart.** The chart says where; the list says who to look at today and why.
5. **A review asks a question, it does not take a decision.** Continue (with a stop date), change, switch to oral, stop: the prescriber chooses.
6. **One record, many places.** A suspected reaction updates the allergy record, prepares the regulator's report and links to the batch. A reconciled list feeds the window, the discharge summary and the patient's list.
7. **Show the pattern, let people decide.** Intervention review shows what queries add up to. It never creates a check; a pharmacist drafts and the CSO signs.
8. **Say what is not checked.** Medicines bought outside, herbal medicines and pairs not yet signed are not checked, and every screen says so.

**Budgets** (baseline at Step 0 where one exists; met by Step 10)

| Measure                                                                                                                                                   | Budget                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Interaction check inside the prescribing dialog, 5 medicines against a patient on 10                                                                      | p95 < 150 ms, one round trip, no extra request per medicine |
| Interaction check on the review screen                                                                                                                    | p95 < 200 ms                                                |
| Stewardship page, 300 antibiotic prescriptions in the period                                                                                              | p95 < 1.5 s TTFB                                            |
| Interventions page, 2,000 queries in the period                                                                                                           | p95 < 1.5 s                                                 |
| Reconciliation table for a patient with 15 medicines                                                                                                      | p95 < 500 ms                                                |
| Recording a suspected reaction, from opening the form to saved                                                                                            | ≤ 6 typed or chosen fields for a non-serious reaction       |
| Alerts fired from unsigned content                                                                                                                        | 0                                                           |
| Prescription rows written by any action in this slice                                                                                                     | 0                                                           |
| Allergy entries deleted                                                                                                                                   | 0                                                           |
| Interaction alerts at prescribing that were already overridden for the same pair and patient within the signed suppression window, shown again as a Check | 0 (they show as a Note naming the earlier answer)           |

---

## 5. Interface specification

### 5.1 Navigation, flags and the notice

**Pharmacy navigation** gains a **Clinical** group: Stewardship · Reconciliation · Reactions · Interventions. A **Set-up** group gains **Clinical content**.

- Each item is registered through the Phase 0 registry and shown only when its flag is on, its page is built and the viewer holds the permission.
- Clinical content shows when any of the five flags is on, because content is signed before a flag goes live.

**The notice** (Phase 0, Phase 1 Appendix B) reads from `pharmacyChecksState`:

- With `pharmacyInteractions` off, or no signed pair, it is unchanged.
- With signed pairs in force, it reads, in signed wording: _"MedSync checks {n} signed interaction pairs between medicines on this hospital's list. It does not check medicines bought outside, herbal medicines, or pairs not yet signed. No alert does not mean no interaction."_
- It stays on every review surface and cannot be dismissed.

**The doctor's side:**

- the prescribing dialog's Check step;
- a **review prompt** on the problem card for an antibiotic due for review;
- **an allergy to confirm** in the problem card's allergy section;
- the existing pharmacy query card.

Nothing new appears on the doctor's side while its flag is off.

**The ward:** the administration record shows a read-only chip on an antibiotic due for review (_"Antibiotic review due"_), and the stop date once a prescriber has typed one. It changes nothing a nurse can do.

### 5.2 Clinical content (board 3.7)

For the pharmacist reviewer, the CSO and, for stewardship settings, the AMS committee chair. Read-only for other pharmacy staff.

**The list of packs**, each with the version in force, the drafts waiting, its source, and who must sign:

- Interaction pairs;
- Alert levels (severity → Stop, Check or Note, and the suppression window);
- AWaRe groups;
- Antibiotic review settings;
- Look-back windows;
- Reconciliation rules and wording;
- Query codes and their PCNE map;
- The reaction report's field map;
- The lane reasons this slice adds (Appendix D).

**An interaction entry:**

| Field                     | What it holds                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| First and second medicine | Each picked by name from the catalogue's medicine layer, or a class from the signed drug-class map                                  |
| Severity                  | From the signed severity list: proposed **Contraindicated**, **Serious**, **Monitor** (D-PH3-03), the terms the candidate file uses |
| What happens              | Plain words, from the source                                                                                                        |
| What to do                | Plain words. No dose, unless the source gives one, quoted with its section                                                          |
| Source                    | Reference, edition, section or page. Required                                                                                       |
| Restricted                | Whether the pair names a restricted class (hiv, tb, srh). If so, the alert names it only to viewers who may see it                  |
| Status                    | `draft` → `reviewer_signed` → `in_force` → `withdrawn` (with reason)                                                                |

- An entry with no source, or with a medicine not on the list, cannot be sent for signing.
- The author cannot sign their own entry where another eligible signer exists (D-PH1-36).
- Editing an entry in force creates a new version, which is a draft until signed. The old version stays in force until then.

**Import candidates:**

- brings `interaction-candidates.json` in as drafts, matched to the medicine list by exact generic name;
- candidates whose medicine is not on this hospital's list are kept as **Not matched**;
- the import report lists counts by state;
- importing again changes nothing (CC-3).

**AWaRe groups:**

- imports `aware-candidates.json` (the edition and its date shown);
- matches each antibiotic on the hospital's medicine list by exact generic name;
- lists what did not match: combinations, brand-only entries, antibiotics not on the WHO list. Each is matched by a person or marked "AWaRe group not known". Nothing is matched by guess;
- the whole pack is signed once, with the edition, by the pharmacist reviewer and the AMS chair. A new WHO edition is a new import and a new signature, never an edit in place.

**Antibiotic review settings** (signed by the AMS chair and the CSO):

- review interval per AWaRe group, in days from the first dose or the prescription (D-PH3-07);
- which groups get a prompt;
- whether a Reserve antibiotic is a pharmacist-first lane reason (D-PH3-08);
- the "started with no culture sent" window.

The sourced range from the guidance is shown beside each field, never filled in.

**The alert levels**, signed by the CSO and the pharmacist reviewer:

- severity → level in the prescribing dialog (Stop, Check, Note or hidden) and on the review screen;
- the **suppression window**: how long a pair already answered for this patient shows as a Note naming the earlier answer, rather than a Check again.

**Look-back windows:** how far back a supplied medicine counts as "this patient is taking it" for the interaction check, per medicine or by default.

**Query codes and the PCNE map:** each Phase 1 query code with the PCNE problem and intervention codes it maps to (6.4). The map is used for reports only; it never changes how a query works.

**The reaction report's field map:** each field of the NDA's form, in its order, mapped to a MedSync fact or marked "ask" (6.5).

### 5.3 Interactions: at prescribing (board 3.6) and at review (board 3.2)

**What is checked** (IX-2): each medicine being prescribed against each other and against what this patient is taking now:

- active prescription lines (not cancelled, not replaced, not ended);
- medicines charted on the administration record in the last 24 hours (the window is a signed look-back);
- medicines supplied at a window within the signed look-back for that medicine;
- medicines recorded before admission and given **Continue**.

A medicine the patient bought outside is checked **only if it is recorded** as a medicine before admission or on the patient's list.

**At prescribing, in the dialog's Check step,** behind `pharmacyInteractions`. One row per fired entry:

- the level from the signed mapping;
- the severity in words;
- the pair, naming which medicine the patient is already taking and since when;
- the "what happens" and "what to do" text, as signed;
- the source and the entry id and version.

The answers are the dialog's existing ones for that level:

- **Stop:** override with a reason from the signed list, or pick something else;
- **Check:** _Aware; prescribe with a reason_ or _Pick something else_;
- **Note:** shown, no answer.

The proposed mapping (D-PH3-03) interrupts only for Contraindicated pairs: Serious pairs are Notes shown first, and Monitor pairs are not shown in the dialog at all, only at review. Pairs that make up an intended regimen (a fixed-dose combination, or a pair the entry marks as "given together by design") are never interruptive, whatever their severity.

More rules at prescribing:

- **The answer is stored** as a check outcome, with the entry and version (IX-5).
- **Suppression:** a pair answered for this patient within the signed suppression window shows as a Note: _"Answered {date} by {cadre}: {reason}."_
- **No signed pair fired:** a Note reads, in signed wording, _"Checked against {n} signed pairs. Medicines bought outside and herbal medicines are not checked."_ With no signed pairs in force, the dialog keeps its present line, _"Interactions are not checked."_

**At review (board 3.2).** A fired entry shows on the review screen above the lines:

- the alert, as above;
- **What the prescriber did:** their answer and reason, verbatim, with the time; or _"Fired after prescribing"_ when it fired only at review (a medicine supplied since, a list version signed since);
- **Your decision:**
  - **Ask the prescriber** sends a Phase 1 query of the type _Interaction_ with the alert text attached;
  - **Supply, with a reason** records the pharmacist's reason beside the prescriber's (IX-6).

  A line with a fired entry of a level the hospital signs as needing a pharmacist cannot be supplied in the Standard lane: it is a lane reason (Appendix D).

- **What was checked** (side panel): the list version and pair count, and the notice from 5.1.

**The ward.** An interaction alert never appears on the administration record. The nurse is not the person to resolve it.

### 5.4 Interventions (board 3.5)

Behind `pharmacyInterventionReview`. For holders of `pharmacy.review` and `pharmacy.manage`, and the CSO.

- **Period and point filters.** Four figures:
  - queries sent (with how many were withdrawn and how many still wait);
  - answered;
  - changed or stopped (share of answered);
  - kept as written (each with a reason).
- **By type:** one row per signed query code (Phase 1 codes plus _Interaction_ and _Antibiotic review_, which this slice adds) with: sent · answered · changed · stopped · kept · median time to answer.
- **By ward:** one bar per ward or clinic, changed-or-stopped against kept-or-unanswered, on one scale, with the scale stated.
- **Waiting for an answer:** every open query, oldest first, with its age. Nothing escalates by itself (Phase 1 RQ-10).
- **A check worth signing:** the query types whose acted-on count in the period meets the signed minimum (D-PH3-12), with a plain sentence of what a prescribing check might do. Two buttons:
  - **Open the {n} queries**;
  - **Draft a check for review**, which opens a note in Clinical content for the pharmacist reviewer. It is not a check and changes nothing in prescribing.
- **PCNE coding (optional, only once PCNE's permission is on record, D-PH3-19):** a pharmacist may add PCNE codes to a query when sending it or after it closes: problem, cause, planned intervention, acceptance, status. The coding is for audit and research; reports group by the hospital's own query codes by default.
- **Download** (holders of `pharmacy.manage`) is a CSV of counts by type, ward and month. It contains no patient identifiers and is logged.

### 5.5 Antimicrobial stewardship (boards 3.1 and 3.6)

Behind `pharmacyStewardship`. For holders of `pharmacy.review`, and members of the hospital's AMS committee and the infection prevention lead through hub assignments (Appendix A).

**Figures for the chosen period**, each defined in AM-4:

- patients on an antibiotic today, of those admitted;
- antibiotic prescriptions started with no culture sent within the signed window;
- the share of antibiotic prescriptions by AWaRe group;
- days of therapy by group, where the administration record allows it (AM-5).

**By ward and AWaRe group:** one bar per ward or clinic, split Access · Watch · Reserve, with "AWaRe group not known" as a fourth, grey part when present. One scale, stated in the footer, figures in words under each ward.

**To review today:** every patient whose antibiotic has reached its signed review day and has no review recorded, oldest first. Each row shows:

- the patient's two identifiers;
- the antibiotic and its group;
- ward;
- day of therapy (from the first charted dose, or from the prescription when nothing is charted, and it says which);
- the indication if recorded;
- culture: _Not sent_ · _Sent {date}, no result yet_ · _Result released {date}_ (a link to the lab report for viewers who may read it);
- one action: **Ask the team**.

**Reserve started:** every Reserve-group antibiotic started in the period, with who prescribed it and whether it has been reviewed. Where the hospital signs Reserve as a pharmacist-first reason (D-PH3-08), it is reviewed in the queue like any other.

**Other lists on the page**, each from a signed setting and each a list of patients, never an action:

- **Restricted antibiotics** (D-PH3-21): each started in the period, whether authorisation was recorded and by whom, and the time from the first dose. A prescriber or AMS member records **Authorisation obtained** (who authorised, when). It never delays a dose.
- **Not-recommended combinations:** prescriptions of a fixed-dose combination WHO classes as not recommended, with WHO's statement, as information.
- **Long parenteral courses:** parenteral antibiotics past the signed query day (the Ministry's committee guideline gives seven days as an example of when pharmacy could query), for an Antibiotic review query.
- **Surgical prophylaxis still running:** prophylaxis courses past the signed limit, where the problem the line is for is coded as surgical prophylaxis.

**Point-prevalence survey day** (holders of `pharmacy.manage` and the AMS chair): a de-identified extract, one row per inpatient antibiotic on the chosen day, in the WHO point-prevalence survey's variables that MedSync holds, for the committee's annual survey. Logged; no names or numbers.

**Ask the team** (side panel):

- a suggestion from the signed list: _Review whether it is still needed_ · _Send a culture before the next dose_ · _Consider a switch to oral treatment_ · _Set a stop date_ · _Other_;
- an optional note.

It is sent as a Phase 1 query of the type _Antibiotic review_. It informs and never stops a dose.

**On the doctor's problem card (board 3.6).** An antibiotic past its review day shows a chip _"Review due"_ and a review card:

- the day of therapy, the indication, the culture state;
- the hospital's rule in signed words.

The answers are recorded as an AMS review event (AM-6):

- **Continue**, with a stop date the prescriber types (a date, never a duration or dose);
- **Change** (opens prescribing);
- **Switch to oral** (opens prescribing);
- **Stop** (cancels through the existing action, with a reason).

A pharmacy query of the type _Antibiotic review_, when one is open, is answered by the same action. A review closes the prompt until the next interval, if the setting has one.

**For the infection prevention lead**, a read-only summary by ward of the same figures, with no patient list unless the lead holds the infection prevention right Lab Phase 5 defines.

### 5.6 Suspected reaction (board 3.4) and the allergy to confirm (board 3.6)

Behind `pharmacyReactions`. Recorded by any clinician who may see the patient: a pharmacist, a pharmacy technician, a prescriber or a nurse (D-PH3-14).

**What happened:**

- **What kind of event**, from the national form's own categories: suspected reaction · the medicine did not work as expected · a poor-quality product · a medication error · a suspected counterfeit. (AEFI, after a vaccine, goes by the immunisation route and is not recorded here.) A medication error is recorded without blame and never names the staff member on the report.
- **Suspected medicine:** from a list of what this patient was supplied, charted or prescribed in the last 90 days (the window is signed). Each comes with its product and batch where a supply recorded one. Or: _Another medicine, not from this hospital_ (name typed, marked uncoded); or _Not known_. More than one medicine may be named; one is marked the main suspect.
- **The reaction, in the reporter's words.**
- **Optional coded manifestation** from the allergy record's reaction list (rash · hives or itch · swelling of face or lips · wheeze or breathing difficulty · collapse · severe skin peeling or blistering · stomach upset · other).
- **When it started**, a date field; and **when the medicine was started**, from the record where known.
- **How serious:** the ICH E2A criteria in plain words:
  - not serious;
  - resulted in death;
  - was life-threatening;
  - needed admission or a longer stay;
  - caused lasting disability;
  - a birth defect;
  - another important medical event.
- **Now:** recovered · getting better · not recovered · recovered with lasting effects · died · not known.
- **What was done about the medicine:** stopped by the patient · stopped by a clinician · dose changed by a clinician · carried on · not known.
- **Did it come back when the medicine was given again:** yes · no · not given again · not known.
- **Reported by:** the patient, a relative, or a staff member.
- **The patient is unwell now:** the screen says, always, _"If the patient is unwell now, use Emergency. This form is a record and treats nobody."_

**Assessment** (optional when recording, completed by a pharmacist or a prescriber):

- causality in WHO-UMC terms: certain · probable or likely · possible · unlikely · conditional or unclassified · unassessable or unclassifiable. Each comes with its definition on hover and on the print;
- who assessed and when.

**What recording does** (shown before saving, in words):

- **On the allergy record** (suspected reactions only, not quality problems or errors): one entry per suspected medicine, _"{medicine}: {reaction} (suspected, {date})"_, verification **unconfirmed**, type **not yet known**, criticality **unable to assess**. Prescribers see it at once in the allergy check as _suspected_. The reaction report and the allergy entry are two linked records, never one.
- **For the National Drug Authority:** a report in the layout of the national combined adverse reaction form (sections A to F: category, patient, suspected medicines, other medicines, reaction, reporter), through the field map (5.2), with the patient's initials, age and sex and a MedSync report reference in place of the hospital number, the medicine, product, batch, dates, reaction, seriousness, outcome and the reporter's professional details. **Print the report** · **Copy as text** for the route the reporter uses (the WHO-UMC e-reporting page for Uganda, the Med Safety app, email to the Authority, or the paper form through the regional pharmacovigilance centre; the routes are signed data). _"MedSync does not send the report."_
- **Due by:** a serious report shows _"Report due by {date and time}"_ and a non-serious one _"Report due by {date}"_, from the signed timelines (D-PH3-22). Amber when past, never red. Nothing is sent when it passes.
- **The same batch:** how many other patients received this batch, and how many reactions are recorded against it. Where Phase 2's recall is on, **Open the batch** opens it for a holder of `pharmacy.manage`. Nothing is quarantined or recalled automatically.
- **A poor-quality product or a suspected counterfeit** lists the batch for the pharmacy in charge with _"Consider quarantine, keep a sample, and send the Authority's market complaint form to the Authority and the supplier."_ A signed cluster rule (a number of reports on one batch within a period, D-PH3-23) lists the batch the same way. Nothing is quarantined automatically.

**After recording,** the report has a state:

- `to_submit`;
- `submitted`, recorded by a person: route (paper form · NDA online · Med Safety app · email · other), date, reference;
- `closed_not_submitted`, with a reason.

It is listed on the Reactions page until it leaves `to_submit`.

**On the doctor's side (board 3.6),** the problem card's allergy section shows _"1 to confirm"_ and each unconfirmed entry, with:

- **Confirm allergy**;
- **Intolerance, not allergy**;
- **Refute, with a reason**.

A refuted entry stays in the record, struck through, with the reason. Confirming or refuting never touches the reaction report.

**The Reactions page:** every event recorded, newest first, with its kind, state, seriousness, due-by, the medicine and the allergy entry's verification. Filters: to submit · serious · past due · not yet assessed. It is the hospital's own record of adverse reactions that the Ministry's guideline for Medicines and Therapeutics Committees (2nd edition, June 2025) asks each committee to keep, and it prints a summary for the committee's meeting (counts by kind, seriousness and causality, no patient names).

### 5.7 Reconciliation at discharge (boards 3.3 and 3.8)

Behind `pharmacyReconciliation`.

**What starts it** (MR-1), depending on what Step 0 finds (P11):

- if a discharge event exists, it starts when the discharge is begun, or when a discharge prescription is placed, whichever comes first;
- if no discharge event exists, it starts when a prescriber places a prescription marked _for discharge_ for an admitted patient, or presses **Prepare medicines for home** on the plan. That button is added only if the plan has no such step; the decision is D-PH3-16.

**The table** (one row per medicine the patient had before admission, was given on the ward, or is prescribed for home):

| Column           | What it shows                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Medicine         | As recorded; restricted classes named only to viewers who may see them                                                                                                                                                                     |
| Before admission | Taking, with the source of that record (patient, carer, card, letter, dispensing record) · Not taking · Not recorded                                                                                                                       |
| On the ward      | The admission decision (Continue, Hold, Stop) with the doctor's reason, and the last charted dose                                                                                                                                          |
| For home         | The discharging prescriber's decision: **Continue** · **Restart** · **Changed** (opens prescribing) · **Stay stopped** · **Paused until review** · **Ends on the ward** · **New for home**. Each comes from the prescriber, never inferred |
| Supply           | Has some at home · supplied today · owed · to buy outside · none needed                                                                                                                                                                    |

**Discrepancies the system finds from the records** (MR-3), each amber with an icon. The candidate set, after the WHO High 5s discharge step (compare the admission history and the last 24 hours of the administration record with the discharge prescription), each signed on or off per hospital:

- R1 continued on admission, not on the discharge prescription, no stop recorded (omission);
- R2 stopped on admission, back on the discharge prescription (restart of a stopped medicine);
- R3 held on admission, no decision for home;
- R4 given on the ward in the last 24 hours, not on the discharge prescription, no stop (omission);
- R5 stopped during the stay with a reason, on the discharge prescription;
- R6 new at discharge, never given in hospital and not taken before (indication to confirm);
- R7 the directions differ from the admission record or the last charted dose, with no reason recorded (shown as text side by side, never compared as numbers);
- R8 the same medicine twice on the discharge prescription (class duplicates only from the signed drug-class map);
- R9 a course-type medicine with no stop date or duration;
- R10 a discharge line missing its directions;
- R11 a discharge medicine on the allergy record, or forming a signed interaction pair with another;
- R12 the history before admission recorded from one source only, or not recorded;
- R13 an open pharmacy query on this patient;
- R14 a line not matched to the medicine list.

The pharmacist may add a discrepancy the records cannot show: _the patient says they take something not recorded_ · _the dose at home differs from the record_ · _other_.

**Who does what:**

- The discharging prescriber decides every line, on the plan.
- The pharmacist checks the table, queries any line (Phase 1 query of the type _Reconciliation_), and **confirms the list** when every line has a decision and every discrepancy is resolved or explained.
- **Confirm the list** stays off until then, with the reason shown (_"Metformin has no decision for home"_).

**What confirming does:**

- the discharge prescription's lines go to the window for supply as Phase 1 lines;
- the list goes into the discharge summary, if the branch has one (otherwise the seam is recorded);
- the list goes onto the patient's medicine list, if Phase 1 Step 9 was built, with stopped and paused medicines marked as such (board 3.8);
- a **Medicines after your stay** sheet prints for the patient (A4, print CSS, black on white): each medicine with what to do, in the signed patient wording, and _"Do not restart"_ for stopped medicines.

**If the patient leaves first:** a reconciliation not confirmed when the patient is discharged stays open on the Reconciliation page, marked _"Patient has gone home"_. It is closed by a person with a reason (confirmed by phone, at the next visit, other) or confirmed later. **Nothing holds the discharge** (Law 5).

**Lane reason (signed, Appendix D):** a discharge prescription for a patient with an open reconciliation discrepancy is pharmacist-first.

### 5.8 The patient's list after a hospital stay (board 3.8)

Where Phase 1 Step 9 was built:

- the patient's list shows the reconciled medicines under _"After your hospital stay"_: carry on · new · stopped in hospital, do not restart · paused, your doctor will tell you;
- web only (Gate CG);
- no message names a medicine. If messages are on, the one new kind is _"Your medicines list was updated after your hospital stay. Open MedSync to see it."_, from an approved template.

Where Step 9 was deferred, the sheet in 5.7 is the patient's copy and the screen says so.

### 5.9 Phone, tablet and paper

- Desktop-first for the pharmacy, unbroken at 834 px and 390 px, with 44 px targets.
- The doctor's review card and the allergy confirmation work one-handed at 390 px.
- **Paper, print CSS only, black on white, legible in greyscale:**
  - the NDA report in the confirmed field order;
  - the Medicines after your stay sheet;
  - the stewardship summary for a committee meeting (figures only, no patients).

### 5.10 Going live

- Each flag is switched on per hospital through Phase 1's go-live page, with a second approver. Its conditions:

  | Flag                         | Conditions                                                                                                                                                   |
  | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `pharmacyInteractions`       | At least one signed pair, the alert levels signed, the notice wording signed, prescribers briefed                                                            |
  | `pharmacyStewardship`        | The AWaRe pack signed, the review settings signed by the AMS chair (or the CSO's recorded exception), the AMS committee members named in the hub             |
  | `pharmacyReactions`          | The NDA field map confirmed by the pharmacy in charge against the form in use, the reaction copy signed, Step 0's allergy model decision recorded (D-PH3-13) |
  | `pharmacyReconciliation`     | The reconciliation rules and wording signed, the trigger decided (D-PH3-16), and a test discharge run end to end at the test hospital                        |
  | `pharmacyInterventionReview` | The added query codes signed. PCNE coding stays hidden unless the PCNE map is signed with the PCNE Board's permission reference recorded on it (D-PH3-19)    |

- Switching off returns the Phase 1 baseline for that part, and keeps every recorded event readable.

### 5.11 Where this prompt departs from the roadmap and the boards

- **The roadmap's "verified regimens"** (signed content listed for Phase 3) are dose references. They are not built here: a regimen check would compute against a dose, which this slice does not do. Their content track continues (Phase 1's dose reference). A signed regimen, once one exists, may be shown as information on the review screen through the existing signed-reference read, as a seam.
- **Board 3.1** shows "The prescriber saw the check on all 71" for antibiotics started with no culture. That figure exists only if the cultures check stores its outcome (P8). Otherwise the hint is absent.
- **Board 3.2** offers only two decisions. Withdrawing the alert is not a decision: an alert the pharmacist thinks is wrong is reported to the reviewer from the alert (**Report a problem with this entry**), and the alert stays.
- **Board 3.3** shows ceftriaxone with "15 doses charted". The table shows the last charted dose and never a dose count as a clinical figure.
- **Board 3.4** offers "Copy for the Med Safety app". The copy is plain text for whichever route the Authority accepts; the routes are signed data (6.5).
- **Board 3.6** shows a review on day 3. Every interval is a signed setting; the board's "[n]" is a placeholder.
- **Board 3.7** shows the antibiotic review interval as an example; none is proposed.
- **Board 3.8** names medicines. It is the signed-in web page; no message names a medicine.
- **No figure on any board is a signed value.**

---

## 6. Engines (pure, no I/O unless stated; every rule has an ID and at least one test)

### 6.1 Clinical content (`lib/pharmacy/content/**`)

- **CC-1** Each pack in 5.2 is a per-hospital, versioned set through the signed-reference mechanism if it can hold it (Phase 1 E-PH1-07), otherwise dedicated tables of the same shape. An entry has an author, two signatures (role, user, time, fresh second factor), a source, a status and a version. Only `in_force` entries are read by any engine.
- **CC-2** Signing rules:
  - an interaction entry needs the pharmacist reviewer and the CSO;
  - the AWaRe pack and review settings need the pharmacist reviewer (AWaRe) or the CSO (settings), and the AMS chair;
  - the field map needs the pharmacy in charge;
  - copy follows D-PH1-36.

  The author of an entry is never its only signer where another eligible signer exists. Where none exists, the exception is recorded in words on the signature.

- **CC-3** The candidate import is idempotent, keyed on the candidate id and the file's hash. It writes drafts only. Matching is exact on the catalogue's generic name, form-independent for interaction entries (a pair applies to every form and strength of the medicine unless the entry names a route, D-PH3-04).
- **CC-4** Withdrawing an entry (with a reason, by a signer) takes it out of force at once. A test proves the next check no longer fires it.
- **CC-5** A class-level entry is matched through the drug-class map only when that map is signed. While it is not, class-level entries stay drafts with _"Waits for the drug-class map"_.

### 6.2 Interactions (`lib/pharmacy/interactions.ts`, called from `lib/prescribing/**`)

- **IX-1** `checkInteractions({ hospitalId, patientId, adding: medicineId[], at })` returns fired entries with their level, the pair, which side the patient is already on and since when, and the entry version. It is pure over a snapshot of the patient's current medicines and the signed pack.
- **IX-2** "Current medicines" are:
  - active prescription lines (not cancelled, replaced or ended);
  - medicines with a dose charted within the signed charted look-back;
  - medicines supplied at a window within the signed supply look-back for that medicine (or the default);
  - medicines before admission with the decision Continue, while the admission is open.

  Each comes with its source. A medicine appears once, by its catalogue id, whatever the sources.

- **IX-3** A pair fires when one side is being added and the other is being added or current. Pairs are unordered. Each entry fires at most once per check.
- **IX-4** The level comes from the signed mapping of the entry's severity, separately for the prescribing dialog and for the review screen (a severity may be `hidden` in the dialog and shown at review). With no mapping signed, nothing fires and the dialog says _"Interaction alert levels are not signed yet."_
- **IX-4a** An entry may carry `by_design: true` (the pair is given together as a regimen). It is shown at review as information and never at a level above Note in the dialog.
- **IX-5** An answer at prescribing is stored as a check outcome in the existing check store (P2), with the entry id, version, level, answer and reason.
- **IX-6** At review, `checkInteractions` runs again over the prescription as it stands and shows each fired entry with the prescriber's stored answer, or _"Fired after prescribing"_. The pharmacist's decision is a Phase 1 review event (`accepted_interaction`, with a reason) or a query of the type _Interaction_.
- **IX-7** Suppression: an entry answered for the same patient and pair within the signed suppression window returns at level Note, naming the earlier answer. The window starts at the earlier answer.
- **IX-8** Restricted pairs: for a viewer without access to the class, the alert names the class as _"a medicine in a restricted class"_, and the text is replaced with _"Ask a clinician who may see this patient's full record."_ The answer is still required at the entry's level.
- **IX-9** `pharmacyChecksState.interactionsChecked` returns `{ state: 'none' }`, or `{ state: 'partial', pairs: n, version, signedAt }`. It never returns a complete state. A test fixes this shape.
- **IX-10** Property tests:
  - no unsigned or withdrawn entry ever fires;
  - adding and then removing a medicine leaves the fired set as it was;
  - the fired set does not depend on the order of medicines;
  - an entry for (A, B) fires for (B, A).

### 6.3 Lane reasons added by this slice (`lib/pharmacy/lanes.ts`, Phase 1 LN-1)

New reasons, each signed and switched on per hospital, with Step 0's counts:

- a fired interaction entry of a level the hospital names;
- a Reserve-group antibiotic;
- a discharge prescription with an open reconciliation discrepancy.

LN-3 holds: each reason reads a stored fact (a stored check outcome, the signed AWaRe tag, the reconciliation state), never re-runs a check.

### 6.4 Interventions (`lib/pharmacy/interventions.ts`)

- **IV-1** Every Phase 1 query is an intervention. Its type is the signed query code. This slice adds two codes, _Interaction_ and _Antibiotic review_, and _Reconciliation_, each signed.
- **IV-2** Answer outcomes for reports:
  - `changed` (the line was replaced);
  - `stopped` (cancelled);
  - `kept` (kept as written, with a reason);
  - `withdrawn` (by the pharmacy, with a reason);
  - `open`.

  They come from Phase 1's query events; nothing is re-entered.

- **IV-2a** A query records its **intent**: _asks a question_ or _proposes a change_ (a new optional field on the Phase 1 query form, default _proposes a change_). A `kept` answer to a question-only query is not counted against acceptance; reports show it as _clarified_.
- **IV-3** Optional PCNE codes on a query, only while the PCNE pack is in force with its permission reference (problem, cause, planned intervention, acceptance, status), from the signed PCNE map's code list. Acceptance and status are proposed from the query's outcome (`changed` or `stopped` → intervention accepted; `kept` → not accepted, with the prescriber's reason). A person confirms them; nothing is coded silently.
- **IV-4** `interventionReport({ hospital, period, point?, ward? })` returns counts by type, ward and outcome, and the median time from sent to answered. It returns no patient identifiers; drill-down to the queries goes through the existing queue read, which is permission-checked.
- **IV-5** "A check worth signing" returns query types whose `changed + stopped` count in the period is at or above the signed minimum. With none signed, it returns nothing and the card says the minimum is not set.

### 6.5 Suspected reactions and the allergy record (`lib/pharmacy/reactions.ts`, the allergy module)

- **AR-1** A reaction record holds:
  - the kind of event (AR-1a);
  - the patient;
  - suspected medicines (catalogue id, product and batch where a supply recorded them, or uncoded text), one marked main;
  - the reaction text and optional coded manifestation;
  - the dates;
  - seriousness (ICH E2A criteria, more than one allowed);
  - outcome;
  - action taken;
  - rechallenge;
  - reporter (patient, relative or staff, with staff details from the record);
  - causality (WHO-UMC category, assessor, time), optional at first.

  Append-only: corrections are new events naming the field.

- **AR-1a** Kinds: `suspected_reaction`, `lack_of_effect`, `poor_quality`, `medication_error`, `suspected_counterfeit`. Only `suspected_reaction` writes an allergy entry. `medication_error` records no staff name on the report.
- **AR-2** Recording writes, in one transaction:
  - the reaction record;
  - for a suspected reaction, an allergy record entry for each suspected medicine: verification `unconfirmed`, type `unknown`, criticality `unable_to_assess`, source `suspected_reaction`, linked to the reaction;
  - the report in state `to_submit`.

  If Step 0 finds the allergy record has no verification status or type, the migration adds them (D-PH3-13), and existing entries are set `confirmed` with type `unknown`, which the GATE A proposal states.

- **AR-3** Only a prescriber may set an allergy entry to `confirmed` (as `allergy` or `intolerance`) or `refuted` (with a reason). Each is an event. An entry is never deleted.
- **AR-4** The prescribing allergy check reads `unconfirmed` and `confirmed` entries; `refuted` entries do not fire. A test proves an unconfirmed entry fires at the same level as a confirmed one, labelled _suspected_.
- **AR-5** The report is a projection over the reaction record through the signed field map. Identifiers on it are initials (from the name, by a fixed rule), age in years (or months under 2), and sex. A test proves no name, number, phone or address appears on the print or the copied text.
- **AR-5a** Due-by is the record time plus the signed timeline for serious or non-serious (D-PH3-22). It is a display; nothing acts when it passes.
- **AR-6** Submission is an event: route (from the signed list), date, reference, recorded by a person. `closed_not_submitted` needs a reason.
- **AR-7** The same-batch figure counts patients with a supply of that batch (Phase 1 supply records) and reaction records naming it. It never lists them to anyone without `pharmacy.manage`.
- **AR-8** A reaction to a medicine in a restricted class is named on every screen only to viewers who may see that class. The allergy entry shows to prescribers as _"a medicine in a restricted class: suspected reaction"_ when they lack access, and the allergy check still fires.

### 6.6 Stewardship (`lib/pharmacy/stewardship.ts`)

- **AM-0** AWaRe tags key to the medicine **and route** where WHO classifies by route (for example fosfomycin and minocycline are Reserve intravenously and Watch by mouth). Topical, eye and ear products are outside the shares unless the signers decide otherwise (D-PH3-06).
- **AM-1** An antibiotic is a medicine with a signed AWaRe tag, or one marked "AWaRe group not known" in the signed pack. Medicines without either are not counted, and the page states how many antibiotic-like names were left out (from the drug-class map, if signed).
- **AM-2** An antibiotic course for stewardship is a prescription line of an antibiotic, from its first charted dose (or its placing when nothing is charted, marked so) to its last charted dose, its cancellation, its replacement by a line of a different antibiotic, or discharge.
- **AM-3** Review due: a course whose day of therapy has reached the signed interval for its group, with no AMS review event since the interval began. Day of therapy counts calendar days in the hospital's local time from day 1, by the signed day rule.
- **AM-4** Figure definitions:
  - **on an antibiotic today:** admitted patients with an open course today ÷ patients admitted today, from the admission record;
  - **started with no culture sent:** courses started in the period with no culture order for the patient between the signed window before and after the start;
  - **share by group:** courses started in the period by group ÷ all courses started;
  - **days of therapy:** distinct calendar days with at least one charted dose of the antibiotic, summed by group (AM-5).
- **AM-5** Days of therapy are computed from the administration record. With no charted doses for a ward, that ward shows **prescribed** days of therapy (calendar days with an active line), labelled _"Prescribed, not given: this ward does not chart doses"_. DDD is not computed in this slice: it needs structured doses and WHO's DDD values, and although it is reporting arithmetic rather than a patient dose, Law 8 keeps it out until the CSO signs it as a separate decision.
- **AM-5a** Every share is labelled a **share of prescriptions**, never a share of consumption. The 60 per cent (WHO) and 70 per cent (UN, 2030) Access targets are national and global consumption targets; they appear only as reference text, never as a hospital pass mark or a colour.
- **AM-6** An AMS review event records:
  - the course;
  - the answer (continue with a typed stop date, change, switch to oral, stop);
  - the reason where needed;
  - who answered and when;
  - the open query it answered, if any.

  A stop date is stored on the review and shown on the problem card and the administration record. It is never written to the prescription.

- **AM-7** Culture state reads lab orders and released reports for the patient: not sent · sent, no result · result released (with the report's id). It never interprets a susceptibility.
- **AM-8** Every figure returns its numerator, denominator and definition, so the screen shows the arithmetic in words.

### 6.7 Reconciliation at discharge (`lib/pharmacy/reconciliation.ts`)

- **MR-1** A reconciliation opens on the trigger D-PH3-16 decides, for one admission. One open reconciliation per admission.
- **MR-2** Rows are the union of: medicines before admission, medicines with an admission decision or a charted dose during the admission, and lines of the discharge prescription, matched by catalogue id. Uncoded medicines before admission are rows of their own, marked _uncoded_.
- **MR-3** Discrepancies the engine finds are exactly R1 to R14 in 5.7 that are signed on, each with its id. The engine never resolves one: a prescriber's decision or a pharmacist's explanation does. R7 never compares doses as numbers: it compares the stored text and the structured fields, if any, for equality, and shows both.
- **MR-4** Confirm needs:
  - every row with a for-home decision from a prescriber;
  - every engine discrepancy resolved by a decision or explained by a pharmacist with a reason from the signed list;
  - a holder of `pharmacy.review`.

  It writes a confirmation event with the list as it stood.

- **MR-5** After confirmation:
  - a change to a discharge line by the prescriber reopens the reconciliation for that row and tells the pharmacist;
  - the confirmed list stays in the record as it was.
- **MR-6** A reconciliation open when the patient is discharged stays open, marked. It closes only by confirmation or by a person with a reason.
- **MR-7** The patient-list entries and the printed sheet are projections of the confirmed list through signed wording.

---

## 7. Data changes (only what GATE A approves; additive; numbers from the ledger)

Claim a block in `docs/NUMBERS.md` before writing any migration or ADR: 20 migration numbers and 12 ADR numbers above the highest on `main` and on every open branch. Names are proposals; follow the repo's naming.

**Content**

- The packs in 5.2, through the signed-reference mechanism or as `pharmacy_content_entries` (pack, key, version, payload validated by Zod per pack, status, author, source) with `pharmacy_content_signatures` (append-only).
- `pharmacy_content_imports` (file hash, counts, report).

**Interactions**

- Fired alerts and answers through the existing check store (P2).
- Pharmacist decisions through Phase 1's line events and queries.

**Interventions**

- `pharmacy_query_pcne` (query, codes, coder, time; append-only, corrections as new rows).

**Stewardship**

- `ams_reviews` (course key, answer, stop date, reason, actor, query).
- `ams_settings` through the content packs.
- No stored figures: every figure is a projection.

**Reactions and allergies**

- `reaction_reports`, `reaction_report_medicines`, `reaction_report_events` (submission, causality, corrections), all append-only.
- On the allergy record, if missing: `verification_status`, `type`, `source`, `reaction_report_id`, and `allergy_events` (confirm, refute, as events).

**Reconciliation**

- `med_reconciliations` (admission, trigger, state), `med_reconciliation_rows` (derived, snapshot at confirmation), `med_reconciliation_events` (decision recorded, discrepancy explained, query, confirmed, reopened, closed).

**No change** to how a prescription is written, changed or cancelled, or to the administration record's charting. The ward chip and the stop date are read through a server function.

**RLS probes:**

| Actor                                                                                                                      | Access                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Pharmacy staff with the permission the action needs                                                                        | As Section 8 allows                                                                                                |
| Prescriber who may prescribe for the patient                                                                               | Their patients' interaction outcomes, review prompts, allergy entries to confirm, reconciliation rows; answer them |
| Nurse on the ward                                                                                                          | Record a suspected reaction; read the review-due chip and stop date for their ward's patients; nothing else new    |
| AMS committee member (hub assignment)                                                                                      | Stewardship figures and the review list for the hospital; send an Antibiotic review query; no other pharmacy page  |
| Infection prevention lead                                                                                                  | Stewardship figures by ward; patient list only with Lab Phase 5's infection prevention right                       |
| Pharmacist reviewer, CSO, AMS chair                                                                                        | Clinical content: draft and sign as CC-2 allows                                                                    |
| Hospital admin                                                                                                             | Go-live pages and settings only; no PHI                                                                            |
| Reception, lab staff, other hospitals, superadmin without break-glass, anonymous                                           | Denied                                                                                                             |
| Any client, direct INSERT, UPDATE or DELETE                                                                                | Denied everywhere                                                                                                  |
| Any actor, UPDATE or DELETE on signatures, reaction records and events, allergy events, AMS reviews, reconciliation events | Denied, including the service-role path                                                                            |

---

## 8. Server actions

All follow the house contract: Zod with a client key → `getUser()` → AAL2 → permission → hospital scope → one transaction → PII-redacted log → audit → `{ id, serverTime }`.

| Group          | Action                                                                                                                                       | Who may call it                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Content        | `saveContentDraft`, `sendForSigning`, `signContentEntry`, `withdrawContentEntry`, `importCandidates`, `matchCandidate`, `reportEntryProblem` | The signers CC-2 names; `reportEntryProblem` by any holder of `pharmacy.review` or a prescriber             |
| Interactions   | `checkInteractions` (read, inside the dialog and the review)                                                                                 | The prescribing permission; `pharmacy.view`                                                                 |
| Interactions   | `recordInteractionAnswer` (through the existing check store)                                                                                 | The prescribing permission                                                                                  |
| Interactions   | `acceptInteraction` (a review event with a reason)                                                                                           | `pharmacy.review`                                                                                           |
| Interventions  | `addPcneCodes`, `correctPcneCodes`                                                                                                           | `pharmacy.review`                                                                                           |
| Interventions  | `getInterventionReport`, `downloadInterventionCounts`                                                                                        | `pharmacy.review`, `pharmacy.manage`; download needs `pharmacy.manage`                                      |
| Interventions  | `draftCheckNote`                                                                                                                             | `pharmacy.review`                                                                                           |
| Stewardship    | `getStewardship`, `getReviewList`                                                                                                            | `pharmacy.review`, AMS committee right, infection prevention right (figures only)                           |
| Stewardship    | `sendAntibioticReviewQuery`                                                                                                                  | `pharmacy.review`, AMS committee right                                                                      |
| Stewardship    | `recordAmsReview`                                                                                                                            | The prescribing permission, for that patient                                                                |
| Reactions      | `recordSuspectedReaction`, `correctReaction`                                                                                                 | `pharmacy.dispense`, `pharmacy.review`, the prescribing permission, a nurse on the patient's ward or clinic |
| Reactions      | `assessCausality`                                                                                                                            | `pharmacy.review`, the prescribing permission                                                               |
| Reactions      | `printReactionReport`, `copyReactionReport`, `recordReportSubmitted`, `closeReportNotSubmitted`                                              | `pharmacy.review`, the prescribing permission                                                               |
| Reactions      | `confirmAllergy`, `refuteAllergy`                                                                                                            | The prescribing permission, for that patient                                                                |
| Reconciliation | `openReconciliation` (where D-PH3-16 needs a button)                                                                                         | The prescribing permission                                                                                  |
| Reconciliation | `recordForHomeDecision` (opens prescribing for Change, Restart and New)                                                                      | The prescribing permission                                                                                  |
| Reconciliation | `explainDiscrepancy`, `addDiscrepancy`, `confirmReconciliation`, `closeReconciliation`, `printMedicinesSheet`                                | `pharmacy.review`; print also by the prescriber                                                             |
| Going live     | `switchClinicalFlagOn`, `switchClinicalFlagOff`                                                                                              | Phase 1 go-live mechanism                                                                                   |

A test enumerates every action and proves none writes to a prescription row.

---

## 9. Steps and gates

**Three merges.**

- Steps 0 to 6: signed content, interactions, intervention review.
- Steps 7 and 8: stewardship, reactions.
- Steps 9 and 10: reconciliation, hardening, going live.

Between merges the slice runs at the test hospital only.

### Step 0: Discovery and baseline (no product changes)

- **Q1** Has Phase 1 merged its first two merges? Is Step 9 built or deferred? Is Phase 2 on the branch? Verify P1 to P15. **If Phase 1's first two merges are missing, STOP.**
- **Q2** The check store (P2): how an outcome, answer and override are stored per line, and whether one more check fits with no schema change. The exact levels and their names in the dialog.
- **Q3** The allergy record (P4, P5): every field, how a class matches a medicine, whether verification status and type exist, and how many entries per hospital are uncoded. Report how the prescribing allergy check reads it.
- **Q4** The drug-class map (P6): its content and status.
- **Q5** Medicines before admission and admission decisions (P7): where they are stored, per admission, and how they link to catalogue ids.
- **Q6** The cultures check (P8) and the lab's culture orders and reports (P9): how a culture order is found for a patient and a time.
- **Q7** The administration record (P10): how a dose links to a prescription line, and whether "a dose was given on this day" can be read.
- **Q8** Discharge (P11): is there a discharge event, a discharge summary, or a discharge prescription type? Report exactly. This decides D-PH3-16.
- **Q9** Indication, duration and stop date on a prescription (P12).
- **Q10** Phase 1's query codes and answer reasons as signed at the test hospital (P13).
- **Q11** Hub committees and assignments (P15): can an AMS committee and an infection prevention lead be named?
- **Q12** For the last 30 days at the test hospital:
  - antibiotic prescriptions by medicine;
  - how many medicines on the list have no AWaRe match after the candidate import (dry run);
  - how many candidate interaction pairs match the list (dry run);
  - how many queries by type.

  This goes in front of the CSO at GATE A.

- **Q13** The NDA form in use at the pilot site (the pharmacy in charge provides the current form). Report its fields in order.
- **Q14** Check that Playwright, axe, the visual harness, the fake clock and the RLS probe harness work. If not, STOP and flag.

**STOP 0.** Report Q1 to Q14, the baselines (screenshots of the dialog's Check step, the review screen, the problem card, the allergy section), and the dry-run counts.

### Step 1: GATE A proposal (documents only)

Write `docs/pharmacy/phase-3/gate-a-proposal.md`:

- the content model (6.1) with the signing flow drawn out;
- the interaction check (6.2) with worked examples from Q12's matched pairs (invented fixture patients);
- the AWaRe match report and the review settings to sign;
- the reaction record, the allergy change (D-PH3-13) and the NDA field map from Q13;
- the reconciliation trigger (D-PH3-16) and table with a worked discharge;
- the intervention report and the PCNE map;
- the permission map, version 4 (Appendix A);
- every pack (Appendix D) as unsigned;
- every string (Appendix B) as `draft`;
- the hazard log (Appendix C);
- annotated wireframes from boards 3.1 to 3.8, corrected per 5.11;
- the decision table (Section 14) with a signature block;
- the ADR drafts.

**STOP 1.** Nothing proceeds without signatures from Fadhul, the pharmacist reviewer, and (for stewardship) the AMS chair or the CSO's recorded exception.

### Step 2: Data layer

Migrations from Section 7, triggers, RLS and the probe table. Scenarios:

- **S1** Every Phase 1 test passes unchanged.
- **S2** Every RLS probe row holds.
- **S3** No UPDATE or DELETE succeeds on any immutable table, including through the service role.
- **S4** Existing allergy entries keep their meaning after the migration (D-PH3-13), and the prescribing allergy check returns the same results on a fixture of 50 entries.

**STOP 2.**

### Step 3: Engines (pure, no UI)

CC, IX, IV, AR, AM and MR, each with tests. Scenarios:

- **S5** The IX-10 properties hold.
- **S6** A withdrawn entry never fires (CC-4).
- **S7** A suppressed pair returns at Note with the earlier answer (IX-7).
- **S8** AM-3 gives review due on the signed day in local time across midnight and a daylight-free calendar; the clock moves 30 days and no review closes by itself.
- **S9** AM-4's figures equal a hand count on a fixture ward.
- **S10** MR-3 finds exactly the fixture's planted discrepancies and no others.
- **S11** AR-5's print carries no name, number, phone or address (scan).

**STOP 3.**

### Step 4: Clinical content (5.2)

Packs, drafts, signing, imports, matching, withdrawal. Scenarios:

- **S12** The candidate import writes drafts with the counts from Q12; a second import does nothing.
- **S13** An entry with no source cannot be sent for signing; an author cannot be the only signer where another exists.
- **S14** The AWaRe pack is signed with its edition; unmatched antibiotics show as "AWaRe group not known".
- **S15** A class-level entry waits for the drug-class map.

**STOP 4.**

### Step 5: Interactions (5.3, behind `pharmacyInteractions`)

Scenarios:

- **S16** Prescribing a medicine that forms a signed pair with an active line shows the alert at its level, with its source and version; the answer is stored.
- **S17** The same pair for the same patient within the suppression window shows as a Note naming the earlier answer.
- **S18** A pair with a medicine supplied within the look-back fires; outside it, it does not.
- **S19** At review, the alert shows the prescriber's answer; the pharmacist asks the prescriber, and the query of type Interaction carries the alert text.
- **S20** A pair that fired only at review says "Fired after prescribing".
- **S21** A restricted pair shows the class, not the medicine, to a viewer without access; the answer is still required.
- **S22** The notice shows the pair count and version; with the flag off it is the Phase 1 notice.
- **S23** No signed pair: the dialog says interactions are not checked, as in the baseline.

**STOP 5.** Report scenarios, the dialog timing against the budget, and screenshots.

### Step 6: Intervention review (5.4, behind `pharmacyInterventionReview`). First merge.

Scenarios:

- **S24** The figures equal a hand count over the fixture's queries.
- **S25** "A check worth signing" shows only types at or above the signed minimum, and nothing while the minimum is unsigned.
- **S26** PCNE codes added to a query are proposed from its outcome and confirmed by a person.
- **S27** The CSV has no patient identifiers.

**STOP 6.**

### Step 7: Stewardship (5.5, behind `pharmacyStewardship`)

Scenarios:

- **S28** A Watch antibiotic reaches its signed review day: the patient appears on To review today, the problem card shows Review due, the administration record shows the chip.
- **S29** The prescriber answers Continue with a stop date: the date shows on the card and the record; the prescription is unchanged.
- **S30** The prescriber answers Switch to oral: prescribing opens; the old line is replaced through the existing action.
- **S31** An Antibiotic review query is answered by the review action and closes.
- **S32** A ward with no charted doses shows courses, not days of therapy.
- **S33** A Reserve antibiotic is pharmacist-first where the hospital signed that reason.
- **S34** The infection prevention lead sees figures by ward and no patient list without their right.

**STOP 7.**

### Step 8: Suspected reactions (5.6, behind `pharmacyReactions`). Second merge.

Scenarios:

- **S35** A reaction recorded at the window adds an unconfirmed allergy entry; the next prescription of that medicine shows the allergy check as suspected.
- **S36** A prescriber confirms it as intolerance; another refutes a different one with a reason; both stay in the record.
- **S37** The report prints in the confirmed field order with initials, age and sex only.
- **S38** The report stays "to submit" until recorded as submitted with route, date and reference.
- **S39** The same-batch figure counts the fixture batch's patients; nothing is quarantined.
- **S40** A reaction to a medicine in a restricted class is masked for a viewer without access, and the allergy check still fires.

**STOP 8.**

### Step 9: Reconciliation at discharge (5.7, 5.8, behind `pharmacyReconciliation`)

Scenarios:

- **S41** A fixture admission with five medicines before admission, two held and one new: the table shows every row and the planted discrepancies.
- **S42** "Confirm the list" stays off until every row has a decision.
- **S43** Confirming sends the lines to the window, writes the patient's list (if built) with stopped medicines marked, and prints the sheet.
- **S44** The patient leaves before confirmation: the reconciliation stays open, marked, and closes only by a person.
- **S45** A prescriber changes a discharge line after confirmation: the row reopens and the pharmacist is told.
- **S46** A discharge prescription with an open discrepancy is pharmacist-first where the hospital signed that reason.

**STOP 9.**

### Step 10: Hardening and going live. Third merge.

- axe on every new route at 1440, 1024 and 390;
- the red and no-green tests;
- the budgets;
- the harness plans for boards 3.1 to 3.8;
- the banned-term scan over every new template;
- the user guide sections (pharmacist reviewer, prescriber, AMS committee, pharmacy in charge);
- the hazard log, completed;
- ADRs;
- the final report.

Scenarios:

- **S47** Each flag goes live only with its conditions and a second approver.
- **S48** With all five flags off, behaviour matches the Phase 1 baseline.

**STOP 10.** Report Section 13 and the Definition of Done.

---

## 10. Accessibility

- WCAG 2.2 AA at 1440, 1280, 1024 and 390. 44 px targets on touch.
- Each alert is a region with a heading naming the pair; its level is a word, not only a colour.
- The by-ward bars have a text alternative naming each ward's counts, and a "view as table" toggle.
- AWaRe tags carry their word; the three series colours are never the only signal.
- A suspected allergy is announced as "suspected" by assistive technology wherever it appears.
- Reduced motion: no animated charts.

## 11. Budgets

As Section 4, plus: added JS for the Clinical group under 60 KB gzipped; the stewardship and interventions pages stream their tables.

## 12. Security, privacy, audit

- Every signature, alert answer, review, reaction, allergy confirmation, reconciliation event, print and download is audited.
- **The reaction report** leaves MedSync only as a person's print or copy, with initials, age and sex. Every print and copy is logged.
- **Stewardship and intervention figures** carry no patient identifiers. Drill-down is permission-checked.
- **Restricted classes** are masked in alerts, reactions, reconciliation rows and stewardship lists for viewers without access (IX-8, AR-8).
- **The governance gap stays documented.** Fadhul holds superadmin, CSO and audit-reviewer roles. Signing content as CSO and approving a go-live as the second approver must be two different people wherever a second person exists.

## 13. Numbers to report at the final STOP

| Metric                                                                                   | Baseline | Target                                  | Result |
| ---------------------------------------------------------------------------------------- | -------- | --------------------------------------- | ------ |
| Alerts fired from unsigned or withdrawn entries                                          | none     | 0                                       |        |
| Interaction entries in force, by severity                                                | 0        | Report                                  |        |
| Queries without a code                                                                   | Step 0   | 0                                       |        |
| Queries answered or withdrawn with a reason, share                                       | Step 0   | Report                                  |        |
| Wards with antibiotic use by AWaRe group visible                                         | 0        | All wards with antibiotic prescriptions |        |
| Antibiotics on the list with no AWaRe decision                                           | Step 0   | 0                                       |        |
| Reviews due with no answer, oldest age                                                   | none     | Report                                  |        |
| Discharges of admitted patients on medicines with a confirmed list, or a recorded reason | Step 0   | All                                     |        |
| Suspected reactions without an unconfirmed allergy entry                                 | none     | 0                                       |        |
| Reaction reports with a name, number or address on the print                             | none     | 0                                       |        |
| Allergy entries deleted                                                                  | none     | 0                                       |        |
| Prescription rows written by this slice                                                  | none     | 0                                       |        |
| Interaction check p95 in the dialog                                                      | none     | < 150 ms                                |        |
| axe serious or critical                                                                  | Step 0   | 0                                       |        |
| Red added; anything green                                                                | none     | 0                                       |        |

## 14. GATE A decisions (Fadhul owns; recommendations given)

| #        | Decision                                  | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-PH3-01 | Interaction content (roadmap D-PH-14)     | A short signed list of severe pairs within the hospital's list first, drafted from the candidate file by the pharmacist reviewer. Price a licensed knowledge base before widening; see the research notes for the licensing comparison                                                                                                                                                                                                                         |
| D-PH3-02 | What a pair is checked against            | IX-2: active lines, charted doses within a signed window, supplies within a signed look-back, and admission medicines marked Continue. Not checked: medicines bought outside unless recorded, herbal medicines                                                                                                                                                                                                                                                 |
| D-PH3-03 | Severity list and levels                  | Three values, Contraindicated, Serious and Monitor, each mapped by a signed mapping. Proposed, following the evidence that tiering raises acceptance and that most interruptive alerts are overridden: **Contraindicated → Stop** (overridden with a reason, as every Stop already is); **Serious → Note**, shown first in the Check step with no answer needed; **Monitor → shown to the pharmacist at review only**. All three show at review                |
| D-PH3-04 | Pairs and forms                           | A pair applies to every form and strength of the medicine unless the entry names a route (for example, a topical form excluded)                                                                                                                                                                                                                                                                                                                                |
| D-PH3-05 | Suppression                               | A pair answered for a patient shows as a Note naming the answer within a signed window. No opened source tested this; it is a judgement against alert fatigue, to be watched in intervention review                                                                                                                                                                                                                                                            |
| D-PH3-06 | AWaRe edition and scope                   | The WHO AWaRe classification 2025 (WHO reference B09489, 5 Sep 2025: 93 Access, 145 Watch, 30 Reserve, and 116 fixed-dose combinations not recommended), imported and signed as a whole, keyed by medicine and route. A new edition is a new import and signature. Decide whether TB programme medicines and topical, eye and ear products count in the shares; proposed: TB medicines counted and shown separately, topical products excluded                 |
| D-PH3-07 | Review intervals                          | Signed per AWaRe group by the AMS chair and the CSO, from the hospital's policy. None proposed                                                                                                                                                                                                                                                                                                                                                                 |
| D-PH3-08 | Reserve antibiotics                       | A pharmacist-first lane reason where the hospital signs it, and listed on the stewardship page. Never a hard stop                                                                                                                                                                                                                                                                                                                                              |
| D-PH3-09 | Stop dates                                | Typed by the prescriber on the review; shown on the card and the administration record; never written to the prescription                                                                                                                                                                                                                                                                                                                                      |
| D-PH3-10 | Days of therapy                           | From charted doses only. No DDD in this slice                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D-PH3-11 | Who sees stewardship                      | Pharmacists, the AMS committee members named in the hub, the infection prevention lead (figures; patient list only with the IPC right)                                                                                                                                                                                                                                                                                                                         |
| D-PH3-12 | "A check worth signing" minimum           | Signed per hospital by the CSO. Nothing shows while unsigned                                                                                                                                                                                                                                                                                                                                                                                                   |
| D-PH3-13 | The allergy record                        | Add verification status (unconfirmed, confirmed, refuted) and type (allergy, intolerance, unknown) if missing. Existing entries become confirmed with type unknown, stated in the proposal                                                                                                                                                                                                                                                                     |
| D-PH3-14 | Who may record a suspected reaction       | Pharmacists, pharmacy technicians, prescribers and nurses. Only prescribers confirm or refute                                                                                                                                                                                                                                                                                                                                                                  |
| D-PH3-15 | The NDA report                            | Printed or copied as text with initials, age and sex; submitted by a person by the Authority's route; the submission recorded. No electronic submission in this slice                                                                                                                                                                                                                                                                                          |
| D-PH3-16 | What starts a reconciliation              | A discharge event if one exists; otherwise a prescription marked for discharge for an admitted patient, or a Prepare medicines for home action on the plan                                                                                                                                                                                                                                                                                                     |
| D-PH3-17 | Who confirms the list                     | A pharmacist. Every line decided by a prescriber. The discharge is never held                                                                                                                                                                                                                                                                                                                                                                                  |
| D-PH3-18 | The patient's copy                        | The signed-in list (if Phase 1 Step 9 is built) and the printed sheet. No message names a medicine                                                                                                                                                                                                                                                                                                                                                             |
| D-PH3-19 | PCNE                                      | PCNE V9.1 is current, and its terms forbid commercial use without the PCNE Board's written permission (drp@pcne.org). **Ask for permission now.** Build the optional coding behind the content gate: the PCNE pack cannot be signed until a permission reference is recorded on it, and until then no PCNE label appears anywhere in the product. Reports use the hospital's own codes in every case                                                           |
| D-PH3-21 | Restricted antibiotics                    | A signed per-hospital list (proposed from the research: every WHO Reserve antibiotic, plus the referral-hospital specialist items the Ministry's committee guideline names, such as meropenem and piperacillin with tazobactam) with who may authorise. MedSync records whether and when authorisation was obtained and never delays the first dose (the guideline's own rule). The existing co-signature rules stay the hospital's choice; nothing new blocks |
| D-PH3-22 | Reporting timelines                       | The training manual says serious within 24 to 48 hours and others within 15 days; the 2025 committee guideline says 48 hours and 7 days; the regulations set none. Proposed for the due-by display: 48 hours and 7 days, the newer and stricter text, confirmed with the Authority. A display only                                                                                                                                                             |
| D-PH3-23 | Batch cluster rule                        | Signed per hospital by the pharmacy in charge and the CSO: how many reports on one batch, in what period, list the batch. None proposed                                                                                                                                                                                                                                                                                                                        |
| D-PH3-24 | Patient identifiers on the report         | Initials, age, sex and a MedSync reference. The national handbook asks for the full name, village and phone; whether sending them is lawful without consent under the Data Protection and Privacy Act 2019 is a legal question (Appendix E). Until answered, initials only                                                                                                                                                                                     |
| D-PH3-25 | The patient's own record versus a message | The signed-in medicines list and the printed sheet are the patient's own record and may name medicines. SMS and push are messages and never do. The CSO signs this reading                                                                                                                                                                                                                                                                                     |
| D-PH3-20 | The permission map, version 4             | Appendix A: no new `pharmacy.*` permission; AMS committee and infection prevention rights as hub assignments                                                                                                                                                                                                                                                                                                                                                   |
| E-PH3-01 | No knowledge-base client                  | No external interaction database is called in this slice                                                                                                                                                                                                                                                                                                                                                                                                       |
| E-PH3-02 | One check store                           | Interaction answers live with the other prescribing checks                                                                                                                                                                                                                                                                                                                                                                                                     |
| E-PH3-03 | One allergy record                        | Reactions write to it; no second list                                                                                                                                                                                                                                                                                                                                                                                                                          |
| E-PH3-04 | Delivery                                  | Three merges; five flags, each live on its own                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 15. Out of scope (leave clean seams)

- **Roadmap Phase 4:** refills, partner pharmacies, the e-pharmacy.
- **Not here at all:**
  - a licensed interaction knowledge base, or any external drug-database call;
  - dose checking and verified regimens as checks;
  - DDD;
  - susceptibility interpretation;
  - automatic stop of any medicine;
  - electronic submission to the National Drug Authority or VigiFlow;
  - AEFI (vaccine) reporting;
  - herbal medicine interaction content;
  - reconciliation at admission and transfer beyond what clerking already records;
  - compounding;
  - the mobile app.

## 16. ADRs (numbers from the ledger)

- Signed clinical content: packs, versions, two signatures, withdrawal.
- Interaction checks from a signed list; what "partial" means; suppression.
- AWaRe tags as signed data; review prompts that inform.
- Days of therapy from charted doses; why no DDD.
- Suspected reactions and the allergy record's verification status.
- The NDA report as a print, with initials only.
- Reconciliation at discharge: trigger, rows, discrepancies, confirmation.
- Intervention review and the PCNE map.

## 17. Definition of Done

- [ ] Every pharmacist intervention in the pilot period is coded, and answered or withdrawn with a reason.
- [ ] Antibiotic use by AWaRe group is visible by ward, with review prompts reaching prescribers on the signed day.
- [ ] No interaction alert has fired from unsigned or withdrawn content (test and audit query).
- [ ] Every discharge of an admitted patient on medicines in the pilot period has a confirmed list or a recorded reason.
- [ ] Every suspected reaction is on the allergy record as unconfirmed and has a printed report; none carries a name.
- [ ] No action in this slice writes to a prescription (test). No allergy entry deleted.
- [ ] axe clean; no red added; nothing green.
- [ ] Strings in `content/` as `draft`; no `*_COPY_STATUS` edited.
- [ ] Handbook sections, ADRs, hazard log and final report exist. Each of the three diffs on `feat/pharmacy-clinical` is reviewable.

---

## Appendix A: Permission map, version 4 (for signature at GATE A)

Phase 1's map and Phase 2's version 3 stand. This slice adds no `pharmacy.*` permission. It adds two **hub-assignment rights** outside the pharmacy set, and uses the prescribing permission for answers.

| Who                                          | New in this slice                                                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pharmacist (`pharmacy.review`)               | Clinical content drafting; interaction decisions at review; PCNE coding; stewardship pages; Antibiotic review queries; record and assess reactions; confirm reconciliations |
| Pharmacy technician                          | Record a suspected reaction; read stewardship figures. No confirmation of a reconciliation; no content signing                                                              |
| Pharmacist reviewer (named, roadmap D-PH-13) | Sign interaction entries, the AWaRe pack, the PCNE map, reconciliation rules                                                                                                |
| CSO                                          | Sign alert levels, review settings, copy, the "check worth signing" minimum                                                                                                 |
| AMS committee member (hub assignment)        | Stewardship figures and review list; Antibiotic review queries; the chair co-signs stewardship settings                                                                     |
| Infection prevention lead (hub assignment)   | Stewardship figures by ward; patient list only with Lab Phase 5's infection prevention right                                                                                |
| Prescriber (existing permission)             | Answer interaction alerts, reviews and reconciliation decisions; confirm or refute allergies; assess causality; record reactions                                            |
| Nurse                                        | Record a suspected reaction for a patient on their ward or clinic; read the review-due chip and stop date                                                                   |
| Hospital admin                               | Go-live pages; no PHI                                                                                                                                                       |
| Superadmin                                   | Nothing, without break-glass                                                                                                                                                |

## Appendix B: Copy to be signed (all `draft`)

| Key                           | Text                                                                                                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notice, partial               | MedSync checks {n} signed interaction pairs between medicines on this hospital's list. It does not check medicines bought outside, herbal medicines, or pairs not yet signed. No alert does not mean no interaction. |
| Dialog, nothing fired         | Checked against {n} signed pairs. Medicines bought outside and herbal medicines are not checked.                                                                                                                     |
| Dialog, levels unsigned       | Interaction alert levels are not signed yet.                                                                                                                                                                         |
| Suppressed                    | Answered {date} by {cadre}: {reason}.                                                                                                                                                                                |
| Fired after prescribing       | Fired after prescribing. The prescriber has not seen this alert.                                                                                                                                                     |
| Restricted pair               | This alert involves a medicine in a restricted class. Ask a clinician who may see this patient's full record.                                                                                                        |
| Report a problem              | Report a problem with this entry                                                                                                                                                                                     |
| Review due chip               | Antibiotic review due                                                                                                                                                                                                |
| Review card                   | This hospital asks the team to review {group} antibiotics on day {n}.                                                                                                                                                |
| Stop date help                | A date, not a dose. It shows on the administration record.                                                                                                                                                           |
| No culture                    | Not sent                                                                                                                                                                                                             |
| Culture sent                  | Sent {date}, no result yet                                                                                                                                                                                           |
| Culture released              | Result released {date}                                                                                                                                                                                               |
| DOT unavailable               | Days of therapy need charted doses.                                                                                                                                                                                  |
| AWaRe unknown                 | AWaRe group not known                                                                                                                                                                                                |
| Reaction, emergency           | If the patient is unwell now, use Emergency. This form is a record and treats nobody.                                                                                                                                |
| Reaction, allergy line        | {medicine}: {reaction} (suspected, {date})                                                                                                                                                                           |
| Reaction, not sent            | MedSync does not send the report. Submit it by the National Drug Authority's own route, then record it here.                                                                                                         |
| Allergy, restricted           | A medicine in a restricted class: suspected reaction                                                                                                                                                                 |
| Reconciliation, no decision   | {medicine} has no decision for home.                                                                                                                                                                                 |
| Reconciliation, gone home     | Patient has gone home. The list was not confirmed before discharge.                                                                                                                                                  |
| Sheet title                   | Medicines after your stay                                                                                                                                                                                            |
| Sheet, stopped                | Stopped in hospital. Do not restart the tablets you have at home.                                                                                                                                                    |
| Sheet, paused                 | Paused. Your doctor will tell you when to restart.                                                                                                                                                                   |
| Patient list heading          | After your hospital stay                                                                                                                                                                                             |
| Message, list updated         | Your medicines list was updated after your hospital stay. Open MedSync to see it.                                                                                                                                    |
| Check worth signing, unsigned | The minimum for this suggestion is not set. The CSO sets it.                                                                                                                                                         |

## Appendix C: Hazard log seed (complete at Step 1; close each with a test)

| #     | Hazard                                                                             | Control                                                                          |
| ----- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| H3-1  | An unsigned or wrong interaction entry fires and changes treatment                 | Law 3; CC-1, CC-4; S6                                                            |
| H3-2  | A severe interaction is missed because staff think MedSync checks everything       | Law 4; the notice with the pair count; IX-9                                      |
| H3-3  | Alert fatigue: prescribers override everything                                     | Severe pairs only; signed levels; suppression; intervention review of overrides  |
| H3-4  | A restricted medicine is revealed through an alert, a reaction or a reconciliation | IX-8, AR-8; RLS probes                                                           |
| H3-5  | An antibiotic is stopped because a prompt looked like an order                     | Informs only; the prescriber chooses; Law 2                                      |
| H3-6  | A review prompt never reaches anyone and the antibiotic runs on                    | The review list stays until answered; the ward chip; Law 11                      |
| H3-7  | A suspected allergy is treated as confirmed for ever, denying a needed antibiotic  | Unconfirmed status; prescriber confirm or refute; the record kept                |
| H3-8  | A suspected allergy is ignored because it is "only suspected"                      | The allergy check fires on unconfirmed entries at the same level (AR-4)          |
| H3-9  | A report leaves MedSync with a patient's name                                      | AR-5 scan; print-only route                                                      |
| H3-10 | A patient restarts a medicine stopped in hospital                                  | Reconciliation; "do not restart" wording; the sheet                              |
| H3-11 | A held medicine is never restarted                                                 | The discrepancy "held, no decision for home"; confirmation blocked until decided |
| H3-12 | Reconciliation holds a patient in hospital                                         | Law 5; MR-6                                                                      |
| H3-13 | A pharmacist's coded pattern becomes a check without review                        | IV-5 shows only; CSO signs a check through the content flow                      |
| H3-14 | AWaRe tag wrong for a combination product                                          | Exact match only; unmatched shown as unknown; signed pack                        |

## Appendix D: Sign-off packs (templates only; propose no clinical values)

| Pack                                                                                          | Signed by                                                                     | While unsigned                                                                 |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Interaction pairs (each entry)                                                                | Pharmacist reviewer + CSO                                                     | The entry does not fire; the notice counts only signed entries                 |
| Alert levels and suppression window                                                           | CSO + pharmacist reviewer                                                     | Nothing fires; the dialog says levels are not signed                           |
| Look-back windows (charted, supplied, default)                                                | Pharmacist reviewer + CSO                                                     | The check uses active lines and Continue admission medicines only, and says so |
| AWaRe pack (edition)                                                                          | Pharmacist reviewer + AMS chair                                               | Stewardship cannot go live                                                     |
| Antibiotic review settings (interval per group, groups prompted, no-culture window, day rule) | AMS chair + CSO                                                               | No review prompt; the page shows figures only                                  |
| Lane reasons added here                                                                       | CSO + pharmacist reviewer                                                     | The reasons do not fire                                                        |
| Query codes added here (Interaction, Antibiotic review, Reconciliation)                       | Pharmacist reviewer + CSO                                                     | The codes are not offered                                                      |
| The PCNE map                                                                                  | Pharmacist reviewer + CSO, with the PCNE Board's permission reference         | PCNE coding is hidden and no PCNE label appears                                |
| Restricted antibiotics list and who may authorise                                             | AMS chair + CSO (the hospital's Medicines and Therapeutics Committee decides) | The list is not shown; nothing else changes                                    |
| Reporting timelines and the batch cluster rule                                                | CSO + pharmacy in charge                                                      | No due-by is shown; no batch is listed by cluster                              |
| Reconciliation discrepancy flags R1 to R14 (each on or off)                                   | Pharmacist reviewer + CSO                                                     | Reconciliation cannot go live                                                  |
| "A check worth signing" minimum                                                               | CSO                                                                           | Nothing shows                                                                  |
| Reaction copy, report routes, field map                                                       | Pharmacy in charge (field map) + CSO (copy)                                   | Reactions cannot go live                                                       |
| Reconciliation rules (discrepancy explanations, close reasons) and wording                    | Pharmacist reviewer + CSO                                                     | Reconciliation cannot go live                                                  |
| Patient wording (sheet, list, message)                                                        | CSO + pharmacist reviewer                                                     | The sheet prints with "Wording not yet signed" and the list does not update    |

## Appendix E: Legal and licensing questions, and sources (re-verify at build time)

**Questions for the lawyer, the regulator and licensors.** Questions 1 to 3 need a written interim answer before `pharmacyReactions` goes live; 4 and 5 before PCNE coding or any licensed content is used; 6 before the reconciled list names medicines on the patient's page.

1. Is a report carrying initials, age, sex and a facility reference lawful and sufficient under the Pharmacovigilance Regulations 2014 (S.I. 37, reg. 6) and their 2021 amendment (S.I. 41)? Is sending the full name, village and phone the national handbook asks for lawful without consent under the Data Protection and Privacy Act 2019?
2. Who carries the reporting duty (the individual health professional, under reg. 6) and whether a committee or facility submission satisfies it; whether it covers only serious events.
3. Which timeline binds (24 to 48 hours and 15 days in the training manual, or 48 hours and 7 days in the 2025 committee guideline); neither is in the regulations.
4. **PCNE:** written permission from the PCNE Board for use of the classification in a commercial product.
5. **Interaction content:** written consent from the University of Liverpool before any of its interaction content is used or quoted in the product; a request for quotation to the licensed knowledge-base vendors (no prices are published); confirmation that FDA label text and the ONC high-priority list may be cited as sources for MedSync's own wording.
6. Whether the patient's signed-in list and printed sheet naming medicines are consistent with the hospital's data-protection basis (D-PH3-25).
7. Whether internal reaction and medication-error records are protected from disciplinary use, and how long they are kept.

**Sources.** Every source, its URL, the date it was opened and what was and was not read is in `docs/pharmacy/phase-3/content/PHARMACY-PHASE-3-RESEARCH.md`. The ones this prompt rests on:

- WHO AWaRe classification of antibiotics, 2025 (B09489), and _The WHO AWaRe antibiotic book_ (2022).
- United Nations General Assembly resolution 79/2 (2024), paragraph 64: at least 70 per cent of overall human antibiotic use from the Access group globally by 2030.
- Ministry of Health Uganda, _Guidelines for Medicines and Therapeutics Committees_, 2nd edition, June 2025: the facility instrument for stewardship, the adverse reaction database, WHO-UMC causality, restricted antibiotics and annual point-prevalence surveys.
- Uganda National Action Plan on Antimicrobial Resistance, 2024/25 to 2028/29.
- Uganda Clinical Guidelines 2023 and EMHSLU 2023 (AWaRe described, not tagged per medicine).
- The 2020 to 2021 point-prevalence survey of 13 Ugandan hospitals (_Antibiotics_, 2022).
- CDC _Core Elements of Hospital Antibiotic Stewardship Programs_; WHO _Antimicrobial stewardship programmes in health-care facilities in low- and middle-income countries: a practical toolkit_ (2019); WHO _Policy guidance on integrated antimicrobial stewardship activities_ (2021); the WHO point-prevalence survey method.
- National Drug Policy and Authority (Pharmacovigilance) Regulations 2014 and the 2021 Amendment; the MoH and NDA _Pharmacovigilance Trainee Handbook_ (2020) with the national combined adverse reaction form; the WHO-UMC e-reporting page for Uganda; the Med Safety app.
- WHO-UMC causality assessment system; ICH E2A seriousness criteria; HL7 FHIR AllergyIntolerance (R5); NICE CG183 drug allergy.
- WHO High 5s _Assuring Medication Accuracy at Transitions in Care_ SOP; WHO _Medication Safety in Transitions of Care_ (2019).
- PCNE _Classification for Drug-Related Problems_ V9.1 (re-issued January 2026).
- Interaction evidence: the ONC high-priority list (Phansalkar 2012) and non-interruptive list (2013); van der Sijs, Paterno, Nanji, Strom and others on alert design; FDA labels via DailyMed; the University of Liverpool HIV and TB interaction resources (cited, not embedded). The NLM RxNav interaction API was discontinued on or about 2 January 2024.

**Not read, and needed before signing:** the interaction tables in the Uganda Consolidated HIV Guidelines 2022 (pp. 92 to 93, 163 to 170, 195, 202, 281); the NDA's _Guidelines on Detecting and Reporting ADRs in Uganda_; the NDA market complaint form; the WHO 2025 Expert Committee report on AWaRe changes; NICE NG5 section 1.2; the High 5s implementation guide.

**Note:** one Ministry document hosted on cphl.go.ug (a 2020 surveillance guideline PDF) contained embedded text addressed to AI readers. It was not followed. Read sources from official copies.
