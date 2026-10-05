# Phase 0 report: discovery and reconciliation (STOP 0)

Pack MS-NCD-DM-PACK-001 0.3.0-draft against `origin/main` 8e45d34, worktree `medsync-ncd`, branch `feat/ncd-diabetes-pack`. No product file changed. Detail: `phase-0/ncd-catalog-notes.md` (Q2–Q7), `phase-0/clerking-notes.md` (Q8–Q11), with `feature-map.csv`, `overlap.csv`, `clerking-ids.csv`, `concepts-diff.csv`, `validator-errors-merged.txt`. Uganda's text: `ucg/ucg-vs-pack.md` and `ucg/ucg-2023-claims.json`.

## Baseline

| Check | Result |
|---|---|
| Full suite (`SKIP_ENV_VALIDATION=1 EMR_PGLITE=1 npx vitest run`) | 326 files passed, 21 skipped; 8,298 tests passed, 238 skipped |
| `tests/ncd` + `tests/clerking` | 45 files, 1,218 passed, 1 skipped |
| `npm run ncd:check` | 0 errors, 729 warnings (all unsigned citations, by design) |
| `npm run clerking:catalogue-check` | ok; history, exam and dx hashes match their sign-off pins |
| Pack `build.py --check` | 83 vignettes, 0 errors, 0 warnings (its summary prints 53 refs used by a rule against 114 in BUILD-REPORT.json: two counters, not a defect) |

## Q1 Branches and flags
`lib/ncd` and clerking v2 are both on `main`. NCD: `NCD_CLERKSHIP_LIVE=1` and `ENCOUNTER_ENGINE_LIVE=1`; the NCD section renders on the v1 desk only. Clerking v2: `CLERKING_V2` (per hospital) and `CLERKING_PLAN_V2`. **No Design B code exists** (no `ncd_*` tables, no `loadFactSnapshot` consumer).

## Q12 Migrations
Next free number **0092** (0091 is `feat/encounter-closure`, pushed, unmerged). Only the concept and diagnosis-term addenda need a migration (generated seed, gated). Nothing needs a table.

## Q2 Feature map (192 pack features)
52 same · 20 renamed · 16 option mismatch · 10 unit mismatch · **94 absent**. 82 of 83 vignettes use at least one absent feature.
- `dm_status` live options `known | evaluating | none`; pack's `not_known` → `none`.
- `glucose_lowering_therapy` is multi-select with live options `none | metformin | sulfonylurea | dpp4 | sglt2 | tzd | agi | glp1 | insulin | other | unknown`; the agent is a separate `sulfonylurea_agent`. Pack codes other than metformin, insulin and none are invalid live.
- `!=` on a multi-select means "not selected" in both evaluators; a blank list is insufficient in both; a list holding only "unknown" satisfies `!= insulin` in both (an N14 hazard).
- **No numeric age** reaches predicates (only `ageBand`).
- **Pregnancy** is a bare `pregnant` boolean, not gated by sex or age; nothing can say "could be pregnant". Live `sex` has "Other or not recorded".

## Q3 Age bands
Adolescent is **10–19**; adult starts at **20** (`lib/ncd/age.ts:42`). Prescribing's paediatric cut is 16. D-DM-32's premise (adolescent ends at 16) is wrong; DMV-15 and DMV-68 (age 19) would band adolescent live.

## Q4 Schema (S-DM-01…16)
Already possible: S-07 (two OR groups), S-15b (`neverNotMet`). Field only: S-01. **Field plus engine code: the other 13.** Beyond §8: live has **no management steps or risk models evaluated at all**, interpretation shows one table per feature, and `preferredCriteria` takes the **first** set per standard, so a second WHO set would never run.

## Q5 Evaluator semantics (460+ truth-table combinations)
AND, OR and mixed agree exactly. Differences: `atLeast` (23 combinations; e.g. 2 of [insufficient, unavailable]: live insufficient, reference unavailable); empty criterion (live insufficient, reference met); `present` on a "neg" option (live met); scalar `in`; no `recorded` op live; the reference crashes on duration/series; the reference ignores `requiresConfirmation`; **a blocking caveat** drops the criterion live (haemolysis + HbA1c 7.0 → live "not met", reference "insufficient"); caveats never reach bands, targets, stages or flags live; no `enabled`, `notWhen`, pregnancy withholding or ages gating live, so **every dark pack item would fire** if loaded as-is. District site profiles differ between the two.

