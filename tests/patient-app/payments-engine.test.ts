/** The pure payment rules and the sandbox provider (patient app v2 §5.4, §8.2; PA4, PA5, D-PA-03). */
import {
  defaultPayChoice,
  maskMsisdn,
  normaliseUgMsisdn,
  paymentChip,
  promptView,
  refundEligibility,
  refundStep,
  ticketPayLine,
} from "@patient-core/payments";
import { describe, expect, it } from "vitest";

import {
  promptNarration,
  sandboxAdapter,
  signBody,
  verifyBodySignature,
} from "@/supabase/functions/_shared/payments";

describe("phone numbers", () => {
  it("normalises Ugandan mobiles and masks them", () => {
    for (const n of ["0772 123 456", "772123456", "256772123456", "+256-772-123-456"]) {
      expect(normaliseUgMsisdn(n)).toBe("256772123456");
    }
    expect(normaliseUgMsisdn("0412 123 456")).toBeNull();
    expect(normaliseUgMsisdn("07721234")).toBeNull();
    expect(maskMsisdn("0772123456")).toBe("07•• ••• 456");
    expect(maskMsisdn("nonsense")).toBe("•••");
  });

  it("preselects MoMo only with a saved number (D-PA-03)", () => {
    expect(defaultPayChoice("0772123456")).toBe("momo");
    expect(defaultPayChoice(null)).toBe("hospital");
    expect(defaultPayChoice("12")).toBe("hospital");
  });
});

describe("one payment truth, read the same (PA5)", () => {
  const bill = (
    status: "open" | "paid" | "refunded" | "waived",
    total = 30_000,
    paid = 0,
    refunded = 0,
  ) => ({
    status,
    totalUgx: total,
    paidUgx: paid,
    refundedUgx: refunded,
  });

  it("chips", () => {
    expect(paymentChip(null, null)).toBe("none");
    expect(paymentChip(bill("open"), null)).toBe("at_hospital");
    expect(paymentChip(bill("paid", 30_000, 30_000), "app")).toBe("paid_app");
    expect(paymentChip(bill("paid", 30_000, 30_000), "phone_prompt")).toBe("paid_app");
    expect(paymentChip(bill("paid", 30_000, 30_000), "counter")).toBe("paid_counter");
  });

  it("the ticket's payment line", () => {
    expect(ticketPayLine(null, null)).toEqual({ kind: "free" });
    expect(ticketPayLine(bill("open"), null)).toEqual({ kind: "to_pay", amountUgx: 30_000 });
    expect(ticketPayLine(bill("paid", 30_000, 30_000), { method: "mtn", number: 421 })).toEqual({
      kind: "paid",
      amountUgx: 30_000,
      method: "mtn",
      receiptNumber: 421,
    });
    expect(ticketPayLine(bill("refunded", 30_000, 30_000, 30_000), null)).toEqual({
      kind: "refunded",
      amountUgx: 30_000,
    });
    expect(ticketPayLine(bill("waived"), null)).toEqual({ kind: "free" });
  });

  it("the prompt screen", () => {
    expect(promptView("prompted")).toBe("approve_on_phone");
    expect(promptView("succeeded")).toBe("paid");
    expect(promptView("expired")).toBe("nothing_taken");
    expect(promptView("failed")).toBe("nothing_taken");
  });
});

describe("refunds (P5, D-PA-06)", () => {
  const visit = new Date("2026-11-24T08:00:00Z");
  const base = { paidUgx: 30_000, refundedUgx: 0, visitStartsAt: visit, cutoffHours: 24 };

  it("before the cut-off a patient's refund needs approval; the hospital's is automatic", () => {
    const now = new Date("2026-11-22T08:00:00Z");
    expect(refundEligibility({ ...base, now, cancelledBy: "patient" })).toEqual({
      eligible: true,
      amountUgx: 30_000,
      automatic: false,
    });
    expect(refundEligibility({ ...base, now, cancelledBy: "hospital" })).toMatchObject({
      automatic: true,
    });
  });

  it("after the cut-off, not paid, or already refunded: no", () => {
    const late = new Date("2026-11-23T09:00:00Z");
    expect(refundEligibility({ ...base, now: late, cancelledBy: "patient" })).toEqual({
      eligible: false,
      why: "after_cutoff",
    });
    expect(refundEligibility({ ...base, now: late, cancelledBy: "hospital" })).toMatchObject({
      eligible: true,
    });
    expect(
      refundEligibility({ ...base, paidUgx: 0, now: late, cancelledBy: "hospital" }),
    ).toMatchObject({
      why: "not_paid",
    });
    expect(
      refundEligibility({ ...base, refundedUgx: 30_000, now: late, cancelledBy: "hospital" }),
    ).toMatchObject({ why: "already_refunded" });
  });

  it("tracker steps", () => {
    expect([refundStep("waiting"), refundStep("approved"), refundStep("sent")]).toEqual([1, 2, 3]);
  });
});

describe("the sandbox provider and callback signatures (PA4)", () => {
  const secret = "test-secret";
  const req = (msisdn: string, key = msisdn) => ({
    idempotencyKey: key,
    amountUgx: 30_000,
    msisdn,
    network: "mtn" as const,
    narration: promptNarration("Lane Hospital"),
  });

  it("decides outcomes by the last digit, and repeats are the same request", async () => {
    const sb = sandboxAdapter(secret);
    const a = await sb.requestToPay(req("256772123456"));
    expect(await sb.requestToPay(req("256772123456"))).toEqual(a);
    expect(await sb.getStatus(a.providerRef)).toMatchObject({
      outcome: "succeeded",
      amountUgx: 30_000,
    });
    const poor = await sb.requestToPay(req("256772123450"));
    expect(await sb.getStatus(poor.providerRef)).toMatchObject({
      outcome: "failed",
      reason: "not_enough_balance",
    });
    const silent = await sb.requestToPay(req("256772123459"));
    expect(await sb.getStatus(silent.providerRef)).toBeNull();
  });

  it("verifies signed callbacks and refuses forged ones", async () => {
    const sb = sandboxAdapter(secret);
    const { providerRef } = await sb.requestToPay(req("256772123456"));
    const cb = (await sb.callbackFor(providerRef))!;
    expect(await sb.verifyCallback(cb.body, { "x-sandbox-signature": cb.signature })).toMatchObject(
      { providerRef },
    );
    expect(await sb.verifyCallback(cb.body, { "x-sandbox-signature": "00" })).toBeNull();
    const forged = cb.body.replace("30000", "300");
    expect(await sb.verifyCallback(forged, { "x-sandbox-signature": cb.signature })).toBeNull();
    expect(await verifyBodySignature(secret, "x", await signBody(secret, "x"))).toBe(true);
    expect(await verifyBodySignature("", "x", "y")).toBe(false);
  });

  it("the prompt narration never names a clinic (MR7, MR12)", () => {
    expect(promptNarration("Lane Hospital")).toBe("Lane Hospital · Clinic visit");
  });
});

describe("the shared fixture reads the same through the engine (S8 groundwork)", () => {
  it("every Appendix A payment case gets its chip", async () => {
    const fx = (await import("@/packages/patient-core/fixtures/payments.json")).default as {
      bills: {
        case: string;
        totalUgx: number;
        status: "open" | "paid" | "refunded";
        channel: "app" | "counter" | null;
        chip: string;
      }[];
    };
    for (const b of fx.bills) {
      expect(paymentChip({ status: b.status, totalUgx: b.totalUgx }, b.channel), b.case).toBe(
        b.chip,
      );
    }
  });
});
