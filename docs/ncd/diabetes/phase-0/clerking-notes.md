# Phase 0: clerking desk v2 and the Clinical Fact Contract (Q8 to Q11)

Diabetes pack 0.3.0-draft against `feat/ncd-diabetes-pack` = `origin/main` 8e45d34. Discovery only: no product file was changed.
Deliverables beside this note: `clerking-ids.csv` (Q8, 98 rows) and `concepts-diff.csv` (Q10, 242 rows).
Unless a path says otherwise, "dx catalogue" means `data/clerking/clerking-diagnosis-catalogue.v1.json`, "exam catalogue" means `data/clerking/clerking-exam-catalogue.v1.json`, "history catalogue" means `data/clerking/clerking-history-catalogue.v1.json`, and "CFC" means `lib/facts/catalogue.generated.ts` `CONCEPTS` (455 concepts).

## Summary counts

| Item                                               | Count                                                                                                                                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q8: ids in `wiring/reconcile-ids.json`             | 98 (63 "resolve", 35 "proposed")                                                                                                                                                                                            |
| Q8: found / found under another id / absent        | **62 / 9 / 27**                                                                                                                                                                                                             |
| Q8: "resolve" ids not found as written             | 5: `sym.vomiting`, `ex.nervous.reflexes`, `ex.eyes_ent_neck.fundoscopy.seen` (found as), `dx.cataract`, `vs.ketones.blood` (absent)                                                                                         |
| Q8: "proposed" ids that already exist              | 10: 4 exactly (`derived.osmolality_effective`, `obs.c_peptide`, `obs.islet_autoantibody`, `test.xray_abdomen`), 6 under another id                                                                                          |
| Q9: engine changes EC-1 to EC-8                    | small: EC-3, EC-6, EC-8 (if done by hand); medium: EC-2, EC-5, EC-7 (many small items); large: EC-1, EC-4                                                                                                                   |
| Q9: "amend" profiles                               | **7, not 6**: dm_type_unknown, dm_type2, dm_type1, dka, hhs, hypoglycaemia_dm, ckd                                                                                                                                          |
| Q9: `suggest_against` on a must-not-miss diagnosis | 1 new from the pack (dx.dka). 1 live one that a merge would put on a must-not-miss profile (dx.dm_type1)                                                                                                                    |
| Q9: SHA-256 sign-off pins an amendment would break | 3 (history, exam, dx). All 3 match today                                                                                                                                                                                    |
| Q10: `conceptsToPropose` (30)                      | 6 exist exactly, 7 exist under another id, **17 new**                                                                                                                                                                       |
| Q10: `diagnosisTermToConcept` (16)                 | 6 exact, 9 under another id, **1 new**. Pack: 8 map, 8 new. Of the pack's 8 "map" ids, 3 do not exist. Of its 8 "new", 7 exist                                                                                              |
| Q10: `featureToConcept` (192)                      | 51 "existing": 37 agree with `lib/ncd/cfc-map.ts`, 13 have the concept but no bridge, **1 names a concept that is not there** (`sx.vision_change`). 141 "none": 33 have a live concept under another id, 14 partly, 94 none |
| Q11: test-menu additions (11)                      | 0 on the menu; 5 are already named by the dx catalogue (4 under another id); 6 absent                                                                                                                                       |
| Q11: formulary drugs (13)                          | 3 present (`metformin`, `glibenclamide`, `gliclazide`), 10 absent; 6 classes all absent; **no dose content**                                                                                                                |

## Q8: clerking ids

The full table is in `clerking-ids.csv`, with columns pack_id, kind, pack_status, used_in, status, live_id and evidence (file:line).

These are the ids found under another id:

