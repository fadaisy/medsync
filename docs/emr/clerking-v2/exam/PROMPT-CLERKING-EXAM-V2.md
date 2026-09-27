# PROMPT: Clerking desk v2, Examination (vital signs, general and systems, structured and graded)

> **For Claude Code.** Work in the release folder (`~/Desktop/medsync-release`) on a new branch `feat/clerking-exam-v2`, cut from `feat/clerking-v2` (or from `main` once clerking v2 has merged). Confirm which at STOP 0.
>
> First copy the handoff pack into `docs/emr/clerking-v2/exam/`:
>
> - this prompt;
> - `clerking-exam-catalogue.v1.json` (MS-EMR-EXAM-CAT-001): the clinical content, scales, classifiers, flag and suggestion rules, and composer;
> - `prototype/ExamV2.dc.html` and its 18 state wrappers: the approved interactive prototype (round 3);
> - `screenshots/E01` to `E19`: renders of that prototype at 1440×1024.
>
> **Mode:** gated, as in clerking v2. Eight phases (0 to 7), each ending in a **STOP**.
>
> - Documents use Stage 1: draft, critique against the checklist, revise (at most two passes), present, STOP.
> - Code uses Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
> - Self-refinement never replaces a real check.
>
> **The CSO is Fadhul.** The catalogue content, every scale, classifier, flag rule and reference number, the composer wording, the intimate-examination gate and every clinical write path need his signature before they are clinically live.
>
> **Companion.** This prompt extends `PROMPT-CLERKING-DESK-V2.md` (history) and `PROMPT-CLERKING-MOBILE.md` (phone). Everything there still applies unless this prompt says otherwise. Where they conflict on the examination step, this prompt wins.

---

## 0. What we are building, in one paragraph

Clerking v2 rebuilt the history half of the desk. It left **Examination** as it was: vitals typed in alphabetical order, BP split into two fields, glucose duplicated without a fasting context, no air or oxygen, no ACVPU, and system findings that cannot be graded, linked or flagged. This build replaces step 07 with the structured examination the CSO approved as a prototype:

- vital signs written as a new observation set, with NEWS2 marks, BMI and waist classes, and MUAC;
- a General examination with consciousness (GCS by default, ACVPU allowed), attachments, signs graded on standard scales, and WHO/GTFCC hydration and Uganda IMAM nutrition, both classified from what is ticked;
- nine systems, each examined by its own methods (inspection, palpation, percussion, auscultation; look, feel, move; higher functions to gait);
- a new diabetic foot screen (IWGDF 2023).

Each finding is answered in its own words: Absent/Present, Negative/Positive, None/In place, or a real expected state such as "Central/Deviated". **Normal/Abnormal appears only where a normal state exists.** A fact is recorded once and shown wherever else it matters. Scores and grades are computed from their parts and shown with them. The history drives suggestions ("Back pain with red flags: saddle sensation, anal tone"). Findings feed the Flags panel and write the examination paragraph of the note. All clinical content comes from one catalogue (data, not code).

---

## 1. Ground truth and reading order

1. **The repo wins** over this prompt. Report every disagreement at STOP 0.
2. **The prototype is the design authority** for layout, interaction and wording. It is not code to paste.
   - `prototype/ExamV2.dc.html` runs on the same canvas runtime as the v2 prototype. Port it to the app's components, tokens and server actions.
   - Read its logic class for behaviour: `exCat3()` (content), `setItem`/`setChoice`/`setAttr`/`setShared` (the answer model), `dehydClass`, `muacClass`, `bmiClass`, `waistRisk`, `respSeverity`, `gcsTotal`, `consAvpu` (classifiers), `itemText`/`sysText` (composer), `suggestions` and `collectFlags`.
   - The wrappers open the prototype in a given state (for example `ExamV2Cpap` shows CPAP with a catheter). The screenshot list is in Section 5.14.
3. **The catalogue wins over the prototype on content.**
   - It was built from the prototype and then checked against sources on 27 Sep 2026.
   - Every difference is listed in `prototype_parity` (24 entries), for example: Uganda's adult MUAC cut-off is 19.0 cm, not 18.5; pupils record reactivity per side for GCS-P; the GTFCC sign reads "absent or weak pulse".
   - Content with `in_prototype: false` (16 items, the Feet system, three vital-sign panels) has no screenshot. Build it from the same response types and patterns.
4. **Specs,** in this order:
   - `PROMPT-CLERKING-DESK-V2.md` (laws, shell, Flags panel, note, GATE A decisions D-CV-01 to 16);
   - `docs/emr/emr-clinical-reference.md` (templates 2.1, minimum to sign 2.11, standard visit 2.12);
   - `SPEC-CLINICAL-FACT-CONTRACT-v1.md` (findings, qualifiers, restricted classes);
   - the triage engine's NEWS2 module (reuse; never re-implement);
   - `DESIGN-medsync.md` and the Chroma tokens (per D-CV-11).
5. **Code:**
   - the clerking desk (`app/doctor/encounters/[id]/**`) and `lib/clerking/**` from v2;
   - `lib/triage/**` (NEWS2), `lib/emr/**`, `lib/facts/**`;
   - the observation (vital-signs) write action;
   - `db/schema/**`, `tests/**`, `tests/rls/**`.

---

## 2. Laws (non-negotiable)

Clerking v2 laws 1 to 14 apply unchanged:

- engine-first;
- clinical content is data;
- store ids, never labels;
- missing is never normal;
- one owner per fact;
- decision support only;
- no remembered numbers;
- the colour law as amended by D-CV-03;
- two identifiers;
- restricted classes stay restricted;
- only drafts are mutable;
- behind a flag;
- stack as found;
- en-GB, and the **Pharmacy Board of Uganda**.

The examination adds these:

**E1. The right answer type.**

- Every item has one response type from the catalogue: `presence`, `test`, `state`, `device`, `choice`, `classified`, `measured`, `link` or `block`. Components render by type, never by item.
- A `presence` item reads Absent/Present and is written "no clubbing".
- A `device` reads None/In place; it is never "normal" and never "abnormal".
- A `state` item uses its own words ("Central/Deviated", "Resonant/Abnormal", "Intact/Impaired"). Only a `state` item may say Normal/Abnormal, and only because a normal state exists for that structure.
- The words "normal" and "abnormal" appear nowhere else in the UI: not in system pills, not in counters, not in the note.

**E2. Unrecorded is never normal.**

- An item is unrecorded, negative, positive, or not examined (with a reason). Only the first three can come from the form; "not examined" needs a reason.
- "Everything else normal" answers only unrecorded `presence`, `test` and `state` items, and `choice` items with exactly one expected option. It shows what it set and can be undone in one tap.
- It never touches links, devices, attachments, classified or measured items, or blocks (GCS, AMTS, grids).
- Oxygen and consciousness always need an explicit answer, because NEWS2 reads them.

**E3. One owner per fact.** Each shared fact (catalogue `shared_facts`, 13 entries) is stored once by its owner. Everywhere else it is a read-only link that navigates to the owner. The exception is a `shared` attribute (the respiratory distress signs), which edits the one fact in either place. `mirror_of` options (oral thrush shown under HIV-associated signs) read and write the owner's option.

**E4. Scores and grades are computed, never typed.**

- GCS, GCS-P, BMI, the waist and waist-to-height classes, MUAC class, GTFCC hydration, distress severity, CRB65, acute asthma severity, ROSIER, IWGDF risk, IWGDF/IDSA infection grade, SINBAD, orthostatic hypotension and the hypoglycaemia level are all derived from their inputs.
- Each result is shown with its inputs and reason ("Severe dehydration: danger sign, lethargic").
- The only clinician-chosen grade is West Haven, where the app suggests and the clinician decides.

**E5. Findings, not interpretations.**

