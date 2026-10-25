/**
 * The phone's "A few more details" rules mirror the web's profile actions: NIN normalising,
 * next of kin as both-or-neither, the Ugandan E.164 phone, and per-section errors.
 */
import { describe, expect, it } from "vitest";

import {
  NOK_BOTH,
  nokProblem,
  normaliseIdNumber,
  parseDetails,
  PHONE_E164_UG,
} from "@/app/api/mobile/profile/_lib/rules";

describe("normaliseIdNumber", () => {
  it("strips spaces and upper-cases a NIN", () => {
    expect(normaliseIdNumber("nin", " cm 9001 2345 abcd ")).toBe("CM90012345ABCD");
  });
  it("keeps other IDs as typed, trimmed", () => {
    expect(normaliseIdNumber("passport", " b123 456 ")).toBe("b123 456");
  });
});

describe("nokProblem", () => {
  it("needs both or neither", () => {
    expect(nokProblem("Amina", "+256772000000")).toBeNull();
    expect(nokProblem("", "")).toBeNull();
    expect(nokProblem(undefined, undefined)).toBeNull();
    expect(nokProblem("Amina", "")).toBe(NOK_BOTH);
    expect(nokProblem("  ", "+256772000000")).toBe(NOK_BOTH);
  });
});

describe("PHONE_E164_UG", () => {
  it.each(["+256772000000", "+256414123456", "+25631234567"])("takes %s", (p) => {
    expect(PHONE_E164_UG.test(p)).toBe(true);
  });
  it.each(["0772000000", "256772000000", "+25677200000", "+2567720000001", "+254712345678"])(
    "refuses %s",
    (p) => {
      expect(PHONE_E164_UG.test(p)).toBe(false);
    },
  );
});

describe("parseDetails", () => {
  it("writes only the sections given", () => {
    expect(parseDetails({ title: "dr" })).toEqual({ data: { title: "dr" }, errors: {} });
    expect(parseDetails({})).toEqual({ data: {}, errors: {} });
  });

  it("clears the title with null and the language with an empty string", () => {
    expect(parseDetails({ title: null, language: "  " }).data).toEqual({
      title: null,
      language: null,
    });
  });

  it("normalises a NIN and refuses a short or untyped ID", () => {
    expect(parseDetails({ id: { type: "nin", number: "cm 1234" } }).data.id).toEqual({
      type: "nin",
      number: "CM1234",
    });
    expect(parseDetails({ id: { type: "nin", number: "12" } }).errors.id).toBeTruthy();
    expect(parseDetails({ id: { type: "driving", number: "12345" } }).errors.id).toBe(
      "Choose the type of ID.",
    );
  });

  it("keeps a good section when another fails", () => {
    const r = parseDetails({ title: "mrs", nok: { name: "Amina", phone: "" } });
    expect(r.data).toEqual({ title: "mrs" });
    expect(r.errors).toEqual({ nok: NOK_BOTH });
  });

  it("takes a next of kin, refuses a bad phone, and clears with null or neither", () => {
    expect(
      parseDetails({ nok: { name: " Amina ", relationship: "sibling", phone: "+256772000000" } })
        .data.nok,
    ).toEqual({ name: "Amina", relationship: "sibling", phone: "+256772000000" });
    expect(parseDetails({ nok: { name: "Amina", phone: "0772000000" } }).errors.nok).toBe(
      "Enter a Ugandan phone number.",
    );
    expect(parseDetails({ nok: null }).data).toEqual({ nok: null });
    expect(parseDetails({ nok: { name: "", relationship: "friend", phone: "" } }).data).toEqual({
      nok: null,
    });
  });

  it("refuses a body that is not an object", () => {
    expect(parseDetails("x").errors.form).toBeTruthy();
    expect(parseDetails(null).errors.form).toBeTruthy();
  });
});
