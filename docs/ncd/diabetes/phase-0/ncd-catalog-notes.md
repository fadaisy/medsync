# Phase 0: NCD catalog and evaluator (Q2 to Q7)

Scope: Design A (`lib/ncd`) against pack 0.3.0-draft. Worktree `medsync-ncd`, branch `feat/ncd-diabetes-pack` at `8e45d34`. Discovery only: no repo file was changed. Per the 8 GB limit, tsc, next build, eslint and vitest were **not** run, so the "live catalog test counts" baseline is still to do. `python3 tools/build/build.py --check` was run: 83 vignettes, 0 errors, 0 warnings.

Deliverables in this folder:
- `feature-map.csv`: Q2, 192 rows.
- `overlap.csv`: Q6, 199 rows.
- `validator-errors-merged.txt`: Q7, the full error list.
- `scripts/`:
  - `validate-pack.ts.txt` (Q7).
  - `truth-live.ts.txt` and `truth_cmp.py` (Q5 truth tables).
  - The `.ts.txt` suffix keeps them out of `tsconfig`'s `**/*.ts`. To run one, copy it to a `.ts` path outside the repo and run `npx tsx` from the repo root.

---

## Q2 Feature map: counts

| status | n | reuse | reconcile | new |
|---|---|---|---|---|
| same | 52 | 44 | 6 | 2 (`cognitive_impairment`, `abi`) |
| renamed | 20 | 0 | 13 | 7 |
| option_mismatch | 16 | 2 | 8 | 6 |
| unit_mismatch | 10 | 4 | 3 | 3 |
| absent | 94 | 0 | 15 | 79 |
| **total** | **192** | 50 | 45 | 97 |

How the statuses are used:
- `unit_mismatch` covers a different unit string, and also a different value type or scale (number vs categorical, number vs duration).
- `option_mismatch` covers two cases: a select whose options differ, and a pack boolean that maps onto one or more live options.
- Not all 50 "reuse" features are clean. Four have a unit-string mismatch: `pulse` (`/min` vs `bpm`), `respiratory_rate` (`/min` vs `breaths/min`), `temperature` (`Cel` vs `°C`) and `bmi` (`kg/m2` vs `kg/m²`). Two have option mismatches: `dm_status` and `glucose_lowering_therapy`.
- Capability differences on features that are otherwise the same:
  - `bicarbonate`: the live feature requires `lab.blood_gas`; the pack uses `lab.electrolytes`.
  - `retinopathy_stage`: the live feature has no `requires`; the pack uses `imaging.fundus`.
  - `ogtt_2h`: the live feature uses `lab.glucose`; the pack uses `lab.ogtt`.
- 82 of the 83 vignettes set at least one feature that is absent in live (`feature-map.csv`, status `absent`). Vignette parity therefore depends on Phase 2 and 3 adding features.

### Settled questions

**`dm_status`.**
- Live options are `known | evaluating | none`, displayed "Known diabetes / Being evaluated / No known diabetes" (`lib/ncd/catalog/diabetes/features.ts:485`).
- The pack's `not_known` maps to live `none`.
- Live adds `evaluating`, which no pack rule reads. Live rules already use `dm_status in [evaluating, none]` (rules-aetiology.ts:285, 368).

**`glucose_lowering_therapy`.**
- It is a `multi_select` (features.ts:522).
- Options: `none | metformin | sulfonylurea | dpp4 | sglt2 | tzd | agi | glp1 | insulin | other | unknown`.
- The sulfonylurea agent is a separate single-select, `sulfonylurea_agent` (features.ts:543), with options `glibenclamide | gliclazide | glimepiride | glipizide | other | unknown`. It is shown when `glucose_lowering_therapy == sulfonylurea`.
- Pack to live mapping:

| Pack option | Live option |
|---|---|
| `glibenclamide`, `gliclazide`, `glimepiride` | `sulfonylurea` plus `sulfonylurea_agent` |
| `sglt2_inhibitor` | `sglt2` |
| `pioglitazone` | `tzd` (class only, no agent field) |
| `dpp4_inhibitor` | `dpp4` |
| `glp1_ra` | `glp1` |

