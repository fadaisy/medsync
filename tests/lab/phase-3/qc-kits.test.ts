import type { ControlCheck, KitQcRule } from "@/lib/lab/qc-kits";
import { describe, expect, it } from "vitest";

import {
  evaluateKitCheck,
  kitQcBlocks,
  kitQcDue,
  quarantineReleaseErrors,
} from "@/lib/lab/qc-kits";
import { H1, H2, kla, TZ } from "./_fixtures";

/** FIXTURE rules: controls, answers and criteria are invented placeholders, not signed practice. */
const rapid: KitQcRule = {
  triggers: [
    { kind: "each_day_of_use" },
    { kind: "new_lot" },
    { kind: "new_shipment" },
    { kind: "new_operator" },
  ],
  controls: [
    { name: "positive control", expected: { code: "reactive" } },
    { name: "negative control", expected: { code: "non_reactive" } },
  ],
  requiredBeforeUse: true,
  hmisIqc: true,
};
const stain: KitQcRule = {
  triggers: [{ kind: "schedule", weekday: 1 }, { kind: "after_maintenance" }],
  controls: [
    {
      name: "control smear",
      expected: { passCriteria: ["fixture criterion A", "fixture criterion B"] },
    },
  ],
  requiredBeforeUse: false,
  hmisIqc: false,
};
const check = (at: string, o: Partial<ControlCheck> = {}): ControlCheck => ({
  hospitalId: H1,
  itemId: "kit-item",
  lotId: "lot-1",
  operatorId: "tech-1",
  outcome: "pass",
  at: kla(at),
  ...o,
});
const due = (
  rule: KitQcRule,
  checks: ControlCheck[],
  o: Partial<Parameters<typeof kitQcDue>[0]> = {},
) =>
  kitQcDue({
    rule,
    hospitalId: H1,
    itemId: "kit-item",
    lot: { id: "lot-1", lastReceivedAt: kla("2026-10-01 09:00") },
    operatorId: "tech-1",
    at: kla("2026-10-13 10:00"),
    timeZone: TZ,
    checks,
    lastMaintenanceAt: null,
    ...o,
  });

