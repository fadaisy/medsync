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

  it("incompatibilities + dependencies packs ship empty until sourced (Phase 2)", () => {
    const packs = loadAgentPacks();
    expect(packs.incompatibilities).toEqual([]);
    expect(packs.dependencies).toEqual([]);
  });

  it("vitals-escalation pack is sourced (BP high/low present, cited)", () => {
    const packs = loadAgentPacks();
    expect(packs.vitalsEscalation.length).toBeGreaterThan(0);
    const bpHigh = packs.vitalsEscalation.find((r) => r.id === "bp-severe-high");
    expect(bpHigh).toBeTruthy();
    expect(bpHigh!.trigger).toMatchObject({ metric: "bp", systolic: 180, diastolic: 110 });
    expect(bpHigh!.escalation.tier.severity).toBe("red");
    expect(packs.vitalsEscalation.every((r) => r.citation.length > 0)).toBe(true);
  });
});
