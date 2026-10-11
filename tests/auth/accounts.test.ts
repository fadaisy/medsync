import { describe, expect, it } from "vitest";

import { authCookieName, MAX_ACCOUNTS, parseSlot, slotsInUse } from "@/lib/supabase/accounts";

/** Several accounts in one browser: each has its own auth cookie slot. */
describe("account slots", () => {
  it("slot 0 keeps Supabase's default cookie, so existing sessions survive", () => {
    expect(authCookieName(0)).toMatch(/^sb-[^-]+-auth-token$/);
    expect(authCookieName(2)).toBe(`${authCookieName(0)}-s2`);
  });

  it("an unknown or out-of-range active slot falls back to 0", () => {
    expect(parseSlot("3")).toBe(3);
    for (const v of [undefined, "", "x", "-1", "1.5", String(MAX_ACCOUNTS)])
      expect(parseSlot(v)).toBe(0);
  });

  it("finds whole and chunked session cookies, ignoring cleared ones", () => {
    const cookies = [
      { name: authCookieName(0), value: "base64-x" },
      { name: `${authCookieName(1)}.0`, value: "base64-y" },
      { name: authCookieName(3), value: "" },
      { name: "ms-account", value: "1" },
    ];
    expect(slotsInUse(cookies)).toEqual([0, 1]);
  });
});
