/** The signed relation catalogues as the board reads them (ADR 0220). */
import { describe, expect, it } from "vitest";

import {
  cataloguedRelation,
  causesOf,
  linkedCandidates,
  listedReversed,
  precipitantsFor,
  refinesFrom,
  riskFactorsOf,
  stageScaleOf,
  subtypesOf,
} from "@/lib/clerking/impression/relations-catalogue";

describe("relation catalogues", () => {
  it("a signed complication wins its label: DKA is a complication of type 1 diabetes", () => {
    expect(cataloguedRelation("dx.dka", "dx.dm_type1")).toMatchObject({
      type: "due_to",
      label: "complication",
      ambiguous: false,
    });
  });

  it("anaemia secondary to malaria, and the placeholder follows its same_as", () => {
    const r = cataloguedRelation("dx.anaemia", "dx.malaria_uncomplicated");
    expect(r?.type).toBe("due_to");
    expect(r?.ref).toMatch(/^MS-EMR-DX-CAUSES-001@.*:dx\.anaemia<-dx\.malaria_uncomplicated$/);
    expect(causesOf("dx.anaemia_unexplained").map((c) => c.id)).toContain(
      "dx.malaria_uncomplicated",
    );
  });

  it("goes-with pairs are associated, not causal, and symmetric", () => {
    expect(cataloguedRelation("dx.hypertension", "dx.dm_type2")?.type).toBe("associated_with");
    expect(cataloguedRelation("dx.dm_type2", "dx.hypertension")?.type).toBe("associated_with");
  });

  it("direction-ambiguous pairs always ask; the reverse direction is recognised", () => {
    expect(cataloguedRelation("dx.heart_failure", "dx.af")?.ambiguous).toBe(true);
    expect(listedReversed("dx.malaria_uncomplicated", "dx.anaemia")).toBe(true);
    expect(cataloguedRelation("dx.malaria_uncomplicated", "dx.anaemia")).toBeNull();
  });

  it("an unlisted pair offers nothing", () => {
    expect(cataloguedRelation("dx.malaria_uncomplicated", "dx.pneumonia")).toBeNull();
  });

  it("linked candidates under malaria include anaemia as secondary", () => {
    const c = linkedCandidates("dx.malaria_uncomplicated");
    expect(c.find((x) => x.dxId === "dx.anaemia")).toMatchObject({ type: "due_to" });
  });

  it("ACS refines to STEMI or NSTE-ACS, and NSTE-ACS to NSTEMI or unstable angina", () => {
    expect(subtypesOf("dx.acs")?.subtypes.map((s) => s.id)).toEqual(
      expect.arrayContaining(["dx.stemi", "dx.nste_acs"]),
    );
    expect(subtypesOf("dx.nste_acs")?.subtypes.map((s) => s.id)).toEqual(
      expect.arrayContaining(["dx.nstemi", "dx.unstable_angina"]),
    );
    expect(refinesFrom("dx.nstemi")).toBe("dx.nste_acs");
  });

  it("risk factors, precipitants and stages", () => {
    expect(riskFactorsOf("dx.acs").map((r) => r.id)).toEqual(
      expect.arrayContaining(["dx.dm_type2", "dx.hypertension", "dx.dyslipidaemia"]),
    );
    expect(precipitantsFor("dx.dka").map((p) => p.id)).toContain("cause.insulin_omission");
    expect(stageScaleOf("dx.iron_deficiency_anaemia")?.id).toBe("dx.anaemia");
  });
});
