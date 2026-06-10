import { describe, expect, it } from "vitest";

import { complaintSlug, templateStructure } from "@/lib/clerkship/complaint-template";

/**
 * The catalog template is the symptom DEFINITION + property STRUCTURE only —
 * never a patient's captured values (usefulness + privacy). `templateStructure`
 * is the single choke-point; these lock that contract.
 */
describe("templateStructure — structure only, no patient values", () => {
  it("keeps only the template fields and drops everything else", () => {
    const tpl = templateStructure({
      display: "  Knee swelling ",
      system: "musculoskeletal",
      synonyms: ["swollen knee", "  ", "swollen knee"], // trims, dedupes, drops blanks
      propertyCodes: ["site", "onset", "site"], // dedupes
      // ↓ patient values / junk that must NEVER reach the template:
      properties: [{ propertyCode: "site", labels: ["left knee"] }],
      site: "left knee",
      severity: 8,
      patientUserId: "patient-123",
      note: "3 days, sharp",
    } as unknown);

    expect(tpl).toEqual({
      display: "Knee swelling",
      system: "musculoskeletal",
      synonyms: ["swollen knee"],
      propertyCodes: ["site", "onset"],
    });
    // explicitly: no patient-value keys survived
    expect(Object.keys(tpl).sort()).toEqual(["display", "propertyCodes", "synonyms", "system"]);
    expect(JSON.stringify(tpl)).not.toContain("left knee");
    expect(JSON.stringify(tpl)).not.toContain("patient-123");
  });

  it("tolerates missing / malformed input", () => {
    expect(templateStructure(undefined)).toEqual({
      display: "",
      system: "",
      synonyms: [],
      propertyCodes: [],
    });
    expect(templateStructure({ synonyms: "not-an-array", propertyCodes: [1, 2] })).toEqual({
      display: "",
      system: "",
      synonyms: [],
      propertyCodes: [],
    });
  });

  it("slugs a display name for the generated code stem", () => {
    expect(complaintSlug("Knee swelling!")).toBe("knee_swelling");
    expect(complaintSlug("  Café-au-lait spots  ")).toBe("caf_au_lait_spots");
  });
});