- Live-only options: `agi`, `other`, `unknown`, `glipizide`.
- The pack's three "any sulfonylurea" `==` predicates collapse to a single `== sulfonylurea`.

**Does `!=` on a multi-select mean "not selected"?** Yes.
- Live: `!picked.includes(value)` (`lib/ncd/engine/evaluate.ts:274-275`). The reference evaluator agrees (`build.py:297`); both were verified by probe.
- A blank capture is `insufficient` in both.
- Hazard (N14): `["unknown"]` satisfies `!= insulin` in both evaluators. "Not known" reads as "not on insulin". Option 1: the six pack `!=` predicates (DM-ACT-RX-02/03/04) add `glucose_lowering_therapy != unknown`. Option 2: the evaluator treats `unknown` as insufficient.

**Is a numeric age available to predicates?** No.
- `EvalContext` carries only `ageBand?` (evaluate.ts:197).
- `ageBandFromDob` computes whole years and discards them (`lib/ncd/age.ts:35-44`).
- There is no age feature. `age_at_onset` exists, but it is the age at onset, not the current age.
- `lib/emr` computes `ageYears` (`computeAgeYears`), but outside `lib/ncd`.
- Pack predicates on `age_years` cannot evaluate today. They appear in rules, the glibenclamide flag and the hypoglycaemia risk model.

**How pregnancy is recorded, and whether anything can say "could be pregnant".**
- Live has `pregnant`, a boolean (features.ts:740) in section `hba1c_validity`. It has no sex or age gate, no `showWhen` and no `ageBands`.
- Its children are `lnmp` (hba1c-evidence.ts:546) and `pregnancy_confirmed_by`. `lnmp` derives gestation for **display only**; the value never enters the eval context (schema.ts:404-413).
- Readers: the caveat `hba1c_pregnancy` (validity.ts:188), the rule `euglycaemic_dka_pregnancy`, and two exam features (`showWhen pregnant present`).
- Nothing in `lib/ncd` can express "could be pregnant" or "pregnancy unknown".
- The nearest thing is in the EMR:
  - `lib/emr/chart.ts:479-495` shows "Pregnancy status not recorded" for a female inside `REF-PREG-AGE`.
  - That reference is `pending_cso` with no data (`lib/emr/reference/pregnancy.ts:19-27`), so the line never renders today.
  - The `PregnancyFact.state` field has an `unknown` value (`lib/facts/types.ts:241`).
  - `lib/ncd/cfc-map.ts` does not map pregnancy facts into the NCD capture.
- Live `sex` has a third option, `other`, displayed **"Other or not recorded"** (examination.ts:163). That is an option meaning "not recorded", which conflicts with N14 and with `preg_state`, which treats only `male` as not pregnant.

---

## Q3 Age bands

- `lib/ncd/age.ts:41-43`: child is under 10, **adolescent is 10 to 19 inclusive** (`years < 20`), adult is 20 to 64, and older_adult starts at 65. The WHO definition of adolescence is cited in the comment.
- **The adolescent band ends at 20, not 16.** D-DM-32's premise ("the platform's adolescent band ends there") is false as built.
- Consequences:
  - The pack's `ages: adult` items (flags, steps, targets, risk models, bands) would not run for people aged 16 to 19.
  - Live paediatric/adolescent DKA grading applies to 16 to 19 instead (`severe_dka_adolescent`, `dka_suspected_adolescent`).
  - The vignettes label two 19-year-olds as `adult` (DMV-15, DMV-68). Live would band them `adolescent`.
  - DMV-40 is a 10-year-old labelled `child`; live bands them `adolescent`.
- Another threshold exists: `lib/prescribing/engine.ts:19` sets `PAEDIATRIC_AGE_THRESHOLD = 16`. The platform therefore has two "adult" boundaries, 16 for prescribing and 20 for the NCD bands. **Owner/CSO ruling needed** (D-DM-32).

---

## Q4 Schema: S-DM-01 to S-DM-16

