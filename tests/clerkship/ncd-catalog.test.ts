import { readFileSync } from "node:fs";
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

  // ONE-SOURCE-OF-TRUTH: every support code must be DEFINED in the seeded Sx/ROS
  // catalogs (HPC 0042/0043 + ROS 0045) or the condition picklist (0046) — never
  // invented inline. Checks the seed SQL directly (the source of those codes).
  const sqlOf = (p: string) => readFileSync(p, "utf8");
  const symptomSql =
    sqlOf("supabase/migrations/0042_symptom_catalog.sql") +
    sqlOf("supabase/migrations/0043_symptom_catalog_hutchison.sql") +
    sqlOf("supabase/migrations/0045_review_of_systems.sql");
  const conditionSql = sqlOf("supabase/migrations/0046_clerkship_picklists.sql");

  it("every supportingSymptom is a code defined in the seeded HPC/ROS catalogs", () => {
    for (const e of NCD_DIAGNOSIS_CATALOG) {
      for (const s of e.supportingSymptoms) {
        expect(symptomSql.includes(`'${s}'`), `${e.display}: "${s}" not in Sx/ROS seed`).toBe(true);
      }
    }
  });

  it("every riskFactor is a condition code defined in the seeded picklist", () => {
    for (const e of NCD_DIAGNOSIS_CATALOG) {
      for (const r of e.riskFactors) {
        expect(conditionSql.includes(`'${r}'`), `${e.display}: "${r}" not in condition seed`).toBe(
          true,
        );
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

  it("is SURFACED — ncdCatalog() returns the entries (CSO-directed)", () => {
    expect(NCD_CATALOG_CSO_SIGNED).toBe(true);
    expect(ncdCatalog().length).toBe(NCD_DIAGNOSIS_CATALOG.length);
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

describe("matchNcds + searchCatalog (surfaced NCD layer)", () => {
  it("matchNcds surfaces NCDs supported by the captured clerkship, ranked", () => {
    const out = matchNcds({
      symptomCodes: new Set(["orthopnoea", "ankle_leg_swelling"]),
      conditionCodes: new Set(["hypertension"]),
    });
    expect(out.some((n) => n.dx === "Heart failure")).toBe(true);
  });

  it("searchCatalog includes NCDs (diabetes types surfaced), NCDs first", () => {
    expect(searchCatalog("a")).toEqual([]); // under 2 chars
    const diabetes = searchCatalog("diabetes");
    expect(diabetes.some((r) => r.category === "ncd")).toBe(true);
    // the diabetes TYPES are now visible
    expect(diabetes.some((r) => /type 2/i.test(r.display))).toBe(true);
    expect(diabetes.some((r) => /type 1/i.test(r.display))).toBe(true);
    // acute catalog still searchable
    expect(searchCatalog("pulmonary").some((r) => r.category === "acute")).toBe(true);
  });
});
