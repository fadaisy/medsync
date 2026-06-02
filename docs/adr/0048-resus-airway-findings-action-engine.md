# ADR 0048 — Airway step: a findings→action→state engine on the immutable timeline

**Status:** Accepted — CLINICAL-SAFETY artifact (CSO authorised the GATE-A model + doses, 2026-06-02; "build everything")
**Context:** The Airway (A) step is the first concrete ABCDE step inside the resus surface (ADRs 0044–0047) and is built as the **reusable pattern** for B–E: the clinician records **findings**, findings **trigger candidate actions**, and **each action carries a state**. It must be deterministic, transparent (show _why_), guideline-anchored (DAS 2025 / RCUK / ERC-AHA 2025), and decision-support only — it records what the team does; it never performs or auto-administers. Advanced-airway acts (intubation, eFONA) are by a skilled operator.

## Decision

1. **On the existing immutable timeline — no new migration.** Findings are `assessment` events (step `A`) carrying an airway finding-set payload; actions + every state change are `action`/`drug`/`procedure` events carrying `{actionId, actionCode, tier, state}`; reassessment/corrections append new events (`supersedes_event_id`). The current finding-set, airway-state, and action list are **pure projections** over the timeline — the same `reconstructTimeline` / `buildResusVitals` / `resolveRoster` pattern already trusted in the codebase. This generalises directly to B–E.
2. **The clinical content is reference data** (`lib/resus/reference/airway-catalog.ts`), transcribed from the CSO catalog (`docs/clinical/resus-airway-clinical-catalog.md`): patency states, LOOK/LISTEN/FEEL findings, the LEMON/MOANS/RODS difficulty screen, and the Tier 1/2/3 action catalog (incl. the DAS 2025 Plan A→B→C→D ladder), each action citing its source and referencing a dose by id (no dose duplicated as a string).
3. **The engine is pure + TDD** (`lib/resus/airway.ts`, 60 tests): `classifyAirway` (WORST finding wins — an optimistic patency never masks a danger finding; a difficulty flag alone does not downgrade a secure airway → `secure | threatened | partially_obstructed | completely_obstructed | apnoeic_ventilate | apnoeic_arrest`); `triggeredActions` (single findings + the combination/trajectory clusters, each with its rationale, least-invasive-first / emergencies-prominent ordering; epiglottitis does **not** instrument; trauma→jaw-thrust; stridor/fatiguing→escalate-early); `isArrestPattern` (apnoea + **no signs of life / pulseless** → the arrest seam; apnoea **with a pulse** → `apnoeic_ventilate` = open airway + bag-mask ventilation, NOT CPR); `buildAirwayActions` (folds state changes by `actionId`); `escalationFor` (`failed`→next-tier — the DAS ladder); `airwayProceedGuard` (treat-before-proceeding to B; an unassessed airway is not "safe").

   **A GATE-E adversarial review (3 lenses) hardened this engine before sign-off** — it caught and fixed 5 clinical-safety issues: apnoea-with-a-pulse mis-routed to CPR (→ the `apnoeic_ventilate` split); see-saw mis-classified as partial (→ complete); IM adrenaline over-recommended for non-allergic (ACE-i/hereditary) angioedema (→ gated on anaphylaxis features); the epiglottitis safety pathway gated behind late-sign stridor (→ anchored on drooling) and undermined by co-fired instrumentation (→ suppressed); plus a typecheck error vitest had masked.

4. **Action-state vocabulary:** `indicated / in_progress / performed / not_indicated / deferred / failed`. **`failed` drives next-tier escalation** — the UI surfaces the `escalatesTo` action inline.
5. **Doses (web-verified 2026-06-02):** only `anaphylaxis_adrenaline_im` + `oxygen_critically_ill` are FIXED cited constants (reused from the resus surface). Nebulised adrenaline (airway oedema) + airway-oedema corticosteroids are **category-level** (no fixed adult dose exists; `adultDose: null`), kept separate from the anaphylaxis/asthma keys. RSI/eFONA procedural numbers are escalation context only, never app-administered. Wording flags honoured: capnography "most reliable / ≥2 variables" (not "gold standard" alone); NPA "caution" in base-of-skull fracture (not "contraindicated"); physiologically-difficult-airway kept generic.

## Scope / deferred

Record + decision-support + escalation now. **Deferred** (record-capable + escalation only, flagged): full RSI drug-and-checklist tooling, videolaryngoscopy/eFONA _procedural_ guidance, ventilator setup; paediatric airway depth (the engine routes by age).

## Consequences

**Positive:** a clinically-correct, transparent airway engine where finding→why→action is visible and every act + state is on the immutable medico-legal record; no schema change; the shape is the reusable B–E template. **Negative:** the projection is recomputed from the timeline each render (cheap at resus scale); category-level items intentionally show no number; advanced-airway depth is deferred. Changing a finding/action/mapping/dose is a CSO-authored, traceable change.

## Related

- `lib/resus/airway.ts`, `lib/resus/reference/airway-catalog.ts`, `lib/resus/reference/doses.ts`, `app/nurse/resus/[episodeId]/_components/airway-panel.tsx`, `tests/resus/airway.test.ts`
- `docs/resus-airway-gate-a-proposal.md`, `docs/clinical/resus-airway-clinical-catalog.md`; ADRs 0044–0047 (the resus surface this lives in)
