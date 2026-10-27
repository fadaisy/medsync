import { describe, expect, it } from "vitest";

import { packState, packSummary, pointState, setupView } from "@/lib/pharmacy/workspace-v2/setup";

describe("Set-up read models", () => {
  it("pack state and the signed count", () => {
    const rows = [
      { signed: { id: "1" }, draft: null },
      { signed: null, draft: { id: "2" } },
      { signed: null, draft: null },
      { signed: { id: "3" }, draft: { id: "4" } },
    ];
    expect(rows.map(packState)).toEqual(["signed", "draft", "none", "signed"]);
    expect(packSummary(rows)).toEqual({ signed: 2, total: 4 });
  });

  it("point state follows pointIsLive", () => {
    const d = new Date("2026-10-01T00:00:00Z");
    expect(pointState({ liveAt: d, switchedOffAt: null }).state).toBe("live");
    expect(pointState({ liveAt: d, switchedOffAt: d }).state).toBe("off");
    expect(pointState({ liveAt: null, switchedOffAt: null }).state).toBe("notLive");
  });

  it("refuses a view the viewer lacks: falls back to their first", () => {
    expect(setupView("national", ["packs", "places"])).toBe("packs");
    expect(setupView("places", ["packs", "places"])).toBe("places");
    expect(setupView(undefined, [])).toBeNull();
  });
});
