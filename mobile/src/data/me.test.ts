import { cardNumber, initials, metaName, sexLetter } from "@/data/me";

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