- The note records signs, measurements and standard classifications, each with its inputs.
- Hints are never written to the note: the motor-pattern hint, WHO stage hints, GTFCC treatment plans, the West Haven suggestion.
- Flag badges name a finding ("Deviated trachea, hyper-resonant chest"), a measured value ("MUAC 17.5 cm") or a named standard scale with its result ("GCS 8", "GTFCC: severe dehydration"). They never name a diagnosis the clinician has not made ("Possible tension pneumothorax"); that belongs in the flag's reason.

**E6. Vital signs have one owner.**

- A new set is written through the existing observation action ("Save as a new set"), as an immediate commit, and the triage set stays read-only beside it (D-EX-11).
- NEWS2 is scored by the triage engine. The examination passes it the draft set, ACVPU (from consciousness) and air or oxygen (from General).
- Nothing is copied between sets.

**E7. The intimate gate.** Rectal and genital items stay locked until the reason, consent and chaperone are recorded (catalogue `gates.intimate`). The gate record is written into the note and audited. A relative may stay with the patient but does not count as a chaperone.

**E8. Units and plausibility.**

- Values are stored in the catalogue unit (mmol/L, kg, cm, °C).
- An entry outside the `plausible` range needs a confirm tap, and a confirmed implausible value is marked in the note.
- Steppers respect `min`, `max` and `step`.
- Decimal commas are accepted as decimal points.
- A stepper's start value is only where the stepper begins. Nothing is stored until the clinician touches it. The prototype stored start values (MUAC 24, monofilament 1, JVP 4), which would have recorded measurements nobody took.

---

## 3. What is wrong today (production, 27 Sep 2026, Patient Three-3, MS-2026-00004)

| #   | Finding                                                                                                                                                                     | Severity         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| E-1 | Vital signs are typed in alphabetical order, not clinical order. BP is split into two fields.                                                                               | Usability        |
| E-2 | Glucose appears twice, with no random or fasting context.                                                                                                                   | Data integrity   |
| E-3 | There is no air-or-oxygen field and no ACVPU, so NEWS2 is incomplete on every new set ("NEWS2 5, incomplete").                                                              | **Safety**       |
| E-4 | _Confirm at Phase 0:_ system findings are free text, or normal/abnormal chips with no properties. Nothing reaches the engines, the flags or the CFC as structured findings. | Clinical quality |
| E-5 | _Confirm:_ there are no standard gradings (oedema, clubbing, murmurs, power, reflexes), no GCS calculator, and no WHO dehydration classification.                           | Clinical quality |
| E-6 | _Confirm:_ history and examination are not connected. Back-pain red flags do not prompt a neurological or rectal examination.                                               | Safety           |
| E-7 | _Confirm:_ intimate examinations have no recorded consent or chaperone.                                                                                                     | Governance       |
| E-8 | _Confirm:_ the same finding (pallor, lymph nodes, orientation) can be entered in two places with different answers.                                                         | Data integrity   |

Confirm each at Phase 0 against code and data. Write a failing test for E-2, E-3 and E-8.

---

## 4. Design direction (as approved in the prototype, round 3)

**Place.** Examination is step 07 of the v2 shell. The header, left rail, Flags panel, note and Sign bar are v2's. Only the centre card changes.

**Card anatomy (top to bottom)**

1. **Card header:** `[07] Examination`, "Vital signs, general examination and systems", and "Step 7 of 10".
2. **Suggestion strip:** "Suggested" followed by one scrolling line of chips from `suggestion_rules`.
   - A chip still to do is dashed indigo with a dot. A done chip is teal with a tick. Each chip's tooltip and accessible description give its reason ("Back pain with pain at night, weight loss").
   - Tapping a chip opens its target system, part or item.
   - Add edge fades and scroll buttons; the prototype cuts off the last chip.
3. **Systems grid:** 11 pills in rows of five: Vital signs, General, the nine systems and Feet. Each pill shows:
   - a status dot and the name;
   - a status line: "Not examined", "N findings", "Nothing found", "Not examined: {reason}", or "Suggested" (indigo) when a suggestion targets it.

   The Rectal and genital pill carries a lock until the gate is complete. Replace the prototype's "N abnormal" and "N normal · N abnormal" counters with "N findings · N nothing found · N not examined" (E1).

4. **System panel:**
   - a header with the name, the counts line, **Clear** (with an undo toast), **Everything else normal** (E2) and **Not examined…** (a reason menu from `not_examined.reasons`);
   - part tabs, each with a count or a tick.
