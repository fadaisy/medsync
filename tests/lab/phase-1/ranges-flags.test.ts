import type { CriticalQuery } from "@/lib/lab/flags";
import type { RangeQuery } from "@/lib/lab/ranges";
import { describe, expect, it } from "vitest";

import {
  changeFlag,
  computeFlag,
  evaluateCritical,
  limitSignErrors,
  limitUnitErrors,
} from "@/lib/lab/flags";
import { ageDaysAt, inForceAt, rangeSignErrors, resolveRange } from "@/lib/lab/ranges";
import {
  CONCEPT,
  fixtureLimits,
  fixtureRanges,
  H_A,
  H_B,
  measure,
  minutes,
  T0,
  TEST,
  UNIT,
} from "./_fixtures";

const ADULT = 30 * 365;
const q = (over: Partial<RangeQuery> = {}): RangeQuery => ({
  measure,
  hospitalId: H_A,
  sex: "female",
  ageDaysAtCollection: ADULT,
  at: T0,
  ...over,
});
const band = (over: Partial<RangeQuery> = {}) => {
  const r = resolveRange(q(over), [
    fixtureRanges(),
    fixtureRanges({ id: "rv-b-1", hospitalId: H_B, bands: [] }),
  ]);
  return r.kind === "band" ? r.band.id : r.reason;
};

