/**
 * Pharmacy Phase 2, 5.11 (S44, S45): what a keyboard-wedge scan fills on the store's screens. A GS1 scan
 * prefills the product (by its GTIN), the batch and the expiry; anything else stays typed text, which finds a
 * product by name only when exactly one matches. Every code and product is a fixture.
 */
import { describe, expect, it } from "vitest";

import { CATALOGUE } from "@/content/pharmacy-catalogue";
import { STORE } from "@/content/pharmacy-stores-store";
import { expiryForField, productByText, readScan } from "@/lib/pharmacy/stores/scan-fill";

const GS = "\u001d";
// A valid GTIN-14 (check digit 2 by GS1 mod 10), as tests/pharmacy/stores/scan.test.ts uses.
const GTIN = "09506000134352";
const products = [
  { id: "p-a", name: "Fixture tablet A 28s", gtin: GTIN, active: true },
  { id: "p-b", name: "Fixture syrup B", gtin: null, active: true },
  { id: "p-old", name: "Fixture tablet A old", gtin: GTIN, active: false },
];

describe("S44: a GS1 scan prefills the product, batch and expiry", () => {
  it("raw form with a group separator, day 00 as the month's end", () => {
    const o = readScan(`01${GTIN}10LOT42${GS}17271200`, products);
    expect(o.kind).toBe("gs1");
    if (o.kind !== "gs1") return;
    expect(o.productId).toBe("p-a");
    expect(o.scan.batch).toBe("LOT42");
    expect(expiryForField(o.scan)).toBe("2027-12");
    expect(o.note).toBe(STORE.scan.read(`GTIN ${GTIN}, batch LOT42, expiry 2027-12`));
  });
  it("bracketed form, a full day", () => {
    const o = readScan(`(01)${GTIN}(17)270615(10)AB12`, products);
    expect(o.kind === "gs1" && o.productId).toBe("p-a");
    expect(o.kind === "gs1" && expiryForField(o.scan)).toBe("2027-06-15");
  });
  it("a GTIN not linked yet fills batch and expiry and says to pick the product (SC-3)", () => {
    const o = readScan(`(01)00000000000017(10)Z9`, []);
    expect(o.kind).toBe("gs1");
    if (o.kind !== "gs1") return;
    expect(o.productId).toBeNull();
    expect(o.scan.batch).toBe("Z9");
    expect(o.note).toContain(STORE.scan.unknownGtin);
  });
  it("two active products with one GTIN: none is chosen", () => {
    const twice = [...products, { id: "p-c", name: "Fixture C", gtin: GTIN, active: true }];
    const o = readScan(`(01)${GTIN}`, twice);
    expect(o.kind === "gs1" && o.productId).toBeNull();
    expect(o.note).toContain(STORE.scan.ambiguous);
  });
});

describe("S45: a scan that does not parse is typed text", () => {
  it("keeps the text and says so", () => {
    const o = readScan("syrup", products);
    expect(o).toEqual({ kind: "text", text: "syrup", note: STORE.scan.asText });
  });
  it("a broken check digit is refused in words, and fills nothing (catalogue S12)", () => {
    expect(readScan(`01${GTIN.slice(0, 13)}9`, products)).toEqual({
      kind: "refused",
      note: CATALOGUE.checkDigit,
    });
  });
  it("text picks a product only when one name matches", () => {
    expect(productByText(products, "syrup")).toBe("p-b");
    expect(productByText(products, "fixture tablet")).toBeNull();
    expect(productByText(products, "  ")).toBeNull();
  });
});
