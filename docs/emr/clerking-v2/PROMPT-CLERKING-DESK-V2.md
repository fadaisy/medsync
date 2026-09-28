# PROMPT — Clerking desk v2: tap-first history, symptom catalogue and flags

> **For Claude Code.** Work in the release folder (`~/Desktop/medsync-release`) on a new branch `feat/clerking-v2`, cut from `release/emr`. If `release/emr` has merged into `main` by then, cut from `main`. Confirm at STOP 0.
>
> First copy the handoff pack into `docs/emr/clerking-v2/`:
> - this prompt;
> - `clerking-history-catalogue.v1.json` (MS-EMR-CLERK-CAT-001), the clinical content;
> - `prototype/Main.dc.html`, the approved interactive prototype (markup and logic);
> - `screenshots/01-complaint.png` to `07-social-history.png`, renders of that prototype at 1440×1024;
> - `ds/medsync-chroma-tokens.json`, the MedSync Chroma tokens the prototype uses.
>
> **Mode:** gated. Eight phases (0 to 7), each ending in a **STOP**. Documents use Stage 1 (draft → critique against the checklist → revise, max two passes → present → STOP). Code uses Stage 2 (build → run the real checks → fix → re-run until green → report numbers → STOP). Self-refinement never replaces a real check.
>
> **The CSO is Fadhul.** The catalogue content, every flag rule and reference number, the composer wording and every clinical write path need his signature before they are clinically live.

---

## 0. What we are building, in one paragraph

The EMR engine shipped (release/emr, `EMR_V1` on everywhere) with a clerking page that stores the right facts but is slow and shallow to use. Symptoms have no properties. The review of systems is 81 chips all reading "Not asked", including menstrual questions for men. The page is one long scroll. Almost everything needs typing. This build replaces the **history half** of the clerking desk (Complaint, History, Systems, Past history, Family, Social) with a tap-first design the CSO has approved as a prototype:
- a section bar and one section on screen at a time;
- symptom properties for every complaint and every positive system symptom (the latter in a pop-up);
- medicines and allergies inside Past history;
- a Flags panel of symptom badges in the right-hand column;
- a note that drafts itself from the answers.

All clinical content comes from one signed catalogue (data, not code), so the form can grow without code changes. Examination, Summary, Impression and Plan keep their current behaviour inside the new shell; examination gets its own prompt later.

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt. Report every disagreement at STOP 0.
2. **The prototype is the design authority** for layout, interaction and wording, not code to paste.
   - `prototype/Main.dc.html` runs on a canvas runtime (`x-dc`, `sc-if`, `sc-for`, a `DCLogic` class). Port it to the app's own React components, tokens and server actions.
   - Read its `renderVals()` for behaviour (statuses, linked answers, flags, composer) and its markup for structure.
   - The screenshots show the target at 1440×1024.
   - Where the prototype and the catalogue differ, **the catalogue wins**; it is richer, and its content was checked against sources.
3. **Specs,** in this order:
   - `docs/emr/PROMPT-ENCOUNTER-EMR.md` and `docs/emr/emr-clinical-reference.md` (templates 2.1, minimum to sign 2.11, the standard visit 2.12);
   - `docs/emr/HARMONISATION.md`, `docs/emr/UI-BRIEF.md` and `docs/emr/STOP-REPORTS.md`;
   - ADRs 0130–0139 and ADR 0161 (every pop-up is a centred dialog);
   - `SPEC-CLINICAL-FACT-CONTRACT-v1.md` (findings, qualifiers, restricted classes);
   - `DESIGN-medsync.md` and the MedSync Chroma README and tokens.
