import type { AirwayFindingSet } from "@/lib/resus/airway";
import type { BreathingFindingSet } from "@/lib/resus/breathing";
import type { CirculationFindingSet } from "@/lib/resus/circulation";
import type { DisabilityFindingSet } from "@/lib/resus/disability";
import type { ExposureFindingSet } from "@/lib/resus/exposure";
import type { PatientContextFlags, StepLocalToggles } from "@/lib/resus/model";
import type { LegacyContexts, V2ContextInput } from "@/lib/resus/survey/context";
import type { AbcdeLetter } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { triggeredActions as airwayTriggered, classifyAirway } from "@/lib/resus/airway";
import { triggeredActions as breathingTriggered, classifyBreathing } from "@/lib/resus/breathing";
import {
  triggeredActions as circulationTriggered,
  classifyCirculation,
  identifyShockType,
} from "@/lib/resus/circulation";
import {
  classifyDisability,
  triggeredActions as disabilityTriggered,
  identifyNeuroSyndrome,
} from "@/lib/resus/disability";
import {
  classifyExposure,
  triggeredActions as exposureTriggered,
  identifyExposureDiagnosis,
} from "@/lib/resus/exposure";
import { legacyStepContext } from "@/lib/resus/survey/context";
import { ABCDE_LETTERS } from "@/lib/resus/types";
import { v2 } from "./survey-fixtures";

/**
 * GATE A §10 item 2 — per-step expressibility (SV-EQ-01..04). Every legacy
 * `context` combination of every step (all 2^n, the arrest state and D's
 * derived abcAbnormal included) is reproduced EXACTLY by some v2 input, and the
 * signed engines give identical output for the legacy (sparse) context and the
 * v2 one. Cross-step joint combinations are limited only by the signed
 * co-variances — see equivalence-covariance.test.ts.
 */

type Ctx = Record<string, boolean>;
type Witness = (i: V2ContextInput) => V2ContextInput;

const flag =
  (over: Partial<PatientContextFlags>): Witness =>
  (i) => ({ ...i, flags: { ...i.flags, ...over } });
const local =
  (k: keyof StepLocalToggles): Witness =>
  (i) => ({ ...i, local: { ...i.local, [k]: true } });
const arrest: Witness = (i) => ({ ...i, inArrest: true });
const abcAbnormal: Witness = (i) => ({ ...i, abcAbnormal: true });

/** One v2 input per legacy key — the mapped type fails to compile if a key is missed. */
const WITNESS: { [S in AbcdeLetter]: Record<keyof LegacyContexts[S], Witness> } = {
  A: {
    trauma: flag({ trauma: true }),
    allergenTrigger: flag({ allergenTrigger: true }),
    noSignsOfLife: arrest,
    gagPresent: local("gagPresent"),
  },
  B: {
    trauma: flag({ chestTrauma: true }),
    allergenTrigger: flag({ allergenTrigger: true }),
    knownAsthma: flag({ knownAsthma: true }),
    copdRisk: flag({ copdRisk: true }),
    peSuspected: flag({ peSuspected: true }),
    noSignsOfLife: arrest,
  },
  C: {
    trauma: flag({ trauma: true }),
    activeBleeding: flag({ activeBleeding: true }),
    febrileChild: flag({ febrileChild: true }),
    pregnancyPossible: flag({ pregnancy: "possible" }),
    spinalInjury: flag({ spinalInjury: true }),
    allergenTrigger: flag({ allergenTrigger: true }),
    headInjury: flag({ headInjury: true }),
    noPulse: arrest,
  },
  D: {
    opioidsSuspected: flag({ opioidsSuspected: true }),
    lowRespRate: local("lowRespRate"),
    pregnancyPostpartum: flag({ pregnancy: "confirmed" }),
    headInjury: flag({ headInjury: true }),
    alcoholMalnourished: flag({ alcoholMalnourished: true }),
    feverMeningism: flag({ feverMeningism: true }),
    abcAbnormal,
    noPulse: arrest,
  },
  E: {
    trauma: flag({ trauma: true }),
    exposureEnvironment: flag({ environmentalExposure: true }),
    serotonergicOrNeuroleptic: flag({ serotonergicOrNeuroleptic: true }),
    notRecovered: local("notRecovered"),
    noPulse: arrest,
  },
};

