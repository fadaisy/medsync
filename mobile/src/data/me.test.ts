import { ageFrom, ageWords, cardNumber, initials, metaName, sexLetter } from "@/data/me";

jest.mock("@/lib/booking", () => ({ fetchPatientProfile: jest.fn() }));

describe("Me formatting", () => {
  it("spaces the patient code, or says when it comes", () => {
    expect(cardNumber("MS-2026-00042")).toBe("MS 2026 00042");
    expect(cardNumber(null)).toBe("Given at your first visit");
  });
  it("gives a letter only for male and female", () => {
    expect(sexLetter("female")).toBe("F");
    expect(sexLetter("male")).toBe("M");
    expect(sexLetter("intersex")).toBeNull();
    expect(sexLetter(null)).toBeNull();
  });
  it("reads full_name from metadata, ignoring blanks and non-strings", () => {
    expect(metaName({ full_name: "  First Last " })).toBe("First Last");
    expect(metaName({ full_name: " " })).toBeNull();
    expect(metaName({ full_name: 3 })).toBeNull();
    expect(metaName(undefined)).toBeNull();
  });
  it("makes initials", () => {
    expect(initials("First Middle Last")).toBe("FL");
    expect(initials("Mother")).toBe("M");
    expect(initials(null)).toBe("Me");
  });
});

describe("age from date of birth", () => {
  const on = (iso: string) => new Date(`${iso}T12:00:00`);
  it("counts whole years, before and after the birthday", () => {
    expect(ageFrom("1990-10-17", on("2026-10-17"))).toBe(36);
    expect(ageFrom("1990-10-18", on("2026-10-17"))).toBe(35);
    expect(ageFrom("1990-11-01", on("2026-10-17"))).toBe(35);
    expect(ageFrom("1990-01-01", on("2026-10-17"))).toBe(36);
  });
  it("says nothing without a usable date", () => {
    expect(ageFrom(null, on("2026-10-17"))).toBeNull();
    expect(ageFrom("not a date", on("2026-10-17"))).toBeNull();
    expect(ageFrom("2030-01-01", on("2026-10-17"))).toBeNull();
  });
  it("words", () => {
    expect(ageWords("1990-10-17", on("2026-10-17"))).toBe("36 years");
    expect(ageWords("2025-10-17", on("2026-10-17"))).toBe("1 year");
    expect(ageWords(null, on("2026-10-17"))).toBeNull();
  });
});
