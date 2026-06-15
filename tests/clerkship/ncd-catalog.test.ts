import { describe, expect, it } from "vitest";

import {
  NCD_CATALOG_CSO_SIGNED,
  NCD_DIAGNOSIS_CATALOG,
  ncdByDisplay,
  ncdCatalog,
} from "@/lib/clerkship/diagnosis/ncd-catalog";
import { matchNcds, scoreNcdMatch } from "@/lib/clerkship/diagnosis/ncd-suggest";
import { searchCatalog } from "@/lib/clerkship/diagnosis/search";
import { ICD10_CODES } from "@/lib/encounter/reference-codes";

describe("NCD catalog (cited, derived, gated)", () => {
  it("has the prioritised NCDs, each net-new with cited defining criteria", () => {
    expect(NCD_DIAGNOSIS_CATALOG.length).toBeGreaterThanOrEqual(14);
    for (const e of NCD_DIAGNOSIS_CATALOG) {
      expect(e.category).toBe("ncd");
      expect(e.status).toBe("net_new");
      expect(e.definingCriteria.length, e.display).toBeGreaterThan(0);
      for (const c of e.definingCriteria) {
        expect(c.threshold.length, `${e.display}: ${c.measure}`).toBeGreaterThan(0);
        expect(c.source.guideline.length, e.display).toBeGreaterThan(0);
        expect(c.source.version.length, e.display).toBeGreaterThan(0);
        expect(c.source.url.startsWith("http"), `${e.display} url`).toBe(true);
      }
    }
  });

  it("supports are EXISTING-code shaped (snake_case codes, never inline prose)", () => {
    for (const e of NCD_DIAGNOSIS_CATALOG) {
      for (const s of [...e.supportingSymptoms, ...e.riskFactors]) {
        expect(/^[a-z0-9_]+$/.test(s), `${e.display}: "${s}"`).toBe(true);
      }
    }
  });

  it("never fabricates an ICD-10 — a linked code is a real ICD10_CODES code", () => {
    const valid = new Set(ICD10_CODES.map((c) => c.code));
    for (const e of NCD_DIAGNOSIS_CATALOG) {
      if (e.icd10 !== null) expect(valid.has(e.icd10), `${e.display} → ${e.icd10}`).toBe(true);
    }
    expect(ncdByDisplay("Type 2 diabetes mellitus")?.icd10).toBe("E11");
  });

  it("is GATED — ncdCatalog() is empty until the CSO signs", () => {
    expect(NCD_CATALOG_CSO_SIGNED).toBe(false);
    expect(ncdCatalog()).toEqual([]);
  });
});

describe("scoreNcdMatch (pure support matching)", () => {
  const hf = ncdByDisplay("Heart failure")!;
  it("counts matched symptom + risk codes", () => {
    const r = scoreNcdMatch(hf, {
      symptomCodes: new Set(["orthopnoea", "ankle_leg_swelling", "cough"]),
      conditionCodes: new Set(["hypertension", "ihd"]),
    });
    expect(r.matchedSymptoms).toEqual(expect.arrayContaining(["orthopnoea", "ankle_leg_swelling"]));
    expect(r.matchedRiskFactors).toEqual(expect.arrayContaining(["hypertension", "ihd"]));
    expect(r.score).toBe(4);
  });
  it("scores zero when nothing matches", () => {
    expect(
      scoreNcdMatch(hf, { symptomCodes: new Set(["headache"]), conditionCodes: new Set() }).score,
    ).toBe(0);
  });
});

describe("matchNcds + searchCatalog (gated NCD layer)", () => {
  it("matchNcds surfaces nothing while the catalog is unsigned", () => {
    expect(
      matchNcds({
        symptomCodes: new Set(["orthopnoea"]),
        conditionCodes: new Set(["hypertension"]),
      }),
    ).toEqual([]);
  });

  it("searchCatalog finds the live acute catalog but not the gated NCDs", () => {
    expect(searchCatalog("a")).toEqual([]); // under 2 chars
    const acute = searchCatalog("pulmonary");
    expect(acute.some((r) => r.category === "acute")).toBe(true);
    // NCDs are gated dark → none surface yet
    expect(searchCatalog("diabetes").some((r) => r.category === "ncd")).toBe(false);
  });
});
