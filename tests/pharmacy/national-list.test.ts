import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LoadedRow } from "@/lib/pharmacy/national-list";
import { describe, expect, it } from "vitest";

import {
  linkProposals,
  matchNationalList,
  readNationalList,
  singleCandidate,
} from "@/lib/pharmacy/national-list";
import { FORMULARY_DRUGS } from "@/lib/prescribing/reference/general-formulary";

/** The national list as the pharmacy's catalogue (ADR 0282): the committed edition and the proposals. */

const EDITION = readFileSync(
  resolve(process.cwd(), "data/pharmacy/national-list/emhslu-2023.csv"),
  "utf8",
);

describe("the committed EMHSLU 2023 file", () => {
  const { rows, rejected } = readNationalList(EDITION);

  it("reads every line: 802 medicines and 1,919 health supplies", () => {
    expect(rejected).toEqual([]);
    expect(rows.filter((r) => r.kind === "medicine")).toHaveLength(802);
    expect(rows.filter((r) => r.kind === "supply")).toHaveLength(1919);
  });

  it("carries the edition's own marks: 249 specialist rows, 26 flagged, every row with its page", () => {
    expect(rows.filter((r) => r.specialist)).toHaveLength(249);
    expect(rows.filter((r) => r.checkNote)).toHaveLength(26);
    expect(
      rows.every((r) => r.sourcePage !== null && r.sourcePage >= 28 && r.sourcePage <= 113),
    ).toBe(true);
    expect(rows.filter((r) => r.kind === "supply").every((r) => !r.form && !r.strength)).toBe(true);
  });

  it("proposes only medicine rows, each to one prescribing-list medicine by name", () => {
    const r = matchNationalList(EDITION, FORMULARY_DRUGS);
    expect(r.rows).toBe(2721);
    expect(r.ambiguous).toEqual([]);
    expect(r.proposed.length + r.unmatched.length).toBe(802);
  });
});

describe("optional columns", () => {
  const head = "generic_name,form,strength,level_of_care,ven_class,therapeutic_class";
  it("a six-column file reads as before: medicines, unflagged", () => {
    const { rows } = readNationalList(`${head}\nFixture,tablet,[S1],HC2,V,`);
    expect(rows[0]).toMatchObject({
      kind: "medicine",
      specialist: false,
      checkNote: null,
      sourcePage: null,
    });
  });
  it("refuses an unknown kind, specialist value or page", () => {
    const { rejected } = readNationalList(
      `${head},kind,specialist,source_page\n` +
        "A,,,,,,drug,false,1\nB,,,,,,supply,maybe,1\nC,,,,,,supply,false,p1\nD,,,,,,supply,true,0",
    );
    expect(rejected.map((x) => x.line)).toEqual([2, 3, 4, 5]);
  });
});

describe("linkProposals (CT-3)", () => {
  const row = (id: string, o: Partial<LoadedRow> = {}): LoadedRow => ({
    id,
    genericName: "Fixture acid",
    form: null,
    strength: null,
    levelOfCare: null,
    venClass: null,
    kind: "medicine",
    specialist: false,
    sourcePage: null,
    checkNote: null,
    checked: false,
    ...o,
  });
  const catalogue = [
    { id: "fixture_acid", generic: "Fixture-acid" },
    { id: "fixture_base", generic: "Fixture base" },
    { id: "fixture_none", generic: "Nothing like it" },
  ];

  it("groups rows per medicine, skips supplies, and marks an unchecked flagged row unlinkable", () => {
    const ps = linkProposals(
      [
        row("r1"),
        row("r2", { genericName: "FIXTURE ACID", form: "syrup" }),
        row("r3", { genericName: "Fixture base", checkNote: "blank VEN" }),
        row("r4", { genericName: "Fixture base", kind: "supply" }),
      ],
      catalogue,
      [],
    );
    expect(ps.map((p) => [p.medicineId, p.candidates.map((c) => c.id)])).toEqual([
      ["fixture_acid", ["r1", "r2"]],
      ["fixture_base", ["r3"]],
    ]);
    expect(ps[1]!.candidates[0]!.linkable).toBe(false);
    expect(singleCandidate(ps)).toEqual([]);
  });

  it("a checked flagged row is linkable; a linked medicine is not offered in a batch", () => {
    const rows = [
      row("r3", { genericName: "Fixture base", checkNote: "x", checked: true }),
      row("r1"),
    ];
    const ps = linkProposals(rows, catalogue, [{ medicineId: "fixture_acid", rowId: "r1" }]);
    expect(ps.find((p) => p.medicineId === "fixture_acid")!.linkedRowId).toBe("r1");
    expect(singleCandidate(ps).map((p) => p.medicineId)).toEqual(["fixture_base"]);
  });
});
