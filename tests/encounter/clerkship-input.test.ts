import { describe, expect, it } from "vitest";

import { ClerkshipInputSchema, clerkshipInputToClerkship } from "@/lib/encounter/clerkship-input";

/**
 * The documentation-entry form submits a validated, flat-ish ClerkshipInput; a
 * pure mapper builds the engine's nested Clerkship. Validates + maps; never
 * fabricates (empty in → empty clerking out).
 */
describe("clerkship-input", () => {
  it("maps tap-first hpcItems into history and appends the doctor's narrative", () => {
    const c = clerkshipInputToClerkship(
      ClerkshipInputSchema.parse({
        hpcNarrative: "Worse since this morning, came by boda.",
        hpcItems: [
          {
            symptomCode: "chest_pain",
            symptomDisplay: "Chest pain",
            properties: [
              {
                propertyCode: "character",
                propertyDisplay: "Character",
                valueType: "single_select",
                labels: ["Crushing"],
              },
              { propertyCode: "severity", propertyDisplay: "Severity", valueType: "scale", num: 8 },
            ],
          },
        ],
      }),
    );
    expect(c.history?.hpcItems?.[0]!.symptomCode).toBe("chest_pain");
    // generated prose AND the typed narrative both land in the HPC
    expect(c.history?.hpc).toContain("Crushing chest pain");
    expect(c.history?.hpc).toContain("severity 8/10");
    expect(c.history?.hpc).toContain("Worse since this morning, came by boda.");
    // the raw narrative is kept separately for clean re-editing
    expect(c.history?.hpcNarrative).toBe("Worse since this morning, came by boda.");
  });

  it("validates + maps the essential sections into the nested Clerkship", () => {
    const parsed = ClerkshipInputSchema.parse({
      presentingComplaint: "chest pain",
      hpc: "since this morning",
      socrates: { site: "central", severity: "8/10" },
      pmh: "hypertension",
      drugHistory: "amlodipine",
      allergies: [{ substance: "penicillin", reaction: "rash", severity: "moderate" }],
      social: { occupation: "teacher", smokingPackYears: 10, alcoholUnitsPerWeek: 20 },
      examGeneral: "diaphoretic",
      examSystems: { cardiovascular: "HS I+II+0" },
      summary: "55M central chest pain",
      differential: [{ text: "ACS", icd10: "I10", mustNotMiss: true }],
      investigations: [{ kind: "bloods", text: "troponin", justification: "?ACS" }],
      managementPlan: "aspirin, refer cardiology",
      disposition: "admit",
      safetyNetting: "return if worse",
    });

    const c = clerkshipInputToClerkship(parsed);
    expect(c.history?.presentingComplaint).toBe("chest pain");
    expect(c.history?.socrates?.site).toBe("central");
    expect(c.history?.allergies?.[0]!.substance).toBe("penicillin");
    expect(c.history?.social?.smokingPackYears).toBe(10);
    expect(c.examination?.general).toBe("diaphoretic");
    expect(c.examination?.systems?.cardiovascular).toBe("HS I+II+0");
    expect(c.synthesis?.differential?.[0]!.icd10).toBe("I10");
    expect(c.synthesis?.differential?.[0]!.mustNotMiss).toBe(true);
    expect(c.synthesis?.investigations?.[0]!.kind).toBe("bloods");
    expect(c.synthesis?.disposition).toBe("admit");
  });

  it("an empty submission maps to an empty clerking (no fabrication)", () => {
    const c = clerkshipInputToClerkship(ClerkshipInputSchema.parse({}));
    expect(c.history).toBeUndefined();
    expect(c.examination).toBeUndefined();
    expect(c.synthesis).toBeUndefined();
  });

  it("rejects an invalid disposition / severity / order kind", () => {
    expect(() => ClerkshipInputSchema.parse({ disposition: "banana" })).toThrow();
    expect(() =>
      ClerkshipInputSchema.parse({ allergies: [{ substance: "x", severity: "lethal" }] }),
    ).toThrow();
    expect(() =>
      ClerkshipInputSchema.parse({ investigations: [{ kind: "vibes", text: "x" }] }),
    ).toThrow();
  });

  it("drops blank-substance allergies and blank differentials at map time", () => {
    const c = clerkshipInputToClerkship(
      ClerkshipInputSchema.parse({
        allergies: [{ substance: "   " }, { substance: "aspirin" }],
        differential: [{ text: "" }, { text: "migraine" }],
      }),
    );
    expect(c.history?.allergies?.map((a) => a.substance)).toEqual(["aspirin"]);
    expect(c.synthesis?.differential?.map((d) => d.text)).toEqual(["migraine"]);
  });

  it("round-trips a synthesised problem's nested evidence (no abnormal vital dropped)", () => {
    const c = clerkshipInputToClerkship(
      ClerkshipInputSchema.parse({
        problems: [
          {
            item: "Acute coronary syndrome / MI",
            kind: "diagnosis",
            status: "active",
            provenance: "reasoning synthesis · supported",
            evidence: ["Crushing", "smoking", "SpO₂ 88%", "BP 189/110", "  "],
          },
        ],
      }),
    );
    // evidence survives validation + mapping (so a confirmed problem's absorbed
    // vitals are recognised on reload and never re-proposed standalone), blanks dropped.
    expect(c.synthesis?.problems?.[0]!.evidence).toEqual([
      "Crushing",
      "smoking",
      "SpO₂ 88%",
      "BP 189/110",
    ]);
  });
});
