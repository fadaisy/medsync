import type { LabPermission } from "@/lib/lab/access";
import type { LabStage, Viewer, WorklistInput } from "@/lib/lab/worklist";
import { describe, expect, it } from "vitest";

import { LAB_PERMISSIONS } from "@/lib/lab/access";
import { computeWorklist, defaultSection, LAB_STAGES } from "@/lib/lab/worklist";

/** Lab Phase 0 — the worklist projection (LW-1..LW-12; gate-a-proposal §5.1). */
const at = (hhmm: string) => new Date(`2026-10-10T${hhmm}:00+03:00`);
const NOW = at("10:42");
const H = "hospital-a";
const CHEM = "sec-chem";
const HAEM = "sec-haem";
const SECTIONS = [
  { id: CHEM, name: "Clinical chemistry" },
  { id: HAEM, name: "Haematology" },
];
const ALL = new Set<LabPermission>(LAB_PERMISSIONS);
const viewer = (o: Partial<Viewer> = {}): Viewer => ({
  hospitalId: H,
  permissions: ALL,
  sectionIds: [],
  ...o,
});

let n = 0;
const row = (o: Partial<WorklistInput> = {}): WorklistInput => {
  n += 1;
  return {
    orderId: `o${n}`,
    hospitalId: H,
    patientUserId: `p${n}`,
    testId: null,
    test: `Test ${n}`,
    priority: "routine",
    stage: "to_result",
    specimenId: `s${n}`,
    reportId: null,
    collectedAt: at("10:00"),
    receivedAt: at("10:18"),
    from: null,
    offeringSectionId: null,
    catalogueSectionId: null,
    statedTat: null,
    catalogueTargetMinutes: null,
    ...o,
  };
};
const run = (rows: WorklistInput[], o: { viewer?: Viewer; filters?: object } = {}) =>
  computeWorklist({
    rows,
    sections: SECTIONS,
    viewer: o.viewer ?? viewer(),
    filters: o.filters ?? {},
    serverNow: NOW,
  });

