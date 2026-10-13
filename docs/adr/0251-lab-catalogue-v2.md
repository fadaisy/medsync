# ADR 0251 — Lab catalogue v2: the concept addendum, test splits, kept answer codes and analyser profiles

**Status:** Accepted — 2026-10-12 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-2/gate-a-proposal.md)). Built on `feat/lab-one-menu` behind its flag; migrations 0107–0111 are GATED and owner-applied. No clinical value is set by this decision.

## Context

Phase 1 gave each test a fixed unit and a signed range, but the catalogue was thin (the full blood count had 6 of the 27
parameters a DH-615 prints) and the researched proposal renamed answer codes the signed NCD pack reads.

## Decision

1. **CFC v1.6** (`data/emr/clinical-fact-concepts.v1.6.json` → migration 0108): 60 new concepts, built from the research
   by `docs/lab/phase-2/build-cfc-v1.6.py`. Live answer codes are kept; only answers new in meaning are added. New shapes
   get new concepts (`obs.abo_group` + `obs.rhd_type`, `obs.tb_xpert_mtb` + `obs.tb_xpert_rif`,
   `obs.hiv_algorithm_outcome`); `obs.blood_group`, `obs.tb_xpert` and `obs.hiv_test` keep their meaning for old results.
   `obs.troponin` is retired for new results. D-dimer becomes `mg/L{FEU}` (F-2).
2. The addendum is signed **in the product** (lab lead, then CSO; `lab_signed_configs` kind `addendum`). Until then
   the four new tests are inactive and every test keeps Phase 1's components. With `labCatalogueV2` on and the addendum
   signed, the v2 component lists apply (one helper, `componentsFor`, used by entry, validation and the units reader).
3. **Restricted class per test** (CC-8, CrAg kept restricted): a column on `test_catalogue`, propagated to the order.
4. **Analyser profiles** are data (`analyser_profiles` + `data/lab/analyser-models.v1.json`): code → concept →
   clinician / lab only / never. Research-use codes cannot be mapped; MID and GRAN never fill neutrophils; a profile is
   used only with every code mapped, every open check answered and every result verified on the analyser. Receipt pins
   the profile in use; lab-only rows never reach a clinician.

## Consequences

A hospital moves to v2 by switching the flag, then signing the addendum. Old results are untouched.
