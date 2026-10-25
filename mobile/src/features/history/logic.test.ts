import type { ReportedItem } from "@patient/reported-history";

import { cardLines, draftProblem, EMPTY_DRAFT, rowsOf, toggleReaction } from "./logic";

const now = new Date("2026-10-18T09:00:00Z");
const item = (p: Partial<ReportedItem>): ReportedItem => ({
  id: "x",
  kind: "condition",
  itemId: "hypertension",
  otherText: null,
  onsetYear: null,
  resolved: false,
  relation: null,
  reactions: [],
  severity: null,
  createdAt: "",
  ...p,
});

describe("history drafts", () => {
  it("needs a pick, own words for other, a sane year, and a relative for family", () => {
    expect(draftProblem("conditions", EMPTY_DRAFT, now)).toMatch(/Pick one/);
    expect(draftProblem("conditions", { ...EMPTY_DRAFT, itemId: "other" }, now)).toMatch(/Write/);
    expect(
      draftProblem("conditions", { ...EMPTY_DRAFT, itemId: "gout", year: "2030" }, now),
    ).toMatch(/2026 or earlier/);
    expect(draftProblem("conditions", { ...EMPTY_DRAFT, itemId: "gout", year: "2019" }, now)).toBe(
      null,
    );
    expect(draftProblem("family", { ...EMPTY_DRAFT, itemId: "diabetes" }, now)).toMatch(/who/);
  });

  it("writes one row per relative for a family condition", () => {
    const rows = rowsOf("family", {
      ...EMPTY_DRAFT,
      itemId: "diabetes",
      relations: ["mother", "father"],
    });
    expect(rows.map((r) => [r.kind, r.itemId, r.relation])).toEqual([
      ["family", "diabetes", "mother"],
      ["family", "diabetes", "father"],
    ]);
    expect(
      rowsOf("conditions", { ...EMPTY_DRAFT, itemId: "gout", year: "2019", resolved: true })[0],
    ).toMatchObject({ onsetYear: 2019, resolved: true });
  });

  it("keeps 'Not known' on its own", () => {
    expect(toggleReaction(["rash"], "not_known")).toEqual(["not_known"]);
    expect(toggleReaction(["not_known"], "rash")).toEqual(["rash"]);
  });
});

describe("card lines", () => {
  it("shows current, non-private conditions and every allergy", () => {
    const lines = cardLines(
      {
        conditions: [
          item({ itemId: "hypertension" }),
          item({ itemId: "hiv" }),
          item({ itemId: "gout", resolved: true }),
        ],
        allergies: [item({ kind: "allergy", itemId: "penicillins", resolved: null })],
        noKnownAllergies: false,
      },
      ["old words"],
    );
    expect(lines).toEqual({ conditions: "Hypertension", allergies: "Penicillins" });
  });

  it("falls back to the older profile words, and says no known allergies", () => {
    expect(
      cardLines({ conditions: [], allergies: [], noKnownAllergies: true }, ["Asthma"]),
    ).toEqual({ conditions: "Asthma", allergies: "No known allergies" });
    expect(cardLines({ conditions: [], allergies: [], noKnownAllergies: false }, [])).toEqual({
      conditions: "None listed",
      allergies: "None listed",
    });
  });
});