| Id | Verdict | Evidence / what is missing |
|---|---|---|
| S-DM-01 StandardBody | needs a field (type widening only) | `schema.ts:47-58`. ICO, ISPAD, JBDS, NICE and the Uganda MoH are filed as `local` today; the validator accepts it. |
| S-DM-02 `verdict`, `appliesTo` | needs field **and code** | `diagnose()` evaluates ONE set, picked by `preferredCriteria` (schema.ts:1159-1165; assess.ts:472). A second WHO set (intermediate, GDM, remission) is never reached. Appended next to live `who_2019`, the pack's `who_hearts_d_2020` would also be dead, because the first WHO set wins. |
| S-DM-03 WHO chart lookup | needs code | `Feature.computed.formula` is the literal `"bmi"` (schema.ts:427); `FORMULAS` has only `bmi` (evaluate.ts:433-440). |
| S-DM-04 two-key interval | needs field and code | `ScreeningInterval.forStage` is one string (schema.ts:693-698). assess.ts:682-685 uses the first staged system's code. |
| S-DM-05 `months_since`, none-on-record | needs code | Same formula registry as S-DM-03. "None on record" needs record completeness, which is Design B. |
| S-DM-06 target rule | needs field and code | No target construct in `NcdCatalog` (schema.ts:1101-1131). |
| S-DM-07 nested groups | **already possible** for at most 2 OR-groups; deeper needs code | A criterion conjoins `all` + `any` + `atLeast` (evaluate.ts:376-381), so `any` plus `atLeast{n:1}` gives AND(OR, OR). The live and reference evaluators agree on all 64 mixed-branch combinations. |
| S-DM-08 `notWhen`, `cautions`, `needsBeforeActing` | needs field and code | None exist. |
| S-DM-09 `ages` on targets, bands, risk models, flags | needs field and code | `ageBands` exists only on Feature, DifferentialCondition and DifferentialRule (schema.ts:519, 1049, 1078). |
| S-DM-10 direction-aware blocking reaching bands, targets, steps | needs code | `diagnose()` drops every criterion that reads a blocked feature, whatever the direction (assess.ts:484-490). Caveats touch nothing else: not `interpretations()`, complications, staging or flags. |
| S-DM-11 inclusive upper edge | needs field and code | `to` is exclusive in `bandFor` (schema.ts:906-910), and the tiling check assumes it (validate.ts:625-634). |
| S-DM-12 neutral strings | needs field and code | No restricted-class concept anywhere in `lib/ncd`. |
| S-DM-13 `recorded` op | needs code | Not in `PredicateOp` (schema.ts:590). It falls to `default: insufficient` (evaluate.ts:302). `present` is no substitute: `present` on false or 0 is `not_met`. The validator does not reject unknown ops. |
| S-DM-14 `enabled`/`enabledBy`, `requiresCapability` | needs field and code | Capability gating is per feature only (`isPerformable`, schema.ts:1150). |
| S-DM-15 `notMetRequires`, `neverNotMet` | `notMetRequires`: needs field and code. `neverNotMet`: **already the live behaviour** | `classify()` returns only supported or unclassified; it has no per-class `not_met` (assess.ts:563-604). |
| S-DM-16 pregnancy unknown withholds | needs code (and a platform input for sex/age) | See Q2. |

Two further shape gaps, not in §8:
- The live catalog has **no** `management` or `riskModels` (index.ts:62-92), and **no engine path evaluates either**. They are only validated (validate.ts:584, 706).
- `interpretations()` shows **one table per feature**, chosen by standard preference (assess.ts:257-278). The pack's three HbA1c control tables, its FPG and capillary control tables and live `hba1c_who`/`fpg_who` cannot coexist on one feature.

---

## Q5 Evaluator semantics: live vs reference (`build.py`)

The full live truth tables are in `scripts/`. 460 combinations were tested: AND, OR and `atLeast` over 1 to 3 predicates in the four states, plus 64 mixed branches.

