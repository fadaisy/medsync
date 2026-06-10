# ADR-0065 — Clerkship Clinical Reasoning Engine (anti-anchoring, decision-support)

**Status:** Accepted (GATE A signed off 2026-06-10). Built on `feat/clerkship-reasoning-engine`.
**Context:** sits on the symptom-capture engine (0060), ROS (0062–0063), history sections (0064). Source: clinical-reasoning reference (Hutchison Ch 1–3; Bowen NEJM 2006; hypothesis-driven PE — Yudkowsky/Staitieh; anti-bias — Croskerry, Staal 2022, Merck cognitive errors, CDSS-as-anchor arXiv). **No migration** — maps are code reference data.

## Decision

A stateful reasoning thread across the clerkship that, from the presenting complaint, forms a **problem representation**, an **always-plural differential (likely + must-not-miss)**, and propagates **discriminating prompts** into HPC / ROS / History / Examination, plus a **diagnostic pause** at synthesis. It is **decision-support — never a diagnosis-giver.**

### The safety spine (structurally enforced — the whole point)

The evidence is explicit that a single-diagnosis suggester would _worsen_ anchoring + premature closure, and that EMRs entrench early labels by propagation. So the engine is architected to **counter** that:

- **Always plural** — `mergeReasoning` only ever returns a differential; there is no code path that yields one answer.
- **Must-not-miss always surfaced** — enforced by data (a test asserts every one of the 17 maps carries ≥1 must-not-miss) and shown as a distinct prominent group.
- **No auto-fill / no auto-diagnosis / no entrenchment** — the panel is read-only suggestion; nothing is written to the record until the clinician enters it; no hypothesis is carried forward as fact.
- **Transparent** — every result shows its `basis` (which maps fired) + per-dx rule-in/rule-out; no black box.
- **Qualitative likelihood** (likely / less-likely / must-not-miss) — never probabilities.
- **Known-disease (anchoring) trap** — when a captured PMH condition matches a candidate, the panel prompts "is this different from usual? have you excluded a new cause?".
- **Diagnostic pause / time-out** — reflective prompts, emphasised at synthesis (Mamede/Croskerry).
- **Clinician leads** — they broaden/dismiss; the engine re-computes around them.

## Architecture

- **Maps** = code reference modules `lib/clerkship/reasoning/maps/` (ratified at GATE A) — 17 CSO-signed worked PCs (§3): PC→differential (+ rule-in/out), discriminating HPC, associated, red flags, hypothesis-driven exam targets, history emphasis, combinations. 206 differentials (107 must-not-miss). Transcribed by a 17-agent workflow → deterministic assembler. **No DB / no migration.**
- **Engine** `lib/clerkship/reasoning/engine.ts` (pure, TDD): `mapsForCodes` · `mergeReasoning` (dedupe to most-cautious likelihood; known-disease trap) · `reasoningForCodes` · `diagnosticPausePrompts`.
- **UI** `reasoning-panel.tsx` — a persistent, collapsible panel above the clerkship tabs, computed client-side from the captured PC codes + PMH; must-not-miss + red flags = amber attention (clinical-red reserved); the diagnostic pause emphasised on Assessment/Plan.
- Also removed the redundant free-text **SOCRATES** grid from Background (the symptom-capture engine captures SOCRATES via tapped properties).

## Consequences

- One pure engine + code maps; reasoning output is never persisted as a diagnosis (only the clinician's chosen assessment is).
- Ships on deploy (no migration). Internal-Medicine-first + Uganda-relevant; expandable to more PCs/specialties.
- Decision-support, not autonomous — the design test (ADR): it must make a clinician _consider more, re-check red flags, and pause_ — never fixate. If a change would narrow/entrench, that's the signal to redesign.