describe("worklist projection", () => {
  it("LW-1: one row per order — a panel is one order", () => {
    expect(run([row({ test: "Urea and electrolytes" })]).rows).toHaveLength(1);
  });

  it("LW-2: three stages, each with its one action", () => {
    const w = run([
      row({ stage: "to_receive", receivedAt: null }),
      row({ stage: "to_result" }),
      row({ stage: "preliminary", reportId: "r1" }),
    ]);
    expect(w.rows.map((r) => [r.stage, r.action])).toEqual([
      ["to_result", "enter"],
      ["preliminary", "continue"],
      ["to_receive", "receive"],
    ]);
  });

  it("LW-3: offering section, else catalogue section, else No section — never hidden", () => {
    const w = run([
      row({ offeringSectionId: CHEM, catalogueSectionId: HAEM }),
      row({ catalogueSectionId: HAEM }),
      row(),
    ]);
    expect(w.rows.map((r) => r.sectionId).sort()).toEqual([null, CHEM, HAEM].sort());
    expect(w.sectionTabs.map((t) => [t.key, t.count])).toEqual([
      ["all", 3],
      [CHEM, 1],
      [HAEM, 1],
      ["none", 1],
    ]);
    expect(run([row()], { filters: { section: "none" } }).rows).toHaveLength(1);
  });

  it("LW-4: opens on the viewer's section; several → My sections; none → All, and says so", () => {
    const rows = [row({ offeringSectionId: CHEM }), row({ offeringSectionId: HAEM }), row()];
    const one = run(rows, { viewer: viewer({ sectionIds: [HAEM] }) });
    expect(one.section).toBe(HAEM);
    expect(one.sectionTabs[0]).toEqual({ key: HAEM, name: "Haematology", count: 1 });
    expect(one.rows).toHaveLength(1);
    expect(one.elsewhere).toBe(2);
    const many = run(rows, { viewer: viewer({ sectionIds: [CHEM, HAEM] }) });
    expect(many.section).toBe("mine");
    expect(many.rows).toHaveLength(2);
    const nobody = run(rows);
    expect(nobody.section).toBe("all");
    expect(nobody.noSectionAssigned).toBe(true);
    expect(defaultSection({ sectionIds: [] })).toBe("all");
  });

  it("LW-4: the viewer's own section shows even with nothing in it", () => {
    const w = run([row({ offeringSectionId: HAEM })], { viewer: viewer({ sectionIds: [CHEM] }) });
    expect(w.sectionTabs[0]).toEqual({ key: CHEM, name: "Clinical chemistry", count: 0 });
    expect(w.rows).toHaveLength(0);
    expect(w.elsewhere).toBe(1);
  });

  it("LW-5: the ward filter matches the ordering department", () => {
    const ward = { id: "d4a", name: "Ward 4A" };
    const clinic = { id: "dc", name: "Diabetes clinic" };
    const w = run([row({ from: ward }), row({ from: clinic }), row()], {
      filters: { dept: "d4a" },
    });
    expect(w.rows.map((r) => r.from?.name)).toEqual(["Ward 4A"]);
    expect(w.depts.map((d) => d.name)).toEqual(["Diabetes clinic", "Ward 4A"]);
    expect(run([row()], { filters: { dept: "unknown" } }).dept).toBeNull();
  });

  it("LW-6: section counts ignore the section filter; stage counts follow it", () => {
    const rows = [
      row({ offeringSectionId: CHEM, stage: "to_receive", receivedAt: null }),
      row({ offeringSectionId: CHEM }),
      row({ offeringSectionId: HAEM }),
    ];
    const w = run(rows, { filters: { section: CHEM, stage: "to_receive" } });
    expect(w.sectionTabs.find((t) => t.key === "all")!.count).toBe(3);
    expect(w.stageCounts).toEqual({ all: 2, to_receive: 1, to_result: 1, preliminary: 0 });
    expect(w.rows).toHaveLength(1);
  });

  it("LW-7: priority, then late by overrun, then received by elapsed, then not received", () => {
    const w = run([
      row({ test: "HbA1c", statedTat: null, receivedAt: at("10:02") }),
      row({ test: "Creatinine", stage: "to_receive", receivedAt: null, collectedAt: at("10:07") }),
      row({ test: "LFT", statedTat: "2 h", receivedAt: at("08:17") }),
      row({ test: "U&E", priority: "urgent", statedTat: "1 h", receivedAt: at("10:18") }),
      row({ test: "Glucose", priority: "immediate", statedTat: "30 min", receivedAt: at("10:36") }),
      row({ test: "Lipids", statedTat: "4 h", receivedAt: at("09:32") }),
    ]);
    expect(w.rows.map((r) => r.test)).toEqual([
      "Glucose",
      "U&E",
      "LFT",
      "Lipids",
      "HbA1c",
      "Creatinine",
    ]);
    expect(w.rows[2]!.clock).toMatchObject({ lateBy: 25 });
  });

  it("LW-7: re-sort by a column; an unknown sort falls back to the default", () => {
    const rows = [row({ test: "b" }), row({ test: "a" })];
    expect(run(rows, { filters: { sort: "test" } }).rows.map((r) => r.test)).toEqual(["a", "b"]);
    expect(run(rows, { filters: { sort: "nonsense" } }).sort).toBe("default");
  });

  it("LW-8: a missing permission gives no action, never a disabled one", () => {
    const enterOnly = new Set<LabPermission>(["lab.view", "lab.result.enter"]);
    const w = run(
      [
        row({ stage: "to_receive", receivedAt: null }),
        row({ stage: "to_result" }),
        row({ stage: "preliminary" }),
      ],
      { viewer: viewer({ permissions: enterOnly }) },
    );
    expect(Object.fromEntries(w.rows.map((r) => [r.stage, r.action]))).toEqual({
      to_receive: null,
      to_result: "enter",
      preliminary: null,
    });
  });

  it("LW-9: another hospital's rows never appear", () => {
    const w = run([row(), row({ hospitalId: "hospital-b" })]);
    expect(w.total).toBe(1);
    expect(w.rows.every((r) => r.hospitalId === H)).toBe(true);
  });

  it("an unknown section or stage in the URL falls back, it never hides everything", () => {
    const w = run([row()], { filters: { section: "gone", stage: "lost" } });
    expect(w.section).toBe("all");
    expect(w.stage).toBe("all");
    expect(w.rows).toHaveLength(1);
  });

  it("LW-12 (property): every open item exactly once under All; section counts sum to the total", () => {
    let seed = 20261010;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
    for (let trial = 0; trial < 500; trial += 1) {
      const count = Math.floor(rand() * 40);
      const rows: WorklistInput[] = Array.from({ length: count }, () => {
        const stage: LabStage = pick(LAB_STAGES);
        return row({
          hospitalId: rand() < 0.1 ? "hospital-b" : H,
          stage,
          receivedAt: stage === "to_receive" ? null : at("09:00"),
          offeringSectionId: pick([null, CHEM, HAEM, "sec-micro"]),
          catalogueSectionId: pick([null, HAEM]),
          priority: pick(["routine", "urgent", "immediate", null]),
          statedTat: pick([null, "1 h", "same day", "30 min"]),
          from: pick([null, { id: "d1", name: "Ward 1" }]),
        });
      });
      const v = viewer({ sectionIds: pick([[], [CHEM], [CHEM, HAEM]]) });
      const w = run(rows, {
        viewer: v,
        filters: {
          section: pick([null, "all", CHEM, "none", "mine"]),
          stage: pick([null, ...LAB_STAGES]),
        },
      });
      const mine = rows.filter((r) => r.hospitalId === H);
      const everything = run(rows, { viewer: v, filters: { section: "all", stage: "all" } });
      expect(everything.rows.map((r) => r.orderId).sort()).toEqual(
        mine.map((r) => r.orderId).sort(),
      );
      expect(new Set(everything.rows.map((r) => r.orderId)).size).toBe(mine.length);
      // Every tab but "All sections" is one part of a partition: they add up to the total.
      const parts = w.sectionTabs.filter((t) => t.key !== "all");
      expect(parts.reduce((s, t) => s + t.count, 0)).toBe(w.total);
      expect(new Set(parts.map((t) => t.key)).size).toBe(parts.length);
      expect(w.total).toBe(mine.length);
    }
  });
});
