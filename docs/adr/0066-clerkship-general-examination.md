# ADR-0066 — Clerkship General Examination (tap-first findings + vitals + reasoning thread)

**Status:** Accepted (GATE A signed off 2026-06-10). Built on `feat/clerkship-general-exam`.
**Context:** the Examination tab. Source: `clerkship-general-examination-catalog.md` (Hutchison Ch 2). Reuses the ROS/symptom three-state model, the clinical reasoning engine (ADR 0065), triage vitals + NEWS2 (`lib/triage`). **No migration** — catalog is code reference data; captured findings live in `section_data`.

## Decision

The general examination as **tap-first three-state findings** (present / absent / **not-examined**; not-examined ≠ normal) + value-set chips, finding-grouped (inspection · spot-diagnosis · hands · face/eyes/mouth · neck · lymphoreticular/peripheral), with a **"normal exam" fast path**. Plus **vitals** (carry triage + record-new) and the **reasoning thread**.

1. **Finding catalog = code reference module** (ratified at GATE A) — `lib/clerkship/exam/catalog.ts`, CSO-signed, reviewed in the PR. Findings are `select` (graded single-pick: wellbeing, consciousness, JVP…) or `panel` (three-state + multi value-set: nails, eyes, nodes, legs…). Spot-diagnosis patterns + must-not-miss flags carried. **No DB / no migration.**
2. **Engine (pure, TDD)** `lib/clerkship/exam/engine.ts` — `renderExamProse` (positives + examined-normal + honest not-examined), `examReasoningTokens` (present → positives, absent → negatives), `normalGeneralExam` fast path. Findings stored in `examination.generalFindings` (section_data).
3. **Vitals** — **carry-forward** reads the encounter's triage `vitalsSnapshot` (`loadTriageVitalsAction`), displayed read-only with time/source. **Record-new** captures a set on the encounter (`examination.vitals`). Interpretation **reuses `scoreNews2`** (no new thresholds); the **"scores-0-≠-normal"** discipline is held (the score is shown, never conflated with "well"). Trend arrows triage→recorded. The monitoring engine isn't built → honest "not yet attached" state; vitals capture is not rebuilt.
4. **Reasoning thread** — the differential's `examTargets` already surface in the reasoning panel ("Examine for…"); recorded exam findings now **feed back** (present → positives, absent → negatives) so the differential re-weights live. The engine **never predicts findings, never auto-records, never auto-diagnoses** — decision-support; anti-anchoring holds.

## Defaults ratified at GATE A (CSO)

- Code-module finding catalog; record-new vitals on the encounter (monitoring stubbed); general-exam only — system exams (CVS/resp/abdo/neuro/MSK) stay free-text, flagged as later focused IPPA modules.

## Consequences

- A full normal general exam is captured in a few taps; not-examined is honestly distinct from normal.
- Vitals reuse the triage NEWS2 catalog (no new thresholds); swap to the monitoring engine when built.
- General-first; system-specific + particular-group exams are later layers onto this.
- Decision-support, not autonomous — the clinician examines + records; nothing is auto-recorded.
