import type { DxTerm } from "@/components/emr/desk/search";
import { describe, expect, it } from "vitest";

import { dxBrowseGroups } from "@/components/clerking/impression/model";
import {
  DX_CATALOGUE,
  DX_NAMES,
  DX_TERM_IDS,
  dxTermUuid,
  TEST_NAMES,
  TEST_UUIDS,
} from "@/lib/clerking/impression/load";

/**
 * "Show all" diagnoses on step 09: every term of REF-DX-TERMS and its v1.1 addendum under its
 * profile's category in the signed diagnosis catalogue, once, in the catalogue's order.
 */

const dx = {
  cat: DX_CATALOGUE,
  termIds: DX_TERM_IDS,
  names: DX_NAMES,
  tests: TEST_NAMES,
  testIds: TEST_UUIDS,
};
const term = (id: string, display: string): DxTerm => ({
  id,
  display,
  synonyms: [],
  icd11: null,
  verified: false,
  chronic: false,
  symptomLevel: false,
  restricted: false,
  notifiable: false,
});
const TERMS = Object.entries(DX_NAMES).map(([id, n]) => term(dxTermUuid(id), n.display));

describe("dxBrowseGroups", () => {
  const groups = dxBrowseGroups(TERMS, dx);

  it("puts every term in exactly one group", () => {
    expect(TERMS).toHaveLength(85 + 187 + 8);
    const ids = groups.flatMap((g) => g.terms.map((t) => t.id));
    expect(ids).toHaveLength(85 + 187 + 8);
    expect(new Set(ids).size).toBe(85 + 187 + 8);
    expect(groups.map((g) => g.id)).not.toContain("other");
  });

  it("groups by the profile's category, in the catalogue's category order", () => {
    const order = Object.keys(DX_CATALOGUE.data.categories);
    expect(groups.map((g) => g.id)).toEqual(order.filter((c) => groups.some((g) => g.id === c)));
    expect(groups[0]!.id).toBe("symptom_level");
    for (const g of groups)
      for (const t of g.terms)
        expect(DX_CATALOGUE.profile(DX_TERM_IDS[t.id]!)!.category, t.display).toBe(g.id);
    const size = (id: string) => groups.find((g) => g.id === id)!.terms.length;
    const inCatalogue = (id: string) =>
      DX_CATALOGUE.profiles.filter((p) => p.category === id).length;
    for (const g of groups) expect(size(g.id), g.id).toBe(inCatalogue(g.id));
  });

  it("labels each group with the catalogue's words, without the bracketed notes", () => {
    const label = (id: string) => groups.find((g) => g.id === id)!.label;
    expect(label("cardiovascular")).toBe("Heart and vessels");
    expect(label("infection")).toBe("Infections, including HIV- and TB-related");
    expect(label("symptom_level")).toBe("Symptom-level terms");
    expect(label("mental_health")).toBe("Mental health and substance use");
    expect(label("obstetric")).toBe("Pregnancy-related");
    for (const g of groups) expect(g.label, g.id).not.toMatch(/[()]/);
  });

  it("sorts A to Z within a group", () => {
    for (const g of groups) {
      const names = g.terms.map((t) => t.display);
      expect(names, g.id).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    }
  });

  it("puts a term with no profile under Other diagnoses, last", () => {
    const extra = term("00000000-0000-4000-8000-000000000001", "A hospital's own term");
    const g = dxBrowseGroups([...TERMS, extra], dx);
    expect(g.at(-1)).toMatchObject({ id: "other", label: "Other diagnoses", terms: [extra] });
  });

  it("without the catalogue, lists everything A to Z in one group", () => {
    const g = dxBrowseGroups(TERMS, null);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ id: "all", label: "All diagnoses" });
    expect(g[0]!.terms).toHaveLength(85 + 187 + 8);
    expect(dxBrowseGroups([], null)).toEqual([]);
  });
});
