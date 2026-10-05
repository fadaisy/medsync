import { describe, expect, it } from "vitest";

import raw from "@/data/clerking/clerking-diagnosis-catalogue.v1.json";
import PACK from "@/data/emr/clinical-fact-concepts.v1.5.json";
import BASE from "@/data/emr/diagnosis-terms.v1.json";
import MENU from "@/data/emr/test-catalogue.v1.json";
import ADD from "@/docs/emr/clerking-v2/summary-impression/diagnosis-terms.v1.1-addendum.json";
import { parseDxCatalogue } from "@/lib/clerking/impression/catalogue";
import { dxCatalogueProblems } from "@/lib/clerking/impression/check";
import { DX_TERM_IDS, dxTermUuid, uuidV5 } from "@/lib/clerking/impression/load";
import { uuidV5 as seedUuid } from "@/scripts/emr/gen-seed";
import { ecat } from "./exam-fixtures";
import { cat } from "./fixtures";

/** The cross-catalogue check (§6) catches what it must, and the term map matches the seed. */

const input = (c: unknown) => ({
  dx: parseDxCatalogue(c),
  cat,
  exam: ecat,
  terms: [...BASE.terms, ...ADD.terms, ...PACK.termsAdd],
  tests: new Set(MENU.tests.map((t) => t.id)),
  otherSources: new Set([...Object.keys(cat.data.sources), ...Object.keys(ecat.data.sources)]),
});

describe("the diagnosis catalogue check", () => {
  it("passes the signed catalogue, with 35 tests on the menu and 66 proposed", () => {
    const r = dxCatalogueProblems(input(raw));
    expect(r.problems).toEqual([]);
    expect(r.testsExisting.size).toBe(35);
    // 62 + the diabetes pack's ogtt_75g, gad_antibodies, c_peptide, retinal_photograph
    expect(r.testsProposed.size).toBe(66);
  });

  it("fails an unknown id, an unknown option and a restricted fact on a standard diagnosis", () => {
    const c = structuredClone(raw) as {
      profiles: Record<string, { suggest_for: unknown[]; ask: unknown[] }>;
    };
    c.profiles["dx.influenza"]!.suggest_for.push({
      text: "x",
      atom: { symptom: "sym.not_a_symptom", answer: "yes" },
    });
    c.profiles["dx.influenza"]!.suggest_for.push({
      text: "y",
      atom: { social: "living", any_of: ["on_the_moon"] },
    });
    c.profiles["dx.influenza"]!.suggest_for.push({
      text: "z",
      atom: { past_condition: "hiv", answer: "yes" },
    });
    c.profiles["dx.influenza"]!.ask.push({ kind: "exam_item", id: "ex.not.an_item" });
    const p = dxCatalogueProblems(input(c)).problems.join("\n");
    expect(p).toContain("unknown symptom sym.not_a_symptom");
    expect(p).toContain("unknown social option living=on_the_moon");
    expect(p).toContain("restricted fact (hiv) as evidence on a standard diagnosis");
    expect(p).toContain("unknown item ex.not.an_item");
  });

  it("allows cross-class restricted evidence on a restricted diagnosis (R-3)", () => {
    const c = structuredClone(raw) as { profiles: Record<string, { suggest_for: unknown[] }> };
    c.profiles["dx.tb_meningitis"]!.suggest_for.push({
      text: "hiv",
      atom: { past_condition: "hiv", answer: "yes" },
    });
    expect(dxCatalogueProblems(input(c)).problems).toEqual([]);
  });
});

describe("the term map (D-SI-22)", () => {
  it("uses the seed's own generator and namespace", () => {
    for (const id of ["dx.sepsis", "dx.hypothermia_unexplained", "dx.dm_type_unknown"])
      expect(dxTermUuid(id)).toBe(seedUuid(`diagnosis_terms:${id}`));
    expect(uuidV5("x")).toBe(seedUuid("x"));
    expect(Object.keys(DX_TERM_IDS)).toHaveLength(280); // 272 + the diabetes pack's 8
  });
});
