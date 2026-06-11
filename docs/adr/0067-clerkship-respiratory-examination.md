# ADR-0067 — Clerkship Respiratory Examination (tap-first IPPA + zonal + cluster→pattern)

**Status:** Accepted (gates A–D run together with CSO authorisation 2026-06-11). Built on `feat/clerkship-respiratory-exam`. The **first system-specific exam layer** onto the general examination (ADR 0066).
**Context:** the Examination tab. Source: `clerkship-respiratory-examination-kickoff.md` (§1 finding set, §2 cluster table) + Hutchison Ch 12. **The full `clerkship-respiratory-examination-catalog.md` was not supplied** — the finding set + cluster→pattern table were authored from the kickoff summary + standard Hutchison Ch 12 content; **CSO to verify the catalog + cluster signatures.** Reuses the general-exam three-state model; **no migration** (code reference data; captured in `section_data`).

## Decision

The respiratory system exam as **tap-first IPPA + zonal capture** with a **sign-cluster → pattern** decision-support layer.

1. **Domain module = code reference** `lib/clerkship/exam/respiratory.ts` (types + catalog + pure engine), reviewed in the PR. **No migration.** Captured in `examination.respiratory` (section_data).
2. **Zone/side model (ratified): upper/mid/lower × L/R** (6 zones). Percussion · breath sounds · vocal resonance captured **per zone** (tap-to-cycle grid); added sounds **per zone**; trachea (central/deviated) + expansion (per side) captured directly. Non-zonal IPPA findings (peripheral/inspection/palpation/completion) reuse the general-exam `ExamFinding` three-state model. **Peripheral overlap (clubbing/cyanosis/nodes/JVP) is NOT duplicated** — captured in the general exam.
3. **Sign-cluster → pattern (`matchRespPatterns`, pure, TDD)** — matches the recorded cluster (percussion + breath sounds + VR + trachea + expansion + added sounds) to the pattern(s) it fits: consolidation / pleural effusion / pneumothorax / **tension pneumothorax** / lobar collapse / fibrosis / COPD / **stridor**. **Transparent** (each pattern shows its signature), **MULTIPLE on ambiguity** (dull + reduced sounds with VR untested → surfaces consolidation + effusion + collapse — anti-anchoring broadening), **must-not-miss / emergency flagged** (tension pneumothorax + stridor in red), **empty when nothing recorded — NEVER auto-diagnoses.**
4. **Reasoning thread** — respiratory findings + matched patterns feed the differential (`respReasoningTokens` → positives); the differential's exam targets already surface in the panel. Never predicts findings, never auto-records, broadens on ambiguity.

## Consequences

- A full normal respiratory exam is a few taps ("Normal respiratory exam" fast path); not-examined ≠ normal.
- The cluster→pattern layer is decision-support only — the clinician interprets + decides.
- First of the system-exam layers; CVS/abdo/neuro/MSK + particular-group respiratory exams follow the same pattern (still free-text for now).
- **Follow-up:** CSO to verify the authored finding set + cluster signatures against `clerkship-respiratory-examination-catalog.md` when available; tactile vocal fremitus (per side) deferred (VR captured zonally).
