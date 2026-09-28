import type {
  ChartRowIn,
  FluidEntryRowIn,
  PrescriptionRowIn,
  VitalReading,
} from "@/lib/emr/charts/build";
import type { FluidBalanceBody, MonitoringChartCard } from "@/lib/emr/charts/payload";
import { describe, expect, it } from "vitest";

import { monitoringFixture } from "@/app/styleguide/monitoring/_lib/fixture";
import {
  buildFluidBody,
  buildGlucoseBody,
  buildMonitoringPayload,
  buildObservationsBody,
  buildTemperatureBody,
  NEWS2_BANDS,
} from "@/lib/emr/charts/build";
import { HYPO_THRESHOLD_MMOL } from "@/lib/prescribing/plan-checks";
import {
  CLOSEOUT_REF,
  NEWS2_EMERGENCY_MIN,
  NEWS2_URGENT_MIN,
} from "@/lib/resus/reference/levels-of-care";

/** Kampala is UTC+3. */
const k = (hhmm: string, day = 28) => new Date(`2026-09-${day}T${hhmm}:00+03:00`);
const DAY = k("00:00");

const chart = (o: Partial<ChartRowIn> = {}): ChartRowIn => ({
  id: "c-1",
  kind: "fluid_balance",
  openedBy: { rule: "fluid.iv", label: "Ringer's lactate 1000 mL over 8 h", items: [] },
  frequency: "hourly",
  measureUrine: true,
  openedAt: k("23:40", 27),
  closedAt: null,
  ...o,
});

let n = 0;
const entry = (
  hhmm: string,
  kind: string,
  volume: number | null,
  o: Partial<FluidEntryRowIn> = {},
): FluidEntryRowIn => ({
  id: `e-${++n}`,
  kind,
  routeDetail: null,
  volumeMl: volume === null ? null : String(volume),
  measured: volume !== null,
  prescriptionId: null,
  effectiveAt: k(hhmm),
  recordedAt: k(hhmm),
  state: "recorded",
  replacesId: null,
  ...o,
});

const RL: PrescriptionRowIn = {
  id: "rx-rl",
  drugName: "Ringer's lactate",
  dose: "1000 mL",
  route: "iv",
  frequency: null,
  prn: false,
  start: "now",
  state: "active",
  kind: "fluid",
  fluidPurpose: "maintenance",
  volumeMl: "1000",
  overMinutes: 480,
  givingSetDropsPerMl: 20,
  createdAt: k("23:40", 27),
};

const fluid = (
  entries: FluidEntryRowIn[],
  o: { now?: Date; chart?: Partial<ChartRowIn>; weightKg?: number | null } = {},
): FluidBalanceBody =>
  buildFluidBody({
    chart: chart(o.chart),
    entries,
    prescriptions: [RL],
    weightKg: o.weightKg === undefined ? 58 : o.weightKg,
    dayStart: DAY,
    now: o.now ?? k("05:20"),
  });

