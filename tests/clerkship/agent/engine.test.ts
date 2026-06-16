import type { AgentConfig, AgentInput, Severity } from "@/lib/clerkship/agent/types";
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
});
