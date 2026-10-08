/**
 * Every NCD role lands on a screen it may open, and no page lets a missing capability become a server
 * error: pages check with `can` and answer with notFound or a redirect, never a thrown authorize().
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { GrantRole } from "@/lib/ncdreg/capabilities";
import { describe, expect, it } from "vitest";

import { firstAllowedHref } from "@/app/ncd/_lib/nav";
import { capabilitiesOf, ROLE_CAPABILITIES } from "@/lib/ncdreg/capabilities";

const humanRoles = (Object.keys(ROLE_CAPABILITIES) as GrantRole[]).filter(
  (r) => r !== "system" && r !== "demo_loader",
);

describe("NCD page guards", () => {
  it.each(humanRoles)("%s has a first screen", (role) => {
    const caps = capabilitiesOf([role]);
    expect(firstAllowedHref((...c) => c.some((x) => caps.has(x)))).not.toBeNull();
  });

  it("a CSO-only account lands on Administration, an auditor on Data quality", () => {
    const land = (role: GrantRole) => {
      const caps = capabilitiesOf([role]);
      return firstAllowedHref((...c) => c.some((x) => caps.has(x)));
    };
    expect(land("clinical_safety_officer")).toBe("/ncd/admin");
    expect(land("auditor")).toBe("/ncd/quality");
    expect(land("clinician")).toBe("/ncd");
  });

  it("no page throws authorize(); each answers a missing capability with notFound or redirect", () => {
    const pages: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (n === "page.tsx") pages.push(p);
      }
    };
    walk(resolve(__dirname, "../../app/ncd"));
    for (const p of pages) {
      const src = readFileSync(p, "utf8");
      expect(src, p).not.toMatch(/\bauthorize\(ctx/);
      expect(src, p).toMatch(/notFound\(\)|redirect\(/);
    }
  });
});
