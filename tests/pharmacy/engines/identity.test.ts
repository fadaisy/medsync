import type { PharmacyAccess, PharmacyPermission } from "@/lib/pharmacy/access";
import type { IdentityAttempt } from "@/lib/pharmacy/supply/identity";
import { describe, expect, it, vi } from "vitest";

import {
  attemptsLeft,
  compareSecondIdentifier,
  identifiedAnotherWay,
  IDENTITY_COPY,
  MAX_WRONG_ATTEMPTS,
  mayReopenTypedCheck,
  normaliseDob,
  normalisePhoneUg,
  typedCheckClosed,
  validateCollector,
} from "@/lib/pharmacy/supply/identity";

/**
 * Pharmacy Phase 1 — identity at the window (SU-4, SU-5, H5, D-PH1-16, Law 6). Fixture data: an invented
 * date of birth and an invented phone number; `blindIndex` is a fixture function (Law 8).
 */
const STORED_DOB = "1987-03-09";
const STORED_PHONE = "+256700000123";
const fakeIndex = (v: string) => `idx:${v}`;
const access = (...p: PharmacyPermission[]): PharmacyAccess => ({ permissions: new Set(p) });

describe("SU-4 normalising the typed date of birth", () => {
  it.each([
    ["09/03/1987", STORED_DOB],
    ["9/3/1987", STORED_DOB],
    ["1987-03-09", STORED_DOB],
    ["09-03-1987", STORED_DOB],
    ["09.03.1987", STORED_DOB],
    [" 09 / 03 / 1987 ", STORED_DOB],
  ])("SU-4: %s → %s", (typed, iso) => {
    expect(normaliseDob(typed)).toBe(iso);
  });

  it.each(["09/03/87", "9-3-87", "31/02/1987", "09/03-1987", "1987/03/09", "", "born 1987"])(
    "SU-4: %s is refused, never guessed",
    (typed) => {
      expect(normaliseDob(typed)).toBeNull();
    },
  );
});

describe("SU-4 normalising the typed phone", () => {
  it.each(["0700 000 123", "700000123", "256700000123", "+256 700-000-123", "(0700) 000123"])(
    "SU-4: %s → E.164",
    (typed) => {
      expect(normalisePhoneUg(typed)).toBe(STORED_PHONE);
    },
  );

  it.each(["12345", "0700 000 12", "+254700000123", "phone"])("SU-4: %s → null", (typed) => {
    expect(normalisePhoneUg(typed)).toBeNull();
  });
});

describe("SU-4 comparing on the server", () => {
  const base = { storedDob: STORED_DOB, phoneHmac: fakeIndex(STORED_PHONE), blindIndex: fakeIndex };

  it("SU-4 S36: a matching date of birth in any accepted form matches; a wrong one does not", () => {
    expect(compareSecondIdentifier({ ...base, kind: "date_of_birth", typed: "9.3.1987" })).toBe(
      "match",
    );
    expect(compareSecondIdentifier({ ...base, kind: "date_of_birth", typed: "10/03/1987" })).toBe(
      "mismatch",
    );
    expect(compareSecondIdentifier({ ...base, kind: "date_of_birth", typed: "09/03/87" })).toBe(
      "mismatch",
    );
  });

  it("SU-4: the phone is compared by blind index first; decrypt is never called then", () => {
    const decryptPhone = vi.fn(() => STORED_PHONE);
    expect(
      compareSecondIdentifier({ ...base, kind: "phone", typed: "0700 000 123", decryptPhone }),
    ).toBe("match");
    expect(
      compareSecondIdentifier({ ...base, kind: "phone", typed: "0700 000 124", decryptPhone }),
    ).toBe("mismatch");
    expect(decryptPhone).not.toHaveBeenCalled();
  });

  it("SU-4: with no blind index on the row, it falls back to decrypt-and-compare", () => {
    const decryptPhone = vi.fn(() => "0700000123");
    expect(
      compareSecondIdentifier({
        ...base,
        phoneHmac: null,
        kind: "phone",
        typed: "+256700000123",
        decryptPhone,
      }),
    ).toBe("match");
    expect(decryptPhone).toHaveBeenCalledOnce();
    expect(
      compareSecondIdentifier({ ...base, phoneHmac: null, kind: "phone", typed: "0700000123" }),
    ).toBe("mismatch");
  });

  it("SU-4 S36: no result carries the stored date of birth or phone", () => {
    const results = [
      compareSecondIdentifier({ ...base, kind: "date_of_birth", typed: "01/01/1990" }),
      compareSecondIdentifier({ ...base, kind: "date_of_birth", typed: "09/03/1987" }),
      compareSecondIdentifier({ ...base, kind: "phone", typed: "0711111111" }),
      compareSecondIdentifier({ ...base, kind: "phone", typed: "0700000123" }),
    ];
    for (const r of results) {
      const json = JSON.stringify(r);
      expect(json).not.toContain("1987");
      expect(json).not.toContain("700000123");
      expect(["match", "mismatch"]).toContain(r);
    }
    expect(IDENTITY_COPY.mismatch).toBe("This does not match. Check you have the right patient.");
  });
});

