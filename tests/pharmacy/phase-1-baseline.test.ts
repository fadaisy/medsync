import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { pharmacyChecksState } from "@/lib/pharmacy/check-state";
import { pharmacyAvailability } from "@/lib/prescribing/pharmacy";

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
  it.fails("a prescription line can end in a recorded pharmacy outcome", () => {
    expect(existsSync(resolve(process.cwd(), "lib/pharmacy/lines.ts"))).toBe(true);
    expect(migrations()).toMatch(/CREATE TABLE[^;]*pharmacy_line_events/);
  });

  // Floor condition 4: closed at Step 2 (0124 the ledger, 0126 the supply and its commit-time pairing).
  it("a supply names a batch and moves stock in the same action", () => {
    expect(migrations()).toMatch(/CREATE TABLE[^;]*pharmacy_stock_movements/);
    expect(migrations()).toMatch(/CREATE TABLE[^;]*pharmacy_supplies/);
  });

  // ADR 0190's seam: whatever a hospital holds, the prescriber is told "not linked".
  it.fails("the availability seam answers from stock where a hospital holds it", () => {
    expect(pharmacyAvailability("fixture-medicine", "a-hospital-with-stock").status).not.toBe(
      "not_linked",
    );
  });

  // The check state still says dispensing is not recorded anywhere.
  it.fails("a hospital with a live dispensing point records dispensing", () => {
    expect(pharmacyChecksState("a-hospital-with-a-live-point").dispensingRecorded).toBe(true);
  });
});
