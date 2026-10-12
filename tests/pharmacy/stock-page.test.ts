import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Batch } from "@/lib/pharmacy/stock/ledger";
import type { RowInput } from "@/lib/pharmacy/stock/read";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StockTable } from "@/app/pharmacy/stock/_components/stock-table";
import { tableRow } from "@/app/pharmacy/stock/_lib/rows";
import { expiryText, stateWord, STOCK } from "@/content/pharmacy-stock";
import {
  openingCountMissing,
  rowMatches,
  stockFigures,
  stockRows,
  tabCounts,
} from "@/lib/pharmacy/stock/read";
import { parseExpiry } from "@/lib/pharmacy/stock/store";

/**
 * Pharmacy Phase 1, Step 4: the Stock page's pure parts (5.8, SL-5, SL-6, D-PH1-23, RD-1). Every
 * medicine id, batch and quantity is a fixture.
 */
const NOW = new Date("2026-10-12T09:00:00+03:00");
const P = "point-a";
const batch = (o: Partial<Batch> & Pick<Batch, "id" | "medicineId" | "expiry">): Batch => ({
  pointId: P,
  productId: `product-${o.medicineId}`,
  batchNumber: o.id.toUpperCase(),
  expiryMonthOnly: false,
  ...o,
});

const input = (o: Partial<RowInput> = {}): RowInput => ({
  medicineIds: ["fixture_a", "fixture_b", "fixture_c", "fixture_d"],
  batches: [
    batch({ id: "fx-001", medicineId: "fixture_a", expiry: "2027-03-01", expiryMonthOnly: true }),
    batch({ id: "fx-002", medicineId: "fixture_b", expiry: "2026-11-20" }),
    batch({ id: "fx-003", medicineId: "fixture_c", expiry: "2026-01-31" }),
    batch({ id: "fx-004", medicineId: "fixture_d", expiry: "2028-01-01" }),
  ],
  balances: new Map([
    ["fx-001", 120],
    ["fx-002", 14],
    ["fx-003", 9],
    ["fx-004", -4],
  ]),
  pointId: P,
  now: NOW,
  levels: new Map(),
  lookaheadDays: 90,
  outSince: new Map(),
  lastCounted: new Map([["fixture_a", new Date("2026-10-12T08:10:00+03:00")]]),
  supplied7: new Map([["fixture_a", 96]]),
  venClass: new Map(),
  ...o,
});
const byId = (rows: ReturnType<typeof stockRows>) => new Map(rows.map((r) => [r.medicineId, r]));

describe("the Stock rows (5.8)", () => {
  it("states in precedence: count needed, expired remove, out, low, expiring, in stock", () => {
    const rows = byId(stockRows(input()));
    expect(rows.get("fixture_a")?.state).toBe("in_stock");
    expect(rows.get("fixture_b")).toMatchObject({ state: "expiring", days: 39 });
    expect(rows.get("fixture_c")).toMatchObject({ state: "expired_remove", onShelf: 0, out: true });
    expect(rows.get("fixture_d")?.state).toBe("count_needed");
  });

  it("S7, X-15: a medicine with no reorder level is never Low; with one under it, it is", () => {
    expect(byId(stockRows(input())).get("fixture_a")?.low).toBe(false);
    const withLevel = byId(stockRows(input({ levels: new Map([["fixture_a", 200]]) })));
    expect(withLevel.get("fixture_a")).toMatchObject({ state: "low", low: true });
  });

  it("no look-ahead set: nothing is expiring (D-PH1-23)", () => {
    const rows = stockRows(input({ lookaheadDays: null }));
    expect(rows.some((r) => r.expiring)).toBe(false);
    expect(stockFigures(rows, input({ lookaheadDays: null }), false).expiringBatches).toBe(0);
  });

  it("tabs filter independently, and their counts match", () => {
    const rows = stockRows(input());
    expect(tabCounts(rows)).toEqual({ all: 4, out: 2, low: 0, expiring: 1, not_counted: 3 });
    expect(rows.filter((r) => rowMatches(r, "out")).map((r) => r.medicineId)).toEqual([
      "fixture_c",
      "fixture_d",
    ]);
  });

  it("the three figures: out (vital only once a list is imported), expiring batches, counted this week", () => {
    const rows = stockRows(input({ venClass: new Map([["fixture_c", "V"]]) }));
    expect(stockFigures(rows, input(), false)).toMatchObject({
      out: 2,
      outVital: null,
      expiringBatches: 1,
      counted: 1,
      medicines: 4,
    });
    expect(stockFigures(rows, input(), true).outVital).toBe(1);
  });

  it("the table row: words, an amber flag for every state but In stock, the first expiry", () => {
    const rows = byId(stockRows(input({ outSince: new Map() })));
    expect(tableRow(rows.get("fixture_a")!, NOW)).toMatchObject({
      stateWord: "In stock",
      caution: false,
      firstExpiry: "FX-001 · 03/2027",
      counted: "12 Oct, 08:10",
      supplied7: 96,
    });
    expect(tableRow(rows.get("fixture_b")!, NOW)).toMatchObject({
      stateWord: "Expiring · 39 days",
      caution: true,
    });
    expect(tableRow(rows.get("fixture_d")!, NOW)).toMatchObject({
      stateWord: "Count needed",
      counted: "Never",
    });
  });

  it("RD-1: a product needs a count of its medicine, or a full count, taken since it came here", () => {
    const since = new Date("2026-10-10T08:00:00Z");
    const products = [
      { productId: "p1", medicineId: "fixture_a", since },
      { productId: "p2", medicineId: "fixture_b", since },
    ];
    expect(openingCountMissing(products, [])).toBe(2);
    expect(
      openingCountMissing(products, [
        { medicineId: "fixture_a", scope: "medicine", countedAt: new Date("2026-10-11T08:00:00Z") },
      ]),
    ).toBe(1);
    expect(
      openingCountMissing(products, [
        { medicineId: null, scope: "full", countedAt: new Date("2026-10-09T08:00:00Z") },
      ]),
    ).toBe(2); // before the products came
    expect(
      openingCountMissing(products, [
        { medicineId: null, scope: "full", countedAt: new Date("2026-10-11T08:00:00Z") },
      ]),
    ).toBe(0);
  });
});