describe("reference ranges (RR)", () => {
  it("RR-1 returns one band or a reason", () => {
    expect(band()).toBe("adult-f");
    expect(
      resolveRange(q({ measure: { ...measure, resultType: "coded" } }), [fixtureRanges()]),
    ).toEqual({ kind: "none", reason: "not_numeric" });
    expect(resolveRange(q(), [])).toEqual({ kind: "none", reason: "no_signed_range" });
  });

  it("RR-2 only a signed version in force is used; drafts are invisible; the newest in force wins", () => {
    expect(resolveRange(q(), [fixtureRanges({ status: "draft" })])).toMatchObject({
      reason: "no_signed_range",
    });
    expect(resolveRange(q(), [fixtureRanges({ inForceFrom: minutes(1) })])).toMatchObject({
      reason: "no_signed_range",
    });
    const v2 = fixtureRanges({
      id: "rv-a-2",
      version: 2,
      bands: [{ id: "v2", sex: "any", ageFromDays: null, ageToDays: null, low: "1", high: "2" }],
    });
    const r = resolveRange(q(), [fixtureRanges({ supersededAt: minutes(-1) }), v2]);
    expect(r.kind === "band" && r.band.id).toBe("v2");
    // As at a time before v1 was superseded (DT-5), v1 still answers.
    const past = resolveRange(q({ at: minutes(-60) }), [
      fixtureRanges({ supersededAt: minutes(-1) }),
      { ...v2, inForceFrom: minutes(-1) },
    ]);
    expect(past.kind === "band" && past.band.id).toBe("adult-f");
  });

  it("RR-2 another hospital's signed range is never used (two-hospital fixture)", () => {
    expect(band({ hospitalId: H_B })).toBe("no_band_for_age");
    expect(resolveRange(q({ hospitalId: "hospital-c" }), [fixtureRanges()])).toMatchObject({
      reason: "no_signed_range",
    });
  });

  it("RR-3 a sex band beats an any band; two equal bands is a data error, not a guess", () => {
    expect(band({ sex: "male" })).toBe("adult-m");
    const dup = fixtureRanges({
      bands: [
        { id: "x", sex: "female", ageFromDays: null, ageToDays: null, low: "1", high: "2" },
        { id: "y", sex: "female", ageFromDays: null, ageToDays: null, low: "3", high: "4" },
      ],
    });
    expect(resolveRange(q(), [dup])).toEqual({
      kind: "none",
      reason: "no_signed_range",
      conflict: ["x", "y"],
    });
  });

  it.each([
    [0, "neonate"],
    [27, "neonate"],
    [28, "child"],
    [6569, "child"],
    [6570, "adult-f"],
  ])("RR-4 age %i days at collection → %s (from inclusive, to exclusive)", (days, want) => {
    expect(band({ ageDaysAtCollection: days })).toBe(want);
  });

  it("RR-4 age is taken in whole days at collection, on the hospital's calendar", () => {
    expect(ageDaysAt("2026-10-10", new Date("2026-10-11T00:30:00Z"))).toBe(1);
    // 22:30 UTC on the 10th is 01:30 on the 11th in Kampala: day 28, not 27.
    expect(ageDaysAt("2026-09-13", new Date("2026-10-10T22:30:00Z"))).toBe(28);
    expect(ageDaysAt("2026-09-13", new Date("2026-10-10T22:30:00Z"), "UTC")).toBe(27);
    expect(ageDaysAt("2026-10-11", new Date("2026-10-11T20:59:00Z"))).toBe(0);
    expect(ageDaysAt("2026-10-12", T0)).toBeNull();
    expect(ageDaysAt(null, T0)).toBeNull();
    expect(ageDaysAt("12/10/2026", T0)).toBeNull();
  });

  it("RR-5 a missing sex or age reaches only bands that do not need it", () => {
    expect(band({ sex: null })).toBe("adult-any");
    expect(band({ ageDaysAtCollection: null })).toBe("sex_or_age_missing");
    const anyAge = fixtureRanges({
      bands: [{ id: "all", sex: "any", ageFromDays: null, ageToDays: null, low: "1", high: "2" }],
    });
    const r = resolveRange(q({ sex: null, ageDaysAtCollection: null }), [anyAge]);
    expect(r.kind === "band" && r.band.id).toBe("all");
  });

  it("RR-6 a range in another unit is never applied, and makes the version unsignable", () => {
    expect(resolveRange(q(), [fixtureRanges({ unitUcum: "mg/dL" })])).toMatchObject({
      reason: "no_signed_range",
    });
    expect(rangeSignErrors(fixtureRanges({ unitUcum: "mg/dL" }), measure)).toContain(
      "unit_mismatch",
    );
    expect(rangeSignErrors(fixtureRanges(), measure)).toEqual([]);
    const bad = fixtureRanges({
      bands: [
        { id: "a", sex: "male", ageFromDays: 0, ageToDays: 100, low: "5", high: "1" },
        { id: "b", sex: "male", ageFromDays: 50, ageToDays: 200, low: null, high: null },
      ],
    });
    expect(rangeSignErrors(bad, measure)).toEqual(
      expect.arrayContaining(["band_order:a", "band_empty:b", "band_overlap:a:b"]),
    );
  });

  it("RR-7 the resolved band carries what the snapshot stores: low, high, band id and version", () => {
    const r = resolveRange(q(), [fixtureRanges()]);
    expect(
      r.kind === "band" && {
        low: r.band.low,
        high: r.band.high,
        band: r.band.id,
        version: r.version.id,
      },
    ).toEqual({
      low: "50",
      high: "60",
      band: "adult-f",
      version: "rv-a-1",
    });
  });

  it("RR-8 an adult band is never stretched to a child, nor any band past its ages", () => {
    const adultsOnly = fixtureRanges({
      bands: [{ id: "adult", sex: "any", ageFromDays: 6570, ageToDays: null, low: "1", high: "2" }],
    });
    expect(resolveRange(q({ ageDaysAtCollection: 3000 }), [adultsOnly])).toEqual({
      kind: "none",
      reason: "no_band_for_age",
    });
  });

  it("inForceAt: a superseded set answers for its own time only", () => {
    const v = {
      status: "superseded" as const,
      inForceFrom: minutes(-10),
      supersededAt: minutes(-5),
    };
    expect(inForceAt(v, minutes(-6))).toBe(true);
    expect(inForceAt(v, minutes(-5))).toBe(false);
  });
});

