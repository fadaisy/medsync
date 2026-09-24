import type { PatientContextFlags as Ctx, StepLocalToggles as Loc } from "@/lib/resus/model";
import type { AbcdeLetter } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import * as airway from "@/lib/resus/airway";
import * as breathing from "@/lib/resus/breathing";
import * as circulation from "@/lib/resus/circulation";
import * as disability from "@/lib/resus/disability";
import * as exposure from "@/lib/resus/exposure";
import { EMPTY_CONTEXT, EMPTY_LOCAL } from "@/lib/resus/model";
import * as airwayCat from "@/lib/resus/reference/airway-catalog";
import * as breathingCat from "@/lib/resus/reference/breathing-catalog";
import * as circulationCat from "@/lib/resus/reference/circulation-catalog";
import * as disabilityCat from "@/lib/resus/reference/disability-catalog";
import * as exposureCat from "@/lib/resus/reference/exposure-catalog";
import { legacyContexts } from "@/lib/resus/survey/context";
import * as v2 from "@/lib/resus/v2-payloads";

// lib/resus/v2-payloads.ts must write exactly what v1 (app/nurse/resus/actions.ts) writes. v1's
// payload literals are mirrored VERBATIM (that server file pulls in the database); inputs are in
// v1's zod-schema key order, as v1's parsed data.

type In<T extends { context: unknown }> = Omit<T, "context"> & { context?: T["context"] };
type Payload = Record<string, unknown>;

const V1_ASSESSMENT: Record<AbcdeLetter, (input: never) => Payload> = {
  A: (input: In<airway.AirwayFindingSet>) => {
    const findingSet = { ...input, context: input.context ?? {} };
    const state = airway.classifyAirway(findingSet);
    return {
      airway: findingSet,
      airwayState: state,
      label: `Airway findings${state ? ` → ${state.replace(/_/g, " ")}` : ""}`,
      danger:
        state === "completely_obstructed" ||
        state === "apnoeic_arrest" ||
        state === "threatened" ||
        state === "partially_obstructed",
    };
  },
  B: (input: In<breathing.BreathingFindingSet>) => {
    const findingSet = { ...input, context: input.context ?? {} };
    const state = breathing.classifyBreathing(findingSet);
    return {
      breathing: findingSet,
      breathingState: state,
      label: `Breathing findings${state ? ` → ${state.replace(/_/g, " ")}` : ""}`,
      danger: state === "apnoeic" || state === "peri_arrest" || state === "failure_decompensating",
    };
  },
  C: (input: In<circulation.CirculationFindingSet>) => {
    const findingSet = { ...input, context: input.context ?? {} };
    const state = circulation.classifyCirculation(findingSet);
    const shockType = circulation.identifyShockType(findingSet);
    return {
      circulation: findingSet,
      circulatoryState: state,
      shockType,
      label: `Circulation findings${state ? ` → ${state.replace(/_/g, " ")}` : ""}${shockType ? ` (${shockType.replace(/_/g, " ")})` : ""}`,
      danger: state === "arrest" || state === "peri_arrest" || state === "decompensated_shock",
    };
  },
  D: (input: In<disability.DisabilityFindingSet>) => {
    const findingSet = { ...input, context: input.context ?? {} };
    const state = disability.classifyDisability(findingSet);
    const suspectedCause = disability.identifyNeuroSyndrome(findingSet);
    const total = disability.gcsTotal(findingSet.gcs);
    const glucoseMissing = disability.mandatoryGlucoseMissing(findingSet);
    return {
      disability: findingSet,
      neuroState: state,
      suspectedCause,
      gcsTotal: total,
      mandatoryGlucoseMissing: glucoseMissing,
      label: `Disability findings${state ? ` → ${state.replace(/_/g, " ")}` : ""}${total != null ? ` (GCS ${total})` : ""}${glucoseMissing ? " — ⚠ glucose not checked" : ""}`,
      danger:
        state === "raised_icp_herniation" ||
        state === "active_seizure_status" ||
        state === "severe_impairment_coma",
    };
  },
  E: (input: In<exposure.ExposureFindingSet>) => {
    const findingSet = { ...input, context: input.context ?? {} };
    const state = exposure.classifyExposure(findingSet);
    const diagnosis = exposure.identifyExposureDiagnosis(findingSet);
    const stage = exposure.tempStage(findingSet.coreTempC);
    return {
      exposure: findingSet,
      exposureState: state,
      suspectedDiagnosis: diagnosis,
      tempStage: stage,
      label: `Exposure findings${state ? ` → ${state.replace(/_/g, " ")}` : ""}${findingSet.coreTempC != null ? ` (${findingSet.coreTempC} °C)` : ""}`,
      danger: state === "critical_finding" || state === "temperature_extreme",
    };
  },
};