4. **Code:**
   - `app/doctor/encounters/[id]/**` (the clerking desk) and the note template and draft modules;
   - `lib/emr/**`, `lib/facts/**`, `lib/prescribing/**`, `lib/triage/**` (NEWS2 bands);
   - the clinician symptom catalogue that the harmonisation made the finding vocabulary;
   - `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

1. **Engine-first.** No new surface without its data paths, RLS probes and tests in the same phase.
2. **Clinical content is data.**
   - Symptoms, properties, options, red flags, system groupings, linked answers, flag rules, history lists and composer phrases come only from the catalogue. No clinical wording or threshold lives in a component.
   - Adding a symptom must not need a code change: prove it with a test that adds one to a fixture catalogue.
3. **Store ids, never labels.** Answers are stored as catalogue option ids with the catalogue version. Labels are rendered at read time. A signed note records the catalogue version it was written with.
4. **Missing is never normal.** Every item is yes, no or not asked. "Not asked" never becomes a negative, in storage or in the note. "Nothing else" answers only items still unasked, never linked ones.
5. **One owner per fact.**
   - Medicines and allergies inside Past history write through the existing medication-statement and allergy-record actions: immediate commit, as today (D-EMR-01, D-EMR-04).
   - Past-history "yes" answers propose problem-list entries for the clinician to confirm; they never add them.
   - Vital signs are read from the observation store, never copied.
6. **Decision support only.** Flags are advice. They never block, never auto-order, never write to the plan and never change triage. A flag is derived from answers; it is not an answer.
7. **No remembered numbers.** Every threshold in a flag rule is a reference entry (`REF-FLAG-*`), including the NEWS2 trigger levels. A rule whose reference is unsigned does not fire. NEWS2 parameter bands are reused from the triage engine, never re-implemented.
8. **Colour law, amended only as GATE A signs (D-CV-03).**
   - Urgent flag badges in the Flags panel may use the critical tint with an octagon icon. Caution badges use amber with a triangle icon.
   - Colour is never the only signal.
   - Everywhere else red keeps its current meaning (critical result values, the Emergency affordance). Extend the red-scarcity tests to every new component.
9. **Two identifiers everywhere.** Name, age, sex and MRN on the safety bar and in the pop-up dialog's accessible name.
10. **Restricted classes stay restricted.** Items tagged `hiv`, `tb`, `mental_health` or `sexual_reproductive_health` show a lock, appear in clinical views only, and are excluded from patient prints, SMS, push and exports (D-CFC-09, D-EMR-13). Restricted flags show in the Flags panel for clinicians with access only.
11. **Drafts only are mutable;** signed notes are immutable, as today. Existing v1 drafts and signed notes must keep displaying correctly.
12. **Behind a flag.** `CLERKING_V2` per hospital, off by default. With it off, the current desk is unchanged in behaviour.
13. **Stack as found.** Drizzle, npm, server actions, the existing Edge Functions. TypeScript strict, no `any`. Zod on every action. AAL2 for clinical roles. No new dependencies without stopping to flag. Chroma arrives through its own rebased branch (D-CV-11), not through this one.
14. en-GB throughout. The pharmacy regulator is the **Pharmacy Board of Uganda** (never PSU).

---

## 3. What is wrong today (production, 27 Sep 2026, Patient Three-3, MS-2026-00004)

| # | Finding | Severity |
|---|---|---|
| C1 | **Symptoms have no properties.** The complaint "Polyuria/polydipsia" holds a free-text duration ("3 week") that never attached to it. No onset, course, site, character or red flags can be recorded. | Clinical quality |
| C2 | **The review of systems is 81 chips, each printed "Not asked"**, in 13 groups. It includes last menstrual period, menstrual cycle and pregnancy status for a 76-year-old man. Lower-case group names appear ("endocrine", "ent eyes"). | Usability + correctness |
| C3 | **The complaint does not reach the review of systems.** Polyuria is the presenting complaint, yet the endocrine row shows "Polyuria/polydipsia · Not asked". The two can contradict each other. | Data integrity |
| C4 | **Every section is expanded at once**, giving a page several screens long. The section index highlights "12 Summary" while the user is on Review of systems. | Usability |
| C5 | **Typing is the default.** Presenting complaint, history, past history and medicines are mostly free text; nothing structured reaches the engines. | Clinical quality |
| C6 | **Nothing is flagged.** Vitals at 23:00 (temperature 32.5 °C, which scores 3 in NEWS2, and a NEWS2 total of 5) sit unmarked under a 17:45 L4 Green triage. | **Safety** |
| C7 | **Examination capture is weak:** vitals typed alphabetically, BP split into two fields, glucose duplicated with no fasting context, no air or oxygen, no ACVPU. | Deferred to the examination prompt (Section 16). C6's marking is fixed here. |
| C8 | **Phone layout:** the action bar covers the narrative. | Usability |

Confirm each at Phase 0 against code and data, and write a failing test for C2, C3 and C6.

---

## 4. Design direction (as approved in the prototype)

**Layout.** Four fixed parts; the page itself never scrolls.
- **Header:** the top bar, the safety bar and the section bar.
- **Left column (272 px):** what the record already holds (triage, vital signs with NEWS2 marks, results, medicines, problems).
- **Centre:** one section at a time, with Previous and Next in a footer.
- **Right column (392 px):** the Flags panel above the note, with Sign and Complete at the foot.

**Seven rules**
1. **One section on screen.** The section bar replaces the long page and the section index.
2. **Tap first.** Chips, yes/no segmented controls, steppers and a 0–10 strip. Text boxes exist only for the story and genuinely free fields.
3. **By exception.** "Nothing else" per system; "None" for operations, medicines and allergies; "Still true today" for recorded facts.
4. **One fact, one answer.** A symptom recorded in Complaint is a linked, read-only "yes" in Systems.
5. **Details on demand.** A positive system symptom offers a Details button that opens a centred pop-up (ADR 0161). Answering yes never opens it on its own.
6. **Flags live in one place.** Badges only in the Flags panel, worded as the symptom or finding ("Chest pain", "Pain at night or at rest", "Temperature 32.5 °C"). There are no level words, no "red flag" prefix and no badges elsewhere. Severity colours inside the form (the 0–10 strip turning amber from the reference value; NEWS2 marks on vital signs) stay where the reading is taken.
7. **The note writes itself.** Deterministic sentences from the answers, with the paragraph for the current section highlighted. The clinician edits the text before signing.

**Budgets** (measured at Phase 0, met by Phase 7)

| Measure | Target |
|---|---|
| Page-level vertical scroll on 1440×900 | none (panes scroll inside themselves) |
| Required keystrokes to complete Complaint to Social for the standard visit (clinical reference 2.12), story excluded | 0 |
| Taps for a full review of systems with nothing to report | ≤ 13 (one "Nothing else" per system shown) |
| Taps to record the back-pain complaint in the prototype (duration, site, onset, character, radiation, timing, relief, severity, 7 red flags) | ≤ 20 |
| Section switch | < 100 ms p95 |
| Pop-up open | < 120 ms p95 |
| Flag and note recompute after a tap | < 16 ms at 4× CPU throttle |
| JS added to the clerking route | ≤ 60 KB gzipped, excluding the catalogue JSON; report both numbers |
| Catalogue payload | fetched once per session, cached; report the gzipped size |

---

## 5. Interface specification

The screenshots show the target; the notes below are the rules the pixels follow.

### 5.1 Shell
- **Top bar:** breadcrumb, then hospital, department and cadre, then the Emergency affordance (red, far right, as today).
- **Safety bar:**
  - the patient name (display face), age, sex and MRN;
  - Draft and the saved time on the right;
  - a second row with Allergies (live from the allergy record, with the "Uncoded, not checked by prescribing" caution), Active problems, Critical results, and Vital signs as a NEWS2 chip;
  - no flag badges.
- **Section bar:** two labelled groups, **History** (Complaint, History, Systems, Past history, Family, Social) and **Examination and plan** (Examination, Summary, Impression, Plan). Each step has:
  - a 22 px circle: number at rest, teal with a tick when done, indigo when current (place colour per the design system), an amber ring when something is required;
  - the short name;
  - a one-line status ("Done", "9 positive, 3 to do", "Confirm allergies", "Required");
  - a connector to the next step that turns teal when done.

  The right end shows "N of 10 done". At 1440 px no label may truncate (the prototype truncates; fix it by tightening padding or dropping to the short name).
- **Centre card:** a header with `[NN]`, the full section title, a one-line description and "Step N of 10"; the section body; a footer with "← Previous" and "Next: {section} →" (primary, teal).
- **Left rail:**
  - Triage, with acuity chip, complaint and time;
  - Vital signs, with the NEWS2 chip, a one-line message for any parameter scoring 3 ("Temperature 32.5 °C scores 3 on its own. Re-measure now."), per-row NEWS2 score badges, arrows for extreme values, "Air or oxygen?" and "Random or fasting?" prompts in amber when missing, a "Missing: …" line, and "Record a new set" (opens Examination);
  - Results, Medicines and Problems, each one line.

  The prototype's "Not recorded" wraps badly beside Consciousness; keep the value on one line.
- **Right column:** the Flags panel (5.9) above the note (5.10), with the Sign/Complete bar fixed at the foot.

### 5.2 [01] Complaint
- **History from:** a segmented control (Patient, Carer, Relative, Referral letter, Health worker), with Language and Interpreter (name and relationship) fields. These are structured items (clinical reference principle 6).
- **Complaint cards,** one per complaint:
  - the header shows the name, the duration in mono (amber "How long?" when missing), a one-line property summary, "Properties"/"Done" and remove;
  - the body is the property editor for the symptom's family, with symptom overrides (5.4). Its first row is **For**: a stepper with a unit choice of hours, days, weeks, months or years.
- **Add a complaint:**
  - search over labels and synonyms (and local terms once supplied), showing the family and the system;
  - "Common" chips from `complaint_quick_picks`;
  - a free-text complaint is allowed but marked "Uncatalogued, no properties", and it never drives flags or engines.

### 5.3 [02] History of presenting complaint
- **The story:** a textarea with the helper "The facts from Complaint are already in the note. Write what the chips cannot say."
- **Also asked, because of {complaint}:** yes/no rows from each complaint's `also_ask`. For example, polyuria asks about diuretics, steroids, lithium, known kidney disease, kidney stones or high calcium, and known diabetes. The rows change with the complaints.

### 5.4 The property editor (shared by complaints and the pop-up)
Each property renders by its `kind`:
- **one** (chips, single choice, tap again to clear);
- **many** (chips; `exclusive_options` such as "Nowhere" and "Nothing" clear the others);
- **count** (a stepper with unit);
- **scale** (a 0–10 strip; it turns amber at or above `REF-FLAG-PAIN-SEVERE` once signed);
- **yes/no** rows for red flags.

Other rules:
- Properties listed in `hide_properties` do not render.
- `extra_families` and `extra_properties` add their rows after the family's.
- Labels sit in a 92 px column; chips wrap.

### 5.5 [03] Review of systems
- **One row per system,** shown only when the system applies to the patient's recorded sex (the Gynaecological system for female patients within the signed age range; men are asked about breast lumps under Skin). Each row shows:
  - a chevron, the system name, and a status: "Not reviewed", "Partly reviewed", "Nothing to report" (teal) or "N positive" (bold);
  - the positives, joined by " · ";
  - "Nothing else".
- **The open row** lists its items in two columns, each with a yes/no control.
  - **Linked items** show "Yes, in complaint" or "No, in complaint" with a link icon and a chevron. Tapping one opens that complaint in Complaint; they cannot be answered here.
  - **A "yes" item** shows a Details button: "Add details" (teal) before anything is recorded, "Details" after. Under it sits a one-line summary once filled.
- **The pop-up** is a centred dialog, about 660 px wide:
  - a header with "Review of systems · {system}", the symptom name, a one-line summary and a close button;
  - the property editor (duration first);
  - a footer with "Change the answer to no" on the left and a primary **Done** on the right;
  - Esc, the close button and a click outside all close it; focus is trapped and returns to the Details button.

### 5.6 [04] Past medical history
Two columns.
- **Left:**
  - **Conditions,** yes/no from `past_history.conditions`, with locks on restricted items. A yes reveals "known for" chips (`since`) and proposes a problem-list entry.
  - **Operations and transfusions,** with "None" or add. A transfusion asks when (the HbA1c note).
- **Right:**
  - **Medicines,** one card per medicine: name, a summary (dose as stated, frequency, adherence, source) and remove. Expanding a card shows dose (text, as the patient or packet states), frequency, adherence and source chips. Below the cards: "Takes none, including herbal", then quick picks. Writes are immediate medication statements.
  - **Allergies,** with a status line ("1 allergy on record, not yet confirmed today", amber until confirmed). One card per allergy: name, "Uncoded" and "High risk" pills, a summary, "Code it" and "Not an allergy" (remove with a reason). Expanding a card shows reactions (high-risk items per catalogue), severity and source. Below the cards: "Still true today", or "No known drug allergies" when there are none, then quick picks. Writes go through the allergy record. The prototype's "Code it" button wraps; keep it on one line.

### 5.7 [05] Family history
- Yes/no from `family_history.conditions`.
- Each yes reveals "who" chips (`relations`).
- Stored as conditions with `subject_relation`.

### 5.8 [06] Social history
- **Tobacco:** status. For former or current smokers, add cigarettes a day and years (steppers), with pack-years derived and shown in mono, and other forms and when they quit.
- **Alcohol:** pattern, plus drink types (including local spirits and brews; the labels await clinicians' confirmation).
- **Other substances:** restricted.
- **The rest:** living situation, activity, occupation (text with hints), travel and diet.

### 5.9 Flags panel
- **Header:** "Flags" with a count pill. The pill is tinted red with an octagon if any flag is urgent, amber with a triangle otherwise.
- **Body:** wrapped badge buttons, urgent first. Each badge is:
  - a 26 px pill containing the icon (octagon or triangle) and the symptom words;
  - its title and accessible description state every reason and where it came from ("Back pain: pain at night or at rest");
  - a button that goes to the section it came from.
- **Merging:** badges with the same words merge; the most severe level wins.
- **Empty state:** "Nothing flagged so far."
- **Restricted flags** show only to clinicians with access, and never in any export.

### 5.10 The note
- **Header:** "Note" with "Edit text" and the helper "Written from your entries as you go, by fixed rules. The part you are working on is highlighted."
- **Body:** blocks for Patient, History, Systems review, Past history, medicines and allergies, Family history, Social history, Examination, Impression and Plan.
  - The block for the current section has an indigo tint and ring.
  - Composer rules follow `composer.rules` in the catalogue.
  - "Edit text" switches the block to editable text. From then on that block stops regenerating, with a small "Edited, will not update" marker and an "Undo edits" option.
- **Foot:** "Required N of 3", then Sign note (⌘/Ctrl + Enter) and Complete visit, as today.

### 5.11 Examination, Summary, Impression and Plan
These keep their current function and data inside the new shell and centre card. Only the vital-signs marking in the left rail and the Flags panel are new here. The examination redesign is out of scope.

### 5.12 Tablet and phone
- **Tablet portrait:** the left rail becomes a "Context" sheet and the right column a "Note and flags" sheet; the section bar scrolls horizontally with the current step kept in view.
- **Phone:** one section at a time; the section bar collapses to "Step 3 of 10 · Systems ▾" (a sheet listing all steps with statuses); the footer holds Previous and Next above Sign; the pop-up becomes a full-height sheet. Nothing may cover the narrative (C8).

### 5.13 Keyboard
With focus outside text fields:
- `[` and `]` move to the previous and next section;
- `1` to `9` and `0` jump to a step;
- `y` and `n` answer the focused yes/no row;
- `d` opens Details;
- `/` searches complaints;
- `?` opens help.

The focus ring is teal.

---

## 6. The catalogue (contract)

- **File:** `clerking-history-catalogue.v1.json` (MS-EMR-CLERK-CAT-001). Load it once through a server-side loader, validate it with a Zod schema, and serve it to the client with its version and a hash.
- **Contents:**
  - 96 symptoms, 65 property families and 766 family options;
  - 13 review-of-systems groups placing 92 symptoms (the other four are complaint-only or associated-only);
  - 129 red flags, each typed `danger`, `risk_factor` or `exposure`, and 75 flag rules (44 urgent);
  - 19 reference entries and 19 sources (7 verified on 27 Sep 2026);
  - the lists for past, family and social history, medicines and allergies, and the composer rules.
- **Reconciliation.** Map every catalogue symptom to the clinician symptom catalogue that is the current finding vocabulary (harmonisation note).
  - Where a finding token exists, record the mapping in `docs/emr/clerking-v2/catalogue-token-map.csv`.
  - Where none exists, propose one: the CSO adds it to the shared vocabulary, never a private copy (CFC).
  - Report the counts at STOP 0.
- **Versioning.** The catalogue is versioned semantically. Drafts and signed notes store the version they used, and old versions stay loadable for display. Content changes are CSO-signed. Status fields travel with the content: `draft`, `draft-verified-source`, `draft-unverified`, and `signed` after GATE A.
- **Flag rule language** (`flag_rule_language`):
  - atoms and combinators as listed;
  - numbers only through `REF-FLAG-*` entries;
  - `applies_to` targets a symptom, a list, a family, `any`, or a record (medicines, allergies, vital signs).

  Rules with `restricted: true` produce restricted flags.
- **Local terms** are empty on purpose. Ugandan clinicians supply them; nothing is machine-translated (D-CV-13).

---

## 7. Engines (pure, no I/O, in `lib/clerking/**`)

| Module | Responsibility | Minimum tests |
|---|---|---|
| `catalogue.ts` | Zod schema, loader, indexes (symptom by id, symptoms by system, families resolved with overrides, extras and hidden properties), sex and age applicability | Schema round-trip; every symptom resolves to a non-empty property list; adding a symptom to a fixture needs no code |
| `answers.ts` | The draft answer model (`sectionId → structured payload`), property updates with `one`/`many`/exclusive semantics, stepper bounds, duration normalisation (value plus unit) | Every property kind; exclusive options; tap-again clears |
| `linkage.ts` | Complaint → review-of-systems linked answers (`linked_answers` rules and the red-flag symptom map) | Linked items never contradict the complaint; removing a complaint removes its links and restores the prior answer |
| `status.ts` | Section and system statuses, "N of 10 done", "Required N of 3" | Every status string |
| `flags.ts` | Evaluate `flag_rules` against answers, patient (age, sex), hospital settings (outbreak mode), the medicine and allergy records and NEWS2 (reused); produce flags; merge into badges | One positive and one negative fixture per rule; the unsigned-reference rule does not fire; merging and ordering; restricted filtering |
| `compose.ts` | Deterministic note text per `composer.rules`, with the current-section block marked | Snapshot tests for the standard visit and the chest-pain fixture; no "not asked" item ever appears as a negative |
| `derive.ts` | Pack-years, BMI (read-through only), duration text | Arithmetic tests |

**Property tests** (Phase 2):
- for random answer sets, the composer output contains every yes answer and no not-asked item;
- badges are deterministic, and merge is idempotent;
- linkage and the review-of-systems answers never disagree;
- statuses are monotonic as answers are added.

**Fixtures.** Port the prototype's two patients: Patient Three-3 by default, and the chest-pain variant. Add `last_episode: now` to the chest pain, a property the prototype lacked.

The prototype showed seven badges: Chest pain 10/10, Temperature 32.5 °C, Pain at night or at rest, Weight loss, Bone pain 7/10, Misses amlodipine and NEWS2 5. Expect these differences from the catalogue's corrected rules (D-CV-04):
- Chest pain is urgent through the ACS rule, not through pain severity.
- NEWS2 5 becomes urgent.
- Risk-factor answers never make their own badge.

List every badge difference against the prototype and have the CSO confirm each one.

---

## 8. Data

- **Draft payload v2.** The existing encrypted note-draft content gains `schema: 2`, `catalogueVersion` and structured sections keyed by section id, holding option ids only.
  - v1 drafts open read-only in a "Previous format" view with a "Continue in the new format" action that copies what maps. Nothing is migrated silently.
  - Signed notes of any version display as signed.
- **Commit rule (unchanged, D-EMR-01).**
  - Medicines, allergies, confirmed problems and family-history conditions commit immediately through the existing actions.
  - Complaint and system findings, with their qualifiers, commit as CFC finding facts at signing, in the same transaction as the note. Qualifiers use option ids; the finding concept uses the token map (Section 6).
  - Social history commits as observations if the CFC catalogue has the concepts (tobacco status, pack-years, alcohol pattern). If not, propose them in a CFC v1.2 addendum and store them in the note only until it is signed.
- **Flags** are derived at read time and never stored as clinical facts. At signing, the badge list (text, level, rule ids, catalogue version) is written into the note's canonical content, so the record shows what the clinician saw (D-CV-05).
- **Hospital setting** `outbreak_mode` (boolean, set by the IPC focal person, audited) feeds `FLAG-VHF-OUTBREAK`.
- **RLS:** no new tables unless Phase 0 shows a need. The outbreak-mode setting and the token map (if stored) get the standard probes.

---

## 9. Server actions

Reuse, don't duplicate: `saveNoteDraft` (payload v2, version check), `signNote`, `recordMedicationStatements`, `confirmCurrentMedicines`, `recordAllergy`, `assertAllergyStatus`, `recordProblem` (as a proposal to confirm), and the family-history condition write.

Add only what Phase 0 proves is missing, with the house contract: `'use server'`, Zod, AAL2, scope and cadre checks, one transaction, one audit row, idempotent client key, `{ id, serverTime }`.

---

## 10. Accessibility, motion, colour

- **Standard:** WCAG 2.2 AA in light and dark; targets ≥ 44×44 px on touch (chips 30 px tall on desktop pointer only, 44 px on touch).
- **Section bar:** a navigation landmark. Each step button's accessible name includes its status ("Systems, 9 positive, 3 to do, step 3 of 10"), and the current step has `aria-current="step"`.
- **Controls:**
  - yes/no controls are grouped buttons with `aria-pressed`;
  - chips are toggle buttons;
  - the 0–10 strip is a radio group;
  - steppers have labelled buttons.
- **Pop-up:** `role="dialog"`, `aria-modal`, labelled by the symptom name, with focus trapped and restored.
- **Flags panel:** a list. Every badge's accessible name is its text plus "urgent" or "needs attention", because colour and shape alone are not accessible names.
- **Motion:** reduced motion honoured; no animated layout.
- **Colour:**
  - plum or indigo marks place only (the current step and current note block, per ADR 0097 and Chroma);
  - buttons and focus are teal;
  - amber is caution;
  - red follows Law 8 as amended.
- **Other rules:** no left-edge accent bars; headings weight 500–600 per the design system in force (D-CV-11).

---

## 11. Phases and gates

### Phase 0 — Discovery and baseline (no product changes)
- **Q1** The branch state: is `release/emr` merged into `main`? Is `1f5937c` (full clerkship by default) live? Is `ab94c92` (the autosave fix) live?
- **Q2** Where the clerking desk lives. The draft content shape and its encryption. How templates and minimum-to-sign rules are expressed (code or data).
- **Q3** The clinician symptom catalogue: location, token ids, and their overlap with the catalogue's 95 symptoms. Produce the token map (Section 6).
- **Q4** Chroma status: the branch, the rebase effort onto `release/emr`, and the token names in use (D-CV-11).
- **Q5** What the medication-statement, allergy and problem actions accept, and whether any is missing a field the design needs (adherence, source, known-for, reaction).
- **Q6** CFC concepts present for tobacco, pack-years and alcohol.
- **Q7** Where the triage NEWS2 bands live, and whether they can be imported by the clerking desk.
- **Q8** Hospital settings and the feature-flag mechanism (`CLERKING_V2`, `outbreak_mode`).
- **Q9** How restricted items are marked and filtered today (locks, print exclusion).
- **Q10** Whether Playwright and axe are present (they are, per the gate record). Confirm the versions.
- **Q11** Existing keyboard handling on the desk (avoid conflicts).
- **Q12** Test data: counts of v1 drafts and signed clerking notes, per hospital.

**Baseline:**
- screenshots of the current desk at 390×844, 834×1194 and 1440×900, light and dark;
- the standard visit (clinical reference 2.12) timed in taps, keystrokes and seconds;
- page length in screens;
- failing tests for C2 (sex-inappropriate items), C3 (complaint and systems disagreeing) and C6 (NEWS2 not marked).

**STOP 0.** Report Q1–Q12, the token map counts, the baseline and the failing tests.

### Phase 1 — GATE A proposal (documents only)
Write `docs/emr/clerking-v2/gate-a-proposal.md`:
- the port plan from the prototype to app components (a component list with reuse);
- the payload v2 schema and v1 handling;
- the catalogue sign-off pack: every flag rule with its source and status, the reference entries with proposed values, the items still `draft-unverified`, and the Uganda adaptations to NG12 thresholds;
- the Law 8 amendment text;
- the test plan;
- the decision table (Section 15) with a signature block.

**STOP 1.** Nothing proceeds without signatures.

### Phase 2 — Catalogue and engines (pure)
The Section 7 modules, the Zod schema, the fixtures and the property tests. Also: a script `npm run clerking:catalogue-check` that validates the JSON and prints the counts. CI runs it.

**STOP 2.** Test counts, the rule coverage table (every rule id, positive and negative), property-test results, and the prototype-parity diff for both fixtures.

### Phase 3 — Shell (behind `CLERKING_V2`)
The section bar, the centre card with its footer, the left rail with NEWS2 marking (C6), the right column with the Flags panel and note (highlighting, edit-lock), the safety-bar changes, keyboard, and the flag-off regression.

**STOP 3.** Screenshots against the prototype (1440×1024, light and dark); the no-page-scroll check; axe (0 serious or critical); red-scarcity tests; flag-off screenshots identical to the baseline.

### Phase 4 — Complaint and History
The historian block, complaint cards, the property editor, add-complaint search, quick picks, also-asked rows, and the story.

**STOP 4.** Back-pain tap count against budget; chest-pain fixture badges; composer snapshots.

### Phase 5 — Review of systems and the pop-up
System rows, statuses, "Nothing else", linked answers with navigation, Details buttons and summaries, and the dialog (ADR 0161), including focus management.

**STOP 5.** Full negative review tap count; the linkage property test in the UI (Playwright); dialog accessibility.

### Phase 6 — Past history, Family, Social
Conditions with known-for, operations and transfusions, medicines and allergies through the existing actions, family relations, and social history with pack-years.

**STOP 6.** An action matrix proving medicines and allergies commit immediately and appear in the safety bar and prescribing check; a restricted-item print exclusion test.

### Phase 7 — Hardening and a clinician trial
- **Performance and resilience:** performance budgets (Section 13); tablet and phone layouts (5.12); offline behaviour (reuse the optimistic queue); dark mode.
- **Documentation:** ADRs.
- **A timed trial with three to five clinicians**, old desk against new, on the standard visit and one chest-pain visit, reporting the median time, taps, keystrokes and errors.

**STOP 7 (final).** The table in Section 14, filled in.

---

## 12. Security, privacy, audit
- AAL2, hospital scope, reception blocked. Every write and every reveal audited.
- Draft content encrypted as today.
- Restricted items: lock marks, clinical views only, excluded from patient prints and exports; restricted flags filtered by access.
- `outbreak_mode` changes are audited, with the actor and reason.
- If the server client still reads a legacy `service_role` key, flag it.

## 13. Performance budgets
As in Section 4. Also: TTFB for the clerking route p95 < 400 ms with the safety bar in the first paint; zero layout shift on autosave, flag or note updates; a fixed query count per render.

---

## 14. Numbers to report at the final STOP

| Metric | Baseline | Target | Result |
|---|---|---|---|
| Page-level scroll on 1440×900 | P0 | none | |
| Sex-inappropriate review-of-systems items shown | P0 | 0 | |
| Complaint and system disagreements possible | P0 | 0 | |
| Required keystrokes, Complaint to Social (standard visit, story excluded) | P0 | 0 | |
| Taps, full negative review of systems | P0 | ≤ 13 | |
| Taps, back-pain complaint with properties | — | ≤ 20 | |
| Standard visit time, median of the clinician trial | P0 | lower than baseline; report the difference | |
| Catalogue symptoms rendering a property editor | — | 96 of 96 | |
| Flag rules with positive and negative tests | — | 75 of 75 | |
| Rules firing with an unsigned reference | — | 0 | |
| Badges equal to the prototype on both fixtures, after the D-CV-04 corrections | — | yes | |
| NEWS2 parameters scoring 3 left unmarked on the desk | P0 | 0 | |
| axe serious or critical | P0 | 0 | |
| Red-scarcity tests | — | green | |
| JS added to the clerking route / catalogue gzipped | — | ≤ 60 KB / report | |
| v1 drafts still openable | P0 | all | |

---

## 15. GATE A decisions (Fadhul owns; recommendations given)

| # | Decision | Recommendation |
|---|---|---|
| D-CV-01 | Design authority | The prototype and screenshots define layout and interaction; the catalogue defines content; the repo wins on mechanics. |
| D-CV-02 | Section order and grouping | History: Complaint, History, Systems, Past history (with medicines and allergies), Family, Social. Examination and plan: Examination, Summary, Impression, Plan. |
| D-CV-03 | Red in the Flags panel | **Amend Law 8:** urgent flag badges in the Flags panel may use the critical tint, always with an octagon icon and an accessible "urgent" name. Nowhere else changes. |
| D-CV-04 | Flag levels and rules | Urgent = act during this visit; caution = must be addressed or planned. Sign each rule. Corrections to the prototype, from the sources and an independent clinical review: **(a)** chest pain is urgent on ACS features, current or within 12 hours, regardless of pain score; 12 to 72 hours is caution (NICE CG95). **(b)** Any single cauda equina red flag is urgent, not two together (NICE CKS). **(c)** The VHF rule fires on fever plus an exposure, and bleeding is not required (WHO case definition; only 3 of 18 admitted Bundibugyo patients bled in 2026). Animal contact counts only in outbreak mode, and the outbreak symptom count follows the WHO list exactly. **(d)** New urgent rules: fever with danger signs, acute abdomen, pulmonary embolism, anaphylaxis, SJS/TEN, bleeding in pregnancy, anuria, jaundice with confusion or bleeding. **(e)** NEWS2 5 or more is urgent, with an emergency tier at 7 or more, both as reference entries. **(f)** Taking iron never switches off the melaena flag. **(g)** Red flags are typed danger, risk factor or exposure, and only danger answers make their own caution badge. |
| D-CV-05 | Flags and the record | Derived at read time; snapshotted into the note at signing with rule ids and catalogue version. |
| D-CV-06 | Outbreak mode | A hospital setting, set by the IPC focal person and audited, that turns on the "fever plus at least three symptoms" screen. Fever plus exposure is always on. |
| D-CV-07 | Pop-up trigger | Only the Details button opens it; answering yes never does. |
| D-CV-08 | Linked answers | Read-only in Systems; they navigate to the complaint. |
| D-CV-09 | Past-history yes | Proposes a problem-list entry to confirm; never auto-adds. |
| D-CV-10 | Medicines and allergies in Past history | Yes, as immediate-commit facts through the existing records; the safety bar updates live. |
| D-CV-11 | Chroma | Rebase the Chroma branch onto `release/emr` and merge it first, as its own reviewed change. This build then uses Chroma tokens. If you decline, build with the current tokens and restyle later (the prototype's look then waits). |
| D-CV-12 | Duration units | Hours, days, weeks, months and years; hours matter for acute symptoms. |
| D-CV-13 | Local-language terms | Supplied and signed by Ugandan clinicians; nothing machine-translated; search uses them once present. |
| D-CV-14 | Obstetric and gynaecological history step | Next round, as its own catalogue section and step for female patients within the signed age range. The gynaecological symptoms already sit in Systems. |
| D-CV-15 | NG12 thresholds for Uganda | Keep them as reference entries, but review each for Uganda at signing (younger population; TB, HIV and schistosomiasis as competing causes). Rules stay off until signed. |
| D-CV-16 | Composer wording | Sign the composer rules and the two fixture snapshots as the house style for clerking notes. |

**Prerequisites from earlier gates:** D-EMR-01, D-EMR-04, D-EMR-13 and D-CFC-09 (restricted classes), all signed on 26 Sep.

---

## 16. Out of scope (leave clean seams)

- **Examination capture redesign.** Vitals entry order, one BP field, fasting context, air or oxygen, ACVPU and structured system examinations get their own prompt; only C6 marking is fixed here.
- **Other history content:**
  - paediatric history;
  - obstetric and gynaecological history (D-CV-14);
  - AUDIT-C and other scored questionnaires.
- **Other catalogue and prescribing work:**
  - differential-engine suggestions from the answers;
  - local-language terms (content work);
  - prescribing (`EMR_PRESCRIBING` stays off).
- **Mobile:** a mobile (Expo) desk.

## 17. ADRs (next free numbers)
- Clerking desk v2: sectioned, tap-first history, and the prototype as design authority.
- The clerking catalogue as data: schema, versioning, sign-off statuses, token map.
- The flag engine: rule language, reference entries, levels, badges, snapshot at signing.
- The Law 8 amendment (if D-CV-03 is signed).
- Draft payload v2 and v1 coexistence.
- Outbreak mode.

## 18. Definition of Done
- [ ] C1–C8 resolved, or deferred with a reason (C7 to the examination prompt).
- [ ] All 96 catalogue symptoms render; all 75 rules tested both ways; unsigned references never fire.
- [ ] No page-level scroll at 1440×900; screenshots match the prototype within the design system in force.
- [ ] Linked answers never disagree; "not asked" never appears as a negative.
- [ ] Medicines and allergies commit immediately and reach the safety bar and the prescribing check.
- [ ] Restricted items are locked and excluded from prints and exports.
- [ ] axe clean; red-scarcity tests green; reduced motion honoured; keyboard complete.
- [ ] With `CLERKING_V2` off, the current desk is unchanged; v1 drafts still open.
- [ ] ADRs written; the clinician trial reported; the final table filled in; the diff on `feat/clerking-v2` is reviewable.

## 19. Parallel reminders (flag if touched)
- The NCD diabetes engine reads findings through the fact loader. Polyuria, thirst, weight loss and blurred vision now arrive structured, so check that its fixtures still pass.
- The monitoring engine (next Tier 3 prompt) will own vital-sign re-scoring; the left-rail marking here is display only.
- The IPC link: the VHF rules feed the notifiable-diagnosis confirm sheet and the IPC prompt; they never isolate or notify on their own.
- Pharmacy Board of Uganda, never PSU. The Supabase key change.
