import { describe, expect, it } from "vitest";

import {
  expiryOfText,
  judgeOpening,
  judgePriceLine,
  judgeProduct,
  parseCsv,
  readImport,
} from "@/lib/pharmacy/imports/engine";

const gtin = (base: string) => {
  const sum = [...base].reduce((a, c, i) => a + Number(c) * (i % 2 === 0 ? 3 : 1), 0);
  return base + ((10 - (sum % 10)) % 10);
};
const G1 = gtin("0600988000001");
const G2 = gtin("0600988000002");

const amox = (strength: string, packId: string | null = null) => ({
  medicineId: `m-${strength}`,
  name: "Amoxicillin",
  kind: "medicine" as const,
  strength,
  formularyId: "amoxicillin",
  packId,
});
const idx = {
  byGtin: new Map([
    [G1, amox("500 mg", "pack-500")],
    [G2, amox("250 mg", "pack-250")],
  ]),
  byName: new Map([["amoxicillin", [amox("500 mg"), amox("250 mg")]]]),
  existing: new Set<string>(),
};
const row = (o: Record<string, string>) => ({
  name: "Amoxicillin",
  strength: "500mg",
  form: "capsule",
  issueUnit: "capsule",
  ...o,
});

describe("imports (Step 9)", () => {
  it("reads quoted CSV, a BOM and CRLF, and names a missing column", () => {
    expect(parseCsv('﻿a,b\r\n"x, ""y""",2\r\n\r\n')).toEqual([
      ["a", "b"],
      ['x, "y"', "2"],
    ]);
    const ok = readImport(
      "products",
      "Name,Strength,Form,Issue unit\nAmoxicillin,500 mg,capsule,capsule\n",
    );
    expect(ok).toEqual({
      ok: true,
      rows: [{ name: "Amoxicillin", strength: "500 mg", form: "capsule", issueUnit: "capsule" }],
    });
    expect(readImport("products", "Name,Strength\nA,1\n")).toEqual({
      ok: false,
      error: "A column is missing: form, issueunit.",
    });
    const big = "Name,Strength,Form,Issue unit\n" + "A,1,t,t\n".repeat(5001);
    expect(readImport("products", big).ok).toBe(false);
  });

  it("S35: a barcode or name in another strength is never proposed", () => {
    expect(judgeProduct(row({ gtin: G1 }), idx)).toMatchObject({
      match: "matched",
      why: "Barcode",
      proposal: { packId: "pack-500" },
    });
    const wrong = judgeProduct(row({ gtin: G2 }), idx);
    expect(wrong).toMatchObject({ match: "check", proposal: null });
    expect(wrong.why).toMatch(/never proposed/);
    expect(judgeProduct(row({}), idx)).toMatchObject({
      match: "matched",
      why: "Name and strength",
      proposal: { strength: "500 mg" },
    });
    expect(judgeProduct(row({ strength: "125 mg" }), idx)).toMatchObject({
      match: "not_in_catalogue",
      proposal: null,
    });
    expect(judgeProduct(row({ gtin: G1.slice(0, 13) + "0" }), idx).match).toBe("invalid");
    expect(judgeProduct(row({ strength: "" }), idx).match).toBe("invalid");
  });

  it("a product the hospital already has, or a medicine off the list, needs a person", () => {
    expect(judgeProduct(row({ gtin: G1 }), { ...idx, existing: new Set(["pack-500"]) }).match).toBe(
      "check",
    );
    const off = { ...idx, byGtin: new Map([[G1, { ...amox("500 mg", "p"), formularyId: null }]]) };
    expect(judgeProduct(row({ gtin: G1 }), off)).toMatchObject({ match: "check", proposal: null });
  });

  it("opening stock: the draft's place, a whole quantity, a month-only expiry", () => {
    expect(expiryOfText("2027-03")).toEqual({ expiry: "2027-03-31", monthOnly: true });
    expect(expiryOfText("2027-02-30")).toBeNull();
    const products = [
      { id: "11111111-1111-4111-8111-111111111111", name: "Amoxil 500", gtins: [G1] },
    ];
    const r = {
      place: "Main store",
      product: "amoxil 500",
      batch: "B1",
      expiry: "2027-03",
      quantity: "40",
      unitCost: "120",
    };
    expect(judgeOpening(r, "Main Store", products)).toEqual({
      match: "matched",
      why: "Product name",
      proposal: {
        productId: products[0]!.id,
        batch: "B1",
        expiry: "2027-03-31",
        monthOnly: true,
        quantity: 40,
        unitCost: 120,
      },
    });
    expect(judgeOpening({ ...r, product: G1 }, "Main store", products).why).toBe("Barcode");
    expect(judgeOpening({ ...r, place: "Ward 3" }, "Main store", products).match).toBe("invalid");
    expect(judgeOpening({ ...r, quantity: "4.5" }, "Main store", products).match).toBe("invalid");
  });

  it("S37: a price line matches by code first, then by name only for a person", () => {
    const p = { packId: "pk", productId: null };
    const ix = {
      byGtin: new Map([[G1, p]]),
      bySupplierCode: new Map([["ab-1", p]]),
      byName: new Map([["amoxil 500 caps 100", [p]]]),
    };
    const base = {
      supplier: "JMS",
      editionDate: "2026-10-01",
      itemText: "Amoxil 500 caps x100",
      packPrice: "12,000",
    };
    expect(judgePriceLine({ ...base, gtin: G1, supplierCode: "zz" }, "JMS", ix)).toMatchObject({
      match: "matched",
      why: "Barcode",
      proposal: { packPrice: 12000 },
    });
    expect(judgePriceLine({ ...base, supplierCode: "AB-1" }, "JMS", ix)).toMatchObject({
      match: "matched",
      why: "Supplier code, as matched before",
    });
    expect(judgePriceLine({ ...base, itemText: "Amoxil 500 caps 100" }, "JMS", ix).match).toBe(
      "check",
    );
    expect(judgePriceLine(base, "JMS", ix).match).toBe("not_in_catalogue");
    expect(judgePriceLine({ ...base, packPrice: "0" }, "JMS", ix).match).toBe("invalid");
  });
});
