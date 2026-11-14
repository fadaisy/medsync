import { describe, expect, it } from "vitest";

import { tetherRewrite } from "@/lib/landing/feature";

/** ADR 0498: the Tether sign-in pages take over `/sign-in` and its code step only while the landing is on. */
describe("tetherRewrite", () => {
  it("serves the Tether pages at the hospital app's addresses when on", () => {
    expect(tetherRewrite("/", true)).toBe("/tether");
    expect(tetherRewrite("/sign-in", true)).toBe("/tether/sign-in");
    expect(tetherRewrite("/sign-in/mfa", true)).toBe("/tether/sign-in/mfa");
  });

  it("leaves everything else, and everything when off", () => {
    for (const p of ["/sign-up", "/get-started", "/sign-in/other", "/reception", "/tether"])
      expect(tetherRewrite(p, true)).toBeNull();
    for (const p of ["/", "/sign-in", "/sign-in/mfa"]) expect(tetherRewrite(p, false)).toBeNull();
  });
});