describe("kit, stain and qualitative QC (§6.5)", () => {
  it("KQ-1 a rule per kit: triggers, controls, expected answers, required before use or informs", () => {
    expect(kitQcBlocks(rapid, ["each_day_of_use"])).toBe(true);
    expect(kitQcBlocks(stain, ["schedule"])).toBe(false);
    expect(kitQcBlocks(rapid, [])).toBe(false);
  });

  describe("KQ-2 kitQcDue returns the triggers outstanding", () => {
    it("KQ-2 nothing done: every trigger is due", () => {
      expect(due(rapid, [])).toEqual([
        "each_day_of_use",
        "new_lot",
        "new_shipment",
        "new_operator",
      ]);
    });

    it("KQ-2 each day of use: a pass today (hospital-local) meets it; yesterday's does not", () => {
      expect(due(rapid, [check("2026-10-13 00:10")])).toEqual([]);
      expect(due(rapid, [check("2026-10-12 23:50")])).toEqual(["each_day_of_use"]);
    });

    it("KQ-2 new lot, new shipment of the same lot, new operator", () => {
      const yesterdayOnLot = check("2026-10-12 09:00");
      expect(due(rapid, [yesterdayOnLot, check("2026-10-13 08:00", { lotId: "lot-0" })])).toEqual(
        [],
      );
      expect(due(rapid, [check("2026-10-13 08:00", { lotId: "lot-0" })])).toEqual([
        "new_lot",
        "new_shipment",
      ]);
      expect(
        due(rapid, [yesterdayOnLot, check("2026-10-13 08:00")], {
          lot: { id: "lot-1", lastReceivedAt: kla("2026-10-13 09:00") },
        }),
      ).toEqual(["new_shipment"]);
      expect(due(rapid, [check("2026-10-13 08:00")], { operatorId: "tech-new" })).toEqual([
        "new_operator",
      ]);
    });

    it("KQ-2 schedule (weekly on Monday) and after maintenance", () => {
      // 13 OCT 2026 is a Tuesday; the scheduled day was Monday 12 OCT.
      expect(due(stain, [check("2026-10-12 08:00")])).toEqual([]);
      expect(due(stain, [check("2026-10-11 08:00")])).toEqual(["schedule"]);
      expect(
        due(stain, [check("2026-10-12 08:00")], { lastMaintenanceAt: kla("2026-10-12 12:00") }),
      ).toEqual(["after_maintenance"]);
      expect(
        due(stain, [check("2026-10-12 08:00"), check("2026-10-12 13:00")], {
          lastMaintenanceAt: kla("2026-10-12 12:00"),
        }),
      ).toEqual([]);
    });

    it("KQ-2 failed checks, later checks and the other hospital's checks meet nothing", () => {
      expect(due(rapid, [check("2026-10-13 08:00", { outcome: "fail" })])).toHaveLength(4);
      expect(due(rapid, [check("2026-10-13 11:00")])).toHaveLength(4);
      expect(due(rapid, [check("2026-10-13 08:00", { hospitalId: H2 })])).toHaveLength(4);
      expect(
        due(rapid, [check("2026-10-13 08:00", { hospitalId: H2 })], { hospitalId: H2 }),
      ).toEqual([]);
    });
  });

  it("KQ-3 a failed control quarantines the lot at once and opens a nonconformity", () => {
    const out = evaluateKitCheck({
      rule: rapid,
      observed: [
        { name: "positive control", code: "non_reactive" },
        { name: "negative control", code: "non_reactive" },
      ],
      lotState: "in_use",
      acceptanceMethod: "qc_pass",
    });
    expect(out).toEqual({
      outcome: "fail",
      controls: [
        { name: "positive control", pass: false },
        { name: "negative control", pass: true },
      ],
      lotTo: "quarantined",
      openNonconformity: "kit_qc_fail",
    });
    expect(
      evaluateKitCheck({ rule: rapid, observed: [], lotState: "in_use", acceptanceMethod: null })
        .outcome,
    ).toBe("fail");
  });

  it("KQ-3 release from quarantine needs the lead and a passing rerun after it", () => {
    const q = { quarantinedAt: kla("2026-10-13 09:00"), lotId: "lot-1" };
    const before = { lotId: "lot-1", outcome: "pass" as const, at: kla("2026-10-13 08:00") };
    const rerun = { lotId: "lot-1", outcome: "pass" as const, at: kla("2026-10-13 11:00") };
    expect(quarantineReleaseErrors({ ...q, actorIsLead: false, checks: [before] })).toEqual([
      "not_lead",
      "no_passing_rerun",
    ]);
    expect(quarantineReleaseErrors({ ...q, actorIsLead: true, checks: [rerun] })).toEqual([]);
  });

  it("KQ-4 a pass on a new lot whose acceptance plan is qc_pass accepts the lot", () => {
    const observed = [
      { name: "positive control", code: "reactive" },
      { name: "negative control", code: "non_reactive" },
    ];
    expect(
      evaluateKitCheck({
        rule: rapid,
        observed,
        lotState: "in_acceptance",
        acceptanceMethod: "qc_pass",
      }).lotTo,
    ).toBe("accepted");
    expect(
      evaluateKitCheck({ rule: rapid, observed, lotState: "received", acceptanceMethod: "qc_pass" })
        .lotTo,
    ).toBe("accepted");
    expect(
      evaluateKitCheck({ rule: rapid, observed, lotState: "in_use", acceptanceMethod: "qc_pass" })
        .lotTo,
    ).toBeNull();
    expect(
      evaluateKitCheck({
        rule: rapid,
        observed,
        lotState: "in_acceptance",
        acceptanceMethod: "lot_comparison",
      }).lotTo,
    ).toBeNull();
  });

  it("KQ-5 stain QC passes only when every signed criterion is ticked", () => {
    const run = (met: string[]) =>
      evaluateKitCheck({
        rule: stain,
        observed: [{ name: "control smear", met }],
        lotState: "in_use",
        acceptanceMethod: null,
      }).outcome;
    expect(run(["fixture criterion A", "fixture criterion B"])).toBe("pass");
    expect(run(["fixture criterion A"])).toBe("fail");
  });
});
