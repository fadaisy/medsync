import { describe, expect, it } from "vitest";

import { parseGs1, productForGtin } from "@/lib/pharmacy/stores/scan";

const GS = "\u001d";
// A valid GTIN-14 (check digit 2 by GS1 mod 10).
const GTIN = "09506000134352";

describe("SC-1 GS1 element strings (S10)", () => {
  const want = {
    ok: true,
    gtin: GTIN,
    batch: "AB12",
    expiry: "2027-06-15",
    expiryMonthOnly: false,
  };
  it("reads every AI order in raw form", () => {
    expect(parseGs1(`01${GTIN}17270615` + `10AB12`)).toEqual(want);
    expect(parseGs1(`10AB12${GS}01${GTIN}17270615`)).toEqual(want);
    expect(parseGs1(`17270615` + `10AB12${GS}01${GTIN}`)).toEqual(want);
    expect(parseGs1(`01${GTIN}10AB12${GS}17270615`)).toEqual(want);
    expect(parseGs1(`01${GTIN}21SER9${GS}10AB12${GS}17270615`)).toEqual(want);
  });
  it("reads the parenthesised form and a symbology prefix", () => {
    expect(parseGs1(`(01)${GTIN}(10)AB12(17)270615`)).toEqual(want);
    expect(parseGs1(`(17)270615(21)X1(10)AB12(01)${GTIN}`)).toEqual(want);
    expect(parseGs1(`]d201${GTIN}17270615` + `10AB12`)).toEqual(want);
  });
  it("accepts a missing separator at the end, and a configured substitute", () => {
    expect(parseGs1(`01${GTIN}10AB12`)).toEqual({ ...want, expiry: null });
    expect(parseGs1(`10AB12|01${GTIN}17270615`, { separator: "|" })).toEqual(want);
  });
  it("day 00 means the end of the month", () => {
    expect(parseGs1(`01${GTIN}17270200`)).toMatchObject({
      expiry: "2027-02-28",
      expiryMonthOnly: true,
    });
    expect(parseGs1(`01${GTIN}17280200`)).toMatchObject({
      expiry: "2028-02-29",
      expiryMonthOnly: true,
    });
  });
});

describe("SC-2 a failure returns the raw text", () => {
  it.each([
    ["typed text", "Fixture tablet 500"],
    ["month 13", `01${GTIN}17271301`],
    ["31 February", `01${GTIN}17270231`],
    ["short date", `01${GTIN}1727061`],
    ["bad check digit", "0109506000134353"],
    ["short GTIN", "01123"],
    ["unknown AI", `01${GTIN}99ABC`],
    ["repeated AI", `(01)${GTIN}(01)${GTIN}`],
    ["empty", ""],
  ])("%s", (_name, raw) => {
    expect(parseGs1(raw)).toEqual({ ok: false, raw });
  });
});

describe("SC-3 a GTIN maps to at most one active product", () => {
  const products = [
    { id: "p1", gtin: GTIN, active: true },
    { id: "p0", gtin: GTIN, active: false },
    { id: "p2", gtin: "00000000000017", active: true },
    { id: "p3", gtin: "00000000000017", active: true },
  ];
  it("finds one, none, or reports ambiguity", () => {
    expect(productForGtin(products, GTIN)).toEqual({ ok: true, productId: "p1" });
    expect(productForGtin(products, "12345678901231")).toEqual({ ok: false, reason: "none" });
    expect(productForGtin(products, "00000000000017")).toEqual({ ok: false, reason: "ambiguous" });
  });
});
