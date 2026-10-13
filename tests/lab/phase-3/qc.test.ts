import type { ComponentQc, QcPlan } from "@/lib/lab/qc";
import { describe, expect, it } from "vitest";

import {
  labTarget,
  otherAnalysers,
  planErrors,
  qcReleasePlan,
  qcStatusFor,
  targetFor,
} from "@/lib/lab/qc";
import { evaluateRules, runDecision, zScore } from "@/lib/lab/qc-rules";
import { H1, H2, kla, TZ } from "./_fixtures";

/** FIXTURE plan: targets, SDs and levels are invented. */
const plan = (o: Partial<QcPlan> = {}): QcPlan => ({
  version: 1,
  levels: [
    { level: 1, label: "Fixture low", controlItemId: "ctl-item" },
    { level: 2, label: "Fixture high", controlItemId: "ctl-item" },
  ],
  frequency: { kind: "each_day_before_patients" },
  rejectRules: ["1-3s", "2-2s", "R-4s"],
  warnRules: ["1-2s"],
  tenXAcrossLevels: false,
  holdWhenNotRun: false,
  targets: [
    { level: 1, controlLotId: "c1", mean: 4.0, sd: 0.1, source: "lab" },
    { level: 2, controlLotId: "c2", mean: 6.0, sd: 0.2, source: "lab" },
  ],
  ...o,
});
const at = kla("2026-10-13 10:00");
const status = (
  latestRun: Parameters<typeof qcStatusFor>[0]["latestRun"],
  p: QcPlan | null = plan(),
) => qcStatusFor({ plan: p, latestRun, at, timeZone: TZ }).status;

describe("QC plans and targets (§6.6)", () => {
  it("QQ-1 a control lot level has the target and SD of the plan version in force", () => {
    expect(targetFor(plan(), 1, "c1")).toMatchObject({ mean: 4.0, sd: 0.1, source: "lab" });
    expect(targetFor(plan(), 1, "another-lot")).toBeNull();
    expect(zScore(4.25, targetFor(plan(), 1, "c1")!)).toBeCloseTo(2.5);
  });

  it("QQ-2 a plan needs levels, reject rules, targets and an n for per-sample frequency", () => {
    expect(planErrors(plan())).toEqual([]);
    expect(
      planErrors(
        plan({
          rejectRules: [],
          warnRules: ["1-2s"],
          frequency: { kind: "per_n_samples" },
          targets: [{ level: 1, controlLotId: "c1", mean: 4, sd: 0, source: "lab" }],
        }),
      ),
    ).toEqual(["no_reject_rules", "frequency_needs_n", "no_target:1", "no_target:2"]);
    expect(planErrors(plan({ warnRules: ["1-3s"] }))).toEqual(["rule_both_reject_and_warn"]);
  });

  it("QQ-3 the lab's target needs the signed minimum runs over the signed minimum days, accepted runs only", () => {
    const policy = { minRunsForTarget: 4, minDaysForTarget: 3 }; // FIXTURE minimums
    const r = (day: string, value: number, decision: "accepted" | "rejected" = "accepted") => ({
      runAt: kla(`2026-10-${day} 08:00`),
      value,
      decision,
    });
    expect(labTarget([r("01", 4.0), r("01", 4.2), r("02", 4.1), r("02", 4.3)], policy, TZ)).toEqual(
      {
        kind: "not_enough",
        runs: 4,
        days: 2,
      },
    );
    expect(
      labTarget([r("01", 4.0), r("02", 4.2), r("03", 4.1), r("04", 9, "rejected")], policy, TZ),
    ).toEqual({
      kind: "not_enough",
      runs: 3,
      days: 3,
    });
    const ready = labTarget(
      [r("01", 4.0), r("02", 4.2), r("03", 4.1), r("04", 4.3), r("05", 9, "rejected")],
      policy,
      TZ,
    );
    expect(ready).toMatchObject({
      kind: "ready",
      runs: 4,
      from: kla("2026-10-01 08:00"),
      to: kla("2026-10-04 08:00"),
    });
    if (ready.kind !== "ready") throw new Error();
    expect(ready.mean).toBeCloseTo(4.15);
    expect(ready.sd).toBeCloseTo(0.1291, 4);
  });

  it("QQ-3 no rolling recalculation: runs are scored against the plan's target, whatever history says", () => {
    // Twenty fixture runs drifting upward leave the plan's target untouched; z keeps growing.
    const t = targetFor(plan(), 1, "c1")!;
    const zs = Array.from({ length: 20 }, (_, i) => zScore(4.0 + i * 0.012, t));
    expect(zs.at(-1)).toBeCloseTo(2.28);
    expect(targetFor(plan(), 1, "c1")!.mean).toBe(4.0);
  });
});

