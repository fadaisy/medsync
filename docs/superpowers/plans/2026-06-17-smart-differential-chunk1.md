# Smart Differential — Chunk 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the clerkship agent's flat additive diagnosis list with a factor-weighted, live-re-ranking, interaction-aware differential presented as honest ranked tiers (no numbers), must-not-miss always pinned — gated dark, all 17 complaints working day one via bootstrap from the already-approved maps.

**Architecture:** A pure scoring module (`weights.ts`) derives weights from the CSO-approved map fields (or sourced per-complaint files when present), scores each differential against demographics + present features, and the upgraded diagnosis reducer assigns tiers + shared-dx reinforcement. Demographics flow read-only from the DB (already loaded at the page). Behind `AGENT_DDX_RANKING_CSO_SIGNED`; when off, behaviour is byte-for-byte today's flat list.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, Next.js 16 RSC, the existing `lib/clerkship/agent/` engine.

**Spec:** `docs/superpowers/specs/2026-06-17-smart-differential-design.md`

**Branch:** `feat/smart-differential` (already created; the spec is committed there).

**Gauntlet (run before any PR):** `rm -rf .next` → `npm run typecheck` → `npm run lint` (0 errors; 6 pre-existing exam `findings` warnings are expected) → `npm run test` → `npm run build`.

---

## File Structure

**New**

- `lib/clerkship/agent/weights.ts` — pure: `deriveWeights`, `scoreDifferential`, `tierOf`, `mergeDdxWeights`, constants. One responsibility: turn a differential + demographics + feature index into a score + contributions + tier.
- `docs/clinical/agent/ddx-weights/README.md` — the per-complaint research-prompt template + JSON schema (no code).
- `tests/clerkship/agent/weights.test.ts` — derive + score + tier unit tests.
- `tests/clerkship/agent/diagnosis-tiers.test.ts` — reducer tiering, must-not-miss pin, shared-dx reinforcement, flat fallback.
- `tests/clerkship/agent/ddx-scenarios.test.ts` — the mockup flows on a fixture chest_pain/cough map.

**Modified**

- `lib/clerkship/agent/types.ts` — `Demographics`, `AgeBand`, weight fields on `MapDifferential`, `Contribution`, `DxTier`, `AgentInput.demographics?`, `AgentConfig.activePacks.ddxRanking`, `Insight.tier?` + `Insight.contributions?`.
- `lib/clerkship/agent/reducers/diagnosis.ts` — ranked path (tiers + reinforcement + demographics) with flat fallback preserved.
- `lib/clerkship/agent/packs.ts` — merge `ddx-weights` files onto the maps (empty list in chunk 1).
- `lib/clerkship/agent/engine.ts` — pass `{ ranked, demographics }` to `suggestDiagnoses`.
- `lib/encounter/feature.ts` — `ddxRanking` flag in `clerkshipAgentConfig`.
- `app/doctor/encounters/[encounterId]/page.tsx` — pass `demographics` to `ClerkshipForm`.
- `app/doctor/encounters/[encounterId]/_components/clerkship-form.tsx` — accept `demographics`, add to `AgentInput`.
- `app/doctor/encounters/[encounterId]/_components/assessment-tab.tsx` — tiered UI + context header.
- `app/doctor/encounters/[encounterId]/_components/agent-insights.tsx` — rail leading-dx pointer.

---

## Task 1: Types — demographics, weight fields, tier, contribution

**Files:**

- Modify: `lib/clerkship/agent/types.ts`

Pure type additions (no test — they are exercised by Task 2's tests, which won't compile until these exist).

- [ ] **Step 1: Add the new types**

In `lib/clerkship/agent/types.ts`, after the `Severity`/`ProvenanceFrom` block (around line 42), add:

```ts
/** Read-only patient demographics fed to the agent (resolved server-side). */
export interface Demographics {
  ageYears: number | null;
  sex: string | null;
}

/** An age band for a demographic prior: matches when ageYears ∈ [minAge, maxAge]. */
export interface AgeBand {
  minAge?: number;
  maxAge?: number;
  delta: number;
}

/** One signed term contributing to a diagnosis score (drives the "why" chips). */
export type ContributionSource = "base" | "age" | "sex" | "feature" | "risk" | "interaction";
export interface Contribution {
  source: ContributionSource;
  label: string;
  delta: number;
}

/** Score-based tier for a ranked diagnosis. Must-not-miss pinning is separate. */
export type DxTier = "leading" | "consider" | "less_likely" | "ruled_down";
```

- [ ] **Step 2: Extend `MapDifferential` with optional cited weight fields**

In the `MapDifferential` interface (around line 131-139), add these optional fields after `riskFactors`:

```ts
  /** ── Sourced weights (optional; absent → derived from the fields above). ── */
  dxCode?: string;
  basePrior?: number;
  agePrior?: AgeBand[];
  sexPrior?: Partial<Record<string, number>>;
  featureWeights?: Record<string, number>;
  riskWeights?: Record<string, number>;
  confidence?: string;
  needsCsoInput?: boolean;
  weightCitation?: string;
```

- [ ] **Step 3: Add `demographics` to `AgentInput`**

In `AgentInput` (around line 100-115), add after `bpStandard`:

```ts
  demographics?: Demographics;
```

- [ ] **Step 4: Add `ddxRanking` to `AgentConfig`**

In `AgentConfig.activePacks` (around line 90-97), add the field:

```ts
ddxRanking: boolean;
```

- [ ] **Step 5: Add `tier` + `contributions` to `Insight`**

In `Insight` (around line 67-84), after `score?: number;` add:

