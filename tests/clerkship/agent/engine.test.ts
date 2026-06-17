import type { AgentConfig, AgentInput, Severity } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { runClerkshipAgent } from "@/lib/clerkship/agent/engine";
import { loadAgentPacks } from "@/lib/clerkship/agent/packs";

const ON: AgentConfig = {
  enabled: true,
  activePacks: {
    maps: true,
    vitalsEscalation: true,
    incompatibilities: true,
    dependencies: true,
    ddxRanking: false,
  },
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
    const order: Record<Severity, number> = { red: 0, amber: 1, info: 2 };
    for (let k = 1; k < report.insights.length; k++) {
      expect(order[report.insights[k - 1]!.severity]).toBeLessThanOrEqual(
        order[report.insights[k]!.severity],
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

  it("real vitals pack: BP 204/112 alone → amber urgency; + headache → red emergency", () => {
    const baseV: AgentInput = {
      hpcItems: [],
      ros: [],
      pmhItems: [],
      pmhScreen: {},
      examVitals: { sbp: 204, dbp: 112 },
      bpStandard: "who_esc",
      examGeneralFindings: [],
      examRespiratory: {},
      examCardiovascular: {},
      examAbdominal: {},
      examNeurological: {},
      examMusculoskeletal: {},
      examEndoVascularFoot: {},
    };
    const alone = runClerkshipAgent(baseV, loadAgentPacks(), ON).insights.filter(
      (i) => i.kind === "vital-flag",
    );
    expect(alone).toHaveLength(1);
    expect(alone[0]!.severity).toBe("amber");

    const withHeadache = runClerkshipAgent(
      {
        ...baseV,
        ros: [
          {
            symptomCode: "headache",
            symptomDisplay: "Headache",
            system: "neurological",
            status: "present",
          },
        ],
      },
      loadAgentPacks(),
      ON,
    ).insights.filter((i) => i.kind === "vital-flag");
    expect(withHeadache).toHaveLength(1);
    expect(withHeadache[0]!.severity).toBe("red");
  });

  it("real vitals pack: glucose 2.5 + bedside 'confused' consciousness chip → red emergency", () => {
    const input: AgentInput = {
      hpcItems: [],
      ros: [],
      pmhItems: [],
      pmhScreen: {},
      examVitals: { glucose: 2.5 },
      bpStandard: "who_esc",
      examGeneralFindings: [
        {
          code: "consciousness",
          group: "general",
          display: "Consciousness",
          state: "present",
          values: ["confused"],
        },
      ],
      examRespiratory: {},
      examCardiovascular: {},
      examAbdominal: {},
      examNeurological: {},
      examMusculoskeletal: {},
      examEndoVascularFoot: {},
    };
    const flags = runClerkshipAgent(input, loadAgentPacks(), ON).insights.filter(
      (i) => i.kind === "vital-flag",
    );
    expect(flags.some((f) => f.severity === "red")).toBe(true);
  });

  it("real dependency pack: a murmur (structured) → must-check insight", () => {
    const input: AgentInput = {
      hpcItems: [],
      ros: [],
      pmhItems: [],
      pmhScreen: {},
      examVitals: {},
      bpStandard: "who_esc",
      examGeneralFindings: [],
      examRespiratory: {},
      examCardiovascular: {
        murmurs: [{ id: "m1", timing: "pansystolic" }],
      } as AgentInput["examCardiovascular"],
      examAbdominal: {},
      examNeurological: {},
      examMusculoskeletal: {},
      examEndoVascularFoot: {},
    };
    const report = runClerkshipAgent(input, loadAgentPacks(), ON);
    const mc = report.insights.find((i) => i.kind === "must-check");
    expect(mc).toBeTruthy();
    expect(mc!.expects?.length).toBeGreaterThan(0);
  });

  it("dependencies pack disabled → no must-check insights", () => {
    const input: AgentInput = {
      hpcItems: [],
      ros: [],
      pmhItems: [],
      pmhScreen: {},
      examVitals: {},
      bpStandard: "who_esc",
      examGeneralFindings: [],
      examRespiratory: {},
      examCardiovascular: {
        murmurs: [{ id: "m1", timing: "pansystolic" }],
      } as AgentInput["examCardiovascular"],
      examAbdominal: {},
      examNeurological: {},
      examMusculoskeletal: {},
      examEndoVascularFoot: {},
    };
    const report = runClerkshipAgent(input, loadAgentPacks(), {
      ...ON,
      activePacks: { ...ON.activePacks, dependencies: false },
    });
    expect(report.insights.find((i) => i.kind === "must-check")).toBeUndefined();
  });

  it("vitalsEscalation pack disabled → no vital-flag insights", () => {
    const report = runClerkshipAgent(
      {
        hpcItems: [],
        ros: [],
        pmhItems: [],
        pmhScreen: {},
        examVitals: { sbp: 204, dbp: 112 },
        bpStandard: "who_esc",
        examGeneralFindings: [],
        examRespiratory: {},
        examCardiovascular: {},
        examAbdominal: {},
        examNeurological: {},
        examMusculoskeletal: {},
        examEndoVascularFoot: {},
      },
      loadAgentPacks(),
      { ...ON, activePacks: { ...ON.activePacks, vitalsEscalation: false } },
    );
    expect(report.insights.find((i) => i.kind === "vital-flag")).toBeUndefined();
  });
});
