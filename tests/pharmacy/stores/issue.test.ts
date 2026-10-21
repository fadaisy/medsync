import { describe, expect, it } from "vitest";

import {
  confirmationAdjustments,
  controlledRefusals,
  loanBalances,
  loanTotals,
  planIssue,
  requisitionNext,
  returnRoute,
  unconfirmedOverdue,
} from "@/lib/pharmacy/stores/issue";
import { at, batch, mv } from "./fixtures";

describe("IS-1 requisition states", () => {
  const issue = (lines: { asked: number; issued: number; notIssuedReason: string | null }[]) =>
    requisitionNext("raised", { type: "issue", lines });
  it("issued in full, part issued, or refused when nothing is issued", () => {
    expect(issue([{ asked: 10, issued: 10, notIssuedReason: null }])).toEqual({
      ok: true,
      state: "issued",
    });
    expect(
      issue([
        { asked: 10, issued: 6, notIssuedReason: null },
        { asked: 5, issued: 0, notIssuedReason: "Out at store" },
      ]),
    ).toEqual({ ok: true, state: "part_issued" });
    expect(issue([{ asked: 10, issued: 0, notIssuedReason: "x" }])).toEqual({
      ok: false,
      reason: "nothing_issued",
    });
  });
  it("a line issued as zero needs a reason; refusing needs a reason", () => {
    expect(
      issue([
        { asked: 10, issued: 10, notIssuedReason: null },
        { asked: 5, issued: 0, notIssuedReason: null },
      ]),
    ).toEqual({ ok: false, reason: "not_issued_reason_needed" });
    expect(requisitionNext("raised", { type: "refuse", reason: "" })).toEqual({
      ok: false,
      reason: "reason_needed",
    });
    expect(requisitionNext("raised", { type: "refuse", reason: "Ward closed" })).toEqual({
      ok: true,
      state: "refused",
    });
    expect(requisitionNext("raised", { type: "withdraw" })).toEqual({
      ok: true,
      state: "withdrawn",
    });
  });
  it("confirmed, with or without a difference; nothing else moves a closed requisition", () => {
    expect(requisitionNext("issued", { type: "confirm", differences: 0 })).toEqual({
      ok: true,
      state: "confirmed",
    });
    expect(requisitionNext("part_issued", { type: "confirm", differences: 2 })).toEqual({
      ok: true,
      state: "confirmed_with_difference",
    });
    expect(requisitionNext("confirmed", { type: "withdraw" })).toEqual({
      ok: false,
      reason: "not_allowed",
    });
    expect(requisitionNext("raised", { type: "confirm", differences: 0 })).toEqual({
      ok: false,
      reason: "not_allowed",
    });
  });
});

describe("IS-2 planIssue: first expiry first, capped at held, never below zero", () => {
  const bs = [
    batch({ id: "b-late", expiry: "2027-09-30" }),
    batch({ id: "b-early", expiry: "2027-01-31" }),
    batch({ id: "b-expired", expiry: "2026-09-30" }),
    batch({ id: "b-recalled", expiry: "2026-12-31" }),
  ];
  const balances = new Map([
    ["b-late", 30],
    ["b-early", 20],
    ["b-expired", 100],
    ["b-recalled", 100],
  ]);
  const input = {
    batches: bs,
    balances,
    blocked: new Set(["b-recalled"]),
    localDate: "2026-10-21",
  };
  it("splits in expiry order, skipping expired and blocked batches", () => {
    expect(planIssue(35, input)).toEqual({
      rows: [
        { batchId: "b-early", quantity: 20 },
        { batchId: "b-late", quantity: 15 },
      ],
      issue: 35,
      held: 50,
      short: 0,
    });
  });
  it("caps at what is held, and issues nothing when nothing is held", () => {
    expect(planIssue(80, input)).toMatchObject({ issue: 50, held: 50, short: 30 });
    expect(planIssue(5, { ...input, balances: new Map() })).toEqual({
      rows: [],
      issue: 0,
      held: 0,
      short: 5,
    });
  });
});

describe("IS-3 confirmation at the other end", () => {
  it("a difference writes an adjustment at the receiving location, with a reason, for both in-charges", () => {
    const r = confirmationAdjustments(
      [
        { receivingBatchId: "w1", issued: 20, confirmed: 18, controlled: false },
        { receivingBatchId: "w2", issued: 10, confirmed: 10, controlled: true },
      ],
      "broken_in_transit",
    );
    expect(r).toEqual({
      ok: true,
      adjustments: [
        {
          batchId: "w1",
          quantity: -2,
          reasonCode: "broken_in_transit",
          controlledDifference: false,
        },
      ],
      notify: ["issuing_in_charge", "receiving_in_charge"],
    });
    expect(
      confirmationAdjustments(
        [{ receivingBatchId: "w1", issued: 5, confirmed: 4, controlled: true }],
        null,
      ),
    ).toEqual({
      ok: false,
      reason: "reason_needed",
    });
  });
  it("a controlled difference also needs a witnessed Phase 1 controlled difference", () => {
    const r = confirmationAdjustments(
      [{ receivingBatchId: "w", issued: 5, confirmed: 4, controlled: true }],
      "x",
    );
    expect(r.ok && r.adjustments[0]?.controlledDifference).toBe(true);
  });
});

