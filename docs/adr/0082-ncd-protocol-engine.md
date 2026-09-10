# ADR-0082 — The NCD protocol engine, and diabetes as its first catalog

**Status:** Accepted (owner-directed, 2026-09-05). Built on `feat/ncd-diabetes`.
**Follows:** [ADR 0081](0081-remove-clerkship-v1.md) — removal of the v1 clerkship capture layer.
**Ships gated dark** behind `NCD_CLERKSHIP_LIVE`, with a second, independent gate on the clinical content itself.
**No migration.** No schema change, no data change. `clinical_documentation.section_data` is JSONB.

## Decision

Replace the removed differential engine with a **protocol engine**, and express clinical content as **data** rather than code.

That distinction is the whole architecture:

|                | v1 (removed)                                | This                                                |
| -------------- | ------------------------------------------- | --------------------------------------------------- |
| Question asked | "given these findings, what could this be?" | "is it confirmed, what is staged, what is missing?" |
| Shape          | probabilistic, open-ended                   | deterministic, bounded                              |
| Content        | a tuned weight file per complaint           | a catalog per disease                               |
| Never finished | 17 of the front door's complaints           | diabetes is one data file; CKD is the next          |

There are no weights here and nothing is tuned. Every verdict traces to a named threshold published by a named body, which is what makes it reviewable by a clinician rather than only by an engineer.

## The four invariants

Enforced by types and tests, not convention.

1. **Nothing clinical without a citation.** `citation` is required on every construct that asserts something about a patient. The validator additionally rejects placeholders, and rejects a citation with neither a URL nor a declared `needsCsoInput` — an unverifiable value must say so out loud.

2. **A criterion evaluates to four states, not two.** `met` · `not_met` · `insufficient` · `unavailable`. A boolean evaluator has to collapse "we looked and it was normal" together with "nobody looked", and that collapse is how a screening tool tells a clinician a patient has no retinopathy when no one examined their eyes.

3. **Standards are data.** Criteria are keyed by body and version; `SiteProfile` declares precedence and capability. One engine serves a referral hospital under ADA and a WHO PEN district clinic, and always reports which standard produced the verdict.

4. **Guidance stops at the prescription.** `requiresPrescribing` marks any step involving a dose. No dose is encoded here and none is computed.

### The AND/OR asymmetry is clinical, not cosmetic

- **AND** — `unavailable` outranks `insufficient`. One unobtainable requirement means the criterion can never be satisfied at this site, so it must not sit on a gaps list the clinician can never clear.
- **OR** — `insufficient` outranks `unavailable`. Diagnostic criteria are alternatives, so if HbA1c is impossible here but fasting glucose is merely undone, the question is still open: **do the test you can do.**

## What the clinical content forced the grammar to grow

Twice, the data was right and the schema was wrong. Both times the schema changed rather than the content being approximated.

**`atLeast`** — IWGDF foot risk category 2 is defined as "a combination of **two** of" loss of protective sensation, peripheral artery disease and foot deformity. Neither an AND nor an OR.

**`ValidityCaveat`** — Phase 0 decision (a) needed more than an "unreliable" badge. NGSP states that haemoglobin-variant interference with HbA1c is **assay-specific**, so it is a property of the analyser rather than a clinical fact; and the bias has a **direction**. Shortened red-cell survival (haemolysis, malaria, transfusion) falsely lowers HbA1c and **masks** diabetes; iron deficiency falsely raises it and **manufactures** one. A clinician told only "unreliable" cannot tell which error they are looking at. Modelling this as data keeps the engine disease-generic, and the shape recurs for eGFR at extremes of muscle mass and ACR after exercise.

## The bug the golden vignettes caught

Worth recording, because it is the argument for the vignettes existing.

Under ADA, a **single** fasting plasma glucose was reaching `criteria_met` — which no standard permits in an asymptomatic person. The limitation had been _documented in a comment_ and that felt like enough. It was not; the engine was over-diagnosing.

`requiresConfirmation` now has teeth: a criterion carrying it cannot make a diagnosis alone. Confirmation is satisfied either by an unconditional route (glucose with classic symptoms) or by **two distinct criteria being met** — which turns out to be exactly ADA's "two abnormal results, which may be obtained at the same time". The fix implements the real rule instead of approximating it.

The fix then exposed a second fault: the WHO criteria encode the repeat as a predicate **and** carried the flag, demanding confirmation twice. The flag means "a second _independent_ result is needed" and is now documented as such.

## Phase 0 research

Six domains, **205 findings, every one fetched from a primary source**, each independently re-audited by an agent instructed to refute it: **201 CONFIRMED, 4 WRONG_ATTRIBUTION, 0 hallucinated sources, 0 wrong values**, 35 conflicts between standards, 76 flagged for CSO input. Persisted at [`docs/clinical/ncd/diabetes-criteria-research.json`](../clinical/ncd/diabetes-criteria-research.json) with the memo alongside it.

All four audit failures were attribution errors in a body of work whose entire value is traceable attribution. The most consequential: the claim that ADA Section 12 _independently adopts_ the IWGDF foot stratification. ADA Table 12.1 is an **adapted reprint published with permission** — it would have presented one source appearing twice as two agreeing sources. Each correction is now enforced by a test, not a comment.

## Gating

Two independent gates, deliberately.

- **`NCD_CLERKSHIP_LIVE`** controls whether the surface renders.
- **The catalog's own signature state** controls whether it claims to be ratified. Every `Citation` carries `csoSigned`, currently `false` throughout, and the profile shows a gated-dark notice while any is unsigned.

So the surface can be reviewed without any part of it claiming to be clinical advice. Ratification is a separate, deliberate act.

## Scope

**In:** diagnosis (WHO / ADA / IDF), aetiological classification, the three acute emergencies, diabetic kidney disease, diabetes-related foot disease. 70 features across 8 sections.

**Not yet:** retinopathy, neuropathy beyond the foot, cardiovascular risk, glycaemic targets, the management ladder. All are in the research; they are data-file work against this same schema.

**Not persisted yet.** The surface computes but does not save. The capture shape settles in the next increment and will write to `clinical_documentation.section_data`.

## Deliberately not built

- **Type 5 / malnutrition-related diabetes.** IDF endorsed it in 2025; WHO dropped MRDM in 1999 for lack of evidence; ADA has no such category; IDF concedes no diagnostic criteria exist yet.
- **Auto-classification of T1 vs T2 from phenotype** where C-peptide and antibodies are unavailable — the common case globally. `classify()` returns `unclassified`, because an inferred type drives real insulin decisions.
- **A cardiovascular risk score without its validated population.** The schema warns on it; several widely-used models are not validated in sub-Saharan African populations.

## Verification

tsc (app + Edge Functions) clean · eslint clean · **100 NCD tests**, 881 overall · `npm run build` compiles · `validateCatalog` reports 0 errors and 69 warnings, all of them the unsigned-citation one.
