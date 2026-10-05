# PROMPT: Teach the encounter system diabetes (NCD knowledge pack 0.3.0-draft, gated)

> **For Claude Code.** Work in the release folder (`~/Desktop/medsync-release`) on a new branch `feat/ncd-diabetes-pack`, cut from `main` (confirm at STOP 0 which branches carry `lib/ncd` and clerking v2).
>
> First copy the hand-over pack into `docs/ncd/diabetes/pack-0.3.0-draft/`:
> - this prompt and `HANDBACK-NCD-DIABETES.md` (scope, research, decisions, what was checked, what is open);
> - `catalog/`, `dossier/`, `designb/`, `clerking-v2/`, `wiring/`, `vignettes/`, `decisions/`, `review/`;
> - `tools/` (the builder that produced the pack, with its research claims; `python3 tools/build/build.py --check` re-validates it).
>
> **Mode:** gated. Seven phases (0 to 6), each ending in a **STOP**.
> - Documents use Stage 1: draft, critique against the checklist, revise (at most two passes), present, STOP.
> - Code uses Stage 2: build, run the real checks, fix, re-run until green, report the numbers, STOP.
> - Self-refinement never replaces a real check.
>
> **The CSO is Fadhul.** Every criterion, threshold, rule, flag, wording and clinical mapping in this pack needs his signature before it is clinically live. Until then it runs in shadow mode only (invariant I10).
>
> **Migrations are GATED.** You write them; the owner applies them. Never edit a shipped migration. The next free number at the briefing was 0092; confirm it.

---

## 0. What we are building, in one paragraph

`lib/ncd` (Design A) is built and dark, with `DIABETES_CATALOG` v0.1.0. This pack is version 0.3.0-draft of the diabetes content: 335 cited reference values, 63 rules, 59 management steps, 19 therapy flags, 27 validity caveats and 83 worked patients, organised in the six lanes of MS-NCD-ENG-001 (suspect, confirm, classify, stratify, act, acute route). It teaches the encounter to predict a diagnosis without overcalling one, to say how a person with diabetes is doing organ by organ, and to propose what is due, who to refer and what is unsafe. It carries no dose. Your job is to reconcile it with the repo, get it signed, load it as data, prove it with the vignettes, and wire it to the clerking desk, in that order and no faster.

---

## 1. Ground truth and reading order

1. **The repo wins on shape and mechanics.** The pack was written from a briefing of commit `8e45d34`, which showed samples, not the whole catalog. Wherever the repo differs (a feature code, an option value, a schema field, an evaluator rule), the repo is right: report the difference at STOP 0 and adapt the pack's shape. Never adapt the repo to the pack without a decision.
2. **The pack wins on clinical content**, and the dossier (`dossier/ref-dm.v1.json`) wins inside the pack: a number lives there once, and every predicate draws from it.
3. **The hand-back is the map.** Read `HANDBACK-NCD-DIABETES.md` in full before Phase 0. Section 9 says what is weak: the clerking wiring is a specification to reconcile, not data to load.
4. **Specs,** in this order: `lib/ncd/catalog/schema.ts`; MS-NCD-ENG-001 (lanes, state model, invariants I1 to I12, vignettes V01 to V26); `SPEC-CLINICAL-FACT-CONTRACT-v1.md`; `PROMPT-CLERKING-DESK-V2.md` and `PROMPT-CLERKING-EXAM-V2.md`; MS-RX-CAT-001.
5. **The reference evaluator** is `tools/build/build.py` (`ev_pred`, `ev_crit`, `run_vignette`). It defines what the pack means by met, not met, insufficient and unavailable, by `notWhen`, by a blocking caveat and by "pregnancy status needed". It is a specification in Python, not code to ship.

---

## 2. Laws (non-negotiable)

The standing laws apply unchanged: clinical content is data, not code; answers store catalogue ids; nothing is guessed silently; "not asked" is never a negative; restricted classes stay restricted; any new clinical mapping is CSO-signed; migrations are gated; never edit a shipped migration.

The pack adds these:

**N1. One number, one place.** A threshold is typed once, in a `REF-DM-*` entry. A predicate, a band edge, a label and a clerking reference all draw from it. Keep the build check that fails on a numeric predicate with no reference, and the check that a clerking reference equals the dossier entry it mirrors.

**N2. Nothing clinical is typed from memory.** Every citation is built from a research claim with a quote. If you need a number the dossier lacks, stop and ask; do not supply it. This applies with full force to the Uganda Clinical Guidelines: the two Uganda criteria sets are empty because nobody has read the text, and they stay empty until the CSO supplies it.