describe("the Stock table, rendered (Section 10)", () => {
  const html = renderToStaticMarkup(
    h(StockTable, { rows: stockRows(input()).map((r) => tableRow(r, NOW)) }),
  );
  it("filter tabs are a tablist with the count in each name", () => {
    expect(html).toMatch(/role="tablist" aria-label="Stock filter"/);
    for (const name of ["All, 4", "Out, 2", "Low, 0", "Expiring, 1", "Not counted this week, 3"])
      expect(html).toContain(`aria-label="${name}"`);
  });
  it("In stock is plain text; every other state is amber with an icon and its word", () => {
    expect(html).toMatch(/<span>In stock<\/span>/);
    for (const word of ["Expiring · 39 days", "Expired, remove", "Count needed"])
      expect(html).toMatch(new RegExp(`data-tone="caution"[^>]*><svg[^>]*>.*?</svg>${word}`));
  });
  it("each medicine opens its own page, not a side panel (W10)", () => {
    expect(html).toContain('href="/pharmacy/stock/fixture_a"');
  });
});

describe("expiry as the pack gives it (SL-5)", () => {
  it("parses a day or a month, and refuses anything else", () => {
    expect(parseExpiry("2027-03")).toEqual({ expiry: "2027-03-01", monthOnly: true });
    expect(parseExpiry("2027-03-31")).toEqual({ expiry: "2027-03-31", monthOnly: false });
    expect(parseExpiry("2027-02-30")).toBeNull();
    expect(parseExpiry("2027-13")).toBeNull();
    expect(parseExpiry("03/2027")).toBeNull();
  });

  it("writes a month as MM/YYYY and a day as DD MMM YYYY", () => {
    expect(expiryText({ expiry: "2027-03-01", expiryMonthOnly: true })).toBe("03/2027");
    expect(expiryText({ expiry: "2027-03-31", expiryMonthOnly: false })).toBe("31 Mar 2027");
  });

  it("states in words (X-17)", () => {
    expect(stateWord("out", 3)).toBe("Out · 3 days");
    expect(stateWord("out", null)).toBe("Out");
    expect(stateWord("expiring", 1)).toBe("Expiring · 1 day");
    expect(stateWord("expired_remove", null)).toBe(STOCK.state.expired_remove);
  });
});

describe("the blind count (SL-6)", () => {
  it("the count form's batches carry no balance: the record reaches it only after saving", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/pharmacy/stock/_components/stock-dialogs.tsx"),
      "utf8",
    );
    const shape = /export interface DialogBatch \{([^}]*)\}/.exec(src)?.[1] ?? "";
    expect(shape).toMatch(/batchNumber/);
    expect(shape).not.toMatch(/balance|recorded|onShelf|quantity/i);
  });
});
