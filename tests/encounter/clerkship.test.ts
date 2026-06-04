import type { Clerkship } from "@/lib/encounter/clerkship";
import { describe, expect, it } from "vitest";

import { clerkshipWriteAuthority } from "@/lib/encounter/access";
import {
  alcoholExcessSuspected,
  cageScore,
  cageSignificant,
  clerkshipHasContent,
  clerkshipStatus,
  clerkshipToSoap,
  deriveClinicalObjects,
  seedClerkshipFromTriage,
} from "@/lib/encounter/clerkship";

/**
 * Clerkship engine — PURE projections of the structured Hutchison clerking:
 * SOAP mapping, clerkship→engine-objects derivation (no fabrication),
 * completeness, CAGE; + the cadre-write authority. Decision-support only.
 */

describe("CAGE alcohol screen", () => {
  it("counts the positive answers; ≥2 is significant", () => {
    expect(cageScore({ cutDown: true, guilty: true })).toBe(2);
    expect(cageSignificant({ cutDown: true, guilty: true })).toBe(true);
    expect(cageSignificant({ annoyed: true })).toBe(false);
    expect(cageScore(undefined)).toBe(0);
  });
  it("flags alcohol excess (prompt the CAGE probe) above the low-risk threshold", () => {
    expect(alcoholExcessSuspected(20)).toBe(true);
    expect(alcoholExcessSuspected(10)).toBe(false);
    expect(alcoholExcessSuspected(null)).toBe(false);
  });
});

describe("clerkshipToSoap — maps the clerking to S/O/A/P", () => {
  const c: Clerkship = {
    history: { presentingComplaint: "chest pain" },
    examination: { general: "well" },
    synthesis: {
      summary: "55M, chest pain",
      differential: [{ text: "ACS", mustNotMiss: true }],
      investigations: [{ kind: "bloods", text: "troponin" }],
      managementPlan: "aspirin, refer cardiology",
      disposition: "admit",
    },
  };
  it("subjective=history, objective=exam+investigations, assessment=differential, plan=mgmt", () => {
    const s = clerkshipToSoap(c);
    expect(s.subjective?.presentingComplaint).toBe("chest pain");
    expect(s.objective.examination?.general).toBe("well");
    expect(s.objective.investigations?.[0]!.text).toBe("troponin");
    expect(s.assessment.differential?.[0]!.text).toBe("ACS");
    expect(s.plan.disposition).toBe("admit");
  });
});

describe("deriveClinicalObjects — clerking populates the engine objects (no fabrication)", () => {
  it("extracts allergies / meds / diagnoses / problems / orders + disposition", () => {
    const c: Clerkship = {
      history: {
        allergies: [{ substance: "penicillin", reaction: "rash", severity: "moderate" }],
        medications: [{ name: "metformin", dose: "500mg", frequency: "BD" }],
      },
      synthesis: {
        differential: [{ text: "pneumonia", icd10: "J18.9", rank: 1 }],
        problems: [{ item: "type 2 diabetes", active: true }],
        investigations: [{ kind: "imaging", text: "CXR", justification: "?consolidation" }],
        disposition: "admit",
      },
    };
    const d = deriveClinicalObjects(c);
    expect(d.allergies).toHaveLength(1);
    expect(d.allergies[0]!.substance).toBe("penicillin");
    expect(d.medications[0]!.name).toBe("metformin");
    expect(d.diagnoses[0]!.icd10).toBe("J18.9");
    expect(d.problems[0]!.item).toBe("type 2 diabetes");
    expect(d.orders[0]!.text).toBe("CXR");
    expect(d.disposition).toBe("admit");
  });
  it("an empty clerking derives empty lists — never fabricates", () => {
    const d = deriveClinicalObjects({});
    expect(d.allergies).toEqual([]);
    expect(d.medications).toEqual([]);
    expect(d.diagnoses).toEqual([]);
    expect(d.disposition).toBeNull();
  });
  it("drops blank-substance allergies / blank diagnoses (whitespace-only)", () => {
    const d = deriveClinicalObjects({
      history: { allergies: [{ substance: "  " }, { substance: "aspirin" }] },
      synthesis: { differential: [{ text: "" }, { text: "migraine" }] },
    });
    expect(d.allergies.map((a) => a.substance)).toEqual(["aspirin"]);
    expect(d.diagnoses.map((x) => x.text)).toEqual(["migraine"]);
  });
});

describe("clerkshipStatus / hasContent — honest completeness, never a blocking wizard", () => {
  it("reports per-section filled state; an empty clerking has no content", () => {
    expect(clerkshipHasContent({})).toBe(false);
    const status = clerkshipStatus({});
    expect(status.every((s) => !s.filled)).toBe(true);
  });
  it("a partial clerking (PC + a SOCRATES field + a differential) marks those sections filled", () => {
    const c: Clerkship = {
      history: { presentingComplaint: "headache", socrates: { site: "occiput" } },
      synthesis: { differential: [{ text: "tension headache" }] },
    };
    const byId = Object.fromEntries(clerkshipStatus(c).map((s) => [s.id, s.filled]));
    expect(byId.presentingComplaint).toBe(true);
    expect(byId.hpc).toBe(true); // SOCRATES populates HPC
    expect(byId.differential).toBe(true);
    expect(byId.social).toBe(false);
    expect(clerkshipHasContent(c)).toBe(true);
  });
});

describe("seedClerkshipFromTriage — continuation, not a blank restart (no fabrication)", () => {
  it("seeds the PC + an acuity/vitals opening note from triage", () => {
    const c = seedClerkshipFromTriage({
      presentingComplaint: "shortness of breath",
      acuity: "orange",
      vitalsSummary: "RR 28, SpO₂ 90%",
    });
    expect(c.history?.presentingComplaint).toBe("shortness of breath");
    expect(c.history?.opening).toContain("orange");
    expect(c.history?.opening).toContain("SpO₂ 90%");
  });
  it("an empty triage hand-off seeds an empty clerking (no fabrication)", () => {
    expect(seedClerkshipFromTriage({})).toEqual({});
    expect(seedClerkshipFromTriage({ presentingComplaint: "  " })).toEqual({});
  });
});

describe("clerkshipWriteAuthority — cadre-write rules", () => {
  it("a consultant clerks + writes a final diagnosis, no co-sign", () => {
    const a = clerkshipWriteAuthority("CONSULTANT", true);
    expect(a.canClerk).toBe(true);
    expect(a.canWriteFinalDiagnosis).toBe(true);
    expect(a.requiresCosign).toBe(false);
  });
  it("an intern clerks but the diagnosis is co-signed (soft) — no final-dx authority alone", () => {
    const a = clerkshipWriteAuthority("INTERN_DOCTOR", true);
    expect(a.canClerk).toBe(true);
    expect(a.requiresCosign).toBe(true);
    expect(a.canWriteFinalDiagnosis).toBe(false);
  });
  it("a nurse (clinical, non-clerker) records allergies but not a final medical diagnosis", () => {
    const a = clerkshipWriteAuthority("REGISTERED_NURSE", true);
    expect(a.canRecordAllergies).toBe(true);
    expect(a.canClerk).toBe(false);
    expect(a.canWriteFinalDiagnosis).toBe(false);
  });
  it("reception (non-clinical) has NO clinical write authority", () => {
    const a = clerkshipWriteAuthority("RECEPTIONIST", false);
    expect(a.clinical).toBe(false);
    expect(a.canClerk).toBe(false);
    expect(a.canRecordAllergies).toBe(false);
  });
});
