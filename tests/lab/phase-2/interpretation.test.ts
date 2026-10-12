/**
 * Decision schemes, flag basis, elevation and pregnancy (DS-1..DS-11), Phase 1's resolver with methods and
 * rejected bands (ME-2, RI-6), and the HbA1c IFCC display (CC-9). Fixture values only.
 */
import type { InterpretQuery } from "@/lib/lab/interpretation";
import { describe, expect, it } from "vitest";

import { categoryFor, hba1cIfcc, resolveInterpretation } from "@/lib/lab/interpretation";
import { rangeSignErrors, resolveRange } from "@/lib/lab/ranges";
import { configSignErrors } from "@/lib/lab/signed-config";
import { ADULT, CHILD, config, FIXTURE_SCHEME, refBand, T0 } from "./_fixtures";

const basis = config("flag_basis", "obs.fixture_hb", { basis: "scheme" });
const scheme = config("scheme", "obs.fixture_hb", FIXTURE_SCHEME);
const elevation = config("elevation", "hospital", { metres: 1200, source: "fixture survey" });

const q = (o: Partial<InterpretQuery> = {}): InterpretQuery => ({
  conceptId: "obs.fixture_hb",
  unitUcum: "g/dL",
  value: "10.4",
  sex: "female",
  ageDaysAtCollection: ADULT,
  pregnancy: { state: "not_pregnant" },
  method: "lab",
  at: T0,
  reference: refBand("9.0", "16.0"),
  configs: [basis, scheme, elevation],
  ...o,
});