type Cat = { code: string; label: string; tier: number; doseId?: string };
type Lookup = [Record<string, Cat>, (code: string) => Cat | null];
const ACTIONS: Record<AbcdeLetter, Lookup> = {
  A: [airwayCat.AIRWAY_ACTIONS, airwayCat.airwayAction],
  B: [breathingCat.BREATHING_ACTIONS, breathingCat.breathingAction],
  C: [circulationCat.CIRCULATION_ACTIONS, circulationCat.circulationAction],
  D: [disabilityCat.DISABILITY_ACTIONS, disabilityCat.disabilityAction],
  E: [exposureCat.EXPOSURE_ACTIONS, exposureCat.exposureAction],
};
const catalog = (step: AbcdeLetter) => Object.values(ACTIONS[step][0]);

function v1ActionState(step: AbcdeLetter, actionCode: string, state: string, reason?: string) {
  const action = ACTIONS[step][1](actionCode);
  if (!action) return null; // v1: { error: "Unknown … action." }
  const [actionId, label] = ["act-1", `${action.label} — ${state.replace(/_/g, " ")}`];
  if (step === "A" || step === "B") {
    const kind = action.doseId ? "drug" : action.tier === 3 ? "procedure" : "action";
    const doseId = action.doseId ?? null;
    const payload = { actionId, actionCode: action.code, tier: action.tier, state, doseId };
    return { kind, payload: { ...payload, reason: reason ?? null, label } };
  }
  const kind = action.tier === 3 ? "procedure" : "action";
  const payload = { actionId, actionCode: action.code, tier: action.tier, state };
  return { kind, payload: { ...payload, reason: reason ?? null, label } };
}

type S = string | null;
const cx = (f: Partial<Ctx> = {}, inArrest = false, l: Partial<Loc> = {}) => {
  const flags = { ...EMPTY_CONTEXT, ...f };
  return legacyContexts({ flags, inArrest, local: { ...EMPTY_LOCAL, ...l }, abcAbnormal: false });
};
const A = (patency: S, present: string[], context?: object) =>
  context ? { patency, present, difficulty: [], context } : { patency, present, difficulty: [] };
const BC = (state: S, present: string[], context: object) => ({ state, present, context });
const D = (gcs: object | null, avpu: S, glucoseMmol: number | null, extra = {}) => {
  const head = { state: null, gcs, avpu, glucoseMmol, present: [] as string[] };
  return { ...head, ...extra, context: cx().D };
};
const E = (present: string[], coreTempC: number | null, ample: object | null, context: object) => {
  return { state: null, present, coreTempC, ample, context };
};
const seizure = { present: ["active_seizure"], focalOnset: null, seizureDurationMin: 10 };
const cold = cx({ environmentalExposure: true }, false, { notRecovered: true }).E;

const SETS: Record<AbcdeLetter, Payload[]> = {
  A: [
    A(null, [], cx().A),
    A("patent_talking", ["normal_speech"], cx().A),
    A("partially_obstructed", [], cx({ trauma: true }, false, { gagPresent: true }).A),
    A(null, [], cx({}, true).A),
    A("apnoeic", []), // context omitted → {} on both sides
  ],
  B: [
    BC(null, [], cx().B),
    BC("adequate", ["full_sentences"], cx({ knownAsthma: true }).B),
    BC("failure_decompensating", [], cx({ allergenTrigger: true }).B),
  ],
  C: [
    BC(null, [], cx().C),
    BC(null, ["tachycardia"], cx().C),
    BC(null, ["hypotension"], cx({ trauma: true, activeBleeding: true }).C),
  ],
  D: [
    D(null, null, null),
    D({ eye: 4, verbal: 5, motor: 6 }, "A", 6),
    D({ eye: 1, verbal: 1, motor: 2 }, "U", null),
    D({ eye: 2, verbal: 1, motor: 4, intubated: true }, null, null, seizure),
  ],
  E: [
    E([], null, null, cx().E),
    E(["wound"], 36.8, { allergies: ["penicillin"], past: "asthma" }, cx({ trauma: true }).E),
    E(["external_haemorrhage"], 31, null, cold),
  ],
};
const STEPS = Object.keys(SETS) as AbcdeLetter[];
const v1Of = (step: AbcdeLetter, fs: Payload) => V1_ASSESSMENT[step](fs as never);
const CASES = STEPS.flatMap((s) => SETS[s].map((fs, i) => [s, i, fs] as const));