| Pack id                            | Live                                                 | Evidence                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sym.vomiting`                     | `sym.nausea_vomiting` (wider)                        | history catalogue symptom, token `sx.vomiting` (token-map.v1.json:29). CFC v1.4 V1/V3 (unsigned) is about exactly this width problem. `catalogue-check.ts:69-70` would reject `sym.vomiting` |
| `ex.nervous.reflexes`              | reflex grid in `ex.nervous/motor` (row Ankle)        | `blocks.motor_grids` and `scales.ninds_reflex.rows`. The target `ex.nervous/motor` is already used by SUG-STROKE                                                                             |
| `ex.eyes_ent_neck.fundoscopy.seen` | item `ex.eyes_ent_neck.fundoscopy`, attribute `seen` | this is a path, not an id. `seen=diabetic_retinopathy` already exists and maps to `sign.diabetic_retinopathy` (exam-token-map.v1.json:589-592)                                               |
| `exam.macular_oedema`              | `exam.maculopathy`                                   | its answers are absent, present and ungradable, so it cannot say whether the centre is involved. Extend the answers (CSO); do not add a concept                                              |
| `obs.ph_venous`                    | `obs.ph` + `specimen: venous_whole_blood`            | venous is a qualifier                                                                                                                                                                        |
| `test.glucose_capillary`           | `test.capillary_glucose`                             | dx-catalogue proposed id, used in 46 profiles, not on the menu                                                                                                                               |
| `test.ketones_blood`               | `test.ketones`                                       | dx-catalogue proposed id (5 profiles). The live id does not say blood or urine                                                                                                               |
| `test.venous_gas`                  | `test.blood_gas`                                     | dx-catalogue proposed id (23 profiles)                                                                                                                                                       |
| `test.vitamin_b12`                 | `test.b12_folate`                                    | dx-catalogue proposed id. It has the same role in `dx.peripheral_neuropathy`                                                                                                                 |

Absent and worth noting:

- `dx.cataract` appears only in `related` of the new dx.diabetic_retinopathy. `check.ts:297` would fail it as "unknown related".
- The 8 new diagnoses have no profile and no term, but 7 of them have a CFC condition (see Q10).
- `test.urine_pcr` was not mapped to the dx catalogue's `test.urine_protein`, because nothing shows they are the same test.

## Q9: engine changes

### Fail-open hazard (read first)

The live evaluator `evalCond` (`lib/clerking/exam/context.ts:253-419`) is two-valued:

- An atom it does not know returns false.
- `not` of that false is **true** (`context.ts:256`).
- A known atom ignores extra keys.

Loading the pack before its engine changes exist therefore fails open in two ways:

1. **`{vital: "vs.glucose", context: "fasting", gte_ref}` fires on any glucose.** The vital branch never reads `context` (`context.ts:388`). A random reading of 7.5 would count as evidence of diabetes in the fasting range, and a random reading of 5.1 or more as evidence of gestational diabetes. This is in 5 atoms in dm_type_unknown and DDX-PREGNANCY-GLUCOSE.
2. **`{not: {pregnancy: "current"}}` is always true.** This affects CARE-DM-BP-REVIEW, CARE-DM-STATIN, CARE-DM-MEDS-REVIEW and CARE-DKD-RASI, which are meant to exclude pregnancy (the statin and ACE inhibitor items).

Every other unbuilt atom (`result`, `past_detail`, `pregnancy`, `panel vs.ketones`, `setting: [..]`, `{medicine, adherence_any}`, `plan_basket_class`) fails closed: it never fires.

The four-state semantics of EC-1 (unknown is neither true nor false) need a three-valued evaluator, or at least a rule that `not` over an unknown is unknown. Today that semantics does not exist anywhere in clerking.

### Per engine change

| EC                                         | Exists today                                                                                                                                                                                                                                                                                                                                                                                                                        | Missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Size                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **EC-1** result atom                       | The fact model: `trust` 1 to 4 (`lib/facts/types.ts:27,62`); the context keys `fastingState`, `challenge {type, minutesPostLoad}` and `pointOfCare` (types.ts:134-142); `loadFactSnapshot(manifest, asOf, perConceptCap)` (`lib/facts/loader.ts:117`); concepts `obs.glucose`, `obs.hba1c` (context method, certification and pointOfCare), `obs.uacr`, `derived.egfr`, `obs.bicarbonate`, `obs.ph`, `derived.osmolality_effective` | A `result` branch in evalCond; facts in `ExamContext` (context.ts:49-66); loading facts in `desk-load.ts`, which reads no clinical facts today; a `result` branch in `impression/check.ts` (today it fails as "unknown atom", check.ts:207); a `res:` ref in `impression/facts.ts` `atomRef` (facts.ts:69-96); the evidence-matrix cell (value, date, age, trust); the HbA1c blocking-caveat logic (pregnancy, HIV on ART, which is restricted, Hb variant, haemolysis, malaria, transfusion, iron/B12, eGFR), which is clinical content; unknown-state semantics (above)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Large**: about 250-400 lines over 6-8 files plus tests                                      |
| **EC-2** past-history detail               | Past answers `{answer, since, onProblemList}` (`lib/clerking/answers.ts:36`); the `past_condition` atom (context.ts:270); the property/phrase machinery for symptoms. The history catalogue is `.passthrough()` (catalogue.ts:135-147), so `condition_details` would parse                                                                                                                                                          | `details` in HistorySchema; the form UI; the per-condition composer; a `past_detail` atom (evalCond, check.ts, facts.ts ref `pmh:diabetes#type`); `applies_to: "past_history"` in `evaluateFlags` (flags.ts:221-328 handles symptoms, medicines, allergies and vital_signs only); Ask kind `past_detail` (impression/catalogue.ts:28-38, a strict union); `shown_when` on a history property (none exists)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **Medium**: about 200-300 lines plus a UI component                                           |
| **EC-3** glucose context on the vital atom | The context exists end to end on entry: catalogue `vs.glucose.qualifiers.context` = random, fasting, two_hours_after_food; `glucoseContext` in the payload (`exam/payload.ts:116`); a context is required to save; mapping to CFC already done (`exam/vitals.ts:300-309`: fasting→`fastingState fasting`, else `non_fasting`; two_hours_after_food→`challenge meal 120`)                                                            | `VitalValues` carries only a number (context.ts:22-34), so the context is lost before the atom. The vital branch must read `context`. `two_hours_after_glucose` is not an option (payload enum, and adding it changes the exam catalogue). `check.ts` does not validate `context`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Small**: about 40-80 lines in 3-4 files (+ a catalogue edit if the 4th value is accepted)   |
| **EC-4** signed suggested-care list        | `plan.problems[id].care: Record<id, boolean>` (`lib/clerking/plan/draft.ts:70-71`); the checklist counts care (`plan/checklist.ts:52`); a UI placeholder, "No signed care items for this problem yet" (`components/clerking/plan/problem-card.tsx:474-481`)                                                                                                                                                                         | The data file, its loader, sign-off file and Zod schema; evaluation of `when`; the item-level age gate; `opens` (tests to the basket, followUp, disposition; add-only); `due: later` tasks; UI. `plan_basket_class` (7 uses) is used but **not declared** in EC-7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Large**: about 300-450 lines plus UI                                                        |
| **EC-5** pregnancy atom                    | `ExamContext.patient.pregnant: boolean \| null` (context.ts:54) from `pregnancy_episodes` (`desk-load.ts:122-139`: pregnant→true, not_pregnant or postpartum→false, else null); R-6 suppresses obstetric profiles when the answer is false (`impression/suggest.ts:75`); CFC `preg.status` with answer `unknown`                                                                                                                    | A `pregnancy` atom; "unknown" as a state distinct from "not applicable" (null conflates them, and male or age is not used); a `requires` gate on a profile (Profile is `.strict()`, impression/catalogue.ts:52-74); results bounded by episode (needs EC-1). Fixes the fail-open `not pregnancy` above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Medium**: about 60-120 lines + schema; the unknown/could-be-pregnant rule is a CSO decision |
| **EC-6** glucose units and HI/LO           | mg/dL entry (`glucoseUnit`, payload.ts:115) converted by `toCanonical` at ÷18.0156 (`lib/units/conversions.ts:24`; the exam catalogue's text says 18.0); a plausible range of 0.5-50 mmol/L that needs a confirm tap (`vitals.ts:96-112`), which already catches a mg/dL value typed as mmol/L; the fact model's `value_comparator` (`< <= > >=`, 0071:567,613) and device `measuring_limits` "HI/LO per analyte" (0071:120)        | HI or LO in the vitals draft (`parseDecimal` rejects them); a comparator on `VitalValues`; atoms treating HI as at or above and LO as below; how HI/LO reads in the note and in NEWS2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **Small**: about 60-100 lines                                                                 |
| **EC-7** smaller additions                 | `finding {item, is: recorded}` already covers the pack's `{item, recorded}` (context.ts:311); the patient age atoms `{patient: age_gte, value_ref}` exist (context.ts:286-291), but the pack writes `{patient: {age_gte_ref}}`; the classifier pattern "catalogue `rules` + first-match evalCond" exists (`exam/classifiers.ts:625-633`); the history flag `adherence_any` exists (flags.ts:276-288)                                | `vs.ketones` panel + save (PanelsSchema has postural, bothArms, peakFlow: payload.ts:64); panel field and `recorded` atoms (panelAtom handles only vs.both_arms, context.ts:233-242; check.ts:200 accepts only vs.both_arms); the medicine atom with adherence (`ExamContext.medicines` has no adherence, context.ts:56); ketone_band, dr_review and acuity_band, about 20-30 lines each plus classifyAll registration; `options_ref` and option_sets (Attribute is strict, exam/catalogue.ts:76-114; the exam catalogue has no option_sets); compound `shown_when` (ShownWhen is `{attribute, any_of}` only, :28); token-map `value_from_option`; the undilated composer; DDX `setting` lists (setting is outbreak_mode only, context.ts:295; `ctx.care_setting` exists in CFC); Ask kinds `panel` and `past_detail`; the plan keys; a ketone row on the glucose chart (`lib/emr/read/monitoring.ts:33-41` charts glucose only). **Undeclared but needed**: `medicine_group` atoms inside the dx catalogue (check.ts has no branch, so "unknown atom"); `derived` in dx (same); `plan_basket_class`; a `subacute` onset (Onset enum is acute, chronic, acute_on_chronic, recurrent: impression/catalogue.ts:41); null-valued and extra-key reference entries (dx RefEntry is strict with a number value: :93-101); extra keys on named scales (`ref_dm`, strict :103-111) | **Medium** in total (many 10-40 line pieces)                                                  |
| **EC-8** "amend" semantics                 | Nothing. No amendment loader exists, and every catalogue is one file pinned by SHA-256                                                                                                                                                                                                                                                                                                                                              | A by-hand merge in Phase 2 (no code), or a loader of about 80-120 lines + tests. **Self-contradiction**: EC-8 says a scalar changes only if listed under `_changes`, but **no pack profile has `_changes`**, and the amend profiles carry a full set of scalars that differ from live (below). Applied literally, none of the scalar changes (including type 1 becoming must-not-miss) would happen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **Small** (by hand)                                                                           |

### SHA-256 pins an amendment would break

All of these were verified to match today (`shasum -a 256`):

- `data/clerking/catalogue-signoff.v1.json` pins the history catalogue at `e2eb4601…`. **04-history** breaks it.
- `data/clerking/exam-signoff.v1.json` pins the exam catalogue at `b1aec36f…`. **07-exam** breaks it, including any new glucose context value (EC-3) or HI/LO (EC-6) added in the catalogue.
- `data/clerking/dx-signoff.v1.json` pins the dx catalogue at `abddf5db…` plus `catalogueVersion` 1.0.1-draft. **09-diagnosis** breaks it, and its version must also be bumped (`catalogue-check.ts:171-175`).
- `legacy-conversion-signoff.v1.json` (`1d466d63…`) is untouched unless history symptom ids change.
- The token maps carry `catalogueVersion` but no hash.

`npm run clerking:catalogue-check` (CI) fails on the first changed byte. Each amendment needs a new sign-off file and a hash. The SHA prefix is also the catalogue's cache-busting URL (`desk-load.ts:263,313,324`).

Two more items go through the same gate:

- **10-plan-care** is a new file and needs its own sign-off file.
- **The 8 new terms** need a REF-DX-TERMS addendum (v1.2) in the live term shape (display, synonyms, chronic, sensitivity, restricted_class, icd11{…}, status), not the pack's `{id: display}`, plus a gated seed migration on the 0085 pattern.

### Per-profile diff: the 7 "amend" profiles against live

A full machine diff (atoms compared as canonical JSON) was produced during the analysis. Under EC-8, "added" items would append, "live only" items stay, and scalars change only through `_changes`, which no profile has. No profile has `must_not_miss_reason`; that is harmless under merge.

**dx.dm_type_unknown** (live :10207)

- Scalars:
  - onset: chronic → chronic, **subacute** (not a live value), acute.
  - problem_list: offer → offer_when_final.
  - note: rewritten.
- suggest_for: +9, kept 5, live-only 2 (`vs.glucose≥REF-EX-GLU-HIGH`, `ex.feet.ulcer`).
  - The +9 include 3 vital atoms with `context`, which **fail open** before EC-3.
  - It also adds 3 result atoms (EC-1), plus blurred vision, family history of diabetes, and `medicine_group glucose_lowering`. The last trips check.ts in the dx catalogue.
  - `vs.glucose(random)≥REF-DX-GLU-RANDOM-DM` (11.1) duplicates the live `vs.glucose≥REF-EX-GLU-HIGH` (11.1).
- ask: + monofilament, **panel:vs.ketones** (invalid kind), vs.waist. Live-only: medicine:insulin, past_condition:diabetes, sym.polyuria, vs.bmi.
- tests: + test.ogtt_75g; live-only test.ketones.
- related: + hyperglycaemia_unconfirmed, intermediate_hyperglycaemia; live-only dx.hhs.
- sources: + ADA-SOC-2026, WHO-HBA1C-2011, WHO-HEARTS-D-2020; live-only ADA-SOC-2025, UCG-2023.

**dx.dm_type2** (live :10047)

- Scalars: severity none → clinician [no known complications, with complications]; note rewritten.
- suggest_for: +2, kept 1, live-only 9.
  - The +2 are `past_detail type=type_2` and `medicine_group metformin`. The latter duplicates the live `{medicine: metformin, answer: taking}`.
  - The 9 live-only atoms (polyuria, polydipsia, glucose ≥11.1, BMI, waist, hypertension, metformin, glibenclamide, fundoscopy DR) stay under merge.
- **suggest_against +1: `ketone_band high|moderate`**. Not must-not-miss.
- ask: + fundoscopy, panel:vs.ketones, social:tobacco, vs.bp.
- tests: + urinalysis_dipstick; live-only glucose_random.
- related: + ckd, diabetic_kidney_disease, diabetic_neuropathy, diabetic_retinopathy, dm_type1; live-only hhs, obesity.

**dx.dm_type1** (live :9911)

- Scalars:
  - **must_not_miss false → true** (D-DM-35), with no `must_not_miss_reason`. The schema refinement requires one (impression/catalogue.ts:75-77).
  - onset: chronic → acute, subacute, chronic; default subacute.
  - note rewritten.
- suggest_for: +3, kept 4, live-only 2.
  - The +3 are ketone_band, past_detail type_1, and past_detail insulin_from_start.
  - Live-only: glucose ≥11.1, Kussmaul.
- **suggest_against: the pack lists none, but live has `cls:bmi_who=obese_1|obese_2|obese_3` (catalogue :9981).** A merge keeps it, so an against atom would sit on a profile that becomes must-not-miss. That contradicts the hand-back's statement that type 1 has none.
- ask: + panel:vs.ketones, past_detail, vs.weight. Live-only: family diabetes, insulin, polyuria#vomiting, polydipsia, polyuria, vs.bmi, vs.glucose.
- tests: + c_peptide, gad_antibodies, ketones_blood; live-only hba1c, ketones, urea_electrolytes.

**dx.dka** (live :9748; must-not-miss in both)

- Scalars:
  - kind: complication → acute_event.
  - problem_list: never → offer.
  - severity: clinician [mild, moderate, severe] → named_scale `dka_severity` (new scale).
  - note rewritten.
- suggest_for: +8, kept 2, live-only 8.
  - `vs.glucose≥REF-DX-GLU-RANDOM-DM` duplicates live ≥REF-EX-GLU-HIGH (both 11.1).
  - Kussmaul is written `includes_any ["kussmaul"]`, but the live option is `kussmaul_deep_sighing`. It is dead, and check.ts reports "unknown option".
  - `sym.vomiting` does not exist.
  - `medicine_group sglt2_inhibitor` is unknown in dx.
  - The bicarbonate and `obs.ph_venous` results need EC-1, and `obs.ph_venous` is really `obs.ph`.
  - The live-only atoms stay: polyuria red flags vomiting, abdominal pain, fast breathing and drowsy; dehydration; insulin.
- **suggest_against +1 on a must-not-miss diagnosis: `{panel: vs.ketones, field: blood, lt_ref: REF-DX-KETONE-NORMAL}`** (blood ketones below 0.6; pack :779-783). This is the only new against atom on a must-not-miss profile, and it needs the CSO's per-atom signature.
- tests: + glucose_random, ketones_blood, venous_gas; live-only blood_gas, capillary_glucose, ketones, malaria_rdt. These are the same tests renamed (Q8).
- related: live-only dm_type_unknown, malaria_severe.

**dx.hhs** (live :14943; must-not-miss in both)

- Scalars:
  - kind: complication → acute_event.
  - onset: acute → acute, subacute; default subacute.
  - problem_list: never → offer.
  - note rewritten.
- suggest_for: +2, kept 3, live-only 5.
  - Hydration is written as `{finding: {item, is}}`, which is the wrong shape. Live is `{finding: id, is}`. It is also semantically covered by the live dehydration classifier.
  - Effective osmolality via EC-1.
- No against atoms (as the hand-back says).
- tests: renamed as for dka; live-only urinalysis_dipstick.

**dx.hypoglycaemia_dm** (live :16405; must-not-miss in both)

- Scalars:
  - kind: complication → acute_event.
  - onset: acute, recurrent → acute only.
  - problem_list: never → offer.
  - severity: clinician [level 1, 2, 3] → classifier `hypoglycaemia_level`, which has no level 3 (`exam catalogue classifiers.hypoglycaemia_level`).
- suggest_for: +3 (classifier level_1/2, `medicine_group glucose_lowering`, past_detail lows), kept 0, live-only 8.
  - The classifier atom is equivalent to the live `vs.glucose<REF-EX-HYPO-L1`.
- No against atoms.
- tests: + creatinine; live-only capillary_glucose, urea_electrolytes.

**dx.ckd** (live :7250)

- Note only. suggest_for +2 (eGFR and UACR via EC-1). related + diabetic_kidney_disease.
- Everything else is untouched under merge; listing live-only items is not removal.

**Other dx amendments**

- `reference_entries.add` collides with live `REF-DX-GLU-HHS` (same value 33.3, dx :267). An EC-8 "add" fails there.
- `REF-DX-RESULT-AGE-GLUCOSE` has value null and extra keys (mirrors, note), which fail the strict RefEntry.
- DDX-POLYURIA `source.replace` edits signed content.
- **DDX-GLUCOSE-HIGH amend adds `dx.steroid_induced_hyperglycaemia` to every glucose of 11.1 or more, with no steroid condition.** DDX-STEROID-GLUCOSE already covers that with the steroid gate.

## Q10: concepts

The full table is in `concepts-diff.csv`, with columns section, pack_id, pack_value, pack_status, result, live_id and evidence.

**conceptsToPropose (30)**

- Exist exactly (6): `derived.osmolality_effective`, `obs.c_peptide`, `obs.islet_autoantibody`, `obs.chol_total`, `exam.ankle_reflex`, `soc.physical_activity`. The pack says total cholesterol does not exist; it does, and `test.lipid_panel` returns it.
- Exist under another id (7):
  - `obs.ph_venous` → `obs.ph` + specimen
  - `exam.macular_oedema` → `exam.maculopathy` (answers need extending)
  - `exam.pinprick_foot` → `exam.pinprick`
  - `exam.ipswich_touch` → `exam.ipswich_touch_test` (coded normal or abnormal; the 0-6 count is lost)
  - `event.hypoglycaemia` → `evt.hypoglycaemia` (level1..3)
  - `proc.retinal_examination` → `proc.eye_screen`
  - `proc.foot_risk_assessment` → `proc.foot_exam`
- New (17): obs.vitamin_b12, obs.upcr, obs.abi, obs.visual_acuity, exam.retinal_view, sign.lipohypertrophy, sign.foot_hot_swollen, derived.cvd_risk_who, derived.kdigo_gfr_category, derived.kdigo_albuminuria_category, derived.iwgdf_risk, hx.dm_type_reported, hx.dm_year_diagnosed, hx.prior_gdm, soc.food_security, target.hba1c, target.bp.
  - `hx.*` is not a live namespace (live is `hist.*`).
  - A reported type can already be recorded as `cond.dm_*` with `assertedBy: patient_reported` (ENUMS :7445).
  - `target.*` needs a new ConceptKind (catalogue.generated.ts:10-17), which is a schema change.
  - The pack's "next free number after v1.4" assumes v1.4 is signed. CFC v1.4 (`docs/emr/cfc/cfc-v1.4-proposal.md`) is **unsigned**, so this pack's addendum would be v1.5, or would fold into v1.4.

**Glucose qualifiers: pack placeholder → fact model** (`lib/facts/types.ts:131-142`, ENUMS :7398-7414)

| Pack                                                        | Fact model                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `context: random`                                           | `fastingState: non_fasting`                                                                                              |
| `context: fasting` / `fastingState: fasting`                | `fastingState: fasting` (`unknown` is never read as fasting)                                                             |
| `ogtt_1h`, `ogtt_2h`, `challenge: ogtt_75g_2h`              | `challenge: {type: "ogtt_75g", minutesPostLoad: 60 \| 120}`. `ogtt_75g_2h` is not a value                                |
| `two_hours_after_food`                                      | `challenge: {type: "meal", minutesPostMeal: 120}` (vitals.ts already writes this)                                        |
| `two_hours_after_glucose` (vital)                           | no vital value. On a fact it is `challenge ogtt_75g, 120`                                                                |
| `specimen: capillary` / venous                              | `specimen: capillary_whole_blood` / `venous_plasma` (both in the enum)                                                   |
| point of care                                               | `pointOfCare: boolean` (+ `deviceId`, `calibration` conditional). Not an enum value                                      |
| HbA1c `method: laboratory_ngsp \| point_of_care \| unknown` | `certification` (ngsp, ifcc, ngsp_and_ifcc, none, unknown) + `pointOfCare` + `method`: all already required on obs.hba1c |
| eGFR `equation`                                             | `formula` (required context; carried in provenance, refinements.ts:74)                                                   |

All 4 "qualifiersNeeded" already exist under the fact model's names. No new qualifier is needed.

**diagnosisTermToConcept (16)**

- Pack "map" ids that **do not exist**:
  - `cond.dm_unclassified`; live is `cond.dm_unspecified`.
  - `cond.hypoglycaemia_diabetes`; live is `cond.hypoglycaemia_in_dm`.
  - `cond.diabetic_foot`; live is `cond.dm_foot_ulcer`, which is narrower ("ulcer" only, while the term is "ulcer or infection").
- Pack "new" ids that **already exist**:
  - intermediate_hyperglycaemia → `cond.intermediate_hyperglycaemia`
  - retinopathy → `cond.dm_retinopathy`
  - kidney disease → `cond.dm_kidney_disease`
  - neuropathy → `cond.dm_neuropathy`
  - hyperglycaemia_unconfirmed → `cond.elevated_glucose_unspecified`
  - gestational diabetes and diabetes in pregnancy → **one** concept, `cond.dm_in_pregnancy` ("Diabetes or hyperglycaemia in pregnancy"): CSO to choose between two terms on one concept or a split.
- Only `steroid_induced_hyperglycaemia` is new.
- The `diagnosis_terms.concept_id` column exists (`0071_emr_record_spine.sql:150`), but no term JSON carries concept_id and the 0072 insert omits the column (`0072_emr_reference_seed.sql:328`). Every mapping is a gated UPDATE migration.

**featureToConcept**

- The only bad "existing" claim is `blurred_vision → sx.vision_change`. That concept exists only in the unsigned v1.4 proposal; live is `sx.blurred_vision`.
- The 13 with no bridge are the five glucose features (random, fasting, OGTT 1 h and 2 h, postprandial; meter extreme), BOHB, potassium, LDL, triglycerides, smoking, alcohol pattern and foot numbness. `lib/ncd/cfc-map.ts` maps only `capillary_glucose`.

## Q11: test menu and formulary

**Live test-menu entry** (`data/emr/test-catalogue.v1.json:116`):

```json
{
  "id": "test.hba1c",
  "display": "HbA1c",
  "kind": "lab",
  "panelComponents": ["obs.hba1c"],
  "specimenType": "venous_whole_blood",
  "container": "edta",
  "fasting_required": false,
  "defaultUnits": { "obs.hba1c": "%" },
  "capability_id": "cap.hba1c_lab",
  "turnaround_target_minutes": null,
  "in_house": true,
  "active": true
}
```

Rules for every entry:

- `kind` must be lab, imaging, ecg or procedure (DB CHECK, 0071). The pack's `point_of_care` and `laboratory` are invalid; there is no POC kind.
- `panelComponents` must be CFC ids.
- `capability_id` must be one of `CAPABILITY_IDS` (catalogue.generated.ts:7610).
- Ionising tests are a hard-coded set (`scripts/emr/gen-seed.ts:58`).

Every pack entry lacks `panelComponents`, `specimenType`, `container`, `fasting_required` (except OGTT), `defaultUnits`, `capability_id`, `turnaround_target_minutes`, `in_house` and `active`, and has an invalid `kind`.

| Pack entry               | Status                                  | Notes                                                                                                                                               |
| ------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| test.glucose_capillary   | dx-proposed as `test.capillary_glucose` | obs.glucose, capillary_whole_blood, `capillary_direct`, `cap.glucometer`                                                                            |
| test.ogtt_75g            | absent                                  | `components` are time labels, not concepts. Three points of one concept need the `challenge` context, not three panel components. `cap.ogtt` exists |
| test.ketones_blood       | dx-proposed as `test.ketones`           | obs.ketones_blood, `cap.blood_ketone_meter`                                                                                                         |
| test.venous_gas          | dx-proposed as `test.blood_gas`         | `obs.ph_venous` does not exist. Use `obs.ph` + `obs.bicarbonate`, `cap.blood_gas`                                                                   |
| test.c_peptide           | absent                                  | concept exists, no capability                                                                                                                       |
| test.gad_antibodies      | absent                                  | `obs.islet_autoantibody` with context antigen GAD                                                                                                   |
| test.vitamin_b12         | dx-proposed as `test.b12_folate`        | **blocked**: no B12 concept                                                                                                                         |
| test.retinal_photograph  | absent                                  | `exam.macular_oedema` → `exam.maculopathy`; `exam.retinal_view` absent; `cap.retinal_camera`                                                        |
| test.abi                 | absent                                  | **blocked**: no `obs.abi`                                                                                                                           |
| test.xray_abdomen (hold) | dx-proposed id (2 profiles)             | imaging. Would need adding to the ionising set                                                                                                      |
| test.urine_pcr (hold)    | absent                                  | **blocked**: no `obs.upcr`                                                                                                                          |

**Live formulary entries** (`data/prescribing/drug-catalogue.v0.json`, generated into `lib/prescribing/reference/general-formulary.ts`).

Drug (:6662):

```json
{"id": "metformin", "generic": "Metformin", "class": "oral_glucose_lowering", "routes": ["oral"], "methods": {"oral": ["By mouth"]}, "presentationsDraft": ["Tablet", "Modified-release tablet"], "allergyGroups": [], "flags": {"renal": true, "hepatic": true, "weightBasedInChildren": false, "weightBasedInAdults": false, "controlled": false, "highAlert": false, "narrowTherapeuticIndex": false, "reserveAntibiotic": false}, "charts": ["mar", "glucose"], "dose": {"status": "to-verify", "verifyAt": [...], "regimens": [], "bands": {"adult": null, "olderAdult": null, "child": null}, "renal": null, "hepatic": null, "pregnancy": null}, "onEmhsluDraft": true}
```

Class (:584):

```json
{
  "id": "oral_glucose_lowering",
  "name": "Oral glucose-lowering drugs",
  "system": "endocrine",
  "parent": null,
  "allergyGroup": null,
  "note": "Merged class: metformin (biguanide) and sulfonylureas."
}
```

diagnosisLinks (:10959):

```json
{
  "profileId": "dx.dm_type2",
  "classes": ["oral_glucose_lowering", "insulin", "statin", "acei"],
  "supportive": []
}
```

Drugs:

- Present: metformin, glibenclamide, gliclazide.
- Absent: glimepiride, dapagliflozin, empagliflozin, vildagliptin, sitagliptin, pioglitazone, semaglutide, insulin_aspart, insulin_biphasic_aspart, bendroflumethiazide. Bendroflumethiazide is a history quick pick with no formulary entry, as the pack says.
- Each absent entry lacks `routes`, `methods`, `presentationsDraft`, `allergyGroups` (sulfonylureas use `sulfonylurea`), `flags` (8 keys: the kidney check reads `flags.renal`, `lib/prescribing/plan-checks.ts:183`, so it will not run without them; insulins are `highAlert: true` live), `charts` (glucose chart opening is **per drug**, not a class "chart rule"), the `dose` skeleton and `onEmhsluDraft`. The pack carries `emhslu2023` text instead.

Classes:

- All 6 pack classes are absent. The live shape is {id, name, system, parent, allergyGroup}; the pack has {id, label, split_from, why}.
- The live `parent` field (e.g. `abx.cephalosporin.1`) allows sulfonylurea and biguanide as **children** of `oral_glucose_lowering` instead of retiring it. That decision belongs to the owner.

diagnosisLinks:

- The pack's {dx, add, keep} is not the live {profileId, classes, supportive}.
- Links for dx.diabetic_kidney_disease, dx.diabetic_neuropathy and dx.gestational_diabetes would point at profiles that do not exist.
- The dm_type2 "keep" list drops `oral_glucose_lowering`.

Checks and charts:

- Live plan checks have outcomes stop, check, note and passed, which match the pack's 13 proposed checks. None of the 13 exists; there is no eGFR check (creatinine only).
- There is no ketone row on the glucose chart.

**No dose content.** A scan of `formulary.additions.json` for amounts, units, frequencies and titration words found only the direction phrase "new or increased ACE inhibitor or ARB" (:254). The drug entries carry no dose key at all.

## Clerking-v2 items that duplicate something live

**History (04)**

- None of the 4 quick picks exists, but the exam's `medicine_groups.glucose_lowering.name_stems` already match gliclazide, glimepiride and dapagliflozin in free text (exam catalogue :16126).
- `condition_details`, `last_check`, the prior-GDM question and both flags are new.

**Exam (07)**

- `medicine_groups` insulin, metformin, sulfonylurea and sglt2_inhibitor are subsets of the live `glucose_lowering` stems. Their shape is a bare list; live is {label, drug_class, name_stems}.
- **SUG-DM-POSTURAL** duplicates live SUG-SYNCOPE in full (dizziness → `vs.postural` for everyone, :15203).
- **SUG-DM-UNWELL**: every target except `vs.ketones` is already offered by SUG-POLYURIA whenever past diabetes = yes (:14879).
- **SUG-PMH-DIABETES**: 4 of 7 targets (glucose, waist, feet, fundoscopy) duplicate SUG-POLYURIA. New: bp, weight, acuity.
- **SUG-DM-NEURO**: the feet tests duplicate SUG-POLYURIA → `ex.feet`; the reflexes are reachable via SUG-STROKE → `ex.nervous/motor` (numbness).
- **FLAG-EX-GLU-KETONE-TEST** (glucose 18 or more: "test ketones") is a subset of live FLAG-EX-GLU-HIGH (11.1 or more: "check ketones", :14014). Its different badge would show a second badge for the same glucose.
- **FLAG-EX-INSULIN-STOPPED** escalates live FLAG-MED-ADHERENCE (history :10651; badge `{verb} {medicine}` → "Stopped insulin"). Its badge "Medicine stopped: insulin" will not merge with it.
- `REF-EX-KETONE-RAISED` (0.6) and the pack's own `REF-DX-KETONE-NORMAL` (0.6) mirror the same dossier entry. That is two ids for one number (N1).
- **`ketone_band`**: no ketone classifier, panel or catalogue entry exists live. Its urine option ids (neg, 1plus) must map to CFC `obs.ketones_urine` (negative, plus1…), as `lib/ncd/cfc-map.ts` DIPSTICK_TO already does.
- **`dr_review`**: new. Fundoscopy `seen=diabetic_retinopathy` (ungraded) and `seen=not_visualised` overlap the new dr_grade and view (the pack notes this).
- Shape: all 7 exam flags lack the required `shown_in` and `section`; all 7 suggestions use `targets[]`, not `suggest[{target,label}]`; both new items fail the strict Item schema (`system`, `concept`, `source` keys; `measured` without a classifier); `options_ref` is not allowed.

**Diagnosis (09)**

- `REF-DX-GLU-HHS` is already live with the same value.
- `REF-DX-GLU-RANDOM-DM` (11.1) duplicates `REF-EX-GLU-HIGH` (11.1, :540) in value and use.
- **DDX-GLUCOSE-VERY-HIGH** (33.3 or more → hhs, dka, dm_type_unknown) is fully subsumed by live DDX-GLUCOSE-HIGH (11.1 or more → dka, hhs, dm_type_unknown, dm_type2, dm_type1, with dka and hhs first; :40126).
- `sourcesToAdd`: `KDIGO-CKD-2024` and `IWGDF-2023` are already live.

**Plan (10)**

- `opens.tests` duplicate live `tests_to_decide` already shown on the problem card (`lib/clerking/plan/problems.ts:75-80`):
  - CARE-DKA-KETONES (dka, dm_type1: both tests)
  - CARE-DM-HBA1C (all three types)
  - CARE-DM-KIDNEY (dm_type2)
  - CARE-DM-LIPIDS (dm_type2)
  - CARE-DKD-CONFIRM and CARE-DKD-EARLY-REPEAT (ckd)
- 16 items name a problem that is not a live profile; 10 name only such problems.
- `{patient: {age_gte_ref}}` is the wrong shape; live is `{patient: "age_gte", value_ref}`.

## Disagreements needing a CSO or owner ruling

1. **DKA "against" atom**: blood ketones below 0.6 argue against DKA, on a must-not-miss diagnosis. This needs a per-atom signature.
2. **Type 1 → must-not-miss (D-DM-35).** It has no `must_not_miss_reason`, so the schema fails. EC-8 without `_changes` would not apply it. A merge keeps the live "obese BMI against type 1" atom on a must-not-miss profile.
3. **EC-8 contradiction**: either add `_changes` to the amend profiles or accept the listed scalar changes (kind, onset incl. the non-existent `subacute`, problem_list never→offer for DKA/HHS/hypo, severity, notes) one by one.
4. **Fail-open order**: no glucose-context atom or `not pregnancy` item may load before EC-3 and EC-5. The owner chooses between a three-valued evaluator and strict ordering.
5. **DDX-GLUCOSE-HIGH + steroid-induced** for every high glucose: likely an error; DDX-STEROID-GLUCOSE already covers it.
6. **Concept ids**:
   - 3 pack "map" ids are wrong.
   - 7 "new" conditions already exist.
   - Gestational diabetes and diabetes in pregnancy share one concept.
   - Extend `exam.maculopathy` and `exam.ipswich_touch_test` answers or add concepts.
   - `hx.*` versus `hist.*`/`cond.*` with `assertedBy: patient_reported`.
   - The CFC version numbering (v1.4 unsigned).
7. **Test ids**: adopt the dx catalogue's existing ids (`test.capillary_glucose`, `test.ketones`, `test.blood_gas`, `test.b12_folate`) or rename them (renaming edits 46+ signed profiles).
8. **Formulary**: split `oral_glucose_lowering` by `parent` (keep it) or retire it. Who completes the flags (renal, highAlert) for 10 drugs.
9. **Duplicates to drop or keep**: SUG-DM-POSTURAL, DDX-GLUCOSE-VERY-HIGH, FLAG-EX-GLU-KETONE-TEST versus live FLAG-EX-GLU-HIGH, and the INSULIN-STOPPED badge text.
10. **`sym.vomiting`** maps to the wider `sym.nausea_vomiting` until the CFC v1.4 "which" property exists. A nausea-only answer would then trigger the SGLT2 and DKA rules.
