import { describe, expect, it } from "vitest";

import {
  buildDiagnosisCatalog,
  DIAGNOSIS_CATALOG,
  diagnosisByDisplay,
} from "@/lib/clerkship/diagnosis/catalog";
import { REASONING_MAPS } from "@/lib/clerkship/reasoning/maps";
import { ICD10_CODES } from "@/lib/encounter/reference-codes";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

describe("diagnosis catalog — a faithful re-pivot of the reasoning maps", () => {
  it("contains exactly the distinct diagnoses in the maps (no fabrication, no loss)", () => {
    const fromMaps = new Set(REASONING_MAPS.flatMap((m) => m.differential.map((d) => norm(d.dx))));
    const fromCatalog = new Set(DIAGNOSIS_CATALOG.map((e) => norm(e.display)));
    expect(fromCatalog).toEqual(fromMaps);
  });

  it("every catalog entry is sourced from the maps (one source of truth)", () => {
    for (const e of DIAGNOSIS_CATALOG) {
      expect(e.status).toBe("from_reasoning_maps");
      expect(e.presentations.length).toBeGreaterThan(0);
      // every presentation is a real map code that actually lists this dx
      for (const pc of e.presentations) {
        const map = REASONING_MAPS.find((m) => m.code === pc);
        expect(map, pc).toBeDefined();
        expect(map!.differential.some((d) => norm(d.dx) === norm(e.display))).toBe(true);
      }
    }
  });

  it("merges a diagnosis that appears under several presentations (union of supports)", () => {
    const pe = diagnosisByDisplay("Pulmonary embolism");
    expect(pe).toBeDefined();
    // PE is a chest_pain + dyspnoea (+ others) candidate in the maps
    expect(pe!.presentations).toEqual(expect.arrayContaining(["chest_pain", "dyspnoea"]));
    expect(pe!.mustNotMiss).toBe(true);
    // its supports union every appearance — at least the chest_pain ruleIn survives
    expect(pe!.ruleIn.length).toBeGreaterThan(0);
  });

  it("carries must-not-miss from the maps and surfaces it on the entry", () => {
    const mnmInMaps = new Set(
      REASONING_MAPS.flatMap((m) =>
        m.differential.filter((d) => d.likelihood === "must_not_miss").map((d) => norm(d.dx)),
      ),
    );
    for (const e of DIAGNOSIS_CATALOG) {
      // a dx flagged must-not-miss anywhere in the maps is must-not-miss here
      if (mnmInMaps.has(norm(e.display))) expect(e.mustNotMiss, e.display).toBe(true);
    }
  });

  it("never fabricates an ICD-10: a linked code is always a real ICD10_CODES code", () => {
    const valid = new Set(ICD10_CODES.map((c) => c.code));
    for (const e of DIAGNOSIS_CATALOG) {
      if (e.icd10 !== null) expect(valid.has(e.icd10), `${e.display} → ${e.icd10}`).toBe(true);
    }
  });

  it("links a clean name to its verified code, but not a more-specific variant (conservative)", () => {
    // Exact clean names link to their verified ICD10_CODES entry...
    expect(diagnosisByDisplay("Malaria")?.icd10).toBe("B54");
    expect(diagnosisByDisplay("Heart failure")?.icd10).toBe("I50");
    expect(diagnosisByDisplay("Anaemia")?.icd10).toBe("D64.9");
    // ...but a more-specific variant is NOT force-linked to the unspecified code
    // (Cerebral malaria ≠ B54 "Malaria, unspecified") — left pending, never wrong.
    expect(diagnosisByDisplay("Cerebral malaria")?.icd10).toBeNull();
    // The majority remain null (no fabrication) — honest "pending CSO web-verification".
    const linked = DIAGNOSIS_CATALOG.filter((e) => e.icd10 !== null).length;
    expect(linked).toBeGreaterThan(0);
    expect(linked).toBeLessThan(DIAGNOSIS_CATALOG.length);
  });

  it("workupRef is a null placeholder everywhere (workup is the next build)", () => {
    expect(DIAGNOSIS_CATALOG.every((e) => e.workupRef === null)).toBe(true);
  });

  it("is deterministic + pure (rebuilds identically)", () => {
    expect(buildDiagnosisCatalog()).toEqual(DIAGNOSIS_CATALOG);
  });
});