| Area | Live | Reference | Divergence / minimal input |
|---|---|---|---|
| AND (`combineAll` evaluate.ts:318, `AND` build.py:302) | not_met > unavailable > insufficient > met | same | none (all combinations equal) |
| OR (`combineAny` :336, `OR` :307) | met > insufficient > unavailable > not_met | same | none |
| Branches conjoined (`conjoin` :360, build.py:321) | AND precedence | same | none |
| **atLeast** (:350-357 vs build.py:317-319) | Not met if `m+i+u < n`; else **insufficient if any insufficient**, else unavailable | Not met if `m+i+u < n`; else **insufficient if `m+i >= n`**, else unavailable | 23 of the combinations differ. Example: `atLeast 2 of [insufficient, unavailable]` gives live `insufficient`, reference `unavailable`. Another: `3 of [met, insufficient, unavailable]`. The reference is more precise: the criterion cannot be reached here. |
| Empty criterion | `insufficient` (:381) | `met` (`AND([])`) | `{}` (no predicates). The live validator rejects it; the reference does not. |
| `present` on string `"neg"` | **met**: `isPositive` only treats `none`/`negative`/empty as negative (:217) | not_met (`truthy`, build.py:285) | `urine_ketones = "neg"`, `present`. Latent: neither catalog uses `present` on a non-boolean today. Also, `differential.ts:259-279` treats `no`/`absent` as negative while `evaluate.ts` does not: the live evaluator is inconsistent with itself. |
| `present` on number 0 / empty list | not_met / insufficient | met / met | latent |
| `in` with a scalar value | not_met | membership/substring test | `{op: in, value: "insulin"}` on `["insulin"]`. The live validator rejects scalar `in`. |
| `recorded` op | insufficient (unknown op) | met when a value exists | Every pack `notWhen` uses it. |
| Unknown feature | insufficient | crashes (KeyError) | |
| Numeric vs non-number (e.g. "HI") | insufficient | crashes (TypeError) | relevant to EC-6 |
| Duration | normalised via `p.unit` (:288-295) | unsupported (crash) | `dm_duration` 120 months `>=` 10 years: live `met` |
| Series | latest reading (:203-207) | unsupported (vignettes store scalars) | parity only if fixtures map scalars to one-reading series |
| Explicit `unavailable` capture | honoured (:238-240) | no representation | |
| Capability gating | per feature (`requires` not on site → unavailable unless recorded) | same per feature, **plus** item-level `requiresCapability` → `unavailable_here` (build.py:352, 382) | Sites differ (see the site-profile row below). |
| Site profiles | `REFERRAL_SITE`: 17 capabilities. `DISTRICT_SITE`: glucometer, monofilament, lab.glucose, ketones_urine, creatinine, dipstick (index.ts) | referral = `"ALL"`. District = glucometer, ketones_urine, dipstick, visual_acuity_chart, bp_cuff_sizes (`k_vignettes.py:7`) | At district, live can do **lab.glucose, lab.creatinine and monofilament**; the reference says unavailable. At referral, the pack's new capabilities (`lab.ogtt`, `lab.lipids`, `device.tuning_fork_128`, …) are missing from live. 20 vignettes are district. |
| Unavailable flags | `therapyConcerns` reports flags whose check is `unavailable` (assess.ts:184-205) | only fired flags | |
| First-match staging | first `met` stage per system; otherwise least-committal state; no caveats; runs whether or not diabetes is established (assess.ts:640-699) | only if established; first met stage, then **withheld** if it reads a direction-blocked feature or fails `notMetRequires`; break, no fall-through (build.py:412-424) | e.g. `retinopathy_stage = none` + `fundus_method = undilated` gives reference "no stage"; live has no DR complication and would stage it. |
| Complication state | `rollUpAny(establishedBy)` | guarded by caveats; `not_met` becomes insufficient without `notMetRequires` | |
| `requiresConfirmation` | in `diagnose()`, a flagged criterion alone does not diagnose; two distinct flagged criteria do (assess.ts:509-512) | **ignored** | The pack sets it nowhere (WHO style, repeat as a predicate), but the live ADA set relies on it. |
| Diagnosis output | one set; `established` short-circuits; states established/criteria_met/not_met/insufficient/unavailable | every set; `runWhen` → `not_applicable`; per-set met/…; a met set suppressed by `notWhen` → **not_met** (build.py:372) | Needs a state mapping for parity. |
| **Blocking caveat in diagnosis** | Criteria reading the feature are **dropped** before evaluation, any direction (assess.ts:484-492) | Kept, then guarded: met → insufficient (any blocking caveat); not_met → insufficient (masks/unpredictable); manufactures not_met stays not_met (build.py:340-344) | Verified on live `who_2019` at district: haemolysis + HbA1c 7.0 (or 5.0), random 6 with no symptoms, FPG 5, OGTT 6, second sample yes. **Live `not_met`, reference `insufficient`.** The reference is safer (N8). |
| Non-blocking caveat shown | whenever `when` is met (assess.ts:405-417) | only when the feature has a value (build.py:334) | |
| Caveats elsewhere | none | bands withheld, targets withheld, `therapy_review` steps read the value as insufficient (build.py:292, 396, 427, 444) | |
| Ages | `inAgeScope`: unknown band → in scope (differential.ts:211) | rules need band in `ageBands`; `ages: adult` items need adult/older_adult (build.py:351, 391) | an unknown band runs adult items in live |
| `enabled:false`, `notWhen`, pregnancy `appliesTo`, `cautions`, `needsBeforeActing` | absent | dark / suppressed / withheld / cautions / gaps (build.py:346-351, 380-407) | Loaded as-is (`x` stripped), live would **fire every dark item** and never suppress. |
| Interpretation | one table per feature (above); `when` is a Predicate; series aware | every table independently, gated by lane/established/ages/pregnancy/`when`; withheld under a blocking caveat | |

