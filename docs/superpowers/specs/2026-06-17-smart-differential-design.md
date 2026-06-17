# Smart Differential — design spec

**Status:** Approved (brainstorm, 2026-06-17). Extends the clerkship agent ([[project_clerkship_agent]], `lib/clerkship/agent/`). Ships **gated dark** behind a new flag; clinical weights are cited + CSO-signed.

## 1 · Problem

The agent's diagnosis suggestion is **additive and flat**. The reducer (`reducers/diagnosis.ts`) shows a differential only when its evidence score `> 0`, **except must-not-miss ones, which always show**. So:

- Chest pain alone → the 4 must-not-miss dx (ACS, dissection, PE, pneumothorax). No priors, no ranking.
- Cough alone → cough's must-not-miss set (3).
- Chest pain + cough → the **naive union** (7) — two lists concatenated, not reasoned.

A clinician doesn't reason this way: a complaint evokes a **broad differential shaped by factors (age, sex, risk)**, which **narrows and re-ranks** as the symptom's properties are characterised and **reshapes** when symptoms combine — while dangerous diagnoses stay on the radar even when unlikely.

## 2 · Goal

Replace the flat additive list with a **factor-weighted, live-re-ranking, interaction-aware differential** across **all 17 complaints**, presented as **honest ranked tiers** (no fabricated probabilities), with must-not-miss always pinned. Decision-support only — never auto-diagnoses.

### Non-goals

- No numeric probabilities / percentages (false precision in a clinical tool).
- No new diagnoses or clinical assertions from model memory — all weights are derived from already-CSO-approved maps (bootstrap) or freshly cited + CSO-signed (enrichment).
- No change to capture (HPC/ROS/exam/vitals), the rail's other sections, or the encounter data model. No DB migration.

## 3 · Architecture & data flow

```
patient_profiles (sex, date_of_birth)
  → fetchPatientSummaryAudited  [already loaded at the encounter page]
  → page.tsx derives { ageYears, sex }  (server)
  → <ClerkshipForm demographics=... agentConfig=... />   (prop, like agentConfig)
  → AgentInput.demographics
  → runClerkshipAgent → reducers/diagnosis.ts → weights.ts (pure scoring)
  → tiered diagnosis Insights → Assessment tab (full) + rail (compact pointer)
```

The agent stays pure + client-side. Demographics are resolved server-side (audited) and passed as a read-only prop — no client DB access, no new query (PatientSummary already carries `sex` + `dateOfBirth`).

## 4 · Data model — "bootstrap + enrich"

The clinical weights live in **parallel per-complaint files** so chunked sourcing never edits the approved maps file and each chunk is a clean CSO-review unit:

- `docs/clinical/agent/ddx-weights/<complaint_code>.json` — optional, one per complaint, sourced incrementally.
- Merged in `packs.ts` by `complaint_code` → differential (keyed by `dxCode`, else normalized `dx` name).
- When **no** weight entry exists for a dx, the engine **derives** weights from the already-approved map fields (the bootstrap). So all 17 complaints work from day one; sourced files progressively replace the derived defaults per complaint.

### Weight entry (per differential, all fields optional + cited)

```jsonc
{
  "dxCode": "acs", // stable id for cross-map identity; else matched by dx name
  "basePrior": 2, // baseline frequency GIVEN the complaint — SEPARATE from mustNotMiss
  "agePrior": [
    { "minAge": 50, "delta": 2 },
    { "maxAge": 39, "delta": -2 },
  ],
  "sexPrior": { "male": 1 },
  "featureWeights": { "exertional": 3, "crushing": 2, "reproducible on palpation": -4 },
  "riskWeights": { "hypertension": 1, "diabetes mellitus": 1, "smoking": 1 },
  "confidence": "high",
  "needsCsoInput": false,
  "citation": "...", // named source(s)
}
```

### Bootstrap derivation (code, from approved data — `weights.ts`)

Tunable, documented constants (calibration, not clinical content):

- `likelihood` → `mustNotMiss` flag **and** a coarse `basePrior`: `likely → 2`, `less_likely → 1`, `must_not_miss → 1` (dangerous ≠ common — a must-not-miss is **pinned by the flag, not floated by a high prior**).
- `ruleIn → +3`, `supportingSymptoms → +1`, `ruleOut → −3`, `refutingSymptoms → −1`, `riskFactors → +1`.
- **No age/sex prior is invented** — until a complaint is sourced, demographics are plumbed but neutral (honest: we do not fabricate age priors).

### Precedence

Per category, an explicit sourced field **fully replaces** its derived counterpart (e.g. if `featureWeights` is present, it is the complete feature map; else derive from ruleIn/ruleOut/supporting/refuting). `basePrior`/`agePrior`/`sexPrior` likewise override.

## 5 · Scoring & tiers (`weights.ts` + `reducers/diagnosis.ts`)