**N3. Four states.** Met, not met, insufficient, unavailable. A missing value never satisfies a predicate and never counts against one. A test this site cannot do is "unavailable", which is different from "not done".

**N4. "Never" is an answer.** The seven `never_*` features are true only when someone said so, or when Design B finds none in a record known to be complete. An unanswered question fires no "never done" rule.

**N5. No dose, no titration.** Keep the pattern check over every string. D-DM-31 decides which direction words a flag may quote.

**N6. Acute danger is routed.** The acute-route rules emit a signal to triage or ask for a bedside test. They carry no treatment text, and the NCD surface never uses the emergency red token (I11).

**N7. Under 16: recognition and referral only.** No adult target, band, risk model, flag, treatment step or suggested-care item. Phase 0 reports where the platform's adolescent band ends (D-DM-32).

**N8. A blocking caveat acts by its direction.** "Masks": a normal result is not trusted, an abnormal one stands. "Manufactures": an abnormal result is not trusted. "Unpredictable": neither. In a diagnostic criteria set any blocking caveat also stops a positive. A value under a blocking caveat is never banded, is never the measure of a proposed target, and is not read by a treatment-review step. The examination does not reset its screening interval. A caveat never suppresses an acute rule or a referral.

**N9. Restricted reasons never ride in a string.** Any item that reads an `hiv`, `tb`, `mental_health` or `sexual_reproductive_health` feature has a `neutralDisplay`. Surfaces without the class show that and nothing else.

**N10. Labels say what the predicates test.** Keep the check that a label states every reference number its predicates use. When you change a predicate, change its label in the same commit.

**N11. Held-out content stays out, and "off" is a field.** Both C-peptide criteria (`x.heldOut` on the type 1 classification); every item with `enabled: false`, until the decision named in `enabledBy` is signed; the pregnancy profiles until engine change EC-5 exists; every item marked `needs-cso` or `hold`. The evaluator reports a dark item as "met but dark" and shows it to nobody.

**N13. An interrupt needs a sign.** `immediate` is for deep breathing, acetone on the breath, dehydration, drowsiness, a glucose below 3.0 or of 33.3 or more, a meter reading HI or LO, a potassium of 6.5 or more, or chest pain or stroke symptoms. Vomiting or abdominal pain alone never interrupts. One interrupt per event. A test prompt clears when its result is recorded. Keep the ordinary-patient fixture (DMV-80) and its cap on what may fire.

**N14. An empty box is not an answer.** Pregnancy is unknown unless the person is male, the platform says it is not possible, or the answer is recorded; what waits on it is named. A blank medicine list is not "not on insulin" and not "on insulin". A blank type is not "type 2".

**N12. Reconcile, never duplicate.** The pack could not see the whole live catalog. Before adding any rule, flag or feature, look for the live equivalent. If one exists, keep the live id, compare the two, and report the difference.

---

## 3. What is in the pack

| Path | What it is | How to treat it |
|---|---|---|
| `catalog/00` to `60` | Content in the `NcdCatalog` shape; anything outside the schema is under `x` | Load as data after Phase 2 |
| `catalog/ref-usage.json` | Which reference entries each criterion reads | Regenerate; compare |
| `dossier/ref-dm.v1.*` | The reference catalogue with source, quote, re-read verdict and conflicts | The registry for N1 |
| `dossier/research-table.*` | All 802 claims | Provenance; do not edit |
| `designb/pack-manifest.draft.json` | 195 rules as Design B `RuleDef`s | For Phase 4 |
| `vignettes/golden-vignettes.json` | 83 patients: `values`, `expect`, and `computed` by the reference evaluator | Port as fixtures; parity is the acceptance test |
| `clerking-v2/00-engine-changes.json` | EC-1 to EC-8 | Specification; each needs a decision |
| `clerking-v2/04`, `07`, `09`, `10` | Amendments to the three clerking catalogues and the suggested-care list | Specification to reconcile; apply by merge, with a diff |
| `wiring/*` | Test menu, formulary, concept proposals, `reconcile-ids.json` | Phase 0 input |
| `decisions/d-dm.v1.json` | 37 decisions, recommendation first | The CSO fills it at GATE A |
| `review/REVIEW-LOG.*` | 122 findings and what was done | 37 are yours to finish |

---

## 4. Phases and gates

### Phase 0: Discovery and reconciliation (no product changes)

Answer each question from the repo and write `docs/ncd/diabetes/phase-0-report.md`.

