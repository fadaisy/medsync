# Drug catalogue MS-RX-CAT-001 (v0.1-draft)

This is a classified, generic-only general formulary for adult internal medicine at a Ugandan referral hospital (Mulago first). It drives the prescribing dialog: the clinician picks a **diagnosis**, then a **class**, then a **generic drug**, with as little typing as possible.

**It contains no doses.** Every dose field is null, and every drug has `dose.status: "to-verify"`. The project rule is to never ship a remembered dose.

## Files

| File | Purpose |
| --- | --- |
| `drug-catalogue.v0.json` | The catalogue: systems, allergy groups, classes, drugs, supportive items and diagnosis links. |
| `drug-catalogue-validate.py` | Checks the catalogue's structure and that no dose content has slipped in. Run it with `python3 drug-catalogue-validate.py`. It exits with 1 on any failure. |

## Structure

- **systems**: the top-level groups, such as `anti-infective`, `cardiovascular` and `fluids-electrolytes`.
- **allergyGroups**: the groups the allergy check matches against, such as `beta-lactam`, `sulfonamide` and `aromatic-anticonvulsant`.
- **classes**: `{id, name, system, parent, allergyGroup, note}`. Classes form a shallow tree: `abx.cephalosporin` is a parent with no drugs of its own, and `abx.penicillin.bli` is a child of `abx.penicillin`. A few classes are deliberate merges, and their `note` says what was merged.
- **drugs**: each drug has:
  - `generic`: the generic name, never a brand.
  - `class`: exactly one class. A drug with several uses is listed once, and the notes point across (for example, metronidazole appears only under nitroimidazoles).
  - `routes`, plus `methods` for each route. They use generic labels, and their keys must match `routes` exactly.
  - `presentationsDraft`: the form only, never a strength. Strengths come from the pharmacy system.
  - `allergyGroups`: always includes the class's group.
  - `flags`: `renal`, `hepatic`, `weightBasedInChildren`, `weightBasedInAdults`, `controlled`, `highAlert` (ISMP categories), `narrowTherapeuticIndex` and `reserveAntibiotic` (WHO AWaRe Reserve only).
  - `charts`: the monitoring charts the drug opens. Every drug opens `mar`.
  - `dose`: an empty shell. `verifyAt` lists the sources to check.
  - `onEmhsluDraft`: the drafter's belief about whether the drug is on the Uganda Essential Medicines and Health Supplies List. `null` means unsure.
- **supportive**: `fluids`, `oxygen`, `blood_products` and `nutrition`. Oxygen is a supportive item, not a drug.
- **diagnosisLinks**: `{profileId, classes[], supportive[]}` for 100 profiles in `../clerking-summary-impression/clerking-diagnosis-catalogue.v1.json`. They link to **classes, never to single drugs**. They are decision support for browsing, not treatment recommendations.

## What is draft

Everything is draft until the CSO signs it off. That covers class boundaries and merges, the drug list, routes and methods, the flags, the allergy groups, the chart links, the EMHSLU beliefs and every diagnosis link.

## Dose-verification phase (next step)

For each drug, the verifier fills `dose.regimens`, `dose.bands`, `dose.renal`, `dose.hepatic` and `dose.pregnancy` from the sources in `verifyAt`: Medscape, then UCG 2023 and BNF/BNFC. **Every value must carry:**

1. the source URL,
2. a verbatim quote of the text the value came from,
3. the date it was accessed,
4. and, where the sources disagree, which one wins and why (UCG normally governs local practice).

Only then does `dose.status` move from `to-verify` to `verified-pending-cso`. It becomes `signed` only after Clinical Safety Officer sign-off, which is recorded with the signer and the date. After that phase, the validator's no-dose check must be switched to a check that every value has a source.

Nothing in this catalogue is clinically live until it is signed.
