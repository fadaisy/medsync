# PROMPT: Clerking desk v2, Summary and Impression (steps 08 and 09): the composed summary, the reasoning board and the evidence matrix

> **For Claude Code.** Work in the release folder (`~/Desktop/medsync-release`). Cut a new branch, `feat/clerking-summary-impression`, from `feat/clerking-exam-v2`, or from `main` once the examination build has merged. Confirm which at STOP 0.
>
> First copy this pack into `docs/emr/clerking-v2/summary-impression/`:
>
> - this prompt;
> - `clerking-diagnosis-catalogue.v1.json` (**MS-EMR-DX-CAT-001**): the reasoning layer for each diagnosis, the differential suggestion rules, the engine rules, the composer and the open decisions;
> - `diagnosis-terms.v1.1-addendum.json`: the proposed additions to REF-DX-TERMS (`data/emr/diagnosis-terms.v1.json`), with ICD-11 codes **unverified**;
> - `test-catalogue.v1.1-addendum.json`: the proposed additions to the default test menu (`data/emr/test-catalogue.v1.json`);
> - `prototype/`: `Prototype2.dc.html` (the design authority), `Prototype.dc.html` (the simpler first round) and their parts (`Header.dc.html`, `Rail.dc.html`, `Note.dc.html`). They run on the same canvas runtime as the v2 and examination prototypes;
> - `catalogue-build/`: the generator and validator that produced the catalogue, so it can be rebuilt byte-identically;
> - `CATALOGUE-REVIEW.md`: the source check and the independent clinical review of the catalogue.
>
> **Mode:** gated, as in clerking v2 and the examination build. There are eight phases (0 to 7), and each ends in a **STOP**.
>
> - **Documents** use Stage 1: draft, critique against the checklist, revise (at most two passes), present, STOP.
> - **Code** uses Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
> - Self-refinement never replaces a real check.
>
> **The CSO is Fadhul.** These all need his signature before they are clinically live:
>
> - every diagnosis profile, rule, reference entry and named scale in MS-EMR-DX-CAT-001;
> - the summary and impression composer wording;
> - every new term and test;
> - every new clinical write path.
>
> **Companions.** This prompt extends `PROMPT-CLERKING-DESK-V2.md` (history), `exam/PROMPT-CLERKING-EXAM-V2.md` (examination) and `mobile/PROMPT-CLERKING-MOBILE.md` (phone). Everything there still applies unless this prompt says otherwise. On steps 08 and 09, this prompt wins. PROMPT-CLERKING-DESK-V2 §5.11 ("Summary, Impression and Plan keep their current function") is superseded for 08 and 09. Step 10 Plan keeps its current behaviour, apart from the "Add to plan" link in Section 5.3.

---

## 0. What we are building, in one paragraph

Steps 08 and 09 are still the v1 bodies inside the v2 shell.

- **Summary** is an optional free-text box labelled "Notes". The section bar says "Auto" (hard-coded in `lib/clerking/status.ts:129`), yet nothing is composed, and the note has no Summary block: `SECTION_BLOCK.summary` points at the examination block (`lib/clerking/compose.ts:457-468`).
- **Impression** has three problems:
  - it asks for the status (Working, Final, Differential) _before_ the diagnosis is picked;
  - it lets the same diagnosis in twice (production, 28 Sep 2026, Patient Three-3);
  - it shows diagnoses as a read-only list, with no link to anything the history or examination found.

This build replaces both steps with the design the CSO approved as Prototype 2:

- **Summary:**
  - a **one-liner** (who, onset, course and a syndrome in the clinician's own words);
  - a **composed paragraph**, built by fixed rules from what is recorded, with every sentence traceable to its step;
  - **what goes in**, as tickboxes;
  - **"Not asked yet, relevant to your differential"**, answered in place and written to its owner step;
  - an explicit **review** that any later change invalidates, with a list of what changed.
- **Impression:**
  - a **leading diagnosis** (the primary diagnosis of the visit), with the findings that support it and those **not yet explained by any diagnosis**;
  - a **differential**, ranked by the clinician, with Likely, Possible or Unlikely. **Must-not-miss** diagnoses stay pinned until marked Unlikely **with a reason**;
  - an **evidence matrix** of findings against diagnoses;
  - a **details drawer** per diagnosis: evidence, questions not yet asked, onset, severity graded by the clinician, tests that would help decide, and the clinician's reasoning;
  - **decision-support suggestions** from the history and examination, which the clinician adds by hand.

All reasoning content comes from one catalogue (data, not code). Suggestions never become a record until the clinician accepts them.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt. Report every disagreement at STOP 0.
2. **The prototype is the design authority** for layout, interaction and wording. It is not code to paste.
   - `prototype/Prototype2.dc.html` holds both steps in one component: the Summary screen (`isSummary`) and the Impression screen (`isImpression`).
   - Its Tweaks switch **Role** (Senior consultant or Intern) and **Start** (Filled or Empty). They show the co-signature path and the empty Impression.
   - Read its logic class for behaviour (the map is in Appendix A).
   - `Prototype.dc.html` is the simpler first round. Use it only where Prototype 2 is silent.
3. **The catalogue wins over the prototype on content.**
   - The prototype hard-codes one illustrative case (hypothermia, a 76-year-old man), 16 diagnoses and pre-accepted evidence. The catalogue holds 272 diagnoses with _suggested_ evidence.
   - **Production shows catalogue evidence as Suggested (dotted), never pre-accepted** (D-SI-04). Section 5 lists every other difference from the prototype.
4. **Specs,** in this order:
   - `PROMPT-CLERKING-DESK-V2.md` (laws, shell, Flags panel, note, D-CV-01 to 16);
   - `exam/PROMPT-CLERKING-EXAM-V2.md` (E1 to E8, D-EX-01 to 22);
   - `docs/emr/emr-clinical-reference.md` (templates, minimum to sign, standard visit);
   - `SPEC-CLINICAL-FACT-CONTRACT-v1.md` (conditions, restricted classes);
   - `DESIGN-medsync.md` and the Chroma tokens (per D-CV-11).
5. **Code (read before Phase 1):**

   | Area                     | Where                                                                                                                                                                                                                                                                  |
   | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | v2 desk shell            | `components/clerking/clerking-desk.tsx` (steps 08 and 09 render the v1 `SectionBody` at `:531-557`); `components/clerking/model.ts` (`V1_SECTION` `:55-60`, `BLURB` `:41-52`, `sectionText()` `:105-134`, `deriveDesk()` `:175-252`)                                   |
   | v1 bodies being replaced | `components/emr/desk/sections.tsx`: `ImpressionBody` `:798-933`; the s12 narrative `:149-174`; `PlanBody` `:942-1078` (kept)                                                                                                                                           |
   | Picker                   | `components/emr/desk/pickers.tsx` (`DiagnosisPicker` `:108-219`, `DxPick`, `TermRow`); `components/emr/desk/search.ts` (`DxTerm`, `rank`)                                                                                                                              |
   | Term loading             | `app/doctor/encounters/[encounterId]/_desk/actions.ts:16-31`; `lib/emr/read/terms.ts:34-62`                                                                                                                                                                            |
   | Diagnosis writes         | `lib/emr/actions/facts.ts:261` (`RecordEncounterDiagnosis` `:129-135`); `lib/emr/write/facts.ts`: `recordEncounterDiagnosis` `:861-925`, `insertCondition` `:756-789`, `updateProblemStatus` `:942-982`, `markFactEnteredInError` `:1325`, `currentPrimary` `:825-840` |
   | Desk handlers            | `app/doctor/encounters/[encounterId]/_desk/desk-client.tsx`: `onDiagnosis` `:647-662`, `onAddProblem` and `onConfirmCondition` `:512-576`, `onSuggestion` `:663-697`, `syncRecorded` call `:222-234`                                                                   |
   | Desk read                | `lib/emr/read/desk.ts:641-656` (`DeskDiagnosis[]`); `components/emr/desk/model.ts` (`DeskDiagnosis` `:100-107`, `VERIFICATION_WORDS` `:707-712`, `putItem` `:238-254`, `syncRecorded` `:465-490`)                                                                      |
   | Authority                | `lib/encounter/access.ts:41-70` (`canWriteFinalDiagnosis`, `requiresCosign`; `COSIGN_REQUIRED_CADRE_CODES` `:23`)                                                                                                                                                      |
   | Co-signature             | `db/schema/doctor-workspace.ts:100-140` (`clinical_cosign_requests`: `actionKind` has no diagnosis kind); `lib/emr/write/notes.ts` (`openCosignRequest` `:569-600`, `cosignNote` `:630`)                                                                               |
   | Conditions table         | `db/schema/emr.ts:655-714` (fact envelope `:267-342`); `supabase/migrations/0071_emr_record_spine.sql:737-741` (the no-mutation trigger and audit)                                                                                                                     |
   | Orders                   | `lib/emr/actions/orders.ts:59` (`placeOrders`); `db/schema/encounter.ts:201-286` (`encounter_orders`: each order needs a reason condition or reason text)                                                                                                              |
   | Note                     | `lib/emr/note-rules.ts:30-72`; `data/clerking/note-template.adult-v2.json` (s12 narrative, optional; s13 structured, required; `minimumToSign`); `components/clerking/note-pane.tsx`; `lib/clerking/compose.ts`                                                        |
   | Statuses                 | `lib/clerking/status.ts:94-133`                                                                                                                                                                                                                                        |
   | Catalogues               | `lib/clerking/catalogue.ts` (history), `lib/clerking/exam/catalogue.ts` (examination), `lib/clerking/load.ts`, `app/api/clerking/*/route.ts`, `lib/clerking/flags.ts` (`ruleIsLive` `:75-79`)                                                                          |
   | Flags                    | `lib/emr/feature.ts` (`clerkingV2LiveFor` `:41-45`, `emrPrescribingLive` `:31-34`)                                                                                                                                                                                     |
   | Related, not reused      | `lib/ncd/engine/differential.ts` (diabetes-only ranking; its score is never shown); archived per-complaint weights at tag `archive/clerkship-v1`, `docs/clinical/agent/ddx-weights/*.json` (lifted into the catalogue as suggestion lists without scores; ADR 0081)    |

---

## 2. Laws (non-negotiable)

Clerking v2 laws 1 to 14 and examination laws E1 to E8 apply unchanged. This build adds:

**SI1. Composed, never invented.**

- The summary paragraph is built by `composer.summary` rules from recorded facts only.
- An unrecorded item never appears. "Not asked" is never "no". Allergies always appear and cannot be ticked out.
- The composer never names a diagnosis. The syndrome is the clinician's own text.

**SI2. The clinician names things.**

- The syndrome and every diagnosis are the clinician's words or picks.
- MedSync suggests diagnoses only under "Also considered with these findings", labelled as decision support, and never adds one itself.
- It never ranks, scores or states a probability. Likely, Possible and Unlikely are the clinician's words.

**SI3. Suggested is not recorded.**

- Evidence suggested by the catalogue shows as a dotted "Suggested" mark.
- It is never stored, counted, written to the note or used to compute "not yet explained" until the clinician accepts it.
- Accepting is one tap on the cell, or "Accept suggested" for a whole column.

**SI4. One owner per fact.**

- Answering "Not asked yet" writes to the history step or the examination step through that step's own write path.
- Evidence refers to findings by id; it never copies them.
- The leading diagnosis and the others remain `conditions` rows written by the existing actions.

**SI5. A must-not-miss diagnosis leaves only with a reason.**

- It stays pinned above the rest of the differential until the clinician marks it Unlikely and writes a reason (at least three words, per D-DX-06).
- The reason is stored and written to the note.

**SI6. Diagnoses are append-only.**

- `conditions` rows are never updated in place (trigger `conditions_no_mutation`).
- Changing status, rank or verification writes a new version (`updateProblemStatus`).
- Removing is "entered in error" with a reason (`markFactEnteredInError`).
- Reordering and likelihood, which the table does not model, live in the note draft (Section 8) and are snapshotted at signing.

**SI7. Final needs a senior, visibly.**

- `canWriteFinalDiagnosis` decides.
- Today a junior's Final becomes Working with only a transient warning (`facts.ts:873-876`). Instead, the choice is shown as "Final · awaiting senior co-signature" and raises a co-signature request for that diagnosis (D-SI-09).

**SI8. A review is explicit and any change invalidates it.**

- "Mark as reviewed" stores the actor, the time and a hash of the composed inputs.
- Any later change to those inputs turns the status to "Changed since review" and lists what changed.

**SI9. Restricted stays restricted.**

- Restricted diagnoses (hiv, tb, mental_health, sexual_reproductive_health) are suggested only to viewers with access to that class.
- Their evidence rows and asks follow the same rule.
- They never appear in patient-facing text.

**SI10. Unsigned content does not run.**

- A profile, rule, reference entry or named scale that is not signed is not evaluated.
- The diagnosis still works as a record. Its reasoning aids show "Awaiting sign-off".

---

## 3. What is wrong today (production, 28 Sep 2026, Patient Three-3, MS-2026-00004)

| #    | Finding                                                                                                                                                                         | Severity           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| S-1  | Summary is an optional "Notes" box. The section bar says "Auto" (`status.ts:129`) though nothing is composed. The note has no Summary block.                                    | Clinical quality   |
| S-2  | Impression asks for Working, Final or Differential _before_ the diagnosis is chosen, then resets the choice. There is no way to change a status afterwards from this step.      | Usability          |
| S-3  | The same diagnosis can be added twice. The screenshot shows "Diabetes, type not yet determined" twice (Primary and Working). `recordEncounterDiagnosis` has no duplicate guard. | **Data integrity** |
| S-4  | A junior's "Final" is silently recorded as Working (`facts.ts:873-876`). There is no diagnosis-level co-signature.                                                              | Governance         |
| S-5  | Diagnoses are a read-only list: no reorder, no likelihood, no removal with a reason from the step, and no change of leading diagnosis.                                          | Usability          |
| S-6  | Nothing links a diagnosis to what the history or examination found. The note cannot say why.                                                                                    | Clinical quality   |
| S-7  | Must-not-miss diagnoses have no status. A dangerous alternative can vanish without a recorded reason.                                                                           | **Safety**         |
| S-8  | Nothing prompts the questions or examination items that would separate the leading diagnosis from its alternatives.                                                             | Clinical quality   |
| S-9  | Deferral is offered only when the list is empty and cannot be undone from the step.                                                                                             | Usability          |
| S-10 | _Confirm at Phase 0:_ the "Required 1 of 3" count shows Impression as not done even when a diagnosis exists, if the s13 mirror has not synced.                                  | Correctness        |

Confirm each at Phase 0 against code and data. Write failing tests for S-1 (no Summary block), S-3 (a duplicate term accepted) and S-4 (Final silently downgraded with no visible pending state).

---

## 4. Design direction (as approved in Prototype 2)

**Place.** Steps 08 and 09 of the v2 shell. The header, left rail, section bar, Flags panel, note pane and Sign bar are v2's. The centre card changes. The details drawer overlays the note column.

**Summary card anatomy (top to bottom)**

1. **Header:**
   - `[08] Summary` and "The case in one paragraph, composed from your entries as you change them."
   - A status pill: **Composed, not reviewed** (neutral, clock), **Reviewed by you** (neutral, tick) or **Changed since review** (amber, triangle).
   - "Step 8 of 10".
2. **Changed since your review at HH:MM** (only after a review is invalidated): an amber-tint list of changes, each **Added**, **Left out** or **Edited** with its text.
3. **One-liner:**
   - Chips: **Who** (age, sex) and **Onset** (acute or chronic, with the duration from the complaint).
   - **Course**, dashed "Not recorded" until the complaint records better, worse or unchanged.
   - **Syndrome**, a teal-edged free-text field with the placeholder "In your words, e.g. hypothermia with bradycardia".
   - The caption "The syndrome is always your words. MedSync never names a syndrome or a diagnosis for you."
4. **Mode switch:** **Composed** or **In my words**, with a note on the right ("From steps 01 02 03 04 06 07 · updates as you change them").
5. **Composed paragraph:**
   - Each sentence ends in mono step tags (`01`, `07`). They are real buttons.
   - Selecting a tag highlights the sentence and opens the **inspector** under the paragraph: the source title, a tickbox row for each item behind the sentence, and "Open {step}".
   - A word count follows.
6. **In my words:**
   - An amber banner: "Your words go into the note. Later changes in the steps will not update them." with **Back to composed**.
   - A textarea, prefilled from the composed text the first time.
7. **What goes in:**
   - Three columns: History and background; Examination; Pertinent negatives.
   - Each shows "n of m", with a tickbox row per item and its step tag.
   - Out-of-range values are bold, in the critical AA colour, with their arrow.
   - The allergy row is locked ("always in").
8. **Not asked yet, relevant to your differential** (only when the Impression has diagnoses with unanswered `ask` targets):
   - one row per target: the label, "· for {diagnoses}", the step tag, and **No** / **Yes** (or the item's own response words for examination targets).
   - It says where the answer goes: "It goes into the history step and the summary."
9. **Not recorded, so not stated:** gaps with links to their steps (course, family history, air or oxygen, and so on).
10. **Actions:** **Reset to composed** (ghost) and **Mark as reviewed** (primary; "Review again" when changed). Once reviewed, it reads "Reviewed by you at HH:MM. Any change asks for review again."
11. **Footer:** "← Examination" and "Next: Impression →".

**Impression card anatomy**

1. **Header:** `[09] Impression`, "Your leading diagnosis, what supports it, and what else it could be." and "Step 9 of 10".
2. **Leading card.** It has one of three states.
   - **Filled:**
     - a teal star and "LEADING · PRIMARY FOR THIS VISIT";
     - a status segmented control, **Working** or **Final** (**Final (senior)** for juniors);
     - the name (18 px, weight 500) with its sub-line (ICD-11 code, or "As typed · symptom-level, not coded");
     - an amber pill "Final · awaiting senior co-signature" when that applies;
     - two columns: **Supports it** (accepted For chips, each removable) and **Not yet explained by any diagnosis** (dashed chips; tapping one links it to the leading diagnosis);
     - a meta line: onset · your grading · "n tests in plan" · "n must-not-miss need a reason";
     - **Move to differential** and **Details**.
   - **Deferred:** "DIAGNOSIS DEFERRED", the reason, and **Undo**.
   - **Empty:**
     - "No leading diagnosis yet" and the guidance text;
     - a **Defer the diagnosis, with the reason** form.
3. **Differential:**
   - The header shows the count, with a **List** or **Evidence matrix** switch.
   - **List:**
     - the caption "Must-not-miss stay on top until you mark them unlikely, with a reason.";
     - each row has:
       - up and down buttons;
       - its rank;
       - the name, a **Must not miss** pill (amber, shield) and "n for · m against";
       - a basis line (For, Against, Not asked, To decide);
       - **Details**, **Make leading** and **Remove**;
       - a Likely, Possible or Unlikely control;
       - for a must-not-miss marked Unlikely, an inline required reason field.
   - **Matrix:** findings as rows and diagnoses as columns. Section 5.4 describes it.
4. **Also considered with these findings:** a dashed box of `+ {diagnosis}` chips, labelled decision support.
5. **Also this visit:** secondary diagnoses. Each row has its name and sub-line, **Details**, **Working** or **Final**, a **Problem list** tick, and remove.
6. **Add a diagnosis:**
   - an "Add as" control: **Leading** (only when there is none), **Differential** or **Also this visit**;
   - the picker, with "Already on this visit" rows disabled and "Add "…" as typed, not coded" for free text.
7. **Footer:** "← Summary" and "Next: Plan →".

**Details drawer** (380 px, over the note column, `role="dialog"`)

- **Header:** the role ("Leading · primary", "Differential · must not miss", "Also this visit"), the name and its sub-line.
- **Evidence:** For and Against chips, with "Change in the matrix".
- **Not asked yet:** the diagnosis's unanswered asks, with No and Yes.
- **Onset:** Acute, Chronic or Acute on chronic.
- **Severity,** per the profile:
  - none;
  - the clinician's options;
  - a classifier result shown with "Use as the grade";
  - a named scale.
  - Caption: "Your grading. MedSync does not grade automatically without a signed rule."
- **Tests that would help decide:** each with **Add to plan** or **In plan**.
- **Why is it unlikely?** (a must-not-miss marked Unlikely).
- **Your reasoning:** a textarea.
- **Footer:** **Make leading** (differential only) and **Done**.

**Rules**

1. **The leading diagnosis is the primary diagnosis.** There is one per visit. Changing it is one action that writes both new versions.
2. **Add first, set status after** (S-2).
3. **Say it once.** Answers go to their owners (SI4). A diagnosis can be in only one place: leading, differential or also this visit.
4. **Suggested is not recorded** (SI3).
5. **Nothing ranked by the machine** (SI2).
6. **Pinned until reasoned** (SI5).
7. **Flags unchanged.** Must-not-miss is a property of a diagnosis, not an alert. The Flags panel is not changed by this build.

**Budgets** (measured at Phase 0, met by Phase 7)

| Measure                                                                   | Target                                                                                  |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Taps to review a composed summary when nothing needs changing             | 1                                                                                       |
| Taps to record a leading diagnosis from search (typing excluded)          | ≤ 3                                                                                     |
| Taps to add three differentials from suggestions and set their likelihood | ≤ 6                                                                                     |
| Taps to accept all suggested evidence for one diagnosis                   | 1                                                                                       |
| Taps to mark a must-not-miss unlikely (reason typing excluded)            | 1                                                                                       |
| Recompute of composer, unexplained and suggestions after a tap            | < 16 ms at 4× CPU throttle                                                              |
| Matrix render, 12 diagnoses × 30 findings                                 | < 50 ms p95                                                                             |
| Drawer open                                                               | < 100 ms                                                                                |
| Page-level vertical scroll on 1440×900                                    | none; the centre card scrolls inside its column                                         |
| JS added to the clerking route                                            | ≤ 40 KB gzipped, excluding the catalogue                                                |
| MS-EMR-DX-CAT-001                                                         | report gzipped size; fetched once per session and cached, like the other two catalogues |

---

## 5. Interface specification

### 5.1 Summary: one-liner and composition

- **Who:** age from the date of birth, and sex from the record, as "76, male". If either is missing: "Age not recorded" or "Sex not recorded" (dashed).
- **Onset:** from the complaint. It is "Acute" or "Chronic" with the longest recorded complaint duration ("Acute · 3 days"). Use the D-SI-02 thresholds. Never infer onset from free text.
- **Course:** from the complaint's course property if the history catalogue has one. _Confirm at Phase 0_; if absent, propose it as a v1.3 history addendum. Show "Not recorded" (dashed, a button that opens the inspector explaining where to record it).
- **Syndrome:**
  - free text of at most 120 characters, stored in the draft, never parsed or coded;
  - an empty syndrome drops the ": …" clause;
  - editing after review invalidates the review (SI8).
- **Composer** (`composer.summary` in the catalogue):
  - sentence order: one-liner, history positives, pertinent negatives, examination, NEWS2, allergies;
  - positives come from the complaint and its answered properties;
  - negatives are review-of-systems "no" answers and "not asked" questions answered No here;
  - examination uses the examination composer's clauses (`lib/clerking/exam/compose.ts`) for included findings, in examination order;
  - vital signs come from the saved set that the note reads (D-EX-11);
  - use the patient's recorded sex for the pronouns (he, she); if not recorded, use "the patient";
  - en-GB throughout.
- **Inclusion defaults:**
  - every positive history answer and every positive examination finding is included;
  - pertinent negatives default to the review-of-systems "no" answers in systems that contain a positive, or that are named by a diagnosis on the board (`ask` targets answered No);
  - other "no" answers are listed but unticked;
  - vital signs outside the NEWS2 zero band are included; the others are listed and unticked;
  - the allergy row is always included (locked).
- **Inspector:**
  - opens under the paragraph, never as a popover over text;
  - its tickbox rows are the same inclusion flags as the columns (one state);
  - "Open {step}" navigates to the owner step and item.
- **In my words:**
  - the first switch copies the composed text; later switches keep the typed text;
  - when the composed text changes while the clinician's own words are shown, the banner adds: "The composed summary has changed since you wrote this. Compare".
  - Compare opens a side-by-side diff; nothing merges automatically.
- **Review:**
  - stores `{reviewedBy, reviewedAt, inputsHash}`;
  - the hash covers inclusion flags, the syndrome, the mode, the typed words and the composed text;
  - the diff list compares the stored snapshot with now: **Added**, **Left out**, **Edited**.
- **Section-bar status for 08** (replacing "Auto"):
  - Summary is the current step: **Composed**, **Reviewed** or **Changed**;
  - Summary is not the current step: **Not reviewed** (open), **Reviewed** (done) or **Changed** (open).
  - Summary stays optional for signing (the template's `minimumToSign` is unchanged). D-SI-08 decides whether an unreviewed summary is a sign-time prompt.

### 5.2 Summary: Not asked yet

- **Source:** the union of `ask` targets from every profile on the board (leading, differential and also this visit), minus answered ones, grouped by target. "· for Sepsis, Cold exposure" names the diagnoses that asked.
- **History targets** (`symptom`, `red_flag`, `past_condition`, `family_condition`, `medicine`, `social`) answer No or Yes and write through the history step's write path. A red flag can be answered only when its symptom is yes; otherwise the row asks the symptom first.
- **Examination targets** (`exam_item`, `vital`, `classifier`) show "Examine" and open the examination step at that item. They are not answered here. The examination owns its answer model.
- The same list appears in the details drawer, filtered to that diagnosis.
- **Restricted targets** follow SI9.

### 5.3 Impression: leading, differential, also this visit, add

- **Add a diagnosis:**
  - The picker is the existing `DiagnosisPicker`, with the term index extended by the REF-DX-TERMS v1.1 addendum once signed.
  - **Add as** defaults to Leading when there is none, otherwise Differential.
  - **Enter** adds the first available result, or the typed text as "as typed, not coded".
  - A term already anywhere on the board is disabled with "Already on this visit". The server enforces it too (S-3): `recordEncounterDiagnosis` rejects an active encounter diagnosis with the same `termId`, or with the same normalised typed text, as `conflict` "Already on this visit".
- **Writes:**
  - Leading → `recordEncounterDiagnosis`, `rank: primary`, `verification: provisional`.
  - Also this visit → `rank: secondary`, `provisional`.
  - Differential → `rank: secondary`, `verification: differential`.
  - **Add to problem list** keeps its current default: the term's chronic flag, or the profile's `problem_list: offer_when_final`.
- **Status:**
  - Working and Final on the leading row and on also-this-visit rows go through `updateProblemStatus`: `verification: provisional` or `confirmed`.
  - A junior choosing Final → SI7.
- **Make leading:**
  - One server action (`setLeadingDiagnosis`, Section 9) writes two versions in one transaction:
    - the old primary becomes secondary with `verification: differential`, likelihood Likely;
    - the chosen one becomes primary with `verification: provisional`.
  - The UI never shows two primaries.
- **Move to differential:** writes the leading diagnosis as secondary differential and leaves no leading diagnosis. The empty leading state shows.
- **Remove:**
  - `markFactEnteredInError` with a reason chosen from "Added by mistake", "Duplicate", "Ruled out" (this one needs text) or "Other" (needs text).
  - A removed suggestion returns to the suggestion box.
- **Likelihood:** Likely, Possible or Unlikely. Tapping the selected value clears it. It is stored in the draft (Section 8), not on the condition row.
- **Order:**
  - Up and down buttons (keyboard: Alt+↑ and Alt+↓ on a focused row).
  - Pinned must-not-miss rows cannot move below unpinned rows, and unpinned rows cannot move above pinned ones; the buttons are disabled at those edges.
  - The order is stored in the draft.
- **Must-not-miss:**
  - Pinned while `likelihood ≠ Unlikely`.
  - Choosing Unlikely shows the reason field. It is amber until filled (at least three words). The row reads "Must not miss · marked unlikely", and the leading meta line counts reasons still missing.
  - D-SI-06 decides whether signing is blocked while a reason is missing (recommendation: blocked).
- **Basis line:** built by the engine from accepted evidence plus unanswered asks and tests:
  - "For: … . Against: … . Not asked: … . To decide: … (in plan)."
  - Before anything is accepted: "Suggested: n for, m against. Open the matrix to accept."
- **Deferral:**
  - Available whenever there is no leading diagnosis.
  - Writes `{kind: "diagnosis_deferred", reason}` to s13, as today, and counts for `req.impression` (`note-rules.ts:70-72`).
  - Undo removes the item.
- **Also considered with these findings:**
  - `ddx_rules` evaluated against the encounter, filtered and ordered by `engine_rules`.
  - At most eight chips, with "Show n more".
  - Each chip's tooltip and accessible description give the rule's `why` ("Low temperature", "Chest pain").
  - Adding a chip adds it to the differential as Possible.
  - A symptom-level suggestion (for example "Hypothermia, cause not yet known") is offered for the leading slot when there is no leading diagnosis.

### 5.4 Impression: evidence matrix

- **Rows:**
  - recorded positive findings first, in the order history, examination, vital signs (only those the profiles on the board reference, plus any recorded positive, up to 30);
  - then recorded pertinent negatives referenced by a profile;
  - "Show all recorded findings" expands the list.
  - Each row header shows the finding text, its step tag and the critical styling if out of range.
  - The first column is sticky; the table scrolls horizontally inside its own frame.
- **Columns:**
  - the leading diagnosis ("LEADING", teal tag), then the differential in displayed order ("#n", "· MUST NOT MISS" in amber), then also-this-visit ("ALSO");
  - selecting a column header opens that diagnosis's drawer.
- **Cells:** each is a button whose accessible name reads "{finding} for {diagnosis}: {state}. Select to change." States:
  - blank: "·", not weighed;
  - **Suggested for:** dotted outline, "+ Suggested";
  - **Suggested against:** dotted outline, "− Suggested";
  - **For:** filled neutral (ink-100), "+ For";
  - **Against:** white with an ink-300 inset, "− Against".
  - A tap cycles: blank or suggested → For → Against → blank.
  - Colour never carries the state alone: every state has its sign and its word. No red, amber or green in cells.
- **Column footer:** "n + · m −" (accepted only) and **Accept suggested (k)**, which accepts every suggested cell in that column.
- **"Not yet explained"** is recomputed from accepted For marks under the leading diagnosis and the also-this-visit diagnoses.
- **Phone:** there is no matrix below 834 px. Evidence lives in the Details sheet as three lists (Suggested, For, Against), with the same states.

### 5.5 The note

- **Summary block:**
  - a new `BlockKey` "summary", placed between Examination and Impression;
  - `SECTION_BLOCK.summary = "summary"`;
  - it takes the composed text, or the clinician's own words.
  - Remove the "Summary: …" line appended to the examination block (`components/clerking/model.ts:121-122`).
- **Impression block:** built by `composer.impression`:
  - the leading diagnosis (status, onset, your grading, For and Against, reasoning);
  - the numbered differential (likelihood, must-not-miss reasons, counts);
  - also this visit;
  - "Not yet explained";
  - or deferral.
  - Only accepted evidence is written.
- **Plan block:** unchanged. Tests added from the drawer are real draft orders and appear through the existing order mirror.
- **Highlight:** the block of the current step is highlighted in plum (unchanged). A long Summary block is clamped to three lines when the current step is Impression, with "Show all".
- **Patient-facing text:** excludes restricted diagnoses, their evidence and restricted asks (SI9).

### 5.6 Tablet and phone

- Per the mobile prompt.
- **Tablet portrait:** the drawer becomes a right sheet at 480 px, and the matrix scrolls horizontally.
- **Phone:**
  - one step at a time;
  - Summary columns stack;
  - the inspector becomes a bottom sheet;
  - Impression shows the leading card, then the differential list (no matrix), suggestions, also this visit, then add;
  - Details opens a full-height sheet with the evidence lists (5.4);
  - the Add-as control becomes a 3-option select above the picker.
- Nothing may cover the narrative (C8).

### 5.7 Keyboard

With focus outside text fields, the v2 keys still apply. Add:

| Key           | Action                                                       |
| ------------- | ------------------------------------------------------------ |
| `r`           | Mark as reviewed (on 08)                                     |
| `m`           | Toggle List / Matrix (on 09)                                 |
| `l`, `p`, `u` | Likely / Possible / Unlikely on the focused differential row |
| Alt+↑, Alt+↓  | Move the focused row                                         |
| `d`           | Details for the focused row                                  |
| `/`           | Focus "Add a diagnosis"                                      |
| Arrow keys    | Move between matrix cells                                    |
| Space         | Cycle the focused cell                                       |
| `a`           | Accept suggested (in the focused column)                     |

Esc closes the drawer, the inspector and the picker. Focus returns to the invoking control.

### 5.8 States

- **Loading:** the reasoning catalogue loads after the note. Until it does, the Impression works as a plain list with "Loading reasoning aids…" in place of suggestions, and the matrix toggle is disabled.
- **Unsigned:** "Reasoning aids awaiting sign-off" (SI10).
- **Offline:** reuse the optimistic queue. Diagnosis writes queue and show "pending". The matrix and composer work locally.
- **Errors:** a failed write reverts the control, shows the server message ("Already on this visit", "A senior confirms the final diagnosis") and keeps the typed text.
- **Empty:**
  - no findings yet: "Nothing recorded to weigh yet. Record the history and examination first.";
  - no suggestions: hide the box.

### 5.9 Words (copy deck)

Use the prototype's wording exactly, with these fixed strings:

- "Composed, not reviewed"
- "Reviewed by you"
- "Changed since review"
- "Changed since your review at {time}"
- "Mark as reviewed"
- "Review again"
- "Reset to composed"
- "In my words"
- "Not asked yet, relevant to your differential"
- "Not recorded, so not stated"
- "Leading · primary for this visit"
- "Supports it"
- "Not yet explained by any diagnosis"
- "Everything recorded is explained by a diagnosis."
- "Move to differential"
- "Must not miss"
- "Must not miss · marked unlikely"
- "Why is it unlikely? A must-not-miss needs a reason. It goes in the note."
- "Also considered with these findings. Decision support: add only what you would consider."
- "Also this visit"
- "Already on this visit"
- "Add “{text}” as typed, not coded"
- "Final (senior)"
- "Final · awaiting senior co-signature"
- "Your grading. MedSync does not grade automatically without a signed rule."
- "Accept suggested"
- "Reasoning aids awaiting sign-off"

Never use "abnormal" or "normal" in this step (E1). Never use "probability", "score" or "confidence".

---

## 6. The catalogue (contract)

- **File:** `clerking-diagnosis-catalogue.v1.json` (MS-EMR-DX-CAT-001, 1.0.0-draft).
  - Load it once through the v2 server-side loader, validate it with a Zod schema, and serve it with its version and hash at `/api/clerking/dx-catalogue?v=<sha16>`, like the other two.
  - Add `data/clerking/dx-signoff.v1.json` in the signoff shape (`profiles`, `rules`, `referenceEntries`, `namedScales`, `withheld`).
- **Contents:** see the counts table printed by the build and repeated in `CATALOGUE-REVIEW.md`. At the time of writing: 272 profiles (85 on existing REF-DX-TERMS ids and 187 on proposed additions), 100 differential rules, 14 REF-DX entries, 10 named scales, 62 proposed tests and the engine, composer and decision blocks. Report the exact counts at STOP 0.
- **Profile fields:**
  - `category`, `kind`, `restricted_class`;
  - `onset` {allowed, default};
  - `must_not_miss` and `must_not_miss_reason`, `time_critical`;
  - `severity` {none | clinician options | classifier id | named_scale id};
  - `suggest_for`, `suggest_against` (atoms);
  - `ask` (targets);
  - `tests_to_decide` (test ids);
  - `problem_list`, `related`, `note`, `sources`, `status`.
- **Atoms:**
  - the shared rule language of the history and examination catalogues (`flag_rule_language`);
  - plus `family_condition`, `medicine` (`taking` or `not_taking`), `social` (`any_of`) and `news2_total`.
  - Extend the one evaluator. Never build a second.
- **Ids:**
  - profiles are keyed by the REF-DX-TERMS id (`dx.*`);
  - rules are `DDX-*`, references `REF-DX-*`, tests `test.*`;
  - `sym.*`, `ex.*`, `vs.*`, classifiers, `REF-FLAG-*` and `REF-EX-*` come from the other two catalogues.
  - `npm run clerking:catalogue-check` must validate all three catalogues and every id that crosses between them, and print the counts.
- **Terminology stays owned by REF-DX-TERMS.** The catalogue never holds a display name or an ICD-11 code.
  - The addendum proposes 187 terms in the exact REF-DX-TERMS shape.
  - **Every proposed ICD-11 code is unverified** (the pack was built without access to the WHO browser). Phase 1 verifies each on the WHO ICD-11 MMS browser (release in force), records the exact title and sets `status: verified`. Where no code is confident, `code` is null and the term is used "as typed, not coded" until verified.
  - Merge into the seed (`scripts/emr/gen-seed.ts`) only after signature, as a GATED migration.
- **Tests stay owned by the test catalogue.** The addendum proposes 62 tests in its shape. Each facility deactivates what it cannot do.
- **Statuses:** as in v2. Unsigned content does not run (SI10).
- **Restricted facts.** The catalogue build fails if a restricted fact (item, option, red flag, past, family, medicine or social level) is evidence on a standard diagnosis. The TypeScript catalogue check must enforce the same rule. Cross-class evidence on restricted diagnoses (7 cases, such as known HIV on TB-class terms) is allowed and shown only to viewers holding both classes, pending CSO confirmation (`CATALOGUE-REVIEW.md` §5).
- **Evidence-language gap.** The examination rule language has `grid` atoms (power, reflexes, plantars, pulses) and `panel` atoms (postural BP, both arms, PEF). The catalogue's authoring language does not yet emit them. Add them in Phase 2, then update the profiles that need them: GBS (areflexia), acute limb ischaemia and PAD (absent foot pulses), aortic dissection (inter-arm difference). Give the `inter_arm_difference` classifier result ids.
- **Must-not-miss:** 89 profiles after review. Time-critical: 86. Both are sign-off items.
- **Adding content needs no code.** Prove it with a fixture that adds one profile, one rule and one named scale.

---

## 7. Engines (pure, no I/O)

In `lib/clerking/summary/**` and `lib/clerking/impression/**`:

| Module                    | Responsibility                                                                                                                                | Minimum tests                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary/compose.ts`      | One-liner, sentences with their source tags, inclusion defaults, pronouns, allergies locked                                                   | Snapshots for the fixtures. Property tests: every included item appears; no excluded or unrecorded item appears; "not asked" never becomes "no"; allergies always present; restricted excluded from patient text |
| `summary/review.ts`       | Inputs hash, snapshot, diff (Added, Left out, Edited)                                                                                         | Any input change flips reviewed to changed; no change keeps it reviewed; the diff is exact                                                                                                                       |
| `impression/catalogue.ts` | Zod schema, indexes, signoff (`profileIsLive`, `ruleIsLive`)                                                                                  | Round-trip; every id resolves across the three catalogues; unsigned content is inert                                                                                                                             |
| `impression/board.ts`     | The board model: leading, differential (order, likelihood, reason, pinning), also; the invariants (one leading, no duplicates, pinning edges) | Pinning edges; Make leading swaps; Move to differential; duplicates rejected; restricted hidden without access                                                                                                   |
| `impression/evidence.ts`  | Atom evaluation against the encounter (reuses the flags evaluator); suggested versus accepted; accept column; "not yet explained"             | Every atom kind, positive and negative; suggestions never counted; unexplained uses accepted For only, and only leading plus also-this-visit                                                                     |
| `impression/suggest.ts`   | `ddx_rules`, filter and order per `engine_rules`, restricted filter, symptom-level logic                                                      | One fixture per rule (100), both ways; never suggests what is on the board                                                                                                                                       |
| `impression/ask.ts`       | The union of unanswered asks, grouping, answer routing descriptors                                                                            | Answered targets disappear; red flag needs its symptom; examination targets route to the examination step                                                                                                        |
| `impression/compose.ts`   | The Impression block per `composer.impression`                                                                                                | Snapshots; only accepted evidence; must-not-miss reasons written; deferral                                                                                                                                       |
| `impression/basis.ts`     | The basis line per row                                                                                                                        | Snapshots                                                                                                                                                                                                        |

**Fixtures (Phase 2):**

1. **Patient Three-3, hypothermia** (the prototype):
   - 76-year-old man, diabetes, 3 days of feeling cold and weakness, 2 days of reduced intake;
   - temperature 32.5 °C, pulse 54, BP 110/73, cool peripheries, capillary refill 3 s, dry mucous membranes, glucose 5.8.
   - Expected: DDX-HYPOTHERMIA and DDX-BRADYCARDIA suggest sepsis, hypothyroidism, myxoedema coma, hypoglycaemia, accidental hypothermia, adrenal insufficiency and others; sepsis pinned; hypoglycaemia "against: glucose 5.8" suggested.
2. **Chest pain:** 58-year-old man, exertional chest pain with sweating, BP 150/95, pulse 104. Expected: ACS, dissection, PE and pneumothorax pinned, with asks "BP in both arms", "calves" and "haemoptysis".
3. **Fever with neck stiffness:** a 34-year-old woman with HIV on antiretrovirals, fever, headache with neck stiffness, GCS 14. Expected: bacterial, cryptococcal and TB meningitis and cerebral malaria (restricted rows shown only with access).
4. **Jaundice with fever:** fever, jaundice, RUQ tenderness, pulse 118. Expected: cholangitis, severe malaria and liver abscess; asks "dark urine", "pale stools" and "alcohol".
5. **Empty and intern:** no diagnoses; an intern chooses Final. Expected: the empty state, deferral, and the co-signature pending state.
6. **Duplicate:** adding "Diabetes, type not yet determined" twice → the second is rejected (S-3).

**Property tests:**

- random boards never have two primaries or duplicate terms;
- pinning is never violated by any sequence of moves;
- accepted evidence is a subset of cells;
- the composer output never contains an unincluded finding.

---

## 8. Data

- **Draft payload:** the v2 `schema: 2` draft gains two sections.
  - **`summary`:**
    - `mode` (composed or words), `words`, `syndrome`;
    - `include`: finding ref → boolean, only where it differs from the default;
    - `review`: `{by, at, inputsHash, snapshot}`.
  - **`impression`:**
    - `order`: condition logical ids of the differential, in order;
    - `likelihood` and `reasons`: logical id → value;
    - `evidence`: logical id → finding ref → for or against (accepted only);
    - `meta`: logical id → `{onset, severity, reasoning}`;
    - `catalogueVersion`.
  - Finding refs are typed ids (`sym.*`, `sym.*#rf`, `ex.*`, `ex.*.attr=opt`, `vs.*`, `pmh:*` …), never labels.
- **Conditions** remain the record of what the diagnoses are (SI4, SI6). They commit immediately, as today, so they reach the chart and the problem list.
- **Signing** snapshots the summary and impression sections into the signed note, as the examination does. The reasoning therefore lives in the signed note content, versioned with the note.
  - No new table is needed unless Phase 0 proves one.
  - D-SI-10 decides whether a later `diagnostic_reasoning` table is wanted for analytics.
- **Old drafts:**
  - An s12 narrative opens in "In my words" with the text prefilled and "Continue in the composed format".
  - s13 items still render: existing diagnoses keep their rank and status; differentials without likelihood show none.
  - Nothing is migrated silently.
- **Orders:** "Add to plan" calls `placeOrders`, with `reasonConditionIds` set to that diagnosis's condition id (the order check requires a reason).
- **RLS:** unchanged. Every write goes through existing actions, apart from Section 9.

---

## 9. Server actions

Reuse, don't duplicate:

- `recordEncounterDiagnosis`: add the duplicate guard (S-3);
- `updateProblemStatus`;
- `markFactEnteredInError`;
- `saveNoteDraft`: the payload gains the summary and impression sections, with a version check;
- `signNote`;
- `placeOrders`;
- the history and examination write paths.

Add only what Phase 0 proves missing, under the house contract:

- `'use server'`, Zod, AAL2, scope and cadre checks;
- one transaction, one audit row, an idempotent client key;
- a `{ id, serverTime }` return.

Likely candidates:

- **`setLeadingDiagnosis(encounterId, conditionLogicalId)`:** two versions in one transaction; the old primary becomes secondary differential.
- **`requestDiagnosisCosign(conditionLogicalId)`:** adds `confirm_diagnosis` to `clinical_cosign_requests.actionKind` (migration **0084**, GATED). The senior's inbox shows it with the evidence. Approving calls `updateProblemStatus(verification: confirmed)`.

Decide both at GATE A.

---

## 10. Accessibility, motion, colour

- **Standard:** WCAG 2.2 AA in light and dark.
- **Targets:** 44×44 px on touch. Segmented options and matrix cells may be 26 to 30 px tall on desktop pointer only.
- **Segmented controls:** radio groups (`role="radiogroup"`, `aria-checked`) named by their purpose ("Likelihood", "Status", "Add as").
- **Matrix:** a real `<table>` with row headers (findings) and column headers (diagnoses). Cells are buttons with full names (5.4). Arrow keys move between cells.
- **Drawer:** `role="dialog"`, labelled by the diagnosis name, with a focus trap. Esc closes it and returns focus.
- **Inspector:** a disclosure panel. The step tags carry `aria-expanded`.
- **Live regions (polite):** the summary status pill, the leading meta line and the unexplained list.
- **Colour:**
  - teal marks buttons, selected controls, the leading star and "In plan";
  - plum marks place only (current step, current note block);
  - amber is caution: must-not-miss, a missing reason, "Changed since review", co-signature pending;
  - red appears only for out-of-range values carried from the examination (critical AA text with an arrow) and the Emergency button;
  - For and Against are neutral greys, always with + or − and the word;
  - no left-edge bars;
  - extend the red-scarcity tests to every new component.
- **Motion:**
  - `cubic-bezier(0.16, 1, 0.3, 1)`, 150 ms for controls and 250 ms for the drawer;
  - no animated reordering beyond a 150 ms position transition;
  - reduced motion honoured.

---

## 11. Phases and gates

### Phase 0: Discovery and baseline (no product changes)

- **Q1** The branch state: is the examination build merged? Is `CLERKING_V2` on anywhere?
- **Q2** How s12 and s13 are stored and rendered today; confirm S-1 to S-10. Count drafts with an s12 narrative and signed notes with more than one encounter diagnosis.
- **Q3** `recordEncounterDiagnosis`: confirm there is no duplicate guard, and count duplicates in production data (same encounter, same term, both active).
- **Q4** The co-signature model: can `clinical_cosign_requests` carry a diagnosis? What migration is needed?
- **Q5** `updateProblemStatus`: can it change rank (primary to secondary) and verification in one version? Can two versions (a swap) be written in one transaction?
- **Q6** The flags evaluator: list the atoms it supports. Propose how `family_condition`, `medicine`, `social` and `news2_total` are added.
- **Q7** Does the history catalogue have a course property (better, worse, unchanged)? If not, draft the v1.3 addendum item.
- **Q8** REF-DX-TERMS seed path: confirm `scripts/emr/gen-seed.ts` and the uuidV5 namespace, and how a v1.1 addendum becomes a GATED migration.
- **Q9** Restricted access: what decides whether a viewer "has access" to hiv, tb, mental_health and sexual_reproductive_health? `canSeeRestricted` is hard-coded true for the treating clinician (`desk-load.ts:310`); state the real rule.
- **Q10** `placeOrders` from the drawer: confirm `reasonConditionIds` for a differential (unconfirmed) condition is allowed.
- **Q11** The note's "Required n of 3" counting (S-10).
- **Q12** Existing keyboard handling in the desk; any conflicts with 5.7.

**Baseline:**

- screenshots of steps 08 and 09 at 390×844, 834×1194 and 1440×900, light and dark;
- tap counts for the fixtures' impressions in the current UI;
- failing tests for S-1, S-3 and S-4.

**STOP 0.** Report Q1–Q12, the baseline, the failing tests and the catalogue counts.

### Phase 1: GATE A (summary and impression) proposal (documents only)

Write `docs/emr/clerking-v2/summary-impression/gate-a-proposal.md` containing:

- the port plan: the component list, reuse of `DiagnosisPicker`, the matrix as a table, the drawer, and the note blocks;
- the payload schema, old-draft handling, and the server actions of Section 9 with their migrations;
- **the clinical sign-off pack:**
  - every profile by category (must-not-miss, time-critical, severity, asks, tests), as a reviewable table;
  - the 100 rules with their `why` and suggestion lists;
  - the REF-DX entries and the named scales;
  - the 187 proposed terms with their **verified** ICD-11 codes and titles, read on the WHO browser (never from memory);
  - the 62 proposed tests;
  - `decisions_needed` (D-DX-01 to 10);
  - the items flagged in `CATALOGUE-REVIEW.md`;
- the composer wording for both blocks, with the six fixture snapshots;
- the test plan;
- the decision table (Section 15) with a signature block.

**STOP 1.** Nothing proceeds without signatures.

### Phase 2: Catalogue and engines (pure)

Section 7 modules, Zod schemas, fixtures and property tests. Extend `npm run clerking:catalogue-check` to all three catalogues and the addenda, including the restricted-fact rule. Add `grid` and `panel` atoms to the catalogue language (Section 6) and update the profiles that need them. CI runs the check.

**STOP 2.** Report:

- test counts;
- rule coverage (100, both ways);
- atom coverage (every kind);
- property-test results;
- the fixture snapshots;
- catalogue sizes.

### Phase 3: Summary (behind `CLERKING_V2`)

The one-liner, the composer and inspector, In my words, What goes in, Not recorded, review and diff, the section-bar statuses, and the note Summary block.

**STOP 3.** Report:

- screenshots against Prototype 2's Summary (light and dark);
- composer snapshots;
- the review-invalidation matrix;
- axe with 0 serious or critical issues;
- red-scarcity tests;
- flag-off screenshots identical to the baseline.

### Phase 4: Impression board (list)

The leading card (three states), status and co-signature, add with the duplicate guard, also this visit, the differential list (order, likelihood, pinning, reasons), Make leading, Move to differential, Remove with reason, deferral, and the drawer without evidence.

**STOP 4.** Report:

- screenshots against Prototype 2's Impression (list, filled and empty; Role = Intern);
- the action matrix (every write proven, versions checked in the database);
- S-3 and S-4 tests green;
- the tap budgets for fixtures 1 and 2.

### Phase 5: Evidence, suggestions, asks

The matrix (suggested and accepted, accept column), the unexplained computation, the basis lines, the drawer evidence, the suggestion box, "Not asked yet" in Summary and the drawer with answer routing, and "Add to plan".

**STOP 5.** Report:

- screenshots of the matrix and drawer;
- fixtures 1 to 4 end to end in Playwright (suggestions, asks answered and routed, evidence accepted, note text);
- restricted filtering proven with two viewers;
- matrix performance.

### Phase 6: Note, signing, audit, old drafts

The Impression block, sign-time snapshot, sign-time checks (D-SI-06, D-SI-08), co-signature inbox integration, problem-list offers, old drafts, patient-facing exclusion, and audit rows.

**STOP 6.** Report:

- signed-note snapshots;
- co-signature round trip;
- old-draft screenshots;
- patient print without restricted content;
- audit rows.

### Phase 7: Hardening and a clinician trial

- the budgets;
- tablet and phone (5.6);
- offline;
- dark mode;
- keyboard;
- ADRs;
- a timed trial with three to five clinicians on fixtures 1, 2 and 4, comparing the old and new steps. Report median time, taps, keystrokes, must-not-miss diagnoses considered versus missed, and the clinicians' comments on the suggestions.

**STOP 7 (final).** The Section 14 table, filled in.

---

## 12. Security, privacy, audit

- AAL2, hospital scope, reception blocked.
- Every diagnosis write, status change, swap, removal (with reason), co-signature request and decision, review, and accepted evidence is audited through the existing audit tables.
- Draft content is encrypted as today.
- Restricted diagnoses, their evidence rows and their asks:
  - carry lock marks;
  - appear in clinical views only for viewers with access;
  - are excluded from patient prints, SMS, push and exports;
  - are never suggested to a viewer without access (SI9).
- The typed syndrome and reasoning are clinical free text: encrypted at rest like other narrative fields, excluded from analytics exports.

## 13. Performance budgets

As in Section 4. Also:

- a fixed query count per render;
- the reasoning catalogue is indexed once per session (profile by id, rules by atom type, asks by target);
- no layout shift when the suggestion box, reason field or drawer appears.

---

## 14. Numbers to report at the final STOP

| Metric                                                                          | Baseline | Target                | Result |
| ------------------------------------------------------------------------------- | -------- | --------------------- | ------ |
| Duplicate encounter diagnoses possible                                          | P0       | 0                     |        |
| Junior "Final" recorded without a visible pending state                         | P0       | 0                     |        |
| Summary steps showing "Auto" with nothing composed                              | P0       | 0                     |        |
| Must-not-miss diagnoses left the differential without a reason                  | —        | 0                     |        |
| Suggested evidence written to the note without acceptance                       | —        | 0                     |        |
| Unrecorded or excluded items in the composed summary                            | —        | 0                     |        |
| Profiles and rules live on unsigned content                                     | —        | 0                     |        |
| Restricted suggestions shown to a viewer without access                         | —        | 0                     |        |
| Rules with positive and negative fixtures                                       | —        | 100 of 100            |        |
| Profiles rendering (leading, differential, also, drawer)                        | —        | 272 of 272            |        |
| Proposed terms with a verified ICD-11 code, or explicitly uncoded               | —        | 187 of 187            |        |
| Taps to review a summary / record a leading diagnosis / add three differentials | P0       | 1 / ≤ 3 / ≤ 6         |        |
| Recompute after a tap (4× throttle)                                             | —        | < 16 ms               |        |
| axe serious or critical                                                         | P0       | 0                     |        |
| JS added / catalogue gzipped                                                    | —        | ≤ 40 KB / report      |        |
| Clinician trial: median time for 08 + 09, old and new                           | P0       | report the difference |        |
| Clinician trial: must-not-miss considered versus missed                         | P0       | report                |        |

---

## 15. GATE A (summary and impression) decisions (Fadhul owns; recommendations given)

| #             | Decision                        | Recommendation                                                                                                                                                                                                                      |
| ------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-SI-01       | Design authority                | Prototype 2 (both steps, both Tweaks) defines layout and interaction; the catalogue defines content; the repo wins on mechanics.                                                                                                    |
| D-SI-02       | Onset words                     | "Acute" when the longest recorded complaint duration is under 3 weeks, "Subacute" from 3 to 12 weeks, "Chronic" over 12 weeks. The thresholds are a REF entry (`REF-SI-ONSET`), draft until signed.                                 |
| D-SI-03       | Syndrome                        | Free text of at most 120 characters, never parsed, never suggested.                                                                                                                                                                 |
| D-SI-04       | Evidence                        | Suggested marks are dotted and never stored until accepted (D-DX-01). The prototype's pre-accepted marks are illustrative only.                                                                                                     |
| D-SI-05       | Leading = primary               | One leading diagnosis per visit, and it is the primary. Swaps are one action (`setLeadingDiagnosis`). Move to differential leaves the visit without a leading diagnosis until one is chosen or the diagnosis is deferred.           |
| D-SI-06       | Must-not-miss reason at signing | Signing is blocked while any must-not-miss is Unlikely without a reason. The Sign bar says which.                                                                                                                                   |
| D-SI-07       | Likelihood words                | Likely, Possible, Unlikely. No numbers, no scores, no colours.                                                                                                                                                                      |
| D-SI-08       | Unreviewed summary at signing   | A sign-time prompt ("Summary not reviewed"), not a block. The Summary stays optional in `minimumToSign`.                                                                                                                            |
| D-SI-09       | Diagnosis co-signature          | A junior's Final shows "Final · awaiting senior co-signature", stores Working, and raises a `confirm_diagnosis` co-signature request (migration 0084, GATED). The senior approves in the co-signature inbox; approval writes Final. |
| D-SI-10       | Reasoning storage               | In the signed note content (versioned with the note). No new table now. Revisit for analytics after 3 months of use.                                                                                                                |
| D-SI-11       | Not asked yet                   | History targets are answered in place and written to the history step. Examination targets navigate to the examination step (never answered here).                                                                                  |
| D-SI-12       | Suggestion display              | At most eight chips, rule order, must-not-miss first within a rule, restricted filtered. Symptom-level terms are offered for the leading slot only when empty.                                                                      |
| D-SI-13       | Remove reasons                  | "Added by mistake", "Duplicate", "Ruled out" (text), "Other" (text).                                                                                                                                                                |
| D-SI-14       | Matrix on phones                | None below 834 px; evidence lists in the Details sheet.                                                                                                                                                                             |
| D-SI-15       | Terms and tests                 | Merge the addenda only after ICD-11 verification and signature, as GATED seed migrations (D-DX-04, D-DX-05).                                                                                                                        |
| D-DX-01 to 10 | Catalogue decisions             | As listed in the catalogue's `decisions_needed`.                                                                                                                                                                                    |

**Prerequisites:** D-CV-01 to D-CV-16, D-EX-01 to D-EX-22, D-EMR-01, D-EMR-13 and D-CFC-09.

---

## 16. Out of scope (leave clean seams)

- **Machine ranking:** any score or probability. The NCD diabetes ranker stays diabetes-only, and its score is never shown.
- **Results-driven evidence:** lab and imaging results as matrix rows. This needs the results link. The atoms are ready (`lab` atom reserved).
- **Computed severities** for named scales (Child-Pugh, KDIGO, GOLD, NYHA): shown as choices only (D-DX-09).
- **Other reasoning rounds:** paediatric and obstetric reasoning (D-DX-10), and the mental state examination.
- **Step 10 Plan redesign:** the next prompt (orders by diagnosis, management plans, safety-netting, follow-up).
- **Differential analytics:** the missed-diagnosis audit and must-not-miss dashboards.

## 17. ADRs (next free numbers from 0178)

- 0178: Summary composed from the record; syndrome in the clinician's words; review invalidated by change.
- 0179: The reasoning catalogue (MS-EMR-DX-CAT-001): data, not code; suggested versus accepted evidence.
- 0180: Leading diagnosis as primary; differential likelihood and order in the note; must-not-miss pinned until reasoned.
- 0181: Diagnosis co-signature (`confirm_diagnosis`).
- 0182: The REF-DX-TERMS v1.1 and test catalogue v1.1 addenda.

## 18. Definition of Done

- [ ] S-1 to S-10 resolved, or deferred with a reason.
- [ ] Both steps match Prototype 2 within the design system in force; the empty and intern states are covered.
- [ ] Duplicate diagnoses impossible; a junior's Final visibly pending with a co-signature request; must-not-miss never leaves without a reason.
- [ ] Suggested evidence never stored or written until accepted; the composed summary contains only included, recorded facts.
- [ ] 272 profiles and 100 rules load, validate across the three catalogues, and are inert until signed. Every rule is tested both ways.
- [ ] 187 proposed terms verified against the WHO browser, or explicitly uncoded; no unverified code in any export.
- [ ] Restricted content filtered for suggestions, evidence, asks and patient-facing text.
- [ ] axe clean; red-scarcity tests green; reduced motion honoured; keyboard complete; tablet and phone per 5.6.
- [ ] With `CLERKING_V2` off, the current desk is unchanged; old drafts open.
- [ ] ADRs written; the clinician trial reported; the final table filled in; the diff on `feat/clerking-summary-impression` is reviewable.

## 19. Parallel reminders (flag if touched)

- **Plan (next prompt):** "Add to plan" creates draft orders with `reasonConditionIds`. The Plan step will group orders by diagnosis; keep the order-to-condition link intact.
- **NCD diabetes engine:** its differential stays separate. If a diabetes diagnosis is on the board, the NCD panel may link to it; never merge the two rankings.
- **Triage suggestions** (`SUGGESTED_TESTS`, `lib/triage/recommend.ts`): unchanged; they still appear in Plan.
- **IDSR:** notifiable terms still add the "Notification pending (IDSR)" event on write (`facts.ts:912-922`). The VHF suggestion never notifies on its own.
- The Pharmacy Board of Uganda, never PSU. The Supabase key change.

---

## Appendix A. Prototype map (Prototype2.dc.html → production)

| Prototype (logic class)                                   | Production                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `initial(start)` (the Tweak Start: Filled or Empty)       | Fixtures 1 and 5                                                                                         |
| `FIND`, `HX`, `EX`, `NEG`, `POS`, `INC0`                  | The encounter's recorded facts plus `summary/compose.ts` inclusion defaults                              |
| `sentences` building, `listJoin`                          | `summary/compose.ts` per `composer.summary`                                                              |
| `INSPECT`, `toggleInspect`, `insp`                        | Inspector (5.1)                                                                                          |
| `diffs`, `snap`, `markReviewed`, `touched`                | `summary/review.ts`                                                                                      |
| `QS`, `relMap`, `relevant`, `answer`                      | `impression/ask.ts` and the history write path (examination targets navigate)                            |
| `DX` (ev, tests, qs, mnm)                                 | MS-EMR-DX-CAT-001 profiles (`suggest_for`, `suggest_against`, `tests_to_decide`, `ask`, `must_not_miss`) |
| `ev`, `setEv`, `cycleNext`, `mx`                          | `impression/evidence.ts` + the matrix table; **suggested marks added**                                   |
| `explained`, `unexplained`                                | `impression/evidence.ts` ("not yet explained")                                                           |
| `isPinned`, `disp`, `move`, `setLik`, `reasons`           | `impression/board.ts`                                                                                    |
| `makeLead`, `demoteLead`, `addTo`, `removeDdx`            | `setLeadingDiagnosis`, `recordEncounterDiagnosis`, `markFactEnteredInError`                              |
| `sugg`, `SUGG_POOL`                                       | `impression/suggest.ts` from `ddx_rules`                                                                 |
| `TERMS`, `hits`, `showCustom`, `onQueryKey`               | `DiagnosisPicker` with the duplicate guard                                                               |
| `dr` (drawer), `metaOf`, `setMeta`, `togglePlan`, `TESTS` | The drawer; `placeOrders`; the test catalogue                                                            |
| `imp`, `phraseList`, `metaText`                           | `impression/compose.ts`                                                                                  |
| `senior` (the Tweak Role), `cosign`                       | `canWriteFinalDiagnosis`, `requestDiagnosisCosign`                                                       |

## Appendix B. Differences from the prototype (production must do these)

1. Evidence is **suggested** (dotted) until accepted. The prototype pre-accepts.
2. The prototype's 16 diagnoses, 10 tests and 10 questions are illustrative. Production uses the 272 profiles, the test catalogue and the `ask` targets.
3. Examination asks **navigate** to the examination step. The prototype answers "Cold or unheated home" and similar in place; those are social-history targets in production.
4. The prototype's "Remove" has no reason. Production asks for one (D-SI-13).
5. The prototype does not persist anything. Production writes conditions immediately and the reasoning to the draft.
6. The prototype's ICD-11 display shows only 5A14. Production shows the term's verified code, or "As typed, not coded".
7. The prototype's matrix rows are fixed. Production builds them per 5.4 (up to 30, with "Show all").
8. The prototype's step bar allows jumping only between 08 and 09. Production keeps the v2 section bar in full.
9. "Final (senior)" in the prototype is a label. Production writes Working and raises the co-signature request.
10. The prototype has no loading, offline, error or unsigned states. Production follows 5.8.
