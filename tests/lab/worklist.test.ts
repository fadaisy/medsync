import { describe, expect, it } from "vitest";

import { summariseWorklist, worklistAgeLabel } from "@/lib/lab-tech/worklist";

describe("summariseWorklist", () => {
  it("counts total + ordered + collected honestly", () => {
    const s = summariseWorklist([
      { status: "ordered" },
      { status: "ordered" },
      { status: "collected" },
    ]);
    expect(s).toEqual({ total: 3, ordered: 2, collected: 1 });
  });

  it("is empty for an empty worklist", () => {
    expect(summariseWorklist([])).toEqual({ total: 0, ordered: 0, collected: 0 });
  });
});

describe("worklistAgeLabel", () => {
  const base = new Date("2026-06-14T12:00:00Z");
  it("shows minutes under an hour", () => {
    expect(worklistAgeLabel(new Date("2026-06-14T11:18:00Z"), base)).toBe("42m");
  });
  it("shows hours + minutes under a day", () => {
    expect(worklistAgeLabel(new Date("2026-06-14T08:25:00Z"), base)).toBe("3h 35m");
  });
  it("shows days + hours beyond a day", () => {
    expect(worklistAgeLabel(new Date("2026-06-12T09:00:00Z"), base)).toBe("2d 3h");
  });
  it("never goes negative (clock skew safe)", () => {
    expect(worklistAgeLabel(new Date("2026-06-14T12:05:00Z"), base)).toBe("0m");
  });
});
