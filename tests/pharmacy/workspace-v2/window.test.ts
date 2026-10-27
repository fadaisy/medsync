import { describe, expect, it } from "vitest";

import { openGroups, pick, queueGroups } from "@/app/pharmacy/window/_lib/groups";
import { PHWS2_WINDOW } from "@/content/pharmacy-workspace-v2-window";

const row = (key: string, o: Partial<Parameters<typeof queueGroups>[0][number]> = {}) => ({
  key,
  lane: "standard" as const,
  stage: "to_review" as const,
  origin: "window" as const,
  reasons: [] as string[],
  writtenAt: `2026-10-27T0${key.length}:00:00Z`,
  earlier: false,
  ...o,
});

describe("Window queue groups", () => {
  const rows = [
    row("b", { writtenAt: "2026-10-27T09:00:00Z" }),
    row("a", { writtenAt: "2026-10-27T08:00:00Z" }),
    row("old", { writtenAt: "2026-10-25T08:00:00Z", earlier: true }),
    row("q", { stage: "queried" }),
    row("pf", { lane: "pharmacist_first", stage: "queried" }),
    row("rd", { stage: "ready" }),
    row("cs", { stage: "awaiting_cosign" }),
  ];

  it("puts the review-first lane on top, then each stage, oldest first", () => {
    const g = queueGroups(rows, { lane: "all", stage: "all", serves: null, signed: true });
    expect(g.groups.map((x) => x.key)).toEqual(["first", "to_review", "queried", "awaiting_cosign", "ready"]);
    expect(g.groups[0]!.rows.map((r) => r.key)).toEqual(["pf"]);
    expect(g.groups[1]!.rows.map((r) => r.key)).toEqual(["old", "a", "b"]);
    expect(g.total).toBe(7);
  });

  it("has no review-first group when the rule is unsigned or the lane is Standard", () => {
    for (const f of [
      { lane: "all" as const, signed: false },
      { lane: "standard" as const, signed: true },
    ]) {
      const g = queueGroups(rows, { ...f, stage: "all", serves: null });
      expect(g.groups.some((x) => x.key === "first")).toBe(false);
    }
  });

  it("filters by stage and by the point's serves, as the engine does", () => {
    const g = queueGroups([...rows, row("ward", { origin: "ward" })], {
      lane: "all",
      stage: "to_review",
      serves: "window",
      signed: true,
    });
    expect(g.groups.flatMap((x) => x.rows.map((r) => r.key))).toEqual(["old", "a", "b"]);
  });
});

describe("Window open-line groups", () => {
  it("splits by outcome and the shelf answer, keeping the read's order", () => {
    const g = openGroups([
      { id: 1, outcome: "owed" as const, onShelfHere: true },
      { id: 2, outcome: "buying_outside" as const, onShelfHere: true },
      { id: 3, outcome: "owed" as const, onShelfHere: false },
      { id: 4, outcome: "owed" as const, onShelfHere: true },
    ]);
    expect(g.map((x) => [x.key, x.rows.map((r) => r.id)])).toEqual([
      ["shelf", [1, 4]],
      ["patient", [2]],
      ["out", [3]],
    ]);
  });
});

describe("Window helpers and copy", () => {
  it("pick refuses values outside the list", () => {
    expect(pick("ready", ["queue", "ready"] as const, "queue")).toBe("ready");
    expect(pick("nope", ["queue", "ready"] as const, "queue")).toBe("queue");
    expect(pick(["ready", "x"], ["queue", "ready"] as const, "queue")).toBe("ready");
  });

  it("copy has no bracketed placeholders and no role words", () => {
    const s = JSON.stringify(PHWS2_WINDOW);
    expect(s).not.toMatch(/\[[a-z ]+\]/);
    expect(s).not.toMatch(/\b(Pharmacist|Doctor|Nurse)s?\b/i);
  });
});
