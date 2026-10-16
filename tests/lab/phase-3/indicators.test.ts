import type { IndicatorId, IndicatorInput } from "@/lib/lab/indicators";
import { describe, expect, it } from "vitest";

import { computeIndicators, drillDown, INDICATORS } from "@/lib/lab/indicators";
import { H1, H2, kla, TZ } from "./_fixtures";

/** A fixture month (October 2026, Kampala) with rows from both hospitals and one row outside the period. */
const from = kla("2026-10-01 00:00");
const to = kla("2026-11-01 00:00");
const now = kla("2026-10-20 12:00");
const rel = (
  releasedAt: string,
  receivedAt: string | null,
  targetMinutes: number | null,
  o: Partial<IndicatorInput["released"][number]> = {},
) => ({
  hospitalId: H1,
  releasedAt: kla(releasedAt),
  receivedAt: receivedAt ? kla(receivedAt) : null,
  targetMinutes,
  amended: false,
  ...o,
});
const input: IndicatorInput = {
  hospitalId: H1,
  from,
  to,
  now,
  timeZone: TZ,
  released: [
    rel("2026-10-02 09:30", "2026-10-02 09:00", 60), // 30 min, on time
    rel("2026-10-02 11:00", "2026-10-02 09:00", 60), // 120 min, late
    rel("2026-10-03 10:00", "2026-10-03 09:00", null), // 60 min, no target
    rel("2026-10-04 10:00", null, 60, { amended: true }), // no receipt time
    rel("2026-09-30 23:00", "2026-09-30 20:00", 60), // September: outside
    rel("2026-10-02 10:00", "2026-10-02 09:00", 60, { hospitalId: H2 }),
  ],
  specimens: [
    { hospitalId: H1, receivedAt: kla("2026-10-02 09:00"), rejected: false },
    { hospitalId: H1, receivedAt: kla("2026-10-02 09:00"), rejected: false },
    { hospitalId: H1, receivedAt: kla("2026-10-02 09:00"), rejected: false },
    { hospitalId: H1, receivedAt: kla("2026-10-03 09:00"), rejected: true },
    { hospitalId: H2, receivedAt: kla("2026-10-03 09:00"), rejected: true },
  ],
  identityChecks: [
    { hospitalId: H1, at: kla("2026-10-02 08:00"), mismatch: true },
    { hospitalId: H1, at: kla("2026-10-02 08:10"), mismatch: false },
    { hospitalId: H2, at: kla("2026-10-02 08:10"), mismatch: true },
  ],
  criticalAlerts: [
    {
      hospitalId: H1,
      sentAt: kla("2026-10-05 10:00"),
      dueAt: kla("2026-10-05 10:15"),
      acknowledgedAt: kla("2026-10-05 10:10"),
    },
    {
      hospitalId: H1,
      sentAt: kla("2026-10-06 10:00"),
      dueAt: kla("2026-10-06 10:15"),
      acknowledgedAt: kla("2026-10-06 10:30"),
    },
    {
      hospitalId: H1,
      sentAt: kla("2026-10-07 10:00"),
      dueAt: kla("2026-10-07 10:15"),
      acknowledgedAt: null,
    },
    { hospitalId: H1, sentAt: kla("2026-10-08 10:00"), dueAt: null, acknowledgedAt: null }, // no signed time
    {
      hospitalId: H2,
      sentAt: kla("2026-10-05 10:00"),
      dueAt: kla("2026-10-05 10:15"),
      acknowledgedAt: kla("2026-10-05 10:10"),
    },
  ],
  qcRuns: [
    { hospitalId: H1, runAt: kla("2026-10-02 07:00"), decision: "accepted" },
    { hospitalId: H1, runAt: kla("2026-10-03 07:00"), decision: "warning" },
    { hospitalId: H1, runAt: kla("2026-10-04 07:00"), decision: "rejected" },
    { hospitalId: H1, runAt: kla("2026-10-05 07:00"), decision: "accepted" },
    { hospitalId: H2, runAt: kla("2026-10-04 07:00"), decision: "rejected" },
  ],
  inHouseTests: ["test.urea_electrolytes", "test.fbc", "test.esr", "test.malaria_rdt"],
  testsWithIqc: ["test.urea_electrolytes", "test.malaria_rdt"],
  eqaRounds: [
    {
      hospitalId: H1,
      id: "r1",
      schemeId: "s1",
      receivedOn: "2026-09-01",
      dueOn: "2026-09-15",
      submittedOn: "2026-09-14",
      scoredOn: "2026-10-10",
      testedBy: [],
      samples: [
        { sampleId: "S1", conceptId: "obs.potassium", score: "unacceptable" },
        { sampleId: "S2", conceptId: "obs.sodium", score: "acceptable" },
        { sampleId: "S3", conceptId: "obs.urea" },
      ],
    },
    {
      hospitalId: H2,
      id: "r2",
      schemeId: "s2",
      receivedOn: "2026-09-01",
      dueOn: "2026-09-15",
      submittedOn: null,
      scoredOn: "2026-10-10",
      testedBy: [],
      samples: [{ sampleId: "S1", conceptId: "obs.potassium", score: "unacceptable" }],
    },
  ],
  eqaCoverage: [
    { testCode: "test.urea_electrolytes", covered: "scheme" },
    { testCode: "test.fbc", covered: "alternative" },
    { testCode: "test.esr", covered: "none" },
    { testCode: "test.malaria_rdt", covered: "scheme" },
  ],
  stockItems: [
    {
      id: "rdt",
      hospitalId: H1,
      name: "Fixture RDT",
      kind: "kit",
      testsPerUnit: 25,
      testCodes: [],
      hmisTracerCode: "SS11",
      minMonths: null,
      maxMonths: null,
    },
    {
      id: "gloves",
      hospitalId: H1,
      name: "Fixture gloves",
      kind: "consumable",
      testsPerUnit: null,
      testCodes: [],
      hmisTracerCode: null,
      minMonths: null,
      maxMonths: null,
    },
    {
      id: "rdt-b",
      hospitalId: H2,
      name: "Fixture RDT",
      kind: "kit",
      testsPerUnit: 25,
      testCodes: [],
      hmisTracerCode: "SS11",
      minMonths: null,
      maxMonths: null,
    },
  ],
  stockTxs: [
    {
      hospitalId: H1,
      itemId: "rdt",
      lotId: null,
      kind: "receipt",
      quantity: 1,
      reason: null,
      at: kla("2026-09-01 09:00"),
    },
    {
      hospitalId: H1,
      itemId: "rdt",
      lotId: null,
      kind: "issue",
      quantity: -1,
      reason: null,
      at: kla("2026-10-17 09:00"),
    },
  ],
  devices: [
    { hospitalId: H1, id: "analyser-1" },
    { hospitalId: H1, id: "analyser-2" },
    { hospitalId: H2, id: "analyser-9" },
  ],
  breakdowns: [
    {
      hospitalId: H1,
      deviceId: "analyser-1",
      since: kla("2026-09-30 22:00"),
      backAt: kla("2026-10-01 04:00"),
    }, // 4 h in October
    { hospitalId: H1, deviceId: "analyser-1", since: kla("2026-10-19 12:00"), backAt: null }, // open: to now, 24 h
    {
      hospitalId: H2,
      deviceId: "analyser-9",
      since: kla("2026-10-02 00:00"),
      backAt: kla("2026-10-03 00:00"),
    },
  ],
};
const empty: IndicatorInput = {
  ...input,
  released: [],
  specimens: [],
  identityChecks: [],
  criticalAlerts: [],
  qcRuns: [],
  inHouseTests: [],
  testsWithIqc: [],
  eqaRounds: [],
  eqaCoverage: [],
  stockItems: [],
  stockTxs: [],
  devices: [],
  breakdowns: [],
};
const v = computeIndicators(input).values;
const value = (id: IndicatorId) => {
  const x = v[id];
  if (x.kind !== "value") throw new Error(`${id} is no_data`);
  return x;
};

