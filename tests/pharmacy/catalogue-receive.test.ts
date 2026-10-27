import { describe, expect, it } from "vitest";

import {
  packsToUnits,
  registrationState,
  rescanTarget,
} from "@/lib/pharmacy/shared-catalogue/receive";

describe("receiving against the catalogue (Step 7)", () => {
  it("S21: packs convert only by whole contents", () => {
    expect(packsToUnits(20, 100)).toBe(2000);
    expect(packsToUnits(0, 100)).toBe(0);
    expect(packsToUnits(20, null)).toBeNull();
    expect(packsToUnits(20, 2.5)).toBeNull();
    expect(packsToUnits(1.5, 10)).toBeNull();
  });

  it("S22: a rescan adds to the newest line of the same product and batch", () => {
    const lines = [
      { lineNo: 1, productId: "a", batchNumber: "B1" },
      { lineNo: 2, productId: "b", batchNumber: "B1" },
      { lineNo: 3, productId: "a", batchNumber: "b1" },
      { lineNo: 4, productId: "a", batchNumber: "B2" },
    ];
    expect(rescanTarget(lines, "a", "B1")).toBe(3);
    expect(rescanTarget(lines, "a", "B9")).toBeNull();
    expect(rescanTarget(lines, "a", null)).toBe(4);
    expect(rescanTarget(lines, "c", null)).toBeNull();
  });

  it("S23: lapsed, not found or none on the pack needs a reason; unknown asks nothing", () => {
    const r = (ndaState: string | null, answer: string | null = null, n: string | null = null) =>
      registrationState({ ndaState, answer, registrationNumber: n });
    expect(r("lapsed")).toBe("lapsed");
    expect(r("not_found")).toBe("none");
    expect(r(null, "none_on_pack")).toBe("none");
    expect(r(null, "none_on_pack", "NDA/123")).toBeNull();
    expect(r("unknown")).toBeNull();
    expect(r("registered")).toBeNull();
  });
});
