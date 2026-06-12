# ADR-0070 — Clerkship Neurological Examination (tap-first structured grading + by-limb/side + localisation engine)

**Status:** Accepted (gates run together with CSO authorisation 2026-06-12). Built on `feat/clerkship-neuro-exam`. The fourth and largest system-specific exam layer, completing the set (resp 0067 · CVS 0068 · abdo 0069 · neuro 0070).
**Context:** the Examination tab. Source: `clerkship-neurological-examination-catalog.md` — **supplied in full** (finding set + localisation table catalog-anchored). Hutchison Ch 16. **Overlaps the resus Disability step + the `confusion`/`focal_weakness` reasoning maps** — kept consistent (same GCS/glucose stance; reuses `gcsTotal`). **No migration** — code reference data (`lib/clerkship/exam/neurological.ts`); captured in `examination.neurological` (section_data).

## Decision

1. **Structured grading (ratified)** — **GCS E/V/M** (reuses `gcsTotal`; **≤8 surfaced as the airway emergency** it is), **MRC power 0–5** (tap-to-cycle per limb), **reflex grades** (absent→clonus), **tone** (normal/spastic/rigid/flaccid), **plantar** (down/up/equivocal). All tapped, never typed.
2. **By-limb/side (ratified): 4 limbs** (R/L arm, R/L leg) — a compact motor grid (power row + per-limb tone+reflex chips); plantars per side. Sensory captured as **pattern** (dermatomal / single-nerve / glove-and-stocking / sensory-level / hemisensory / dissociated) + Romberg; gait + DANISH cerebellar; special signs (meningism, cauda equina screen).
3. **One coherent module** (not phased into separate routes) with a collapsed accordion for the non-graded higher-function / cranial-nerve / coordination findings, and a "Normal neuro exam" fast path (GCS left to record).
4. **Localisation engine (`matchNeuroPatterns`, pure, TDD 15 tests)** — **UMN vs LMN** + where in the neuraxis: cortical-stroke, spinal-cord, cerebellar, parkinsonism, peripheral-neuropathy, myopathy, NMJ/myasthenia, radiculopathy, mononeuropathy. **Emergencies ranked first** — GCS≤8, raised ICP (papilloedema + reduced GCS), cord compression (sensory level), cauda equina, meningism, acute stroke (UMN + one-sided weakness). Transparent signatures, multiple on ambiguity, empty when nothing recorded — **never auto-diagnoses**. Uganda differentials woven in (HIV CNS infections, cerebral malaria, TB meningitis, Pott's, leprosy/diabetic/nutritional neuropathy).
5. **Reasoning thread** — findings + localisation feed the differential (`neuroReasoningTokens`), consistent with `confusion`/`focal_weakness` + resus Disability.

## Consequences

- **Completes the Examination tab** — all five per-system cards (General · Cardiovascular · Respiratory · Abdomen · Neuro) are now structured; the legacy free-text `examSystems` notes are kept read-only to preserve any previously-saved text.
- The stroke localisation deliberately overlaps the `focal_weakness` reasoning map (same time-critical stance) rather than contradicting it.
- Later layers (flagged): MSK exam; particular-group neuro (paediatric, the unconscious patient as a focused pathway); detailed cognitive/MMSE + psychiatric MSE as their own modules.
