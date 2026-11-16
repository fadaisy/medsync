import type { MoneyBill, MoneyInput } from "@patient-core/visit-money";
import { kampalaStamp, visitMoney } from "@patient-core/visit-money";
import { describe, expect, it } from "vitest";

const visit = (o: Partial<MoneyBill> = {}): MoneyBill => ({
  id: "b1",
  kind: "visit",
  status: "open",
  totalUgx: 30_000,
  paidUgx: 0,
  refundedUgx: 0,
  items: [{ label: "Medical officer", amountUgx: 30_000 }],
  ...o,
});
const base = (o: Partial<MoneyInput> = {}): MoneyInput => ({
  appointmentStatus: "confirmed",
  startsAtIso: "2026-11-20T05:00:00Z",
  bills: [visit()],
  receipts: [],
  refunds: [],
  meUserId: "me",
  patientUserId: "me",
  hospitalName: "Mulago",
  cutoffHours: 24,
  now: new Date("2026-11-16T09:00:00Z"),
  ...o,
});
const receipt = (o = {}) => ({
  id: "r1",
  number: 7,
  billId: "b1",
  issuedAtIso: "2026-11-16T11:05:00Z",
  totalUgx: 30_000,
  method: "mtn" as const,
  reference: "sbx_1",
  payerUserId: "me",
  itemLabel: "Medical officer",
  ...o,
});

describe("visitMoney (§5.4 P2–P5)", () => {
  it("P2: an unpaid visit bill is due only after check-in", () => {
    expect(visitMoney(base()).due).toEqual([]);
    expect(visitMoney(base({ appointmentStatus: "arrived" })).due).toEqual([
      { billId: "b1", kind: "visit", onTheDay: true, toPayUgx: 30_000, paidAtBookingUgx: null },
    ]);
  });

  it("P3: a top-up shows what was paid at booking and the difference", () => {
    const m = visitMoney(
      base({
        appointmentStatus: "in_progress",
        bills: [
          visit({ status: "paid", paidUgx: 30_000 }),
          { ...visit({ id: "t1", kind: "top_up", totalUgx: 20_000 }), items: [] },
        ],
      }),
    );
    expect(m.due).toEqual([
      { billId: "t1", kind: "top_up", onTheDay: true, toPayUgx: 20_000, paidAtBookingUgx: 30_000 },
    ]);
  });

  it("a cancelled visit owes nothing", () => {
    expect(visitMoney(base({ appointmentStatus: "cancelled" })).due).toEqual([]);
  });

  it("receipts: Kampala time, the payer as you, household or the counter", () => {
    const m = visitMoney(
      base({
        bills: [visit({ status: "paid", paidUgx: 30_000 })],
        receipts: [receipt(), receipt({ id: "r2", number: 8, payerUserId: "agent" })],
        patientUserId: "child",
      }),
    );
    expect(m.receipts[0]).toMatchObject({
      issuedAt: "16 Nov 2026, 14:05",
      payer: "you",
      forSomeoneElse: true,
    });
    expect(m.receipts[1]!.payer).toBe("household");
    expect(
      visitMoney(base({ receipts: [receipt({ payerUserId: null })] })).receipts[0]!.payer,
    ).toBe("hospital");
  });

  it("MR7: a Clinic visit receipt never lists the clinic's own item", () => {
    const m = visitMoney(base({ receipts: [receipt({ itemLabel: "Clinic visit" })] }));
    expect(m.receipts[0]!.items).toEqual([{ label: "Clinic visit", amountUgx: 30_000 }]);
  });

  it("P5: the cancel rule before the cut-off, the ask after cancelling, then the tracker", () => {
    const paid = { bills: [visit({ status: "paid", paidUgx: 30_000 })], receipts: [receipt()] };
    expect(visitMoney(base(paid)).cancelRule).toEqual({
      paidUgx: 30_000,
      cutoffIso: "2026-11-19T05:00:00.000Z",
    });
    expect(visitMoney(base({ ...paid, cutoffHours: null })).cancelRule).toBeNull();
    expect(
      visitMoney(base({ ...paid, now: new Date("2026-11-19T06:00:00Z") })).cancelRule,
    ).toBeNull();
    const cancelled = base({ ...paid, appointmentStatus: "cancelled" });
    expect(visitMoney(cancelled).canAskRefund).toBe(true);
    const asked = visitMoney({ ...cancelled, refunds: [{ receiptId: "r1", status: "approved" }] });
    expect(asked).toMatchObject({
      canAskRefund: false,
      refund: { status: "approved", network: "mtn" },
    });
  });

  it("kampalaStamp crosses midnight in Kampala time", () => {
    expect(kampalaStamp("2026-11-16T22:30:00Z")).toBe("17 Nov 2026, 01:30");
  });
});
