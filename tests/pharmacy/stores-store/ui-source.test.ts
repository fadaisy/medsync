/**
 * Pharmacy Phase 2, Step 4: source checks on the store's screens and actions (Laws 13 and 14, 5.11, ADR 0161).
 * Red never (only the existing Emergency); nothing green; amber words carry an icon (StatusWord does); no native
 * date input; centred dialogs only; every page is behind `pharmacyStore`; every action is the house contract.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PHARMACY_STORES_COPY } from "@/content/pharmacy-stores";

const ROOT = resolve(__dirname, "../../..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const mine = [
  ...walk(join(ROOT, "app/pharmacy/store/places")),
  join(ROOT, "app/pharmacy/store/actions.ts"),
  join(ROOT, "app/hospital-admin/departments/pharmacy/_components/location-golive.tsx"),
  join(ROOT, "app/hospital-admin/departments/pharmacy/location-actions.ts"),
].filter((p) => /\.tsx?$/.test(p));
/** A page reads with its body (Workspace v2 moved old page bodies to a sibling body.tsx). */
const read = (p: string) =>
  readFileSync(p, "utf8") +
  (p.endsWith("page.tsx") && existsSync(p.replace(/page\.tsx$/, "body.tsx"))
    ? readFileSync(p.replace(/page\.tsx$/, "body.tsx"), "utf8")
    : "");
const rel = (p: string) => p.slice(ROOT.length + 1);

describe("the store's screens", () => {
  it("finds the files", () => expect(mine.length).toBeGreaterThanOrEqual(4));

  it.each(mine.map(rel))("%s: no red, no green, no native date field, no side sheet", (f) => {
    const s = read(join(ROOT, f));
    expect(s).not.toMatch(/\b(?:text|bg|border|ring|fill|stroke)-(?:red|rose|green|emerald|lime)-/);
    expect(s).not.toMatch(/tone="critical"|status-critical/);
    expect(s).not.toMatch(/type="date"|type="month"|type="datetime-local"/);
    expect(s).not.toMatch(/SheetContent|side="(?:left|right|bottom|top)"/);
  });

  it("every page is behind pharmacyStore and calls notFound", () => {
    const pages = mine.filter((p) => p.endsWith("page.tsx"));
    // The lists and the delivery live in Stock › Store now.
    expect(pages).toHaveLength(0);
    for (const p of pages) {
      const s = read(p);
      expect(s, rel(p)).toMatch(/if \(!pharmacyStoreLiveFor\(actor\.hospitalId\)\) notFound\(\);/);
    }
  });

  it("every store action file is 'use server' and goes through the house contract", () => {
    const files = mine.filter((p) => p.endsWith("actions.ts") && p.includes("app/pharmacy/store"));
    expect(files).toHaveLength(1);
    for (const p of files) {
      const s = read(p);
      expect(s.startsWith('"use server";'), rel(p)).toBe(true);
      const exported = s.match(/export async function \w+/g) ?? [];
      expect(exported.length, rel(p)).toBeGreaterThan(0);
      expect((s.match(/storeAct\(/g) ?? []).length, rel(p)).toBe(exported.length);
    }
  });

  it("amber is a StatusWord (icon and word), never a bare colour", () => {
    for (const p of mine) expect(read(p), rel(p)).not.toMatch(/\b(?:text|bg)-amber-/);
  });

  it("every product, batch or recall field accepts a scan where stock is received or moved (5.11)", () => {
    for (const f of [
      "app/pharmacy/store/places/_components/places-dialogs.tsx",
    ])
      expect(read(join(ROOT, f)), f).toMatch(/<ScanField/);
  });

  it("the copy is back to draft for re-signing after the rework sweep", () => {
    expect(PHARMACY_STORES_COPY).toEqual({
      status: "draft",
      signedBy: null,
      signedOn: null,
    });
  });
});
