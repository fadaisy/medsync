import type { AcceptancePlan, ComparisonPair } from "@/lib/lab/acceptance";
import type { LotInUseRow } from "@/lib/lab/lots-in-use";
import type { LotState } from "@/lib/lab/stock";
import { describe, expect, it } from "vitest";

import {
  acceptanceNeeded,
  acceptanceOutcome,
  evaluateLotComparison,
  grandfatherLot,
} from "@/lib/lab/acceptance";
import { lotsInUse, lotSnapshot } from "@/lib/lab/lots-in-use";
import { lotRefusal } from "@/lib/lab/stock";
import { H1, H2, kla, TZ } from "./_fixtures";

/** FIXTURE plan: the criterion values are invented. */
const plan = (
  criterion: NonNullable<AcceptancePlan["comparison"]>["criterion"],
  o: Partial<AcceptancePlan> = {},
): AcceptancePlan => ({
  method: "lot_comparison",
  triggers: ["new_lot", "new_formulation"],
  comparison: { samples: 2, criterion, qcAlso: false },
  certificateAllowed: false,
  ...o,
});
const pair = (current: number, candidate: number, n = 1): ComparisonPair => ({
  observationId: `obs-${n}`,
  level: n === 1 ? "low" : "high",
  current,
  candidate,
});
const verdict = (p: AcceptancePlan, current: number, candidate: number) =>
  evaluateLotComparison({ ...p, comparison: { ...p.comparison!, samples: 1 } }, [
    pair(current, candidate),
  ]).outcome;

describe("lot acceptance (§6.2)", () => {
  it("LA-1 each method decides from its own evidence", () => {
    expect(
      acceptanceOutcome(plan({ absolute: 1, combine: "larger" }, { method: "none" }), {}),
    ).toEqual({
      kind: "accepted",
      basis: "none",
    });
    const cert = plan(
      { absolute: 1, combine: "larger" },
      { method: "certificate", certificateAllowed: true },
    );
    expect(acceptanceOutcome(cert, {})).toEqual({ kind: "pending" });
    expect(acceptanceOutcome(cert, { certificateAccepted: true })).toEqual({
      kind: "accepted",
      basis: "certificate",
    });
    expect(
      acceptanceOutcome({ ...cert, certificateAllowed: false }, { certificateAccepted: true }),
    ).toEqual({
      kind: "pending",
    });
    const qc = plan({ absolute: 1, combine: "larger" }, { method: "qc_pass" });
    expect(acceptanceOutcome(qc, { qcPassed: true })).toEqual({ kind: "accepted", basis: "qc" });
    expect(acceptanceOutcome(qc, { qcPassed: false })).toEqual({
      kind: "quarantined",
      reason: "control_failed",
    });
    const cmp = plan({ absolute: 1, combine: "larger" });
    expect(acceptanceOutcome(cmp, { comparison: "within" })).toEqual({
      kind: "accepted",
      basis: "plan",
    });
    expect(acceptanceOutcome(cmp, { comparison: "outside" })).toEqual({
      kind: "rejected",
      reason: "outside_criterion",
    });
    expect(acceptanceOutcome(cmp, { comparison: "incomplete" })).toEqual({ kind: "pending" });
    const both = { ...cmp, comparison: { ...cmp.comparison!, qcAlso: true } };
    expect(acceptanceOutcome(both, { comparison: "within" })).toEqual({ kind: "pending" });
    expect(acceptanceOutcome(both, { comparison: "within", qcPassed: true })).toEqual({
      kind: "accepted",
      basis: "plan",
    });
    expect(acceptanceOutcome(both, { comparison: "within", qcPassed: false })).toMatchObject({
      kind: "rejected",
    });
  });

  it("LA-2 the plan states its triggers", () => {
    const p = plan({ absolute: 1, combine: "larger" });
    expect(acceptanceNeeded(p, "new_lot")).toBe(true);
    expect(acceptanceNeeded(p, "new_shipment")).toBe(false);
    expect(acceptanceNeeded({ ...p, method: "none", triggers: ["new_lot"] }, "new_lot")).toBe(
      false,
    );
  });

  describe("LA-3 evaluateLotComparison at the criterion boundaries", () => {
    it.each([
      // absolute only (fixture 0.5)
      [{ absolute: 0.5, combine: "larger" as const }, 4.0, 4.5, "within"],
      [{ absolute: 0.5, combine: "larger" as const }, 4.0, 4.51, "outside"],
      [{ absolute: 0.2, combine: "larger" as const }, 4.0, 4.2, "within"], // float: 0.2000000000000002
      [{ absolute: 0.5, combine: "larger" as const }, 4.0, 3.5, "within"],
      // percent only (fixture 5 %)
      [{ percent: 5, combine: "larger" as const }, 100, 105, "within"],
      [{ percent: 5, combine: "larger" as const }, 100, 105.1, "outside"],
      [{ percent: 5, combine: "larger" as const }, 100, 95, "within"],
      [{ percent: 5, combine: "larger" as const }, 0, 0.1, "outside"], // no percent of zero
      // whichever is larger (fixture 0.5 or 5 %): at 4.0 the absolute allows more, at 20 the percent does
      [{ absolute: 0.5, percent: 5, combine: "larger" as const }, 4.0, 4.5, "within"],
      [{ absolute: 0.5, percent: 5, combine: "larger" as const }, 4.0, 4.6, "outside"],
      [{ absolute: 0.5, percent: 5, combine: "larger" as const }, 20, 21, "within"],
      [{ absolute: 0.5, percent: 5, combine: "larger" as const }, 20, 21.1, "outside"],
      // both must hold
      [{ absolute: 0.5, percent: 5, combine: "both" as const }, 4.0, 4.2, "within"],
      [{ absolute: 0.5, percent: 5, combine: "both" as const }, 4.0, 4.5, "outside"], // 12.5 %
      [{ absolute: 0.5, percent: 5, combine: "both" as const }, 10, 10.5, "within"], // 0.5 and 5 % exactly
      [{ absolute: 0.5, percent: 5, combine: "both" as const }, 20, 21, "outside"], // 1.0 > 0.5
    ])("LA-3 %o: current %d, candidate %d → %s", (criterion, current, candidate, expected) => {
      expect(verdict(plan(criterion), current, candidate)).toBe(expected);
    });

    it("LA-3 fewer pairs than the plan asks for is incomplete; any pair outside rejects", () => {
      const p = plan({ absolute: 0.5, combine: "larger" });
      expect(evaluateLotComparison(p, [pair(4, 4.1)]).outcome).toBe("incomplete");
      expect(evaluateLotComparison(p, [pair(4, 4.1), pair(8, 8.2, 2)]).outcome).toBe("within");
      expect(evaluateLotComparison(p, [pair(4, 5)]).outcome).toBe("outside");
    });
  });

  describe("LA-4 a lot not yet accepted cannot be selected for patients", () => {
    const at = kla("2026-10-13 10:00");
    it.each<[LotState, string | null]>([
      ["received", "not_accepted"],
      ["in_acceptance", "not_accepted"],
      ["accepted", null],
      ["in_use", null],
      ["quarantined", "quarantined"],
      ["rejected", "rejected"],
      ["finished", "finished"],
    ])(
      "LA-4 %s → %s (bench lots in use, analyser and bedside share this check)",
      (state, refusal) => {
        expect(lotRefusal({ state, useBy: "2027-01-01" }, at, TZ)).toBe(refusal);
      },
    );
  });

  it("LA-5 comparison samples are shown as Sample n with their level, recorded by result id", () => {
    const out = evaluateLotComparison(plan({ absolute: 1, combine: "larger" }), [
      pair(4, 4.1),
      pair(8, 8.1, 2),
    ]);
    expect(out.pairs.map((p) => [p.label, p.level, p.observationId])).toEqual([
      ["Sample 1", "low", "obs-1"],
      ["Sample 2", "high", "obs-2"],
    ]);
    expect(Object.keys(out.pairs[0]!)).not.toContain("patientUserId");
  });

  it("LA-6 go-live lots are accepted (before MedSync) only with the lead's statement", () => {
    expect(grandfatherLot("  ")).toBeNull();
    expect(grandfatherLot("Fixture statement by the lead.")).toEqual({
      state: "accepted",
      acceptedBasis: "before_medsync",
      statement: "Fixture statement by the lead.",
    });
  });
});