---

## Q6 Overlap: summary (`overlap.csv`)

199 rows:
- the 159 pack items carrying `x.review`;
- all 19 flags, 27 caveats, 19 acute-route rules and 13 amendments;
- the duplicate classification `ketosis_prone_type_2`;
- 12 live-only rows.

Relations: 123 pack_only, 58 different, 6 same, 12 live_only. Of the 58 "different": the pack is safer on 20, live on 10, they are equal on 20, and 8 need a CSO ruling.

**The three questions the first reviewer asked:**

**Metformin with eGFR < 30: covered.**
- Live `metformin_low_egfr` (therapy-flags.ts:117) has the same predicate as the pack's `metformin_egfr_below_30`.
- The difference is severity (live **amber**, pack **red**) and the action text (live "Stop metformin…").
- The pack's eGFR 30 to 44 flag has no live equivalent.

**Low glucose: covered.**
- Live: the acute complication `hypoglycaemia` (complications.ts:176), which raises a red emergency at level 1 (<3.9), level 2 (<3.0) or level 3 (needed help).
- Live rules: `hypoglycaemia_level2_measured`, `hypoglycaemia_level1_measured`, `severe_hypoglycaemia_*`.
- Live also has a `capillary_hypo` low band.
- Gaps against the pack:
  - Live reads only `capillary_glucose` and `random_pg`: no fasting, post-meal or OGTT field, no meter LO, no "not resolving".
  - Live fires red on <3.9 in **anyone**. The pack gates level 1 on diabetes or insulin/sulfonylurea (DM-ACU-ROUTE-07).

**HHS: covered biochemically, not on glucose alone.**
- Live `hhs` (complications.ts:128) needs `random_pg` ≥ 33.3, osmolality > 300 (or total > 320), BOHB < 3 and HCO3 ≥ 15. It omits pH ≥ 7.3, the urine-strip alternative and capillary glucose.
- The live rules `hhs_suspected_bedside` (≥33.3 plus a sign plus no Kussmaul/acetone), `hhs_hyperosmolar_without_ketosis` and `mixed_dka_hhs_suspected` add bedside routes.
- Pack DM-ACU-ROUTE-14 fires on ≥33.3 or HI alone. Live has nothing equivalent.

