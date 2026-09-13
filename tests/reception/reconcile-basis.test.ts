import { describe, expect, it } from "vitest";

import {
  BASIS_SAME_NAME_YEAR,
  BASIS_SAME_PHONE,
  birthYears,
  maskPhone,
  matchBasis,
  normaliseName,
} from "@/lib/reception/reconcile-basis";

const NOW = new Date("2026-09-13T09:00:00Z");
const declared = {
  name: "Nakato Sarah",
  phone: "+256772123456",
  dateOfBirth: null,
  ageYears: 34,
};

describe("matchBasis — words, never a score (PRD §2.8)", () => {
  it("same phone alone", () => {
    expect(
      matchBasis(
        declared,
        { name: "Someone Else", phone: "+256772123456", dateOfBirth: "1970-01-01", ageYears: null },
        NOW,
      ),
    ).toEqual([BASIS_SAME_PHONE]);
  });

  it("same name and year of birth — order and case of the name do not matter", () => {
    expect(
      matchBasis(
        declared,
        { name: "sarah NAKATO", phone: "+256700000000", dateOfBirth: "1992-03-04", ageYears: null },
        NOW,
      ),
    ).toEqual([BASIS_SAME_NAME_YEAR]);
  });

  it("an age straddles two birth years; a third year is no match", () => {
    expect(birthYears(declared, NOW)).toEqual([1992, 1991]);
    const y = (dob: string) =>
      matchBasis(
        declared,
        { name: "Nakato Sarah", phone: "+256700000000", dateOfBirth: dob, ageYears: null },
        NOW,
      );
    expect(y("1991-12-31")).toEqual([BASIS_SAME_NAME_YEAR]);
    expect(y("1990-12-31")).toEqual([]);
  });

  it("both bases, in a fixed order; a name alone is nothing", () => {
    expect(
      matchBasis(
        declared,
        { name: "Nakato Sarah", phone: "+256772123456", dateOfBirth: "1992-01-01", ageYears: null },
        NOW,
      ),
    ).toEqual([BASIS_SAME_PHONE, BASIS_SAME_NAME_YEAR]);
    expect(
      matchBasis(
        declared,
        { name: "Nakato Sarah", phone: "+256700000000", dateOfBirth: "1980-01-01", ageYears: null },
        NOW,
      ),
    ).toEqual([]);
  });

  it("helpers", () => {
    expect(normaliseName("  Sarah   nakato ")).toBe("nakato sarah");
    expect(maskPhone("+256772123456")).toBe("+2567•• ••• 456");
    expect(birthYears({ ...declared, dateOfBirth: "1992-06-01", ageYears: null }, NOW)).toEqual([
      1992,
    ]);
    expect(birthYears({ ...declared, ageYears: null }, NOW)).toEqual([]);
  });
});