- **Q1 Branches and flags.** Where `lib/ncd` and clerking v2 live; which flags gate them; whether any Design B code exists.
- **Q2 Feature map.** For each of the 192 features, the live code or "absent". Deliver `feature-map.csv` (pack code, live code, status, option map). Settle in particular: the options of `dm_status` (the pack adds `not_known`); the option codes of `glucose_lowering_therapy`; whether `!=` on a multi-select means "not selected"; whether a numeric age is available to predicates; how pregnancy is recorded and whether the platform can say "could be pregnant".
- **Q3 Age bands.** Where "adolescent" ends. The pack's rules assume adult from 16.
- **Q4 Schema.** Each of S-DM-01 to S-DM-12 (hand-back section 8): already possible, needs a field, or needs code.
- **Q5 Evaluator semantics.** Compare the live evaluator with the reference evaluator on AND, OR and `atLeast` over the four states, on capability gating, and on first-match staging. List every difference.
- **Q6 Overlap.** For every pack item tagged `x.review`, and every therapy flag, validity caveat and acute rule: does v0.1.0 already hold an equivalent? The first reviewer could not tell whether the live catalog already covers metformin below an eGFR of 30, a low glucose, or the hyperosmolar state. Table: pack id, live id, same or different, which is safer.
- **Q7 Validator.** Which live validator rules the pack trips (for example "a diagnostic band must match a diagnostic criterion", which the ketone table and the LOW band will meet).
- **Q8 Clerking ids.** Resolve all 98 ids in `wiring/reconcile-ids.json` against the live catalogues: found, found under another id, or absent. Never guess.
- **Q9 Engine changes.** For EC-1 to EC-8, what exists today. For the six "amend" profiles, a per-profile diff against the live profile.
- **Q10 Concepts.** Diff `conceptsToPropose` against the generated concept catalogue; map the glucose qualifiers to the fact model's own (`fastingState`, `challenge`, `specimen`).
- **Q11 Test menu and formulary.** The live entry shapes; what each pack entry lacks.
- **Q12 Migrations.** The next free number; whether anything here needs a table (it should not).

**Baseline:** run the live catalog's own tests and record the counts. Run `python3 tools/build/build.py --check` and record its summary (expect 83 vignettes, 0 errors).

**STOP 0.** Report Q1 to Q12, the feature map counts, the overlap table and every disagreement between the pack and the repo.

### Phase 1: GATE A (documents only)

Write `docs/ncd/diabetes/gate-a.md`:
- the decision register, D-DM-01 to D-DM-37, each with the recommendation, the alternatives, and what Phase 0 found that bears on it;
- the 18 reference entries marked `needsCsoInput`, and the items whose own citation is marked;
- the Phase 0 differences that need a ruling;
- the schema and engine changes to accept or decline, each with what falls dark if declined;
- **a fresh independent clinical read of version 0.3.0-draft, before anything else in this phase.** `review/` holds three reviews. The second clinical one (R3) re-read the first round of fixes and found 7 new critical problems; its own findings were then fixed and those fixes have had no reader. Give a reviewer the catalog, the vignettes, `review/REVIEW-BRIEF-3.md` and the reference evaluator; ask for patients the rules stay silent on, patients on whom too much fires, and results asserted as correct that are clinically wrong. Fix, add a fixture per fix, and repeat until a read finds no critical problem. Report every round to the CSO;
- the plan for Phases 2 to 6 and a signature block.

When the CSO supplies Uganda's text (UCG 2023 sections 8.1.3 and the others listed in the hand-back, or the 2026 guideline), add it the way the rest was added: a claim with its quote, a reference entry, then criteria in `ug_ucg_2023`. Show the WHO set and the Uganda set side by side and list every difference for his decision.

**STOP 1.** Nothing proceeds without signatures on the decisions that gate clinical use.

### Phase 2: Schema and evaluator (code, behind the flag, no clinical content)

Only what GATE A accepted. Likely: `verdict` and `appliesTo` on a criteria set; `notWhen`, `cautions`, `needsBeforeActing`; the `recorded` op; `ages`; direction-aware blocking that reaches bands, targets and treatment-review steps; the pregnancy-unknown state with named withheld items; `enabled` and `requiresCapability`; `notMetRequires` and `neverNotMet`; the three neutral strings; a widened `StandardBody`.

