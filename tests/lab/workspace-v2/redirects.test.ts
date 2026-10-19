import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { LAB_KEPT_PATHS, LAB_REDIRECTS, withQuery } from "@/lib/lab/redirects";

/**
 * S5 and the redirect budget (0 old URLs without a redirect): every lab page that existed at Step 0 is either
 * a redirect source or a kept path, and every redirect lands on a page that exists.
 */
const ROOT = resolve(__dirname, "../../..");
const STEP0_PAGES = [
  "/lab",
  "/lab/older",
  "/lab/released",
  "/lab/rejected",
  "/lab/results/[orderId]",
  "/lab/criticals",
  "/lab/criticals/[alertId]",
  "/lab/downtime",
  "/lab/downtime/print",
  "/lab/refer",
  "/lab/refer/manifests/[id]/print",
  "/lab/referrals",
  "/lab/referrals/[id]/result",
  "/lab/exchange",
  "/lab/exchange/partners",
  "/lab/exchange/matches",
  "/lab/exchange/analysers",
  "/lab/quality",
  "/lab/quality/qc",
  "/lab/quality/qc/run",
  "/lab/quality/eqa",
  "/lab/quality/bedside",
  "/lab/quality/nonconformities",
  "/lab/quality/nonconformities/[id]",
  "/lab/stock",
  "/lab/stock/order",
  "/lab/stock/receive",
  "/lab/equipment",
  "/lab/hmis",
  "/lab/hmis/mapping",
  "/lab/hmis/print",
  "/lab/hmis/records",
  "/lab/register",
  "/lab/reports",
  "/lab/reports/records",
  "/lab/setup/catalogue",
  "/lab/setup/criticals",
  "/lab/setup/delta",
  "/lab/setup/demo",
  "/lab/setup/drafts",
  "/lab/setup/limits",
  "/lab/setup/menu",
  "/lab/setup/patient-release",
  "/lab/setup/profiles",
  "/lab/setup/ranges",
  "/lab/setup/settings",
];
const asPattern = (p: string) => p.replace(/\[(\w+)\]/g, (_, k: string) => `:${k}`);

function pages(dir: string, base = "/lab"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name.startsWith("_")) continue;
      out.push(...pages(full, `${base}/${name}`));
    } else if (name === "page.tsx") out.push(base);
  }
  return out;
}

describe("redirect map (S5)", () => {
  it("covers every Step 0 lab page", () => {
    const sources = new Set(LAB_REDIRECTS.map((r) => r.source));
    for (const p of STEP0_PAGES) {
      if (p === "/lab") continue; // lands by role
      const pat = asPattern(p);
      expect(sources.has(pat) || LAB_KEPT_PATHS.includes(pat), p).toBe(true);
    }
  });

  it("lands every redirect on a page that exists, with its ids kept", () => {
    const now = new Set(pages(resolve(ROOT, "app/lab")).map(asPattern));
    for (const r of LAB_REDIRECTS) {
      const path = r.destination.split("?")[0]!;
      expect(now.has(path), `${r.source} → ${path}`).toBe(true);
      for (const id of r.source.match(/:\w+/g) ?? []) expect(r.destination, r.source).toContain(id);
      expect(r.permanent).toBe(true);
    }
  });

  it("each old page still in the tree answers the same target while the flag is on", () => {
    for (const r of LAB_REDIRECTS) {
      const file = resolve(ROOT, `app${r.source.replace(/:(\w+)/g, "[$1]")}/page.tsx`);
      if (!existsSync(file)) continue; // removed at Step 11: next.config.ts answers
      const src = readFileSync(file, "utf8");
      const target = r.destination.replace(/:(\w+)/g, "${$1}");
      const flat = src.replace(/\s+/g, "");
      const exact =
        flat.includes(`redirectIfV2(\`${target}\``) || flat.includes(`redirectIfV2("${target}"`);
      // A target built from the old query (HMIS keeps its form section as `part`): same path, same tab.
      const [path, q = ""] = target.split("?");
      const built =
        flat.includes("redirectIfV2(") &&
        flat.includes(path!) &&
        [...new URLSearchParams(q).values()].every((v) => flat.includes(v));
      expect(exact || built, r.source).toBe(true);
    }
  });

  it("keeps the old query parameters (Law 3)", () => {
    expect(withQuery("/lab/send-outs?tab=board", { month: "2026-10", r: "abc", tab: "x" })).toBe(
      "/lab/send-outs?tab=board&month=2026-10&r=abc",
    );
    expect(withQuery("/lab/bench/downtime", {})).toBe("/lab/bench/downtime");
  });
});
