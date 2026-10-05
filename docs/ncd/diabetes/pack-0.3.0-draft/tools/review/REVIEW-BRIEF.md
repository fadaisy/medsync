# Independent review brief: MedSync diabetes knowledge pack (draft 0.2.0)

MedSync is a hospital system for Uganda. This pack teaches its encounter system diabetes: who to test (suspect), what confirms (confirm), which type (classify), how each organ and the control stand (stratify), what to do next (act), and which signals go to triage (acute_route). It is DECISION SUPPORT: a clinician confirms every diagnosis, order and prescription. You did not write this pack. Your job is to find what is wrong with it before a Clinical Safety Officer signs it. Assume there are errors.

## Files (read them from disk)
Base: 
- catalog/01-features.json            what can be recorded (code, type, unit, options)
- catalog/10-suspect.json … 60-acute-route.json   the rules, by lane
- dossier/ref-dm.v1.json              every number, with its source quote and conflicts (REF-DM-…)
- vignettes/golden-vignettes.json     synthetic patients with expected and computed results
- clerking-v2/*.json, wiring/*.json   changes to the history, exam, diagnosis and plan catalogues, test menu, formulary
- designb/pack-manifest.draft.json    the same rules as a rule list

## How the rule grammar reads
A criterion has `all` (AND), `any` (OR) and `atLeast {n, of}`; when several are given they are ANDed. A predicate is `{feature, op, value}` with ops >=, >, <=, <, ==, !=, in, present, absent. A predicate on a value that was never recorded is `insufficient` (never true, never false): "not asked" is never "no". On a multi-select, `==` means "is selected" and `!=` means "is not selected". Stages and risk bands are first-match-wins in the order listed. `label` is shown verbatim to the clinician. Keys named `x` are provenance and routing (lane, family, runWhen: suspect and confirm rules run only when diabetes is NOT established; classify, stratify and act run when it is; acute rules and therapy flags always run).

## Rules the pack must obey (flag any breach)
1. No dose, strength, frequency or titration anywhere. Drug NAMES and classes only where the source names them.
2. Nothing treats missing data as normal or as a negative.
3. Under 16: recognition, classification support and referral only; no management content.
4. Acute danger is routed, never managed (no fluid, insulin or potassium instructions).
5. A single abnormal value must not diagnose a person without symptoms.
6. Type is never inferred from build alone; "unclassified" is legitimate.
7. Restricted classes (hiv, tb, mental_health, sexual_reproductive_health) must not leak into patient-facing text and must travel with any rule that reads them.
8. Uganda first: district sites (often only a glucose meter, urine strips, BP cuff, no HbA1c, no creatinine, no retinal camera) must reach a safe next step.
9. Do not cry wolf: an urgent or immediate rule must be worth interrupting a clinician.
10. Every label must say exactly what its predicates test: no more, no less.

## What to look for
- Clinical errors: a wrong threshold, operator or unit; a rule that would fire on the wrong patient; a rule that would NOT fire on a patient it should catch; unsafe or misleading wording; an urgency that is too high or too low; mimics or exclusions that are missing; contradictions between two rules; contradictions with the stated source quote in the dossier.
- Grammar traps: a label that does not match the predicates; an `any` that makes a rule far broader than its wording; a rule silenced because it depends on a value that is rarely recorded; a first-match ordering mistake; a `!=` or `absent` that behaves differently from what the author intended when the value is missing.
- Omissions that matter for patient safety in Uganda (state the source you would expect, do not invent numbers).
- Vignettes whose expected result is clinically wrong even though the build passes.

## Output
Write a JSON array to the path given in your task. One object per finding:
{"id": "F01", "severity": "critical|major|minor", "where": "file and item id", "finding": "what is wrong, concretely", "why": "the clinical or logical reason", "fix": "the specific change you recommend"}
critical = could plausibly lead to patient harm or breaches a rule above; major = wrong or misleading but unlikely to harm on its own; minor = wording, consistency.
Do not pad: 15 real findings beat 60 weak ones. Do not restate the pack. Do not propose doses. Reply with a short summary and the critical and major findings in full.