```
score(dx) = basePrior
          + ageDelta(ageYears)        // Σ deltas of matching agePrior bands; 0 if none/unknown
          + sexDelta(sex)
          + Σ featureWeights(present features, including negatives)
          + Σ riskWeights(present risks)
          + interactionBoost          // §6
```

Each contributing term is captured as a `Contribution { source, label, delta }` for the "why" chips.

**Tiering** (calibration constants, tuned during validation — NOT clinical content):

- **Leading** — `score ≥ LEADING` (default 5).
- **Worth considering** — `CONSIDER ≤ score < LEADING` (default CONSIDER = 2).
- **Less likely** — `FLOOR ≤ score < CONSIDER` (default FLOOR = 0).
- **Ruled down** (collapsed, expandable — honesty) — non-must-not-miss with `score < FLOOR`.
- **Must-not-miss** — always shown: in **Leading** if its score qualifies, else pinned in its own "keep excluding" section even at low/negative score. Never hidden, never deleted.

**Negatives demote, never delete.** A strongly-contradicted _non_-dangerous dx falls to "less likely" / "ruled down" (still retrievable). A must-not-miss is always pinned.

## 6 · Interaction (reshape, not addition)

1. **Shared-dx reinforcement** (engine-level, general): a diagnosis appearing under **≥2 active complaint maps** receives a cited reinforcement boost (`REINFORCE`, default +2, once) — concordance across complaints raises likelihood. Identity by `dxCode`, else normalized `dx` name. This is what makes chest pain + cough _reshape_ (PE/pneumonia rise) instead of two lists concatenating.
2. **Within-complaint `combinations`** (existing, cited): continue to fire as combination insights and boost their named dx.
3. Cross-complaint _specific_ combos (e.g. chest pain + haemoptysis + leg-swelling → PE) are a **later cited enrichment**, not required for v1 (shared-dx reinforcement covers the common case).

## 7 · Safety & gating

- **Decision-support, never autonomous** — the engine ranks + explains; the clinician Agree/Excludes (existing). No auto-diagnosis.
- **Gated dark** behind a **new** flag `AGENT_DDX_RANKING_CSO_SIGNED` (in `clerkshipAgentConfig`, `lib/encounter/feature.ts`). When **off**, `reducers/diagnosis.ts` falls back to today's flat behaviour. New flag (not the existing maps sign-off) because demographic priors + the ranked presentation are genuinely new and the CSO must see them before they reach patients.
- **No false precision** — ranked tiers + an optional faint **non-numeric** strength cue (kept from the approved mockup; trivially removable). No percentages.
- **Must-not-miss always pinned.** **Honesty:** not-asked ≠ excluded; "ruled down" stays retrievable.
- All enrichment content **cited + version-stamped + `needsCsoInput`** markers; CSO ratifies per-complaint or all at once.

## 8 · UI

- **Assessment tab** (`assessment-tab.tsx`) — the full tiered differential: **Leading / Worth considering / Less likely / (Ruled down, collapsed) / Must-not-miss pinned**. Per dx: name, **"why" chips** (present supporting features / risks / demographics), an optional strength cue, and **"to discriminate → next questions"** (unmet `ruleIn` features). Existing **Agree / Exclude** actions retained (excluded kept on record).
- **Read-only demographic context header** (age · sex) so the clinician sees what shapes the priors.
- **Rail** (`agent-insights.tsx`) — compact pointer: the top "Leading" dx + must-not-miss count, linking to the Assessment tab. The rail does not duplicate the full list.

## 9 · Sourcing plan

