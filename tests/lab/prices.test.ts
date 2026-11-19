import { readFileSync } from "node:fs";
import type { LabPriceRow } from "@/lib/lab/prices";
import { describe, expect, it } from "vitest";

import { chargeFor, parseUgx, quote, ugxWords } from "@/lib/lab/prices";

const row = (
  code: string,
  priceUgx: number | null,
  fromDate: string,
  createdAt = `${fromDate}T08:00:00Z`,
  free = false,
): LabPriceRow => ({ code, priceUgx, free, fromDate, createdAt });

const ROWS: LabPriceRow[] = [
  row("test.fbc", 15000, "2026-01-01"),
  row("test.fbc", 18000, "2026-11-01"),
  row("test.fbc", 20000, "2027-01-01"),
  row("test.malaria_rdt", null, "2026-01-01", undefined, true),
  row("test.hba1c", 30000, "2026-11-10", "2026-11-10T08:00:00Z"),
  row("test.hba1c", 35000, "2026-11-10", "2026-11-10T15:00:00Z"),
];

describe("lab test prices (ADR 0527)", () => {
  it("the price in force is the latest one on or before the day; a future price waits", () => {
    expect(chargeFor(ROWS, "test.fbc", "2026-10-31")).toEqual({ kind: "priced", ugx: 15000 });
    expect(chargeFor(ROWS, "test.fbc", "2026-11-18")).toEqual({ kind: "priced", ugx: 18000 });
    expect(chargeFor(ROWS, "test.fbc", "2027-01-01")).toEqual({ kind: "priced", ugx: 20000 });
  });

  it("two prices from the same day: the one entered later wins", () => {
    expect(chargeFor(ROWS, "test.hba1c", "2026-11-18")).toEqual({ kind: "priced", ugx: 35000 });
  });

  it("free is said as free, and a test nobody priced is never zero", () => {
    expect(chargeFor(ROWS, "test.malaria_rdt", "2026-11-18")).toEqual({ kind: "free" });
    expect(chargeFor(ROWS, "test.tsh", "2026-11-18")).toEqual({ kind: "price_not_set" });
    expect(chargeFor(ROWS, "test.fbc", "2025-12-31")).toEqual({ kind: "price_not_set" });
  });

  it("a visit costs the total of its tests, and says so only when every test has a price", () => {
    const q = quote(["test.fbc", "test.malaria_rdt", "test.hba1c"], ROWS, "2026-11-18");
    expect(q.totalUgx).toBe(53000);
    expect(q.notSet).toBe(0);
    expect(q.complete).toBe(true);
    const partial = quote(["test.fbc", "test.tsh"], ROWS, "2026-11-18");
    expect(partial.totalUgx).toBe(18000);
    expect(partial.notSet).toBe(1);
    expect(partial.complete).toBe(false);
    expect(quote([], ROWS, "2026-11-18").complete).toBe(false);
  });

  it("a typed price is whole shillings above zero; zero and nonsense are refused", () => {
    expect(parseUgx("15,000")).toBe(15000);
    expect(parseUgx(" 15 000 ")).toBe(15000);
    expect(parseUgx("UGX 2500")).toBe(2500);
    expect(parseUgx("0")).toBeNull();
    expect(parseUgx("")).toBeNull();
    expect(parseUgx("12.5")).toBeNull();
    expect(parseUgx("-5")).toBeNull();
    expect(parseUgx("999999999")).toBeNull();
    expect(ugxWords(15000)).toBe("UGX 15,000");
  });

  it("the migration is GATED, append-only, never stores zero and carries the MFA gate", () => {
    const sql = readFileSync("supabase/migrations/0305_lab_test_prices.sql", "utf8");
    expect(sql.startsWith("-- GATED")).toBe(true);
    expect(sql).toMatch(/price_ugx integer CHECK \(price_ugx IS NULL OR price_ugx > 0\)/);
    expect(sql).toMatch(/\(free AND price_ugx IS NULL\) OR \(NOT free AND price_ugx IS NOT NULL\)/);
    expect(sql).toMatch(/REVOKE ALL ON public\.lab_test_prices FROM anon, authenticated/);
    expect(sql).toMatch(/CREATE POLICY mfa_gate ON public\.lab_test_prices AS RESTRICTIVE/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)/);
  });

  it("only the hospital admin or the laboratory lead sets a price, behind the flag", () => {
    const a = readFileSync("lib/lab/test-menu-actions.ts", "utf8");
    expect(a).toMatch(/export async function saveTestPriceAction/);
    expect(a).toMatch(
      /const me = await editor\(p\.data\.surface\);\s+if \(!labTestPricesLiveFor\(me\.hospitalId\)\)/,
    );
  });
});
