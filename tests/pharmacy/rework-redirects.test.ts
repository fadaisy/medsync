/**
 * Rework P1 exit: every old pharmacy URL lands somewhere. Each page under app/pharmacy is a new home (lib/pharmacy/ia),
 * a page opened from the new pages (print, hand-over), or the source of a redirect in next.config.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PAGES, REDIRECTS, SETUP_HREF } from "@/lib/pharmacy/ia";

const KEPT = ["/pharmacy/stock/recall/:x", "/pharmacy/labels/:x", "/pharmacy/prescriptions/:x", "/pharmacy/prescriptions/:x/handover", "/pharmacy/slip/:x"];

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n.startsWith("_") ? [] : routes(p);
    return n === "page.tsx" ? [dir.replace(/^app/, "").replace(/\[[^\]]+\]/g, ":x")] : [];
  });
}

// next.config's path-to-regexp, enough of it: `:name(regex)` keeps the regex, `:name` is one segment.
const matches = (source: string, path: string) =>
  new RegExp(`^${source.replace(/:\w+(\([^)]*\)+)?/g, (_, re: string | undefined) => re ?? "[^/]+")}$`).test(
    path.replace(/:x/g, "fixture-id"),
  );

describe("rework: old pharmacy URLs", () => {
  const homes = new Set([...PAGES.map((p) => p.href), SETUP_HREF]);

  it("every page is a home, a kept page, or redirected", () => {
    const lost = routes("app/pharmacy").filter(
      (r) => !homes.has(r) && !KEPT.includes(r) && !REDIRECTS.some((x) => matches(x.source, r)),
    );
    expect(lost).toEqual([]);
  });

  it("no redirect points at another redirect, and new homes are never redirected", () => {
    for (const r of REDIRECTS) {
      const to = r.destination.split("?")[0]!;
      expect(REDIRECTS.some((x) => x.source === to), r.source).toBe(false);
    }
    for (const h of homes) expect(REDIRECTS.some((x) => matches(x.source, h)), h).toBe(false);
  });
});
