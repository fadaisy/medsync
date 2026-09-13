import { describe, expect, it } from "vitest";

import { composeReceiptSms } from "@/lib/notifications/receipt";
import { isGsmSafe, SMS_MAX_BODY_CHARS } from "@/lib/notifications/sink";

/**
 * The durable receipt (ADR 0088). Every instant is explicit UTC and every
 * expectation is its Kampala (UTC+3) reading. 2026-09-22 is a Tuesday.
 */
const SLOT = {
  hospitalName: "Mulago National Referral Hospital",
  serviceName: "Diabetes Clinic",
  startsAtIso: "2026-09-22T06:30:00Z", // 09:30 EAT
  bookingCode: "ABC123",
};

describe("composeReceiptSms", () => {
  it("slot: hospital, line, full date with a clock time, code, desk line", () => {
    expect(composeReceiptSms(SLOT)).toBe(
      "MedSync: Mulago National Referral Hospital. Diabetes Clinic. Tue 22 Sep, 9:30 AM. " +
        "Code ABC123. Show this at the desk.",
    );
  });

  it("session: date, position and an arrival RANGE — never a point estimate", () => {
    const body = composeReceiptSms({
      ...SLOT,
      positionNumber: 23,
      arrivalWindowStartIso: "2026-09-22T06:30:00Z",
      arrivalWindowEndIso: "2026-09-22T08:00:00Z",
    });
    expect(body).toBe(
      "MedSync: Mulago National Referral Hospital. Diabetes Clinic. Tue 22 Sep, position 23, " +
        "arrive 9:30-11:00 AM. Code ABC123. Show this at the desk.",
    );
  });

  it("a window across noon names both periods", () => {
    const body = composeReceiptSms({
      ...SLOT,
      positionNumber: 40,
      arrivalWindowStartIso: "2026-09-22T08:30:00Z",
      arrivalWindowEndIso: "2026-09-22T10:00:00Z",
    });
    expect(body).toContain("arrive 11:30 AM-1:00 PM.");
  });

  it("always one GSM-7 part: long names are cut, the code and date never are", () => {
    const body = composeReceiptSms({
      ...SLOT,
      hospitalName: "St Mary's Hospital Lacor and the Very Long Annexe of the Northern Region",
      serviceName: "Non-Communicable Disease Follow-up and Medication Review Clinic",
      positionNumber: 123,
      arrivalWindowStartIso: "2026-09-22T06:30:00Z",
      arrivalWindowEndIso: "2026-09-22T08:00:00Z",
    });
    expect(body.length).toBeLessThanOrEqual(SMS_MAX_BODY_CHARS);
    expect(isGsmSafe(body)).toBe(true);
    expect(body).toContain("Code ABC123.");
    expect(body).toContain("Tue 22 Sep, position 123, arrive 9:30-11:00 AM.");
    expect(body.endsWith("Show this at the desk.")).toBe(true);
  });

  it("strips what would flip the message to UCS-2", () => {
    const body = composeReceiptSms({
      ...SLOT,
      hospitalName: "St Mary’s — Lacor",
      serviceName: "Clinic Ⅱ",
    });
    expect(isGsmSafe(body)).toBe(true);
    expect(body).toContain("St Mary's Lacor.");
  });
});