describe("fluid balance body", () => {
  it("the running balance sums recorded entries only; a blank hour is null, never 0", () => {
    const b = fluid([
      entry("00:30", "iv_in", 125, { prescriptionId: "rx-rl" }),
      entry("00:40", "urine_out", 40),
      entry("01:30", "iv_in", 125, { prescriptionId: "rx-rl" }),
      // 02:00 to 03:00: nothing
      entry("03:10", "oral_in", 100),
      entry("03:20", "other_out", 150),
    ]);
    const h = b.hours;
    expect(h.map((r) => r.running)).toEqual([85, 210, null, 160, null, null]);
    expect(h[2]).toMatchObject({ gap: true, totalIn: null, totalOut: null, oralIn: null });
    expect(h[0]!.ivIn).toEqual({ "rx-rl": 125 });
    expect(h[1]).toMatchObject({ oralIn: null, urineOut: null, otherOut: null });
    expect(b.summary).toMatchObject({ totalIn: 350, totalOut: 190, net: 160, hoursRecorded: 3 });
  });

  it("marks the gap hours and only the hour under way as in progress", () => {
    const b = fluid([entry("00:30", "urine_out", 40)], { now: k("03:20") });
    expect(b.hours.map((r) => r.gap)).toEqual([false, true, true, true]);
    expect(b.hours.map((r) => r.inProgress)).toEqual([false, false, false, true]);
  });

  it("urine not measured is stated, never 0, and adds nothing to out", () => {
    const b = fluid([entry("00:30", "urine_out", null), entry("00:40", "iv_in", 125)]);
    expect(b.hours[0]).toMatchObject({
      urineOut: null,
      urineNotMeasured: true,
      totalOut: null,
      running: 125,
      gap: false,
    });
    expect(b.summary.totalOut).toBe(0);
    expect(b.entries.find((e) => e.kind === "urine_out")).toMatchObject({
      volumeMl: null,
      measured: false,
    });
  });

  it("a replaced entry and an entry withdrawn as in error are neither counted nor listed", () => {
    const misread = entry("00:30", "urine_out", 53);
    const correction = entry("00:30", "urine_out", 35, { replacesId: misread.id });
    const twice = entry("00:50", "iv_in", 125);
    const withdrawn = entry("00:50", "iv_in", null, {
      state: "entered_in_error",
      replacesId: twice.id,
      measured: true,
    });
    const b = fluid([entry("00:40", "iv_in", 125), misread, correction, twice, withdrawn]);
    expect(b.hours[0]).toMatchObject({ urineOut: 35, ivInTotal: 125, running: 90 });
    expect(b.entries.map((e) => e.id).sort()).toEqual(
      [correction.id, b.entries.find((e) => e.kind === "iv_in")!.id].sort(),
    );
    expect(b.entries.find((e) => e.id === correction.id)!.corrects).toBe(true);
    expect(b.entries.some((e) => e.id === misread.id || e.id === twice.id)).toBe(false);
  });

  it("a 4-hourly chart buckets by 4 hours and compares urine per hour with the reference", () => {
    const b = fluid(
      [
        entry("00:30", "urine_out", 100),
        entry("05:10", "urine_out", 160),
        entry("06:00", "iv_in", 500),
      ],
      { chart: { frequency: "4h" }, now: k("09:00") },
    );
    expect(b.stepHours).toBe(4);
    expect(b.hours.map((r) => r.start)).toEqual([
      k("00:00").toISOString(),
      k("04:00").toISOString(),
      k("08:00").toISOString(),
    ]);
    expect(b.hours[1]).toMatchObject({ urineOut: 160, ivInTotal: 500 });
    // 100 mL over 4 h = 25 mL/h, below 29: four hours; 160 over 4 h = 40 mL/h is not.
    expect(b.summary.hoursBelowReference).toBe(4);
  });

  it("the reference line is 0.5 mL/kg/h × the vitals weight; no weight, no line", () => {
    expect(fluid([entry("00:30", "urine_out", 20)]).urineReference).toMatchObject({
      mlPerHour: 29,
      mlPerKgPerHour: 0.5,
      label: "KDIGO oliguria threshold, to verify",
    });
    const none = fluid([entry("00:30", "urine_out", 20)], { weightKg: null });
    expect(none.urineReference).toBeNull();
    expect(none.summary.hoursBelowReference).toBeNull();
  });

  it("hours before the plan opened the chart are left off, not shown as gaps", () => {
    const b = fluid([entry("03:40", "iv_in", 125)], {
      chart: { openedAt: k("03:30") },
      now: k("05:10"),
    });
    expect(b.hours.map((r) => r.start)).toEqual(
      ["03:00", "04:00", "05:00"].map((t) => k(t).toISOString()),
    );
  });

  it("each fluid gets an IV row with its planned rate and drops per minute", () => {
    const b = fluid([]);
    expect(b.ivLines).toEqual([
      {
        key: "rx-rl",
        label: "Ringer's lactate 1000 mL over 8 h",
        volumeMl: 1000,
        overMinutes: 480,
        mlPerHour: 125,
        dropsPerMinute: 42,
        dropsPerMl: 20,
        purpose: "Maintenance",
      },
    ]);
    const other = fluid([entry("00:10", "iv_in", 50)]);
    expect(other.ivLines.map((l) => l.key)).toEqual(["rx-rl", "other"]);
  });
});