## Q6 Overlap (199 rows)
123 pack-only · 58 different · 6 same · 12 live-only.
- Metformin with eGFR < 30: live `metformin_low_egfr`, same predicate, **amber** live vs **red** in the pack.
- Low glucose: live raises a **red** emergency below 3.9 in anyone (capillary and random only).
- HHS: live has no rule on 33.3 / HI alone.
- Live has no retinopathy or neuropathy complication.
- Duplicates the validator misses: `hba1c_pregnancy`, `type_1`, `ketosis_prone_type_2`, `hiv_art`.

## Q7 Validator
Live 0 errors. Pack standalone 122 errors; merged with live **96**: 70 invalid options (the therapy codes, `vibration_128hz`, `ankle_reflexes`, `dm_status`), 8 unit strings, 7 duplicate condition/flag ids, 6 properties declaring a group, 4 group-all-or-none, 1 sign without `discriminates`. The expected diagnostic-band error did not trip; instead it hides a real defect: the pack tones low-glucose bands `diagnostic`, which the live surface labels "Diabetes range".

## Q8 Clerking ids (98)
62 found · 9 under another id · 27 absent. Of the 63 to resolve: `sym.vomiting` is live `sym.nausea_vomiting` (wider); `ex.nervous.reflexes` is the grid at `ex.nervous/motor`; `ex.eyes_ent_neck.fundoscopy.seen` is an attribute path; `dx.cataract` and `vs.ketones.blood` absent. 10 of 35 "proposed" ids exist already (e.g. `derived.osmolality_effective`, `obs.c_peptide`). The dx catalogue already names `test.capillary_glucose`, `test.ketones`, `test.blood_gas`, `test.b12_folate`.

## Q9 Engine changes and amend profiles
Small: EC-3, EC-6 (mg/dL entry exists), EC-8. Medium: EC-2, EC-5, EC-7 (plus undeclared pieces: `medicine_group`/`derived` atoms in dx, `plan_basket_class`, `subacute` onset, strict REF and scale schemas). **Large: EC-1** (the desk loads no clinical facts and has no "unknown") and **EC-4** (suggested care).
**Hazard:** the clerking evaluator is two-valued; a `{vital, context:"fasting"}` atom fires on any glucose today, and `not {pregnancy}` is always true. Nothing using these atoms may load before EC-3 and EC-5.
**7 amend profiles** (dm_type_unknown, dm_type2, dm_type1, dka, hhs, hypoglycaemia_dm, ckd). EC-8 contradicts itself (scalars only via `_changes`, but none carry it). DKA gains a "blood ketones < 0.6" **against** atom; type 1 becomes must-not-miss with no reason text and would keep the live "obese BMI argues against type 1" atom. All three sign-off pins break; 10-plan-care needs its own sign-off.

## Q10 Concepts
30 proposed: 6 exist exactly (incl. `obs.chol_total`), 7 under another id, **17 new**. All 4 qualifiers exist under the fact model's names (`fastingState`, `challenge {ogtt_75g|meal, minutes}`, `specimen`, `pointOfCare`, `certification`, `formula`). Term → condition: 3 wrong target ids; 7 of 8 "new" conditions exist; only steroid-induced hyperglycaemia is new. `sx.vision_change` exists only in the unsigned CFC v1.4 proposal.

## Q11 Test menu and formulary
None of 11 tests is on the menu in the live shape (wrong `kind`, missing `panelComponents`, `capability_id`…); B12, ABI and UPCR blocked on missing concepts. 3 of 13 drugs present; the 10 absent lack routes, renal/high-alert flags, charts and the dose skeleton. No dose content anywhere in the pack's formulary additions.