describe("H5 five wrong attempts per patient per hospital-local day", () => {
  const TODAY = "2026-10-12";
  const at = (iso: string, outcome: IdentityAttempt["outcome"]): IdentityAttempt => ({
    outcome,
    attemptedAt: new Date(iso),
  });
  const wrong = (n: number, from = 8) =>
    Array.from({ length: n }, (_, i) =>
      at(`2026-10-12T${String(from + i).padStart(2, "0")}:00:00Z`, "mismatch"),
    );

  it("H5 S36: five wrong tries close the typed check", () => {
    expect(MAX_WRONG_ATTEMPTS).toBe(5);
    expect(attemptsLeft(wrong(4), TODAY)).toBe(1);
    expect(typedCheckClosed(wrong(4), TODAY)).toBe(false);
    expect(typedCheckClosed(wrong(5), TODAY)).toBe(true);
  });

  it("H5: a match does not reset the count; a new hand-over does not either", () => {
    expect(attemptsLeft([...wrong(3), at("2026-10-12T12:00:00Z", "match")], TODAY)).toBe(2);
  });

  it("H5: the in-charge's reopened row reopens it; only the in-charge may reopen", () => {
    const attempts = [...wrong(5), at("2026-10-12T14:00:00Z", "reopened")];
    expect(typedCheckClosed(attempts, TODAY)).toBe(false);
    expect(attemptsLeft(attempts, TODAY)).toBe(5);
    expect(mayReopenTypedCheck(access("pharmacy.manage"))).toBe(true);
    expect(mayReopenTypedCheck(access("pharmacy.review", "pharmacy.dispense"))).toBe(false);
  });

  it("H5: the day is Kampala's: 21:30 UTC is already tomorrow", () => {
    const late = Array.from({ length: 5 }, (_, i) => at(`2026-10-11T21:3${i}:00Z`, "mismatch"));
    expect(typedCheckClosed(late, "2026-10-12")).toBe(true);
    expect(typedCheckClosed(late, "2026-10-11")).toBe(false);
  });
});

describe("D-PH1-16 identified another way", () => {
  const ROUTES = ["card_shown", "known", "other"];

  it("D-PH1-16 S36: a signed route passes; 'other' needs a note", () => {
    expect(identifiedAnotherWay("known", null, ROUTES)).toEqual({
      ok: true,
      how: "known",
      note: null,
    });
    expect(identifiedAnotherWay("other", " ", ROUTES)).toEqual({
      ok: false,
      reason: "note_needed",
    });
    expect(identifiedAnotherWay("other", "Ward nurse vouched", ROUTES)).toEqual({
      ok: true,
      how: "other",
      note: "Ward nurse vouched",
    });
  });

  it("D-PH1-16: an unsigned list or an unknown route is refused", () => {
    expect(identifiedAnotherWay("known", null, null)).toEqual({ ok: false, reason: "unsigned" });
    expect(identifiedAnotherWay("guessed", null, ROUTES)).toEqual({
      ok: false,
      reason: "unknown_route",
    });
    expect(identifiedAnotherWay("other", "x".repeat(501), ROUTES)).toEqual({
      ok: false,
      reason: "note_too_long",
    });
  });
});

describe("SU-5 the collector", () => {
  const ctx = { inpatientSupplyOn: false, isHospitalStaff: false };

  it("SU-5: the patient, or a representative with a name and relationship", () => {
    expect(validateCollector({ kind: "patient" }, ctx)).toEqual({
      ok: true,
      row: {
        collector: "patient",
        collectorName: null,
        collectorRelationship: null,
        collectorUserId: null,
      },
    });
    expect(
      validateCollector(
        { kind: "representative", name: "Fixture Kin", relationship: "Sister" },
        ctx,
      ),
    ).toMatchObject({
      ok: true,
      row: { collectorName: "Fixture Kin", collectorRelationship: "Sister" },
    });
    expect(
      validateCollector({ kind: "representative", name: "F", relationship: "Sister" }, ctx),
    ).toEqual({ ok: false, reason: "name" });
    expect(
      validateCollector({ kind: "representative", name: "Fixture Kin", relationship: "" }, ctx),
    ).toEqual({ ok: false, reason: "relationship" });
  });

  it("SU-5 D-PH1-02: ward staff only with individual inpatient supply on, and only this hospital's staff", () => {
    const ward = { kind: "ward_staff" as const, userId: "U-nurse" };
    expect(validateCollector(ward, ctx)).toEqual({ ok: false, reason: "ward_staff_off" });
    expect(validateCollector(ward, { inpatientSupplyOn: true, isHospitalStaff: false })).toEqual({
      ok: false,
      reason: "not_staff",
    });
    expect(
      validateCollector(ward, { inpatientSupplyOn: true, isHospitalStaff: true }),
    ).toMatchObject({ ok: true, row: { collector: "ward_staff", collectorUserId: "U-nurse" } });
  });
});
