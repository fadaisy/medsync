# Clerkship Agent — Phase 1A (Engine Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, deterministic, fully-tested reasoning engine for the clerkship agent — types, the feature index, the cited knowledge-pack loaders, and one reducer per insight kind — with **no UI** (UI is Part 1B).

**Architecture:** A pure-function library in `lib/clerkship/agent/`. `runClerkshipAgent(input, packs, config)` builds a normalized `FeatureIndex` of every _present_ finding in the clerkship, then runs one reducer per `InsightKind` (each gated by `config.activePacks`), and returns a sorted `AgentReport` of `Insight[]`. Clinical knowledge lives only in cited JSON packs (reuse the CSO-approved `enriched-reasoning-maps.json`; new packs ship empty until sourced). No DB, no network, no React — same model as the existing `lib/clerkship/exam/*` matchers.

**Tech Stack:** TypeScript (strict), Vitest. `@/*` path alias → repo root. JSON imported via `resolveJsonModule`.

**Reference:** design spec [docs/design/clerkship-agent-gate-a.md](./clerkship-agent-gate-a.md). Do not author clinical content from memory — packs are sourced + CSO-signed (§6 of the spec).

---

## File structure (Part 1A)

| File                                              | Responsibility                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/clerkship/agent/types.ts`                    | All engine types (`Insight`, `InsightKind`, `Severity`, `ClerkArea`, `AgentInput`, `AgentReport`, `AgentConfig`, pack rule types, `FeatureIndex`). Type-only. |
| `lib/clerkship/agent/feature-index.ts`            | `buildFeatureIndex(input)` — normalize every present finding into matchable tokens + provenance.                                                              |
| `lib/clerkship/agent/normalize.ts`                | `normalizeFeature(s)` — strip `«»`, lowercase, trim (shared by index + maps).                                                                                 |
| `lib/clerkship/agent/packs.ts`                    | Load + adapt the cited JSON packs into typed runtime packs (`AgentPacks`). Strips guillemets, tolerates empty new packs.                                      |
| `lib/clerkship/agent/reducers/vitals.ts`          | `vitalFlags()` — `vital-flag` insights (urgency vs emergency).                                                                                                |
| `lib/clerkship/agent/reducers/maps.ts`            | `mapAssociations()` + `mapExpectedSigns()` — `association` + `expected-sign` insights.                                                                        |
| `lib/clerkship/agent/reducers/diagnosis.ts`       | `suggestDiagnoses()` — ranked `diagnosis` insights (must-not-miss floated).                                                                                   |
| `lib/clerkship/agent/reducers/combination.ts`     | `combinationFlags()` — `combination` insights from map combos.                                                                                                |
| `lib/clerkship/agent/reducers/signs.ts`           | `incompatibleSigns()` + `mustCheckSigns()` — `incompatible` + `must-check` insights (empty packs → `[]`).                                                     |
| `lib/clerkship/agent/engine.ts`                   | `runClerkshipAgent()` — orchestrate, gate by config, sort, group.                                                                                             |
| `docs/clinical/agent/sign-incompatibilities.json` | New cited pack — **ships `[]`** (sourced in Phase 2).                                                                                                         |
| `docs/clinical/agent/sign-dependencies.json`      | New cited pack — **ships `[]`** (sourced in Phase 2).                                                                                                         |
| `docs/clinical/agent/vitals-escalation.json`      | New cited pack — **ships `[]`** (sourced via spec Appendix A).                                                                                                |
| `tests/clerkship/agent/*.test.ts`                 | One test file per module.                                                                                                                                     |

Each task is its own commit. Run the whole gauntlet (`npm run typecheck && npm run lint && npm run test`) before the final task; per-task you run the focused vitest file.

---

## Task 1: Engine types

**Files:**

- Create: `lib/clerkship/agent/types.ts`

Type-only module (no behavior → no test; it is exercised by every later task's tests).

- [ ] **Step 1: Write the types**

```ts
// lib/clerkship/agent/types.ts
/**
 * Clerkship agent — engine types. Pure, client-safe (NO server-only import).
 * Decision-support only: insights are emitted from PRESENT findings, never from
 * not-asked / not-examined, and every insight carries a cited sourceRef.
 * See docs/design/clerkship-agent-gate-a.md.
 */
import type { AbdoExam } from "@/lib/clerkship/exam/abdominal";
import type { BpStandard } from "@/lib/clerkship/exam/bp";
import type { CvsExam } from "@/lib/clerkship/exam/cardiovascular";
import type { EvfExam } from "@/lib/clerkship/exam/endo-vascular-foot";
import type { MskExam } from "@/lib/clerkship/exam/musculoskeletal";
import type { NeuroExam } from "@/lib/clerkship/exam/neurological";
import type { RespExam } from "@/lib/clerkship/exam/respiratory";
import type { ExamObservation, RecordedVitals } from "@/lib/clerkship/exam/types";
import type { RosObservation } from "@/lib/clerkship/ros";
import type { CapturedSymptom } from "@/lib/clerkship/symptom-engine";

export type ClerkArea =
  | "complaint"
  | "ros"
  | "background"
  | "vitals"
  | "general"
  | "cardiovascular"
  | "respiratory"
  | "abdominal"
  | "neurological"
  | "musculoskeletal"
  | "endovascular"
  | "assessment";

export type InsightKind =
  | "association"
  | "expected-sign"
  | "must-check"
  | "incompatible"
  | "combination"
  | "vital-flag"
  | "diagnosis";

export type Severity = "info" | "amber" | "red";
export type ProvenanceFrom = "hpc" | "ros" | "exam" | "vitals" | "background";

export interface EvidenceItem {
  label: string;
  from: ProvenanceFrom;
  code?: string;
}
export interface ExpectItem {
  label: string;
  area: ClerkArea;
  code?: string;
  why?: string;
}
export interface ExcludeItem {
  label: string;
  area: ClerkArea;
  code: string;
  reason: string;
}
export interface SourceRef {
  pack: string;
  entryId: string;
  citation: string;
}

export interface Insight {
  id: string;
  kind: InsightKind;
  severity: Severity;
  target: { area: ClerkArea; field?: string };
  message: string;
  evidence: EvidenceItem[];
  expects?: ExpectItem[];
  excludes?: ExcludeItem[];
  suggests?: { dx: string; icd10?: string; mustNotMiss?: boolean };
  discriminators?: ExpectItem[];
  /** Diagnosis ranking score (higher = better supported). Diagnosis insights only. */
  score?: number;
  sourceRef: SourceRef;
}

export interface AgentReport {
  insights: Insight[];
}

export interface AgentConfig {
  enabled: boolean;
  activePacks: {
    maps: boolean;
    vitalsEscalation: boolean;
    incompatibilities: boolean;
    dependencies: boolean;
  };
}

/** Engine input — the subset of the clerkship form state the agent consumes. */
export interface AgentInput {
  hpcItems: CapturedSymptom[];
  ros: RosObservation[];
  pmhItems: { code?: string; display?: string }[];
  pmhScreen: Record<string, "yes" | "no" | "unsure">;
  examVitals: RecordedVitals;
  bpStandard: BpStandard;
  examGeneralFindings: ExamObservation[];
  examRespiratory: RespExam;
  examCardiovascular: CvsExam;
  examAbdominal: AbdoExam;
  examNeurological: NeuroExam;
  examMusculoskeletal: MskExam;
  examEndoVascularFoot: EvfExam;
}

