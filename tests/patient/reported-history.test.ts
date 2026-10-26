import { describe, expect, it } from "vitest";

import CAT from "@/data/clerking/clerking-history-catalogue.v1.json";
import {
  allergyLine,
  conditionLine,
  fromRow,
  REPORTED_CATALOGUE,
  REPORTED_CATALOGUE_ID,
  reportedLabel,
  searchOptions,
  sinceFromYear,
  toRow,
} from "@/lib/patient/reported-history";

type Opt = { id: string; label: string; sensitivity?: string; applies_to_sex?: string };
const shape = (l: readonly Opt[]) =>
  l.map((o) => ({
    id: o.id,
    label: o.label,
    ...(o.sensitivity ? { sensitivity: o.sensitivity } : {}),
    ...(o.applies_to_sex ? { appliesToSex: o.applies_to_sex } : {}),
  }));

describe("the phone's lists are the signed clerking catalogue's", () => {
  it("match id for id, label for label", () => {
    expect(CAT.id).toBe(REPORTED_CATALOGUE_ID);
    expect(REPORTED_CATALOGUE.conditions).toEqual(shape(CAT.past_history.conditions));
    expect(REPORTED_CATALOGUE.familyConditions).toEqual(shape(CAT.family_history.conditions));
    expect(REPORTED_CATALOGUE.relations).toEqual(shape(CAT.option_sets.relations));
    expect(REPORTED_CATALOGUE.allergySubstances).toEqual(shape(CAT.allergies.quick_picks));
    expect(REPORTED_CATALOGUE.reactions).toEqual(shape(CAT.allergies.reactions));
    expect(REPORTED_CATALOGUE.severity).toEqual(shape(CAT.allergies.severity));
  });

  it("0189's relation and severity checks allow exactly the catalogue's ids", () => {
    expect(REPORTED_CATALOGUE.relations.map((r) => r.id)).toEqual([
      "mother",
      "father",
      "sibling",
      "child",
      "grandparent",
      "other_relative",
    ]);
    expect(REPORTED_CATALOGUE.severity.map((r) => r.id)).toEqual(["mild", "moderate", "severe"]);
  });
});

describe("reported history logic", () => {
  const now = new Date("2026-10-18T09:00:00Z");

  it("maps an onset year to the desk's 'known for'", () => {
    expect(sinceFromYear(2026, now)).toBe("under_1_year");
    expect(sinceFromYear(2025, now)).toBe("1_to_5_years");
    expect(sinceFromYear(2021, now)).toBe("1_to_5_years");
    expect(sinceFromYear(2020, now)).toBe("over_5_years");
    expect(sinceFromYear(2030, now)).toBeNull();
    expect(sinceFromYear(null, now)).toBeNull();
  });

  it("searches by start, then word start, then anywhere; drops the other sex's entries", () => {
    const l = REPORTED_CATALOGUE.conditions;
    expect(searchOptions(l, "dia")[0]!.id).toBe("diabetes");
    expect(searchOptions(l, "hep").map((o) => o.id)).toEqual(["liver_disease_or_hepatitis_b_c"]);
    expect(searchOptions(l, "", "male").some((o) => o.id === "pcos")).toBe(false);
    expect(searchOptions(l, "", "female").some((o) => o.id === "pcos")).toBe(true);
    expect(searchOptions(l, "zzz")).toEqual([]);
  });

  it("writes each kind in 0189's shape and reads rows back", () => {
    expect(
      toRow({
        kind: "family",
        itemId: "diabetes",
        otherText: "ignored",
        onsetYear: 2000,
        resolved: true,
        relation: "mother",
        reactions: ["rash"],
        severity: "mild",
      }),
    ).toEqual({ kind: "family", item_id: "diabetes", other_text: null, relation: "mother" });
    const r = fromRow({
      id: "x",
      kind: "condition",
      item_id: "other",
      other_text: "Glaucoma",
      onset_year: 2019,
      resolved: false,
      reactions: [],
      created_at: "2026-10-18",
    })!;
    expect(reportedLabel(r)).toBe("Glaucoma");
    expect(conditionLine(r, "clinician")).toBe("since 2019 · still has it");
    expect(fromRow({ id: "y", kind: "nope" })).toBeNull();
    expect(allergyLine({ reactions: ["rash", "hives_or_itch"], severity: "moderate" })).toBe(
      "Rash, Hives or itch · moderate",
    );
  });
});
