import { describe, expect, it } from "vitest";

import {
  CODE_SYSTEM_VERSIONS,
  findIcd10,
  findLoinc,
  ICD10_CODES,
  LOINC_CODES,
  searchClinicalCodes,
} from "@/lib/encounter/reference-codes";

/**
 * Curated, SOURCED ICD-10 + LOINC reference codes (kickoff §1/§5: standards as
 * versioned reference data, "sourced, not invented"). Pure lookups/search the
 * documentation UI uses; the same set seeds the DB reference tables (0041).
 */
describe("reference-codes — curated, sourced", () => {
  it("carries a version + source for each code system", () => {
    expect(CODE_SYSTEM_VERSIONS.icd10.version).toBeTruthy();
    expect(CODE_SYSTEM_VERSIONS.icd10.source).toMatch(/ICD-10/i);
    expect(CODE_SYSTEM_VERSIONS.loinc.version).toBeTruthy();
    expect(CODE_SYSTEM_VERSIONS.loinc.source).toMatch(/LOINC/i);
  });

  it("every code has a non-empty code + display", () => {
    for (const c of [...ICD10_CODES, ...LOINC_CODES]) {
      expect(c.code.trim().length).toBeGreaterThan(0);
      expect(c.display.trim().length).toBeGreaterThan(0);
    }
  });

  it("finds known ICD-10 codes (verified against WHO ICD-10)", () => {
    expect(findIcd10("I10")?.display.toLowerCase()).toContain("hypertension");
    expect(findIcd10("J18.9")?.display.toLowerCase()).toContain("pneumonia");
    expect(findIcd10("B54")?.display.toLowerCase()).toContain("malaria");
  });

  it("normalises lookup input (trim + uppercase); unknown → undefined", () => {
    expect(findIcd10("  i10 ")?.code).toBe("I10");
    expect(findIcd10("ZZZ.9")).toBeUndefined();
    expect(findIcd10("")).toBeUndefined();
  });

  it("finds known LOINC codes (verified against loinc.org)", () => {
    expect(findLoinc("718-7")?.display.toLowerCase()).toContain("hemoglobin");
    expect(findLoinc("2345-7")?.display.toLowerCase()).toContain("glucose");
    expect(findLoinc("2160-0")?.display.toLowerCase()).toContain("creatinine");
  });

  it("searches by display text or code, across systems", () => {
    const malaria = searchClinicalCodes("malaria");
    expect(malaria.some((c) => c.code === "B54")).toBe(true);

    const glucose = searchClinicalCodes("glucose", "loinc");
    expect(glucose.some((c) => c.code === "2345-7")).toBe(true);
    // System filter excludes the other system.
    expect(glucose.every((c) => c.system === "loinc")).toBe(true);

    expect(searchClinicalCodes("")).toEqual([]);
  });

  it("has no duplicate codes within a system", () => {
    const icd = ICD10_CODES.map((c) => c.code);
    const loinc = LOINC_CODES.map((c) => c.code);
    expect(new Set(icd).size).toBe(icd.length);
    expect(new Set(loinc).size).toBe(loinc.length);
  });
});
