import type { LabReport, ReportRow } from "@/lib/lab/report-store";
import { describe, expect, it } from "vitest";

import { periodHref, periodWords, pickedRange, presetOf, presetParams } from "@/lib/lab/period";
import {
  lastMonths,
  statedTimes,
  trendSeries,
  weeklyMedianTat,
  weekOf,
} from "@/lib/lab/report-trend";

const TODAY = "2026-10-19";
const W = { toDay: "to {day}", range: "{from} to {to}" };

describe("period presets → the reports page's URL parameters (5.9)", () => {
  it("maps every preset to month, or from and to", () => {
    expect(presetParams("today", TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(presetParams("last7", TODAY)).toEqual({ from: "2026-10-13", to: TODAY });
    expect(presetParams("this_month", TODAY)).toEqual({ month: "2026-10" });
    expect(presetParams("last_month", TODAY)).toEqual({ month: "2026-09" });
    expect(presetParams("last3", TODAY)).toEqual({ from: "2026-08-01", to: TODAY });
    expect(presetParams("custom", TODAY)).toEqual({});
    expect(presetParams("last_month", "2026-01-05")).toEqual({ month: "2025-12" });
    expect(presetParams("last3", "2026-02-10")).toEqual({ from: "2025-12-01", to: "2026-02-10" });
  });

  it("knows which preset the current parameters are", () => {
    expect(presetOf({ month: "2026-10", range: null }, TODAY)).toBe("this_month");
    expect(presetOf({ month: "2026-09", range: null }, TODAY)).toBe("last_month");
    expect(presetOf({ month: "2026-05", range: null }, TODAY)).toBe("custom");
    expect(presetOf({ month: "2026-10", range: { from: "2026-10-13", to: TODAY } }, TODAY)).toBe(
      "last7",
    );
    expect(presetOf({ month: "2026-10", range: { from: TODAY, to: TODAY } }, TODAY)).toBe("today");
    expect(
      presetOf({ month: "2026-10", range: { from: "2026-10-02", to: "2026-10-05" } }, TODAY),
    ).toBe("custom");
  });

  it("replaces the period and keeps the other parameters", () => {
    expect(
      periodHref(
        "/lab/reports",
        { tab: "indicators", ward: "w1", month: "2026-01", from: "x" },
        { from: "2026-10-01", to: TODAY },
      ),
    ).toBe("/lab/reports?tab=indicators&ward=w1&from=2026-10-01&to=2026-10-19");
    expect(periodHref("/lab/reports", { section: undefined }, { month: "2026-09" })).toBe(
      "/lab/reports?month=2026-09",
    );
    expect(periodHref("/lab/reports", {}, {})).toBe("/lab/reports");
    expect(pickedRange("2026-10-12", "2026-10-03")).toEqual({
      from: "2026-10-03",
      to: "2026-10-12",
    });
  });

  it("says the period in words", () => {
    expect(periodWords({ month: "2026-10", range: null }, TODAY, W)).toBe(
      "October 2026 · to 19 Oct",
    );
    expect(periodWords({ month: "2026-09", range: null }, TODAY, W)).toBe("September 2026");
    expect(
      periodWords({ month: "2026-10", range: { from: "2026-10-13", to: TODAY } }, TODAY, W),
    ).toBe("13 Oct to 19 Oct");
    expect(periodWords({ month: "2026-10", range: { from: TODAY, to: TODAY } }, TODAY, W)).toBe(
      "19 Oct",
    );
    expect(
      periodWords({ month: "2026-10", range: { from: "2025-12-01", to: TODAY } }, TODAY, W),
    ).toBe("1 Dec 2025 to 19 Oct");
  });
});

const TZ = "Africa/Kampala";
const row = (o: Partial<ReportRow>): ReportRow => ({
  kind: "released",
  ref: "r",
  orderId: null,
  patientUserId: null,
  restricted: false,
  deviceId: null,
  sectionId: null,
  wardId: null,
  priority: null,
  testCode: "fbc",
  at: null,
  receivedAt: null,
  dueAt: null,
  doneAt: null,
  flag: false,
  bedside: false,
  reason: null,
  label: null,
  ...o,
});
const at = (s: string) => new Date(`${s}+03:00`);

describe("the trend read model (5.9)", () => {
  it("lists six months ending with the period, oldest first", () => {
    expect(lastMonths("2026-10")).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(lastMonths("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("keeps no data as null in each tile's series, never 0", () => {
    const report = (workload: number | null) =>
      ({
        tiles: {
          workload:
            workload === null
              ? { kind: "no_data" }
              : { kind: "value", value: workload, numerator: workload, denominator: null },
        },
      }) as unknown as LabReport;
    expect(
      trendSeries([
        { month: "2026-09", report: report(null) },
        { month: "2026-10", report: report(0) },
      ]).workload,
    ).toEqual([null, 0]);
  });

  it("weeks start on Monday, hospital-local", () => {
    expect(weekOf(at("2026-10-19T08:00:00"), TZ)).toBe("2026-10-19");
    expect(weekOf(at("2026-10-18T23:30:00"), TZ)).toBe("2026-10-12");
    expect(weekOf(new Date("2026-10-18T22:30:00Z"), TZ)).toBe("2026-10-19");
  });

  it("gives the engine's median turnaround per week, with empty weeks as no data", () => {
    const rows = [
      row({ receivedAt: at("2026-10-06T08:00:00"), at: at("2026-10-06T08:30:00") }),
      row({ receivedAt: at("2026-10-07T08:00:00"), at: at("2026-10-07T09:00:00") }),
      row({ receivedAt: at("2026-10-08T08:00:00"), at: at("2026-10-08T09:30:00") }),
      row({ receivedAt: null, at: at("2026-10-08T10:00:00") }),
      row({ kind: "specimen", at: at("2026-10-08T10:00:00") }),
      row({ receivedAt: at("2026-10-19T08:00:00"), at: at("2026-10-19T08:20:00") }),
    ];
    const weeks = weeklyMedianTat(rows, {
      hospitalId: "h",
      now: at("2026-10-19T12:00:00"),
      timeZone: TZ,
      from: at("2026-10-05T00:00:00"),
      to: at("2026-11-01T00:00:00"),
      targets: {},
    });
    expect(weeks).toEqual([
      { week: "2026-10-05", median: 60, n: 3 },
      { week: "2026-10-12", median: null, n: 0 },
      { week: "2026-10-19", median: 20, n: 1 },
    ]);
  });

  it("draws one stated time only when the released tests share it", () => {
    const r = [
      row({ testCode: "fbc", receivedAt: at("2026-10-06T08:00:00") }),
      row({ testCode: "u_e", receivedAt: at("2026-10-06T08:00:00") }),
    ];
    expect(statedTimes(r, { fbc: 60, u_e: 60 })).toEqual([60]);
    expect(statedTimes(r, { fbc: 60, u_e: 240 })).toEqual([60, 240]);
    expect(statedTimes(r, {})).toEqual([]);
  });
});