**Collisions the live validator does not catch:**
- Duplicate ids or codes: caveat `hba1c_pregnancy` (same predicate), classifications `type_1` and `ketosis_prone_type_2`, and criterion id `hiv_art`.
- Duplicates it does catch: flag `sglt2_during_acute_illness` and six condition codes (`dka`, `hhs`, `hypoglycaemia`, `gestational_diabetes`, `type_1_diabetes`, `non_diabetic_kidney_disease`).
- Coverage gaps in the live catalog: there is **no diabetic retinopathy complication** and **no neuropathy complication**. The pack adds both.

---

## Q7 Live validator over the pack (`scripts/validate-pack.ts.txt`)

**Assembly.**
- All `x` keys are stripped recursively, so `notWhen`, `enabled`, `ages`, `heldOut` and `appliesTo` vanish. This is what live would see.
- Pack sources: interpretation from 20, 40 and 60; management from 10 and 50; rules from 10 to 60.
- Amendments of kind `establishedBy.add` are applied to live `diabetic_kidney_disease`. `targetsProposed` and `diagnosisPending` are left out, except in A2.
- In the merged variants, same-code features, capabilities and sections keep the **live** definition.

| Variant | Errors | Warnings |
|---|---|---|
| Live v0.1.0 (baseline) | 0 | 729 (all "not CSO-signed") |
| A. pack standalone | 122 | 437 |
| A2. A plus the 7 pending sets | 124 | 456 |
| **B. live + pack merged** | **96** | 1169 |
| C. B with the 20 renames mapped to live codes | 96 | 1169 |

C equals B because renaming swaps one existing feature for another; the validator flags shape, not meaning.

### Errors in B, grouped (full list in `validator-errors-merged.txt`)

**[70] Option not defined on the live feature.** All real; Q2 option maps fix them.

| Feature | Pack option | Count |
|---|---|---|
| `glucose_lowering_therapy` | `glibenclamide` | 19 |
| `glucose_lowering_therapy` | `gliclazide` | 16 |
| `glucose_lowering_therapy` | `glimepiride` | 16 |
| `glucose_lowering_therapy` | `sglt2_inhibitor` | 5 |
| `glucose_lowering_therapy` | `pioglitazone` | 2 |
| `glucose_lowering_therapy` | `dpp4_inhibitor` | 1 |
| `glucose_lowering_therapy` | `glp1_ra` | 1 |
| `vibration_128hz` | `absent_one` | 3 |
| `vibration_128hz` | `absent_both` | 3 |
| `ankle_reflexes` | `reduced_or_absent` | 3 |
| `dm_status` | `not_known` | 1 |

**[8] Threshold unit does not match feature unit.**
- `kg/m2` vs `kg/m²` on seven rules: DM-SUS-RISK-01/02, DM-CLS-T1-02/04/05, DM-CLS-ATYP-01, DM-CLS-MODY-01.
- `/min` vs `bpm` on DM-STR-NEURO-03.
- Real; fix by adopting the live unit strings.

**[6] Duplicate condition**, and **[1] duplicate flag** `sglt2_during_acute_illness`. Real (Q6).

**[6] A property must not declare a group.**
- Affected: `gestation_weeks`, `postpartum_weeks`, `months_since_art_start_or_switch`, `glucose_test_since_antipsychotic_start`, `glucose_tested_since_birth`, `ogtt_done_this_pregnancy`.
- Pack shape error; drop `group`.

**[4] "N of M findings have no group".**
- Affected sections: `symptoms`, `examination`, `foot`, `risk_context`.
- Pack features added to grouped live sections without a group.

**[1] Examination sign without `discriminates`** (`injection_site_lumps`). It maps to live `lipodystrophy_type`, so the error goes away once mapped. In standalone mode the reused signs (`retinopathy_stage`, `acanthosis_nigricans`, `peripheral_oedema`, …) also trip it, because the pack copies lack the live fields.

**Standalone only.**
- [108] unknown section: pack features point at live sections that A does not include.
- [3] condition links to an unknown complication (`dka`, `hhs`, `hypoglycaemia`): these live in v0.1.0.
- [2] criteria set has no criteria: `ug_ucg_2023` and `ug_integrated_dm_2026`, empty by design (N2).

### Expected errors that did NOT trip