/* ─── Observations ───────────────────────────────────────────────── */

const vitalSet = (
  key: string,
  at: Date,
  v: Partial<Record<"rr" | "spo2" | "sbp" | "pulse" | "temp", number>>,
  o: { acvpu?: "A" | "V" | null; oxygen?: "air" | "oxygen" | null; site?: string } = {},
): VitalReading[] => {
  const acvpu = o.acvpu === undefined ? "A" : o.acvpu;
  const oxygen = o.oxygen === undefined ? "air" : o.oxygen;
  return [
    ...Object.entries(v).map(([kk, value]) => ({
      id: `${key}-${kk}`,
      key: kk as VitalReading["key"],
      value,
      acvpu,
      at,
      setKey: key,
      oxygen: kk === "spo2" ? oxygen : null,
      site: kk === "temp" ? (o.site ?? null) : null,
    })),
  ];
};

describe("observations and NEWS2", () => {
  const opened = { openedAt: k("23:40", 27) };
  it("scores a complete set with the triage engine; the clerking set is an ink origin", () => {
    const body = buildObservationsBody({
      chart: opened,
      vitals: [
        ...vitalSet("clerk", k("23:00", 27), {
          rr: 22,
          spo2: 96,
          sbp: 108,
          pulse: 104,
          temp: 38.4,
        }),
        ...vitalSet("n1", k("02:00"), { rr: 20, spo2: 96, sbp: 110, pulse: 96, temp: 38.1 }),
      ],
    });
    expect(body.news2).toEqual([
      { at: k("23:00", 27).toISOString(), total: 5, origin: "clerking" },
      { at: k("02:00").toISOString(), total: 3, origin: "nursing" },
    ]);
    expect(body.incompleteSets).toBe(0);
    expect(body.strips.find((s) => s.key === "rr")!.points.map((p) => p.origin)).toEqual([
      "clerking",
      "nursing",
    ]);
    expect(body.consciousness.map((c) => c.value)).toEqual(["A", "A"]);
  });

  it("a set missing an input is not scored (a gap is never read as normal), only counted", () => {
    const body = buildObservationsBody({
      chart: opened,
      vitals: vitalSet("p", k("03:00"), { rr: 16, spo2: 97 }, { acvpu: null, oxygen: null }),
    });
    expect(body.news2).toEqual([]);
    expect(body.incompleteSets).toBe(1);
    expect(body.strips.find((s) => s.key === "spo2")!.points).toHaveLength(1);
  });

  it("a triage value is a clerking value even when taken after the chart opened", () => {
    const body = buildObservationsBody({
      chart: opened,
      vitals: vitalSet("t", k("00:10"), { rr: 18 }).map((r) => ({ ...r, fromTriage: true })),
    });
    expect(body.strips.find((s) => s.key === "rr")!.points[0]!.origin).toBe("clerking");
  });

  it("the bands are the signed CO-NEWS entries, thresholds from the reference, one emergency band", () => {
    expect(NEWS2_BANDS.map((b) => [b.from, b.to, b.refId])).toEqual([
      [0, 0, "CO-NEWS-05"],
      [1, NEWS2_URGENT_MIN - 1, "CO-NEWS-04"],
      [NEWS2_URGENT_MIN, NEWS2_EMERGENCY_MIN - 1, "CO-NEWS-02"],
      [NEWS2_EMERGENCY_MIN, null, "CO-NEWS-01"],
    ]);
    for (const b of NEWS2_BANDS) expect(CLOSEOUT_REF[b.refId]!.text.startsWith(b.label)).toBe(true);
    expect(NEWS2_BANDS.filter((b) => b.emergency).map((b) => b.label)).toEqual([
      "NEWS2 ≥ 7: emergency response",
    ]);
  });
});