5. **Item rows:**
   - label and live summary on the left (the summary is the composer's clause, teal when positive);
   - the response control on the right: a segmented pair in the item's own words, or chips for choices.
   - A positive answer opens the **attribute box** under the row: attribute labels in a 150 px column; chips, steppers, body maps and scales per `attribute_kinds`; `shown_when` rows appear and disappear as their parent changes.
   - A result pill sits at the right of a classified row.
6. **Blocks:** consciousness, AMTS, the power, reflex and plantar grids, and the pulses grid render as their own components (Section 5).
7. **Footer:** "← Social" and "Next: Summary →", as in v2.

**Rules**

1. **One system on screen, one part at a time.** The grid replaces scrolling through the whole examination.
2. **Tap first.** Numbers are typed only for vital signs. Steppers handle every other number.
3. **By exception.** "Everything else normal" per system (E2), and an "All 5" or "All 2" button per grid.
4. **Say it once** (E3).
5. **Show the grade with its reason** (E4).
6. **History leads, never decides.** Suggestions say why. They never answer, never flag, and are "done" when the target is recorded or marked not examined.
7. **Flags live in one place.** Examination flags join v2's Flags panel under the v2 rules (badges merge, most severe wins, restricted ones filtered).

**Budgets** (measured at Phase 0, met by Phase 7)

| Measure                                                                                                                                                                                      | Target                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Page-level vertical scroll on 1440×900                                                                                                                                                       | none                                                                         |
| Taps for a complete normal adult examination of General and the seven non-intimate systems (navigation, GCS, oxygen and the "all normal" grid buttons included; vital-sign numbers excluded) | ≤ 26                                                                         |
| Taps for the examination of the standard visit (clinical reference 2.12)                                                                                                                     | measure at P0; at most half the baseline                                     |
| Keystrokes for vital signs (BP, pulse, RR, SpO₂, temperature, glucose)                                                                                                                       | numbers only; no field-to-field mouse travel (Enter advances)                |
| Taps for the back-pain focused examination in the fixture (spine feel, leg power and reflexes grid, saddle sensation, gate, anal tone, prostate)                                             | ≤ 28                                                                         |
| System or part switch                                                                                                                                                                        | < 100 ms p95                                                                 |
| Classifier, flag and note recompute after a tap                                                                                                                                              | < 16 ms at 4× CPU throttle                                                   |
| JS added to the clerking route for the examination                                                                                                                                           | ≤ 45 KB gzipped, excluding the catalogue                                     |
| Examination catalogue                                                                                                                                                                        | 61.8 KB gzipped (352 KB raw); fetched once per session and cached; report it |

---

## 5. Interface specification

### 5.1 Vital signs (screenshot E01)

- **Table:** two columns, "Triage {time}" (read-only, with NEWS2 score badges) and "Now" (inputs, with live badges). The rows are in clinical order:
  - Blood pressure: one field, "118/76";
  - Pulse, with a rhythm chip. An irregular rhythm asks for a 60-second apical count and shows the apex-radial deficit;
  - Respiratory rate;
  - SpO₂. Scale 2 is shown only when a clinician has recorded a target of 88–92% for hypercapnic respiratory failure;
  - Temperature, with site;
  - Glucose, with a **required** context (random, fasting, two hours after food);
  - Air or oxygen and Consciousness, as linked lines that read from General ("Room air (from General)", "GCS 13/15 (E3 V4 M6) → choose ACVPU").
- **Arm and position** for BP default from the last set, and from the higher arm once `inter_arm_difference` has shown a persistent difference.
- **NEWS2 line:** the draft total, its band ("Urgent response threshold") and any parameter scoring 3. Messages follow the prototype, for example "Temperature up from 32.5 to 35.8 °C; it no longer scores."
- **Anthropometry** (a second card):
  - weight and height, each with how obtained (measured, estimated or stated);
  - BMI with its `bmi_who` class pill, or "not applicable" in pregnancy or under 20;
  - waist with its `waist_risk` pill (sex from the record, never assumed; the prototype hard-coded male);
  - waist-to-height ratio with its `whtr_band`;
  - MUAC, read from Nutrition.
- **Panels** (new, collapsed by default, opened by a suggestion or by "More measurements"):
  - **Lying and standing BP** (`orthostatic_hypotension`): lying, standing at 1 minute and at 3 minutes, and symptoms on standing;
  - **BP in both arms** (`inter_arm_difference`);
  - **Peak flow** (`acute_asthma_severity`): best of three, and personal best or predicted.
- **Save as a new set:** writes the set through the observation action, and the left rail updates. "Saved at 16:10 as a new set" replaces the button.
- The prototype's left rail wraps "Not recorded" beside Consciousness. Keep the value on one line (v2 5.1 already asks for this).

### 5.2 General (E02–E07)

**Appearance:**

- General appearance: a choice from "Looks well" to "Toxic-looking".
- Facies: presence, new.
- Distress: presence, with a severity block (E03):
  - type chips (respiratory, pain, agitation);
  - the **shared** respiratory signs (the same fact as Respiratory, work of breathing);
  - a 0–10 pain strip;
  - RASS +1 to +4;
  - a pill per component and an overall pill (`distress_severity`, the highest component). The respiratory grading is a MedSync draft (D-EX-06).
- Body build: a choice, with the BMI class shown beside the options.
- Posture: a choice. Lying comfortably, sitting comfortably and walking about are the expected options; the rest are findings.
- Odour: presence.

**Consciousness (the `consciousness` block, E02):**

- Method: GCS (default) or ACVPU.
- GCS: E, V and M as labelled rows of score buttons with the Glasgow structured wording. Each row has **NT** with a reason, and NT is never scored as 1. The total and its parts are shown in mono ("GCS 13/15 · E3 V4 M6").
- **Known baseline:** a toggle for a patient whose reduced GCS is their usual state (for example after a stroke). It lowers the reduced-GCS flag from urgent to caution and is written "(known baseline)".
- GCS-P is computed whenever both pupils are recorded, and shown and written only when a pupil is unreactive.
- Orientation follows the `orientation` rules:
  - V5: derived, read-only, "oriented to time, place and person";
  - V4: ask time, place and person;
  - V3 or below: "not assessable".
- ACVPU for NEWS2 follows `acvpu_from_consciousness`. GCS 15 gives A. Below 15, the clinician chooses, and NEWS2 stays "incomplete" until they do. The suggestion follows the corrected rules:
  - new confusion with eyes open suggests C;
  - obeying commands or any verbal response suggests at least V;
  - a motor response to pressure only suggests P;
  - only E1 V1 M1 suggests U.
- The Nervous system shows this block read-only as `link_consciousness`.

**Attachments (E04, E05):**

- **Oxygen:** a choice of room air or supplemental oxygen. Supplemental oxygen opens the modality (11 options), and each modality shows only its own properties through `shown_when`:
  - flows for the cannula, masks, free flow and HFNO;
  - the Venturi percentage;
  - the reservoir bag state;
  - HFNO temperature;
  - CPAP or PEEP;
  - IPAP, EPAP and back-up rate;
  - interface;
  - ETT size and depth;
  - ventilator mode, VT, rate and FiO₂;
  - every modality also has source, humidified and target SpO₂.
- **Vascular access:** None or In place. Type (8), then:
  - gauge with colour (peripheral and arterial);
  - site by line family;
  - lumens (central lines);
  - side and days in place;
  - the VIP score for peripheral and midline lines (a score of 2 or more flags "resite");
  - what is running.
- **Urinary catheter:** None or In place. Route (urethral, suprapubic, external); for urethral and suprapubic, size in Fr and 2- or 3-way; urine, bag volume and days.
- **Feeding or gastric tube:** None or In place. Tube, size, use, position check and aspirate. "Not yet confirmed" flags "do not feed".
- **Drains, stomas, splints.**
- **Mobility.**

**Signs (E06):**

- pallor (degree, where seen);
- jaundice;
- cyanosis (central or peripheral);
- clubbing (grades 1–5 in source wording; Schamroth window);
- lymph nodes (sites, side, size, consistency, mobility, tenderness, overlying skin);
- oedema (pitting or not; grade 1+ to 4+ with depth and rebound; extent; side);
- hand and nail signs;
- mouth (tongue bite added);
- **bleeding signs** (new): gums, nose, venepuncture or cannula sites, conjunctival haemorrhage, bruising, blood in the catheter, from the rectum, from wounds. With fever these fire "Fever with bleeding" (suspect VHF, isolate, IPC);
- **HIV-associated signs** (new, restricted `hiv`, lock icon): its options that other items own (oral thrush, angular cheilitis, Kaposi-like lesions, zoster scars, generalised nodes) are mirrors. Kaposi-like lesions are read-only here and true when either Mouth or Skin records them. Herpes zoster is split into active (owned here) and scars (mirrored from Skin). Each option shows a WHO stage hint ("stage 3"), and the app never stages.

**Hydration and nutrition (E07):**

- **Hydration (`classified`):** the ten GTFCC signs as chips.
  - With diarrhoea or vomiting in the history, a live result pill shows the grade and its reason, and the GTFCC plan appears as a hint (never written to the plan). Severe-column signs also count toward "some". Ticked signs below the threshold read "below the GTFCC threshold: reassess"; "no dehydration" means all signs normal.
  - Without diarrhoea or vomiting, the signs are recorded but not graded ("The GTFCC table grades dehydration from diarrhoea or vomiting").
  - When JVP is raised, crackles are present or sputum is frothy pink, the plan hint becomes "Fluid overload signs present: plan the fluids with care".
- **Nutrition (`measured`):**
  - a MUAC stepper (0.5 cm steps);
  - signs;
  - a "pregnant or breastfeeding a baby under 6 months" qualifier for female patients;
  - the `muac_uganda_imam` result by age band;
  - bilateral pitting oedema, from here or from Oedema, opens "Cause of the oedema". It makes SAM only when the clinician records it as nutritional (heart, kidney, liver and pregnancy causes excluded). Otherwise it reads "Bilateral pitting oedema: exclude heart, kidney, liver and pregnancy causes".
  - Under 15: "Paediatric criteria not in this catalogue".

### 5.3 Cardiovascular (E09, E10)

**Inspection:** precordium, peripheral stigmata, and a link to cyanosis and clubbing.

**Palpation:**

- the radial pulse, with rhythm, volume, character and delay;
- the **pulses grid** (block): seven arteries, right and left, each Present, Reduced, Absent or Bounding, with "All present";
- JVP: height in cm above the sternal angle, plus hepatojugular reflux, giant v waves, cannon a waves and Kussmaul sign;
- apex beat: position and character;
- heaves and thrills;
- capillary refill: "2 s or less" or "Delayed", with a stepper in seconds (delayed above `REF-EX-CRT`);
- calves;
- a link to oedema.

**Percussion:** cardiac dullness.

**Auscultation:**

- heart sounds (a `state`);
- added sounds, murmurs and bruits, all `presence`;
- murmurs record timing, where loudest, Levine grade 1–6, radiation, what makes it louder, and character, written as "pansystolic murmur, grade 3/6, loudest at the apex, radiating to the axilla".

### 5.4 Respiratory (E08, E11)

**Inspection:**

- work of breathing: `state` "Not increased/Increased", with the signs as the shared fact;
- breathing pattern, chest shape, audible sounds (stridor flags) and sputum.

**Palpation:** trachea (Central/Deviated, with direction), expansion, tactile fremitus with the lung map, and surgical emphysema.

**Percussion:** the note, with the lung map.

**Auscultation:** breath sounds, crackles (fine or coarse; timing), wheeze (type, phase, spread), pleural rub and vocal resonance.

**Lung map:** six front and six back zones, drawn as two chest outlines. The patient's right is on the viewer's left, with a "patient's right" caption. The note reads "in the right lower zone (back)".

**Classifier panels** appear in the Respiratory panel when they apply:

- **Acute asthma** (`acute_asthma_severity`): offered when there is wheeze, sym.wheeze or known asthma or COPD, and applied only when the clinician confirms "acute asthma" in the panel. Cardiac wheeze, anaphylaxis and COPD must not read as asthma.
  - It reads PEF, the SpO₂, RR and pulse of the draft set, the signs and consciousness, and shows each criterion that fired.
  - It is suppressed when SpO₂ scale 2 or a target of 88–92% is recorded.
- **CRB65** (`crb65`) when there is cough or fever with crackles, bronchial breathing or dullness. Each of its four points shows ticked or not.

### 5.5 Abdomen (E12)

**Inspection:** contour (with the "six Fs" as a likely-cause many), moves with breathing, wall findings, **stigmata of chronic liver disease** (new), umbilicus and hernias.

- In the liver-stigmata item, palmar erythema, leuconychia, Dupuytren's and asterixis mirror Hand signs, and fetor mirrors Odour.
- Any stigma opens an optional, clinician-chosen West Haven grade. It is suggested from orientation, GCS, behaviour and asterixis. Grade I has no asterixis, and grades III–IV often cannot show it.

**Palpation:**

- tenderness, with the nine-region map, degree, and guarding, rigidity, rebound, Murphy's, Rovsing's, psoas, obturator and percussion tenderness;
- masses (map, size, surface, consistency, mobility, features, tenderness);
- liver (cm below the costal margin, edge, surface, consistency, tenderness, pulsatile);
- spleen (Hackett grade 1–5 and cm, notch, tenderness);
- kidneys, bladder, and aorta (width).

**Percussion:** liver span, ascites (shifting dullness, fluid thrill, flank dullness) and the note.

**Auscultation:** bowel sounds, bruits and succussion splash.

**Abdomen map:** a 3×3 grid labelled with the region names, the patient's right on the viewer's left.

### 5.6 Nervous system (E13–E16)

**Higher functions:**

- a link to consciousness and orientation;
- behaviour;
- speech (dysarthria, expressive, receptive or global dysphasia, dysphonia, mute);
- memory;
- **visual fields** (new, needed by ROSIER);
- the **AMTS** block: 10 items, each a correct/incorrect toggle, with the score, and the cut-off from `REF-EX-AMTS-IMPAIRED`. Items 3, 8 and 9 show the Uganda wording (D-EX-08).

**Meninges:** neck stiffness, Kernig's and Brudzinski's. Hints say that a negative sign does not rule out meningitis.

**Cranial nerves:** I–XII in seven rows, each a `state` with its own attributes. Pupils record size per side in mm, reaction per side (brisk, sluggish, unreactive) and shape.

**Motor (the `motor_grids` block):**

- wasting and involuntary movements, tone, ankle clonus (beats), pronator drift, and **Hoffmann's sign** (new);
- **power:** MRC 0–5 per movement and side, with roots shown (C5 … S1). 4− and 4+ are optional modifiers (D-EX-09). "All 5";
- **reflexes:** NINDS 0–4 per reflex and side, with roots (4 is "enhanced, more than normal, includes clonus if present"; 3 is the upper half of normal). "All 2";
- plantars: flexor, extensor, equivocal or no response, per side;
- a **motor pattern hint** (`umn_lmn_pattern`) beside the grids. It counts grade 4 or clonus, not grade 3, as upper motor neurone. It is display only and never goes to the note.

**Sensory:** light touch and pinprick (degree, pattern, level or dermatome, side), vibration, joint position, **saddle sensation** (Intact/Reduced; reduced flags urgently) and Romberg's.

**Coordination:** finger-nose, heel-shin and dysdiadochokinesia.

**Gait:** gait and tandem gait.

**ROSIER panel:** shown when `rosier` applies. It reads the face, drift and power, speech and visual fields from the examination, and syncope and seizure from the history (confirmed in the panel). It stays hidden until glucose is recorded.

### 5.7 Spine and joints (E17)

**Look:** curvature (gibbus flags), and skin over the spine.

**Feel:** spinal tenderness on the **spine map** (C1 to S, as a vertical ladder), elicited on palpation or percussion; paraspinal; step deformity.

**Move:** range of movement.

**Special tests:**

- straight leg raise, with side, the angle at which it is limited, and crossed SLR;
- femoral stretch;
- the GALS screen, with joints, side and signs (a hot, swollen joint flags).

### 5.8 Skin

**Inspection:**

- rash (morphology, distribution; target lesions with mucosal involvement flag);
- petechiae or purpura (blanching or non-blanching);
- pressure injury: NPIAP stages 1–4, unstageable, deep tissue injury; cause (body pressure or device); sites including mucous membrane;
- lesions.

**Palpation:** temperature, and a link to turgor.

### 5.9 Eyes, ENT and neck

**Eyes:** links to conjunctivae and sclera, and to pupils; red eye (with reduced vision or photophobia flags); fundoscopy.

**Ears and nose:** otoscopy and nose.

**Mouth and throat:** throat (membrane and peritonsillar swelling flag); a link to the mouth.

**Neck:** goitre (WHO grade 1–2, type; a goitre with stridor or retrosternal extension flags); a link to the lymph nodes.

### 5.10 Rectal and genital (E18, E19)

- **The gate (`gates.intimate`):** reason, consent and chaperone.
  - The chaperone is "offered and present" (name and role), "offered and declined", or "not offered: emergency".
  - The prototype's "Relative present" chip becomes a note under the choice: "A relative may stay but is not a chaperone."
  - Items unlock when the gate is complete.
- **Perianal.**
- **Digital rectal:**
  - anal tone (Normal/Reduced; reduced flags urgently);
  - rectal mass (cm from the verge, wall);
  - prostate (size, consistency, surface, median sulcus, tenderness), male only;
  - on the glove.
- **Genitalia:** external genitalia and scrotum and testes, restricted `sexual_reproductive_health` (D-EX-12). High-riding testis and an absent cremasteric reflex are new options.

### 5.11 Feet (new; no screenshot)

The IWGDF 2023 screen, in four parts:

- **Look:**
  - foot ulcer: site (forefoot, or midfoot and hindfoot), side, area in cm², depth, the IWGDF/IDSA infection signs (deep involvement means deeper than skin **and subcutaneous tissue**), and osteomyelitis (not suspected, suspected, confirmed);
  - gangrene: dry or wet;
  - deformity, including minor and major amputation;
  - skin and nails.
- **Feel:** a link to the dorsalis pedis and posterior tibial pulses in the pulses grid; temperature (Equal/Different).
- **Sensation:**
  - 10 g monofilament: sites not felt per foot, of 3. The hint gives the IWGDF method; the sites come from the IWGDF figure and are not named in text;
  - 128 Hz fork at the great toe;
  - the Ipswich touch test, only when neither tool is available.
- **Risk history:** previous ulcer, previous amputation, end-stage kidney disease.

Three result pills sit at the top of the Feet panel:

- the **IWGDF risk category** (0–3, with its screening interval);
- the **infection grade** (1–4). Grades 3 and 4 need local infection (two or more local signs) first. "(O)" is added when the clinician records osteomyelitis; probing to bone only offers "(O) suggested";
- **SINBAD**, with each component shown. Its ischaemia point needs no palpable pedal pulse on that side; one palpable pulse scores 0. This differs from the IWGDF PAD sign used for the risk category.

IWGDF risk categories are for feet without an active ulcer. With an active ulcer, the pill adds "active ulcer: manage the ulcer; the screening interval applies after healing".

Show "incomplete" until both feet have sensation and pulses recorded.

### 5.12 Suggestions

The strip reads `suggestion_rules` (47 rules). Each rule's `when` reads the history answers (symptoms, red flags, past conditions), the patient (age, sex) and NEWS2.

- The chip label and reason come from the rule. The reason fills tokens such as {red_flags}.
- A chip is "done" when its target is recorded or marked not examined.
- The chips are ordered: to do first, then urgent sources (red-flag rules), then the rest.
- The prototype showed four back-pain chips and a "Re-measure vital signs" chip. The catalogue adds the full set, for example:
  - chest pain → BP in both arms, pulses, calves;
  - polyuria → hydration signs, glucose with context, Kussmaul breathing, fundi, foot screen, waist;
  - diarrhoea or vomiting → hydration (GTFCC), lying and standing BP;
  - fever → non-blanching rash, bleeding signs, neck stiffness, spleen (Hackett);
  - confusion → GCS, AMTS, glucose, breath odour, asterixis.

### 5.13 Flags and the note

- **Flags:** 84 rules, 53 of them urgent and 4 restricted. They are evaluated by the v2 flag engine with the examination atoms (`flag_rule_language`), merged with history flags, and shown in the Flags panel.
  - Badges are finding words with tokens: "GCS 8", "Glucose 2.6", "Weakness, hip flexion", "Sensory level T10".
  - Each badge button opens the system and part it came from.
- **Note:** the Examination block follows `composer.rules`. The current system's paragraph is highlighted. "Edit text" locks the block as in v2.
  - The vital-signs line comes first. The anthropometry line follows when any of it is recorded.
  - "Not examined: rectal (patient declined); fundi (no ophthalmoscope)."

### 5.14 Screenshots (1440×1024)

| File                   | State                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| E01 `ExamV2`           | Vital signs: triage and new draft, NEWS2 badges, air/oxygen and consciousness links, anthropometry |
| E02 `ExamV2Gcs`        | Consciousness: GCS 13 (E3 V4 M6), orientation asked because V4                                     |
| E03 `ExamV2Appearance` | Distress present: respiratory (shared signs) and pain 6/10, moderate                               |
| E04 `ExamV2Oxygen`     | Supplemental oxygen: nasal cannula properties                                                      |
| E05 `ExamV2Cpap`       | CPAP (PEEP, interface, FiO₂) and a urethral catheter                                               |
| E06 `ExamV2Signs`      | Signs with grades                                                                                  |
| E07 `ExamV2Hydration`  | GTFCC signs → severe dehydration with its reason                                                   |
| E08 `ExamV2RsInsp`     | Respiratory inspection: work of breathing as the shared fact                                       |
| E09 `ExamV2CvsPalp`    | Cardiovascular palpation with the pulses grid                                                      |
| E10 `ExamV2Murmur`     | Murmur present: timing, area, Levine grade, radiation                                              |
| E11 `ExamV2Chest`      | Crackles on the lung map (front and back)                                                          |
| E12 `ExamV2Abdomen`    | Tenderness and masses on the nine-region map                                                       |
| E13 `ExamV2Higher`     | Higher functions: consciousness link, AMTS                                                         |
| E14 `ExamV2Cranial`    | Cranial nerves                                                                                     |
| E15 `ExamV2Motor`      | Motor: power and reflex grids                                                                      |
| E16 `ExamV2Sensory`    | Sensory, with saddle sensation                                                                     |
| E17 `ExamV2Spine`      | Spinal tenderness on the spine map                                                                 |
| E18 `ExamV2Gate`       | The intimate gate before rectal and genital                                                        |
| E19 `ExamV2Prostate`   | Prostate with properties                                                                           |

### 5.15 Tablet and phone

- **Tablet:** as in v2 5.12. The systems grid becomes 4 columns, and the attribute box keeps its 150 px label column.
- **Phone** (follow `PROMPT-CLERKING-MOBILE.md`, restyle R-series):
  - the systems grid becomes a two-column list of pills;
  - part tabs scroll horizontally;
  - each item row stacks its label above its control;
  - the attribute box opens as a bottom sheet with Done;
  - grids show one side at a time with an R/L switch;
  - body maps keep a 44 px minimum zone;
  - the suggestion strip sits under the step header.
- Nothing covers the note or the sign bar.

### 5.16 Keyboard

With focus outside text fields:

- `[` and `]`: previous and next part;
- `Shift+[` and `Shift+]`: previous and next system;
- `a` and `p`: the negative and positive answer of the focused row;
- `e`: Everything else normal (with confirm);
- `x`: Not examined;
- `g`: jump to GCS.

In the vitals table, Enter advances to the next field. v2's keys still apply.

---

## 6. The catalogue (contract)

- **File:** `clerking-exam-catalogue.v1.json` (MS-EMR-EXAM-CAT-001, 1.0.0-draft). Load it once through the v2 server-side loader, validate it with a Zod schema, and serve it with its version and hash.
- **Contents:**

  | Contents                               | Count                                                                       |
  | -------------------------------------- | --------------------------------------------------------------------------- |
  | Systems (General, eight systems, Feet) | 10                                                                          |
  | Parts                                  | 41                                                                          |
  | Answerable items                       | 140                                                                         |
  | Links                                  | 9                                                                           |
  | Attributes                             | 281                                                                         |
  | Options                                | 959                                                                         |
  | Items by response type                 | presence 47, state 76, test 6, device 4, choice 5, classified 1, measured 1 |
  | Scales                                 | 17                                                                          |
  | Classifiers                            | 24                                                                          |
  | Reference entries (`REF-EX-*`)         | 33, 17 from opened sources                                                  |
  | Sources                                | 49, 41 opened and verified on 27 Sep 2026                                   |
  | Flag rules (urgent / restricted)       | 84 (53 / 4)                                                                 |
  | Suggestion rules                       | 47                                                                          |
  | Shared facts                           | 13                                                                          |
  | Not-examined reasons                   | 8                                                                           |
  | Intimate gate                          | 1                                                                           |
  | Prototype-parity changes               | 24                                                                          |
  | Open decisions (`decisions_needed`)    | 10                                                                          |

- **Ids:**
  - items are `ex.<system>.<item>`;
  - attribute and option ids are local to their item;
  - `prototype_id` traces each back to the prototype;
  - symptom (`sym.*`), past-condition and `REF-FLAG-*` ids come from MS-EMR-CLERK-CAT-001. The catalogue check validates them across both files.
- **Statuses:** as in v2 (`draft`, `draft-verified-source`, `draft-unverified`, `signed`).
  - A classifier whose reference is unsigned shows "Awaiting sign-off" instead of a result.
  - A flag whose reference is unsigned does not fire.
- **Reconciliation:**
  - Map every item, and every option that is a finding, to the CFC finding vocabulary in `docs/emr/clerking-v2/exam/exam-token-map.csv`. Propose missing tokens as a CFC addendum; never keep a private copy.
  - Devices map to CFC "device in situ" concepts if they exist; if not, propose them.
  - Report the counts at STOP 0.
- **Adding content needs no code:** prove it with a fixture that adds one item of each response type and one classifier band.

---

## 7. Engines (pure, no I/O, in `lib/clerking/exam/**`)

| Module           | Responsibility                                                                                                                                                                                                                                                     | Minimum tests                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalogue.ts`   | Zod schema; indexes (item by id, items by system and part, attributes with `shown_when`, mirrors, links, shared facts); sex and age applicability                                                                                                                  | Schema round-trip; every link and mirror resolves; every `shown_when` names a real option; adding an item of each type needs no code                                                                                                                                                                                                                                                    |
| `answers.ts`     | The entry model (`unrecorded` / `negative` / `positive` / `not_examined` + reason; choice; attributes as option ids or numbers); tap-again clears; hidden attributes are dropped on save; mirror and shared writes; `everythingElseNormal(system, part?)` under E2 | Every response type and attribute kind; mirrors write once; E2 never changes a recorded answer, a link, a device or a block; undo restores exactly; an untouched stepper stores nothing                                                                                                                                                                                                 |
| `vitals.ts`      | Parse one-field BP; plausibility; unit conversion (mg/dL → mmol/L); the draft set → observation payload; BMI, waist-to-height ratio; NEWS2 through `lib/triage`                                                                                                    | BP parsing edge cases; boundaries; NEWS2 identical to the triage engine on 200 random sets                                                                                                                                                                                                                                                                                              |
| `classifiers.ts` | Every classifier in the catalogue, table-driven from the JSON                                                                                                                                                                                                      | For each band edge from each REF: value −ε, value, value +ε. GTFCC truth table (danger alone; 2 severe; 2 some; mixed columns such as drinks poorly with restless, or very slow pinch with rapid pulse, giving "some"; one sign giving "below threshold"; no diarrhoea or vomiting giving "not graded"). IMAM per age band and oedema override. IWGDF per-foot logic. SINBAD components |
| `scores.ts`      | GCS (NT), GCS-P, AMTS, CRB65, ROSIER (with the glucose pre-check), orientation and ACVPU rules                                                                                                                                                                     | NT never scores; GCS-P only with an unreactive pupil; ACVPU never inferred below 15; ROSIER hidden without glucose                                                                                                                                                                                                                                                                      |
| `flags.ts`       | The v2 engine extended with the examination atoms (`finding`, `item/attribute`, `classifier`, `score`, `grid`, `vital`, `panel`, `derived`, `orientation`, `acvpu_not`) and the history atoms                                                                      | One positive and one negative fixture per rule (84); unsigned-reference rules do not fire; badge tokens fill; merging with history badges (ACVPU with NEWS2)                                                                                                                                                                                                                            |
| `suggest.ts`     | Evaluate `suggestion_rules`; done status; ordering                                                                                                                                                                                                                 | One fixture per rule (47); a suggestion never changes an answer                                                                                                                                                                                                                                                                                                                         |
| `compose.ts`     | The examination paragraph per `composer.rules`                                                                                                                                                                                                                     | Snapshots for the fixtures; property: every positive appears; no unrecorded item appears; links and mirrors written once; hints never appear; restricted items excluded from patient-facing text                                                                                                                                                                                        |

**Property tests** (Phase 2):

- for random entry sets, the composer text contains every positive and no unrecorded item;
- classifiers are monotonic where the source is (more GTFCC signs never lower the grade; a lower MUAC never raises the class);
- E2 is idempotent and reversible;
- shared and mirrored facts never disagree between views.

**Fixtures:**

1. **Patient Three-3** (prototype default): GCS 13, CPAP with catheter, moderate distress, severe dehydration, murmur, crackles, abdomen findings, cranial nerves, spinal tenderness at L3, and a prostate after the gate.
2. **Chest pain:** a systolic difference of 24 mmHg between the arms, and absent left radial and femoral pulses.
3. **Diabetic foot:** a left forefoot ulcer of 2.5 cm² over the metatarsal heads, skin-deep, with local warmth and redness of 2 cm or more; an absent left dorsalis pedis with a palpable posterior tibial; 2 of 3 monofilament sites not felt on the left; a previous right foot ulcer. The expected results are:
   - IWGDF risk 3 (loss of protective sensation, PAD sign, previous ulcer), shown with "active ulcer";
   - infection grade 3 (moderate);
   - SINBAD 3 (site 0, ischaemia 0 because a pedal pulse is palpable, neuropathy 1, bacterial infection 1, area 1, depth 0).
4. **Asthma:** PEF 30%, SpO₂ 91%, speaks in words only → life-threatening.
5. **Pneumonia:** cough and fever, crackles in the right lower zone, RR 32, BP 88/58, age 70, new disorientation to time → CRB65 4.
6. **Stroke:** UMN facial weakness on the right, right arm drift, expressive dysphasia, glucose 6.2 → ROSIER +3.
7. **Meningococcal:** fever, neck stiffness, non-blanching rash.

List every badge difference from the prototype (for example, "Possible tension pneumothorax" becomes "Deviated trachea, hyper-resonant chest", and weakness is urgent only with a history of weakness), and have the CSO confirm each one.

---

## 8. Data

- **Draft payload.** v2's `schema: 2` draft gains an `exam` section:
  - `catalogueVersion`;
  - `entries`: item id → `{ state, choice?, attrs, reason? }`;
  - `blocks`: consciousness (method, E/V/M with NT reasons, orientation, ACVPU), AMTS answers, power, reflexes, plantars and pulses;
  - `panels`: postural BP, both arms and PEF;
  - `gate`: reason, consent, chaperone name and role, time and actor.

  It holds option ids only. Old drafts with a free-text examination open read-only in "Previous format", with "Continue in the new format"; nothing is migrated silently.

- **Commit rule:**
  - **Vital signs** commit immediately as a new observation set through the existing action (D-EX-11). They are observations that NEWS2 and monitoring need now, not note text.
  - **Findings** commit at signing as CFC finding facts with qualifiers, in the note's transaction. Qualifiers use option ids and the token map.
  - **Classifier results** (GTFCC, IMAM, IWGDF, SINBAD, CRB65, BMI class) are stored as derived facts with their inputs and rule version, never as free assertions.
  - **Devices** commit as "device in situ" findings. A lines, drains and airways register is a later seam (Section 16).
- **Flags** are derived at read time and snapshotted into the note at signing (D-CV-05).
- **Not examined** is stored with its reason id.
  - "Equipment not available" stores the equipment id. This makes a facility equipment-gap report possible later (D-EX-19), without building it now.
- **RLS:** no new tables unless Phase 0 proves a need. The gate record lives in the draft and the signed note. It is audited through the existing audit table.

---

## 9. Server actions

Reuse, don't duplicate:

- `saveNoteDraft` (payload with `exam`, version check);
- `signNote` (commits findings and derived facts, and snapshots flags);
- the observation write (vital signs).

Add only what Phase 0 proves missing, under the house contract: `'use server'`, Zod, AAL2, scope and cadre checks, one transaction, one audit row, an idempotent client key, and a `{ id, serverTime }` return. A likely candidate is `recordIntimateExamGate` if the audit must be written before signing; decide at GATE A.

---

## 10. Accessibility, motion, colour

- **Standard:** WCAG 2.2 AA in light and dark.
- **Targets:** 44×44 px on touch. Chips and score buttons may be 30 px tall on desktop pointer only.
- **Segmented pairs:** grouped buttons with `aria-pressed`. The group's accessible name is the item label, and each button's name is its own words.
- **Grids:** a table with row headers (movement and root) and column headers (Right, Left). Each score is a radio group, and an arrow key moves the score.
- **Body maps:** each zone is a toggle button named in words ("Right lower zone, back"). The map has a text list alternative, and the viewer-orientation caption is announced.
- **Result pills:** live regions (`polite`). The accessible text includes the reason.
- **Locks:** the gate and restricted items announce "locked, needs consent and chaperone" or "restricted".
- **Colour:**
  - teal marks buttons, positives and "done";
  - indigo marks place and suggestions;
  - amber is caution;
  - red follows D-CV-03 (urgent badges in the Flags panel only).
  - Result pills use the tone scale (ok, caution, strong) with text, never colour alone. Extend the red-scarcity tests to every new component.
- **Motion:** reduced motion honoured; no animated layout.

---

## 11. Phases and gates

### Phase 0: Discovery and baseline (no product changes)

- **Q1** The branch state of clerking v2. Is `CLERKING_V2` on anywhere? Is Chroma in?
- **Q2** How the current examination step stores data (confirm E-1 to E-8), and the counts of drafts and signed notes with examination content.
- **Q3** The observation write action: which fields it takes (BP as one or two fields, rhythm, site, glucose context, air or oxygen, ACVPU, weight, height, waist, MUAC). List what is missing.
- **Q4** The NEWS2 module: its inputs, whether it accepts a draft set, and how it handles scale 2.
- **Q5** The CFC finding vocabulary: produce the token map (Section 6) and count mapped, proposed and device concepts.
- **Q6** How restricted classes are filtered in the note, prints and exports, and whether `sexual_reproductive_health` exists.
- **Q7** The audit table: can the intimate gate be audited without a new table?
- **Q8** The patient record: are sex and date of birth always present? How is pregnancy recorded (needed for the BMI and IMAM rules)?
- **Q9** The six external sources marked `verified: false`, including the UCG 2023 hypoglycaemia threshold (section 1.1.6), the ROSIER weights and the Ipswich touch test threshold. Open each and report.
- **Q10** Existing keyboard handling on the desk.

**Baseline:**

- screenshots of the current examination step at 390×844, 834×1194 and 1440×900, light and dark;
- the standard-visit examination timed in taps, keystrokes and seconds;
- failing tests for E-2 (glucose twice, no context), E-3 (no air or oxygen or ACVPU: NEWS2 incomplete) and E-8 (the same fact entered twice).

**STOP 0.** Report Q1–Q10, the token map counts, the baseline and the failing tests.

### Phase 1: GATE A (examination) proposal (documents only)

Write `docs/emr/clerking-v2/exam/gate-a-proposal.md` containing:

- the port plan (component list by response type and block, with reuse from v2);
- the payload schema and old-draft handling;
- **the clinical sign-off pack:**
  - every scale, classifier and flag rule with its source and status;
  - the REF entries with proposed values;
  - `decisions_needed` (10);
  - the parity list (24);
  - the draft-unverified items;
  - the AMTS Uganda wording;
- the gate wording;
- the test plan;
- the decision table (Section 15) with a signature block.

**STOP 1.** Nothing proceeds without signatures.

### Phase 2: Catalogue and engines (pure)

The Section 7 modules, the Zod schema, the fixtures and the property tests. Extend `npm run clerking:catalogue-check` to validate both catalogues and the ids that cross between them, and to print the counts in Section 6. CI runs it.

**STOP 2.** Report:

- test counts;
- the classifier edge table (every REF, three values each);
- the rule coverage table (84 flags and 47 suggestions, positive and negative);
- property-test results;
- the prototype-parity diff for the fixtures.

### Phase 3: Vital signs and General (behind `CLERKING_V2`)

- the vitals table, anthropometry, the three panels and "Save as a new set";
- the consciousness block;
- appearance with distress;
- attachments;
- signs (with HIV-associated mirrors and the lock);
- hydration and nutrition;
- the systems grid, part tabs, item rows and the attribute box;
- E2, Clear and Not examined.

**STOP 3.** Report:

- screenshots against E01–E07 (light and dark);
- NEWS2 parity with triage;
- observation writes proven (an action matrix);
- axe with 0 serious or critical issues;
- red-scarcity tests;
- flag-off screenshots identical to the baseline.

### Phase 4: Cardiovascular, Respiratory, Abdomen

The items, the pulses grid, the lung and abdomen maps, liver stigmata with West Haven, and the asthma and CRB65 panels.

**STOP 4.** Screenshots against E08–E12; fixtures 2, 4 and 5 (badges and composer snapshots); map accessibility.

### Phase 5: Nervous system, Spine and joints, Skin, Eyes ENT and neck

Higher functions with AMTS and visual fields, meninges, cranial nerves, the motor grids with the pattern hint, sensory, coordination, gait, the ROSIER panel, the spine map, and skin and ENT.

**STOP 5.** Screenshots against E13–E17; fixtures 1, 6 and 7; the back-pain tap count against its budget.

### Phase 6: Rectal and genital gate, Feet, suggestions

The gate and its audit, the restricted genital items, the Feet system with its three classifiers, and the suggestion strip with done states.

**STOP 6.** Screenshots against E18–E19 and new ones for Feet; fixture 3; gate audit rows; restricted-item exclusion from patient prints; all 47 suggestion rules exercised in Playwright.

### Phase 7: Hardening and a clinician trial

- the performance budgets;
- tablet and phone (5.15);
- offline (reuse the optimistic queue; vital-sign saves queue and show "pending");
- dark mode;
- ADRs;
- a timed trial with three to five clinicians, comparing the old and new examination on the standard visit and on one focused examination (back pain or chest pain). Report median time, taps, keystrokes, errors, and flags seen versus missed.

**STOP 7 (final).** The Section 14 table, filled in.

---

## 12. Security, privacy, audit

- AAL2, hospital scope, reception blocked. Every write and every reveal is audited, and so is every gate completion.
- Draft content is encrypted as today.
- Restricted items (HIV-associated signs, genital findings):
  - carry lock marks;
  - appear in clinical views only;
  - are excluded from patient prints, SMS, push and exports;
  - produce restricted flags that are filtered by access.
- Vital-sign sets carry the actor and time. The implausible-value confirm is recorded.
- If the server client still reads a legacy `service_role` key, flag it.

## 13. Performance budgets

As in Section 4. Also:

- a fixed query count per render;
- zero layout shift when a result pill or attribute box appears (reserve the space);
- catalogue indexes built once per session.

---

## 14. Numbers to report at the final STOP

| Metric                                                              | Baseline | Target                       | Result |
| ------------------------------------------------------------------- | -------- | ---------------------------- | ------ |
| Page-level scroll on 1440×900                                       | P0       | none                         |        |
| NEWS2 sets saved incomplete for lack of air/oxygen or ACVPU         | P0       | 0                            |        |
| Glucose values without a context                                    | P0       | 0                            |        |
| The same fact answerable in two places with different values        | P0       | 0                            |        |
| "Normal/Abnormal" shown on a non-`state` item or in a counter       | P0       | 0                            |        |
| Taps, complete normal adult examination (General and seven systems) | P0       | ≤ 26                         |        |
| Taps, back-pain focused examination                                 | —        | ≤ 28                         |        |
| Catalogue items rendering by type                                   | —        | 140 of 140                   |        |
| Classifier band edges tested                                        | —        | all REF edges                |        |
| Flag rules with positive and negative tests                         | —        | 84 of 84                     |        |
| Suggestion rules with fixtures                                      | —        | 47 of 47                     |        |
| Rules or classifiers live on an unsigned reference                  | —        | 0                            |        |
| NEWS2 parity with the triage engine (random sets)                   | —        | 100%                         |        |
| Intimate examinations without a gate record                         | P0       | 0                            |        |
| Restricted items in patient-facing outputs                          | —        | 0                            |        |
| axe serious or critical                                             | P0       | 0                            |        |
| JS added / catalogue gzipped                                        | —        | ≤ 45 KB / report             |        |
| Clinician trial: median examination time, old and new               | P0       | lower; report the difference |        |

---

## 15. GATE A (examination) decisions (Fadhul owns; recommendations given)

| #       | Decision                      | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-EX-01 | Design authority              | The round-3 prototype and screenshots define layout and interaction; the catalogue defines content, and its parity list overrides the prototype; the repo wins on mechanics.                                                                                                                                                                                                                                                                                                     |
| D-EX-02 | Response types                | Adopt E1: nine types. Normal/Abnormal only for `state` items (47 use those words because a normal state exists, such as the cranial nerves, apex beat and prostate; the other 29 use their own words). System and part counters say "findings" and "nothing found".                                                                                                                                                                                                              |
| D-EX-03 | "Everything else normal"      | Adopt E2's scope. Oxygen and consciousness always need an explicit answer.                                                                                                                                                                                                                                                                                                                                                                                                       |
| D-EX-04 | Consciousness                 | GCS by default, ACVPU allowed. NT is never scored. GCS 15 gives A. Below 15, the clinician chooses ACVPU from a corrected suggestion; it is never inferred. GCS below 15 is **urgent** (matching ACVPU C, V or P), or caution when marked as the known baseline. GCS-P is shown when a pupil is unreactive.                                                                                                                                                                      |
| D-EX-05 | Orientation                   | Derived from V5; asked at V4; "not assessable" at V3 or below. It is asked once, in General, and shown in the Nervous system.                                                                                                                                                                                                                                                                                                                                                    |
| D-EX-06 | Distress severity             | Present or absent. When present, it is graded by component (respiratory by the MedSync draft rule, pain by NRS bands, agitation by RASS), and the overall grade is the highest. **Sign the respiratory rule or replace it**: no single validated adult score exists. With asthma, the SIGN 158 severity takes precedence.                                                                                                                                                        |
| D-EX-07 | Nutrition                     | Uganda IMAM 2016 bands by age (adult SAM under 19.0 cm), not the 18.5 cm the prototype used. In adults, bilateral pitting oedema is SAM only when the clinician records it as nutritional, after excluding heart, kidney, liver and pregnancy causes (IMAM advises caution). Adults only; paediatrics is next round.                                                                                                                                                             |
| D-EX-08 | AMTS                          | Cut-off: **6** (BGS) or 7 (the prototype). Recommend 6 for the flag and show the score always. Sign the Uganda wording of items 3, 8 and 9, and plan a local validation.                                                                                                                                                                                                                                                                                                         |
| D-EX-09 | Power and urgency             | Power of 3 or less is urgent only with new weakness in the history, otherwise caution. The MRC 4− and 4+ modifiers are allowed.                                                                                                                                                                                                                                                                                                                                                  |
| D-EX-10 | Oxygen and support            | 11 modalities with per-modality properties. CPAP, BiPAP and ventilation make an urgent badge naming the modality. Venturi is recorded by percentage; colours vary by brand. SpO₂ scale 2 only with a recorded clinician decision.                                                                                                                                                                                                                                                |
| D-EX-11 | Vital-sign commit             | Immediate, as a new observation set on "Save as a new set", like v2 medicines. The note reads the saved set.                                                                                                                                                                                                                                                                                                                                                                     |
| D-EX-12 | Intimate gate and restriction | Gate before rectal and genital items. Genital findings are `sexual_reproductive_health`. Rectal findings stay standard. A relative is not a chaperone (GMC). The UMDPC code has no chaperone clause, so this is MedSync policy grounded in the GMC guidance and the UMDPC consent, privacy and decency duties.                                                                                                                                                                   |
| D-EX-13 | HIV-associated signs          | A restricted item that mirrors the standard findings (oral thrush and others stay standard where they are owned). WHO stage hints are shown and never assign a stage. Oral candidiasis and Kaposi-like lesions make restricted caution flags ("offer HIV testing if status unknown").                                                                                                                                                                                            |
| D-EX-14 | Feet                          | Always in the systems grid, and suggested for diabetes, polyuria or claudication. IWGDF 2023 risk, IWGDF/IDSA infection grade and SINBAD. Monofilament sites follow the IWGDF figure.                                                                                                                                                                                                                                                                                            |
| D-EX-15 | New scores                    | CRB65 (NICE NG250), acute asthma (SIGN 158), ROSIER (NICE NG128 names it for emergency departments; verify the weights), orthostatic hypotension (2011 consensus), inter-arm difference and severe hypertension at 180/120 (NG136), hypoglycaemia levels (ADA 2025, reconciled with UCG 2023). Acute asthma severity applies only once the clinician confirms asthma, and never with a hypercapnic oxygen target. **No qSOFA:** SSC 2026 recommends NEWS2 over it for screening. |
| D-EX-16 | Badge wording                 | A finding, a measured value, or a named standard scale with its result (E5). The prototype's "Possible tension pneumothorax" becomes "Deviated trachea, hyper-resonant chest"; "Severe acute malnutrition" becomes "MUAC 17.5 cm".                                                                                                                                                                                                                                               |
| D-EX-17 | Composer                      | Sign `composer.rules` and the seven fixture snapshots as the house style for examination notes.                                                                                                                                                                                                                                                                                                                                                                                  |
| D-EX-18 | Suggestions                   | Advice only; "done" when recorded or marked not examined; never auto-answer.                                                                                                                                                                                                                                                                                                                                                                                                     |
| D-EX-19 | Not-examined reasons          | 8 reasons, including "equipment not available" with the equipment named. Store the ids so a facility equipment-gap report can follow (a later build, valuable for procurement and partners).                                                                                                                                                                                                                                                                                     |
| D-EX-20 | Age scope                     | This catalogue is for patients aged 15 and over. Below 15, adult-only classifiers show "not applicable" and a banner says the paediatric examination is not yet structured. Adult BMI classes start at 20 (WHO); ages 15–19 show "BMI-for-age not structured".                                                                                                                                                                                                                   |
| D-EX-21 | Hydration scope               | The GTFCC table grades dehydration only with diarrhoea or vomiting in the history. Elsewhere the signs are recorded ungraded. The plan hint is replaced when fluid overload signs are present.                                                                                                                                                                                                                                                                                   |
| D-EX-22 | Flag levels                   | Urgent: melaena, severe pallor, hot swollen joint, level 1 hypoglycaemia, painful retention, fever with bleeding (VHF), severe hypertension with organ signs, shock, tamponade, Kussmaul breathing with high glucose. Caution: an isolated absent foot pulse, severe hypertension alone. The CSO confirms each level at sign-off.                                                                                                                                                |

**Prerequisites:** D-CV-01 to D-CV-16 (clerking v2), plus D-EMR-01, D-EMR-13 and D-CFC-09.

---

## 16. Out of scope (leave clean seams)

- **Other examinations:** paediatric examination (growth, WHO z-scores, IMCI or ETAT signs), and obstetric, gynaecological and breast examination (with D-CV-14).
- **Other scored tools:** the mental state examination (restricted `mental_health`), NIHSS and ophthalmic detail. CURB65 needs urea, so it waits for the results link; CRB65 is used until then.
- **Measurements:** ankle-brachial index (the IWGDF PAD assessment beyond pulses).
- **Registers and records:** a lines, drains and airways register (insertion date, due-for-change alerts from device findings), a wound and pressure-injury care plan, and clinical photographs of lesions (consent, restricted storage).
- **Integrations and reports:** Bluetooth or USB device integration (BP, SpO₂, glucose); the facility equipment-gap report (D-EX-19); HMIS reporting of SAM counts (confirm the form first).
- **Mobile:** a mobile (Expo) examination.

## 17. ADRs (next free numbers)

- The examination as data: response types, statuses, token map.
- Classifiers and scores: table-driven, REF-bound, and shown with their inputs.
- Shared facts, links and mirrors: one owner per fact.
- The intimate-examination gate and restricted genital findings.
- Vital signs as immediate observation sets; NEWS2 reuse.
- Findings, not interpretations (hints never enter the note).

## 18. Definition of Done

- [ ] E-1 to E-8 resolved, or deferred with a reason.
- [ ] All 140 items render by response type; every classifier and score is tested at every REF edge; 84 flag rules and 47 suggestion rules are tested both ways; unsigned references never fire.
- [ ] Normal/Abnormal appears only on `state` items; no counter says "abnormal".
- [ ] No page-level scroll at 1440×900; the screenshots match E01–E19 within the design system in force.
- [ ] NEWS2 is never incomplete for lack of air/oxygen or ACVPU once General is answered; its values match the triage engine.
- [ ] Shared and mirrored facts never disagree; "Everything else normal" never overwrites; unrecorded is never written as normal.
- [ ] The intimate gate is enforced and audited; restricted items are locked and excluded from prints and exports.
- [ ] axe clean; red-scarcity tests green; reduced motion honoured; keyboard complete; phone and tablet per 5.15.
- [ ] With `CLERKING_V2` off, the current desk is unchanged; old drafts still open.
- [ ] ADRs written; the clinician trial reported; the final table filled in; the diff on `feat/clerking-exam-v2` is reviewable.

## 19. Parallel reminders (flag if touched)

- **NCD diabetes engine:** glucose now arrives with its context, and the foot risk category is a new structured input. Check its fixtures.
- **Monitoring engine** (next Tier 3 prompt): it will own NEWS2 re-scoring and escalation. Examination badges are display only. Device findings are the seed for due-for-change alerts.
- **IPC:** the fever-with-bleeding, non-blanching rash and throat membrane flags feed the IPC prompt's notifiable-condition sheet. They never isolate or notify on their own. Align the fever threshold with the Uganda MoH VHF case definition in force.
- **Nutrition:** SAM by MUAC should later offer the OTC/ITC referral pathway from the Uganda IMAM guideline. Advice only here.
- The Pharmacy Board of Uganda, never PSU. The Supabase key change.