Tests:
- the four-state truth tables for AND, OR and `atLeast`, identical to the reference evaluator;
- an empty record fires nothing and stages nothing;
- adding a "not assessed" never turns "insufficient" into "met" or "not met";
- a blocking caveat acts by direction (DMV-21, DMV-55, DMV-74) and withholds bands and targets (DMV-65);
- an item with `enabled: false` is reported as dark and never shown;
- under 16, nothing but recognition and referral.

**STOP 2.** Test counts; the semantics table; flag-off behaviour unchanged.

### Phase 3: Load the content (data, shadow mode)

- Merge the pack into the catalog as `draft`, keeping live ids wherever Q2 and Q6 found one.
- Build the `REF-DM` registry with the N1 checks in CI.
- Port all 83 vignettes as fixtures. **Acceptance: the live evaluator's output equals `computed` for every patient**, field by field (diagnosis per set, fired rules with urgency, bands, stages, risk, targets, cautions, gaps, restricted classes). Where Phase 0 changed a code, map it; where the result differs for a real reason, stop and report it. Do not edit an expectation to make it pass.
- Mutation tests: removing any acute-route rule, any red flag or any blocking caveat fails at least one fixture.
- The content runs in shadow only: computed, logged, shown to nobody.

**STOP 3.** The parity table (83 of 83); reference usage; the list of pack items dropped as duplicates of live ones; the dose check and restricted-leak check, green.

### Phase 4: The rules the grammar cannot hold (Design B)

Only if GATE A says the Design B engine is in scope now; otherwise leave the manifest as the seam and skip to Phase 5.

Implement the 23 rules that need code (repeat on a different day, the look-back for an unfollowed result, "never tested" from a complete record, the recall and rescreen dates, the grade of a negative, the control state against an accepted target, the next-best test). Each takes its numbers from reference entries. Design B must also own what the reviews left to the engine: showing a prompt once per episode, holding routine items beside an interrupt, and "done at this visit". Map the spec's vignettes V01 to V26 to the pack's (`mapsToSpecVignettes`).

**STOP 4.** One fixture per rule, both ways; the state-model transitions exercised; I1 to I12 each with a test or a stated reason.

### Phase 5: The clerking desk

In this order, each behind `CLERKING_V2`:
1. The engine changes GATE A accepted (EC-1 result atom, EC-2 history detail, EC-3 glucose context, EC-5 pregnancy, EC-6 units and HI/LO, EC-7, EC-8). Anything declined removes the rules that need it; the catalogue check must then report them, not skip them.
2. The amendments, **by merge**, from the per-profile diff the CSO signed. Evidence "against" a must-not-miss diagnosis needs his explicit signature per atom; the pack lists none against hypoglycaemia, the hyperosmolar state or type 1, on purpose.
3. Flags, suggestions and the two classifiers (`ketone_band`, `dr_review`), with one positive and one negative fixture per rule.
4. The suggested-care list, unsigned and therefore empty in the product until he signs it.

**STOP 5.** The catalogue check with counts; rule coverage both ways; restricted items absent from patient-facing output; the flag-off desk unchanged.

### Phase 6: Concepts, menu, formulary, shadow report

- The concept addendum and its **gated** seed migration (you write it; the owner applies it).
- Test-menu entries in the live shape. Formulary classes and names in the live shape, with renal and high-alert flags and **no dose**.
- A shadow run over the development data: how often each rule fires, which never fire, which fire on more than a fifth of encounters (noise the CSO should see before sign-off).
- ADRs: content as data with a reference registry; four states and the two-way block; restricted classes with neutral displays; held-out content.

**STOP 6 (final).** The table in section 5, filled in.

---

## 5. Numbers to report at the final STOP

| Measure | Target | Result |
|---|---|---|
| Vignette parity with `computed` | 83 of 83 | |
| Numeric predicates with no reference entry | 0 | |
| Reference numbers not found in their claim | 0 | |
| Strings that look like a dose | 0 | |
| Items reading a restricted fact with no neutral display | 0 | |
| Rules or flags live on an unsigned reference | 0 | |
| Catalogue ids guessed | 0 | |
| Pack items dropped as duplicates of live ones | report | |
| Rules that fire on an empty record | 0 | |
| Outputs shown under 16 other than recognition and referral | 0 | |
| Acute-route rules whose removal no fixture notices | 0 | |
| Decisions signed / open | 37 / 0 | |
| Review findings fixed / open | 122 / 0, or each open one with a reason | |
| Shadow run: rules firing on more than 20% of encounters | report | |

---

## 6. Decisions (the CSO owns; recommendations given)

Full text, alternatives and reasons are in the hand-back, section 3.