- **Bootstrap** (no sourcing) — derived from approved maps → all 17 complaints get tiering + feature weighting + interaction + must-not-miss day one (age/sex neutral until sourced).
- **Enrichment** — **one research-prompt-per-complaint** (17, run in chunks at the owner's pace). Consistent template asks web-enabled Claude for, per existing differential: `basePrior`/prevalence given the complaint, `agePrior` bands (direction + magnitude), `sexPrior`, `featureWeights` magnitudes, `riskWeights`, and notable cross-complaint interactions — **grounded in named sources** (textbooks/guidelines; Uganda/WHO-first where relevant), each with `confidence`, `needsCsoInput`, and `citation`. Returns JSON matching §4. Claude drafts the prompt; owner runs; Claude wires the returned file; CSO signs.
- **Calibration:** after the first 1–2 sourced complaints, tune the §5 thresholds against real data.

## 10 · Testing

- **Pure-engine TDD** (`tests/clerkship/agent/`): bootstrap derivation; `scoreDifferential` (base/age/sex/feature/risk terms incl. negatives); tiering boundaries; negatives-demote; must-not-miss always pinned; shared-dx reinforcement; explicit-field precedence over derived.
- **Scenario snapshots** — the mockup flows: "68M + exertional + crushing → ACS Leading"; "+ reproducible-on-palpation → MSK Leading, ACS demoted, dissection/PE/pneumothorax still pinned"; "chest pain + cough → PE reinforced, pneumonia enters" (these use a sourced or fixture weight file so the assertion is deterministic).
- **Pack-coverage test** — every weight file's `dxCode`/dx names resolve to a real differential; every feature/risk token is a known catalog/exam token (guards typos + silent-no-fire).

## 11 · File structure

**New**

- `lib/clerkship/agent/weights.ts` — pure: bootstrap derivation + `scoreDifferential(d, idx, demographics) → { score, contributions }`.
- `docs/clinical/agent/ddx-weights/<complaint>.json` — sourced per-complaint weights (incremental).
- `docs/clinical/agent/ddx-weights/README.md` — the research-prompt template + schema.
- `tests/clerkship/agent/weights.test.ts`, `diagnosis-tiers.test.ts`, `ddx-scenarios.test.ts`, `ddx-weights-coverage.test.ts`.

**Modified**

- `lib/clerkship/agent/types.ts` — `AgentInput.demographics?: { ageYears: number | null; sex: string | null }`; optional weight fields on `MapDifferential`; `DxTier` + `Contribution` types; `Insight.tier?` + `Insight.contributions?`.
- `lib/clerkship/agent/packs.ts` — load + merge `ddx-weights/*` onto the maps.
- `lib/clerkship/agent/reducers/diagnosis.ts` — use `weights.ts`; emit tiered insights; fall back to flat when the flag is off.
- `lib/encounter/feature.ts` — `AGENT_DDX_RANKING_CSO_SIGNED` in `clerkshipAgentConfig`.
- `app/doctor/encounters/[encounterId]/page.tsx` — derive `ageYears` from `dateOfBirth`; pass `demographics`.
- `app/doctor/encounters/[encounterId]/_components/clerkship-form.tsx` — accept `demographics`, build into `AgentInput`.
- `app/doctor/encounters/[encounterId]/_components/assessment-tab.tsx` — tiered UI + context header.
- `app/doctor/encounters/[encounterId]/_components/agent-insights.tsx` — compact rail pointer.

## 12 · Rollout (chunks)

1. **Chunk 1 — engine + UI (this spec):** demographics plumbing, `weights.ts` bootstrap, tiered `diagnosis.ts`, Assessment-tab tiered UI, rail pointer, new flag, tests. All 17 complaints get tiering/feature-weighting/interaction immediately (age/sex neutral until sourced). Ships gated dark.
2. **Chunks 2…18 — sourced enrichment, one complaint each:** research prompt → cited weight file → wire → CSO review. Demographic priors + precise magnitudes light up per complaint.
3. **Go-live:** flip `AGENT_DDX_RANKING_CSO_SIGNED` once the CSO is satisfied (can enable after the engine + first sourced complaints, or after all 17).

## 13 · Decisions made (flagged in brainstorm)

- Ranked tiers, **no numbers** (false precision rejected).
- Demographics **read from the DB** (not entered).
- **Approach A** — engine once + bootstrap from approved maps + enrich all 17 in sourced chunks.
- `basePrior` **separated** from `mustNotMiss` (dangerous ≠ common).
- **New** gating flag for the ranking (not the existing maps sign-off).
- Strength cue: **kept** (faint, non-numeric, removable).
- Parallel per-complaint weight files (not edits to the approved maps file) for clean chunked CSO review.

## 14 · Update 2026-06-17 — differential EXPANSION (CSO-directed)

The sourcing now also **adds new diagnoses** per complaint (comprehensive, ~10–15 dx, Uganda-relevant), not just re-weights the existing 6–7. Implications, implemented on `feat/smart-differential`:

- **Data model:** a `DdxWeightEntry` whose `dx` matches an existing differential **overlays** weights (as before); an entry matching nothing is **appended** as a full new `MapDifferential` (it carries `likelihood` + optional `ruleIn/ruleOut/supportingSymptoms/refutingSymptoms` + the weight fields). `mergeDdxWeights` does both.
- **Gating (safety):** appended dx + overlays live ONLY in `packs.rankedMaps`; `packs.maps` (used by flat-mode diagnosis + every other reducer) stays the untouched approved set. So flat/prod-without-flag is byte-for-byte unchanged, and new diagnoses are net-new cited content that only surface under `AGENT_DDX_RANKING_CSO_SIGNED` after CSO review. A gating test asserts appended dx never appear in `maps`.
- **Firing:** new-dx criteria reuse the existing capture vocabulary (107 feature / 50 symptom / 79 risk tokens) so they move the ranking; genuinely-new features are flagged `needsCsoInput` and ride base prior + age/sex until the catalog supports them.
- Sourcing contract updated in `docs/clinical/agent/ddx-weights/README.md`.
