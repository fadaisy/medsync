import type { PartnerLegal } from "@/lib/exchange/partners";
import { describe, expect, it } from "vitest";

import {
  allowedFields,
  crossBorderWords,
  electronicSendAllowed,
  FIELD_ALLOW_LIST,
  legalMissing,
  PartnerFieldsPayload,
  PartnerTestsPayload,
  reviewState,
  testFor,
} from "@/lib/exchange/partners";
import { LEAD_ONLY_KINDS, PAYLOADS } from "@/lib/lab/signed-config";

/** Lab Phase 4 Step 3: partners and data protection (PT-1..PT-6, D-LAB4-19..22). Every value is synthetic. */
const legal = (o: Partial<PartnerLegal> = {}): PartnerLegal => ({
  basis: "s7_2_d",
  agreement: { ref: "TEST-AGREEMENT-1", signedOn: "2026-01-01", reviewOn: "2027-01-01" },
  processorTerms: true,
  crossBorder: false,
  perPatientConsent: false,
  pdpo: { ref: "TEST-PDPO-1", renewOn: "2027-06-30" },
  breachContact: "Test DP officer, test@example.org",
  ...o,
});
const today = "2026-10-17";

describe("PT-1, A4: the six signed kinds", () => {
  it("A4 the kinds are in the signing engine; tests, packing, legal, fields and settings are signed by one lead", () => {
    for (const k of [
      "partner_tests",
      "partner_packing",
      "partner_legal",
      "partner_fields",
      "referral_ops",
      "referral_wording",
    ])
      expect(Object.keys(PAYLOADS)).toContain(k);
    expect(LEAD_ONLY_KINDS).toEqual(
      expect.arrayContaining([
        "partner_tests",
        "partner_packing",
        "partner_legal",
        "partner_fields",
        "referral_ops",
      ]),
    );
    expect(LEAD_ONLY_KINDS).not.toContain("referral_wording");
  });

  it("PT-1 a partner test needs their code; turnaround is optional and has a unit", () => {
    const ok = PartnerTestsPayload.safeParse({
      tests: [
        {
          testCode: "test.a",
          theirCode: "TEST-A",
          category: "serum",
          turnaround: { value: 2, unit: "working_days" },
        },
      ],
      source: { doc: "Test price list", date: "2026-10-01" },
    });
    expect(ok.success).toBe(true);
    expect(
      PartnerTestsPayload.safeParse({
        tests: [{ testCode: "test.a", category: "serum" }],
        source: { doc: "x x x", date: "2026-10-01" },
      }).success,
    ).toBe(false);
  });

  it("S1 PT-1 an unmapped test shows Map before sending", () => {
    const t = PartnerTestsPayload.parse({
      tests: [{ testCode: "test.a", theirCode: "TEST-A", category: "serum" }],
      source: { doc: "Test list", date: "2026-10-01" },
    });
    expect(testFor(t, "test.a")).toMatchObject({ theirCode: "TEST-A" });
    expect(testFor(t, "test.b")).toEqual({ mapBeforeSending: true });
    expect(testFor(null, "test.a")).toEqual({ mapBeforeSending: true });
  });
});

describe("PT-3, D-LAB4-21: the field list", () => {
  it("S2 diagnosis, phone and address cannot be on a field list", () => {
    for (const f of ["diagnosis", "phone", "address", "phone_number"]) {
      expect(FIELD_ALLOW_LIST as readonly string[]).not.toContain(f);
      expect(PartnerFieldsPayload.safeParse({ fields: ["name", f] }).success, f).toBe(false);
    }
  });

  it("A21 the clinical question is off unless the list says so", () => {
    expect(PartnerFieldsPayload.parse({ fields: ["name"] }).clinicalQuestion).toBe(false);
  });

  it("PT-3 only listed fields leave", () => {
    const list = PartnerFieldsPayload.parse({ fields: ["hospital_number", "birth_date"] });
    expect(
      allowedFields(
        { hospital_number: "MRN-TEST-1", name: "Test Patient", birth_date: "2000-01-01" },
        list,
      ),
    ).toEqual({
      hospital_number: "MRN-TEST-1",
      birth_date: "2000-01-01",
    });
  });
});

describe("PT-2, PT-4, PT-6: the legal record and the gate", () => {
  it("PT-2 an agreement is required; cross-border needs safeguards or per-patient consent", () => {
    expect(legalMissing(null)).toEqual(["legal_record"]);
    expect(legalMissing(legal({ agreement: undefined }))).toEqual(["agreement"]);
    expect(legalMissing(legal({ crossBorder: true }))).toEqual(["cross_border_safeguards"]);
    expect(legalMissing(legal({ crossBorder: true, perPatientConsent: true }))).toEqual([]);
  });

  it("PT-4 sending needs a signed, complete legal record", () => {
    const base = {
      partnerKind: "private_lab",
      consentRef: null,
      today,
      stopSendingDaysAfterReview: 30,
    };
    expect(electronicSendAllowed({ ...base, legal: legal(), legalSigned: true })).toEqual({
      ok: true,
      inform: [],
    });
    expect(electronicSendAllowed({ ...base, legal: legal(), legalSigned: false })).toEqual({
      ok: false,
      reasons: ["legal_not_signed"],
    });
  });

  it("S3 D-LAB4-22 abroad without safeguards is refused; with the patient's consent on the referral it is allowed", () => {
    const base = {
      partnerKind: "abroad",
      today,
      stopSendingDaysAfterReview: 30,
      legalSigned: true,
    };
    const l = legal({ crossBorder: true, perPatientConsent: true });
    expect(electronicSendAllowed({ ...base, legal: l, consentRef: null })).toEqual({
      ok: false,
      reasons: ["cross_border_refused"],
    });
    expect(electronicSendAllowed({ ...base, legal: l, consentRef: "TEST-CONSENT-1" })).toEqual({
      ok: true,
      inform: [],
    });
    expect(crossBorderWords("Lab abroad (test)")).toBe(
      "Lab abroad (test) processes data outside Uganda. Record the patient's consent or the safeguards before sending.",
    );
  });

  it("S4 PT-6, D-LAB4-20 a passed review date informs, then stops sending after the operational days", () => {
    const l = legal({
      agreement: { ref: "TEST-AGREEMENT-1", signedOn: "2025-01-01", reviewOn: "2026-10-01" },
    });
    expect(reviewState(l, today)).toBe("review_passed");
    const base = { partnerKind: "private_lab", consentRef: null, legalSigned: true, legal: l };
    expect(electronicSendAllowed({ ...base, today, stopSendingDaysAfterReview: 30 })).toEqual({
      ok: true,
      inform: ["review_passed"],
    });
    expect(
      electronicSendAllowed({ ...base, today: "2026-11-15", stopSendingDaysAfterReview: 30 }),
    ).toEqual({
      ok: false,
      reasons: ["review_lapsed"],
    });
    expect(reviewState(legal({ pdpo: { ref: "TEST-PDPO-1", renewOn: "2026-10-01" } }), today)).toBe(
      "pdpo_expired",
    );
  });
});
