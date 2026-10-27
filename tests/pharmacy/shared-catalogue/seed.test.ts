/**
 * The catalogue seed from EMHSLU (catalogue slice Step 2; ADR 0456): every row accounted for (S1), combinations
 * split into ingredients (S2), strength kept as printed (Law 3), forms never guessed (Law 5).
 */
import { readFileSync } from "node:fs";
import type { NationalListRow } from "@/lib/pharmacy/national-list";
import { describe, expect, it } from "vitest";

import { readNationalList } from "@/lib/pharmacy/national-list";
import { parseStrength, seedFromEmhslu } from "@/lib/pharmacy/shared-catalogue/seed";

const row = (o: Partial<NationalListRow> & { genericName: string }): NationalListRow => ({
  line: 2,
  form: "Tablet",
  strength: null,
  levelOfCare: "HC2",
  venClass: "E",
  therapeuticClass: "x",
  kind: "medicine",
  listSection: "A",
  unit: null,
  specialist: false,
  sourcePage: 1,
  checkNote: null,
  ...o,
});

describe("seedFromEmhslu", () => {
  const { rows } = readNationalList(
    readFileSync("data/pharmacy/national-list/emhslu-2023.csv", "utf8"),
  );
  const real = seedFromEmhslu(rows);

  it("S1: every EMHSLU row is a proposed medicine, merged into one, or refused with a reason", () => {
    const lines = real.medicines.flatMap((m) => m.lines);
    expect(new Set(lines).size).toBe(lines.length);
    expect(lines.length + real.refused.length).toBe(rows.length);
    for (const x of real.refused) expect(x.reason.length).toBeGreaterThan(5);
    expect(real.medicines.every((m) => m.kind !== "health_supply" || m.formCode === null)).toBe(
      true,
    );
  });

  it("S2: a fixed-dose combination is one medicine with its ingredients, strengths as printed", () => {
    const m = seedFromEmhslu([
      row({ genericName: "Rifampicin + Isoniazid", strength: "150 mg + 75 mg" }),
    ]).medicines[0]!;
    expect(m.ingredients.map((i) => [i.preferredName, i.strengthText])).toEqual([
      ["rifampicin", "150 mg"],
      ["isoniazid", "75 mg"],
    ]);
    expect(m.strengthText).toBe("150 mg + 75 mg");
    const booster = seedFromEmhslu([
      row({ genericName: "Lopinavir (+ Ritonavir)", strength: "200 mg + 50 Mg" }),
    ]).medicines[0]!;
    expect(booster.ingredients.map((i) => i.preferredName)).toEqual(["lopinavir", "ritonavir"]);
    const slash = seedFromEmhslu([
      row({ genericName: "Amoxicillin/Clavulanic acid", strength: "250/125 mg" }),
    ]).medicines[0]!;
    expect(slash.ingredients.map((i) => [i.strengthText, i.parsed?.unit])).toEqual([
      ["250", "mg"],
      ["125 mg", "mg"],
    ]);
  });

  it("keeps a strength that does not split whole, and says so", () => {
    const m = seedFromEmhslu([
      row({ genericName: "Imipenem/Cilastatin", strength: "500 mg", form: "Powder for injection" }),
    ]).medicines[0]!;
    expect(m.ingredients.every((i) => i.strengthText === null)).toBe(true);
    expect(m.strengthText).toBe("500 mg");
    expect(m.notes.join(" ")).toMatch(/does not split/);
  });

  it("uses the signed INN as the preferred name and keeps the printed one", () => {
    const m = seedFromEmhslu([
      row({ genericName: "Lignocaine", strength: "2%", form: "Injection" }),
    ]).medicines[0]!;
    expect(m.ingredients[0]).toMatchObject({
      preferredName: "lidocaine",
      printedName: "Lignocaine",
    });
    const both = seedFromEmhslu([
      row({ genericName: "Lignocaine + epinephrine (adrenaline)", strength: "2% + 1:80 000" }),
    ]).medicines[0]!;
    expect(both.ingredients.map((i) => [i.preferredName, i.aside])).toEqual([
      ["lidocaine", null],
      ["epinephrine", null],
    ]);
  });

  it("keeps an aside as part of the medicine, so it never merges with the plain one", () => {
    const r = seedFromEmhslu([
      row({ line: 2, genericName: "Bupivacaine", strength: "0.5%", form: "Injection" }),
      row({
        line: 3,
        genericName: "Bupivacaine (with dextrose)",
        strength: "0.5%",
        form: "Injection",
      }),
    ]);
    expect(r.medicines).toHaveLength(2);
    expect(r.medicines[1]!.ingredients[0]!.aside).toBe("with dextrose");
    expect(r.medicines[1]!.notes.join(" ")).toMatch(/check the ingredients/);
  });

  it("merges a medicine listed in two sections, keeping level and VEN only where they agree", () => {
    const r = seedFromEmhslu([
      row({
        line: 2,
        genericName: "Atropine",
        strength: "1 mg/ml",
        form: "Injection",
        venClass: "E",
      }),
      row({
        line: 9,
        genericName: "Atropine",
        strength: "1 mg/ml",
        form: "Injection",
        venClass: "V",
      }),
    ]);
    expect(r.medicines).toHaveLength(1);
    expect(r.medicines[0]).toMatchObject({ lines: [2, 9], ven: null, level: "HC2" });
    expect(r.merged).toEqual([{ line: 9, into: 2 }]);
  });

  it("never guesses a form or route the printed form does not name (Law 5)", () => {
    const [inj, tab] = seedFromEmhslu([
      row({ line: 2, genericName: "Ceftriaxone", strength: "1 g", form: "Injection" }),
      row({ line: 3, genericName: "Paracetamol", strength: "500 mg", form: "Tablet (scored)" }),
    ]).medicines;
    expect(inj).toMatchObject({ formCode: null, routes: [] });
    expect(tab).toMatchObject({ formCode: "tablet", routes: ["oral"], issueUnitKind: "tablet" });
  });

  it("keeps a flagged row flagged", () => {
    const m = seedFromEmhslu([row({ genericName: "X drug", checkNote: "strength unreadable" })])
      .medicines[0]!;
    expect(m).toMatchObject({ flagged: true, checkNote: "strength unreadable" });
  });

  it("parses strength for search only and converts nothing (Law 3)", () => {
    expect(parseStrength("500 mg")).toEqual({
      amount: 500,
      unit: "mg",
      perAmount: null,
      perUnit: null,
    });
    expect(parseStrength("250 mg/5 mL")).toEqual({
      amount: 250,
      unit: "mg",
      perAmount: 5,
      perUnit: "ml",
    });
    expect(parseStrength("40 mg/ml")).toEqual({
      amount: 40,
      unit: "mg",
      perAmount: 1,
      perUnit: "ml",
    });
    expect(parseStrength("0.5 g")).toEqual({
      amount: 0.5,
      unit: "g",
      perAmount: null,
      perUnit: null,
    });
    expect(parseStrength("WHO formula")).toBeNull();
  });
});