"The diagnostic band must match a diagnostic criterion" (validate.ts:651-666) fired on **none** of the pack tables, for three reasons:

1. **`bohb_bands` (60)** has standard `local`. No `local` set exists, or the pending Uganda sets are empty, so the set of thresholds is empty and the check is skipped.
2. **`fpg_control_who`, `fcap_control_who`, `pcap_control_who`, `ppg_control_who`** give their `low` (< 3.9) band tone `"diagnostic"`. The check takes the **first** diagnostic-tone band; its `from` is undefined, so the check is skipped.
   - This is a real defect in the pack: live tone `low` is the hypoglycaemia tone that may alert (schema.ts:824-845).
   - Tone `diagnostic` renders under the "Diabetes range" column. Hypoglycaemia would be drawn as "diabetes range".
3. **`ogtt_1h_idf_2024`**: no IDF criterion reads `ogtt_1h_pg`, so the set of thresholds is empty.

### Validator gaps to close in Phase 2

- No duplicate check on caveat ids, classification codes, criteria-set ids, management ids, risk-model ids or orderable codes.
- No check that `op` is a known operator.
- The anti-drift rule should check every diagnostic-tone band, not the first one.

---

## Disagreements needing a CSO or owner ruling

1. **Adult boundary.** NCD adolescent runs to 19 (`age.ts:42`); prescribing paediatric ends at 16; the pack assumes 16 (D-DM-32). Two vignettes label a 19-year-old `adult`.
2. **No numeric age, and no "could be pregnant", in `lib/ncd`.** S-DM-16 and EC-5 need a platform input. `REF-PREG-AGE` is unsigned. Live `sex` includes `other` = "Other or not recorded".
3. **`["unknown"]` satisfies `!= insulin`** in both evaluators (N14).
4. **`atLeast` semantics**: should live adopt the reference's unavailable-versus-insufficient rule? This changes live verdicts.
5. **Blocking caveat in diagnosis**: live drops the criterion; the reference counts it as insufficient by direction. Live returns `not_met` where the reference returns `insufficient`.
6. **Caveat directions** that differ on the same predicate: HIV on ART (live unpredictable, pack masks); HbSS (live unpredictable via the variant caveat, pack masks); haemolysis, malaria or transfusion (live masks, pack unpredictable); dialysis (live masks, pack unpredictable plus eGFR < 30).
7. **Metformin with eGFR < 30**: amber (live) or red (pack).
8. **Live wording "reduce the insulin or sulfonylurea"** (complication-symptoms.ts:261) breaks D-DM-31. The pack's version is compliant.
9. **Vomiting with known diabetes** fires a **red** live danger sign (symptoms.ts:487). The pack's N13 says vomiting alone never interrupts (DM-ACU-ROUTE-13/19).
10. **Level-1 hypoglycaemia (< 3.9)** raises a red live emergency in anyone. The pack gates it on diabetes or treatment.
11. **HHS on glucose ≥ 33.3 or HI alone** (pack) versus a sign or biochemistry (live).
12. **Glibenclamide**: live flags any use. The pack flags only at age 60 or over, with CKD, or where lows are a concern. D-DM-22.
13. **`sglt2_during_acute_illness` (same id)**: live fires on vomiting too and says "Stop… check ketones"; the pack says "consider holding".
14. **Dipstick staging**: live assigns `A2_strip`/`A3_strip`; the pack says a strip is never a category.
15. **DKD**: live uses `kidney_abnormality_3_months` plus `requiresConfirmation`; the pack uses a count of 2 of 3 ACRs.
16. **LOPS by vibration** (D-DM-18): live counts monofilament or Ipswich only.
17. **WHO criteria set**: replace live `who_2019` with the pack's `who_hearts_d_2020`, or keep both. Both cannot run, because `preferredCriteria` takes the first set. The pack adds a symptom route for FPG, OGTT and HbA1c, and meter criteria.
18. **Site profiles** differ between the reference and live (district lab.glucose, creatinine and monofilament). Parity needs one profile.
19. **Low-glucose bands** carry tone `diagnostic` in the pack's control tables.
