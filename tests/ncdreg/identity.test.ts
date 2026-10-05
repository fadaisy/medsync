/**
 * A2 duplicate tiers (pure): the catalogue's duplicate_check_demo lands in its expected tiers, and
 * fixture pairs land in definite / probable / possible. D-09: normalisation, token-order-insensitive.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Candidate } from "@/lib/ncdreg/identity";
import { describe, expect, it } from "vitest";

import { parseCatalogue } from "@/lib/ncdreg/demo/catalogue";
import { jaroWinkler, nameTokens, normaliseToken, tierCandidates } from "@/lib/ncdreg/identity";

const cat = parseCatalogue(
  JSON.parse(
    readFileSync(resolve(__dirname, "../../docs/ncd/demo/ncd-demo-catalog.v1.json"), "utf8"),
  ),
);
const YEAR0 = 2026;

const asCandidate = (p: (typeof cat.scenario_patients)[number]): Candidate => ({
  personId: p.key,
  givenName: p.given_name,
  familyName: p.family_name,
  sex: p.sex,
  birthYear: YEAR0 - p.age_years_at_day_0,
  phones: [p.phone_1],
  hospitalNumber: p.hospital_number ?? null,
  nationalId: null,
});

describe("normalisation (D-09)", () => {
  it("collapses doubled letters, drops a final h, strips accents and punctuation", () => {
    expect(normaliseToken("Nakatto")).toBe("nakato");
    expect(normaliseToken("Aminah")).toBe("amina");
    expect(normaliseToken("Ssébunya")).toBe("sebunya");
    expect(normaliseToken("O'Kello")).toBe("okelo");
  });
  it("token order does not matter", () => {
    expect(nameTokens("Sarah", "Nakato").sort()).toEqual(nameTokens("Nakato", "Sarah").sort());
  });
  it("Jaro-Winkler on the textbook pair", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 3);
  });
});

describe("the catalogue's duplicate_check_demo", () => {
  const t = cat.duplicate_check_demo.typed;
  const got = tierCandidates(
    {
      givenName: t.given_name,
      familyName: t.family_name,
      sex: t.sex,
      birthYear: YEAR0 - t.age_years_at_day_0,
      phones: [t.phone_1],
      hospitalNumber: null,
      nationalId: null,
    },
    cat.scenario_patients.map(asCandidate),
  );
  it("lands every expected candidate in its tier with the matched fields", () => {
    for (const e of cat.duplicate_check_demo.expected_candidates) {
      const g = got.find((x) => x.personId === e.key);
      expect(g, e.key).toBeDefined();
      expect(g!.tier).toBe(e.tier);
      expect(g!.matched).toEqual(e.matched);
    }
    expect(got.filter((x) => x.tier === "definite").map((x) => x.personId)).toEqual(
      cat.duplicate_check_demo.expected_definite,
    );
    expect(got.map((x) => x.personId).sort()).toEqual(
      cat.duplicate_check_demo.expected_candidates.map((e) => e.key).sort(),
    );
  });
});

describe("fixture pairs", () => {
  const base = {
    givenName: "Grace",
    familyName: "Akello",
    sex: "female" as const,
    birthYear: 1970,
    phones: ["0772 123 456"],
    hospitalNumber: "MRN-1",
    nationalId: null,
  };
  const c = (o: Partial<Candidate>): Candidate => ({ ...base, personId: "x", ...o });
  it("definite: same hospital number, even with another name", () => {
    expect(
      tierCandidates(base, [c({ givenName: "Zed", familyName: "Other", phones: [] })])[0]?.tier,
    ).toBe("definite");
  });
  it("definite: same national ID", () => {
    const typed = { ...base, hospitalNumber: null, nationalId: "CF12345678ABCD" };
    expect(
      tierCandidates(typed, [
        c({
          hospitalNumber: null,
          nationalId: "cf12345678abcd",
          givenName: "Zed",
          familyName: "Q",
        }),
      ])[0]?.tier,
    ).toBe("definite");
  });
  it("probable: same phone and a similar name", () => {
    expect(
      tierCandidates({ ...base, hospitalNumber: null }, [
        c({ hospitalNumber: null, givenName: "Gracy", birthYear: 1990 }),
      ])[0]?.tier,
    ).toBe("probable");
  });
  it("probable: similar name, same sex, birth year within 2", () => {
    expect(
      tierCandidates({ ...base, hospitalNumber: null, phones: [] }, [
        c({ hospitalNumber: null, phones: [], birthYear: 1972 }),
      ])[0]?.tier,
    ).toBe("probable");
  });
  it("possible: similar name and sex only; at most five listed", () => {
    const typed = { ...base, hospitalNumber: null, phones: [] };
    const many = Array.from({ length: 8 }, (_, i) =>
      c({ personId: `p${i}`, hospitalNumber: null, phones: [], birthYear: 1950 }),
    );
    const got = tierCandidates(typed, many);
    expect(got.every((x) => x.tier === "possible")).toBe(true);
    expect(got).toHaveLength(5);
  });
  it("no tier: different sex and different name", () => {
    expect(
      tierCandidates(base, [
        c({
          hospitalNumber: null,
          phones: [],
          sex: "male",
          givenName: "Peter",
          familyName: "Okot",
        }),
      ]),
    ).toEqual([]);
  });
});
