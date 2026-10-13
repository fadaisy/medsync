/** Bedside (PC-*), the HIV algorithm (AL-*), the NCD feed (NF-*) and the result line (DP-*). Fixtures only. */
import type { FeedResult } from "@/lib/ncd/lab-feed";
import { describe, expect, it } from "vitest";

import { bedsideErrors, deriveHivOutcome, glucoseConcept, promptCritical } from "@/lib/lab/bedside";
import { OTHER_UNITS } from "@/lib/lab/catalogue-v2";
import { formatLine } from "@/lib/lab/display";
import { resolveInterpretation } from "@/lib/lab/interpretation";
import { latestForField, outsideCanonical } from "@/lib/ncd/lab-feed";
import { ADULT, config, FIXTURE_SCHEME, refBand, T0 } from "./_fixtures";

describe("PC: bedside", () => {
  const ok = {
    device: { state: "in_use", wardId: "w1", testCode: "test.capillary_glucose" },
    lot: { deviceMatches: true, useBy: "2026-12-31" },
    operatorGranted: true,
    wardId: "w1",
    testCode: "test.capillary_glucose",
    measuredAt: new Date(T0.getTime() - 60_000),
    now: T0,
    lateReason: null,
  };
  it("PC-2 a registered device in use here, a current lot and a granted operator", () => {
    expect(bedsideErrors(ok)).toEqual([]);
    expect(bedsideErrors({ ...ok, device: null })).toContain("device_not_registered");
    expect(bedsideErrors({ ...ok, operatorGranted: false })).toContain("not_an_operator");
    expect(bedsideErrors({ ...ok, device: { ...ok.device, wardId: "w2" } })).toContain(
      "device_other_ward",
    );
  });
  it("PC-3 (S47) a lot past its use-by date is refused", () => {
    expect(bedsideErrors({ ...ok, lot: { deviceMatches: true, useBy: "2026-10-11" } })).toContain(
      "lot_expired",
    );
    expect(
      bedsideErrors({ ...ok, lot: { deviceMatches: true, useBy: "2026-10-12" } }),
    ).not.toContain("lot_expired");
  });
  it("PC-4 (S53) not in the future; older than the window needs a reason", () => {
    expect(bedsideErrors({ ...ok, measuredAt: new Date(T0.getTime() + 60_000) })).toContain(
      "measured_in_future",
    );
    const old = new Date(T0.getTime() - 25 * 3_600_000);
    expect(bedsideErrors({ ...ok, measuredAt: old })).toContain("late_needs_reason");
    expect(bedsideErrors({ ...ok, measuredAt: old, lateReason: "Fixture: power cut" })).toEqual([]);
  });
  it("PC-10 (S48, S52) a device not verified cannot be used", () => {
    expect(bedsideErrors({ ...ok, device: { ...ok.device, state: "not_verified" } })).toContain(
      "device_not_in_use",
    );
  });
  it("PC-6 (S49) HI prompts a critical mark, never flags; PC-7 the fasting answer chooses the concept", () => {
    expect(promptCritical("above_range")).toBe(true);
    expect(promptCritical("below_range")).toBe(false);
    expect(glucoseConcept(true)).toBe("obs.glucose_fasting");
    expect(glucoseConcept(false)).toBe("obs.glucose");
  });
  it("PC-5 (S46) a bedside result against a lab-only scheme gets no category", () => {
    const r = resolveInterpretation({
      conceptId: "obs.fixture_hb",
      unitUcum: "g/dL",
      value: "10",
      sex: "female",
      ageDaysAtCollection: ADULT,
      pregnancy: { state: "not_pregnant" },
      method: "bedside",
      at: T0,
      reference: refBand("9", "16"),
      configs: [
        config("flag_basis", "obs.fixture_hb", { basis: "scheme" }),
        config("scheme", "obs.fixture_hb", FIXTURE_SCHEME),
      ],
    });
    expect(r.category).toBeNull();
    expect(r.fallback).toBe("method_not_covered");
  });
});

describe("AL: the HIV testing algorithm", () => {
  const v = config("hiv_algorithm", "serial", {
    assays: [
      { step: 1, kit: "Fixture kit A" },
      { step: 2, kit: "Fixture kit B" },
      { step: 3, kit: "Fixture kit C" },
    ],
    rules: [
      { t1: "non_reactive", t2: null, t3: null, outcome: "negative" },
      { t1: "reactive", t2: "reactive", t3: null, outcome: "positive" },
      { t1: "reactive", t2: "non_reactive", t3: "reactive", outcome: "inconclusive" },
      { t1: "reactive", t2: "non_reactive", t3: "non_reactive", outcome: "negative" },
    ],
    retestDays: 14,
    circular: "fixture circular",
  }).payload;
  it("AL-2 every path of the signed table; no row means the next assay", () => {
    expect(deriveHivOutcome(v, "non_reactive", null, null)).toBe("negative");
    expect(deriveHivOutcome(v, "reactive", "reactive", null)).toBe("positive");
    expect(deriveHivOutcome(v, "reactive", "non_reactive", "reactive")).toBe("inconclusive");
    expect(deriveHivOutcome(v, "reactive", "non_reactive", "non_reactive")).toBe("negative");
    expect(deriveHivOutcome(v, "reactive", "non_reactive", null)).toBeNull();
    expect(deriveHivOutcome(v, "reactive", null, null)).toBeNull();
  });
});

