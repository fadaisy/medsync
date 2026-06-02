# ADR 0045 — ABCDE engine + dose constants: decision-support, never autonomous

**Status:** Accepted — CLINICAL-SAFETY artifact (CSO authorised the GATE-A model + doses, 2026-06-02)
**Context:** The resus surface guides a team through the ABCDE primary survey, pairing each step's assessment with guideline-linked actions, and surfaces drug doses where a guideline fixes one. Two risks govern the design: (1) a guidance tool must never act, order, or auto-administer; (2) **a remembered dose must never be shipped** — every dose must trace to a verified primary source.

## Decision

1. **Records, never acts.** Tapping an assessment, danger sign, or action LOGS it to the immutable timeline as _performed by the clinician_ (`appendResusEvent`). The app never executes anything. Drugs/fluids/procedures are recorded as done by a person.
2. **The engine is pure** (`lib/resus/engine.ts`, 17 tests): `stepStatus` / `openLifeThreats` (the tracker), `recommendedNextStep` + `proceedGuard` (treat-before-proceeding — informs, never hard-blocks; a resus is non-linear), `deriveProgress` (from the timeline), `reassessPromptFor`. It tracks what the team has done and surfaces the guideline-correct next prompt; it makes no clinical decision.
3. **Doses are cited constants, tiered by confidence** (`lib/resus/reference/doses.ts`, 5 guardrail tests). Only **TIER-1 web-verified** values are fixed constants (anaphylaxis adrenaline 500 µg IM repeat 5 min; hypoglycaemia 75 mL 20% / 150 mL 10% IV + glucagon 1 mg IM + oral 15–20 g; O₂ 15 L/min, target 94–98% / 88–92%; sepsis ≥30 mL/kg [weak] + MAP ≥65 [strong]). **Protocol-surfaced** (TXA) pins only the time-critical fact; the dose comes from the local major-haemorrhage protocol. **Category-level** (status benzodiazepine, naloxone, nebulised bronchodilator, flumazenil) shows NO fixed mg. A test enforces: fixed ⇒ `verified-web` + an adult value; category ⇒ `adultDose === null`. **All paediatric doses are banded/deferred** — never an adult number for a child.
4. **The catalog is reference data** (`lib/resus/reference/abcde-catalog.ts`): A–E assess→danger→action mappings, each action citing its source and (where dosed) referencing a constant by id — no dose is duplicated as a string. Anaphylaxis is ONE cross-cutting protocol referenced from A/B/C/E (single source of truth for the 0.5 mg constant + 5-min repeat + 2-dose→refractory logic).
5. **2025 cycle corrections encoded:** routine corticosteroids are NOT recommended in anaphylaxis; airway patency takes precedence over strict C-spine immobilisation (jaw thrust where spinal injury suspected).

## Consequences

**Positive:** the team gets the guideline-correct ABCDE prompts with cited doses, and owns every action; the "never a remembered dose" rule is test-enforced; changing a dose or mapping is a CSO-authored, traceable change. **Negative:** category-level items intentionally show no number (the clinician doses); paediatric dosing is deferred to a banded build; doses must be re-verified against the primary source at each build (the `RESUS_DOSE_META.verifiedOn` stamp records the last check).

## Related

- `lib/resus/engine.ts`, `lib/resus/reference/{doses,abcde-catalog}.ts`, `tests/resus/{engine,doses}.test.ts`
- `docs/resus-abcde-gate-a-proposal.md` §A; ADR 0041 (the same suggestions-not-orders discipline in triage)
