import { readFileSync } from "node:fs";
import type { LabPriceRow } from "@/lib/lab/prices";
import { describe, expect, it } from "vitest";

import { addUp, medicineCharge, medicineCosts, testCosts } from "@/lib/patient-web/costs";

const price = (code: string, ugx: number | null, free = false): LabPriceRow => ({
  code,
  priceUgx: ugx,
  free,
  fromDate: "2026-11-01",
  createdAt: "2026-11-01T08:00:00Z",
});
const PRICES = [price("test.fbc", 18000), price("test.rbs", 5000), price("test.rdt", null, true)];
const order = (key: string, code: string, fasting = false) => ({ key, code, name: code, fasting });

describe("what a patient's tests cost (ADR 0527)", () => {
  it("each waiting test shows the hospital's price, and the total is their sum", () => {
    const c = testCosts(
      [order("o1", "test.fbc"), order("o2", "test.rbs", true), order("o3", "test.rdt")],
      PRICES,
      { "test.fbc": "2 hours" },
      new Set(["test.rbs"]),
      "2026-11-18",
    );
    expect(c.totalUgx).toBe(23000);
    expect(c.notSet).toBe(0);
    expect(c.lines.map((l) => l.charge.kind)).toEqual(["priced", "priced", "free"]);
    expect(c.lines[0]!.readyIn).toBe("2 hours");
    expect(c.lines[1]).toMatchObject({ fasting: true, unavailable: true, readyIn: null });
  });

  it("a test nobody priced is left out of the total and counted, never shown as zero", () => {
    const c = testCosts(
      [order("o1", "test.fbc"), order("o2", "test.tsh")],
      PRICES,
      {},
      new Set(),
      "2026-11-18",
    );
    expect(c.totalUgx).toBe(18000);
    expect(c.notSet).toBe(1);
    expect(c.hasTotal).toBe(true);
    expect(c.lines[1]!.charge).toEqual({ kind: "price_not_set" });
  });

  it("with no price at all there is no total to show", () => {
    expect(addUp([{ key: "a", name: "A", charge: { kind: "price_not_set" } }]).hasTotal).toBe(
      false,
    );
    expect(addUp([]).hasTotal).toBe(false);
  });

  it("the loader prices only tests the lab page already shows, never a restricted or sensitive one", () => {
    const src = readFileSync("lib/patient-web/care-lab-costs.ts", "utf8");
    expect(src).toMatch(/patientPricesLiveFor\(hospitalId\) && labTestPricesLiveFor\(hospitalId\)/);
    expect(src).toContain("t.restricted_class IS NULL");
    expect(src).toContain("o.sensitivity = 'standard'");
    expect(src).toContain("o.patient_user_id = ${userId}");
    expect(src).toContain("o.hospital_id = ${hospitalId}");
  });

  it("the patient page says where to pay and never draws a zero", () => {
    const page = readFileSync("app/pw/patient/care/labs/page.tsx", "utf8");
    expect(page).toContain("<ChargeWords");
    expect(page).toContain("<CostTotal");
    const bits = readFileSync("app/pw/patient/_components/cost-bits.tsx", "utf8");
    expect(bits).toContain("PATIENT_PRICES.notSet");
    expect(bits).toContain("PATIENT_PRICES.payThere");
    expect(bits).not.toMatch(/UGX 0\b/);
  });
});

describe("what a patient's medicines cost (ADR 0527)", () => {
  const sup = (
    lineId: string,
    quantity: number,
    unitUgx: number | null,
    kind: "priced" | "free" | "price_not_set" | null = "priced",
  ) => ({ lineId, quantity, unitUgx, kind });

  it("a medicine costs the units given times the price recorded at hand-over, over all its supplies", () => {
    expect(medicineCharge([sup("l1", 30, 200), sup("l1", 30, 250)])).toEqual({
      kind: "priced",
      ugx: 13500,
    });
  });

  it("free is free; a supply with no price makes the line not set, never a part total or zero", () => {
    expect(medicineCharge([sup("l1", 10, null, "free")])).toEqual({ kind: "free" });
    expect(medicineCharge([sup("l1", 10, 200), sup("l1", 10, null, "price_not_set")])).toEqual({
      kind: "price_not_set",
    });
    expect(medicineCharge([sup("l1", 10, 0)])).toEqual({ kind: "price_not_set" });
    expect(medicineCharge([])).toEqual({ kind: "price_not_set" });
  });

  it("a supply from before prices were recorded reads as priced only when it carries a price", () => {
    expect(medicineCharge([sup("l1", 2, 500, null)])).toEqual({ kind: "priced", ugx: 1000 });
    expect(medicineCharge([sup("l1", 2, null, null)])).toEqual({ kind: "price_not_set" });
  });

  it("the total is the sum of the priced medicines, and counts the ones not set", () => {
    const c = medicineCosts(
      [
        { lineId: "l1", name: "Amoxicillin" },
        { lineId: "l2", name: "Paracetamol" },
        { lineId: "l3", name: "Zinc" },
      ],
      [sup("l1", 21, 300), sup("l2", 10, null, "free")],
    );
    expect(c.totalUgx).toBe(6300);
    expect(c.notSet).toBe(1);
    expect(c.lines.map((l) => l.charge.kind)).toEqual(["priced", "free", "price_not_set"]);
  });

  it("the loader reads only this patient's standing supplies, at hospitals where prices are shown", () => {
    const src = readFileSync("lib/patient-web/care-medicine-costs.ts", "utf8");
    expect(src).toContain("eq(pharmacySupplies.patientUserId, userId)");
    expect(src).toContain("isNull(pharmacySupplyReversals.id)");
    expect(src).toContain("patientPricesLiveFor(r.hospitalId)");
  });
});