describe("DS: decision schemes and the flag basis", () => {
  it("DS-2 no signed basis, or a reference basis: Phase 1's flag on the reference band", () => {
    const r = resolveInterpretation(q({ configs: [scheme], value: "8.5" }));
    expect(r.basis).toBe("reference");
    expect(r.flag).toBe("low");
    const ref = resolveInterpretation(
      q({ configs: [config("flag_basis", "obs.fixture_hb", { basis: "reference" }), scheme] }),
    );
    expect(ref.basis).toBe("reference");
    expect(ref.category).toBeNull();
  });

  it("DS-2 an unsigned basis or scheme never flags", () => {
    const draftBasis = config(
      "flag_basis",
      "obs.fixture_hb",
      { basis: "scheme" },
      { status: "draft", inForceFrom: null },
    );
    expect(resolveInterpretation(q({ configs: [draftBasis, scheme] })).basis).toBe("reference");
    const draftScheme = config("scheme", "obs.fixture_hb", FIXTURE_SCHEME, {
      status: "draft",
      inForceFrom: null,
    });
    const r = resolveInterpretation(q({ configs: [basis, draftScheme] }));
    expect(r.fallback).toBe("no_scheme_for_patient");
  });

  it("DS-3, DS-6 (S8): a woman of 34, not pregnant, at 1,200 m: moderate after the adjustment, reference shown", () => {
    const r = resolveInterpretation(q());
    expect(r.basis).toBe("scheme");
    expect(r.category).toMatchObject({ code: "moderate", abnormal: true, direction: "low" });
    expect(r.adjustments).toEqual([
      expect.objectContaining({ kind: "elevation", metres: 1200, amount: "1.0" }),
    ]);
    expect(r.reference).toMatchObject({ low: "9.0", high: "16.0" });
    expect(r.scheme?.label).toBe("Fixture scheme 2026");
  });

  it("DS-6: adding the amount to every cut-off gives the category subtracting it from the value gives", () => {
    const bounds = FIXTURE_SCHEME.rows[0]!.bounds;
    for (const v of ["7.9", "8.0", "8.9", "9.0", "10.4", "11.9", "12.0", "12.9", "13.0", "20.0"]) {
      const shifted = categoryFor(FIXTURE_SCHEME, bounds, v, false, "1.0")?.code;
      const minus = categoryFor(
        FIXTURE_SCHEME,
        bounds,
        (Number(v) - 1).toFixed(1),
        false,
        null,
      )?.code;
      expect(shifted, v).toBe(minus);
    }
  });

  it("DS-7 (S11): no signed elevation: no adjustment, and the result says so", () => {
    expect(resolveInterpretation(q({ value: "11.5" })).category?.code).toBe("moderate");
    const r = resolveInterpretation(q({ value: "11.5", configs: [basis, scheme] }));
    expect(r.category?.code).toBe("mild");
    expect(r.adjustments).toEqual([]);
    expect(r.notes).toContain("altitude_not_adjusted");
  });

  it("DS-8 every boundary exactly as signed (lower inclusive, upper exclusive in the fixture)", () => {
    const at = (v: string) =>
      resolveInterpretation(q({ value: v, configs: [basis, scheme] })).category?.code;
    expect(at("7.99")).toBe("severe");
    expect(at("8.0")).toBe("moderate");
    expect(at("10.99")).toBe("moderate");
    expect(at("11.0")).toBe("mild");
    expect(at("11.95")).toBe("mild"); // A7: no gap between categories
    expect(at("12.0")).toBe("none");
  });

  it("DS-5 (S9): pregnancy from the record picks the row by gestation; not recorded uses the non-pregnant row, said so", () => {
    const p2 = resolveInterpretation(
      q({
        value: "9.5",
        pregnancy: { state: "pregnant", gestationDays: 154 },
        configs: [basis, scheme],
      }),
    );
    expect(p2.scheme?.rowSource).toBe("fixture row p2");
    expect(p2.category?.code).toBe("mild");
    const nr = resolveInterpretation(
      q({ value: "9.5", pregnancy: { state: "not_recorded" }, configs: [basis, scheme] }),
    );
    expect(nr.scheme?.rowSource).toBe("fixture row np");
    expect(nr.notes).toContain("pregnancy_not_recorded");
    const noGestation = resolveInterpretation(
      q({ pregnancy: { state: "pregnant", gestationDays: null } }),
    );
    expect(noGestation.fallback).toBe("context_not_recorded");
  });

  it("DS-4 (S10): a girl of 9 falls back to the reference interval with the reason; no borrowed category", () => {
    const r = resolveInterpretation(q({ ageDaysAtCollection: CHILD, value: "8.5" }));
    expect(r.basis).toBe("reference");
    expect(r.fallback).toBe("no_scheme_for_patient");
    expect(r.category).toBeNull();
    expect(r.flag).toBe("low");
  });

  it("DS-4, Law 7: a bedside result against a lab-only scheme gets no category", () => {
    const r = resolveInterpretation(q({ method: "bedside" }));
    expect(r.fallback).toBe("method_not_covered");
    expect(r.category).toBeNull();
  });

  it("DS-3 sex or age missing; a unit other than the scheme's", () => {
    expect(resolveInterpretation(q({ sex: null })).fallback).toBe("sex_or_age_missing");
    expect(resolveInterpretation(q({ unitUcum: "g/L" })).fallback).toBe("no_scheme_for_patient");
  });

  it("DS-9 (S12): a scheme signed later does not change what resolved at the time asked", () => {
    const later = config(
      "scheme",
      "obs.fixture_hb",
      { ...FIXTURE_SCHEME, label: "Fixture scheme v2" },
      {
        version: 2,
        inForceFrom: new Date(T0.getTime() + 86_400_000),
      },
    );
    const old = { ...scheme, supersededAt: later.inForceFrom, status: "superseded" as const };
    expect(
      resolveInterpretation(q({ configs: [basis, old, later, elevation] })).scheme?.label,
    ).toBe("Fixture scheme 2026");
  });

  it("DS-10 a scheme with no abnormal category shows the category and no flag", () => {
    const plain = {
      ...FIXTURE_SCHEME,
      categories: FIXTURE_SCHEME.categories.map((c) => ({ ...c, abnormal: false })),
    };
    const r = resolveInterpretation(
      q({ configs: [basis, config("scheme", "obs.fixture_hb", plain), elevation] }),
    );
    expect(r.category?.abnormal).toBe(false);
    expect(r.category?.direction).toBeNull();
    expect(r.flag).toBeNull();
  });

  it("LD-05: a not-detected result falls in the scheme's not-detected category; exactly the limit is as signed", () => {
    const vl = {
      ...FIXTURE_SCHEME,
      concept: "obs.fixture_vl",
      unit: "{copies}/mL",
      elevation: undefined,
      categories: [
        { code: "undetectable", label: "Fixture undetectable", abnormal: false, notDetected: true },
        { code: "suppressed", label: "Fixture suppressed", abnormal: false },
        { code: "unsuppressed", label: "Fixture unsuppressed", abnormal: true },
      ],
      rows: [
        {
          sex: "any" as const,
          ageFromDays: null,
          ageToDays: null,
          context: "any" as const,
          methods: ["lab" as const],
          bounds: [
            {
              category: "suppressed",
              from: null,
              fromInclusive: false,
              to: "500",
              toInclusive: true,
            },
            {
              category: "unsuppressed",
              from: "500",
              fromInclusive: false,
              to: null,
              toInclusive: false,
            },
          ],
          source: "fixture",
        },
      ],
    };
    const cfgs = [
      config("flag_basis", "obs.fixture_vl", { basis: "scheme" }),
      config("scheme", "obs.fixture_vl", vl),
    ];
    const at = (o: Partial<InterpretQuery>) =>
      resolveInterpretation(
        q({ conceptId: "obs.fixture_vl", unitUcum: "{copies}/mL", configs: cfgs, ...o }),
      ).category?.code;
    expect(at({ value: "500" })).toBe("suppressed");
    expect(at({ value: "500.1" })).toBe("unsuppressed");
    expect(at({ value: null, notDetected: true })).toBe("undetectable");
  });

  it("DS-1 a scheme draft with a gap or overlap between categories cannot be signed (A7)", () => {
    expect(configSignErrors("scheme", FIXTURE_SCHEME)).toEqual([]);
    const gap = structuredClone(FIXTURE_SCHEME);
    gap.rows[0]!.bounds[1]!.to = "10.9";
    expect(configSignErrors("scheme", gap)).toContain("row_0:gap_or_overlap");
    const both = structuredClone(FIXTURE_SCHEME);
    both.rows[0]!.bounds[0]!.toInclusive = true;
    both.rows[0]!.bounds[1]!.fromInclusive = true;
    expect(configSignErrors("scheme", both)).toContain("row_0:gap_or_overlap");
    expect(configSignErrors("scheme", { nope: 1 })[0]).toMatch(/^payload:/);
  });

  it("DS-11 critical limits are not read here: the interpretation carries no critical field", () => {
    expect(Object.keys(resolveInterpretation(q()))).not.toContain("critical");
  });
});

