import type { QcRunPoints, RuleBreak, RuleId, RulePlan } from "@/lib/lab/qc-rules";
import { describe, expect, it } from "vitest";

import { evaluateRules, RULE_IDS, runDecision, zScore } from "@/lib/lab/qc-rules";

/**
 * QR-4 table tests. Every value is a FIXTURE in SD units (GATE A §6 worked examples), never a control value.
 * Plans list rules explicitly; the default set in D-LAB3-03 is signed data, not code.
 */
const ALL: RulePlan = {
  rejectRules: RULE_IDS.filter((r) => r !== "1-2s"),
  warnRules: ["1-2s"],
  tenXAcrossLevels: false,
};
const DEFAULT: RulePlan = {
  rejectRules: ["1-3s", "2-2s", "R-4s", "4-1s", "10-x"],
  warnRules: ["1-2s"],
  tenXAcrossLevels: false,
};
const only = (rule: RuleId, o: Partial<RulePlan> = {}): RulePlan => ({
  rejectRules: [rule],
  warnRules: [],
  tenXAcrossLevels: false,
  ...o,
});

let n = 0;
/** A run: one z per level, all on control lot `lot-<level>` unless given, plan version 1. */
const run = (zs: number[], o: { lots?: string[]; planVersion?: number } = {}): QcRunPoints => ({
  id: `run-${++n}`,
  planVersion: o.planVersion ?? 1,
  values: zs.map((z, i) => ({ level: i + 1, lotId: o.lots?.[i] ?? `lot-${i + 1}`, z })),
});
/** History of single-level runs (L1, with a fixed L2 at 0.0 unless `twoLevels` is false). */
const hist = (zs: number[], twoLevels = true) => zs.map((z) => run(twoLevels ? [z, 0] : [z]));
const rules = (breaks: RuleBreak[]) => breaks.map((b) => `${b.rule}/${b.scope}`).sort();