describe("QC status and the hold (§6.6 QH)", () => {
  describe("QH-1 qcStatusFor transitions", () => {
    const today = { id: "run-today", runAt: kla("2026-10-13 07:30") };
    const yesterday = { id: "run-yday", runAt: kla("2026-10-12 23:30") };

    it("QH-1 no plan, then not run, then passed, warning, failed, provisional", () => {
      expect(status(null, null)).toBe("no_plan");
      expect(status(null)).toBe("not_run_in_window");
      expect(status({ ...today, decision: "accepted" })).toBe("passed");
      expect(status({ ...today, decision: "warning" })).toBe("warning");
      expect(status({ ...today, decision: "rejected" })).toBe("failed");
      const maker = plan({
        targets: plan().targets.map((t) => ({ ...t, source: "maker_provisional" as const })),
      });
      expect(status({ ...today, decision: "accepted" }, maker)).toBe("provisional_target");
      expect(status({ ...today, decision: "warning" }, maker)).toBe("warning");
    });

    it("QH-1 the window is the hospital-local day; a failure persists across days until a run is accepted", () => {
      expect(status({ ...yesterday, decision: "accepted" })).toBe("not_run_in_window");
      expect(status({ ...yesterday, decision: "rejected" })).toBe("failed");
      // 00:30 Kampala on the 13th is 21:30Z on the 12th: still today's run.
      expect(status({ id: "r", runAt: kla("2026-10-13 00:30"), decision: "accepted" })).toBe(
        "passed",
      );
      expect(
        qcStatusFor({
          plan: plan(),
          latestRun: { ...today, decision: "accepted" },
          at,
          timeZone: TZ,
        }).runId,
      ).toBe("run-today");
    });

    it("QH-1 per-sample frequency: out of the window once n samples have run", () => {
      const p = plan({ frequency: { kind: "per_n_samples", n: 20 } });
      const latestRun = { ...yesterday, decision: "accepted" as const };
      expect(
        qcStatusFor({ plan: p, latestRun, at, timeZone: TZ, samplesSinceRun: 19 }).status,
      ).toBe("passed");
      expect(
        qcStatusFor({ plan: p, latestRun, at, timeZone: TZ, samplesSinceRun: 20 }).status,
      ).toBe("not_run_in_window");
    });

    it("QH-1 a rejected run from the rule engine makes the component failed (GATE A §5.2 worked example)", () => {
      const run = (id: string, z: number) => ({
        id,
        planVersion: 1,
        values: [
          { level: 1, lotId: "c1", z },
          { level: 2, lotId: "c2", z: 0.4 },
        ],
      });
      const d = runDecision(
        evaluateRules(plan(), run("today", 2.3), [run("a", 0.3), run("b", -0.5), run("c", 2.1)]),
      );
      expect(status({ ...today, decision: d })).toBe("failed");
    });
  });

  const comp = (conceptId: string, o: Partial<ComponentQc> = {}): ComponentQc => ({
    conceptId,
    status: "passed",
    runId: `run-${conceptId}`,
    held: false,
    holdWhenNotRun: false,
    ...o,
  });
  const report = [
    comp("obs.potassium", { status: "failed", held: true }),
    comp("obs.sodium"),
    comp("obs.urea", { status: "warning" }),
  ];

  it("QH-2 with the hold on, a failed component is held and the others release", () => {
    const out = qcReleasePlan({ holdOn: true, components: report });
    expect(out).toMatchObject({ ok: true, held: ["obs.potassium"] });
    if (!out.ok) throw new Error();
    expect(out.release.map((r) => r.conceptId)).toEqual(["obs.sodium", "obs.urea"]);
    // held after a passing run until the lead authorises resumption (NC-3)
    expect(
      qcReleasePlan({ holdOn: true, components: [comp("k", { status: "passed", held: true })] }),
    ).toMatchObject({ held: ["k"] });
  });

  it("QH-2 with the hold off, everything releases and the status is recorded", () => {
    const out = qcReleasePlan({ holdOn: false, components: report });
    expect(out).toMatchObject({ ok: true, held: [] });
    if (!out.ok) throw new Error();
    expect(out.release[0]).toEqual({
      conceptId: "obs.potassium",
      qc: { status: "failed", runId: "run-obs.potassium" },
      lookBack: false,
      notice: null,
    });
  });

  it("QH-3 not run in the window holds only when the plan says; otherwise 'QC not run today' is recorded", () => {
    const informs = qcReleasePlan({
      holdOn: true,
      components: [comp("k", { status: "not_run_in_window", runId: null })],
    });
    expect(informs).toMatchObject({
      ok: true,
      held: [],
      release: [
        { conceptId: "k", notice: "qc_not_run_today", qc: { status: "not_run_in_window" } },
      ],
    });
    const holds = qcReleasePlan({
      holdOn: true,
      components: [comp("k", { status: "not_run_in_window", holdWhenNotRun: true })],
    });
    expect(holds).toMatchObject({ ok: true, held: ["k"], release: [] });
  });

  it("QH-4 override: a holder with a reason releases with the signed line and joins the look-back", () => {
    const by = "lead-fixture";
    expect(
      qcReleasePlan({
        holdOn: true,
        components: report,
        override: { by, permitted: false, reason: "Patient in resus" },
      }),
    ).toEqual({
      ok: false,
      error: "override_not_permitted",
    });
    expect(
      qcReleasePlan({
        holdOn: true,
        components: report,
        override: { by, permitted: true, reason: " " },
      }),
    ).toEqual({
      ok: false,
      error: "override_reason_required",
    });
    const out = qcReleasePlan({
      holdOn: true,
      components: report,
      override: { by, permitted: true, reason: " Patient in resus " },
    });
    if (!out.ok) throw new Error();
    expect(out.held).toEqual([]);
    expect(out.release[0]).toEqual({
      conceptId: "obs.potassium",
      qc: {
        status: "failed",
        runId: "run-obs.potassium",
        override: { by, reason: "Patient in resus" },
      },
      lookBack: true,
      notice: "released_while_qc_failed",
    });
    expect(out.release[1]).toMatchObject({ conceptId: "obs.sodium", lookBack: false });
    // An override with nothing held is not checked (no hold to pass).
    expect(
      qcReleasePlan({
        holdOn: true,
        components: [comp("x")],
        override: { by, permitted: false, reason: "" },
      }).ok,
    ).toBe(true);
  });

  it("QH-5 'Run on another analyser' lists in-service analysers with an accepted run, this hospital only", () => {
    const s = (
      deviceId: string,
      o: Partial<Parameters<typeof otherAnalysers>[0][number]> = {},
    ) => ({
      hospitalId: H1,
      deviceId,
      conceptId: "obs.potassium",
      status: "passed" as const,
      held: false,
      inService: true,
      ...o,
    });
    const statuses = [
      s("a1", { status: "failed", held: true }),
      s("a2"),
      s("a3", { status: "warning" }),
      s("a4", { inService: false }),
      s("a5", { status: "not_run_in_window" }),
      s("a6", { conceptId: "obs.sodium" }),
      s("a7", { hospitalId: H2 }),
      s("a8", { status: "passed", held: true }),
    ];
    expect(
      otherAnalysers(statuses, { hospitalId: H1, conceptId: "obs.potassium", deviceId: "a1" }),
    ).toEqual(["a2", "a3"]);
    expect(
      otherAnalysers(statuses, { hospitalId: H2, conceptId: "obs.potassium", deviceId: "a1" }),
    ).toEqual(["a7"]);
  });

  it("QH-6 the status at release is snapshotted per component", () => {
    const out = qcReleasePlan({
      holdOn: true,
      components: [comp("k", { status: "provisional_target" })],
    });
    if (!out.ok) throw new Error();
    expect(out.release[0]!.qc).toEqual({ status: "provisional_target", runId: "run-k" });
  });
});
