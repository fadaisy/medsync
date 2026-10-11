import type { Measure } from "@/lib/lab/catalogue";
import { describe, expect, it } from "vitest";

import * as catalogue from "@/lib/lab/catalogue";
import {
  canResult,
  compareDecimal,
  displayValue,
  entryCheck,
  fhirValue,
  formatResult,
  measureChange,
  measureDraftErrors,
  parseResultInput,
} from "@/lib/lab/catalogue";

const m = (over: Partial<Measure> = {}): Measure => ({
  id: "m1",
  version: 1,
  resultType: "number",
  unitUcum: "mmol/L",
  unitDisplay: "mmol/L",
  decimalPlaces: 1,
  loincCode: null,
  entryCheckLow: null,
  entryCheckHigh: null,
  ...over,
});

describe("units and the catalogue (UN)", () => {
  it("UN-1 a numeric component without a unit cannot be resulted; coded and text need none", () => {
    expect(canResult(m())).toEqual({ ok: true });
    expect(canResult(m({ unitUcum: null }))).toEqual({ ok: false, reason: "no_unit" });
    expect(canResult(m({ unitDisplay: null }))).toEqual({ ok: false, reason: "no_unit" });
    expect(canResult(null)).toEqual({ ok: false, reason: "no_measure" });
    expect(canResult(m({ resultType: "coded", unitUcum: null, unitDisplay: null }))).toEqual({
      ok: true,
    });
  });

  it("UN-2 what a result carries is its own copy: the stored snapshot is shown, whatever the catalogue now says", () => {
    const snap = {
      valueDecimal: "7.2",
      valueText: "7.2",
      unitUcum: "mmol/L",
      unitDisplay: "mmol/L",
      measureVersion: 1,
    };
    expect(displayValue(snap, { value: "ignored", unit: "ignored" })).toEqual({
      value: "7.2",
      unit: "mmol/L",
      asTyped: false,
    });
  });

  it("UN-3 decimals compare exactly, never as floats, and display pads to the component's places", () => {
    expect(compareDecimal("7.2", "7.20")).toBe(0);
    expect(compareDecimal("0.1", "0.10000000000000001")).toBe(-1); // equal as floats
    expect(compareDecimal("-3.5", "-3.45")).toBe(-1);
    expect(compareDecimal("10", "9.99")).toBe(1);
    expect(formatResult("7", 2)).toBe("7.00");
    expect(formatResult("7.20", 1)).toBe("7.20"); // never rounded or cut
    expect(formatResult("7.5", 0)).toBe("7.5");
    expect(formatResult("7", 0)).toBe("7");
  });

  it("UN-4 a change to the unit (or anything defining) is a new version; nothing converts a value", () => {
    const cur = m();
    expect(measureChange(cur, { ...cur })).toEqual({ kind: "same" });
    expect(measureChange(cur, { ...cur, unitUcum: "mg/dL", unitDisplay: "mg/dL" })).toEqual({
      kind: "new_version",
      version: 2,
    });
    expect(measureChange(null, { ...cur })).toEqual({ kind: "new_version", version: 1 });
    // No conversion exists to call.
    expect(Object.keys(catalogue).filter((k) => /conver/i.test(k))).toEqual([]);
  });

  it.each([
    ["", 1, { ok: false, reason: "empty" }],
    ["   ", 1, { ok: false, reason: "empty" }],
    ["7,2", 1, { ok: true, value: "7.2" }],
    ["7.2", 1, { ok: true, value: "7.2" }],
    ["7.20", 2, { ok: true, value: "7.20" }],
    ["7.20", 1, { ok: false, reason: "too_many_decimals" }],
    ["7.2", 0, { ok: false, reason: "too_many_decimals" }],
    ["<0.1", 1, { ok: false, reason: "not_a_number" }],
    ["-", 1, { ok: false, reason: "not_a_number" }],
    ["1e3", 1, { ok: false, reason: "not_a_number" }],
    ["1E-2", 1, { ok: false, reason: "not_a_number" }],
    ["7.2 mmol/L", 1, { ok: false, reason: "not_a_number" }],
    ["1 234", 1, { ok: false, reason: "not_a_number" }],
    ["1.2.3", 1, { ok: false, reason: "not_a_number" }],
    ["-0.5", 1, { ok: true, value: "-0.5" }],
    ["007", 0, { ok: true, value: "7" }],
    [" 5 ", null, { ok: true, value: "5" }],
  ] as const)("UN-5 parseResultInput(%j, %s)", (raw, dp, want) => {
    expect(parseResultInput(raw, dp)).toEqual(want);
  });

  it("UN-6 outside the entry band needs a confirm; with no band there is no check", () => {
    expect(entryCheck("5", m())).toBe("no_check");
    const banded = m({ entryCheckLow: "1", entryCheckHigh: "10" });
    expect(entryCheck("1", banded)).toBe("inside");
    expect(entryCheck("10", banded)).toBe("inside");
    expect(entryCheck("0.9", banded)).toBe("outside");
    expect(entryCheck("10.01", banded)).toBe("outside");
    expect(entryCheck("1000", m({ entryCheckHigh: "10" }))).toBe("outside");
  });

  it("UN-7 a LOINC code must be in the imported table; FHIR emits LOINC and UCUM only when present", () => {
    const ucum = new Set(["mmol/L"]);
    const loinc = new Set(["0000-0"]);
    expect(measureDraftErrors({ ...m(), loincCode: "9999-9" }, ucum, loinc)).toContain(
      "loinc_unknown",
    );
    expect(measureDraftErrors({ ...m(), loincCode: "0000-0" }, ucum, loinc)).toEqual([]);
    expect(measureDraftErrors({ ...m(), unitUcum: "furlong" }, ucum, loinc)).toContain(
      "unit_unknown",
    );
    expect(measureDraftErrors({ ...m(), unitUcum: null }, ucum, loinc)).toContain("unit_required");
    expect(
      measureDraftErrors({ ...m(), entryCheckLow: "10", entryCheckHigh: "1" }, ucum, loinc),
    ).toContain("entry_check_order");

    const snap = {
      valueDecimal: "7.2",
      valueText: "7.2",
      unitUcum: "mmol/L",
      unitDisplay: "mmol/L",
      measureVersion: 1,
    };
    expect(fhirValue(snap, { value: "", unit: null }, "0000-0")).toEqual({
      code: { system: "http://loinc.org", code: "0000-0" },
      valueQuantity: {
        value: 7.2,
        unit: "mmol/L",
        system: "http://unitsofmeasure.org",
        code: "mmol/L",
      },
    });
    expect(fhirValue(snap, { value: "", unit: null }, null)).not.toHaveProperty("code");
  });

  it("UN-8 an older result shows as typed, is never parsed, and FHIR gets text, not a quantity", () => {
    expect(displayValue(null, { value: "7,2", unit: "mmol" })).toEqual({
      value: "7,2",
      unit: "mmol",
      asTyped: true,
    });
    expect(fhirValue(null, { value: "7,2", unit: "mmol" }, null)).toEqual({
      valueString: "7,2 mmol",
    });
  });
});