describe("IS-4 unconfirmed issues past the signed window", () => {
  const issues = [
    { id: "i1", issuedAt: at("2026-10-20T08:00:00"), confirmedAt: null },
    { id: "i2", issuedAt: at("2026-10-21T08:00:00"), confirmedAt: null },
    { id: "i3", issuedAt: at("2026-10-19T08:00:00"), confirmedAt: at("2026-10-19T09:00:00") },
  ];
  it("lists those older than the window; unsigned, nothing is computed", () => {
    const r = unconfirmedOverdue(issues, at("2026-10-21T10:00:00"), 24);
    expect("overdue" in r && r.overdue.map((i) => i.id)).toEqual(["i1"]);
    expect(unconfirmedOverdue(issues, at("2026-10-21T10:00:00"), null)).toEqual({
      missing: ["confirmation_window"],
    });
  });
});

describe("IS-5 returns", () => {
  const base = {
    reasonCode: "near_expiry",
    issuerLocationId: "loc-store",
    quarantineLocationId: "loc-q",
  };
  it("fit returns go back to the issuer as a pair; not fit goes to quarantine", () => {
    expect(returnRoute({ ...base, fit: true })).toEqual({
      ok: true,
      outKind: "returned_out",
      toLocationId: "loc-store",
    });
    expect(returnRoute({ ...base, fit: false })).toEqual({
      ok: true,
      outKind: "quarantined_out",
      toLocationId: "loc-q",
    });
    expect(returnRoute({ ...base, fit: true, reasonCode: " " })).toEqual({
      ok: false,
      reason: "reason_needed",
    });
  });
});

describe("IS-6 controlled lines", () => {
  it("witness at the issuing end, second factor at the receiving end", () => {
    const l = { controlled: true, witnessAttestationId: null, confirmerSecondFactor: false };
    expect(controlledRefusals({ ...l, movement: "issue" })).toEqual(["witness_needed"]);
    expect(controlledRefusals({ ...l, movement: "issue", witnessAttestationId: "att" })).toEqual(
      [],
    );
    expect(controlledRefusals({ ...l, movement: "confirm" })).toEqual(["second_factor_needed"]);
    expect(controlledRefusals({ ...l, controlled: false, movement: "issue" })).toEqual([]);
  });
});

describe("IS-7 loans", () => {
  const t = at("2026-10-01T09:00:00");
  const lent = mv("b1", "loc-store", "lent", -40, t, { counterpartyId: "fac-a" });
  const borrowed = mv("b2", "loc-store", "borrowed", 25, t, { counterpartyId: "fac-b" });
  const productOf = new Map([
    ["b1", "fx-product-a"],
    ["b2", "fx-product-b"],
  ]);
  it("outstanding per facility and product is a projection; returns settle their loan", () => {
    const back = mv("b1", "loc-store", "loan_returned_in", 15, t, {
      counterpartyId: "fac-a",
      loanMovementId: lent.id,
    });
    const r = loanBalances([lent, borrowed, back], productOf);
    expect(
      r.outstanding.map((o) => [o.counterpartyId, o.productId, o.direction, o.quantity]),
    ).toEqual([
      ["fac-a", "fx-product-a", "lent", 25],
      ["fac-b", "fx-product-b", "borrowed", 25],
    ]);
    expect(loanTotals(r.outstanding).get("fac-a|fx-product-a|lent")).toBe(25);
    expect(r.problems).toEqual([]);
  });
  it("a return never opens a new loan: unlinked, wrong-way or excess returns are problems", () => {
    const r = loanBalances(
      [
        lent,
        mv("b1", "loc-store", "loan_returned_in", 5, t, { loanMovementId: null }),
        mv("b1", "loc-store", "loan_returned_out", -5, t, { loanMovementId: lent.id }),
        mv("b1", "loc-store", "loan_returned_in", 50, t, { loanMovementId: lent.id }),
      ],
      productOf,
    );
    expect(r.problems.map((p) => p.problem)).toEqual([
      "no_loan",
      "wrong_direction",
      "exceeds_loan",
    ]);
    expect(r.outstanding).toEqual([]);
  });
  it("controlled products are not lent or borrowed", () => {
    expect(
      controlledRefusals({
        controlled: true,
        movement: "loan",
        witnessAttestationId: "w",
        confirmerSecondFactor: true,
      }),
    ).toEqual(["controlled_not_lent"]);
  });
});