/** A normalized index of present/denied features for matching. */
export interface FeatureIndex {
  /** normalized display tokens that are PRESENT (lowercased, guillemets stripped). */
  presentDisplays: Set<string>;
  /** normalized display tokens explicitly DENIED / absent. */
  deniedDisplays: Set<string>;
  /** symptom codes of the presenting complaint(s). */
  complaintCodes: Set<string>;
  /** provenance for a present display token (best-effort, first writer wins). */
  provenance: Map<string, EvidenceItem>;
}

/* ── Pack rule types (the cited JSON, adapted) ───────────────────────────── */

export interface MapDifferential {
  dx: string;
  likelihood: string; // "must_not_miss" | "likely" | "less_likely" | ...
  ruleIn: string[];
  ruleOut: string[];
  supportingSymptoms: { system: string; symptom: string }[];
  refutingSymptoms: { system: string; symptom: string }[];
  riskFactors: string[];
}
export interface MapExamTarget {
  area: string;
  sign: string;
  discriminates: string;
}
export interface MapCombination {
  features: string[];
  suggests: string;
  action?: string;
  mustNotMiss?: boolean;
}
export interface ReasoningMap {
  code: string;
  display: string;
  triggerCodes: string[];
  associated: string[];
  redFlags: string[];
  examTargets: MapExamTarget[];
  differential: MapDifferential[];
  combinations?: MapCombination[];
}

export interface IncompatibilityRule {
  id: string;
  when: { area: ClerkArea; sign: string; zone?: string };
  implausible: { area: ClerkArea; sign: string; zone?: string }[];
  reason: string;
  citation: string;
}
export interface DependencyRule {
  id: string;
  when: { area: ClerkArea; sign: string };
  mustCheck: { area: ClerkArea; sign: string; why: string }[];
  citation: string;
}
export interface VitalsEscalationRule {
  id: string;
  vital: string; // "bp" | "spo2" | "rr" | "hr" | "temp" | "glucose" | "gcs"
  trigger: {
    metric: string;
    comparator: ">=" | "<=" | "<" | ">";
    systolic?: number;
    diastolic?: number;
    value?: number;
  };
  baseTier: { label: string; severity: Severity; ddx: string[]; action: string };
  escalation: {
    anyOf: { feature: string }[];
    tier: { label: string; severity: Severity; ddx: string[]; action: string };
  };
  citation: string;
}