## Uganda's own text (supplied 2026-10-05)
UCG 2023 sections 1.1.6, 4.1.6, 8.1.3, 8.1.4, 16.2.5, 20.2.3 and the HIV dolutegravir passage read in full; 31 claims with verbatim quotes. 23 differences against the pack (`ucg/ucg-vs-pack.md`). Headlines: UCG prints **">"** for every diagnostic threshold; its **GDM criteria differ** (FBS > 5.6 or 2-h > 7.8 against WHO 2013's 5.1 / 10.0 / 8.5); its BP target in diabetes contradicts itself (**120/80** in 8.1.3, **< 130/80** in 4.1.6); it starts type 2 with **3 months of lifestyle** unless sugars are very high; its only second-line sulfonylurea is **glimepiride** (correcting the handback on glibenclamide).

## Disagreements needing a ruling (carried to GATE A)

| # | Ruling | Recommendation |
|---|---|---|
| P0-01 | Where adult starts (pack 16; live band 20) | Add numeric age to the context; adult rules from 16 by age, independent of the display band |
| P0-02 | Numeric age and "could be pregnant" as platform inputs | Derive both from demographics (DOB, sex at birth); unknown sex or age ⇒ pregnancy unknown |
| P0-03 | A list holding only "unknown" satisfies `!= insulin` | Treat `unknown`/blank as insufficient for `!=` |
| P0-04 | `atLeast` over insufficient/unavailable | Adopt the reference evaluator's rule (pack semantics), with truth-table tests |
| P0-05 | Blocking caveat in diagnosis: drop the criterion or "insufficient" | Insufficient by direction (N8) |
| P0-06 | Metformin with eGFR < 30: amber (live) or red (pack) | Keep amber (red is for emergencies; I11) |
| P0-07 | Live red emergency for glucose < 3.9 in anyone; red danger sign on vomiting with known diabetes | Align to N13 and D-DM-24: interrupt below 3.0 or with a sign; level 1 amber outside treated diabetes |
| P0-08 | Live wording "reduce the insulin or sulfonylurea" vs D-DM-31 | Reword to "review with the prescriber" |
| P0-09 | Glibenclamide: flag any use (live) or three situations (pack) | Pack's three situations plus UCG's glimepiride as named alternative |
| P0-10 | `sglt2_during_acute_illness` (same id, different trigger) | Pack's trigger, live id |
| P0-11 | DKD: staging from a strip; confirmation by 3-month flag or 2 of 3 ACRs | Keep strip as fallback category only; confirmation 2 of 3 over 3 months (KDIGO) |
| P0-12 | Vibration toward loss of protective sensation | Yes (IWGDF, D-DM-18) |
| P0-13 | Live `who_2019` vs pack `who_hearts_d_2020` | Replace live WHO set with the pack's (same thresholds, fuller); keep ADA/IDF |
| P0-14 | Low-glucose bands toned `diagnostic` | New tone or `low` with an alert; never "Diabetes range" |
| P0-15 | DKA "blood ketones < 0.6" against-atom on a must-not-miss | Drop (no signature-worthy source that low ketones exclude DKA in context) |
| P0-16 | Type 1 must-not-miss: reason text; live obese-BMI against-atom | Add reason "untreated it becomes ketoacidosis"; remove the obese-BMI against-atom |
| P0-17 | EC-8 scalar changes | Merge-only for lists; scalars only via explicit `_changes` the CSO signs per field |
| P0-18 | Clerking evaluator two-valued | Load nothing using context/pregnancy atoms until EC-3/EC-5; EC-1 gets a three-valued "unknown" |
| P0-19 | DDX-GLUCOSE-HIGH amend adds steroid hyperglycaemia to every glucose ≥ 11.1 | Drop (reviewer's reading: an error) |
| P0-20 | Concept ids (3 wrong; GDM one or two concepts; maculopathy/Ipswich answers; `hx.*` vs `hist.*`; addendum v1.4 or v1.5) | Fix the 3; two concepts; extend answers; use `hist.*`; v1.5 (v1.4 is pending) |
| P0-21 | Test ids: adopt dx catalogue ids or rename | Adopt the live ids |
| P0-22 | `oral_glucose_lowering` split | Split by `parent` classes; keep the old id as parent |
| P0-23 | Duplicates (SUG-DM-POSTURAL, DDX-GLUCOSE-VERY-HIGH, FLAG-EX-GLU-KETONE-TEST, REF-DX-GLU-HHS, SUG-* targets) | Drop the pack's; keep live ids |
| P0-24 | Nausea alone triggers vomiting rules until CFC v1.4 | Accept, documented, or sign CFC v1.4 alongside |
| P0-25 | UCG ">" literal or "≥" | Literal in `ug_ucg_2023` (it is the text); show both sets side by side |
| P0-26 | UCG GDM thresholds vs WHO 2013 | CSO choice: the national text (UCG) or WHO 2013 |
| P0-27 | UCG's two BP targets (120/80, < 130/80) | < 130/80 (the hypertension chapter's, consistent with HEARTS-D) |
| P0-28 | UCG lifestyle-first (D-DM-34) | Follow UCG: lifestyle 3 months unless "very high" (no number; dark until a number is signed) |

## What this means for the build
The pack's semantics need most of S-DM-02…16 in the live evaluator before any vignette can reach parity, and 94 features must be added. The clerking amendments depend on EC-1, EC-3 and EC-5. None of this changes the plan; it confirms that Phase 2 (schema and evaluator) is the large phase and that nothing loads before it.