describe("temperature and glucose", () => {
  const opened = { openedAt: k("23:40", 27) };
  it("a rectal reading is core; other or unrecorded sites are peripheral; 35 °C is a draft line", () => {
    const body = buildTemperatureBody({
      chart: opened,
      vitals: [
        ...vitalSet("a", k("01:00"), { temp: 38.6 }, { site: "rectal" }),
        ...vitalSet("b", k("02:00"), { temp: 38.1 }, { site: "axillary" }),
        ...vitalSet("c", k("03:00"), { temp: 37.9 }),
      ],
    });
    expect(body.points.map((p) => [p.site, p.siteLabel])).toEqual([
      ["core", "rectal"],
      ["peripheral", "axillary"],
      ["peripheral", null],
    ]);
    expect(body.reference).toEqual({ value: 35, label: "35 °C, to verify" });
  });

  it("glucose draws against the signed hypoglycaemia threshold", () => {
    const body = buildGlucoseBody({
      chart: opened,
      vitals: [{ id: "g", key: "glucose", value: 3.8, at: k("04:00"), setKey: "g" }],
    });
    expect(body.reference).toEqual({
      value: HYPO_THRESHOLD_MMOL,
      label: "4.0 mmol/L (JBDS 2023)",
    });
    expect(body.points).toEqual([{ at: k("04:00").toISOString(), value: 3.8, origin: "nursing" }]);
  });
});

/* ─── The payload ────────────────────────────────────────────────── */

describe("the payload", () => {
  it("one card per chart in the rule table's order, with what opened it in words", () => {
    const p = buildMonitoringPayload({
      charts: [
        chart({
          id: "m",
          kind: "mar",
          openedBy: { rule: "mar.rx", label: "2 prescriptions" },
          frequency: null,
        }),
        chart({ id: "unknown", kind: "neuro" }),
        chart({ id: "f" }),
        chart({
          id: "o",
          kind: "observations",
          openedBy: { rule: "obs.frequency", label: "Hourly observations in the plan" },
        }),
      ],
      fluidEntries: [],
      prescriptions: [],
      mar: [],
      vitals: [],
      weight: null,
      now: k("05:00"),
    });
    expect(p.charts.map((c) => c.kind)).toEqual(["observations", "fluid_balance", "mar"]);
    const f = p.charts[1] as Extract<MonitoringChartCard, { kind: "fluid_balance" }>;
    expect(f).toMatchObject({
      name: "Fluid balance",
      openedByLabel: "Ringer's lactate 1000 mL over 8 h",
      rule: "An IV fluid prescription placed",
      frequency: "Hourly",
      measureUrine: true,
      closedAt: null,
    });
    expect(p.dayStart).toBe(DAY.toISOString());
    expect(p.weight).toBeNull();
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it("the styleguide fixture holds the numbers the spec names", () => {
    const p = monitoringFixture();
    const f = p.charts.find((c) => c.kind === "fluid_balance")!.body as FluidBalanceBody;
    expect(f.ivLines[0]).toMatchObject({ mlPerHour: 125, dropsPerMinute: 42, dropsPerMl: 20 });
    expect(f.urineReference?.mlPerHour).toBe(29);
    expect(f.hours.find((h) => h.start === k("03:00").toISOString())).toMatchObject({ gap: true });
    expect(f.hours.find((h) => h.start === k("02:00").toISOString())).toMatchObject({
      urineNotMeasured: true,
      urineOut: null,
    });
    expect(f.summary).toEqual({
      totalIn: 850,
      totalOut: 312,
      net: 538,
      hoursBelowReference: 1,
      hoursRecorded: 6,
    });
    const o = p.charts.find((c) => c.kind === "observations")!;
    if (o.kind !== "observations") throw new Error("observations");
    expect(o.body.news2[0]).toMatchObject({ total: 5, origin: "clerking" });
    expect(o.body.news2.slice(1).every((x) => x.origin === "nursing")).toBe(true);
    expect(o.body.incompleteSets).toBe(1);
  });
});
