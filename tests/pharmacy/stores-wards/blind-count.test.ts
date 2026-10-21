import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PlaceProduct } from "@/lib/pharmacy/stores/ward-read";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CartCheck } from "@/app/pharmacy/store/carts/_components/cart-check";
import { WardCount } from "@/app/pharmacy/store/wards/_components/ward-dialogs";
import { countItems } from "@/app/pharmacy/store/wards/_lib/view";
import { CARTS, WARDS } from "@/content/pharmacy-stores-wards";

/**
 * Law 5, S20b, D-PH1-24: no balance-derived figure renders on any count screen before the count is
 * committed. The count screens receive names, units and batch labels only (countItems), and their
 * markup holds no last count, issue, return, dose, level, top-up, list quantity or recorded use.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const product: PlaceProduct = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Fixture vial",
  medicineId: "fixture",
  issueUnit: "vial",
  controlled: false,
  batches: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      pointId: "loc",
      productId: "11111111-1111-4111-8111-111111111111",
      medicineId: "fixture",
      batchNumber: "FX-AB",
      expiry: "2099-12-31",
      expiryMonthOnly: false,
      expiryText: "31 Dec 2099",
    },
  ],
};
const noop = async () => ({ ok: true as const, id: "x", serverTime: "" });

describe("S20b: the count screens are blind", () => {
  it("countItems carries names, units and batch labels only", () => {
    const items = countItems([product, { ...product, id: "empty", batches: [] }]);
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]!).sort()).toEqual([
      "batches",
      "controlled",
      "issueUnit",
      "name",
      "productId",
    ]);
    expect(Object.keys(items[0]!.batches[0]!).sort()).toEqual(["batchNumber", "expiryText", "id"]);
  });

  it("the ward count renders no figure MedSync holds", () => {
    const html = renderToStaticMarkup(
      h(WardCount, {
        locationId: "loc",
        ward: "Ward W",
        items: countItems([product]),
        allocationSigned: true,
        action: noop,
      }),
    );
    const T = WARDS.table;
    for (const word of [
      T.level,
      T.last,
      T.issued,
      T.returned,
      T.doses,
      T.topUp,
      "doses charted",
      "Count the ward first",
    ])
      expect(html).not.toContain(word);
    // The only digits are the batch's own label and expiry.
    expect(
      html
        .replace(/<[^>]+>/g, " ")
        .replace("31 Dec 2099", "")
        .replace(/FX-AB/g, ""),
    ).not.toMatch(/\d/);
  });

  it("the cart check renders neither the list quantity nor the recorded uses before the count", () => {
    const html = renderToStaticMarkup(
      h(CartCheck, {
        locationId: "loc",
        cart: "Cart one",
        unit: "Emergency",
        items: countItems([product]),
        names: {},
        issuers: [],
        otherCarts: [],
        confirmers: [],
        attest: noop,
        check: noop,
      }),
    );
    expect(html).not.toContain(CARTS.check.uses);
    expect(html).not.toContain("cart list holds");
    expect(html).not.toContain("recorded against this cart");
    expect(
      html
        .replace(/<[^>]+>/g, " ")
        .replace("31 Dec 2099", "")
        .replace(/FX-AB/g, ""),
    ).not.toMatch(/\d/);
  });

  it("the ward page's count mode passes only countItems to the count screen", () => {
    const src = read("app/pharmacy/store/wards/_components/ward-stock-view.tsx");
    const count = src.slice(src.indexOf('mode === "count"'), src.indexOf("const levelsSigned"));
    expect(count).toContain("items={countItems(page.products)}");
    expect(count).not.toMatch(/page\.rows|balances|lastCount|topUp|dosesCharted|issuedSince/);
  });
});