describe("lots in use (§6.3)", () => {
  const row = (o: Partial<LotInUseRow>): LotInUseRow => ({
    hospitalId: H1,
    deviceId: "analyser-1",
    sectionId: null,
    conceptId: "obs.potassium",
    kind: "reagent",
    lotId: "r1",
    fromAt: kla("2026-10-01 08:00"),
    ...o,
  });
  const rows = [
    row({}),
    row({ lotId: "r2", fromAt: kla("2026-10-10 08:00") }),
    row({ kind: "calibrator", lotId: "cal1" }),
    row({ kind: "control", lotId: "ctl1", conceptId: null }),
    row({ deviceId: "analyser-2", lotId: "other-device" }),
    row({ hospitalId: H2, lotId: "other-hospital", fromAt: kla("2026-10-12 08:00") }),
  ];
  const place = { hospitalId: H1, deviceId: "analyser-1", conceptId: "obs.potassium" };

  it("LU-1 the lots in use per analyser and component: reagent, calibrator, control", () => {
    expect(
      lotsInUse(rows, place, kla("2026-10-11 09:00"))
        .map((r) => r.lotId)
        .sort(),
    ).toEqual(["cal1", "ctl1", "r2"]);
    expect(
      lotsInUse(
        rows,
        { ...place, hospitalId: H2, deviceId: "analyser-1" },
        kla("2026-10-13 09:00"),
      ).map((r) => r.lotId),
    ).toEqual(["other-hospital"]);
  });

  it("LU-2 changing a lot in use needs the lot accepted or in use, not expired", () => {
    const at = kla("2026-10-13 10:00");
    expect(lotRefusal({ state: "in_acceptance", useBy: null }, at, TZ)).toBe("not_accepted");
    expect(lotRefusal({ state: "accepted", useBy: "2026-10-12" }, at, TZ)).toBe("expired");
    expect(lotRefusal({ state: "accepted", useBy: "2026-10-13" }, at, TZ)).toBeNull();
  });

  it("LU-3 a release snapshots the lots at the result time; downtime without a time is 'lot not recorded'", () => {
    expect(lotSnapshot(rows, place, kla("2026-10-05 09:00"))).toEqual({
      reagent: "r1",
      calibrator: "cal1",
      control: "ctl1",
    });
    expect(lotSnapshot(rows, place, kla("2026-10-11 09:00"))).toMatchObject({ reagent: "r2" });
    expect(lotSnapshot(rows, place, null)).toBe("not_recorded");
    expect(lotSnapshot(rows, place, kla("2026-09-01 09:00"))).toBe("not_recorded");
  });
});
