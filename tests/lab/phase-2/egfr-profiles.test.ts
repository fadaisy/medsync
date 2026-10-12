/**
 * eGFR (EG-1..EG-3) with fixture constants, and analyser profiles (AP-1..AP-6). Fixture values only: the
 * constants below are INVENTED so the arithmetic can be checked by hand; the real ones come from the signed
 * REF-EGFR-CKDEPI-2021 entry.
 */
import type { EgfrInput } from "@/lib/lab/egfr";
import type { Profile } from "@/lib/lab/profiles";
import { describe, expect, it } from "vitest";

import { EGFR_REF, egfrFor } from "@/lib/lab/egfr";
import {
  activationBlockers,
  ANALYSER_MODELS,
  mappingErrors,
  profileFromModel,
  rowsFor,
  storeAs,
} from "@/lib/lab/profiles";
import { config, T0 } from "./_fixtures";

const REF = config(
  "ref",
  EGFR_REF,
  {
    constants: {
      a: "100",
      kappaFemale: "1",
      kappaMale: "1",
      alphaFemale: "0",
      alphaMale: "0",
      b: "-1",
      ageBase: "1",
      femaleFactor: "2",
      umolPerMgdl: "100",
      adultAgeYears: "18",
    },
    source: "fixture",
  },
  { hospitalId: null },
);
const input = (o: Partial<EgfrInput> = {}): EgfrInput => ({
  creatinine: "200",
  unitUcum: "umol/L",
  released: true,
  ageYears: 40,
  sex: "male",
  idmsTraceable: true,
  reportEgfr: true,
  configs: [REF],
  at: T0,
  ...o,
});

describe("EG: eGFR", () => {
  it("EG-3 the equation's shape with the signed constants (fixture arithmetic by hand)", () => {
    expect(egfrFor(input())).toEqual({ ok: true, value: "50", refVersion: 1 }); // 100 × (2/1)^-1
    expect(egfrFor(input({ creatinine: "50" }))).toMatchObject({ value: "100" }); // ratio below 1
    expect(egfrFor(input({ sex: "female" }))).toMatchObject({ value: "100" }); // × femaleFactor
  });
  it("EG-1, EG-2 every condition, and which one failed", () => {
    expect(egfrFor(input({ configs: [] }))).toEqual({ ok: false, reason: "no_signed_reference" });
    expect(egfrFor(input({ reportEgfr: false }))).toMatchObject({ reason: "not_reported_here" });
    expect(egfrFor(input({ released: false }))).toMatchObject({ reason: "not_released" });
    expect(egfrFor(input({ unitUcum: "mg/dL" }))).toMatchObject({ reason: "unit_not_umol" });
    expect(egfrFor(input({ idmsTraceable: null }))).toMatchObject({
      reason: "method_not_traceable",
    }); // S13
    expect(egfrFor(input({ ageYears: 17 }))).toMatchObject({ reason: "under_adult_age" }); // S13
    expect(egfrFor(input({ ageYears: null }))).toMatchObject({ reason: "age_missing" });
    expect(egfrFor(input({ sex: null }))).toMatchObject({ reason: "sex_missing" });
  });
});

const FBC = Object.values(ANALYSER_MODELS.dymind_dh615!.codes);
const FBC3 = Object.values(ANALYSER_MODELS.three_part_generic!.codes);
const V2 = [...new Set([...FBC, ...FBC3])];
const profile = (modelId: string, o: Partial<Profile> = {}): Profile => ({
  id: "p",
  state: "draft",
  verifiedConcepts: [],
  ...profileFromModel(modelId),
  ...o,
});

describe("AP: analyser profiles", () => {
  it("AP-1 a profile is data: every code of the model mapped, research-use locked as never, P-LCR/P-LCC lab-only", () => {
    const p = profile("dymind_dh615");
    expect(p.mappings.filter((m) => m.visibility !== "never")).toHaveLength(27);
    expect(p.mappings.find((m) => m.code === "NLR")?.visibility).toBe("never");
    expect(p.mappings.find((m) => m.code === "P-LCR")?.visibility).toBe("lab_only");
    expect(mappingErrors(p, ANALYSER_MODELS.dymind_dh615, V2)).toEqual([]);
  });
  it("AP-2 (S6) mapping a research-use code is refused", () => {
    const p = profile("dymind_dh615");
    p.mappings.push({ code: "NLR", concept: "obs.neutrophils_abs", visibility: "clinician" });
    expect(mappingErrors(p, ANALYSER_MODELS.dymind_dh615, V2)).toContainEqual({
      code: "NLR",
      error: "research_use",
    });
  });
  it("AP-3 (S6) GRAN never maps to neutrophils; a 3-part code never fills a 5-part concept, nor the reverse", () => {
    const three = profile("three_part_generic");
    three.mappings = three.mappings.map((m) =>
      m.code === "GRAN#" ? { ...m, concept: "obs.neutrophils_abs" } : m,
    );
    expect(mappingErrors(three, ANALYSER_MODELS.three_part_generic, V2)).toContainEqual({
      code: "GRAN#",
      error: "wrong_differential",
    });
    const five = profile("dymind_dh615");
    five.mappings.push({ code: "X", concept: "obs.mid_abs", visibility: "clinician" });
    expect(mappingErrors(five, ANALYSER_MODELS.dymind_dh615, V2)).toContainEqual({
      code: "X",
      error: "wrong_differential",
    });
  });
  it("AP-4 (S5) not usable while a code is unmapped, a question open or a concept unverified; usable when all are done", () => {
    const p = profile("dymind_dh615");
    const kinds = activationBlockers(p, ANALYSER_MODELS.dymind_dh615, V2).map((b) => b.kind);
    expect(kinds).toContain("open_check");
    expect(kinds).toContain("not_verified");
    const done = profile("dymind_dh615", {
      openChecks: p.openChecks.map((c) => ({
        ...c,
        resolution: "fixture: answered from the manual",
      })),
      verifiedConcepts: p.mappings.filter((m) => m.visibility !== "never").map((m) => m.concept),
    });
    expect(activationBlockers(done, ANALYSER_MODELS.dymind_dh615, V2)).toEqual([]);
    const missing = { ...done, mappings: done.mappings.filter((m) => m.code !== "HGB") };
    expect(activationBlockers(missing, ANALYSER_MODELS.dymind_dh615, V2)).toContainEqual({
      kind: "unmapped",
      code: "HGB",
    });
  });
  it("AP-5, AP-6 (S7) rows come from the profile; lab-only rows are hidden from clinicians; never rows are not stored", () => {
    const p = profile("dymind_dh615");
    expect(rowsFor(p, "lab").some((m) => m.code === "P-LCR")).toBe(true);
    expect(rowsFor(p, "clinician").some((m) => m.code === "P-LCR")).toBe(false);
    expect(storeAs(p, "obs.p_lcr")).toBe("lab_only");
    expect(storeAs(p, "obs.haemoglobin")).toBe("clinician");
    expect(storeAs(p, "obs.mid_abs")).toBe("refuse");
  });
  it("AP-3 (S2): a 3-part profile has no neutrophil row at all", () => {
    expect(
      rowsFor(profile("three_part_generic"), "lab").some((m) =>
        m.concept.startsWith("obs.neutrophils"),
      ),
    ).toBe(false);
  });
});
