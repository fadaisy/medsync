/** Patient app v2 Visit mode data on the phone (Step 4): the ticket view and the payment line, never red. */
import type { AppointmentRow } from "@/lib/booking";

import { chipFor, groupCode, payLineFor, ticketFor } from "@/data/visit-v2";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@/lib/edge", () => ({ callEdge: jest.fn(), requestId: () => "00000000-0000-4000-8000-000000000001" }));

const visit = (over: Partial<AppointmentRow> = {}): AppointmentRow & { quotedFeeUgx: number | null } =>
  ({
    id: "a1",
    startsAtIso: "2026-11-16T05:00:00.000Z",
    endsAtIso: "2026-11-16T07:00:00.000Z",
    status: "confirmed",
    departmentName: "General OPD",
    hospitalName: "Kampala General Hospital",
    bookingCode: "k7m42q",
    sessionId: "s1",
    arrivalWindowStartIso: "2026-11-16T05:00:00.000Z",
    arrivalWindowEndIso: "2026-11-16T07:00:00.000Z",
    forMember: null,
    quotedFeeUgx: 30000,
    ...over,
  }) as AppointmentRow & { quotedFeeUgx: number | null };

describe("v2 ticket view of a visit", () => {
  it("groups the desk code and names the hospital", () => {
    expect(groupCode("k7m42q")).toBe("K7M 42Q");
    expect(groupCode(null)).toBe("—");
    const t = ticketFor(visit(), undefined, "Esther N.");
    expect(t).toMatchObject({ hospitalInitials: "KG", day: "16", clinic: "General OPD", code: "K7M 42Q", doctorTime: false, patient: "Esther N." });
    expect(t.window).toBe("08:00 to 10:00");
    expect(t.dayLine).toBe("Monday · November");
  });

  it("a household member's visit names them; a doctor's time shows a clock", () => {
    const t = ticketFor(visit({ forMember: "Sarah", sessionId: null }), undefined, "Esther N.");
    expect(t.patient).toBe("Sarah");
    expect(t.doctorTime).toBe(true);
    expect(t.window).toMatch(/^\d\d:\d\d$/);
  });

  it("before a bill exists the quoted fee shows as to pay; a free visit shows nothing", () => {
    expect(payLineFor({ quotedFeeUgx: 30000 }, undefined)).toEqual({ kind: "to_pay", amountUgx: 30000 });
    expect(payLineFor({ quotedFeeUgx: null }, undefined)).toEqual({ kind: "free" });
  });

  it("a paid bill reads paid with its receipt; chips follow the one status (PA5)", () => {
    const pay = {
      appointmentId: "a1",
      billId: "b1",
      status: "paid" as const,
      totalUgx: 30000,
      paidUgx: 30000,
      refundedUgx: 0,
      method: "mtn" as const,
      receiptNumber: 421,
      paidChannel: "app" as const,
    };
    expect(payLineFor({ quotedFeeUgx: 30000 }, pay)).toEqual({ kind: "paid", amountUgx: 30000, method: "mtn", receiptNumber: 421 });
    expect(chipFor(pay)).toBe("paid_app");
    expect(chipFor(undefined)).toBe("at_hospital");
  });
});
