import { describe, expect, it } from "vitest";

import {
  cartSignals,
  explainCartGaps,
  groupOf,
  nextStep,
  pickCheck,
  pickProblems,
  wardUseCheck,
} from "@/lib/pharmacy/distribution/engine";

const amox500 = { productId: "p1", name: "Amoxicillin", strength: "500 mg" };
const amox250 = { productId: "p2", name: "Amoxicillin", strength: "250 mg" };
const para = { productId: "p3", name: "Paracetamol", strength: "500 mg" };
const planned = [{ batchId: "b1", batchNumber: "A1", expiry: "2027-03-31" }];

describe("pickCheck (S38)", () => {
  const base = { line: amox500, batch: null, planned, laterReason: null };
  it("refuses another product and another strength in words", () => {
    expect(pickCheck({ ...base, scanned: para })).toMatchObject({ kind: "refused" });
    const r = pickCheck({ ...base, scanned: amox250 });
    expect(r.kind === "refused" && r.words).toBe(
      "This is Amoxicillin 250 mg. The line asks for Amoxicillin 500 mg.",
    );
    expect(pickCheck({ ...base, scanned: null }).kind).toBe("refused");
  });
  it("takes the planned batch, and a later batch only with a reason", () => {
    expect(
      pickCheck({
        ...base,
        scanned: amox500,
        batch: { id: "b1", batchNumber: "A1", expiry: "2027-03-31" },
      }),
    ).toEqual({ kind: "ok", later: false });
    const later = {
      ...base,
      scanned: amox500,
      batch: { id: "b9", batchNumber: "Z9", expiry: "2028-01-31" },
    };
    expect(pickCheck(later).kind).toBe("later_batch");
    expect(pickCheck({ ...later, laterReason: "planned_batch_damaged" })).toEqual({
      kind: "ok",
      later: true,
    });
  });
  it("blocks the issue while a line with a quantity is unpicked", () => {
    const lines = [
      { lineId: "l1", name: "Amoxicillin 500 mg", quantity: 20 },
      { lineId: "l2", name: "Paracetamol 500 mg", quantity: 0 },
    ];
    expect(pickProblems(lines, new Set())).toHaveLength(1);
    expect(pickProblems(lines, new Set(["l1"]))).toEqual([]);
  });
});

describe("wardUseCheck (S41), board 11–15", () => {
  const rows = [
    { productId: "cef", name: "Ceftriaxone 1 g", used: 22, charted: 22, reason: null },
    { productId: "tra", name: "Tramadol 50 mg", used: 15, charted: 8, reason: null },
    { productId: "gau", name: "Gauze swabs", used: 40, charted: null, reason: null },
  ];
  it("reads match, gap with one notify item, and not charted", () => {
    const r = wardUseCheck(rows, "nic");
    expect(r.rows.map((x) => x.compared.words)).toEqual([
      "Matches the charts",
      "7 not on any chart",
      "Not charted from ward stock",
    ]);
    expect(r.notify).toEqual([
      {
        userId: "nic",
        productId: "tra",
        words: "Tramadol 50 mg: 7 not on any chart. Give the reason.",
      },
    ]);
  });
  it("a gap with a reason reads explained and notifies nobody", () => {
    const r = wardUseCheck([{ ...rows[1]!, reason: "dose_wasted" }], "nic");
    expect(r.rows[0]!.compared).toEqual({
      kind: "explained",
      gap: 7,
      words: "7 more used than charted",
    });
    expect(r.notify).toEqual([]);
  });
});

describe("cartSignals (S42)", () => {
  const checked = new Date("2026-10-20T08:00:00Z");
  it("a broken seal or a resus dose after the last check makes the cart due", () => {
    expect(cartSignals({ lastCheckAt: checked, seals: [], resusDoses: [] })).toEqual({
      due: false,
      why: [],
    });
    expect(
      cartSignals({
        lastCheckAt: checked,
        seals: [{ kind: "broken", at: new Date("2026-10-21T02:00:00Z") }],
        resusDoses: [],
      }).why,
    ).toEqual(["seal_broken"]);
    expect(
      cartSignals({
        lastCheckAt: checked,
        seals: [
          { kind: "broken", at: new Date("2026-10-21T02:00:00Z") },
          { kind: "applied", at: new Date("2026-10-21T09:00:00Z") },
        ],
        resusDoses: [{ at: new Date("2026-10-21T01:00:00Z") }],
      }).why,
    ).toEqual(["resus_dose"]);
    expect(
      cartSignals({
        lastCheckAt: checked,
        seals: [],
        resusDoses: [{ at: new Date("2026-10-19T01:00:00Z") }],
      }).due,
    ).toBe(false);
  });
  it("a resus dose explains the matching cart gap", () => {
    const g = explainCartGaps(
      [{ medicineKey: "adrenaline", gap: -2 }],
      [{ medicineKey: "adrenaline" }],
    );
    expect(g[0]!.byResus).toBe(1);
  });
});

describe("nextStep (S46) and movement groups (4.15)", () => {
  const calm = {
    kind: "ward",
    sealBroken: false,
    cartDue: false,
    overdueIssues: 0,
    stale: false,
    out: 0,
    expiring: 0,
    held: 3,
  };
  it("takes the most urgent state from the fixed list", () => {
    expect(nextStep(calm)).toBe("none");
    expect(nextStep({ ...calm, out: 2, stale: true })).toBe("count");
    expect(nextStep({ ...calm, out: 2, expiring: 1 })).toBe("out");
    expect(nextStep({ ...calm, kind: "cart", sealBroken: true, cartDue: true })).toBe("seal");
    expect(nextStep({ ...calm, overdueIssues: 1, stale: true })).toBe("confirm");
    expect(nextStep({ ...calm, kind: "quarantine" })).toBe("quarantine");
  });
  it("puts every movement kind in one filter", () => {
    expect(groupOf("received")).toBe("arrived");
    expect(groupOf("supplied")).toBe("patients");
    expect(groupOf("ward_used")).toBe("wards");
    expect(groupOf("written_off")).toBe("losses");
    expect(groupOf("issued")).toBe("between");
  });
});