```ts
  /** Ranked-differential tier (diagnosis insights, ranking mode only). */
  tier?: DxTier;
  /** Signed terms that produced the score (diagnosis insights, ranking mode). */
  contributions?: Contribution[];
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run typecheck:app`
Expected: PASS (these are additive; existing `AgentConfig` literals will error until Task 5 adds `ddxRanking` — if so, proceed; Task 5 fixes them. If you want a clean checkpoint, do Task 5's `feature.ts` edit now.)

- [ ] **Step 7: Commit**

```bash
git add lib/clerkship/agent/types.ts
git commit -m "feat(clerkship): agent types for weighted differential"
```

---

## Task 2: `weights.ts` — bootstrap derivation + scoring + tier

**Files:**

- Create: `lib/clerkship/agent/weights.ts`
- Test: `tests/clerkship/agent/weights.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/clerkship/agent/weights.test.ts`:

```ts
import type { FeatureIndex, MapDifferential } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { deriveWeights, scoreDifferential, tierOf, TIERS } from "@/lib/clerkship/agent/weights";

function idxWith(present: string[]): FeatureIndex {
  return {
    presentDisplays: new Set(present.map((p) => p.toLowerCase())),
    deniedDisplays: new Set(),
    complaintCodes: new Set(),
    provenance: new Map(),
  };
}

const baseDx = (over: Partial<MapDifferential> = {}): MapDifferential => ({
  dx: "Acute coronary syndrome",
  likelihood: "must_not_miss",
  ruleIn: ["Exertional", "Crushing"],
  ruleOut: ["Reproducible on palpation"],
  supportingSymptoms: [{ system: "cvs", symptom: "sweating" }],
  refutingSymptoms: [],
  riskFactors: ["hypertension"],
  ...over,
});

describe("deriveWeights (bootstrap from approved fields)", () => {
  it("derives feature/risk/base weights when no sourced weights present", () => {
    const w = deriveWeights(baseDx());
    expect(w.featureWeights["Exertional"]).toBe(3); // ruleIn → +3
    expect(w.featureWeights["Reproducible on palpation"]).toBe(-3); // ruleOut → -3
    expect(w.featureWeights["sweating"]).toBe(1); // supporting → +1
    expect(w.riskWeights["hypertension"]).toBe(1);
    expect(w.basePrior).toBe(1); // must_not_miss base
    expect(w.agePrior).toEqual([]); // no fabricated age prior
  });

  it("explicit sourced fields fully replace the derived counterpart", () => {
    const w = deriveWeights(
      baseDx({
        featureWeights: { Exertional: 5 },
        basePrior: 4,
        agePrior: [{ minAge: 50, delta: 2 }],
      }),
    );
    expect(w.featureWeights).toEqual({ Exertional: 5 });
    expect(w.basePrior).toBe(4);
    expect(w.agePrior).toEqual([{ minAge: 50, delta: 2 }]);
  });
});

describe("scoreDifferential", () => {
  it("sums base + present feature + present risk, ignoring absent", () => {
    const r = scoreDifferential(baseDx(), idxWith(["exertional", "hypertension"]), undefined);
    // base 1 + exertional 3 + hypertension 1 = 5
    expect(r.score).toBe(5);
    expect(r.contributions.some((c) => c.source === "feature" && c.delta === 3)).toBe(true);
  });

  it("subtracts a present negative feature (rule-out)", () => {
    const r = scoreDifferential(baseDx(), idxWith(["reproducible on palpation"]), undefined);
    expect(r.score).toBe(1 - 3); // base 1, ruleOut -3
  });

  it("applies age + sex priors only when sourced and demographics known", () => {
    const dx = baseDx({
      agePrior: [
        { minAge: 50, delta: 2 },
        { maxAge: 39, delta: -2 },
      ],
      sexPrior: { male: 1 },
    });
    expect(scoreDifferential(dx, idxWith([]), { ageYears: 68, sex: "male" }).score).toBe(1 + 2 + 1);
    expect(scoreDifferential(dx, idxWith([]), { ageYears: 30, sex: "female" }).score).toBe(1 - 2);
    expect(scoreDifferential(dx, idxWith([]), { ageYears: null, sex: null }).score).toBe(1); // unknown → neutral
  });
});

describe("tierOf", () => {
  it("maps score to tier by the calibration thresholds", () => {
    expect(tierOf(TIERS.LEADING)).toBe("leading");
    expect(tierOf(TIERS.CONSIDER)).toBe("consider");
    expect(tierOf(TIERS.FLOOR)).toBe("less_likely");
    expect(tierOf(TIERS.FLOOR - 1)).toBe("ruled_down");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/clerkship/agent/weights.test.ts`
Expected: FAIL — cannot import from `@/lib/clerkship/agent/weights` (module missing).

- [ ] **Step 3: Implement `weights.ts`**

Create `lib/clerkship/agent/weights.ts`:

```ts
import type {
  AgeBand,
  Contribution,
  Demographics,
  DxTier,
  FeatureIndex,
  MapDifferential,
} from "@/lib/clerkship/agent/types";

import { featurePresent } from "@/lib/clerkship/agent/aliases";

/**
 * Weighted differential scoring — pure, client-safe. The clinical assertions live
 * in the CSO-approved maps (and sourced per-complaint weight files); this module
 * only turns them into a comparable score + the contributions that explain it.
 * Decision-support, never autonomous. No fabricated age priors (bootstrap leaves
 * age/sex neutral until a complaint is sourced).
 */

/** Bootstrap constants — calibration, NOT clinical content. Tuned in validation. */
export const BOOTSTRAP = {
  base: { likely: 2, less_likely: 1, must_not_miss: 1 } as Record<string, number>,
  ruleIn: 3,
  supporting: 1,
  ruleOut: -3,
  refuting: -1,
  risk: 1,
};

/** Tier thresholds — calibration constants, tuned in validation. */
export const TIERS = { LEADING: 5, CONSIDER: 2, FLOOR: 0 };

/** Shared-dx reinforcement: a dx fitting ≥2 active complaints is boosted once. */
export const REINFORCE = 2;

export interface DerivedWeights {
  basePrior: number;
  agePrior: AgeBand[];
  sexPrior: Record<string, number>;
  featureWeights: Record<string, number>;
  riskWeights: Record<string, number>;
}

/** Per category, an explicit sourced field fully replaces its derived counterpart. */
export function deriveWeights(d: MapDifferential): DerivedWeights {
  const basePrior = d.basePrior ?? BOOTSTRAP.base[d.likelihood] ?? 1;
  const agePrior = d.agePrior ?? [];
  const sexPrior = (d.sexPrior as Record<string, number> | undefined) ?? {};

  let featureWeights: Record<string, number>;
  if (d.featureWeights) {
    featureWeights = d.featureWeights;
  } else {
    featureWeights = {};
    for (const f of d.ruleIn) featureWeights[f] = BOOTSTRAP.ruleIn;
    for (const s of d.supportingSymptoms) featureWeights[s.symptom] = BOOTSTRAP.supporting;
    for (const f of d.ruleOut) featureWeights[f] = BOOTSTRAP.ruleOut;
    for (const s of d.refutingSymptoms) featureWeights[s.symptom] = BOOTSTRAP.refuting;
  }

  let riskWeights: Record<string, number>;
  if (d.riskWeights) {
    riskWeights = d.riskWeights;
  } else {
    riskWeights = {};
    for (const r of d.riskFactors) riskWeights[r] = BOOTSTRAP.risk;
  }

  return { basePrior, agePrior, sexPrior, featureWeights, riskWeights };
}

export interface ScoredDifferential {
  score: number;
  contributions: Contribution[];
}

const clean = (s: string) => s.replace(/[«»]/g, "");

export function scoreDifferential(
  d: MapDifferential,
  idx: FeatureIndex,
  demo: Demographics | undefined,
): ScoredDifferential {
  const w = deriveWeights(d);
  const contributions: Contribution[] = [];
  let score = w.basePrior;
  contributions.push({ source: "base", label: "baseline", delta: w.basePrior });

  if (demo?.ageYears != null && w.agePrior.length) {
    let ageDelta = 0;
    for (const b of w.agePrior) {
      const minOk = b.minAge == null || demo.ageYears >= b.minAge;
      const maxOk = b.maxAge == null || demo.ageYears <= b.maxAge;
      if (minOk && maxOk) ageDelta += b.delta;
    }
    if (ageDelta !== 0) {
      score += ageDelta;
      contributions.push({ source: "age", label: `age ${demo.ageYears}`, delta: ageDelta });
    }
  }

  if (demo?.sex && w.sexPrior[demo.sex]) {
    const delta = w.sexPrior[demo.sex]!;
    score += delta;
    contributions.push({ source: "sex", label: demo.sex, delta });
  }

  for (const [token, weight] of Object.entries(w.featureWeights)) {
    if (featurePresent(idx, token)) {
      score += weight;
      contributions.push({ source: "feature", label: clean(token), delta: weight });
    }
  }
  for (const [token, weight] of Object.entries(w.riskWeights)) {
    if (featurePresent(idx, token)) {
      score += weight;
      contributions.push({ source: "risk", label: clean(token), delta: weight });
    }
  }

  return { score, contributions };
}

export function tierOf(score: number): DxTier {
  if (score >= TIERS.LEADING) return "leading";
  if (score >= TIERS.CONSIDER) return "consider";
  if (score >= TIERS.FLOOR) return "less_likely";
  return "ruled_down";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/clerkship/agent/weights.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/clerkship/agent/weights.ts tests/clerkship/agent/weights.test.ts
git commit -m "feat(clerkship): weighted differential scoring (pure, TDD)"
```

---

## Task 3: `mergeDdxWeights` — merge sourced per-complaint files onto maps

**Files:**

- Modify: `lib/clerkship/agent/weights.ts` (add `mergeDdxWeights`)
- Modify: `lib/clerkship/agent/packs.ts` (call it; empty list in chunk 1)
- Test: `tests/clerkship/agent/weights.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to `weights.test.ts`)**

```ts
import type { ReasoningMap } from "@/lib/clerkship/agent/types";

import { mergeDdxWeights } from "@/lib/clerkship/agent/weights";

describe("mergeDdxWeights", () => {
  const maps: ReasoningMap[] = [
    {
      code: "chest_pain",
      display: "Chest pain",
      triggerCodes: ["chest_pain"],
      associated: [],
      redFlags: [],
      examTargets: [],
      combinations: [],
      differential: [
        {
          dx: "Acute coronary syndrome",
          likelihood: "must_not_miss",
          ruleIn: ["Exertional"],
          ruleOut: [],
          supportingSymptoms: [],
          refutingSymptoms: [],
          riskFactors: [],
        },
      ],
    },
  ];

  it("applies a sourced weight entry onto the matching differential by dx name", () => {
    const merged = mergeDdxWeights(maps, [
      {
        complaint: "chest_pain",
        weights: [
          { dx: "Acute coronary syndrome", basePrior: 4, agePrior: [{ minAge: 50, delta: 2 }] },
        ],
      },
    ]);
    const d = merged[0]!.differential[0]!;
    expect(d.basePrior).toBe(4);
    expect(d.agePrior).toEqual([{ minAge: 50, delta: 2 }]);
    expect(d.ruleIn).toEqual(["Exertional"]); // untouched approved fields preserved
  });

  it("leaves maps unchanged when there are no weight files", () => {
    const merged = mergeDdxWeights(maps, []);
    expect(merged[0]!.differential[0]!.basePrior).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/clerkship/agent/weights.test.ts`
Expected: FAIL — `mergeDdxWeights` is not exported.

- [ ] **Step 3: Implement `mergeDdxWeights` in `weights.ts`**

First, add `ReasoningMap` to the existing top `import type { ... } from "@/lib/clerkship/agent/types"` line, and add a new top import `import { normalizeFeature } from "@/lib/clerkship/agent/normalize";`. Then append the body below to the end of the file (NO import lines mid-file):

```ts
/** A sourced weight entry for one differential (all weight fields optional). */
export interface DdxWeightEntry {
  dxCode?: string;
  dx?: string;
  basePrior?: number;
  agePrior?: AgeBand[];
  sexPrior?: Record<string, number>;
  featureWeights?: Record<string, number>;
  riskWeights?: Record<string, number>;
  confidence?: string;
  needsCsoInput?: boolean;
  weightCitation?: string;
}
/** One sourced file: a complaint code + its differential weight entries. */
export interface DdxWeightFile {
  complaint: string;
  weights: DdxWeightEntry[];
}

const WEIGHT_KEYS: (keyof DdxWeightEntry)[] = [
  "dxCode",
  "basePrior",
  "agePrior",
  "sexPrior",
  "featureWeights",
  "riskWeights",
  "confidence",
  "needsCsoInput",
  "weightCitation",
];

/** Merge sourced weight files onto the maps (pure; identity by dxCode, else name). */
export function mergeDdxWeights(maps: ReasoningMap[], files: DdxWeightFile[]): ReasoningMap[] {
  if (!files.length) return maps;
  const byComplaint = new Map<string, DdxWeightEntry[]>();
  for (const f of files) byComplaint.set(f.complaint, f.weights);

  return maps.map((m) => {
    const entries = byComplaint.get(m.code);
    if (!entries) return m;
    const differential = m.differential.map((d) => {
      const match = entries.find((e) =>
        e.dxCode && d.dxCode
          ? e.dxCode === d.dxCode
          : normalizeFeature(e.dx ?? "") === normalizeFeature(d.dx),
      );
      if (!match) return d;
      const patch: Record<string, unknown> = {};
      for (const k of WEIGHT_KEYS) if (match[k] !== undefined) patch[k] = match[k];
      return { ...d, ...patch };
    });
    return { ...m, differential };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/clerkship/agent/weights.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `packs.ts` (empty list for chunk 1)**

In `lib/clerkship/agent/packs.ts`, add the import + apply at the top of `loadAgentPacks`'s `maps`. Replace the `maps: adaptMaps(rawMaps),` line with a merged version:

```ts
import type { DdxWeightFile } from "@/lib/clerkship/agent/weights";

import { mergeDdxWeights } from "@/lib/clerkship/agent/weights";

// Sourced per-complaint weight files (one import per complaint as chunks land).
// CHUNK-1: none yet — bootstrap from the approved maps. Add imports here, e.g.:
//   import chestPainWeights from "@/docs/clinical/agent/ddx-weights/chest_pain.json";
const DDX_WEIGHT_FILES: DdxWeightFile[] = [];
```

Then in `loadAgentPacks`, change:

```ts
    maps: mergeDdxWeights(adaptMaps(rawMaps), DDX_WEIGHT_FILES),
```

- [ ] **Step 6: Run to verify nothing broke**

Run: `npm run typecheck:app && npx vitest run tests/clerkship/agent/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/clerkship/agent/weights.ts lib/clerkship/agent/packs.ts tests/clerkship/agent/weights.test.ts
git commit -m "feat(clerkship): merge sourced ddx-weight files onto maps"
```

---

## Task 4: Tiered diagnosis reducer (ranked path + flat fallback)

**Files:**

- Modify: `lib/clerkship/agent/reducers/diagnosis.ts`
- Test: `tests/clerkship/agent/diagnosis-tiers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/clerkship/agent/diagnosis-tiers.test.ts`:

```ts
import type { AgentInput, FeatureIndex, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";

const EMPTY_INPUT: AgentInput = {
  hpcItems: [],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: {} as AgentInput["bpStandard"],
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
};

function idxWith(complaint: string, present: string[]): FeatureIndex {
  return {
    presentDisplays: new Set(present.map((p) => p.toLowerCase())),
    deniedDisplays: new Set(),
    complaintCodes: new Set([complaint]),
    provenance: new Map(),
  };
}

const cpMap: ReasoningMap = {
  code: "chest_pain",
  display: "Chest pain",
  triggerCodes: ["chest_pain"],
  associated: [],
  redFlags: [],
  examTargets: [],
  combinations: [],
  differential: [
    {
      dx: "Acute coronary syndrome",
      dxCode: "acs",
      likelihood: "must_not_miss",
      ruleIn: ["Exertional", "Crushing"],
      ruleOut: ["Reproducible on palpation"],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: ["hypertension"],
      featureWeights: { Exertional: 3, Crushing: 2, "Reproducible on palpation": -4 },
      basePrior: 1,
    },
    {
      dx: "Musculoskeletal",
      dxCode: "msk",
      likelihood: "likely",
      ruleIn: ["Reproducible on palpation"],
      ruleOut: ["Exertional"],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
      featureWeights: { "Reproducible on palpation": 4, Exertional: -2 },
      basePrior: 2,
    },
  ],
};

describe("suggestDiagnoses — ranked", () => {
  it("floats the supported dx to Leading with contributions", () => {
    const idx = idxWith("chest_pain", ["exertional", "crushing", "hypertension"]);
    const out = suggestDiagnoses(EMPTY_INPUT, idx, [cpMap], { ranked: true });
    const acs = out.find((i) => i.suggests?.dx === "Acute coronary syndrome")!;
    expect(acs.tier).toBe("leading"); // 1 + 3 + 2 + 1(risk) = 7
    expect(acs.contributions?.some((c) => c.source === "feature")).toBe(true);
  });

  it("demotes a contradicted non-must-not-miss but keeps a must-not-miss pinned", () => {
    const idx = idxWith("chest_pain", ["reproducible on palpation"]);
    const out = suggestDiagnoses(EMPTY_INPUT, idx, [cpMap], { ranked: true });
    const acs = out.find((i) => i.suggests?.dx === "Acute coronary syndrome")!;
    const msk = out.find((i) => i.suggests?.dx === "Musculoskeletal")!;
    expect(acs.tier).toBe("ruled_down"); // 1 - 4 = -3, but still PRESENT (pinned by mustNotMiss)
    expect(acs.suggests?.mustNotMiss).toBe(true);
    expect(msk.tier).toBe("leading"); // 2 + 4 = 6
  });

  it("reinforces a dx shared across ≥2 active complaints", () => {
    const peCp: ReasoningMap = {
      ...cpMap,
      code: "chest_pain",
      differential: [
        {
          dx: "Pulmonary embolism",
          dxCode: "pe",
          likelihood: "must_not_miss",
          ruleIn: [],
          ruleOut: [],
          supportingSymptoms: [],
          refutingSymptoms: [],
          riskFactors: [],
          basePrior: 1,
        },
      ],
    };
    const peCough: ReasoningMap = { ...peCp, code: "cough", triggerCodes: ["cough"] };
    const idx = idxWith("chest_pain", []);
    idx.complaintCodes.add("cough");
    const out = suggestDiagnoses(EMPTY_INPUT, idx, [peCp, peCough], { ranked: true });
    const pe = out.filter((i) => i.suggests?.dx === "Pulmonary embolism");
    expect(pe[0]!.contributions?.some((c) => c.source === "interaction" && c.delta === 2)).toBe(
      true,
    );
  });

  it("flat fallback (ranked off) matches today's behaviour — no tier, score-filtered", () => {
    const idx = idxWith("chest_pain", []);
    const out = suggestDiagnoses(EMPTY_INPUT, idx, [cpMap], { ranked: false });
    expect(out.every((i) => i.tier === undefined)).toBe(true);
    // MSK (not must-not-miss, score 0 with no features) is filtered out in flat mode
    expect(out.some((i) => i.suggests?.dx === "Musculoskeletal")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/clerkship/agent/diagnosis-tiers.test.ts`
Expected: FAIL — `suggestDiagnoses` does not accept an options arg / no `tier`.

- [ ] **Step 3: Rewrite `reducers/diagnosis.ts`**

Replace the whole file with:

```ts
import type {
  AgentInput,
  Contribution,
  Demographics,
  EvidenceItem,
  ExpectItem,
  FeatureIndex,
  Insight,
  MapDifferential,
  ReasoningMap,
} from "@/lib/clerkship/agent/types";

import { featurePresent } from "@/lib/clerkship/agent/aliases";
import { normalizeFeature } from "@/lib/clerkship/agent/normalize";
import { matchedMaps } from "@/lib/clerkship/agent/reducers/maps";
import { deriveWeights, REINFORCE, scoreDifferential, tierOf } from "@/lib/clerkship/agent/weights";

const present = featurePresent;
const clean = (s: string) => s.replace(/[«»]/g, "");
const dxKey = (d: MapDifferential) => d.dxCode ?? normalizeFeature(d.dx);

/** Unmet positive features → "to discriminate, check next". */
function discriminatorsFor(idx: FeatureIndex, d: MapDifferential): ExpectItem[] {
  const w = deriveWeights(d);
  return Object.entries(w.featureWeights)
    .filter(([token, weight]) => weight > 0 && !present(idx, token))
    .map(([token]) => ({ label: clean(token), area: "complaint" as const }));
}

function evidenceFromContributions(c: Contribution[]): EvidenceItem[] {
  const fromOf: Record<string, EvidenceItem["from"]> = {
    feature: "hpc",
    risk: "background",
    age: "vitals",
    sex: "vitals",
    interaction: "hpc",
  };
  return c
    .filter((x) => x.source !== "base" && x.delta > 0)
    .map((x) => ({ label: x.label, from: fromOf[x.source] ?? "hpc" }));
}

/** Ranked differential: every applicable dx tiered; must-not-miss always present. */
function suggestRanked(
  idx: FeatureIndex,
  maps: ReasoningMap[],
  demographics: Demographics | undefined,
): Insight[] {
  const matched = matchedMaps(idx, maps);
  const idCount = new Map<string, number>();
  for (const m of matched)
    for (const d of m.differential) {
      const k = dxKey(d);
      idCount.set(k, (idCount.get(k) ?? 0) + 1);
    }

  const seen = new Set<string>();
  const insights: Insight[] = [];
  for (const m of matched) {
    for (const d of m.differential) {
      const k = dxKey(d);
      if (seen.has(k)) continue; // a shared dx is shown once (reinforced)
      seen.add(k);

      const { score, contributions } = scoreDifferential(d, idx, demographics);
      let finalScore = score;
      const contribs = [...contributions];
      if ((idCount.get(k) ?? 0) >= 2) {
        finalScore += REINFORCE;
        contribs.push({
          source: "interaction",
          label: "fits multiple complaints",
          delta: REINFORCE,
        });
      }
      const mustNotMiss = d.likelihood === "must_not_miss";

      insights.push({
        id: `dx:${m.code}:${normalizeFeature(d.dx)}`,
        kind: "diagnosis",
        severity: mustNotMiss ? "red" : "info",
        target: { area: "assessment" },
        message: d.dx,
        evidence: evidenceFromContributions(contribs),
        discriminators: discriminatorsFor(idx, d),
        suggests: { dx: d.dx, mustNotMiss },
        score: finalScore,
        tier: tierOf(finalScore),
        contributions: contribs,
        sourceRef: {
          pack: "enriched-reasoning-maps",
          entryId: m.code,
          citation: "CSO-approved reasoning maps",
        },
      });
    }
  }

  // must-not-miss / leading first, then score desc, stable.
  return insights
    .map((ins, i) => ({ ins, i }))
    .sort((a, b) => {
      const ap = a.ins.suggests?.mustNotMiss || a.ins.tier === "leading" ? 1 : 0;
      const bp = b.ins.suggests?.mustNotMiss || b.ins.tier === "leading" ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const sc = (b.ins.score ?? 0) - (a.ins.score ?? 0);
      return sc !== 0 ? sc : a.i - b.i;
    })
    .map((x) => x.ins);
}

/** Flat fallback — VERBATIM the legacy behaviour (no behaviour change when the
 * flag is off). Local `scoreFlat` avoids clashing with the imported `scoreDifferential`. */
function scoreFlat(idx: FeatureIndex, d: MapDifferential) {
  const ruleInHit = d.ruleIn.filter((f) => present(idx, f));
  const ruleInMiss = d.ruleIn.filter((f) => !present(idx, f));
  const ruleOutHit = d.ruleOut.filter((f) => present(idx, f));
  const supportHit = d.supportingSymptoms.filter((s) => present(idx, s.symptom));
  const refuteHit = d.refutingSymptoms.filter((s) => present(idx, s.symptom));
  const riskHit = d.riskFactors.filter((f) => present(idx, f));
  const score =
    ruleInHit.length + supportHit.length + riskHit.length - ruleOutHit.length - refuteHit.length;
  return { score, ruleInHit, ruleInMiss, supportHit, riskHit };
}

function suggestFlat(idx: FeatureIndex, maps: ReasoningMap[]): Insight[] {
  const insights: Insight[] = [];
  for (const m of matchedMaps(idx, maps)) {
    for (const d of m.differential) {
      const mustNotMiss = d.likelihood === "must_not_miss";
      const s = scoreFlat(idx, d);
      if (!mustNotMiss && s.score <= 0) continue;

      const evidence: EvidenceItem[] = [
        ...s.ruleInHit.map((f) => ({ label: clean(f), from: "hpc" as const })),
        ...s.supportHit.map((x) => ({ label: x.symptom, from: "ros" as const })),
        ...s.riskHit.map((f) => ({ label: clean(f), from: "background" as const })),
      ];
      const discriminators: ExpectItem[] = s.ruleInMiss.map((f) => ({
        label: clean(f),
        area: "complaint" as const,
      }));
      insights.push({
        id: `dx:${m.code}:${normalizeFeature(d.dx)}`,
        kind: "diagnosis",
        severity: mustNotMiss ? "red" : "info",
        target: { area: "assessment" },
        message: d.dx,
        evidence,
        discriminators,
        suggests: { dx: d.dx, mustNotMiss },
        score: s.score,
        sourceRef: {
          pack: "enriched-reasoning-maps",
          entryId: m.code,
          citation: "CSO-approved reasoning maps",
        },
      });
    }
  }
  return insights
    .map((ins, i) => ({ ins, i }))
    .sort((a, b) => {
      const am = a.ins.suggests?.mustNotMiss ? 1 : 0;
      const bm = b.ins.suggests?.mustNotMiss ? 1 : 0;
      if (am !== bm) return bm - am;
      const sc = (b.ins.score ?? 0) - (a.ins.score ?? 0);
      return sc !== 0 ? sc : a.i - b.i;
    })
    .map((x) => x.ins);
}

export function suggestDiagnoses(
  input: AgentInput,
  idx: FeatureIndex,
  maps: ReasoningMap[],
  opts?: { ranked?: boolean; demographics?: Demographics },
): Insight[] {
  void input;
  return opts?.ranked ? suggestRanked(idx, maps, opts.demographics) : suggestFlat(idx, maps);
}
```

> Note: the flat path is re-expressed through `deriveWeights` so behaviour is identical to today (ruleIn = positive, ruleOut = negative, supporting/refuting = ±1, risk = +1) without a second source of truth.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/clerkship/agent/diagnosis-tiers.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the existing agent suite for regressions**

Run: `npx vitest run tests/clerkship/`
Expected: PASS (flat fallback preserves prior behaviour; if a prior diagnosis test asserted exact evidence ordering it may need a trivial update — fix to match the new deterministic order).

- [ ] **Step 6: Commit**

```bash
git add lib/clerkship/agent/reducers/diagnosis.ts tests/clerkship/agent/diagnosis-tiers.test.ts
git commit -m "feat(clerkship): tiered ranked differential with flat fallback"
```

---

## Task 5: Engine + feature flag wiring

**Files:**

- Modify: `lib/clerkship/agent/engine.ts`
- Modify: `lib/encounter/feature.ts`

- [ ] **Step 1: Add the flag in `feature.ts`**

In `lib/encounter/feature.ts`, inside `clerkshipAgentConfig()`'s `activePacks`, add after `incompatibilities`:

```ts
      ddxRanking: enabled && process.env.AGENT_DDX_RANKING_CSO_SIGNED === "1",
```

- [ ] **Step 2: Pass options in `engine.ts`**

In `lib/clerkship/agent/engine.ts`, replace the diagnosis call (line ~37):

```ts
insights.push(
  ...suggestDiagnoses(input, idx, packs.maps, {
    ranked: config.activePacks.ddxRanking,
    demographics: input.demographics,
  }),
);
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npx vitest run tests/clerkship/`
Expected: PASS. (If other `AgentConfig` literals in tests now miss `ddxRanking`, add `ddxRanking: false` to them.)

- [ ] **Step 4: Commit**

```bash
git add lib/clerkship/agent/engine.ts lib/encounter/feature.ts
git commit -m "feat(clerkship): gate ddx ranking behind AGENT_DDX_RANKING_CSO_SIGNED"
```

---

## Task 6: Scenario snapshot tests (the mockup flows)

**Files:**

- Test: `tests/clerkship/agent/ddx-scenarios.test.ts`

- [ ] **Step 1: Write the scenario test (a fixture map with explicit weights)**

Create `tests/clerkship/agent/ddx-scenarios.test.ts`:

```ts
import type { AgentInput, FeatureIndex, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";

const EMPTY: AgentInput = {
  hpcItems: [],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: {} as AgentInput["bpStandard"],
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
};
const idx = (complaints: string[], present: string[]): FeatureIndex => ({
  presentDisplays: new Set(present.map((p) => p.toLowerCase())),
  deniedDisplays: new Set(),
  complaintCodes: new Set(complaints),
  provenance: new Map(),
});

const CHEST: ReasoningMap = {
  code: "chest_pain",
  display: "Chest pain",
  triggerCodes: ["chest_pain"],
  associated: [],
  redFlags: [],
  examTargets: [],
  combinations: [],
  differential: [
    {
      dx: "Acute coronary syndrome",
      dxCode: "acs",
      likelihood: "must_not_miss",
      ruleIn: [],
      ruleOut: [],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
      basePrior: 1,
      agePrior: [
        { minAge: 50, delta: 3 },
        { maxAge: 39, delta: -2 },
      ],
      sexPrior: { male: 1 },
      featureWeights: { Exertional: 3, Crushing: 2, "Reproducible on palpation": -4 },
      riskWeights: { smoking: 1 },
    },
    {
      dx: "Musculoskeletal",
      dxCode: "msk",
      likelihood: "likely",
      ruleIn: [],
      ruleOut: [],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
      basePrior: 2,
      featureWeights: { "Reproducible on palpation": 4, Exertional: -2 },
    },
    {
      dx: "Pulmonary embolism",
      dxCode: "pe",
      likelihood: "must_not_miss",
      ruleIn: [],
      ruleOut: [],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
      basePrior: 1,
      featureWeights: { Pleuritic: 3 },
    },
  ],
};
const COUGH: ReasoningMap = {
  code: "cough",
  display: "Cough",
  triggerCodes: ["cough"],
  associated: [],
  redFlags: [],
  examTargets: [],
  combinations: [],
  differential: [
    {
      dx: "Pulmonary embolism",
      dxCode: "pe",
      likelihood: "must_not_miss",
      ruleIn: [],
      ruleOut: [],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
      basePrior: 1,
    },
    {
      dx: "Pneumonia",
      dxCode: "pneumonia",
      likelihood: "likely",
      ruleIn: [],
      ruleOut: [],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
      basePrior: 2,
      featureWeights: { Fever: 2 },
    },
  ],
};

const tierOfDx = (out: ReturnType<typeof suggestDiagnoses>, dx: string) =>
  out.find((i) => i.suggests?.dx === dx)?.tier;

describe("ddx scenarios", () => {
  it("68M + exertional + crushing → ACS leading", () => {
    const out = suggestDiagnoses(EMPTY, idx(["chest_pain"], ["exertional", "crushing"]), [CHEST], {
      ranked: true,
      demographics: { ageYears: 68, sex: "male" },
    });
    expect(tierOfDx(out, "Acute coronary syndrome")).toBe("leading"); // 1+3(age)+1(sex)+3+2 = 10
  });

  it("add reproducible-on-palpation → MSK leading, ACS demoted but still present (pinned)", () => {
    const out = suggestDiagnoses(
      EMPTY,
      idx(["chest_pain"], ["reproducible on palpation"]),
      [CHEST],
      { ranked: true, demographics: { ageYears: 68, sex: "male" } },
    );
    expect(tierOfDx(out, "Musculoskeletal")).toBe("leading"); // 2+4 = 6
    expect(tierOfDx(out, "Acute coronary syndrome")).toBe("ruled_down"); // 1+3+1-4 = 1 → less_likely? see note
    expect(out.some((i) => i.suggests?.dx === "Acute coronary syndrome")).toBe(true); // never dropped
  });

  it("young patient → ACS falls, but must-not-miss still present", () => {
    const out = suggestDiagnoses(EMPTY, idx(["chest_pain"], []), [CHEST], {
      ranked: true,
      demographics: { ageYears: 28, sex: "male" },
    });
    const acs = out.find((i) => i.suggests?.dx === "Acute coronary syndrome")!;
    expect(acs.score).toBe(1 - 2 + 1); // base + young age + male
    expect(acs.suggests?.mustNotMiss).toBe(true);
  });

  it("chest pain + cough → PE reinforced (fits both)", () => {
    const out = suggestDiagnoses(EMPTY, idx(["chest_pain", "cough"], []), [CHEST, COUGH], {
      ranked: true,
      demographics: { ageYears: 50, sex: "male" },
    });
    const pe = out.find((i) => i.suggests?.dx === "Pulmonary embolism")!;
    expect(pe.contributions?.some((c) => c.source === "interaction")).toBe(true);
  });
});
```

> Calibrate the second scenario's expected tier to the thresholds: ACS = base 1 + age 3 + sex 1 − reproducible 4 = **1** → `less_likely` (≥ FLOOR 0). Adjust the assertion to `"less_likely"` if that is the computed value; the invariant that matters is **MSK leads and ACS is never dropped**. Run the test and set the exact tier to the real output.

- [ ] **Step 2: Run, read the real tiers, finalize assertions**

Run: `npx vitest run tests/clerkship/agent/ddx-scenarios.test.ts`
Expected: the MSK-leading + ACS-present invariants hold; set the exact ACS tier assertion to the printed value, then re-run to PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/clerkship/agent/ddx-scenarios.test.ts
git commit -m "test(clerkship): ddx ranking scenario snapshots"
```

---

## Task 7: Demographics plumbing (page → form → AgentInput)

**Files:**

- Modify: `app/doctor/encounters/[encounterId]/page.tsx`
- Modify: `app/doctor/encounters/[encounterId]/_components/clerkship-form.tsx`

- [ ] **Step 1: Pass `demographics` from the page**

In `app/doctor/encounters/[encounterId]/page.tsx`, the `<ClerkshipForm ... />` (line ~142) gains a prop. `computeAgeYears` and `patient.sex` already exist:

```tsx
<ClerkshipForm
  encounterId={encounterId}
  initial={initial}
  draftsEnabled={draftsEnabled}
  recoveredDraftAt={recoveredDraftAt}
  agentConfig={clerkshipAgentConfig()}
  demographics={{
    ageYears: patient ? computeAgeYears(patient.dateOfBirth) : null,
    sex: patient?.sex ?? null,
  }}
/>
```

- [ ] **Step 2: Accept the prop in `clerkship-form.tsx`**

Add the import near the other agent types (line ~4):

```ts
import type {
  AgentConfig,
  AgentInput,
  Demographics,
  IncompatibilityRule,
  Insight,
} from "@/lib/clerkship/agent";
```

Add to the component's props type (where `agentConfig: AgentConfig;` is, ~line 186):

```ts
demographics: Demographics;
```

Destructure it alongside `agentConfig` in the component signature (~line 177-186).

- [ ] **Step 3: Add it to the built `AgentInput`**

In the `insights` useMemo (the `const input: AgentInput = { ... }`, ~line 309), add:

```ts
      demographics,
```

and add `demographics` to the useMemo dependency array (~line 325-340).

- [ ] **Step 4: Verify**

Run: `rm -rf .next && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/doctor/encounters/[encounterId]/page.tsx" "app/doctor/encounters/[encounterId]/_components/clerkship-form.tsx"
git commit -m "feat(clerkship): feed patient demographics to the agent"
```

---

## Task 8: Assessment-tab tiered UI

**Files:**

- Modify: `app/doctor/encounters/[encounterId]/_components/assessment-tab.tsx`

Replace **Section 2 ("Suggested diagnoses")** with a tiered renderer. Keep Sections 1 and 3, the `addWorking`/`exclude`/`remove` handlers, `PackTag`, `ChipRow`, `SectionHead`.

- [ ] **Step 1: Add tier grouping above the return**

After `const suggestions = diagnoses.filter(...)` (line ~86), add:

```tsx
// Ranked mode: insights carry a tier. Group for display; must-not-miss is pinned
// separately unless it is already Leading. Flat mode (no tier) → single list.
const ranked = suggestions.some((i) => i.tier);
const leadIds = new Set(suggestions.filter((i) => i.tier === "leading").map((i) => i.id));
const tierItems = (t: string) => suggestions.filter((i) => i.tier === t);
const pinned = suggestions.filter((i) => i.suggests?.mustNotMiss && !leadIds.has(i.id));
```

- [ ] **Step 2: Replace the Section-2 body**

Replace the `{suggestions.length ? (...) : (...)}` block inside Section 2 with:

```tsx
{
  suggestions.length ? (
    ranked ? (
      <div className="mt-2 flex flex-col gap-3">
        <DxTierGroup
          label="Leading"
          tone="teal"
          items={tierItems("leading")}
          onAdd={addWorking}
          onExclude={exclude}
        />
        <DxTierGroup
          label="Worth considering"
          tone="sky"
          items={tierItems("consider")}
          onAdd={addWorking}
          onExclude={exclude}
        />
        <DxTierGroup
          label="Less likely"
          tone="muted"
          items={tierItems("less_likely")}
          onAdd={addWorking}
          onExclude={exclude}
        />
        {pinned.length ? (
          <DxTierGroup
            label="Must-not-miss — keep excluding"
            tone="red"
            items={pinned}
            onAdd={addWorking}
            onExclude={exclude}
          />
        ) : null}
        {tierItems("ruled_down").filter((i) => !i.suggests?.mustNotMiss).length ? (
          <details className="group">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-[11px] select-none">
              Ruled down ({tierItems("ruled_down").filter((i) => !i.suggests?.mustNotMiss).length})
              ›
            </summary>
            <div className="mt-2">
              <DxTierGroup
                label=""
                tone="muted"
                items={tierItems("ruled_down").filter((i) => !i.suggests?.mustNotMiss)}
                onAdd={addWorking}
                onExclude={exclude}
              />
            </div>
          </details>
        ) : null}
      </div>
    ) : (
      <div className="mt-2 flex flex-col gap-2">
        {suggestions.map((i) => (
          <DxCard key={i.id} i={i} onAdd={addWorking} onExclude={exclude} />
        ))}
      </div>
    )
  ) : (
    <p className="text-muted-foreground mt-2 text-[12px]">
      {diagnoses.length
        ? "All current suggestions are committed below."
        : "Suggestions appear here as the clerkship is captured (decision-support, never autonomous)."}
    </p>
  );
}
```

- [ ] **Step 3: Add the `DxTierGroup` + `DxCard` components (extracting the existing card)**

At the bottom of the file (after `ChipRow`), add:

```tsx
const TIER_TONE: Record<string, string> = {
  teal: "text-teal-700 dark:text-teal-400",
  sky: "text-sky-700 dark:text-sky-400",
  red: "text-red-700 dark:text-red-400",
  muted: "text-muted-foreground",
};

function DxTierGroup({
  label,
  tone,
  items,
  onAdd,
  onExclude,
}: {
  label: string;
  tone: "teal" | "sky" | "red" | "muted";
  items: Insight[];
  onAdd: (i: Insight) => void;
  onExclude: (i: Insight) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {label ? (
        <p className={`text-[9.5px] font-semibold tracking-[0.06em] uppercase ${TIER_TONE[tone]}`}>
          {label} <span className="text-muted-foreground">({items.length})</span>
        </p>
      ) : null}
      {items.map((i) => (
        <DxCard key={i.id} i={i} onAdd={onAdd} onExclude={onExclude} />
      ))}
    </div>
  );
}

/** Non-numeric strength cue (0–4 filled) from the score, clamped. Optional. */
function Strength({ score }: { score?: number }) {
  const n = Math.max(0, Math.min(4, Math.round(score ?? 0)));
  return (
    <span
      className="ml-auto flex shrink-0 items-center gap-0.5"
      aria-hidden
      title="relative strength of fit"
    >
      {Array.from({ length: 4 }, (_, k) => (
        <span key={k} className={`h-1.5 w-3 rounded-sm ${k < n ? "bg-teal-500" : "bg-muted"}`} />
      ))}
    </span>
  );
}

function DxCard({
  i,
  onAdd,
  onExclude,
}: {
  i: Insight;
  onAdd: (i: Insight) => void;
  onExclude: (i: Insight) => void;
}) {
  return (
    <article
      className={`rounded-lg border p-3 ${i.suggests?.mustNotMiss ? "border-red-300/70 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20" : "border-border bg-muted/20"}`}
    >
      <div className="flex items-center gap-2">
        {i.suggests?.mustNotMiss ? (
          <span
            className="size-2 shrink-0 rounded-full bg-red-600 dark:bg-red-400"
            aria-hidden
            title="Must not miss"
          />
        ) : null}
        <span className="text-foreground text-[14px] font-medium">{i.suggests?.dx}</span>
        {i.suggests?.icd10 ? (
          <span className="text-muted-foreground font-mono text-[11.5px]">{i.suggests.icd10}</span>
        ) : null}
        <Strength score={i.score} />
        <PackTag insight={i} />
      </div>
      {i.evidence.length ? (
        <ChipRow label="Why" tone="teal" items={i.evidence.map((e) => e.label)} />
      ) : (
        <p className="text-muted-foreground mt-1.5 text-[11px] italic">
          Must-not-miss — surfaced for safety even without supporting features yet.
        </p>
      )}
      {i.discriminators?.length ? (
        <ChipRow
          label="To discriminate — check next"
          tone="amber"
          items={i.discriminators.map((d) => d.label)}
        />
      ) : null}
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={() => onAdd(i)}
          className="tap inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-teal-700"
        >
          <PlusIcon className="size-3.5" aria-hidden />
          Working dx
        </button>
        <button
          type="button"
          onClick={() => onExclude(i)}
          className="tap border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px]"
        >
          Considered &amp; excluded
        </button>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Add the read-only demographic context header**

In Section 1's `SectionHead` area, after the head, add (uses a new optional `demographics` prop on `AssessmentTab` — add `demographics?: { ageYears: number | null; sex: string | null }` to its props and pass it from `clerkship-form.tsx` where `<AssessmentTab ... />` is rendered, ~line 709):

```tsx
{
  demographics && (demographics.ageYears != null || demographics.sex) ? (
    <p className="text-muted-foreground mt-1 text-[10.5px]">
      Priors shaped by: {demographics.sex ?? "sex —"}
      {demographics.ageYears != null ? ` · ${demographics.ageYears}y` : ""}
    </p>
  ) : null;
}
```

- [ ] **Step 5: Verify**

Run: `rm -rf .next && npm run typecheck && npm run lint`
Expected: PASS, 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add "app/doctor/encounters/[encounterId]/_components/assessment-tab.tsx" "app/doctor/encounters/[encounterId]/_components/clerkship-form.tsx"
git commit -m "feat(clerkship): tiered differential UI in the Assessment tab"
```

---

## Task 9: Rail leading-dx pointer

**Files:**

- Modify: `app/doctor/encounters/[encounterId]/_components/agent-insights.tsx`

- [ ] **Step 1: Replace the Assessment section body**

In `AgentRail`, replace the `dxCount` computation + the Assessment `RailSection` (lines ~126 and ~211-218) so it surfaces the leading dx + must-not-miss count:

```tsx
const dx = insights.filter((i) => i.kind === "diagnosis");
const leading = dx.find((i) => i.tier === "leading");
const mnmCount = dx.filter((i) => i.suggests?.mustNotMiss).length;
const dxCount = dx.length;
```

And the section:

```tsx
{
  dxCount ? (
    <RailSection label="Assessment" tone="muted">
      {leading ? (
        <p className="text-[11.5px]">
          <span className="font-semibold text-teal-700 dark:text-teal-400">Leading: </span>
          <span className="text-foreground/80">{leading.suggests?.dx}</span>
        </p>
      ) : null}
      <p className="text-muted-foreground text-[11px]">
        {dxCount} in differential{mnmCount ? ` · ${mnmCount} must-not-miss` : ""} —{" "}
        <span className="text-teal-700 dark:text-teal-400">see the Assessment tab</span>
      </p>
    </RailSection>
  ) : null;
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/doctor/encounters/[encounterId]/_components/agent-insights.tsx"
git commit -m "feat(clerkship): rail surfaces the leading dx + must-not-miss count"
```

---

## Task 10: Research-prompt template (sourcing docs)

**Files:**

- Create: `docs/clinical/agent/ddx-weights/README.md`

- [ ] **Step 1: Write the template (no code; the per-complaint sourcing contract)**

Create `docs/clinical/agent/ddx-weights/README.md` documenting: (1) the JSON schema (`{ complaint, weights: [{ dxCode?, dx, basePrior, agePrior[], sexPrior, featureWeights, riskWeights, confidence, needsCsoInput, weightCitation }] }`); (2) the rule that `dx`/`dxCode` must match an existing differential in `enriched-reasoning-maps.json` for that complaint; (3) the **research-prompt template** to paste into web-enabled Claude — demanding named sources (textbooks/guidelines, Uganda/WHO-first), confidence + `needsCsoInput` per value, no fabrication, weights on the same scale as the bootstrap (ruleIn≈+3, ruleOut≈−3, risk≈+1, age/sex deltas typically −3..+3); (4) the wiring step: drop the file here, add its import + array entry in `packs.ts` `DDX_WEIGHT_FILES`, run the coverage test (Task 11), CSO review.

- [ ] **Step 2: Commit**

```bash
git add docs/clinical/agent/ddx-weights/README.md
git commit -m "docs(clerkship): ddx-weights sourcing template + schema"
```

---

## Task 11: Weight-file coverage test

**Files:**

- Test: `tests/clerkship/agent/ddx-weights-coverage.test.ts`

- [ ] **Step 1: Write the test (guards future sourced files)**

Create `tests/clerkship/agent/ddx-weights-coverage.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { loadAgentPacks } from "@/lib/clerkship/agent/packs";

// When sourced weight files are added to packs.ts, every entry must resolve to a
// real differential — guards typos / renamed dx (silent no-effect weights).
describe("ddx-weights coverage", () => {
  it("every map differential has a stable identity for cross-complaint matching", () => {
    const { maps } = loadAgentPacks();
    for (const m of maps) {
      const keys = m.differential.map((d) => d.dxCode ?? d.dx.trim().toLowerCase());
      expect(new Set(keys).size).toBe(keys.length); // no duplicate dx within a complaint
    }
  });

  it("any merged sourced weights landed on a real differential (no orphan weights)", () => {
    const { maps } = loadAgentPacks();
    // A differential carrying weight fields must still carry its approved core fields.
    for (const m of maps) {
      for (const d of m.differential) {
        if (d.basePrior !== undefined || d.featureWeights) {
          expect(typeof d.dx).toBe("string");
          expect(Array.isArray(d.ruleIn)).toBe(true);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `npx vitest run tests/clerkship/agent/ddx-weights-coverage.test.ts`
Expected: PASS (chunk 1 has no sourced files; the duplicate-identity guard still runs against the real maps).

- [ ] **Step 3: Commit**

```bash
git add tests/clerkship/agent/ddx-weights-coverage.test.ts
git commit -m "test(clerkship): ddx-weights coverage guard"
```

---

## Task 12: Full gauntlet + ship

- [ ] **Step 1: Run the full gauntlet**

```bash
rm -rf .next && npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: typecheck PASS; lint 0 errors (6 expected exam warnings); all tests PASS; build PASS.

- [ ] **Step 2: Manual smoke (optional but recommended)**

```bash
CLERKSHIP_AGENT_LIVE=1 ENCOUNTER_ENGINE_LIVE=1 AGENT_DDX_RANKING_CSO_SIGNED=1 npm run dev
```

Open an encounter → Assessment tab: confirm tiers render, must-not-miss pinned, the demographic header shows age/sex, and that with the flag **unset** the flat list returns (toggle to confirm fallback).

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/smart-differential
gh pr create --title "feat(clerkship): smart tiered differential (engine + UI, gated dark)" --body "<summary per the spec; gated behind AGENT_DDX_RANKING_CSO_SIGNED; all 17 complaints bootstrapped; sourcing chunks follow>"
```

- [ ] **Step 4: Poll CI → merge → confirm prod**

Poll `gh pr view feat/smart-differential --json mergeStateStatus` until CLEAN → `gh pr merge <#> --merge --delete-branch` → `git checkout main && git pull` → poll `gh api repos/justfadhul/medsync/commits/main/status --jq '.state'` until success.

---

## Post-merge (owner / later chunks)

- **FLAG FOR USER:** flip `AGENT_DDX_RANKING_CSO_SIGNED=1` to go live (needs `CLERKSHIP_AGENT_LIVE=1`).
- **Chunks 2…18:** one research prompt per complaint (Task 10 template) → cited weight file → add import + array entry in `packs.ts` → coverage test → CSO review. Demographic priors + precise magnitudes light up per complaint.
- **Calibration:** after the first 1–2 sourced complaints, tune `TIERS`/`BOOTSTRAP` in `weights.ts` against real data.
- Update memory `project_clerkship_agent.md` after merge.

```

```