/** The step's legacy keys, straight from the mapping (SV-CTX-22 pins them). */
const keysOf = (step: AbcdeLetter) => Object.keys(legacyStepContext(step, v2()));

/** Every true/false assignment of `keys` (2^n). */
const combos = (keys: readonly string[]): Ctx[] =>
  Array.from({ length: 2 ** keys.length }, (_, m) =>
    Object.fromEntries(keys.map((k, i) => [k, ((m >> i) & 1) === 1])),
  );

/** The v2 input that reproduces `combo` on `step`: apply each true key's witness. */
function witnessFor(step: AbcdeLetter, combo: Ctx): V2ContextInput {
  const table = WITNESS[step] as Record<string, Witness>;
  return Object.entries(combo)
    .filter(([, on]) => on)
    .reduce((input, [k]) => table[k]!(input), v2());
}

/** A legacy panel's context: only the toggled-on keys, the rest absent. */
const sparse = (combo: Ctx): Ctx => Object.fromEntries(Object.entries(combo).filter(([, v]) => v));

describe("SV-EQ-01 — the witness table covers exactly each step's legacy keys", () => {
  it.each(ABCDE_LETTERS)("SV-EQ-01: step %s", (step) => {
    expect(Object.keys(WITNESS[step]).sort()).toEqual(keysOf(step).sort());
  });
});

describe("SV-EQ-02 — every legacy context combination is expressible from v2 inputs", () => {
  // Patient / step-local keys × the arrest state (× D's derived abcAbnormal).
  const SIZES = { A: 2 ** 3 * 2, B: 2 ** 5 * 2, C: 2 ** 7 * 2, D: 2 ** 6 * 2 * 2, E: 2 ** 4 * 2 };
  it.each(ABCDE_LETTERS)("SV-EQ-02: step %s — all 2^n combinations, reproduced exactly", (step) => {
    const all = combos(keysOf(step));
    expect(all).toHaveLength(SIZES[step]);
    const seen = new Set<string>();
    for (const combo of all) {
      const got = legacyStepContext(step, witnessFor(step, combo));
      expect(got, JSON.stringify(combo)).toEqual(combo);
      seen.add(JSON.stringify(got));
    }
    expect(seen.size).toBe(SIZES[step]);
  });
});

/* ─── engine identity ─────────────────────────────────────────────────── */

type Run = (context: Ctx) => unknown;

