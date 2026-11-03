/**
 * Set-up › Medicines (MEDICINES-TAB.md) source rules: one grid for Set-up and Stock, the old tab and prices page
 * gone, a page of 20 rows, cards below 640 px, live with a 30 s poll, and none of the prototype's props (§20).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(f, "utf8");
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const UI = walk("components/pharmacy/medicines");
const grid = read("components/pharmacy/medicines/grid.tsx");

describe("Medicines source rules", () => {
  it("Set-up edits and Stock operates the same grid; the old tab and prices page are gone", () => {
    expect(read("app/pharmacy/setup/page.tsx")).toMatch(/<MedicinesGrid[^>]*mode="edit"/);
    expect(read("app/pharmacy/stock/body.tsx")).toMatch(/<MedicinesGrid[^>]*mode="operate"/);
    for (const f of ["add-from-catalogue", "prices-view", "prices-controls"])
      expect(existsSync(`app/pharmacy/setup/_components/${f}.tsx`), f).toBe(false);
    expect(read("app/pharmacy/setup/_components/places-tab.tsx")).toMatch(/<PointBilling/);
  });

  it("a page of 20 rows, cards below 640 px, and a 30 s poll while live is down", () => {
    expect(grid).toMatch(/const PAGE = 20;/);
    expect(grid).toMatch(/sm:hidden/);
    expect(read("components/pharmacy/medicines/use-stock-live.ts")).toMatch(/POLL_MS = 30_000/);
  });

  it("no prototype props: no Acting as, no sample data, no left accent bars", () => {
    for (const f of UI) {
      const s = read(f);
      expect(s, f).not.toMatch(/Acting as|SAMPLE|ticker/i);
      expect(s, f).not.toMatch(/border-l-(2|4|8|\[)/);
    }
  });
});