export interface AgentPacks {
  maps: ReasoningMap[];
  incompatibilities: IncompatibilityRule[];
  dependencies: DependencyRule[];
  vitalsEscalation: VitalsEscalationRule[];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck:app`
Expected: PASS (no errors). If `pmhItems` shape conflicts with the real `ClerkPmhItem`, keep the loose `{ code?; display? }` — the form maps `ClerkPmhItem[]` into it in Part 1B.

- [ ] **Step 3: Commit**

```bash
git add lib/clerkship/agent/types.ts
git commit -m "feat(agent): clerkship-agent engine types"
```

---

## Task 2: normalizeFeature

**Files:**

- Create: `lib/clerkship/agent/normalize.ts`
- Test: `tests/clerkship/agent/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/clerkship/agent/normalize.test.ts
import { describe, expect, it } from "vitest";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";

describe("normalizeFeature", () => {
  it("strips guillemets, lowercases, trims", () => {
    expect(normalizeFeature("«Unequal pulses»")).toBe("unequal pulses");
    expect(normalizeFeature("  Crushing ")).toBe("crushing");
  });
  it("collapses internal whitespace", () => {
    expect(normalizeFeature("Radiation to   left arm")).toBe("radiation to left arm");
  });
  it("empty / undefined → empty string", () => {
    expect(normalizeFeature("")).toBe("");
    expect(normalizeFeature(undefined)).toBe("");
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run tests/clerkship/agent/normalize.test.ts`
Expected: FAIL — "Failed to resolve import .../normalize".

- [ ] **Step 3: Implement**

```ts
// lib/clerkship/agent/normalize.ts
/** Normalize a clinical feature string for matching: strip the «» free-text
 *  markers used in the reasoning maps, lowercase, and collapse whitespace. */
export function normalizeFeature(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/[«»]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run tests/clerkship/agent/normalize.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/clerkship/agent/normalize.ts tests/clerkship/agent/normalize.test.ts
git commit -m "feat(agent): normalizeFeature helper"
```

---

## Task 3: buildFeatureIndex

**Files:**

- Create: `lib/clerkship/agent/feature-index.ts`
- Test: `tests/clerkship/agent/feature-index.test.ts`

This reads every PRESENT finding into `presentDisplays` (normalized) with provenance, records DENIED ROS into `deniedDisplays`, and collects complaint codes. It must NOT add not-examined / absent findings to `presentDisplays`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/clerkship/agent/feature-index.test.ts
import type { AgentInput } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";

const EMPTY: AgentInput = {
  hpcItems: [],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: "who_esc",
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
};

describe("buildFeatureIndex", () => {
  it("empty input → empty index", () => {
    const idx = buildFeatureIndex(EMPTY);
    expect(idx.presentDisplays.size).toBe(0);
    expect(idx.complaintCodes.size).toBe(0);
  });

  it("captured symptom display + property labels become present tokens + complaint code", () => {
    const idx = buildFeatureIndex({
      ...EMPTY,
      hpcItems: [
        {
          symptomCode: "chest_pain",
          symptomDisplay: "Chest pain",
          properties: [
            {
              propertyCode: "cp_character",
              propertyDisplay: "Character",
              valueType: "single_select",
              labels: ["Crushing"],
            },
          ],
        },
      ],
    });
    expect(idx.complaintCodes.has("chest_pain")).toBe(true);
    expect(idx.presentDisplays.has("chest pain")).toBe(true);
    expect(idx.presentDisplays.has("crushing")).toBe(true);
  });

  it("ROS present → presentDisplays; ROS denies → deniedDisplays (never present)", () => {
    const idx = buildFeatureIndex({
      ...EMPTY,
      ros: [
        {
          symptomCode: "dyspnoea",
          symptomDisplay: "Dyspnoea",
          system: "respiratory",
          status: "present",
        },
        { symptomCode: "cough", symptomDisplay: "Cough", system: "respiratory", status: "denies" },
      ],
    });
    expect(idx.presentDisplays.has("dyspnoea")).toBe(true);
    expect(idx.deniedDisplays.has("cough")).toBe(true);
    expect(idx.presentDisplays.has("cough")).toBe(false);
  });

  it("only PRESENT exam findings index; not_examined / absent are ignored", () => {
    const idx = buildFeatureIndex({
      ...EMPTY,
      examGeneralFindings: [
        { code: "pallor", group: "general", display: "Pallor", state: "present" },
        { code: "jaundice", group: "general", display: "Jaundice", state: "not_examined" },
        { code: "cyanosis", group: "general", display: "Cyanosis", state: "absent" },
      ],
    });
    expect(idx.presentDisplays.has("pallor")).toBe(true);
    expect(idx.presentDisplays.has("jaundice")).toBe(false);
    expect(idx.presentDisplays.has("cyanosis")).toBe(false);
  });

  it("pmhScreen 'yes' keys map to condition labels in presentDisplays", () => {
    const idx = buildFeatureIndex({ ...EMPTY, pmhScreen: { hypertension: "yes", diabetes: "no" } });
    expect(idx.presentDisplays.has("hypertension")).toBe(true);
    expect(idx.presentDisplays.has("diabetes")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run tests/clerkship/agent/feature-index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/clerkship/agent/feature-index.ts
import type {
  AgentInput,
  EvidenceItem,
  FeatureIndex,
  ProvenanceFrom,
} from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";

function add(idx: FeatureIndex, raw: string, ev: EvidenceItem) {
  const t = normalizeFeature(raw);
  if (!t) return;
  idx.presentDisplays.add(t);
  if (!idx.provenance.has(t)) idx.provenance.set(t, ev);
}

export function buildFeatureIndex(input: AgentInput): FeatureIndex {
  const idx: FeatureIndex = {
    presentDisplays: new Set(),
    deniedDisplays: new Set(),
    complaintCodes: new Set(),
    provenance: new Map(),
  };

  // HPC — symptom display + every captured property label.
  for (const s of input.hpcItems) {
    if (s.symptomCode) idx.complaintCodes.add(s.symptomCode);
    const ev: EvidenceItem = { label: s.symptomDisplay, from: "hpc", code: s.symptomCode };
    add(idx, s.symptomDisplay, ev);
    for (const p of s.properties ?? []) {
      for (const lbl of p.labels ?? []) add(idx, lbl, { label: lbl, from: "hpc" });
    }
  }

  // ROS — present → present; denies → denied.
  for (const o of input.ros) {
    if (o.status === "present") {
      add(idx, o.symptomDisplay, { label: o.symptomDisplay, from: "ros", code: o.symptomCode });
      for (const p of o.properties ?? [])
        for (const lbl of p.labels ?? []) add(idx, lbl, { label: lbl, from: "ros" });
    } else if (o.status === "denies") {
      const t = normalizeFeature(o.symptomDisplay);
      if (t) idx.deniedDisplays.add(t);
    }
  }

  // Background — PMH free items + the chronic screen (yes only).
  for (const it of input.pmhItems) {
    if (it.display) add(idx, it.display, { label: it.display, from: "background", code: it.code });
  }
  for (const [key, val] of Object.entries(input.pmhScreen)) {
    if (val === "yes") add(idx, key, { label: key, from: "background", code: key });
  }

  // Exam — only PRESENT three-state findings + their value chips.
  const indexExam = (
    obs: { code: string; display: string; state: string; values?: string[] }[],
    from: ProvenanceFrom,
  ) => {
    for (const o of obs) {
      if (o.state !== "present") continue;
      add(idx, o.display, { label: o.display, from, code: o.code });
      for (const v of o.values ?? []) add(idx, v, { label: v, from });
    }
  };
  indexExam(input.examGeneralFindings, "exam");
  // Structured exams (resp/cvs/abdo/neuro/msk/evf) commonly carry a `findings: ExamObservation[]`.
  for (const exam of [
    input.examRespiratory,
    input.examCardiovascular,
    input.examAbdominal,
    input.examNeurological,
    input.examMusculoskeletal,
    input.examEndoVascularFoot,
  ] as { findings?: { code: string; display: string; state: string; values?: string[] }[] }[]) {
    if (exam?.findings) indexExam(exam.findings, "exam");
  }

  return idx;
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run tests/clerkship/agent/feature-index.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/clerkship/agent/feature-index.ts tests/clerkship/agent/feature-index.test.ts
git commit -m "feat(agent): buildFeatureIndex (present-only, with provenance)"
```

---

## Task 4: Knowledge packs — empty new packs + loader

**Files:**

- Create: `docs/clinical/agent/sign-incompatibilities.json` (content: `[]`)
- Create: `docs/clinical/agent/sign-dependencies.json` (content: `[]`)
- Create: `docs/clinical/agent/vitals-escalation.json` (content: `[]`)
- Create: `lib/clerkship/agent/packs.ts`
- Test: `tests/clerkship/agent/packs.test.ts`

`packs.ts` imports the reused maps JSON + the three new JSON files and adapts them to `AgentPacks`. The maps JSON is the existing CSO-approved file; the adapter keeps only the fields the engine needs and tolerates missing optional fields.

- [ ] **Step 1: Create the three empty pack files**

Each file's entire content is exactly:

```json
[]
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/clerkship/agent/packs.test.ts
import { describe, expect, it } from "vitest";

import { loadAgentPacks } from "@/lib/clerkship/agent/packs";

describe("loadAgentPacks", () => {
  it("loads the reused reasoning maps (non-empty, with chest_pain)", () => {
    const packs = loadAgentPacks();
    expect(packs.maps.length).toBeGreaterThan(0);
    const cp = packs.maps.find((m) => m.code === "chest_pain");
    expect(cp).toBeTruthy();
    expect(cp!.differential.length).toBeGreaterThan(0);
    expect(cp!.triggerCodes).toContain("chest_pain");
  });

  it("new packs ship empty until sourced", () => {
    const packs = loadAgentPacks();
    expect(packs.incompatibilities).toEqual([]);
    expect(packs.dependencies).toEqual([]);
    expect(packs.vitalsEscalation).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test — verify it fails**

Run: `npx vitest run tests/clerkship/agent/packs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// lib/clerkship/agent/packs.ts
/**
 * Cited knowledge packs for the clerkship agent. The reused reasoning maps are
 * already CSO-approved (docs/clinical/enriched-reasoning-maps.json); the three
 * new packs ship empty and are sourced + CSO-signed in Phase 2 (the loader
 * tolerates empty packs). Client-safe: pure JSON imports, no server-only.
 */
import type {
  AgentPacks,
  DependencyRule,
  IncompatibilityRule,
  ReasoningMap,
  VitalsEscalationRule,
} from "@/lib/clerkship/agent/types";

import rawDeps from "@/docs/clinical/agent/sign-dependencies.json";
import rawIncompat from "@/docs/clinical/agent/sign-incompatibilities.json";
import rawVitals from "@/docs/clinical/agent/vitals-escalation.json";
import rawMaps from "@/docs/clinical/enriched-reasoning-maps.json";

function adaptMaps(raw: unknown): ReasoningMap[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m: Record<string, unknown>) => ({
    code: String(m.code ?? ""),
    display: String(m.display ?? ""),
    triggerCodes: (m.triggerCodes as string[]) ?? [],
    associated: (m.associated as string[]) ?? [],
    redFlags: (m.redFlags as string[]) ?? [],
    examTargets: (m.examTargets as ReasoningMap["examTargets"]) ?? [],
    differential: (m.differential as ReasoningMap["differential"]) ?? [],
    combinations: (m.combinations as ReasoningMap["combinations"]) ?? [],
  }));
}

let cached: AgentPacks | null = null;

export function loadAgentPacks(): AgentPacks {
  if (cached) return cached;
  cached = {
    maps: adaptMaps(rawMaps),
    incompatibilities: rawIncompat as IncompatibilityRule[],
    dependencies: rawDeps as DependencyRule[],
    vitalsEscalation: rawVitals as VitalsEscalationRule[],
  };
  return cached;
}
```

> If `npm run typecheck` errors on the JSON imports, confirm `resolveJsonModule` + `esModuleInterop` are set in `tsconfig.json` (they are required for the existing repo build). Importing from `@/docs/...` is already the established pattern (the deleted reasoning engine sourced this file).

- [ ] **Step 5: Run test — verify it passes**

Run: `npx vitest run tests/clerkship/agent/packs.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add docs/clinical/agent/ lib/clerkship/agent/packs.ts tests/clerkship/agent/packs.test.ts
git commit -m "feat(agent): knowledge-pack loader (reuse maps; empty new packs)"
```

---

## Task 5: vitals reducer

**Files:**

- Create: `lib/clerkship/agent/reducers/vitals.ts`
- Test: `tests/clerkship/agent/vitals.test.ts`

`vitalFlags(input, idx, rules)` evaluates each `VitalsEscalationRule` against the recorded vitals; when a rule's `trigger` matches, it emits a `vital-flag` insight at the base tier, escalated to the higher tier if any `escalation.anyOf` feature is present in the index. With an empty pack it returns `[]`. (The BP example is the canonical fixture; real thresholds come from the sourced pack.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/clerkship/agent/vitals.test.ts
import type { AgentInput, VitalsEscalationRule } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { vitalFlags } from "@/lib/clerkship/agent/reducers/vitals";

const BP_RULE: VitalsEscalationRule = {
  id: "bp-severe",
  vital: "bp",
  trigger: { metric: "bp", comparator: ">=", systolic: 180, diastolic: 110 },
  baseTier: {
    label: "Hypertensive urgency",
    severity: "amber",
    ddx: ["severe hypertension"],
    action: "recheck, oral agent",
  },
  escalation: {
    anyOf: [
      { feature: "headache" },
      { feature: "visual disturbance" },
      { feature: "focal neurological deficit" },
    ],
    tier: {
      label: "Hypertensive emergency",
      severity: "red",
      ddx: ["hypertensive encephalopathy", "intracerebral haemorrhage"],
      action: "IV therapy, urgent referral",
    },
  },
  citation: "TEST FIXTURE — not clinical content",
};

const base = (over: Partial<AgentInput>): AgentInput => ({
  hpcItems: [],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: "who_esc",
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
  ...over,
});

describe("vitalFlags", () => {
  it("empty rules → no insights", () => {
    const input = base({ examVitals: { sbp: 204, dbp: 112 } });
    expect(vitalFlags(input, buildFeatureIndex(input), [])).toEqual([]);
  });

  it("BP 204/112 alone → amber urgency", () => {
    const input = base({ examVitals: { sbp: 204, dbp: 112 } });
    const out = vitalFlags(input, buildFeatureIndex(input), [BP_RULE]);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("amber");
    expect(out[0].message).toContain("urgency");
    expect(out[0].kind).toBe("vital-flag");
  });

  it("BP 204/112 + headache → red emergency", () => {
    const input = base({
      examVitals: { sbp: 204, dbp: 112 },
      ros: [
        {
          symptomCode: "headache",
          symptomDisplay: "Headache",
          system: "neurological",
          status: "present",
        },
      ],
    });
    const out = vitalFlags(input, buildFeatureIndex(input), [BP_RULE]);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("red");
    expect(out[0].message).toContain("emergency");
    expect(out[0].evidence.some((e) => e.label.toLowerCase() === "headache")).toBe(true);
  });

  it("BP below threshold → no insight", () => {
    const input = base({ examVitals: { sbp: 150, dbp: 95 } });
    expect(vitalFlags(input, buildFeatureIndex(input), [BP_RULE])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run tests/clerkship/agent/vitals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/clerkship/agent/reducers/vitals.ts
import type {
  AgentInput,
  EvidenceItem,
  FeatureIndex,
  Insight,
  VitalsEscalationRule,
} from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";
import { gcsTotal } from "@/lib/clerkship/exam/types";

function metricValue(
  v: AgentInput["examVitals"],
  metric: string,
): { ok: boolean; sbp?: number; dbp?: number; value?: number } {
  switch (metric) {
    case "bp":
      return { ok: v.sbp != null || v.dbp != null, sbp: v.sbp, dbp: v.dbp };
    case "spo2":
      return { ok: v.spo2 != null, value: v.spo2 };
    case "rr":
      return { ok: v.rr != null, value: v.rr };
    case "hr":
      return { ok: v.hr != null, value: v.hr };
    case "temp":
      return { ok: v.tempC != null, value: v.tempC };
    case "glucose":
      return { ok: v.glucose != null, value: v.glucose };
    case "gcs": {
      const t = gcsTotal(v);
      return { ok: t != null, value: t };
    }
    default:
      return { ok: false };
  }
}

function cmp(a: number, op: string, b: number): boolean {
  switch (op) {
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case "<":
      return a < b;
    default:
      return false;
  }
}

function triggered(
  rule: VitalsEscalationRule,
  mv: { sbp?: number; dbp?: number; value?: number },
): boolean {
  const t = rule.trigger;
  if (rule.vital === "bp") {
    const s = mv.sbp != null && t.systolic != null && cmp(mv.sbp, t.comparator, t.systolic);
    const d = mv.dbp != null && t.diastolic != null && cmp(mv.dbp, t.comparator, t.diastolic);
    // ">=" style thresholds: either crossing fires; "<=" style: same.
    return Boolean(s || d);
  }
  return mv.value != null && t.value != null && cmp(mv.value, t.comparator, t.value);
}

export function vitalFlags(
  input: AgentInput,
  idx: FeatureIndex,
  rules: VitalsEscalationRule[],
): Insight[] {
  const out: Insight[] = [];
  for (const rule of rules) {
    const mv = metricValue(input.examVitals, rule.trigger.metric);
    if (!mv.ok || !triggered(rule, mv)) continue;

    const matched = rule.escalation.anyOf.filter((f) =>
      idx.presentDisplays.has(normalizeFeature(f.feature)),
    );
    const escalated = matched.length > 0;
    const tier = escalated ? rule.escalation.tier : rule.baseTier;

    const vitalEvidence: EvidenceItem = {
      label: `${rule.vital.toUpperCase()} recorded`,
      from: "vitals",
    };
    const featureEvidence: EvidenceItem[] = matched.map(
      (f) => idx.provenance.get(normalizeFeature(f.feature)) ?? { label: f.feature, from: "ros" },
    );

    out.push({
      id: `vital:${rule.id}:${escalated ? "esc" : "base"}`,
      kind: "vital-flag",
      severity: tier.severity,
      target: { area: "vitals" },
      message: `${tier.label} — ${tier.ddx.join(", ")}. ${tier.action}`,
      evidence: [vitalEvidence, ...featureEvidence],
      sourceRef: { pack: "vitals-escalation", entryId: rule.id, citation: rule.citation },
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run tests/clerkship/agent/vitals.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/clerkship/agent/reducers/vitals.ts tests/clerkship/agent/vitals.test.ts
git commit -m "feat(agent): vitals-escalation reducer (urgency vs emergency)"
```

---

## Task 6: maps reducer — associations + expected signs

**Files:**

- Create: `lib/clerkship/agent/reducers/maps.ts`
- Test: `tests/clerkship/agent/maps.test.ts`

A map matches the encounter when any of its `triggerCodes` is in `idx.complaintCodes`. `mapAssociations` emits one `association` insight per matched map listing `associated` features NOT already present. `mapExpectedSigns` emits one `expected-sign` insight per matched map from `examTargets`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/clerkship/agent/maps.test.ts
import type { AgentInput, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { mapAssociations, mapExpectedSigns } from "@/lib/clerkship/agent/reducers/maps";

const CP_MAP: ReasoningMap = {
  code: "chest_pain",
  display: "Chest pain",
  triggerCodes: ["chest_pain"],
  associated: ["sweating", "dyspnoea", "syncope"],
  redFlags: [],
  examTargets: [{ area: "Vascular", sign: "BP in both arms", discriminates: "Aortic dissection" }],
  differential: [],
  combinations: [],
};

const base = (over: Partial<AgentInput>): AgentInput => ({
  hpcItems: [],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: "who_esc",
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
  ...over,
});

const cpInput = (over: Partial<AgentInput> = {}) =>
  base({
    hpcItems: [{ symptomCode: "chest_pain", symptomDisplay: "Chest pain", properties: [] }],
    ...over,
  });

describe("mapAssociations", () => {
  it("no matching complaint → nothing", () => {
    const input = base({});
    expect(mapAssociations(input, buildFeatureIndex(input), [CP_MAP])).toEqual([]);
  });

  it("chest pain → suggests asking about associated features not yet present", () => {
    const input = cpInput();
    const out = mapAssociations(input, buildFeatureIndex(input), [CP_MAP]);
    expect(out).toHaveLength(1);
    const labels = out[0].expects!.map((e) => e.label.toLowerCase());
    expect(labels).toEqual(expect.arrayContaining(["sweating", "dyspnoea", "syncope"]));
  });

  it("already-present associated features are dropped from the prompt", () => {
    const input = cpInput({
      ros: [
        {
          symptomCode: "dyspnoea",
          symptomDisplay: "dyspnoea",
          system: "respiratory",
          status: "present",
        },
      ],
    });
    const out = mapAssociations(input, buildFeatureIndex(input), [CP_MAP]);
    const labels = out[0].expects!.map((e) => e.label.toLowerCase());
    expect(labels).not.toContain("dyspnoea");
  });
});

describe("mapExpectedSigns", () => {
  it("chest pain → expected exam sign with discriminator", () => {
    const input = cpInput();
    const out = mapExpectedSigns(input, buildFeatureIndex(input), [CP_MAP]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("expected-sign");
    expect(out[0].expects![0].label).toContain("BP in both arms");
    expect(out[0].expects![0].why).toContain("Aortic dissection");
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run tests/clerkship/agent/maps.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/clerkship/agent/reducers/maps.ts
import type {
  AgentInput,
  ExpectItem,
  FeatureIndex,
  Insight,
  ReasoningMap,
} from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";

export function matchedMaps(idx: FeatureIndex, maps: ReasoningMap[]): ReasoningMap[] {
  return maps.filter((m) => m.triggerCodes.some((c) => idx.complaintCodes.has(c)));
}

export function mapAssociations(
  _input: AgentInput,
  idx: FeatureIndex,
  maps: ReasoningMap[],
): Insight[] {
  const out: Insight[] = [];
  for (const m of matchedMaps(idx, maps)) {
    const expects: ExpectItem[] = m.associated
      .filter((a) => !idx.presentDisplays.has(normalizeFeature(a)))
      .map((a) => ({ label: a.replace(/[«»]/g, ""), area: "ros" as const }));
    if (!expects.length) continue;
    out.push({
      id: `assoc:${m.code}`,
      kind: "association",
      severity: "info",
      target: { area: "complaint" },
      message: `With ${m.display.toLowerCase()}, also ask about:`,
      evidence: [{ label: m.display, from: "hpc" }],
      expects,
      sourceRef: {
        pack: "enriched-reasoning-maps",
        entryId: m.code,
        citation: "CSO-approved reasoning maps",
      },
    });
  }
  return out;
}

export function mapExpectedSigns(
  _input: AgentInput,
  idx: FeatureIndex,
  maps: ReasoningMap[],
): Insight[] {
  const out: Insight[] = [];
  for (const m of matchedMaps(idx, maps)) {
    const expects: ExpectItem[] = m.examTargets.map((t) => ({
      label: `${t.sign} (${t.area})`,
      area: "general" as const,
      why: `discriminates ${t.discriminates}`,
    }));
    if (!expects.length) continue;
    out.push({
      id: `expect:${m.code}`,
      kind: "expected-sign",
      severity: "info",
      target: { area: "complaint" },
      message: `With ${m.display.toLowerCase()}, look for on exam:`,
      evidence: [{ label: m.display, from: "hpc" }],
      expects,
      sourceRef: {
        pack: "enriched-reasoning-maps",
        entryId: m.code,
        citation: "CSO-approved reasoning maps",
      },
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run tests/clerkship/agent/maps.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/clerkship/agent/reducers/maps.ts tests/clerkship/agent/maps.test.ts
git commit -m "feat(agent): map reducers — associations + expected signs"
```

---

## Task 7: diagnosis reducer

**Files:**

- Create: `lib/clerkship/agent/reducers/diagnosis.ts`
- Test: `tests/clerkship/agent/diagnosis.test.ts`

`suggestDiagnoses` scores each differential of each matched map against the index:
`score = (#ruleIn present) + (#supportingSymptoms present) + (#riskFactors present) − (#ruleOut present) − (#refutingSymptoms present)`.
Must-not-miss diagnoses are always emitted and **floated to the top** (sorted before others); non-must-not-miss with `score <= 0` are dropped. Evidence = the matched ruleIn / supporting / risk features; discriminators = ruleIn features not yet present.

- [ ] **Step 1: Write the failing test**

```ts
// tests/clerkship/agent/diagnosis.test.ts
import type { AgentInput, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";

const MAP: ReasoningMap = {
  code: "chest_pain",
  display: "Chest pain",
  triggerCodes: ["chest_pain"],
  associated: [],
  redFlags: [],
  examTargets: [],
  combinations: [],
  differential: [
    {
      dx: "Acute coronary syndrome / MI",
      likelihood: "must_not_miss",
      ruleIn: ["Crushing", "Radiation to left arm"],
      ruleOut: ["Reproducible on palpation"],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: ["hypertension"],
    },
    {
      dx: "Musculoskeletal / costochondritis",
      likelihood: "likely",
      ruleIn: ["Reproducible on palpation"],
      ruleOut: ["Crushing"],
      supportingSymptoms: [],
      refutingSymptoms: [],
      riskFactors: [],
    },
  ],
};

const input = (over: Partial<AgentInput> = {}): AgentInput => ({
  hpcItems: [{ symptomCode: "chest_pain", symptomDisplay: "Chest pain", properties: [] }],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: "who_esc",
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
  ...over,
});

describe("suggestDiagnoses", () => {
  it("must-not-miss is emitted even with no supporting features, floated to top", () => {
    const i = input();
    const out = suggestDiagnoses(i, buildFeatureIndex(i), [MAP]);
    expect(out[0].suggests!.dx).toBe("Acute coronary syndrome / MI");
    expect(out[0].suggests!.mustNotMiss).toBe(true);
  });

  it("matched ruleIn + risk → evidence; unmatched ruleIn → discriminators", () => {
    const i = input({
      hpcItems: [
        {
          symptomCode: "chest_pain",
          symptomDisplay: "Chest pain",
          properties: [
            {
              propertyCode: "cp_character",
              propertyDisplay: "Character",
              valueType: "single_select",
              labels: ["Crushing"],
            },
          ],
        },
      ],
      pmhScreen: { hypertension: "yes" },
    });
    const out = suggestDiagnoses(i, buildFeatureIndex(i), [MAP]);
    const acs = out.find((o) => o.suggests!.dx.startsWith("Acute coronary"))!;
    const ev = acs.evidence.map((e) => e.label.toLowerCase());
    expect(ev).toEqual(expect.arrayContaining(["crushing", "hypertension"]));
    const disc = acs.discriminators!.map((d) => d.label.toLowerCase());
    expect(disc).toContain("radiation to left arm");
  });

  it("non-must-not-miss with no support is dropped", () => {
    const i = input();
    const out = suggestDiagnoses(i, buildFeatureIndex(i), [MAP]);
    expect(out.find((o) => o.suggests!.dx.startsWith("Musculoskeletal"))).toBeUndefined();
  });

  it("ruleOut present reduces score", () => {
    const i = input({
      hpcItems: [
        {
          symptomCode: "chest_pain",
          symptomDisplay: "Chest pain",
          properties: [
            {
              propertyCode: "cp_character",
              propertyDisplay: "Character",
              valueType: "single_select",
              labels: ["Reproducible on palpation"],
            },
          ],
        },
      ],
    });
    const out = suggestDiagnoses(i, buildFeatureIndex(i), [MAP]);
    const acs = out.find((o) => o.suggests!.dx.startsWith("Acute coronary"))!;
    // costochondritis (ruleIn matched) should now out-score ACS among non-mnm ordering,
    // but ACS still floats first because it is must-not-miss.
    expect(out[0].suggests!.mustNotMiss).toBe(true);
    expect(acs.score!).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run tests/clerkship/agent/diagnosis.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/clerkship/agent/reducers/diagnosis.ts
import type {
  AgentInput,
  EvidenceItem,
  ExpectItem,
  FeatureIndex,
  Insight,
  MapDifferential,
  ReasoningMap,
} from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";
import { matchedMaps } from "@/lib/clerkship/agent/reducers/maps";

const present = (idx: FeatureIndex, f: string) => idx.presentDisplays.has(normalizeFeature(f));

function scoreDifferential(idx: FeatureIndex, d: MapDifferential) {
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

export function suggestDiagnoses(
  _input: AgentInput,
  idx: FeatureIndex,
  maps: ReasoningMap[],
): Insight[] {
  const insights: Insight[] = [];
  for (const m of matchedMaps(idx, maps)) {
    for (const d of m.differential) {
      const mustNotMiss = d.likelihood === "must_not_miss";
      const s = scoreDifferential(idx, d);
      if (!mustNotMiss && s.score <= 0) continue;

      const evidence: EvidenceItem[] = [
        ...s.ruleInHit.map((f) => ({ label: f.replace(/[«»]/g, ""), from: "hpc" as const })),
        ...s.supportHit.map((x) => ({ label: x.symptom, from: "ros" as const })),
        ...s.riskHit.map((f) => ({ label: f.replace(/[«»]/g, ""), from: "background" as const })),
      ];
      const discriminators: ExpectItem[] = s.ruleInMiss.map((f) => ({
        label: f.replace(/[«»]/g, ""),
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
  // Must-not-miss floated to top, then by score desc, then stable by dx.
  return insights.sort((a, b) => {
    const am = a.suggests?.mustNotMiss ? 1 : 0;
    const bm = b.suggests?.mustNotMiss ? 1 : 0;
    if (am !== bm) return bm - am;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run tests/clerkship/agent/diagnosis.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/clerkship/agent/reducers/diagnosis.ts tests/clerkship/agent/diagnosis.test.ts
git commit -m "feat(agent): diagnosis reducer (scored, must-not-miss floated)"
```

---

## Task 8: combination + sign reducers

**Files:**

- Create: `lib/clerkship/agent/reducers/combination.ts`
- Create: `lib/clerkship/agent/reducers/signs.ts`
- Test: `tests/clerkship/agent/combination.test.ts`
- Test: `tests/clerkship/agent/signs.test.ts`

`combinationFlags` fires when ALL `features` of a map combination are present. `incompatibleSigns` / `mustCheckSigns` consume the (empty in Phase 1) packs: with `[]` rules they return `[]`; with a fixture rule they emit when the `when` sign is present.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/clerkship/agent/combination.test.ts
import type { AgentInput, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { combinationFlags } from "@/lib/clerkship/agent/reducers/combination";

const MAP: ReasoningMap = {
  code: "chest_pain",
  display: "Chest pain",
  triggerCodes: ["chest_pain"],
  associated: [],
  redFlags: [],
  examTargets: [],
  differential: [],
  combinations: [
    {
      features: ["Tearing or ripping", "«Unequal pulses»"],
      suggests: "Aortic dissection",
      action: "urgent imaging",
      mustNotMiss: true,
    },
  ],
};
const base = (over: Partial<AgentInput>): AgentInput => ({
  hpcItems: [
    {
      symptomCode: "chest_pain",
      symptomDisplay: "Chest pain",
      properties: over.hpcItems ? [] : [],
    },
  ],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: "who_esc",
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
  ...over,
});

describe("combinationFlags", () => {
  it("partial cluster → no flag", () => {
    const input = base({
      hpcItems: [
        {
          symptomCode: "chest_pain",
          symptomDisplay: "Chest pain",
          properties: [
            {
              propertyCode: "cp_character",
              propertyDisplay: "Character",
              valueType: "single_select",
              labels: ["Tearing or ripping"],
            },
          ],
        },
      ],
    });
    expect(combinationFlags(input, buildFeatureIndex(input), [MAP])).toEqual([]);
  });

  it("full cluster present → red must-not-miss combination flag", () => {
    const input = base({
      hpcItems: [
        {
          symptomCode: "chest_pain",
          symptomDisplay: "Chest pain",
          properties: [
            {
              propertyCode: "cp_character",
              propertyDisplay: "Character",
              valueType: "single_select",
              labels: ["Tearing or ripping"],
            },
          ],
        },
      ],
      examCardiovascular: {
        findings: [
          { code: "unequal_pulses", group: "pulses", display: "Unequal pulses", state: "present" },
        ],
      } as AgentInput["examCardiovascular"],
    });
    const out = combinationFlags(input, buildFeatureIndex(input), [MAP]);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("red");
    expect(out[0].suggests!.dx).toBe("Aortic dissection");
  });
});
```

```ts
// tests/clerkship/agent/signs.test.ts
import type { AgentInput, DependencyRule, IncompatibilityRule } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { incompatibleSigns, mustCheckSigns } from "@/lib/clerkship/agent/reducers/signs";

const base = (over: Partial<AgentInput>): AgentInput => ({
  hpcItems: [],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: "who_esc",
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
  ...over,
});

const withMurmur = base({
  examCardiovascular: {
    findings: [
      { code: "murmur", group: "auscultation", display: "Systolic murmur", state: "present" },
    ],
  } as AgentInput["examCardiovascular"],
});

describe("empty packs", () => {
  it("incompatibleSigns([]) → []", () =>
    expect(incompatibleSigns(withMurmur, buildFeatureIndex(withMurmur), [])).toEqual([]));
  it("mustCheckSigns([]) → []", () =>
    expect(mustCheckSigns(withMurmur, buildFeatureIndex(withMurmur), [])).toEqual([]));
});

describe("mustCheckSigns with a fixture dependency", () => {
  const RULE: DependencyRule = {
    id: "murmur-characterise",
    when: { area: "cardiovascular", sign: "Systolic murmur" },
    mustCheck: [{ area: "cardiovascular", sign: "radiation", why: "localises the lesion" }],
    citation: "TEST FIXTURE",
  };
  it("fires when the trigger sign is present", () => {
    const out = mustCheckSigns(withMurmur, buildFeatureIndex(withMurmur), [RULE]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("must-check");
    expect(out[0].expects![0].label).toBe("radiation");
  });
});

describe("incompatibleSigns with a fixture rule", () => {
  const RULE: IncompatibilityRule = {
    id: "stony-vs-resonant",
    when: { area: "respiratory", sign: "Stony dull" },
    implausible: [{ area: "respiratory", sign: "hyper_resonant" }],
    reason: "mutually exclusive percussion notes",
    citation: "TEST FIXTURE",
  };
  const withStony = base({
    examRespiratory: {
      findings: [{ code: "stony", group: "percussion", display: "Stony dull", state: "present" }],
    } as AgentInput["examRespiratory"],
  });
  it("fires when the trigger sign is present", () => {
    const out = incompatibleSigns(withStony, buildFeatureIndex(withStony), [RULE]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("incompatible");
    expect(out[0].excludes![0].code).toBe("hyper_resonant");
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run tests/clerkship/agent/combination.test.ts tests/clerkship/agent/signs.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```ts
// lib/clerkship/agent/reducers/combination.ts
import type {
  AgentInput,
  EvidenceItem,
  FeatureIndex,
  Insight,
  ReasoningMap,
} from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";
import { matchedMaps } from "@/lib/clerkship/agent/reducers/maps";

export function combinationFlags(
  _input: AgentInput,
  idx: FeatureIndex,
  maps: ReasoningMap[],
): Insight[] {
  const out: Insight[] = [];
  for (const m of matchedMaps(idx, maps)) {
    for (const c of m.combinations ?? []) {
      const allPresent = c.features.every((f) => idx.presentDisplays.has(normalizeFeature(f)));
      if (!allPresent) continue;
      const evidence: EvidenceItem[] = c.features.map(
        (f) =>
          idx.provenance.get(normalizeFeature(f)) ?? { label: f.replace(/[«»]/g, ""), from: "hpc" },
      );
      out.push({
        id: `combo:${m.code}:${normalizeFeature(c.suggests)}`,
        kind: "combination",
        severity: c.mustNotMiss ? "red" : "amber",
        target: { area: "complaint" },
        message: `${c.suggests}${c.action ? ` — ${c.action}` : ""}`,
        evidence,
        suggests: { dx: c.suggests, mustNotMiss: c.mustNotMiss },
        sourceRef: {
          pack: "enriched-reasoning-maps",
          entryId: m.code,
          citation: "CSO-approved reasoning maps",
        },
      });
    }
  }
  return out;
}
```

```ts
// lib/clerkship/agent/reducers/signs.ts
import type {
  AgentInput,
  DependencyRule,
  ExcludeItem,
  ExpectItem,
  FeatureIndex,
  IncompatibilityRule,
  Insight,
} from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";

export function mustCheckSigns(
  _input: AgentInput,
  idx: FeatureIndex,
  rules: DependencyRule[],
): Insight[] {
  const out: Insight[] = [];
  for (const r of rules) {
    if (!idx.presentDisplays.has(normalizeFeature(r.when.sign))) continue;
    const expects: ExpectItem[] = r.mustCheck.map((c) => ({
      label: c.sign,
      area: c.area,
      why: c.why,
    }));
    out.push({
      id: `mustcheck:${r.id}`,
      kind: "must-check",
      severity: "amber",
      target: { area: r.when.area, field: r.when.sign },
      message: `${r.when.sign} present — also characterise:`,
      evidence: [
        idx.provenance.get(normalizeFeature(r.when.sign)) ?? { label: r.when.sign, from: "exam" },
      ],
      expects,
      sourceRef: { pack: "sign-dependencies", entryId: r.id, citation: r.citation },
    });
  }
  return out;
}

export function incompatibleSigns(
  _input: AgentInput,
  idx: FeatureIndex,
  rules: IncompatibilityRule[],
): Insight[] {
  const out: Insight[] = [];
  for (const r of rules) {
    if (!idx.presentDisplays.has(normalizeFeature(r.when.sign))) continue;
    const excludes: ExcludeItem[] = r.implausible.map((x) => ({
      label: x.sign,
      area: x.area,
      code: x.sign,
      reason: r.reason,
    }));
    out.push({
      id: `incompat:${r.id}`,
      kind: "incompatible",
      severity: "info",
      target: { area: r.when.area, field: r.when.sign },
      message: r.reason,
      evidence: [
        idx.provenance.get(normalizeFeature(r.when.sign)) ?? { label: r.when.sign, from: "exam" },
      ],
      excludes,
      sourceRef: { pack: "sign-incompatibilities", entryId: r.id, citation: r.citation },
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run tests/clerkship/agent/combination.test.ts tests/clerkship/agent/signs.test.ts`
Expected: PASS (combination 2, signs 4).

- [ ] **Step 5: Commit**

```bash
git add lib/clerkship/agent/reducers/combination.ts lib/clerkship/agent/reducers/signs.ts tests/clerkship/agent/combination.test.ts tests/clerkship/agent/signs.test.ts
git commit -m "feat(agent): combination + incompatible/must-check reducers"
```

---

## Task 9: engine orchestration

**Files:**

- Create: `lib/clerkship/agent/engine.ts`
- Test: `tests/clerkship/agent/engine.test.ts`

`runClerkshipAgent(input, packs, config)`: if `!config.enabled` → `{ insights: [] }`. Otherwise build the index, run each reducer gated by `config.activePacks`, concat, and sort red→amber→info (must-not-miss diagnoses kept in their reducer order within the diagnosis group). Returns `{ insights }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/clerkship/agent/engine.test.ts
import type { AgentConfig, AgentInput } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { runClerkshipAgent } from "@/lib/clerkship/agent/engine";
import { loadAgentPacks } from "@/lib/clerkship/agent/packs";

const ON: AgentConfig = {
  enabled: true,
  activePacks: { maps: true, vitalsEscalation: true, incompatibilities: true, dependencies: true },
};

const cp = (over: Partial<AgentInput> = {}): AgentInput => ({
  hpcItems: [{ symptomCode: "chest_pain", symptomDisplay: "Chest pain", properties: [] }],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: "who_esc",
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
  ...over,
});

describe("runClerkshipAgent", () => {
  it("disabled → no insights", () => {
    expect(runClerkshipAgent(cp(), loadAgentPacks(), { ...ON, enabled: false }).insights).toEqual(
      [],
    );
  });

  it("chest pain (real maps) → association + expected-sign + diagnosis insights", () => {
    const report = runClerkshipAgent(cp(), loadAgentPacks(), ON);
    const kinds = new Set(report.insights.map((i) => i.kind));
    expect(kinds.has("association")).toBe(true);
    expect(kinds.has("expected-sign")).toBe(true);
    expect(kinds.has("diagnosis")).toBe(true);
  });

  it("every insight carries a sourceRef (honesty/traceability)", () => {
    const report = runClerkshipAgent(cp(), loadAgentPacks(), ON);
    expect(report.insights.every((i) => i.sourceRef && i.sourceRef.entryId)).toBe(true);
  });

  it("red insights sort before info insights", () => {
    const report = runClerkshipAgent(cp(), loadAgentPacks(), ON);
    const order = { red: 0, amber: 1, info: 2 } as const;
    for (let k = 1; k < report.insights.length; k++) {
      expect(order[report.insights[k - 1].severity]).toBeLessThanOrEqual(
        order[report.insights[k].severity],
      );
    }
  });

  it("maps pack disabled → no map-derived insights", () => {
    const report = runClerkshipAgent(cp(), loadAgentPacks(), {
      ...ON,
      activePacks: { ...ON.activePacks, maps: false },
    });
    expect(report.insights.find((i) => i.kind === "diagnosis")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run tests/clerkship/agent/engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/clerkship/agent/engine.ts
/**
 * Clerkship agent — orchestration. Pure + client-safe. Decision-support only:
 * runs each reducer over a present-only feature index, gated by config; returns
 * sorted insights. Never autonomous; every insight carries a cited sourceRef.
 */
import type {
  AgentConfig,
  AgentInput,
  AgentPacks,
  AgentReport,
  Insight,
  Severity,
} from "@/lib/clerkship/agent/types";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { combinationFlags } from "@/lib/clerkship/agent/reducers/combination";
import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";
import { mapAssociations, mapExpectedSigns } from "@/lib/clerkship/agent/reducers/maps";
import { incompatibleSigns, mustCheckSigns } from "@/lib/clerkship/agent/reducers/signs";
import { vitalFlags } from "@/lib/clerkship/agent/reducers/vitals";

const SEV_ORDER: Record<Severity, number> = { red: 0, amber: 1, info: 2 };

export function runClerkshipAgent(
  input: AgentInput,
  packs: AgentPacks,
  config: AgentConfig,
): AgentReport {
  if (!config.enabled) return { insights: [] };
  const idx = buildFeatureIndex(input);
  const insights: Insight[] = [];

  if (config.activePacks.maps) {
    insights.push(...mapAssociations(input, idx, packs.maps));
    insights.push(...mapExpectedSigns(input, idx, packs.maps));
    insights.push(...combinationFlags(input, idx, packs.maps));
    insights.push(...suggestDiagnoses(input, idx, packs.maps));
  }
  if (config.activePacks.vitalsEscalation)
    insights.push(...vitalFlags(input, idx, packs.vitalsEscalation));
  if (config.activePacks.dependencies)
    insights.push(...mustCheckSigns(input, idx, packs.dependencies));
  if (config.activePacks.incompatibilities)
    insights.push(...incompatibleSigns(input, idx, packs.incompatibilities));

  // Stable sort by severity (red → amber → info); reducers already order within kind.
  const sorted = insights
    .map((ins, i) => ({ ins, i }))
    .sort((a, b) => {
      const s = SEV_ORDER[a.ins.severity] - SEV_ORDER[b.ins.severity];
      return s !== 0 ? s : a.i - b.i;
    });
  return { insights: sorted.map((x) => x.ins) };
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `npx vitest run tests/clerkship/agent/engine.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/clerkship/agent/engine.ts tests/clerkship/agent/engine.test.ts
git commit -m "feat(agent): engine orchestration (config-gated, sorted insights)"
```

---

## Task 10: full gauntlet + barrel

**Files:**

- Create: `lib/clerkship/agent/index.ts` (barrel)

- [ ] **Step 1: Write the barrel**

```ts
// lib/clerkship/agent/index.ts
export * from "@/lib/clerkship/agent/types";
export { runClerkshipAgent } from "@/lib/clerkship/agent/engine";
export { loadAgentPacks } from "@/lib/clerkship/agent/packs";
export { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
```

- [ ] **Step 2: Run the full gauntlet**

Run: `rm -rf .next && npm run typecheck && npm run lint && npm run test`
Expected: typecheck PASS, lint 0 errors, all tests PASS (the 6 pre-existing `findings` useMemo warnings in exam components are expected and unrelated).

Fix any failures at their root (do not weaken tests). Common issues:

- JSON import typing → confirm `resolveJsonModule` in tsconfig.
- A structured exam type lacking a `findings` field → the optional-chained `exam?.findings` in `feature-index.ts` handles it; no change needed.

- [ ] **Step 3: Commit**

```bash
git add lib/clerkship/agent/index.ts
git commit -m "feat(agent): barrel export + Phase 1A gauntlet green"
```

---

## Self-review (done while writing)

- **Spec coverage:** Insight model (Task 1) ✓; association/expected-sign (Task 6) ✓; combination (Task 8) ✓; incompatible + must-check (Task 8) ✓; vital-flag urgency/emergency (Task 5) ✓; diagnosis ranked + must-not-miss-floated (Task 7) ✓; cited packs reuse + empty new packs (Task 4) ✓; config gating (Task 9) ✓; honesty present-only + sourceRef-mandatory (Tasks 3, 9) ✓. **Deferred to Part 1B (UI):** the `CLERKSHIP_AGENT_LIVE` + per-pack signed flags in `lib/encounter/feature.ts`, the page → form prop wiring, the inline nudges/safety strip/Assessment tab, persistence of committed dx, and the CI pack-code-existence test (it asserts pack codes against catalogs — meaningful only once packs have content, so it lands with the first sourced pack in Part 1B/Phase 2).
- **Placeholder scan:** none — every step has real code + a runnable command.
- **Type consistency:** reducer signatures all `(input, idx, rules|maps) → Insight[]`; `matchedMaps` defined once in `maps.ts` and reused by `diagnosis.ts` + `combination.ts`; `loadAgentPacks` / `runClerkshipAgent` / `buildFeatureIndex` names consistent across tasks + barrel.

## Next plan (Part 1B — UI integration, not in this document)

Server-only flags + `clerkshipAgentConfig()` in `feature.ts`; page passes `agentConfig` prop; form runs `runClerkshipAgent` in a `useMemo`; render the safety strip (red `vital-flag` + must-not-miss `combination`), inline `association`/`expected-sign` nudges in the Complaint step, `must-check`/`incompatible` nudges in the active exam card, and the 3-section **Assessment tab** (new 5th tab) that commits working diagnoses → re-introduced `summary` + `differential` in `FormState`/`buildClerkshipInput` → `encounter_diagnoses`. Built on exam-kit + motion utilities. Then the pack-code-existence CI test.