describe("ME-2, RI-6: Phase 1's resolver with methods and rejected bands", () => {
  const version = (bands: Parameters<typeof rangeSignErrors>[0]["bands"]) => ({
    id: "v",
    hospitalId: "h",
    testId: "t",
    conceptId: "c",
    unitUcum: "umol/L",
    version: 1,
    status: "signed" as const,
    inForceFrom: new Date(0),
    supersededAt: null,
    bands,
  });
  const ask = (methodCode: string | null, v: ReturnType<typeof version>) =>
    resolveRange(
      {
        measure: { testId: "t", conceptId: "c", resultType: "number", unitUcum: "umol/L" },
        hospitalId: "h",
        sex: "male",
        ageDaysAtCollection: ADULT,
        at: T0,
        methodCode,
      },
      [v],
    );
  const v = version([
    { id: "any", sex: "any", ageFromDays: null, ageToDays: null, low: "1", high: "2" },
    {
      id: "enz",
      sex: "any",
      ageFromDays: null,
      ageToDays: null,
      low: "3",
      high: "4",
      methodCode: "enzymatic",
    },
    {
      id: "jaffe",
      sex: "any",
      ageFromDays: null,
      ageToDays: null,
      low: "5",
      high: "6",
      methodCode: "jaffe_compensated",
    },
  ]);
  it("ME-2 a band for this method first, then one naming none; another method's never", () => {
    expect(ask("enzymatic", v)).toMatchObject({ kind: "band", band: { id: "enz" } });
    expect(ask(null, v)).toMatchObject({ kind: "band", band: { id: "any" } });
    expect(ask("jaffe_uncompensated", v)).toMatchObject({ kind: "band", band: { id: "any" } });
  });
  it("RI-6 a rejected alternative is never used and never blocks signing", () => {
    const two = version([
      { id: "eller", sex: "any", ageFromDays: null, ageToDays: null, low: "1", high: "2" },
      { id: "karita", sex: "any", ageFromDays: null, ageToDays: null, low: "1.5", high: "2.5" },
    ]);
    const m = { resultType: "number" as const, unitUcum: "umol/L" };
    expect(rangeSignErrors(two, m).some((e) => e.startsWith("band_overlap"))).toBe(true);
    const chosen = version([two.bands[0]!, { ...two.bands[1]!, rejected: true }]);
    expect(rangeSignErrors(chosen, m)).toEqual([]);
    expect(ask(null, chosen)).toMatchObject({ kind: "band", band: { id: "eller" } });
  });
});

describe("CC-9: HbA1c IFCC is display-only, from the signed REF entry", () => {
  const ref = config(
    "ref",
    "REF-HBA1C-IFCC",
    { constants: { intercept: "2", slope: "0.1" }, source: "fixture" },
    { hospitalId: null },
  );
  it("CC-9 computed to 0 dp with the signed constants; nothing without a signed entry", () => {
    expect(hba1cIfcc("7.5", [ref], T0)).toBe("55");
    expect(hba1cIfcc("7.5", [], T0)).toBeNull();
    expect(hba1cIfcc("7.5", [{ ...ref, status: "draft", inForceFrom: null }], T0)).toBeNull();
  });
});
