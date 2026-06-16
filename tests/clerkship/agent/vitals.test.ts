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
    expect(out[0]!.severity).toBe("amber");
    expect(out[0]!.message).toContain("urgency");
    expect(out[0]!.kind).toBe("vital-flag");
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
    expect(out[0]!.severity).toBe("red");
    expect(out[0]!.message).toContain("emergency");
    expect(out[0]!.evidence.some((e) => e.label.toLowerCase() === "headache")).toBe(true);
  });

  it("BP below threshold → no insight", () => {
    const input = base({ examVitals: { sbp: 150, dbp: 95 } });
    expect(vitalFlags(input, buildFeatureIndex(input), [BP_RULE])).toEqual([]);
  });
});
