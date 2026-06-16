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
