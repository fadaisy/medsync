# Clerkship Agent — GATE A design spec

- **Status:** GATE A — awaiting CSO sign-off
- **Date:** 2026-06-16
- **Supersedes:** the torn-down reasoning/diagnosis/assessment/plan surface (PR #143, main `46b8c59`)
- **Related:** [enriched-reasoning-maps.json](../clinical/enriched-reasoning-maps.json), [ncd-defining-criteria-research.json](../clinical/ncd-defining-criteria-research.json), exam engines in `lib/clerkship/exam/`

---

## 1. Context & goal

We deleted the old clerkship reasoning rail, diagnosis catalog/suggestion engine, and the Assessment + Plan steps to clear the way for a new, more capable, fully-sourced **clerkship agent**: a live clinical-reasoning layer embedded in the clerkship form that takes _every detail of the patient into account_ and acts as decision-support — never autonomous.

The agent does five things the CSO asked for:

1. **Predict forward** — record a symptom → predict the _associated symptoms_ to ask about and the _signs to look for on exam_.
2. **Flag combinations** — a _cluster_ of features fires a warning a single feature would not (e.g. tearing chest pain + unequal pulses → aortic dissection).
3. **Deactivate incompatible signs** — when a sign is present, a clinically-implausible alternative is _dimmed with a stated reason_ (still overridable).
4. **Demand must-check signs** — when a sign is present, certain follow-up checks become _highlighted prompts_.
5. **Stratify vitals in context** — the same vital means different things with vs without accompanying features (BP 204/112 alone = hypertensive **urgency**; + headache / visual change / focal weakness = hypertensive **emergency**), changing both DDx and urgency.

All five feed a rebuilt **Assessment tab** that suggests diagnoses from everything captured across the clerkship.

## 2. Decisions locked (brainstorm, 2026-06-16)

| Decision           | Choice                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sourcing**       | "I draft prompts, the CSO runs them." Strict source-demanding research prompts → CSO runs web-enabled → pastes back cited JSON → wired gated-dark for CSO sign-off. **Clinical knowledge is never authored from model memory.** |
| **Forcefulness**   | **Soft / advisory.** Incompatible signs dimmed-with-reason but always tappable; must-checks are highlighted prompts, never blocking.                                                                                            |
| **Placement**      | **Inline & contextual.** Reasoning attaches to the exact field it concerns; a thin red **safety strip** is reserved _only_ for must-not-miss / emergency flags.                                                                 |
| **Assessment tab** | **3 sections** — Clinical picture (assembled, vitals-up) · Suggested diagnoses (ranked, evidence-backed, **must-not-miss floated to top**) · Working diagnoses (committed).                                                     |
| **Architecture**   | **Pure engine + cited JSON knowledge packs**, gated behind a CSO-signed flag.                                                                                                                                                   |
| **Phasing**        | **Framework + vitals first** (see §9).                                                                                                                                                                                          |

## 3. Architecture

- **Module:** new `lib/clerkship/agent/` namespace (replaces the deleted `reasoning/`, `diagnosis/`, `suggestions/`).
- **Pure & client-side & live.** The engine is pure functions (no DB, no network, deterministic), run in the browser as the clerkship state changes — the same model as the existing `lib/clerkship/exam/*` pattern engines.
- **Inputs:** the live `ClerkshipState` already assembled by the form — `hpcItems: CapturedSymptom[]`, `ros: RosObservation[]`, background (`pmhItems`, `pmhScreen`, `medications`, `socialHx`, …), `examVitals: RecordedVitals`, and all 7 structured exam outputs (`examRespiratory`, `examCardiovascular`, `examAbdominal`, `examNeurological`, `examMusculoskeletal`, `examEndoVascularFoot`, `examGeneralFindings`).
- **Output:** a single `AgentReport` = `Insight[]` grouped for the UI by `target` and `kind`.
- **Existing exam engines stay.** The 7 per-system sign→pattern matchers (`matchRespPatterns`, abdominal/neuro/cvs constellation engines, etc.) are tested + deployed and are _consumed_ by the agent — not replaced.
- **Top-level API:**
  ```ts
  // lib/clerkship/agent/engine.ts
  export function runClerkshipAgent(state: ClerkshipState, packs: LoadedPacks): AgentReport;
  ```
- **Gating:** `CLERKSHIP_AGENT_LIVE` turns the engine + UI on; each knowledge pack has its own CSO-signed flag (e.g. `AGENT_VITALS_ESCALATION_CSO_SIGNED`) and ships **dark** until ratified. The reused `enriched-reasoning-maps.json` is already CSO-approved, so Phase 1 runs on it immediately.

## 4. The unified `Insight` model

Every behavior is one record discriminated by `kind`:

```ts
type InsightKind =
  | "association" // symptom -> ask-about symptoms
  | "expected-sign" // symptom -> look-for exam signs
  | "must-check" // recorded sign -> required follow-up checks
  | "incompatible" // recorded sign -> implausible alternative (dim it)
  | "combination" // feature cluster -> dx + action
  | "vital-flag" // vital + context -> urgency vs emergency
  | "diagnosis"; // all findings -> ranked differential (Assessment tab)

type Severity = "info" | "amber" | "red"; // teal -> amber -> red ramp

interface Insight {
  id: string;
  kind: InsightKind;
  severity: Severity;
  target: { area: ClerkArea; field?: string }; // where it attaches in the form
  message: string; // human-readable
  evidence: EvidenceItem[]; // the live findings that triggered it
  expects?: ExpectItem[]; // association / expected-sign / must-check
  excludes?: ExcludeItem[]; // incompatible
  suggests?: { dx: string; icd10?: string; mustNotMiss?: boolean }; // combination / diagnosis
  discriminators?: ExpectItem[]; // diagnosis: what to check to confirm/refute
  sourceRef: { pack: string; entryId: string; citation: string }; // EVERY clinical claim is traceable
}

interface EvidenceItem {
  label: string;
  from: "hpc" | "ros" | "exam" | "vitals" | "background";
  code?: string;
}
interface ExpectItem {
  label: string;
  area: ClerkArea;
  code?: string;
  why?: string;
}
interface ExcludeItem {
  label: string;
  area: ClerkArea;
  code: string;
  reason: string;
}
```

Honesty rule: an insight is only emitted from **present** findings (never from not-asked / not-examined). `sourceRef` is mandatory — an insight with no citation cannot render.

## 5. Behavior-by-behavior

| #   | kind            | Trigger source                                                              | UI                                                                    |
| --- | --------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | `association`   | enriched-maps `associated` + `discriminatingHpc` for the captured complaint | inline nudge under the complaint: "Predicted — ask about …"           |
| 1   | `expected-sign` | enriched-maps `examTargets` (sign → what it discriminates)                  | inline nudge: "Look for on exam …" linking to the system              |
| 2   | `combination`   | enriched-maps `combinations` (feature cluster → suggests + action)          | inline flag; **red strip** if must-not-miss                           |
| 3   | `incompatible`  | `sign-incompatibilities` pack                                               | the implausible option is **dimmed + reason**, still tappable         |
| 4   | `must-check`    | `sign-dependencies` pack                                                    | **amber tag** on the exam field: "must characterise …"                |
| 5   | `vital-flag`    | `vitals-escalation` pack + `RecordedVitals` + accompanying features         | the **red safety strip** with tier (urgency/emergency) + DDx + action |
| —   | `diagnosis`     | enriched-maps `differential` scored against captured features               | Assessment-tab cards                                                  |

**Marquee example (vitals-in-context):** BP 204/112 with no accompanying features → `vital-flag` tier "Hypertensive urgency" (amber). The same BP with `headache` (HPC/ROS) **or** `visual disturbance` **or** a focal neuro deficit (neuro exam) → tier escalates to "Hypertensive emergency" (red strip), DDx = hypertensive encephalopathy / intracerebral haemorrhage / etc., with an action prompt. This becomes a unit-test fixture.

## 6. Knowledge packs

Cited JSON in `docs/clinical/agent/`. Every entry carries `confidence`, optional `ugandaNote`, a `citation` (guideline/text + version + url), and `needs_cso_input: boolean`.

**Reused (already CSO-approved):** `docs/clinical/enriched-reasoning-maps.json` — supplies `association`, `expected-sign`, `combination`, and `diagnosis` on day one. (No re-sourcing needed; Phase 1 builds on it.)

**New (sourced via CSO-run prompts):**

```jsonc
// sign-incompatibilities.json  (#3)
{ "id": "...", "when": { "area": "respiratory", "sign": "percussion:stony_dull", "zone": "lower_right" },
  "implausible": [{ "area": "respiratory", "sign": "percussion:hyper_resonant", "zone": "lower_right" }],
  "reason": "Stony dullness and hyper-resonance are mutually exclusive percussion notes over the same zone.",
  "confidence": "high", "citation": {...}, "needs_cso_input": false }

// sign-dependencies.json  (#4 must-check)
{ "id": "...", "when": { "area": "cardiovascular", "sign": "murmur:present" },
  "mustCheck": [ { "area": "cardiovascular", "sign": "murmur.radiation", "why": "localises the lesion" },
                 { "area": "cardiovascular", "sign": "murmur.manoeuvre", "why": "distinguishes HOCM/AS" } ],
  "confidence": "high", "citation": {...}, "needs_cso_input": false }

// vitals-escalation.json  (#5)
{ "id": "bp-severe", "vital": "bp",
  "trigger": { "metric": "bp", "comparator": ">=", "systolic": 180, "diastolic": 110 },
  "baseTier":   { "label": "Hypertensive urgency",   "severity": "amber", "ddx": [...], "action": "..." },
  "escalation": { "anyOf": [ { "feature": "headache" }, { "feature": "visual disturbance" },
                             { "feature": "focal neurological deficit" }, { "feature": "chest pain" },
                             { "feature": "breathlessness" }, { "feature": "seizure" } ],
                  "tier": { "label": "Hypertensive emergency", "severity": "red",
                            "ddx": ["hypertensive encephalopathy", "intracerebral haemorrhage", "..."],
                            "action": "..." } },
  "confidence": "high", "ugandaNote": "...", "citation": {...}, "needs_cso_input": false }
```

**Code mapping + CI guard.** Pack entries express signs/features in clinical terms; a mapping layer resolves them to real catalog codes (symptom/ROS/exam-finding codes). A CI test asserts **every code referenced by a pack exists** in the seed catalogs / exam option sets (mirrors `tests/clerkship/ncd-catalog.test.ts`) — invented codes fail the build.

## 7. Assessment tab

Single column, three sections (approved mockup):

1. **Clinical picture** — assembled abnormals vitals-up with provenance + an editable one-liner (**never auto-set**; explicit "insert / edit").
2. **Suggested diagnoses** — ranked `diagnosis` insights, **must-not-miss floated to top**, then by likelihood. Each card: name · ICD-10 (only from verified codes, else omitted) · evidence-for chips (live) · "to discriminate — check next" chips · **source tag** · `＋ Working dx` / `Considered & excluded`.
3. **Working diagnoses** — committed editable rows with inline supporting evidence.

Built on the existing **exam-kit** primitives + **motion vocabulary** — no new design primitives.

## 8. Persistence & safety invariants

- **Insights are ephemeral** — computed live, never stored.
- **Committed** working dx → `ClerkSynthesis.differential` + `encounter_diagnoses` (both intact from the teardown). Assembled one-liner → `ClerkSynthesis.summary`. **No new migration for Phase 1.**
- Invariants preserved: decision-support **never autonomous**; **not-examined ≠ normal**; all clinical content **cited + version-stamped + CSO-gated**; "considered & excluded" diagnoses stay visible/reversible (must-not-miss never silently dropped); drug doses (if ever surfaced) only via the prescribing engine.

## 9. Phasing

**Phase 1 — framework + vitals (this build):**

- Full engine (`lib/clerkship/agent/`) + the complete `Insight` model + all 6 inline behaviors wired into the form + the safety strip + the 3-section Assessment tab.
- Knowledge: **reuse enriched-maps** (associations / expected-signs / combinations / diagnosis) **+ a focused `vitals-escalation` pack** (BP urgency/emergency + the core vitals: SpO₂, RR, HR, temp, glucose, GCS). The vitals-escalation research prompt is drafted first (Appendix A) so the CSO can source it in parallel with the framework build.
- `sign-incompatibilities` and `sign-dependencies` packs ship **structurally** (engine + UI paths exist, loaders wired) but **empty/dark** until Phase 2 content lands — honest "coverage grows" rather than fake completeness.
- Gated: `CLERKSHIP_AGENT_LIVE` off in prod until the CSO signs the vitals pack.

**Phase 2+:** grow `sign-incompatibilities` (#3) and `sign-dependencies` (#4) per-system, and broaden vitals/maps coverage — each via a CSO-run prompt + sign-off, flipping its pack flag.

## 10. Testing (TDD)

- Pure-function unit tests per insight kind (red → green) using realistic `ClerkshipState` fixtures — including the hypertensive urgency-vs-emergency pair.
- Per-pack schema + code-existence CI tests.
- Honesty tests: empty/partial state → no false-normal insights; not-examined never triggers an insight.
- No regression to the 7 exam engines (their suites stay green).

## 11. Open items needing CSO ratification (GATE A)

1. The **vitals-escalation thresholds + escalation features + DDx + actions** (Appendix A output) — to be sourced, then signed.
2. Confirm the **accompanying-feature list** per vital is clinically complete for the Uganda IM context (e.g. eclampsia features for BP in pregnancy).
3. Confirm **ICD-10 omission policy** (omit when unverified rather than guess) is acceptable for the Assessment cards.
4. Sign-off that **soft/advisory** forcefulness (vs a harder gate) is the right safety posture.

---

## Appendix A — vitals-escalation research prompt (for the CSO to run)

> _(Run in a fresh, web-enabled Claude. Demand citations; do not accept uncited thresholds.)_

```
You are assembling a CITED clinical knowledge pack for a Ugandan internal-medicine
clerkship decision-support tool. For each adult vital sign below, produce a JSON object
describing (a) the threshold band that is abnormal enough to flag, (b) the "base tier"
meaning of that band in isolation, and (c) how accompanying clinical features ESCALATE it
to an emergency tier — with the differential and the immediate action for each tier.

Vitals to cover: blood pressure (high AND low), SpO2, respiratory rate, heart rate
(brady + tachy), temperature (fever + hypothermia), capillary glucose (hypo + hyper),
GCS / conscious level.

For EACH entry return:
- trigger: the measurable band (metric, comparator, value(s)) — be explicit about units
- baseTier: { label, severity (amber/red), ddx[], action } — meaning of the band ALONE
- escalation: { anyOf: [accompanying clinical features], tier: { label, severity, ddx[], action } }
- confidence: high | moderate | low
- ugandaNote: local caveats (e.g. malaria, pregnancy/eclampsia, HIV, sickle cell, anaemia,
  altitude, limited ICU/CT access) — flag where the Uganda Clinical Guidelines differ
- citation: { guideline, version/year, url } — REQUIRED; prefer WHO / Uganda Clinical
  Guidelines first, then ESC/AHA/Surviving-Sepsis/BTS/ADA etc.
- needs_cso_input: true if any value is assay-dependent, contested, or you are not confident

Rules: cite every threshold; never invent a value; if guidelines disagree, give both and set
needs_cso_input: true. Output a single JSON array. Express accompanying features in plain
clinical terms (not codes) — they will be mapped to the app's catalog separately.
```
