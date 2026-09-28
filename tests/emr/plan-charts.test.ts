/**
 * Monitoring charts opened by the plan (ADR 0189): the fluid arithmetic, the running balance with
 * blanks, and the rule table (which plan items open which chart; proposed rules off).
 */
import type { FluidEntry } from "@/lib/emr/charts/fluids";
import type { PlanForCharts } from "@/lib/emr/charts/rules";
import { describe, expect, it } from "vitest";

import {
  chartDayStart,
  dropsPerMinute,
  fluidHours,
  fluidSummary,
  mlPerHour,
  urineReferenceMlPerHour,
} from "@/lib/emr/charts/fluids";
import { CHART_RULES, chartsToOpen } from "@/lib/emr/charts/rules";

describe("fluid arithmetic", () => {
  it("mL/h from minutes and from hours", () => {
    expect(mlPerHour(1000, { value: 8, unit: "h" })).toBe(125);
    expect(mlPerHour(500, { value: 30, unit: "min" })).toBe(1000);
    expect(mlPerHour(250, { value: 15, unit: "min" })).toBe(1000);
    expect(mlPerHour(1000, { value: 480, unit: "min" })).toBe(125);
    expect(mlPerHour(0, { value: 8, unit: "h" })).toBeNull();
    expect(mlPerHour(1000, { value: 0, unit: "h" })).toBeNull();
  });

  it("drops/min on a 20-drop and a 60-drop set", () => {
    expect(dropsPerMinute(125, 20)).toBe(42);
    expect(dropsPerMinute(125, 60)).toBe(125);
    expect(dropsPerMinute(0, 20)).toBeNull();
  });

  it("0.5 mL/kg/h for 58 kg is 29 mL/h; no weight, no line", () => {
    expect(urineReferenceMlPerHour(58)).toBe(29);
    expect(urineReferenceMlPerHour(null)).toBeNull();
  });

  it("the chart day starts at midnight in Kampala", () => {
    expect(chartDayStart(new Date("2026-09-28T20:30:00Z")).toISOString()).toBe(
      "2026-09-27T21:00:00.000Z",
    );
    expect(chartDayStart(new Date("2026-09-28T21:30:00Z")).toISOString()).toBe(
      "2026-09-28T21:00:00.000Z",
    );
  });
});

describe("the running balance", () => {
  const day = new Date("2026-09-27T21:00:00Z"); // 00:00 EAT
  const h = (n: number) => new Date(day.getTime() + n * 3600000 + 10 * 60000);
  const e = (
    id: string,
    kind: FluidEntry["kind"],
    volumeMl: number | null,
    hour: number,
    extra: Partial<FluidEntry> = {},
  ): FluidEntry => ({
    id,
    kind,
    volumeMl,
    measured: volumeMl != null,
    effectiveAt: h(hour),
    ...extra,
  });

  it("blank is not zero: an hour with no entry is a gap, and the balance sums recorded entries only", () => {
    const rows = fluidHours(
      [
        e("a", "iv_in", 125, 0, { prescriptionId: "rx1" }),
        e("b", "urine_out", 40, 0),
        e("c", "iv_in", 125, 2),
        e("d", "urine_out", null, 2),
      ],
      { dayStart: day, until: h(3) },
    );
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      ivInTotal: 125,
      urineOut: 40,
      running: 85,
      gap: false,
      ivIn: { rx1: 125 },
    });
    expect(rows[1]).toMatchObject({ gap: true, running: null, totalIn: null, urineOut: null });
    expect(rows[2]).toMatchObject({
      ivInTotal: 125,
      urineOut: null,
      urineNotMeasured: true,
      running: 210,
    });
    expect(rows[3]!.gap).toBe(true);
  });

  it("a correction replaces its entry; entered in error withdraws it", () => {
    const rows = fluidHours(
      [
        e("a", "oral_in", 200, 0),
        e("a2", "oral_in", 250, 0, { replacesId: "a" }),
        e("b", "urine_out", 100, 0),
        e("b-eie", "urine_out", null, 0, { replacesId: "b", state: "entered_in_error" }),
      ],
      { dayStart: day, until: h(1) },
    );
    expect(rows[0]).toMatchObject({ oralIn: 250, urineOut: null, running: 250 });
  });

  it("the 24-hour summary counts hours below the reference line, per hour on a 4-hourly chart", () => {
    const hourly = fluidHours([e("a", "urine_out", 20, 0), e("b", "urine_out", 40, 1)], {
      dayStart: day,
      until: h(2),
    });
    expect(fluidSummary(hourly, 29)).toEqual({
      totalIn: 0,
      totalOut: 60,
      net: -60,
      hoursBelowReference: 1,
      hoursRecorded: 2,
    });
    const four = fluidHours([e("a", "urine_out", 100, 0)], {
      dayStart: day,
      until: h(4),
      stepHours: 4,
    });
    expect(fluidSummary(four, 29, 4).hoursBelowReference).toBe(4);
    expect(fluidSummary(hourly, null).hoursBelowReference).toBeNull();
  });
});