describe("flags (FL)", () => {
  it.each([
    ["49.9", "low"],
    ["50", "normal"],
    ["60", "normal"],
    ["60.01", "high"],
  ])("FL-1 %s in [50, 60] → %s (bounds inclusive)", (v, want) => {
    expect(computeFlag(v, { low: "50", high: "60" })).toBe(want);
  });

  it("FL-1 a one-sided band flags one side only", () => {
    expect(computeFlag("1", { low: null, high: "60" })).toBe("normal");
    expect(computeFlag("61", { low: null, high: "60" })).toBe("high");
    expect(computeFlag("1000", { low: "50", high: null })).toBe("normal");
  });

  it("FL-2 no band, no flag", () => {
    expect(computeFlag("55", null)).toBeNull();
    expect(computeFlag("55", { low: null, high: null })).toBeNull();
    expect(computeFlag("positive", { low: "1", high: "2" })).toBeNull();
  });

  it("FL-3 a manual change keeps the computed flag, the chosen one, the reason and the actor", () => {
    expect(
      changeFlag({
        computed: "high",
        chosen: "normal",
        reason: "Haemolysed, repeat sent",
        actorId: "u1",
      }),
    ).toEqual({
      ok: true,
      flagComputed: "high",
      flagFinal: "normal",
      flagChangeReason: "Haemolysed, repeat sent",
      flagChangedBy: "u1",
    });
    expect(changeFlag({ computed: "high", chosen: "normal", reason: " ", actorId: "u1" })).toEqual({
      ok: false,
      reason: "reason_required",
    });
    expect(changeFlag({ computed: "high", chosen: "high", reason: "x", actorId: "u1" })).toEqual({
      ok: false,
      reason: "same_flag",
    });
  });

  const cq = (over: Partial<CriticalQuery> = {}): CriticalQuery => ({
    value: "50",
    resultType: "number",
    testId: TEST,
    conceptId: CONCEPT,
    unitUcum: UNIT,
    hospitalId: H_A,
    ageDays: ADULT,
    at: T0,
    ...over,
  });
  const crit = (
    over: Partial<CriticalQuery> = {},
    versions = [fixtureLimits(), fixtureLimits({ id: "clv-b", hospitalId: H_B, limits: [] })],
  ) => {
    const r = evaluateCritical(cq(over), versions);
    return r.kind === "critical" ? `${r.direction}:${r.limitId}` : r.reason;
  };

  it.each([
    ["4.9", "low:lim-adult"],
    ["5", "low:lim-adult"],
    ["5.01", "within"],
    ["94.99", "within"],
    ["95", "high:lim-adult"],
    ["100", "high:lim-adult"],
  ])(
    "FL-4 %s against the fixture adult limits [5, 95] → %s (at or beyond fires)",
    (value, want) => {
      expect(crit({ value })).toBe(want);
    },
  );

  it("FL-4 only signed, in-force limits for this hospital are used (two-hospital fixture)", () => {
    expect(crit({ value: "1" }, [fixtureLimits({ status: "draft" })])).toBe("no_signed_limits");
    expect(crit({ value: "1", hospitalId: H_B })).toBe("no_limit_for_test");
    expect(crit({ value: "1", hospitalId: "hospital-c" })).toBe("no_signed_limits");
    expect(crit({ value: "1", at: minutes(-60 * 24 * 31) })).toBe("no_signed_limits");
    const r = evaluateCritical(cq({ value: "1" }), [fixtureLimits()]);
    expect(r).toEqual({
      kind: "critical",
      direction: "low",
      limitId: "lim-adult",
      versionId: "clv-a-1",
      version: 1,
    });
  });

  it("FL-4 a neonate is judged by the neonatal limit", () => {
    expect(crit({ value: "30", ageDays: 3 })).toBe("high:lim-neonate");
    expect(crit({ value: "30", ageDays: ADULT })).toBe("within");
  });

  it("FL-5 a limit in another unit never fires, and set-up lists it", () => {
    expect(crit({ value: "1", unitUcum: "mg/dL" })).toBe("no_limit_for_test");
    const unitOf = (t: string, c: string) => (c === CONCEPT && t === TEST ? UNIT : "U/L");
    expect(limitUnitErrors(fixtureLimits().limits, unitOf)).toEqual([]);
    expect(limitUnitErrors(fixtureLimits().limits, () => "mg/dL")).toHaveLength(3);
    expect(limitSignErrors(fixtureLimits().limits, unitOf)).toEqual([]);
    const overlap = [...fixtureLimits().limits, { ...fixtureLimits().limits[0]!, id: "dup" }];
    expect(limitSignErrors(overlap, unitOf)).toContain("limit_overlap:lim-adult:dup");
  });

  it("FL-6 no limit covers the age: not flagged, and says so", () => {
    expect(crit({ value: "1", ageDays: 3000 })).toBe("no_limit_for_age");
    expect(crit({ value: "1", ageDays: null })).toBe("no_limit_for_age");
    // A limit without ages covers any age, known or not.
    expect(
      crit({ value: "600", conceptId: "obs.fixture_other", unitUcum: "U/L", ageDays: null }),
    ).toBe("high:lim-other");
  });

  it("FL-7 coded and text results are never auto-flagged", () => {
    expect(crit({ value: "1", resultType: "coded" })).toBe("not_numeric");
    expect(crit({ value: "positive" })).toBe("not_numeric");
  });
});