describe("Westgard rules (QR-1..QR-4, GATE A §6)", () => {
  describe("QR-4 each rule broken alone", () => {
    it.each<[RuleId, number[][], number[], string]>([
      ["1-2s", [], [2.3, 0.4], "1-2s/point"],
      ["1-3s", [], [3.2, 0.1], "1-3s/point"],
      ["2-2s", [], [2.2, 2.4], "2-2s/within_run"],
      ["2-2s", [[2.1, 0]], [2.3, 0.0], "2-2s/across_runs"],
      ["R-4s", [], [2.1, -2.2], "R-4s/within_run"],
      [
        "4-1s",
        [
          [1.2, 0],
          [1.4, 0],
          [1.1, 0],
        ],
        [1.3, 0],
        "4-1s/across_runs",
      ],
      ["2of3-2s", [], [2.2, 0.5, 2.1], "2of3-2s/within_run"],
      ["3-1s", [], [1.1, 1.4, 1.2], "3-1s/within_run"],
      ["6-x", Array.from({ length: 5 }, () => [0.5, 0]), [0.3, 0], "6-x/across_runs"],
      ["8-x", Array.from({ length: 7 }, () => [0.5, 0]), [0.3, 0], "8-x/across_runs"],
      ["9-x", Array.from({ length: 8 }, () => [-0.5, 0]), [-0.3, 0], "9-x/across_runs"],
      ["10-x", Array.from({ length: 9 }, () => [0.4, 0]), [0.9, 0], "10-x/across_runs"],
      ["12-x", Array.from({ length: 11 }, () => [0.4, 0]), [0.2, 0], "12-x/across_runs"],
    ])("QR-4 %s alone: %j then %j → %s", (rule, before, today, expected) => {
      const breaks = evaluateRules(
        only(rule),
        run(today),
        before.map((zs) => run(zs)),
      );
      expect(rules(breaks)).toEqual([expected]);
      expect(breaks[0]!.kind).toBe("reject");
    });

    it.each<[RuleId, number[][], number[]]>([
      ["1-2s", [], [2.0, -2.0]], // exactly 2.00 breaks nothing
      ["1-3s", [], [3.0, 0]],
      ["2-2s", [], [2.2, -2.4]], // opposite sides: R-4s, not 2-2s
      ["2-2s", [[2.1, 0]], [1.9, 0]],
      ["R-4s", [], [2.1, 1.0]],
      [
        "4-1s",
        [
          [1.2, 0],
          [1.4, 0],
          [0.9, 0],
        ],
        [1.3, 0],
      ], // GATE A §6: one at 0.9 breaks the run
      ["2of3-2s", [], [2.2, 0.5, 1.9]],
      ["3-1s", [], [1.1, 1.4, 0.9]],
      ["10-x", [...Array.from({ length: 8 }, () => [0.4, 0]), [0.0, 0]], [0.9, 0]], // a 0.0 resets
    ])("QR-4 %s not broken: %j then %j", (rule, before, today) => {
      expect(
        evaluateRules(
          only(rule),
          run(today),
          before.map((zs) => run(zs)),
        ),
      ).toEqual([]);
    });
  });

  it("QR-4 R-4s is never across runs: yesterday +2.1, today −2.2 on one level is two 1-2s warnings", () => {
    const yesterday = run([2.1, 0]);
    const today = run([-2.2, 0]);
    expect(evaluateRules(only("R-4s"), today, [yesterday])).toEqual([]);
    const both = evaluateRules(DEFAULT, today, [yesterday]);
    expect(rules(both)).toEqual(["1-2s/point"]);
    expect(runDecision(both)).toBe("warning");
    // and the warning yesterday was its own run's
    expect(rules(evaluateRules(DEFAULT, yesterday, []))).toEqual(["1-2s/point"]);
  });

  it("QR-4 10-x across runs within a level, and across levels only when the plan says", () => {
    // Five runs × two levels, every point positive: ten consecutive across levels, five within each level.
    const before = Array.from({ length: 4 }, () => run([0.3, 0.6]));
    const today = run([0.2, 0.7]);
    expect(evaluateRules(only("10-x"), today, before)).toEqual([]);
    const across = evaluateRules(only("10-x", { tenXAcrossLevels: true }), today, before);
    expect(rules(across)).toEqual(["10-x/across_levels_and_runs"]);
    expect(across[0]!.points).toHaveLength(10);
    // Ten within one level: reported within the level, not again across levels.
    const ten = Array.from({ length: 9 }, () => run([0.3, -0.6]));
    expect(
      rules(evaluateRules(only("10-x", { tenXAcrossLevels: true }), run([0.2, 0.7]), ten)),
    ).toEqual(["10-x/across_runs"]);
  });

  it("QR-4 combinations: 2-2s with 4-1s (the canvas's case), and the GATE A §5.2 worked example", () => {
    const before = [run([1.3, 0.2]), run([1.5, -0.1]), run([2.1, 0.4])];
    const breaks = evaluateRules(DEFAULT, run([2.3, 0.4]), before);
    expect(rules(breaks)).toEqual(["1-2s/point", "2-2s/across_runs", "4-1s/across_runs"]);
    expect(runDecision(breaks)).toBe("rejected");

    // §5.2: L1 history +0.3, −0.5, +2.1; today L1 +2.3, L2 +0.4 → 1-2s warning and 2-2s across runs.
    const worked = evaluateRules(DEFAULT, run([2.3, 0.4]), [
      run([0.3, 0]),
      run([-0.5, 0]),
      run([2.1, 0]),
    ]);
    expect(rules(worked)).toEqual(["1-2s/point", "2-2s/across_runs"]);
    expect(worked.find((b) => b.rule === "2-2s")!.points.map((p) => p.z)).toEqual([2.1, 2.3]);
    expect(runDecision(worked)).toBe("rejected");

    // 1-3s and R-4s together in one run.
    expect(rules(evaluateRules(DEFAULT, run([3.4, -2.5]), []))).toEqual([
      "1-2s/point",
      "1-2s/point",
      "1-3s/point",
      "R-4s/within_run",
    ]);
  });

  it("QR-2 a computer evaluation applies every configured rule; 1-2s is never a gate", () => {
    // No point beyond 2 SD, yet 4-1s rejects: Westgard's 1-2s screen would have missed it.
    const breaks = evaluateRules(DEFAULT, run([1.3, 0]), hist([1.2, 1.4, 1.1]));
    expect(rules(breaks)).toEqual(["4-1s/across_runs"]);
    // A rule in neither list is not evaluated.
    expect(
      evaluateRules(
        { rejectRules: ["1-3s"], warnRules: [], tenXAcrossLevels: false },
        run([2.5, 0]),
        [],
      ),
    ).toEqual([]);
    // Warn and reject come from the plan, not the rule.
    expect(
      evaluateRules(
        { rejectRules: ["1-2s"], warnRules: [], tenXAcrossLevels: false },
        run([2.5, 0]),
        [],
      )[0]!.kind,
    ).toBe("reject");
    expect(evaluateRules(ALL, run([0, 0]), [])).toEqual([]);
  });

  it("QR-3 history resets on a control lot change and on a new plan version", () => {
    const before = [
      run([1.2, 0], { lots: ["old", "lot-2"] }),
      run([1.4, 0], { lots: ["old", "lot-2"] }),
      run([1.1, 0]),
    ];
    // Only one earlier run on lot-1: 4-1s cannot see the two on the old lot.
    expect(evaluateRules(only("4-1s"), run([1.3, 0]), before)).toEqual([]);
    expect(
      evaluateRules(only("2-2s"), run([2.3, 0]), [run([2.1, 0], { lots: ["old", "lot-2"] })]),
    ).toEqual([]);
    expect(evaluateRules(only("2-2s"), run([2.3, 0]), [run([2.1, 0], { planVersion: 0 })])).toEqual(
      [],
    );
    // Level 2's lot changed; level 1 keeps its history.
    expect(
      rules(
        evaluateRules(only("2-2s"), run([2.3, 0]), [run([2.1, 0], { lots: ["lot-1", "old"] })]),
      ),
    ).toEqual(["2-2s/across_runs"]);
    // Across levels, any level's lot change ends the history.
    const tenX = only("10-x", { tenXAcrossLevels: true });
    const mixed = [
      ...Array.from({ length: 3 }, () => run([0.3, 0.6], { lots: ["lot-1", "old"] })),
      run([0.3, 0.6]),
      run([0.3, 0.6]),
    ];
    expect(evaluateRules(tenX, run([0.2, 0.7]), mixed)).toEqual([]);
  });

  it("QR-1 breaks report their scope and the points that break them (run ids)", () => {
    const y = run([2.1, 0]);
    const t = run([2.3, 0]);
    const [b] = evaluateRules(only("2-2s"), t, [y]);
    expect(b).toEqual({
      rule: "2-2s",
      kind: "reject",
      scope: "across_runs",
      points: [
        { runId: y.id, level: 1, z: 2.1 },
        { runId: t.id, level: 1, z: 2.3 },
      ],
    });
    expect(zScore(5.3, { mean: 5.0, sd: 0.1 })).toBeCloseTo(3);
    expect(runDecision([])).toBe("accepted");
  });
});