describe("NF: the NCD feed", () => {
  const mapping = { concept: "obs.hba1c", unit: "%", methods: ["lab" as const], windowDays: 90 };
  const r = (o: Partial<FeedResult> = {}): FeedResult => ({
    reportId: "r1",
    version: 1,
    observationId: "o1",
    conceptId: "obs.hba1c",
    value: "8.1",
    unit: "%",
    method: "lab",
    released: true,
    superseded: false,
    restricted: false,
    labOnly: false,
    releasedAt: new Date(T0.getTime() - 86_400_000),
    amended: false,
    ...o,
  });
  it("NF-1 no signed mapping, nothing filled", () => {
    expect(latestForField(null, [r()], T0)).toMatchObject({ kind: "none", reason: "not_mapped" });
  });
  it("NF-2 (S55) the latest released current result fills the field, with the previous one", () => {
    const older = r({
      reportId: "r0",
      value: "7.9",
      releasedAt: new Date(T0.getTime() - 10 * 86_400_000),
    });
    expect(latestForField(mapping, [older, r()], T0)).toMatchObject({
      kind: "filled",
      result: { value: "8.1" },
      previous: { value: "7.9" },
    });
  });
  it("NF-3 (S56) an amended version replaces the superseded one", () => {
    const v1 = r({ superseded: true });
    const v2 = r({
      version: 2,
      value: "8.4",
      amended: true,
      releasedAt: new Date(T0.getTime() - 3_600_000),
    });
    expect(latestForField(mapping, [v1, v2], T0)).toMatchObject({
      result: { value: "8.4", amended: true },
    });
  });
  it("NF-2 (S59, S60) none in the window; another unit is listed, never used; method and restriction", () => {
    expect(
      latestForField(mapping, [r({ releasedAt: new Date(T0.getTime() - 100 * 86_400_000) })], T0),
    ).toMatchObject({ reason: "none_in_window" });
    const other = latestForField(mapping, [r({ unit: "mmol/mol" })], T0);
    expect(other).toMatchObject({ kind: "none", reason: "unit_differs" });
    expect(other.kind === "none" && other.unusable).toHaveLength(1);
    expect(latestForField(mapping, [r({ method: "bedside" })], T0)).toMatchObject({
      reason: "method_not_accepted",
    });
    expect(latestForField(mapping, [r({ restricted: true })], T0)).toMatchObject({
      reason: "restricted",
    });
  });
  it("AP-6 lab-only rows never reach the feed; preliminaries are not released", () => {
    expect(latestForField(mapping, [r({ labOnly: true })], T0)).toMatchObject({
      reason: "none_in_window",
    });
    expect(latestForField(mapping, [r({ released: false })], T0)).toMatchObject({
      reason: "none_in_window",
    });
  });
  it("NF-7 an outside result converts by the plain factor only", () => {
    expect(outsideCanonical(20, "g/L", "g/dL", [{ unit: "g/L", multiplyBy: 10 }])).toBe(2);
    expect(outsideCanonical(2, "g/dL", "g/dL", [])).toBe(2);
    expect(outsideCanonical(2, "mmol/mol", "%", [{ unit: "mmol/mol" }])).toBeNull();
  });
});

describe("DP: one result line", () => {
  it("DP-1 a scheme's category in words with its arrow, the basis line and the bedside tag", () => {
    const interpretation = resolveInterpretation({
      conceptId: "obs.fixture_hb",
      unitUcum: "g/dL",
      value: "10.4",
      sex: "female",
      ageDaysAtCollection: ADULT,
      pregnancy: { state: "not_recorded" },
      method: "lab",
      at: T0,
      reference: refBand("9.0", "16.0"),
      configs: [
        config("flag_basis", "obs.fixture_hb", { basis: "scheme" }),
        config("scheme", "obs.fixture_hb", FIXTURE_SCHEME),
      ],
    });
    const l = formatLine({
      value: "10.4",
      unitDisplay: "g/dL",
      decimalPlaces: 1,
      interpretation,
      bedside: true,
      method: "lab",
      previous: null,
    });
    expect(l.flag).toBe("↓ Moderate fixture");
    expect(l.abnormal).toBe(true);
    expect(l.basis).toContain("Fixture scheme 2026");
    expect(l.basis).toContain("9.0 – 16.0");
    expect(l.bedside).toBe("Bedside");
    expect(l.notes.join(" ")).toMatch(/Altitude not adjusted/);
  });
  it("DP-3 the previous value only when unit and method match", () => {
    const base = {
      value: "5",
      unitDisplay: "mmol/L",
      decimalPlaces: 1,
      interpretation: null,
      bedside: false,
      method: "lab",
    };
    expect(
      formatLine({
        ...base,
        previous: { value: "4.8", unitDisplay: "mmol/L", method: "lab", on: "1 OCT 2026" },
      }).previous,
    ).toBe("4.8 mmol/L on 1 OCT 2026");
    expect(
      formatLine({
        ...base,
        previous: { value: "4.8", unitDisplay: "mmol/L", method: "bedside", on: "1 OCT 2026" },
      }).previous,
    ).toBe("previous result not comparable");
  });

  it("the four factors the research file wrote the other way round convert as the CSO checked them (13 Oct 2026)", () => {
    const to = (c: string, v: number, unit: string, canonical: string) =>
      outsideCanonical(v, unit, canonical, OTHER_UNITS[c] ?? []);
    expect(to("obs.uacr", 100, "mg/g", "mg/mmol")).toBeCloseTo(11.3, 6);
    expect(to("obs.chol_ldl_direct", 100, "mg/dL", "mmol/L")).toBeCloseTo(2.586, 6);
    expect(to("obs.d_dimer", 500, "ug/L{FEU}", "mg/L{FEU}")).toBeCloseTo(0.5, 9);
    expect(to("obs.d_dimer_ddu", 500, "ug/L{DDU}", "mg/L{DDU}")).toBeCloseTo(0.5, 9);
  });
});
