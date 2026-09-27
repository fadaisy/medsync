# Clerking desk v2, Examination: stop reports

Built on `feat/clerking-exam-v2` in `~/Desktop/medsync-release`, cut from `feat/clerking-v2` at `eec6f5c`. The owner asked for all gates in one run, with few agents and only the relevant skills.

## STOP 0: discovery and baseline (2026-09-27)

### Answers

| Q   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Clerking v2 is not in `main`. `feat/clerking-v2` is pushed (`origin/feat/clerking-v2` = `eec6f5c`), so this branch is cut from it. `CLERKING_V2` is on for at least one hospital in production: its database holds one draft on `tpl.clerking.adult_v2`. The flag is set in Vercel, not in the local env file. Chroma is not in `main` (worktree `medsync-chroma`, uncommitted), so the tokens in force are today's (D-CV-11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Q2  | Step 07 is v1's `s11` rendered by `SectionBody` inside the v2 shell (`V1_SECTION.exam = "s11"`). It holds seven General chips (`FindingChip`, three states, tap cycles not asked → present → absent), the vitals entry form (`VitalsEntryForm`, 11 fields), and one free-text box for the systems. Production: 1 draft on the v2 template, 0 signed notes, 2 legacy clerkings, 0 CFC-coded observations. Further production counts were refused by the session's permission check, so the rest of §14's production baselines are the owner's to run (query list below).                                                                                                                                                                                                                                                                                                                                                                                       |
| Q3  | `recordObservations` (`lib/emr/write/facts.ts`) writes one CFC concept per line, in a batch with an idempotent client key and a 10-minute duplicate check. Details below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Q4  | `scoreNews2(v: AdultVitals)` (`lib/triage/scoring/news2.ts`) is pure and takes any set, so a draft set works. A missing input scores 0 and is listed in `missing`, which makes the result `provisional` ("incomplete"). Scale 2 is `spo2Scale: "scale2"`; with `oxygen: "oxygen"` it uses the on-oxygen sub-bands. ACVPU accepts `A`, `C`, `V`, `P` and `U`. The desk already calls it (`deriveDesk`, `vitalsView`), and so do triage and the resus close-out.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Q5  | `exam-token-map.csv` (270 rows) and `exam-token-map-summary.md`. Items: **13 matched**, 0 broader, **119 proposed**, 5 device, 2 vital, 10 not a finding (the 9 links and foot risk history). Option-level findings (90): 5 matched, 7 broader, 68 proposed, 6 device, 1 vital, 3 not a finding. Blocks: 2 vital, 3 broader, 9 proposed. Vitals: 16 vital, 1 proposed (`obs.peak_flow`). **165 new CFC concepts proposed** (82 `sign.*`, 66 `exam.*`, 9 `dev.*` device in situ, 6 `obs.*`, 2 `hist.*`; 4 restricted), 12 reused from the unadopted history addendum, 37 existing ids used, and one answer added (`obs.avpu` `new_confusion`). The CFC has no device concepts. Two blockers found on the way: the history addendum shares seven `symptomCode`s between two concepts each, which breaks the 0071 unique index; and the read contract projects no qualifiers for presence findings, so structure-state items map to coded `exam.*` observations. |
| Q6  | Restriction is binary in the record (`sensitivity` is `standard` or `restricted`). The classes (`hiv`, `tb`, `mental_health`, `sexual_reproductive_health`) live in the clerking catalogue schema (`lib/clerking/catalogue.ts`), so **`sexual_reproductive_health` exists**. Filters: the composer's `hide()` drops restricted content for `audience: "patient"`; the chart's `toPatientFacing` removes restricted items and recomputes what was derived from them; the four encounter prints use `restrictedChoices` (restricted lines are opt-in per item).                                                                                                                                                                                                                                                                                                                                                                                                 |
| Q7  | `audit_log` is written only by the `audit.log_changes()` trigger. `clinical_notes` has it (`audit_clinical_notes`, insert, update and delete), so every draft save that carries the gate record is audited with actor and time **without a new table**. The row holds the encrypted content, so the audit proves who changed the draft and when, not what the gate said. A readable "gate completed" event would need a new `clinical_note_events.kind`, which is a CHECK change and so a migration. Recommendation at GATE A: no migration; the gate lives in the draft, is audited by the trigger, and is written into the signed note.                                                                                                                                                                                                                                                                                                                     |
| Q8  | `patient_profiles.sex` and `date_of_birth` are NOT NULL, but a patient may have no profile row, and sex may be `intersex` or `prefer_not_say`. The desk turns anything but male or female into `null`, and a missing date of birth into a null age. Rules that need sex (waist, prostate, the pregnancy qualifier) must say "sex not recorded" and never assume one. Pregnancy is a CFC fact (`pregnancy_episodes`, 0 rows in production). The desk does not read it: triage is called with `pregnancy: "unknown"`. The BMI "not applicable in pregnancy" and the IMAM pregnancy band need it; the exam will read the pregnancy episode where one exists and otherwise ask in Nutrition (the catalogue's "pregnant or breastfeeding a baby under 6 months" qualifier).                                                                                                                                                                                        |
| Q9  | `source-check.md`. Verified: UCG 2023 §1.1.6 (hypoglycaemia < 3.0 mmol/L, ADA level 2; UCG has no level 1), ADA 2026 levels unchanged (the DKA/HHS 11.1 threshold is §16 Table 16.1, not §6), ROSIER weights, cut-off > 0 and the 3.5 mmol/L pre-check (from an NHS copy of the form; the Lancet full text was refused), the Ipswich touch test (toes 1, 3 and 5 of both feet; ≥ 2 of 6 at risk), WHO BMI thinness 16/17/18.5, BTS targets unchanged. WHO-O2-CHILD is paediatric and unused: remove. Four cited sources are missing from `sources`; the 38.0 °C VHF fever threshold has no number in WHO or IDSR (Uganda surveillance uses > 38 °C), and the 20 mmHg chest-pain arm difference has no source. Changes SC1–SC8 go to GATE A.                                                                                                                                                                                                                   |
| Q10 | One document `keydown` listener in `desk-client.tsx`, mapped by `clerkingKey` (`components/clerking/model.ts`): `[` `]` and `j` `k` move a **step**, `1`–`9` and `0` jump to a step, `y` `n` `d` act on the focused yes/no row, `/` searches complaints, `?` shows the keys, and Ctrl or ⌘ + Enter signs. Keys are off inside fields and pop-ups.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Q3 in detail.** What the examination needs from the observation write:

| Need                                                           | Today                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BP as one field                                                | Two concepts (`obs.bp_systolic`, `obs.bp_diastolic`). The UI parses one field and writes two lines in one batch. No change needed.                                                                                                                                                                                                                                                    |
| Arm, position, cuff; pulse rhythm and method; temperature site | No columns. The free `context` record takes them (CFC enums exist for `bpPosition`: sitting, standing, supine).                                                                                                                                                                                                                                                                       |
| Glucose context                                                | `fastingState` (fasting, non_fasting, unknown) and `challenge` (`ogtt_75g`, `meal`) with `challenge_minutes` exist in the table. The write input has `fastingState` but **no `challenge`**. Random → `non_fasting`; fasting → `fasting`; two hours after food → `non_fasting` + `challenge: meal`, 120 minutes. Adding `challenge` to the input is a small code change, no migration. |
| Air or oxygen                                                  | `obs.spo2` declares `oxygenSupport` (room_air, supplemental_oxygen) as required context, but the writer **does not enforce context**, and the loader hard-codes `oxygen: null`. This is why every set reads "NEWS2 incomplete" (E-3).                                                                                                                                                 |
| ACVPU                                                          | `obs.avpu` answers are alert, voice, pain, unresponsive: **no "new confusion"**. ACVPU C needs a CFC addendum (proposed: answer `new_confusion`).                                                                                                                                                                                                                                     |
| GCS                                                            | `obs.gcs` (quantity, score) exists. Components E, V and M are not concepts; they go in `context` until a CFC addendum adds them.                                                                                                                                                                                                                                                      |
| Weight, height, waist, MUAC                                    | All four concepts exist. How obtained: CFC `measurement` (measured, reported, estimated); "stated" maps to `reported`.                                                                                                                                                                                                                                                                |
| Implausible value confirmed                                    | `plausibilityConfirmed` exists.                                                                                                                                                                                                                                                                                                                                                       |

**Disagreements with the prompt (the repo wins):**

- E-1: the fields are not alphabetical. They follow the template's concept order (systolic, diastolic, heart rate, respiratory rate, temperature, SpO₂, weight, height, waist, MUAC, glucose). BP is split into two fields, as the prompt says.
- E-2: glucose appears once in the vitals form, and it does carry a context chip (Fasting, Not fasting, Not sure), required before saving. It appears a second time when the NCD module is on (the diabetes section captures its own glucose). The context does not separate random from two hours after food, and "Not sure" is allowed.
- The v2 desk already uses `[` and `]` for steps. The prompt gives them to parts in the examination (§5.16). Proposed at GATE A: inside step 07 only, `[` `]` move parts and `{` `}` (Shift+[ and Shift+]) move systems; `j` `k` and the number keys still move steps. `a` and `p` answer the focused row, as the prompt asks, and `y` `n` stay for history rows.
- The catalogue's `suggestion_rules` is an object (`principle` + `rules`), not a bare array.

**E-1 to E-8 confirmed against the code:**

| #   | Status                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-1 | Confirmed (template order, not alphabetical; BP split).                                                                                                                |
| E-2 | Partly: one glucose field with a fasting chip, a second with the NCD module on; no random or two-hour context.                                                         |
| E-3 | Confirmed: no air-or-oxygen or consciousness control; the loader passes `oxygen: null`, and `obs.avpu` has no C.                                                       |
| E-4 | Confirmed: systems are one free-text box; nothing structured reaches the flags or the CFC.                                                                             |
| E-5 | Confirmed: no grades, no GCS, no dehydration classification.                                                                                                           |
| E-6 | Confirmed: no link from history to the examination.                                                                                                                    |
| E-7 | Confirmed: v1's `chaperone` item exists in the template (`requiredWhen` rectal or vaginal), but the step never renders it, so there is no consent or chaperone record. |
| E-8 | Confirmed: pallor and lymph nodes are a chip and can be typed again in the systems box.                                                                                |

### Baseline

Measured in the harness (a production build of this branch; the fixture mounts the real desk with Patient Three-3; writes blocked).

| Measure                                                                        | Result                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Page-level vertical scroll at 1440×900                                         | **0** (the desk scrolls inside the card)                                       |
| The card's own scroll at 1440×900                                              | 336 px beyond a 620 px card                                                    |
| Page scroll at 834×1194 / 390×844                                              | 241 px / 1,062 px                                                              |
| Inputs on the step                                                             | 12 (11 vitals and one free-text box)                                           |
| Standard-visit examination (2.12 step 6, all seven General items absent), taps | **15**: one to open the step, then two per chip (not asked → present → absent) |
| Complete normal examination of General and seven systems                       | Not possible by tap: the systems are typed                                     |
| Vital-sign keystrokes                                                          | Six numbers plus a Tab between each of seven fields (BP is two)                |
| Seconds                                                                        | Not timed: needs clinicians (Phase 7 trial)                                    |
| axe, serious or critical                                                       | **0** (three moderate landmark issues from the fixture's nested `main`)        |
| Console errors                                                                 | 0                                                                              |

Screenshots: `~/Desktop/emr-harness/shots-exam-base/` (390×844, 834×1194, 1440×900, light and dark, viewport and full), copied to `docs/emr/clerking-v2/exam/before/`.

### Failing tests

`tests/clerking/exam-baseline.test.ts`, three `it.fails` (the suite stays green; each flips when fixed). Each was run as a plain `it` to check it fails for the stated reason:

- E-2: the step lacks the words "Random" and "2 hours after food", and offers "Not sure";
- E-3: no "Room air", "Supplemental oxygen", GCS or ACVPU control;
- E-8: pallor has two editable places (the chip and the free-text box).

### Production counts left to the owner (read-only, counts only)

```sql
SELECT observation_kind, (concept_id IS NOT NULL) AS cfc, count(*) FROM clinical_observations GROUP BY 1, 2;
SELECT count(*) FILTER (WHERE vitals_snapshot ? 'oxygen') AS with_o2, count(*) FROM triage_records;
```

## STOP 1: GATE A signed (2026-09-27)

Fadhul (owner and CSO) signed in session, as recommended:

- D-EX-01 to D-EX-22, harmonisations HX1–HX14, source-check changes SC1–SC8 and token-map changes TM1–TM6;
- SC1: below 3.0 mmol/L urgent for everyone; 3.0 to 3.8 urgent in a patient with diabetes (history or glucose-lowering medicine), caution otherwise;
- the clinical pack as drafted (17 scales, 24 classifiers, 33 reference values, 84 flag rules, 47 suggestion rules, 24 parity changes), with the SC and TM changes, including the MedSync respiratory distress grading and the pain bands;
- AMTS: cut-off 6, the Uganda wording of items 3, 8 and 9 as drafted, local validation planned.

The signature is recorded in `data/clerking/exam-signoff.v1.json`, pinned to the runtime catalogue's SHA-256 after the SC and TM edits (1.0.1-draft). The handoff copy in this folder stays as received.

## STOP 2: catalogue and engines (2026-09-27)

**Built**, pure (no I/O), in `lib/clerking/exam/`:

| Module           | Job                                                                                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalogue.ts`   | Zod schema (strict on items, attributes and options); indexes (item, place, part items, attributes with choice options' own, mirrors, zones, grid rows); fails on an unknown mirror owner, link owner, `shown_when` option, shared attribute or unplaced item        |
| `payload.ts`     | The draft's `exam` section at the trust boundary (entries, blocks, panels, the unsaved vitals column, the gate); wired into `ContentV2Keys`                                                                                                                          |
| `answers.ts`     | Taps by response type, tap-again-clears, hidden attributes dropped, mirrors and shared attributes written to their one owner, Everything else normal (E2) with exact undo, Clear, Not examined, grids                                                                |
| `vitals.ts`      | One-field BP, decimal commas, plausibility with a confirm, mg/dL → mmol/L (the repo's 18.0156 factor, not the catalogue's 18.0: the writer converts with it), NEWS2 through `scoreNews2`, BMI, waist-to-height, and "Save as a new set" → `recordObservations` lines |
| `scores.ts`      | GCS (NT never scored), GCS-P, ACVPU (A only at 15; below, a suggestion), orientation, AMTS, CRB65                                                                                                                                                                    |
| `classifiers.ts` | All 24, each with inputs and reason; "Awaiting sign-off" when a reference is withheld                                                                                                                                                                                |
| `context.ts`     | The condition language: examination and history atoms, plus `medicine_group` and `setting` (SC1, SC5)                                                                                                                                                                |
| `flags.ts`       | 87 rules, badge tokens, v2's `Flag` shape (the Flags panel merges them)                                                                                                                                                                                              |
| `suggest.ts`     | 47 rules, merged by target, done states, ordering                                                                                                                                                                                                                    |
| `compose.ts`     | The examination paragraph by `composer.rules`                                                                                                                                                                                                                        |
| `load.ts`        | The parsed catalogue and its sign-off                                                                                                                                                                                                                                |

**Catalogue:** runtime `1.0.1-draft` = the handoff plus the signed edits, as code in `scripts/clerking/exam-gate-a-edits.ts` (a test holds the equality and the hash). `npm run clerking:catalogue-check` now validates both catalogues and every id that crosses between them (symptoms, red flags, past conditions, `REF-FLAG-*`, items, sources, suggestion targets):

```
catalogue MS-EMR-EXAM-CAT-001 1.0.1-draft
systems 10, parts 41
answerable items 140, links 9
attributes 283, options 964            (281 and 959 handed over; TM3 added two attributes)
by response type presence 47, state 76, test 6, device 4, choice 5, classified 1, measured 1
scales 17, classifiers 24
reference entries 32 (27 from opened sources)   (REF-EX-ARM-DIFF-CHEST dropped, SC6)
sources 53 (51 verified)                        (the two unverified are OPERATIONAL and DRAFT-MEDSYNC)
flag rules 87 (53 urgent, 4 restricted)         (84 + SC1 split + two SC2 caution rules)
suggestion rules 47, shared facts 13, mirrors 22 (10 + 12 from TM1)
```

The catalogue is 363 KB raw, 65.9 KB gzipped (the handoff was 352 KB and 63.1 KB); it will be served minified.

### Tests

| File                       | Tests | Covers                                                                                                                                                                                               |
| -------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exam-flags.test.ts`       | 89    | Every rule fires on a scenario built from its own `when`, and a near miss stops it; badges fill; withheld references never fire                                                                      |
| `exam-suggest.test.ts`     | 49    | Every rule suggests its targets with a reason, each target opens somewhere, a suggestion never answers; done states and order                                                                        |
| `exam-classifiers.test.ts` | 79    | Every reference edge (below); GTFCC truth table; IMAM with the oedema rule; IWGDF per foot; infection grade; SINBAD; NT, GCS-P, ACVPU, orientation, ROSIER                                           |
| `exam-answers.test.ts`     | 16    | Each response type and attribute kind; mirrors, read-only mirrors, shared signs; E2 scope, idempotence and undo; the payload round trip; BP parsing, plausibility, units, NEWS2, "Save as a new set" |
| `exam-compose.test.ts`     | 16    | The seven fixtures (snapshots) and the composer's properties                                                                                                                                         |
| `exam-catalogue.test.ts`   | 5     | Handoff + signed edits = runtime, the hash, the counts, malformed catalogues, one item of each type and a classifier band added with no code, 140 of 140 items compose                               |
| `exam-baseline.test.ts`    | 3     | E-2, E-3, E-8 (`it.fails` until Phase 3)                                                                                                                                                             |

Full suite: **7,172 passed, 3 expected failures, 0 failed** (6,918 before). Typecheck and lint clean.

The flag and suggestion tests do not hand-write 134 fixtures: a solver in `tests/clerking/exam-fixtures.ts` builds each rule's positive scenario from the rule's own condition, and the negative is the same scenario with one atom left out. Where a rule reads a classifier result, the solver uses a hand-written input for that result.

### Reference edges (value − ε, value, value + ε)

| Reference                              | Results                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------- |
| REF-EX-GCS-AIRWAY 8 (≤)                | 7 → true · 8 → true · 9 → false                                            |
| REF-EX-GCS-FULL 15 (<)                 | 14 → true · 15 → false                                                     |
| REF-EX-MUAC-BANDS adult SAM < 19       | 18.5 → sam · 19 → mam · 19.5 → mam                                         |
| REF-EX-MUAC-BANDS adult MAM < 22       | 21.5 → mam · 22 → normal · 22.5 → normal                                   |
| REF-EX-MUAC-BANDS 15–17 SAM < 18.5     | 18 → sam · 18.5 → mam · 19 → mam                                           |
| REF-EX-MUAC-BANDS 15–17 MAM < 21       | 20.5 → mam · 21 → normal                                                   |
| REF-EX-MUAC-BANDS 60+ SAM < 16         | 15.5 → sam · 16 → mam · 16.5 → mam                                         |
| REF-EX-MUAC-BANDS 60+ MAM ≤ 18.5       | 18.5 → mam · 19 → normal                                                   |
| REF-EX-MUAC-BANDS pregnant SAM < 19    | 18.5 → sam · 19 → mam                                                      |
| REF-EX-MUAC-BANDS pregnant MAM < 23    | 22.5 → mam · 23 → normal                                                   |
| REF-EX-BMI-BANDS 16                    | 15.9 → severe_thinness · 16 → moderate_thinness · 16.1 → moderate_thinness |
| REF-EX-BMI-BANDS 17                    | 16.9 → moderate_thinness · 17 → mild_thinness                              |
| REF-EX-BMI-BANDS 18.5                  | 18.4 → mild_thinness · 18.5 → normal                                       |
| REF-EX-BMI-BANDS 25                    | 24.9 → normal · 25 → pre_obese                                             |
| REF-EX-BMI-BANDS 30                    | 29.9 → pre_obese · 30 → obese_1                                            |
| REF-EX-BMI-BANDS 35                    | 34.9 → obese_1 · 35 → obese_2                                              |
| REF-EX-BMI-BANDS 40                    | 39.9 → obese_2 · 40 → obese_3 · 40.1 → obese_3                             |
| REF-EX-BMI-ADULT-AGE 20                | 19 → not_applicable · 20 → result · 21 → result                            |
| REF-EX-WAIST male 94                   | 93 → low · 94 → increased · 95 → increased                                 |
| REF-EX-WAIST male 102                  | 101 → increased · 102 → substantial                                        |
| REF-EX-WAIST female 80                 | 79 → low · 80 → increased                                                  |
| REF-EX-WAIST female 88                 | 87 → increased · 88 → substantial                                          |
| REF-EX-WHTR 0.5                        | 0.49 → healthy · 0.5 → increased · 0.51 → increased                        |
| REF-EX-WHTR 0.6                        | 0.59 → increased · 0.6 → high                                              |
| REF-EX-OH-SBP 20                       | 19 → absent · 20 → present · 21 → present                                  |
| REF-EX-OH-DBP 10                       | 9 → absent · 10 → present                                                  |
| REF-EX-ARM-DIFF 15 (>)                 | 14 → within · 15 → within · 16 → repeat                                    |
| REF-EX-HYPO-L2 3.0 (<)                 | 2.9 → level_2 · 3.0 → level_1 · 3.1 → level_1                              |
| REF-EX-HYPO-L1 3.9 (<)                 | 3.8 → level_1 · 3.9 → null · 4.0 → null                                    |
| REF-EX-GLU-HIGH 11.1 (≥)               | 11.0 → false · 11.1 → true · 11.2 → true                                   |
| REF-EX-PEF-BANDS life-threatening < 33 | 32 → life_threatening · 33 → acute_severe · 34 → acute_severe              |
| REF-EX-PEF-BANDS severe ≤ 50           | 50 → acute_severe · 51 → moderate                                          |
| REF-EX-PEF-BANDS moderate ≤ 75         | 75 → moderate · 76 → null                                                  |
| REF-EX-ASTHMA-RR 25 (≥)                | 24 → null · 25 → acute_severe · 26 → acute_severe                          |
| REF-EX-ASTHMA-HR 110 (≥)               | 109 → null · 110 → acute_severe                                            |
| REF-EX-ASTHMA-SPO2 92 (<)              | 91 → life_threatening · 92 → null · 93 → null                              |
| REF-EX-CRB65 RR 30                     | 29 → 0 · 30 → 1 · 31 → 1                                                   |
| REF-EX-CRB65 SBP 90 (<)                | 89 → 1 · 90 → 0 · 91 → 0                                                   |
| REF-EX-CRB65 DBP 60 (≤)                | 59 → 1 · 60 → 1 · 61 → 0                                                   |
| REF-EX-CRB65 age 65                    | 64 → 0 · 65 → 1 · 66 → 1                                                   |
| REF-EX-CRB65 AMTS 8 (≤)                | 7 → 1 · 8 → 1 · 9 → 0                                                      |
| REF-EX-AMTS-IMPAIRED 6 (≤)             | 5 → true · 6 → true · 7 → false                                            |
| REF-EX-VIP-RESITE 2 (≥)                | 1 → false · 2 → true · 3 → true                                            |
| REF-EX-POWER-WEAK 3 (≤)                | 2 → true · 3 → true · 4 → false                                            |
| REF-EX-NRS-BANDS mild ≤ 3              | 2 → mild · 3 → mild · 4 → moderate                                         |
| REF-EX-NRS-BANDS moderate ≤ 6          | 6 → moderate · 7 → severe                                                  |
| REF-EX-ITT-LOPS 2 (≥)                  | 1 → false · 2 → true · 3 → true                                            |
| REF-EX-SINBAD-AREA 1 (≥)               | 0.5 → area 0 · 1 → area 1 · 1.5 → area 1                                   |
| REF-EX-CRT 2 (>)                       | 1 → false · 2 → false · 3 → true                                           |
| REF-EX-BP-SEVERE systolic 180          | 179 → false · 180 → true · 181 → true                                      |
| REF-EX-BP-SEVERE diastolic 120         | 119 → false · 120 → true                                                   |
| REF-EX-SBP-LOW 90 (<)                  | 89 → true · 90 → false · 91 → false                                        |
| REF-EX-FEVER-TEMP 38 (≥)               | 37.9 → false · 38 → true · 38.1 → true                                     |

Every numeric reference a classifier or flag reads is covered (a test checks that none is missing). `REF-EX-GTFCC-COUNT` has the truth table instead:

| Signs                                       | Result                      |
| ------------------------------------------- | --------------------------- |
| lethargic (a danger sign alone)             | severe                      |
| sunken eyes + drinks poorly (two severe)    | severe                      |
| restless + rapid pulse                      | some                        |
| drinks poorly + restless (mixed columns)    | some                        |
| very slow pinch + rapid pulse               | some                        |
| slow + very slow pinch (one column)         | below the threshold         |
| drinks eagerly + drinks poorly (one column) | below the threshold         |
| sunken eyes                                 | below the threshold         |
| none                                        | no dehydration              |
| any signs without diarrhoea or vomiting     | not graded, with the reason |

### Property tests

| Property                                                                                 | Result |
| ---------------------------------------------------------------------------------------- | ------ |
| The composer writes every positive and no unrecorded item; hints never (200 random sets) | pass   |
| More GTFCC signs never lower the grade (300 random pairs)                                | pass   |
| A lower MUAC never raises the class (three age bands, 30 to 10 cm)                       | pass   |
| E2 is idempotent and undone exactly                                                      | pass   |
| Mirrored and shared facts never disagree between views (200 random tap sequences)        | pass   |
| NEWS2 equals the triage engine's (200 random sets)                                       | pass   |

### The fixtures (snapshots in `tests/clerking/__snapshots__/exam-compose.test.ts.snap`)

| Fixture           | Expected                                                       | Result                                                                                                            |
| ----------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 2 Chest pain      | 24 mmHg between arms; absent left radial and femoral           | "Difference 24 mmHg: repeat"; badge "Absent left radial and left femoral pulse"                                   |
| 3 Diabetic foot   | IWGDF 3 with active ulcer; infection 3; SINBAD 3 (0,0,1,1,1,0) | as expected                                                                                                       |
| 4 Asthma          | life-threatening                                               | "Life-threatening asthma (PEF 30% of best or predicted, SpO₂ 91%)"                                                |
| 5 Pneumonia       | CRB65 4                                                        | CRB65 4, each point shown                                                                                         |
| 6 Stroke          | ROSIER +3                                                      | ROSIER +3 (face, arm, speech, each confirmed new)                                                                 |
| 7 Meningococcal   | neck stiffness, non-blanching rash                             | both urgent badges                                                                                                |
| 1 Patient Three-3 | the prototype default                                          | GCS 13, ACVPU C, GTFCC severe, CPAP, spinal tenderness at L3; the prostate after the gate with the chaperone line |

### Badge differences from the prototype (for the CSO to confirm)

| Prototype                     | Build                                                                                            | Why                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| Possible tension pneumothorax | Deviated trachea, hyper-resonant chest                                                           | E5, D-EX-16                   |
| Severe acute malnutrition     | MUAC 17.5 cm (caution)                                                                           | D-EX-16                       |
| Severe dehydration            | GTFCC: severe dehydration                                                                        | a named scale with its result |
| Reduced GCS (attention)       | GCS 13 (urgent), or caution when the known baseline                                              | D-EX-04                       |
| Weakness (always)             | Urgent only with new weakness in the history, otherwise caution                                  | D-EX-09                       |
| Neck stiffness ("Meningism")  | Neck stiffness                                                                                   | a finding                     |
| Hard, nodular prostate        | Prostate: hard, nodular                                                                          | the findings recorded         |
| Peritonism                    | The sign itself ("Guarding and rebound tenderness")                                              | a finding                     |
| Expansile mass                | Expansile abdominal mass (caution); with pain, urgent                                            | catalogue                     |
| (none)                        | ACVPU C, CPAP, BP differs between arms, foot pulse and ulcer badges, Kussmaul and ketotic checks | new rules                     |

### Deviations and decisions made while building

- **ROSIER** waits until the panel records syncope and seizure for this episode, as well as glucose. Without that it would print "ROSIER 0" for any facial weakness.
- **CRB65's confusion point** is "no" once orientation is recorded as full, even without an AMTS. It is "not recorded" only when neither is known.
- **The pulses grid, power grid and reflexes** are keyed by the scale's row labels ("Dorsalis pedis"), with lowercase values.
- **Old items without a `side`** (Feet skin and nails before TM3) are treated as either side.

## STOP 3: Vital signs and General (2026-09-28)

Behind `CLERKING_V2`, like the rest of v2: with the flag off the v1 desk is untouched (its code paths changed nowhere; the only shared rule change, below, applies only to a draft that holds an examination).

**Built** (`components/clerking/exam/`):

| File                      | What                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `model.ts`                | `deriveExam`: the context, classifier results, flags, suggestions, the note paragraph, the vitals draft as numbers with its NEWS2, each system's status                                                                                                                                                                                                |
| `exam-step.tsx`           | The card: suggestion strip (edge scroll buttons), systems grid (11 pills, lock on Rectal and genital), the system panel (counts, Clear with undo, Everything else normal, Not examined… with reasons and equipment), segmented part tabs, the intimate gate, classifier panels (asthma, CRB65, ROSIER, West Haven, the three Feet pills), keys (§5.16) |
| `item-row.tsx`            | Rows by response type in the item's own words; the attribute box (150 px label column; chips, steppers, body maps, the 0–10 strip, shared attributes, mirrors with "Recorded in …"); links that read and open their owner                                                                                                                              |
| `blocks.tsx` (agent)      | Consciousness (GCS with NT, GCS 15/15 one tap, known baseline, GCS-P, orientation, ACVPU with the suggestion), AMTS, motor grids (MRC with 4− and 4+, NINDS, plantars, the pattern hint), pulses grid                                                                                                                                                  |
| `vitals-card.tsx` (agent) | Previous set and Now, one-field BP, rhythm with apical count, SpO₂ with scale 2 only on a recorded target, temperature site, glucose with its required context and unit, the air-or-oxygen and consciousness lines from General, the NEWS2 line, anthropometry with its pills, the three panels, "Save as a new set", Enter advances                   |
| `result-pill.tsx`         | Tone scale ok / caution / strong with icon and words; never red                                                                                                                                                                                                                                                                                        |

**Wiring:** the desk loads the examination catalogue from `/api/clerking/exam-catalogue?v=<hash>` (immutable, like the history's); `deriveDesk` merges examination flags into the Flags panel and writes the examination paragraph into the note; an exam badge opens its system and part; step 07's keys are the step's own (`[ ]` parts, `{ }` systems, `a p e x g`), `j k` and digits still move steps.

**Write paths:**

| Path                          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Proof                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Save as a new set             | One `recordObservations` batch keyed by the reading-set id: BP with position, arm, cuff, device, setting, readingIndex; pulse with rhythm; SpO₂ with `oxygenSupport`, modality, flow and scale; temperature with site; glucose with `fastingState` and, two hours after food, `challenge: meal`, 120 min (HX1: the writer and action now accept `challenge`); weight and height with how obtained; waist with the WHO protocol; `obs.avpu`; `obs.gcs` with its parts | Lane test: rows and contexts; a replay adds nothing |
| The loader reads the set back | Air or oxygen and ACVPU come back into NEWS2 (E-3 resolved)                                                                                                                                                                                                                                                                                                                                                                                                          | Lane test                                           |
| Signing                       | Mapped findings as CFC facts with qualifiers and `elicitedBy: examination` (pallor, jaundice, cyanosis, clubbing, nodes, oedema, neck stiffness, foot findings with laterality, ketotic breath, Kussmaul, callus), GTFCC as `sign.dehydration` (none, some, severe only), MUAC, capillary refill, pain score; the rest stay in the note and the warning counts them                                                                                                  | Lane test                                           |
| Minimum to sign               | A draft with an examination satisfies "No examination recorded" (`checkRule`, the one shared function)                                                                                                                                                                                                                                                                                                                                                               | Lane test                                           |

**Deviations (the repo wins):**

- **HX3, ACVPU C.** Adding `new_confusion` to `obs.avpu` means regenerating the CFC registry, which rewrites the shipped seed migration 0072. Instead, until the CFC addendum ships its own seed, a set with ACVPU C writes no `obs.avpu` and carries `acvpu` in every line's context; the loader reads it back (lane test). A, V, P and U write `obs.avpu` as before.
- **Derived BMI and waist-to-height** are not charted at signing yet (the concepts need a formula context). They are recomputed from the charted weight, height and waist, and written in the note.
- **Temperature example.** The prompt's message "Temperature up from 32.5 to 35.8 °C; it no longer scores" is wrong: 35.8 °C still scores 1 in NEWS2 (35.1–36.0). The card says "it now scores 1".
- **BP field** uses a text keyboard on phones: the iOS decimal pad has no "/".
- **Qualifiers appear once their value is typed** (arm, position and cuff after BP; rhythm after pulse; site after temperature). The glucose context is always shown: it is required.

**Numbers:**

| Measure                                                                           | Result                                                                                                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Screens against E01–E07 (and all of E08–E19 plus Feet), light and dark, 1440×1024 | 40 captured in `after/`; page scroll 0 on every one                                                                       |
| axe serious or critical                                                           | **0** on all 40 (light and dark)                                                                                          |
| Console errors                                                                    | 0                                                                                                                         |
| NEWS2 parity with the triage engine                                               | 200 random sets identical (engine test)                                                                                   |
| System switch / part switch, p95 (includes two animation frames)                  | 35 ms / 35 ms (budget 100 ms)                                                                                             |
| Red-scarcity                                                                      | the existing scan covers `components/clerking/**`: 0 red classes in the exam files (and a markup test)                    |
| Baseline tests                                                                    | E-2, E-3, E-8 flipped from `it.fails` to `it`, passing                                                                    |
| Flag off                                                                          | Unchanged by construction (every change is inside the v2 desk, or conditional on `content.exam`); pixel-diffed at Phase 7 |

## STOP 4: Cardiovascular, Respiratory, Abdomen (2026-09-28)

Because rows render by type, these systems came with Phase 3's components; this phase checked them against E08–E12.

- Pulses grid (table with row and column headers, radiogroups with arrow keys, "All present"); lung map (front and back, the patient's right on your left, back view mirrored, a text list alternative); abdomen map (3×3 with region names); liver stigmata with mirrors from Hand signs and Odour and a clinician-chosen West Haven grade with its suggestion; the asthma panel (confirm, suppressed with a hypercapnic target, the criteria that fired, a link to peak flow); CRB65 with each point.
- Screens E08–E12: captured, 0 serious axe, no page scroll.
- Fixtures 2, 4 and 5: badges and composer snapshots (STOP 2), unchanged.

## STOP 5: Nervous system, Spine and joints, Skin, Eyes ENT and neck (2026-09-28)

- AMTS with the Uganda wording marked; visual fields; meninges hints; cranial nerves with pupils per side (GCS-P); motor grids with the hint "not written to the note"; sensory with saddle sensation; ROSIER panel (syncope and seizure for this episode, each +1 sign confirmed new, hidden until glucose); spine ladder map; skin and ENT.
- Screens E13–E17: captured, 0 serious axe.
- Fixtures 1, 6 and 7 (STOP 2).
- **Back-pain focused examination: 19 taps** (budget 28), replayed through the same functions the buttons call (`tests/clerking/exam-answers.test.ts`).

## STOP 6: Rectal and genital gate, Feet, suggestions (2026-09-28)

- **The gate:** reason (prefilled from the suggestion), consent (verbal / best interests / declined → "Not examined: patient declined"), chaperone (present with name and role / declined / not offered: emergency), "A relative may stay … is not a chaperone"; items are `inert` until complete; the pill carries a lock announced "locked, needs consent and chaperone". The gate record is in the draft (audited by the `clinical_notes` trigger on the save that records it, HX10) and written into the note ("Chaperone: Sr N. Akello, nurse. Verbal consent.").
- **Restricted:** HIV-associated signs, genital findings, and the TM2 options carry locks and never reach patient-facing text (composer property test).
- **Feet:** IWGDF risk (per foot, "incomplete" until both feet, the active-ulcer note), IWGDF/IDSA grade with "(O)", SINBAD with each part; fixture 3 gives 3 / 3 / 3.
- **Suggestions:** all 47 rules exercised in Vitest (Playwright is not in the repo, H7/HX11), with done states and order.
- Screens E18, E19 and two Feet screens: captured, 0 serious axe.

## STOP 7 (final): hardening (2026-09-28)

**Phase 7 work:** the attribute box opens as a bottom sheet with Done below 640 px (the inline box is hidden there by CSS, so first paint does not shift); a one-tap "GCS 15/15" (an explicit answer); offline, "Save as a new set" is queued in the desk's write queue, shown as pending, and marked saved when it lands (the reading-set id keeps a resend idempotent); dark-mode fixes (teal and plum tokens already invert, so `dark:` overrides were removed); ADRs 0170–0175; CHANGELOG.

**Checks:** typecheck, lint (the 2 warnings predate this build), `clerking:catalogue-check`, the full suite (SKIP_ENV_VALIDATION=1 EMR_PGLITE=1), and the harness.

### §14, the numbers

| Metric                                                              | Baseline                                                     | Target           | Result                                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Page-level scroll on 1440×900                                       | 0 (the card scrolls inside)                                  | none             | **none** on all 40 screens (and at 1440×900)                                                                         |
| NEWS2 sets saved incomplete for lack of air/oxygen or ACVPU         | every set (the loader passed `oxygen: null`; no ACVPU input) | 0                | **0**: Save requires both, and the loader reads them back (lane test)                                                |
| Glucose values without a context                                    | fasting chip with "Not sure"; no random or two-hour          | 0                | **0**: one field, context required to save (random, fasting, 2 hours after food)                                     |
| The same fact answerable in two places with different values        | pallor and nodes: a chip plus the free-text box              | 0                | **0**: links, mirrors (22) and shared attributes; E-8 test                                                           |
| "Normal/Abnormal" on a non-`state` item or in a counter             | v1 had none structured                                       | 0                | **0** (catalogue test and a markup test over every part)                                                             |
| Taps, complete normal adult examination (General and seven systems) | not possible by tap (typed)                                  | ≤ 26             | **25**                                                                                                               |
| Taps, back-pain focused examination                                 | —                                                            | ≤ 28             | **19**                                                                                                               |
| Taps, standard visit examination (2.12)                             | 15                                                           | ≤ 7.5            | **3** for the seven General signs (7 with consciousness and air or oxygen)                                           |
| Catalogue items rendering by type                                   | —                                                            | 140 of 140       | **140 of 140** (markup test over every part; every item composes)                                                    |
| Classifier band edges tested                                        | —                                                            | all REF edges    | **all** numeric references (53 edge rows, a test fails if one is missing) plus the GTFCC truth table                 |
| Flag rules with positive and negative tests                         | —                                                            | 84 of 84         | **87 of 87** (84 + SC1–SC2)                                                                                          |
| Suggestion rules with fixtures                                      | —                                                            | 47 of 47         | **47 of 47**                                                                                                         |
| Rules or classifiers live on an unsigned reference                  | —                                                            | 0                | **0** (withheld references never fire; tested)                                                                       |
| NEWS2 parity with the triage engine                                 | —                                                            | 100%             | **100%** (200 random sets)                                                                                           |
| Intimate examinations without a gate record                         | no chaperone record at all                                   | 0                | **0**: items are locked until the gate is complete                                                                   |
| Restricted items in patient-facing outputs                          | —                                                            | 0                | **0** (composer property test; TM2 options too)                                                                      |
| axe serious or critical                                             | 0                                                            | 0                | **0**: 40 desktop screens and 20 phone and tablet screens, light and dark                                            |
| JS added / catalogue gzipped                                        | —                                                            | ≤ 45 KB / report | **42.3 KB** (route first load 362.8 → 405.1 KB gz) / **58.7 KB** gzipped minified (the handoff's 61.8)               |
| Clinician trial: median examination time, old and new               | not measured                                                 | lower            | **Not run:** needs three to five clinicians (owner's; protocol as for v2, `docs/emr/clerking-v2/clinician-trial.md`) |

**Other budgets:**

| Measure                                               | Result                                                                                                                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System or part switch, p95                            | 35 ms including two animation frames (budget 100 ms)                                                                                                                         |
| Classifier, flag and note recompute after a tap       | 0.6 ms p50 / 0.8 ms p95 for the whole desk in Node (about 3 ms at 4×); a tap to the next frame in Chromium is 17.6 ms p95 at 1× and 20.4 ms at 4×, most of it the frame wait |
| Flag off                                              | the four v1 desk screens and the v2 opening step are **pixel-identical** to a build of `eec6f5c` at 1440 and 834                                                             |
| Phone (390×844) and tablet (834×1194), light and dark | no horizontal scroll; no examination control under the fixed bars; 0 serious axe                                                                                             |

### Deviations and open items

- **HX3 interim:** ACVPU C is carried in each set line's context until the CFC addendum adds `new_confusion` with its own seed (regenerating the registry would rewrite shipped migration 0072).
- **Derived BMI and waist-to-height** are not charted as facts yet (recomputed from charted measurements; written in the note).
- **The CFC v1.3 examination addendum** (165 proposed concepts) and the history addendum's seven duplicate symptom codes (TM4) are the owner's next signature.
- **The prompt's NEWS2 example** ("35.8 °C no longer scores") is wrong: 35.8 °C scores 1; the card says so.
- **Not done here:** the clinician trial; real-device timing on a mid-range Android at 4×; production counts beyond the one read-only query (the session's permission check refused the rest; the queries are in STOP 0).
- **Before deploying:** migration 0076 (clerking v2) must be applied, as before. This build adds **no migration**. The harness build needed `NODE_OPTIONS=--max-old-space-size=6144`; watch the Vercel build's memory.
