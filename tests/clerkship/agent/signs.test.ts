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
    expect(out[0]!.kind).toBe("must-check");
    expect(out[0]!.expects![0]!.label).toBe("radiation");
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
    expect(out[0]!.kind).toBe("incompatible");
    expect(out[0]!.excludes![0]!.code).toBe("hyper_resonant");
  });
});
