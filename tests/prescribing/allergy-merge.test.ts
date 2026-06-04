import { describe, expect, it } from "vitest";

import { mergeAllergyLists } from "@/lib/prescribing/allergy-merge";

/**
 * The prescribing allergy check unions the resus-timeline capture with the
 * persistent patient_allergies (clerked). Case-insensitive dedupe, first-seen
 * casing wins; blanks dropped. Pure.
 */
describe("mergeAllergyLists", () => {
  it("unions lists, dedupes case-insensitively (first-seen wins), drops blanks", () => {
    expect(mergeAllergyLists(["Penicillin", "  "], ["penicillin", "Aspirin", ""])).toEqual([
      "Penicillin",
      "Aspirin",
    ]);
  });

  it("preserves order: earlier lists first", () => {
    expect(mergeAllergyLists(["sulfa"], ["latex"])).toEqual(["sulfa", "latex"]);
  });

  it("trims and handles empty input", () => {
    expect(mergeAllergyLists([], [])).toEqual([]);
    expect(mergeAllergyLists([" Codeine "])).toEqual(["Codeine"]);
  });
});