| # | Decision | Recommendation |
|---|---|---|
| D-DM-01 | Default criteria set for Uganda | WHO HEARTS-D 2020 now; replace it with Uganda's own set as soon as the text is supplied (UCG 2023 section 8.1.3, or the 2026 Integrated Diabetes Management Guidelines if they are in force). |
| D-DM-02 | Which symptoms let one glucose value diagnose | Thirst, passing a lot of urine, unexplained weight loss: the three WHO and ADA both name. |
| D-DM-03 | Random glucose of 11 or 11.1 in HIV care | 11.1 mmol/L everywhere (WHO and ADA). |
| D-DM-04 | A glucose meter for diagnosis and for control | Yes, as WHO allows: diagnose on a meter with symptoms or with a repeat on another day; never rule out on a meter value near a threshold; read a fasting or post-meal meter value against WHO's surrogates for control. |
| D-DM-05 | Who is offered a test without symptoms | WHO's rule everywhere (40 or over and overweight). ADA's 'overweight with another risk factor' at sites with a laboratory. ADA's 'everyone from 35' off. |
| D-DM-06 | What counts as 'tested and negative' | 'Full' only with a normal 2-hour OGTT. A normal fasting glucose or HbA1c alone is 'limited', with a re-test date. |
| D-DM-07 | How near is 'near the threshold' | Within the fasting glucose's own within-person variation (REF-DM-VAL-FPG-CV) below the threshold. |
| D-DM-08 | Time windows that are product settings | You set both. Until you do, the rules that depend on them stay dark (REF-DX-RESULT-AGE-GLUCOSE has no value on purpose). |
| D-DM-09 | Order of the next-best test | As written in DM-ACT-TEST-01: symptomatic, a random glucose now; no symptoms with a laboratory, fasting plasma glucose, then an OGTT if it is 6.1 to 6.9; HbA1c only where no caveat holds; no laboratory, a fasting meter reading repeated on another day; pregnant, a 75 g OGTT; on steroids, after a meal. |
| D-DM-10 | Suspecting type 1 | Two of: under 35, BMI below 25, unexplained weight loss (and, in established diabetes, glucose above 20 at presentation). Same day when the diagnosis is new or the type is unclassified and the person is not on insulin; routine once a clinician has recorded the type. |
| D-DM-11 | C-peptide thresholds | Not yet. Keep both criteria held out until a person has read the source figure (Holt 2021 Fig. 1; ADA 2026 Fig. 2.1), then restore them with the timing conditions. |
| D-DM-12 | Testing in pregnancy | Yes, at 24 weeks or more, at sites that can run one (FIGO). Elsewhere it stays off and the meter referral rules apply. |
| D-DM-13 | Exactly at the target | Follow WHO's clinical wording: fasting 7.0 and post-meal 9.0 are AT target ('at or below'); HbA1c 7.0% is not ('below 7.0%', as WHO's indicator and ADA print). This needs an inclusive upper edge on two bands. |
| D-DM-14 | Eyes: how often, and who is referred | No retinopathy: every 2 years (WHO). Mild or moderate: 12 and 6 months unless control is confirmed at target. Refer by grade (ICO): urgent for severe, proliferative or centre-involving disease; routine for moderate. Grade by ICDR ('more than 20' haemorrhages). |
| D-DM-15 | Lipid testing at district sites | Off where the site has no lipid profile; on where it has. The statin prompt in type 2 diabetes at 40 or over does not depend on it. |
| D-DM-16 | 'Kidney failure' as a hypoglycaemia risk | Below 30 for 'high'; below 60 for 'raised'. |
| D-DM-17 | An ACR of exactly 30 mg/mmol | Severely increased (30 or more), as KDIGO's own figures and ADA have it. |
| D-DM-18 | Loss of protective sensation | One (IWGDF): monofilament or vibration; light touch where neither tool exists. |
| D-DM-19 | eGFR below 30 | Same day from primary care (WHO HEARTS-D). |
| D-DM-20 | Treatment suggestions in version 1 | Tests, screening, referral, education, targets and safety flags: on. Treatment review steps: on as review prompts with no dose, once you have read them against UCG 2023 section 8.1.3; dark until then. |
| D-DM-21 | SGLT2 inhibitors and GLP-1 agonists for heart and kidney protection | At referral sites only, as 'refer for consideration'. Off at district sites. |
| D-DM-22 | Glibenclamide, and which sulfonylurea at which level | Recognise it (patients still take it), flag it at 60 or over, with reduced kidney function and where lows are a concern, and never propose it. Name the sulfonylurea per level of care only after the EMHSLU 2023 endocrine pages are read. |
| D-DM-23 | Blood pressure threshold in diabetes | 130/80 on two occasions (WHO HEARTS-D). |
| D-DM-24 | A glucose of exactly 3.9 or 3.0 | ADA's levels, as the live catalog uses: below 3.9 is level 1, below 3.0 is level 2. |
| D-DM-25 | 'Above 7.8' in hospital | Add gt_ref to the vital atom. |
| D-DM-26 | Insulin storage advice | Carry only the advice nobody contests (refrigerate unopened insulin, never freeze it, keep a vial in use out of the sun) and say nothing about clay pots until you have read both sources. |
| D-DM-27 | Vaccines | No. Uganda's routine schedule has none for this group, and ADA's table is the US schedule. |
| D-DM-28 | A meter reading in pregnancy | Refer on it: any reading of 11.1 or more, or a fasting reading of 7.0 or more, today; a fasting reading of 5.1 to 6.9, for a laboratory glucose. Diagnose gestational diabetes on plasma glucose only. |
| D-DM-29 | A raised glucose during acute illness or at TB diagnosis | Warn beside the value and let the criteria run; the clinician decides. Re-test after recovery (TB: after the first month). |
| D-DM-30 | Which pregnancy facts are a restricted class | 'Could become pregnant' and previous gestational diabetes: restricted. Current pregnancy: not restricted, because medicine safety checks must read it everywhere. |
| D-DM-31 | Words about changing a medicine | 'Contraindicated', 'stop' and 'hold' when the source says so; never 'reduce' or 'increase'. Everything ends 'review with the prescriber'. |
| D-DM-32 | Where 'adult' starts | 16, and the platform's adolescent band ends there, so 16 to 19-year-olds get the adult rules. |
| D-DM-33 | Dolutegravir and glucose | Propose a glucose test; show UCG's words with their source; never propose an ART change; say 'discuss with the ART clinic'. Show the dolutegravir-metformin warning once, to be acknowledged, not at every visit. |
| D-DM-34 | When metformin starts | When a measure is above target and the person is on no medicine, alongside lifestyle advice (HEARTS-D Fig. 2, the WHO PEN protocol). |
| D-DM-35 | Type 1 as must-not-miss on the clerking desk | Yes: untreated it becomes ketoacidosis. |
| D-DM-36 | Pregnancy not recorded | Nothing that applies only outside pregnancy: the non-pregnant criteria set, the targets and the treatment steps wait for the answer. Acute and suspicion rules still run. |
| D-DM-37 | Rules with no sentence to quote | Sign all six with their reasons. |

