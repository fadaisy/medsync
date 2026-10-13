import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { pharmacyChecksState } from "@/lib/pharmacy/check-state";
import { getAvailability, pharmacyAvailability } from "@/lib/prescribing/pharmacy";

/**
 * Pharmacy Phase 1, Step 0 (docs/pharmacy/phase-1/PROMPT-PHARMACY-PHASE-1.md §9): failing tests that
 * reproduce the gap this slice closes. Each is `it.fails` (green while the gap exists); the step that
 * closes it flips it to a plain `it`.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const migrations = () => {
  const dir = resolve(process.cwd(), "supabase/migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => read(`supabase/migrations/${f}`))
    .join("\n");
};

describe("Pharmacy Phase 1 baseline — the gap reproduced at Step 0", () => {
  // Floor condition 3: nothing records what happened to a prescription line at the pharmacy.
  it("a prescription line can end in a recorded pharmacy outcome", () => {
    expect(existsSync(resolve(process.cwd(), "lib/pharmacy/lines.ts"))).toBe(true);
    expect(migrations()).toMatch(/CREATE TABLE[^;]*pharmacy_line_events/);
  });

  // Floor condition 4: closed at Step 2 (0124 the ledger, 0126 the supply and its commit-time pairing).
  it("a supply names a batch and moves stock in the same action", () => {
    expect(migrations()).toMatch(/CREATE TABLE[^;]*pharmacy_stock_movements/);
    expect(migrations()).toMatch(/CREATE TABLE[^;]*pharmacy_supplies/);
  });

  // ADR 0190's seam: whatever a hospital holds, the prescriber is told "not linked".
  // Closed at Step 9 (AV-1..AV-9): with a live point holding the medicine, the seam answers from stock.
  it("the availability seam answers from stock where a hospital holds it", () => {
    const now = new Date("2026-10-12T09:00:00Z");
    const answer = getAvailability({
      medicineId: "fixture_medicine",
      hospitalId: "fixture-hospital",
      origin: "window",
      points: [
        { id: "point", name: "Fixture point", hospitalId: "fixture-hospital", serves: "window" },
      ],
      stock: {
        point: {
          products: [{ id: "product", medicineId: "fixture_medicine" }],
          batches: [
            {
              id: "batch",
              pointId: "point",
              productId: "product",
              medicineId: "fixture_medicine",
              batchNumber: "FX-001",
              expiry: "2099-01-31",
              expiryMonthOnly: false,
            },
          ],
          movements: [
            {
              id: "m1",
              batchId: "batch",
              pointId: "point",
              kind: "received",
              quantity: 10,
              effectiveAt: now,
              recordedAt: now,
              downtime: false,
            },
          ],
          lastCountAt: now,
          reorderLevel: null,
          countFreshnessDays: null,
        },
      },
      now,
    });
    expect(answer.state).toBe("in_stock");
    // The old seam stays for its callers and still says "not linked" on its own.
    expect(pharmacyAvailability("fixture-medicine", "a-hospital-with-stock").status).toBe(
      "not_linked",
    );
  });

  // Closed at Step 3 (CK-1): the caller passes the hospital's points with their liveness.
  it("a hospital with a live dispensing point records dispensing", () => {
    const s = pharmacyChecksState("a-hospital-with-a-live-point", [
      { id: "fixture-point", live: true },
    ]);
    expect(s.dispensingRecorded).toBe(true);
  });
});