describe("buildAssessmentPayload deep-equals v1's record*Findings payload", () => {
  it.each(CASES)("%s set %i: same object, same JSON bytes", (step, _, fs) => {
    const [got, want] = [v2.buildAssessmentPayload(step, fs), v1Of(step, fs)];
    expect(got).toStrictEqual(want);
    expect(JSON.stringify(got)).toBe(JSON.stringify(want));
  });

  it("the sets reach every label branch: no state, danger, shock type, GCS + ⚠, temperature", () => {
    const hit = (s: AbcdeLetter, f: (p: Payload) => boolean) => SETS[s].some((x) => f(v1Of(s, x)));
    const noState = STEPS.filter((s) => !hit(s, (p) => Object.values(p)[1] === null));
    const noDanger = STEPS.filter((s) => !hit(s, (p) => p.danger === true));
    expect([noState, noDanger]).toEqual([[], []]);
    expect(hit("C", (p) => p.shockType != null)).toBe(true);
    expect(hit("D", (p) => p.mandatoryGlucoseMissing === true && p.gcsTotal != null)).toBe(true);
    expect(hit("E", (p) => p.tempStage != null)).toBe(true);
  });

  it("each step's v2 legacy context has exactly v1's zod context keys, in order", () => {
    const V1_KEYS: Record<AbcdeLetter, string> = {
      A: "trauma allergenTrigger noSignsOfLife gagPresent",
      B: "trauma allergenTrigger knownAsthma copdRisk peSuspected noSignsOfLife",
      C: "trauma activeBleeding febrileChild pregnancyPossible spinalInjury allergenTrigger headInjury noPulse",
      D: "opioidsSuspected lowRespRate pregnancyPostpartum headInjury alcoholMalnourished feverMeningism abcAbnormal noPulse",
      E: "trauma exposureEnvironment serotonergicOrNeuroleptic notRecovered noPulse",
    };
    for (const s of STEPS) expect(Object.keys(cx()[s]).join(" "), s).toBe(V1_KEYS[s]);
  });
});

describe("buildActionStatePayload: kind + payload equal v1's set*ActionState", () => {
  const build = (step: AbcdeLetter, actionCode: string, state = "performed", reason?: string) => {
    const input = { step, actionId: "act-1", actionCode, reason };
    return v2.buildActionStatePayload({ ...input, state: state as v2.ActionState });
  };

  it("every step's v1 action-state vocabulary is ACTION_STATES", () => {
    const mods: Payload[] = [airway, breathing, circulation, disability, exposure];
    const v = mods.flatMap((m) => Object.entries(m).filter(([k]) => k.endsWith("_ACTION_STATES")));
    expect(v.map(([, states]) => states)).toEqual(Array(5).fill(v2.ACTION_STATES));
  });

  it.each(STEPS)("%s: every catalog action × state × reason — same object and bytes", (step) => {
    for (const { code } of catalog(step))
      for (const state of v2.ACTION_STATES)
        for (const reason of [undefined, "no equipment"]) {
          const got = build(step, code, state, reason);
          const want = v1ActionState(step, code, state, reason);
          expect(got, `${step} ${code} ${state}`).toStrictEqual(want);
          expect(JSON.stringify(got)).toBe(JSON.stringify(want));
        }
  });

  it.each(STEPS)("%s: dosed A/B drug, tier 3 procedure, plain action, unknown null", (step) => {
    const dosed = catalog(step).find((a) => a.doseId);
    const tier3 = catalog(step).find((a) => a.tier === 3 && !a.doseId)!;
    const plain = catalog(step).find((a) => a.tier !== 3 && !a.doseId)!;
    if (step === "A" || step === "B") expect(build(step, dosed!.code)?.kind).toBe("drug");
    else expect(dosed).toBeUndefined();
    expect(build(step, tier3.code)?.kind).toBe("procedure");
    expect(build(step, plain.code)?.kind).toBe("action");
    // v1 answers "Unknown … action." for a code outside the step's own catalog.
    const otherStepCode = catalog(step === "A" ? "E" : "A")[0]!.code;
    expect([build(step, "nope"), build(step, otherStepCode)]).toEqual([null, null]);
  });
});

describe("buildAllergyNote equals v1 recordResusAllergies' note", () => {
  it.each([false, true])("nkda %s", (nkda) => {
    const subs = nkda ? [] : ["penicillin", "latex"];
    const label = nkda ? "Allergies: none known (NKDA)" : `Allergies: ${subs.join(", ")}`;
    const want = { allergyCapture: { substances: nkda ? [] : subs, nkda }, label };
    expect(v2.buildAllergyNote(subs, nkda)).toStrictEqual(want);
  });
});