describe("quality indicators (§6.12)", () => {
  it("QI-1 every indicator is defined with an id, name, unit and WG-LEPS code where one applies", () => {
    expect(INDICATORS.map((i) => i.id)).toEqual([
      "workload",
      "tat_p50",
      "tat_p90",
      "late_pct",
      "reject_pct",
      "misid_caught",
      "crit_ack_in_time",
      "corrected_pct",
      "qc_reject_pct",
      "no_iqc",
      "eqa_unacc",
      "no_eqa",
      "stockout_days",
      "downtime_h",
    ]);
    expect(INDICATORS.find((i) => i.id === "late_pct")!.wgLeps).toBe("Post-OutTime");
  });

  describe("QI-1 numerator and denominator of each indicator (hospital A only, October)", () => {
    it.each<[IndicatorId, number, number | null, number]>([
      ["workload", 4, null, 4],
      ["tat_p50", 60, 3, 60],
      ["tat_p90", 120, 3, 120],
      ["late_pct", 1, 2, 50],
      ["reject_pct", 1, 4, 25],
      ["misid_caught", 1, null, 1],
      ["crit_ack_in_time", 1, 3, (1 / 3) * 100],
      ["corrected_pct", 1, 4, 25],
      ["qc_reject_pct", 1, 4, 25],
      ["no_iqc", 2, 4, 50],
      ["eqa_unacc", 1, null, 1],
      ["no_eqa", 1, 4, 25],
      ["stockout_days", 3, null, 3],
      ["downtime_h", 28, null, 28],
    ])("QI-1 %s: numerator %d, denominator %s → %d", (id, numerator, denominator, val) => {
      expect(value(id)).toMatchObject({ numerator, denominator });
      expect(value(id).value).toBeCloseTo(val);
    });

    it("QI-1 critical acknowledgement carries the median time; stock-out and downtime carry their breakdown", () => {
      expect(value("crit_ack_in_time").medianMinutes).toBe(10); // nearest-rank median of 10 and 30
      expect(value("stockout_days").by).toEqual({ rdt: 3 });
      expect(value("downtime_h").by).toEqual({ "analyser-1": 28, "analyser-2": 0 });
    });

    it("QI-1 hospital B's rows give hospital B's figures", () => {
      const b = computeIndicators({
        ...input,
        hospitalId: H2,
        inHouseTests: [],
        testsWithIqc: [],
        eqaCoverage: [],
      }).values;
      expect(b.workload).toMatchObject({ value: 1 });
      expect(b.reject_pct).toMatchObject({ value: 100 });
      expect(b.qc_reject_pct).toMatchObject({ value: 100 });
      expect(b.downtime_h).toMatchObject({ value: 24, by: { "analyser-9": 24 } });
      expect(b.stockout_days).toMatchObject({ value: 19 }); // no ledger rows: out every day ended so far (1–19 OCT)
    });
  });

  it("QI-2 a zero denominator or no source rows is no_data, never 0 %", () => {
    const out = computeIndicators(empty).values;
    for (const i of INDICATORS) expect(out[i.id]).toEqual({ kind: "no_data" });
    // Rows exist but none qualifies for the denominator.
    const noTargets = computeIndicators({
      ...empty,
      released: [rel("2026-10-02 09:30", "2026-10-02 09:00", null)],
    }).values;
    expect(noTargets.late_pct).toEqual({ kind: "no_data" });
    expect(noTargets.workload).toMatchObject({ value: 1 });
    expect(
      computeIndicators({ ...empty, criticalAlerts: [input.criticalAlerts[3]!] }).values
        .crit_ack_in_time,
    ).toEqual({ kind: "no_data" });
    // A real 0 % stays 0.
    expect(
      computeIndicators({ ...empty, qcRuns: [input.qcRuns[0]!] }).values.qc_reject_pct,
    ).toMatchObject({ kind: "value", value: 0 });
  });

  it("QI-3 computed at read time with the as-of time", () => {
    expect(computeIndicators(input).asOf).toBe(now);
  });

  it("QI-4 drill-down records go to lab roles only; hospital admin gets aggregates", () => {
    expect(drillDown({ labRole: true }, ["r1"])).toEqual(["r1"]);
    expect(drillDown({ labRole: false }, ["r1"])).toBeNull();
  });
});