describe("the chart rule table", () => {
  const plan = (over: Partial<PlanForCharts>): PlanForCharts => ({
    observationFrequency: null,
    problems: [],
    items: [],
    news2AtClerking: null,
    ...over,
  });
  const kinds = (p: PlanForCharts) => chartsToOpen(p).map((c) => c.kind);

  it("observation frequency opens the observations chart at that frequency", () => {
    const [c] = chartsToOpen(plan({ observationFrequency: "hourly" }));
    expect(c).toMatchObject({
      kind: "observations",
      rule: "obs.frequency",
      frequency: "hourly",
      label: "Hourly observations in the plan",
    });
  });

  it("an IV fluid opens fluid balance (hourly) and the MAR; a glucose fluid also opens glucose", () => {
    const items = [
      {
        type: "prescription" as const,
        id: "rx1",
        drugId: "glucose_10",
        classId: "fluid.iv",
        kind: "fluid" as const,
        label: "Glucose 10% 500 mL over 4 h",
      },
    ];
    const out = chartsToOpen(plan({ items }));
    expect(out.map((c) => c.kind)).toEqual(["fluid_balance", "glucose", "mar"]);
    expect(out[0]).toMatchObject({
      frequency: "hourly",
      items: [{ type: "prescription", id: "rx1" }],
    });
    expect(out[1]!.rule).toBe("glucose.fluid");
  });

  it("insulin or a sulfonylurea opens glucose; any prescription opens the MAR", () => {
    const rx = (drugId: string, classId: string) => ({
      type: "prescription" as const,
      id: drugId,
      drugId,
      classId,
      kind: "drug" as const,
      label: drugId,
    });
    expect(kinds(plan({ items: [rx("insulin_soluble", "insulin")] }))).toEqual(["glucose", "mar"]);
    expect(kinds(plan({ items: [rx("gliclazide", "oral_glucose_lowering")] }))).toEqual([
      "glucose",
      "mar",
    ]);
    expect(kinds(plan({ items: [rx("metformin", "oral_glucose_lowering")] }))).toEqual(["mar"]);
    expect(kinds(plan({ items: [rx("ceftriaxone", "abx.cephalosporin.3")] }))).toEqual(["mar"]);
  });

  it("hypothermia or fever on the problem list opens temperature", () => {
    expect(
      kinds(plan({ problems: [{ profileId: "dx.hypothermia_accidental", label: "Hypothermia" }] })),
    ).toEqual(["temperature"]);
  });

  it("a repeated glucose test is glucose monitoring; once is not", () => {
    const o = (frequency: string | null) => ({
      type: "order" as const,
      id: "o1",
      testKey: "test.glucose_random",
      frequency,
      label: "Random blood glucose",
    });
    expect(chartsToOpen(plan({ items: [o("6h")] }))[0]).toMatchObject({
      kind: "glucose",
      frequency: "6h",
    });
    expect(kinds(plan({ items: [o("once")] }))).toEqual([]);
  });

  it("proposed rules are off until signed: AKI or sepsis alone, and NEWS2 at clerking, open nothing", () => {
    expect(CHART_RULES.filter((r) => r.status === "proposed").map((r) => r.id)).toEqual([
      "obs.news2_clerking",
      "fluid.problem",
    ]);
    expect(
      kinds(plan({ problems: [{ profileId: "dx.sepsis", label: "Sepsis" }], news2AtClerking: 5 })),
    ).toEqual([]);
  });
});
