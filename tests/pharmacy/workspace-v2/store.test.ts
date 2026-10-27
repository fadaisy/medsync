import { describe, expect, it } from "vitest";

import { storeFlow, storeTab } from "@/app/pharmacy/store/_components/v2-flow";

const now = new Date("2026-10-27T12:00:00Z");
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("storeTab", () => {
  it("takes a valid tab, reads Month end's form keys, falls back to the first tab", () => {
    const all = () => true;
    expect(storeTab({ tab: "carts" }, all)).toBe("carts");
    expect(storeTab({ tab: "monthEnd", month: "2026-09-01" }, all)).toBe("monthEnd");
    expect(storeTab({ tab: "orders" }, (k) => k === "issues" || k === "expiry")).toBe("issues");
    expect(storeTab({}, () => false)).toBeNull();
  });
});

describe("storeFlow", () => {
  it("counts from the loaders' rows; the only amber note is the carts' own overdue field", () => {
    const steps = storeFlow({
      deliveries: [
        { state: "counting", arrivedAt: day(1) },
        { state: "received", arrivedAt: day(3) },
        { state: "received", arrivedAt: day(9) },
      ],
      issues: {
        requisitions: [{ state: "raised" }, { state: "raised" }, { state: "issued" }],
        toConfirm: [{}, {}, {}],
        places: [{ kind: "store" }, { kind: "dispensing_point" }, { kind: "dispensing_point" }],
      },
      wards: [{ supplyModel: "stocked" }, { supplyModel: "issue_only" }],
      carts: [{ overdue: true }, { overdue: false }],
      now,
    });
    expect(steps.map((s) => s.n)).toEqual([2, 2, 2, 2, 2]);
    expect(steps[0]!.sub).toContain("1 still being counted");
    expect(steps[2]!.sub).toContain("3 issues not yet confirmed");
    expect(steps[3]!.sub).toEqual(["1 keep stock"]);
    expect(steps.flatMap((s) => s.notes ?? [])).toEqual(["1 overdue for a check"]);
  });
  it("a tab the viewer lacks is No data (null) with no link", () => {
    const steps = storeFlow({ deliveries: null, issues: null, wards: null, carts: null, now });
    expect(steps.every((s) => s.n === null && !s.href)).toBe(true);
  });
});
