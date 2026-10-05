# Second independent clinical review: MedSync diabetes knowledge pack 0.3.0-draft

MedSync is a hospital system for Uganda. This pack teaches its encounter system diabetes: who to test (suspect), what confirms (confirm), which type (classify), how each organ and the control stand (stratify), what to do next (act), and which signals go to triage (acute_route). It is DECISION SUPPORT: a clinician confirms every diagnosis, order and prescription.

Version 0.2.0 was reviewed and found unsafe to sign (41 findings; see `review/R1-clinical.json`). Version 0.3.0 claims to fix them. **You did not write the fixes. Your job is to find what is still wrong, and what the fixes broke, before a Clinical Safety Officer signs.** Assume the fixes introduced new errors: 22 rules, 8 management steps and 4 therapy flags were added in one pass.

## Files (read them from disk; do not change anything outside `review/_r3_work/`)
Base: (pack root)/
- catalog/01-features.json            what can be recorded
- catalog/10-suspect.json … 60-acute-route.json   the rules, by lane
- dossier/ref-dm.v1.json              every number with its source quote (REF-DM-…)
- vignettes/golden-vignettes.json     60 synthetic patients, expected and computed
- review/REVIEW-LOG.json              each earlier finding and what was done about it
- decisions/d-dm.v1.json              decisions left to the Clinical Safety Officer (do not report these as findings)
- HANDBACK-NCD-DIABETES.md            what the author claims
- tools/build/k_review.py                                            the fixes, in one file, each tagged with its finding id
- tools/build/build.py                                               the reference evaluator (`run_vignette`)

Every item changed or added by the fixes carries `x.review` with the finding ids. Start there.

## How the rule grammar reads
A criterion has `all` (AND), `any` (OR) and `atLeast {n, of}`; when several are given they are ANDed. A predicate is `{feature, op, value}` with ops >=, >, <=, <, ==, !=, in, present, absent. A predicate on a value that was never recorded is `insufficient` (never true, never false). `absent` is true only when the value was recorded as false. On a multi-select, `==` means "is selected" and `!=` means "is not selected". Stages and risk bands are first-match-wins.

New in 0.3.0 (under the key `x`):
- `notWhen`: a list of criteria; if any is MET the rule is suppressed. An insufficient `notWhen` does not suppress.
- `cautions`: criteria shown beside a step when met. `needsBeforeActing`: features that must be recorded; if missing, the step shows with a named gap.
- `ages: "adult"`: withheld under 16. Rules use `ageBands`; management steps are adult-only.
- `runWhen`: `not_established`, `established`, `always`, `established_or_met` (diabetes established, or the WHO criteria set is met at this visit), `newly_met` (criteria met at this visit, not yet established).
- `appliesTo.pregnancy`: `not_pregnant` items wait when a woman who could be pregnant (`pregnancy_possible` true) has no `pregnant` answer; the criteria set is then `insufficient`.
- A blocking validity caveat makes every criterion, stage and classification that reads its feature `insufficient` in both directions.
- `urgency`: routine, urgent, same_day, immediate (immediate interrupts the clinician).

## Run your own patients
```python
import sys; sys.path.insert(0, "tools/build"); sys.argv = ["x"]
import build; build.annotate()
v = {"id": "X", "site": "district",            # "district": meter, urine strips, BP cuff, acuity chart only; "referral": everything
     "established": True, "ageBand": "adult",  # child | adolescent | adult | older_adult
     "values": {"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "egfr": 28}}
r = build.run_vignette(v)
print(r["diagnosis"], r["fired"], r["urgency"], r["bands"], r["risk"], r["targets"], r["cautions"], r["gaps"], r["caveats"])
```
Feature codes and option values are in `catalog/01-features.json`. Save scripts under `review/_r3_work/`. Every "Evaluator:" statement in your report must be an observed result.

## Rules the pack must obey (flag any breach)
1. No dose, strength, frequency or titration anywhere.
2. Nothing treats missing data as normal or as a negative.
3. Under 16: recognition, classification support and referral only.
4. Acute danger is routed, never managed.
5. A single abnormal value must not diagnose a person without symptoms.
6. Type is never inferred from build alone.
7. Restricted classes (hiv, tb, mental_health, sexual_reproductive_health) must not leak into patient-facing text.
8. Uganda first: a district site must reach a safe next step.
9. Do not cry wolf: an `immediate` rule must be worth interrupting a clinician; too many same-day or immediate rules on ordinary patients is a finding.
10. Every label and display must say exactly what its predicates test.

## What to do
1. For each of the 14 critical and the major R1 findings, re-run the reviewer's patient (or build it from the finding) and say whether it is truly fixed, partly fixed, or not fixed. Be specific where the fix is narrower than the finding.
2. Hunt for regressions and new errors in what was added: a new rule that fires on the wrong patient or is far broader than its wording; an `immediate` or `same_day` that will fire on a large share of ordinary clinic patients; two rules that now contradict each other; a `notWhen` that silences a rule it should not; a rule that can never fire; a label, display or note that claims something the predicates do not test; a number in a label that differs from its reference entry.
3. Walk at least 25 patients of your own through the evaluator, chosen to break it. Include: an ordinary well-controlled type 2 patient at a routine visit (count what fires: is it noise?); an ordinary newly diagnosed 50-year-old with glucose 16 and thirst; a known diabetic with gastroenteritis and a normal glucose; a pregnant woman with known type 1; a 17-year-old; a 15-year-old; an elderly man on insulin with a fasting glucose of 4.2; a person on dolutegravir and metformin; a person with eGFR 35 on glibenclamide and metformin; a hypertensive emergency; an HHS picture at a district site with no strips; a patient with every field blank except age and sex.
4. Check the 26 new vignettes (DMV-35 to DMV-60): is each expected result clinically right, and is anything clinically wrong asserted as correct?

## Output
Write a JSON array to `review/R3-recheck.json`. One object per finding:
{"id": "H01", "severity": "critical|major|minor", "where": "file and item id", "finding": "what is wrong, with the evaluator result", "why": "the clinical or logical reason", "fix": "the specific change you recommend"}
critical = could plausibly lead to patient harm or breaches a rule above; major = wrong or misleading but unlikely to harm on its own; minor = wording.
Do not pad and do not re-report what `decisions/d-dm.v1.json` already puts to the Clinical Safety Officer. Do not propose doses or invent thresholds: if a number is needed, name the source that should supply it.
Reply with: (a) a table of the R1 critical findings and whether each is truly fixed; (b) every critical and major finding in full; (c) a one-line list of minors; (d) what you did not check.