/** Finding sets chosen to reach every context-reading branch of each engine. */
const A_FS: Omit<AirwayFindingSet, "context">[] = [
  { patency: null, present: [], difficulty: [] },
  { patency: "patent_talking", present: [], difficulty: [] },
  { patency: null, present: ["gcs_le8"], difficulty: [] },
  { patency: null, present: ["swelling_face"], difficulty: [] },
  { patency: null, present: ["snoring"], difficulty: [] },
  { patency: "apnoeic", present: [], difficulty: [] },
  { patency: "completely_obstructed", present: ["foreign_body"], difficulty: ["lemon"] },
  { patency: null, present: ["drooling_tripod", "stridor_inspiratory"], difficulty: [] },
];
const B_FS: Omit<BreathingFindingSet, "context">[] = [
  { state: null, present: [] },
  { state: "adequate", present: [] },
  { state: "distress_compensating", present: [] },
  { state: null, present: ["wheeze"] },
  { state: null, present: ["silent_chest"] },
  { state: null, present: ["reduced_breath_sounds", "raised_jvp"] },
  { state: null, present: ["stony_dull"] },
  { state: null, present: ["wheeze", "resp_acidosis"] },
];
const C_FS: Omit<CirculationFindingSet, "context">[] = [
  { state: null, present: [] },
  { state: "well_perfused", present: [] },
  { state: "compensated_shock", present: [] },
  { state: null, present: ["bradycardia", "warm_peripheries"] },
  { state: null, present: ["hypotension", "external_haemorrhage"] },
  { state: null, present: ["fever_rash", "tachycardia"] },
  { state: null, present: ["absent_peripheral_pulses"] },
];
const D_EMPTY: Omit<DisabilityFindingSet, "context"> = {
  state: null,
  gcs: null,
  avpu: null,
  glucoseMmol: null,
  present: [],
};
const D_FS: Omit<DisabilityFindingSet, "context">[] = [
  D_EMPTY,
  { ...D_EMPTY, state: "alert" },
  { ...D_EMPTY, gcs: { eye: 2, verbal: 2, motor: 3 } },
  { ...D_EMPTY, avpu: "V" },
  { ...D_EMPTY, state: "alert", present: ["pinpoint_pupils"] },
  { ...D_EMPTY, present: ["active_seizure"] },
  { ...D_EMPTY, avpu: "V", present: ["hypoglycaemia"] },
];
const E_FS: Omit<ExposureFindingSet, "context">[] = [
  { state: null, present: [], coreTempC: null },
  { state: "no_new_critical_finding", present: [], coreTempC: 36.8 },
  { state: null, present: [], coreTempC: 31 },
  { state: null, present: ["non_blanching_rash"], coreTempC: null },
];

/** classify + triggeredActions (+ the step's identify*) over one fixture. */
const ENGINES: Record<AbcdeLetter, Run[]> = {
  A: A_FS.map((f) => (context) => {
    const fs: AirwayFindingSet = { ...f, context };
    return [classifyAirway(fs), airwayTriggered(fs)];
  }),
  B: B_FS.map((f) => (context) => {
    const fs: BreathingFindingSet = { ...f, context };
    return [classifyBreathing(fs), breathingTriggered(fs)];
  }),
  C: C_FS.map((f) => (context) => {
    const fs: CirculationFindingSet = { ...f, context };
    return [classifyCirculation(fs), circulationTriggered(fs), identifyShockType(fs)];
  }),
  D: D_FS.map((f) => (context) => {
    const fs: DisabilityFindingSet = { ...f, context };
    return [classifyDisability(fs), disabilityTriggered(fs), identifyNeuroSyndrome(fs)];
  }),
  E: E_FS.map((f) => (context) => {
    const fs: ExposureFindingSet = { ...f, context };
    return [classifyExposure(fs), exposureTriggered(fs), identifyExposureDiagnosis(fs)];
  }),
};

describe("SV-EQ-03 — identical engine output for every reproduced context", () => {
  it.each(ABCDE_LETTERS)("SV-EQ-03: step %s — legacy (sparse) vs v2 context", (step) => {
    for (const combo of combos(keysOf(step))) {
      const ctxV2 = legacyStepContext(step, witnessFor(step, combo)) as Ctx;
      for (const [n, run] of ENGINES[step].entries())
        expect(run(ctxV2), `${step} fixture ${n} ${JSON.stringify(combo)}`).toEqual(
          run(sparse(combo)),
        );
    }
  });
});

describe("SV-EQ-04 — the fixtures are not vacuous: each key the engine reads changes an output", () => {
  /** Legacy keys that no signed engine reads (v2 still carries them, exactly as v1 did). */
  const UNREAD: Record<AbcdeLetter, string[]> = {
    A: [],
    B: [],
    C: [],
    D: ["headInjury"],
    E: ["exposureEnvironment", "serotonergicOrNeuroleptic"],
  };
  it.each(ABCDE_LETTERS)("SV-EQ-04: step %s", (step) => {
    const base = legacyStepContext(step, v2()) as Ctx;
    const moves = (k: string) =>
      ENGINES[step].some(
        (run) => JSON.stringify(run({ ...base, [k]: true })) !== JSON.stringify(run(base)),
      );
    expect(keysOf(step).filter((k) => !moves(k))).toEqual(UNREAD[step]);
  });
});