---

## 7. Out of scope (leave clean seams)

- Any dose, regimen or titration; the formulary's dose skeleton.
- The treatment of ketoacidosis, the hyperosmolar state and hypoglycaemia (the acute pathway).
- Paediatric diabetes management; glycaemic targets in pregnancy.
- The hypertension and CKD packs (this pack records where they will take over: blood pressure thresholds, the kidney monitoring grid).
- Patient-facing education content, SMS and reminders.
- Importing the WHO risk chart values (S-DM-03): a separate, checked import from WHO's published tables.

## 8. Definition of Done

- [ ] Phase 0 report accepted; every pack-versus-repo difference ruled on.
- [ ] The decisions that gate clinical use are signed; the Uganda criteria set is filled from the text the CSO supplied, or explicitly deferred by him.
- [ ] 83 of 83 vignettes at parity; mutation tests green; N1, N5, N9 and N10 checks in CI.
- [ ] Nothing held out has leaked in; nothing unsigned runs outside shadow mode.
- [ ] Clerking amendments applied by merge from a signed diff; no "against" atom on a must-not-miss diagnosis without a signature.
- [ ] The concept migration written, numbered and handed over, not applied.
- [ ] With the flags off, the product is unchanged.
- [ ] `review/REVIEW-LOG` has no open critical finding.

## 9. Parallel reminders (flag if touched)

- **Hypertension pack:** it will own the blood pressure rules this pack carries for now (130/80, the 200/110 and 180/110 referrals).
- **Monitoring engine:** it will own recall and the accepted target as a monitoring threshold.
- **HIV and TB programmes:** dolutegravir and glucose (D-DM-33) and the TB target are restricted classes; the NCD engine never proposes an ART or TB treatment change.
- **Pharmacy:** the Pharmacy Board of Uganda, never PSU. EMHSLU levels of care are unread for the endocrine section.
