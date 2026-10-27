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
    serial: null,
    produced: null,
    skipped: [],
    plain: false,
  };
  it("reads every AI order in raw form", () => {
    expect(parseGs1(`01${GTIN}17270615` + `10AB12`)).toEqual(want);
    expect(parseGs1(`10AB12${GS}01${GTIN}17270615`)).toEqual(want);
    expect(parseGs1(`17270615` + `10AB12${GS}01${GTIN}`)).toEqual(want);
    expect(parseGs1(`01${GTIN}10AB12${GS}17270615`)).toEqual(want);
    expect(parseGs1(`01${GTIN}21SER9${GS}10AB12${GS}17270615`)).toEqual({
      ...want,
      serial: "SER9",
    });
  });
  it("reads the parenthesised form and a symbology prefix", () => {
    expect(parseGs1(`(01)${GTIN}(10)AB12(17)270615`)).toEqual(want);
    expect(parseGs1(`(17)270615(21)X1(10)AB12(01)${GTIN}`)).toEqual({ ...want, serial: "X1" });
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
    ["short GTIN", "01123"],
    ["an AI whose length is unknown", `01${GTIN}5512`],
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

describe("Appendix B: the catalogue slice's extension (S11–S13)", () => {
  it("S11: a DataMatrix with and without GS separators parses identically", () => {
    const withGs = parseGs1(`]d201${GTIN}17270600${GS}10AB12${GS}21S1`);
    const without = parseGs1(`01${GTIN}1727060010AB12${GS}21S1`);
    expect(withGs).toEqual(without);
    expect(withGs).toMatchObject({ batch: "AB12", serial: "S1", expiry: "2027-06-30" });
  });
  it("S12: a wrong check digit is refused, with its reason", () => {
    expect(parseGs1("0109506000134353")).toEqual({
      ok: false,
      raw: "0109506000134353",
      reason: "check_digit",
    });
    expect(parseGs1("6009880123458")).toMatchObject({ ok: false, reason: "check_digit" });
  });
  it("S13: expiry YYMM00 is the last day of the month", () => {
    expect(parseGs1(`01${GTIN}17261100`)).toMatchObject({
      expiry: "2026-11-30",
      expiryMonthOnly: true,
    });
  });
  it("reads AI 11 (shown, not used) and keeps the serial", () => {
    expect(parseGs1(`01${GTIN}112501151727061521ZX9`)).toMatchObject({
      produced: "2025-01-15",
      expiry: "2027-06-15",
      serial: "ZX9",
    });
  });
  it("steps over an AI it does not use, fixed or variable, and names it", () => {
    expect(parseGs1(`01${GTIN}1727061530100${GS}10AB12`)).toMatchObject({
      batch: "AB12",
      skipped: ["30"],
    });
    expect(parseGs1(`01${GTIN}240XYZ${GS}10AB12`)).toMatchObject({
      skipped: ["240"],
      batch: "AB12",
    });
    expect(parseGs1(`01${GTIN}31030001501727061510AB12`)).toMatchObject({
      skipped: ["3103"],
      expiry: "2027-06-15",
    });
    expect(parseGs1(`(01)${GTIN}(7003)2506151230(10)AB12`)).toMatchObject({ skipped: ["7003"] });
  });
  it("a plain EAN-13, UPC-A or EAN-8 is the GTIN padded to 14: the pack only", () => {
    expect(parseGs1("6009880123452")).toMatchObject({
      ok: true,
      gtin: "06009880123452",
      plain: true,
      batch: null,
    });
    expect(parseGs1("036000291452")).toMatchObject({ gtin: "00036000291452", plain: true });
    expect(parseGs1("96385074")).toMatchObject({ gtin: "00000096385074", plain: true });
  });
});
