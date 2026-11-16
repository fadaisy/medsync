import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CatalogueTest, MenuOffering } from "@/lib/lab/test-menu";
import { describe, expect, it } from "vitest";

import {
  compareWithLevel,
  labCounts,
  menuRows,
  referralGroups,
  sectionHours,
} from "@/app/hospital-admin/lab/_lib/model";
import { templateFor } from "@/lib/lab/test-menu";

/*
 * Laboratory and imaging in the admin workspace (phase 2 of ADR 0516): the counts and groupings read the menu as
 * it is (a turnaround nobody entered stays empty), the writes are the test menu's own actions on the hub surface,
 * and Diagnostics forwards here.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(resolve(process.cwd(), dir))) {
    const p = join(dir, name);
    if (statSync(resolve(process.cwd(), p)).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
};

const test = (code: string, over: Partial<CatalogueTest> = {}): CatalogueTest => ({
  code,
  display: code.replace("test.", ""),
  aliases: [],
  section: "haematology",
  components: [],
  specimen: "Blood",
  tube: "EDTA",
  orderLoinc: null,
  minLevel: "HC III",
  levelBasis: { basis: "national_menu_2017", table: "1", narrative: null },
  usualRoute: "in_house",
  referTo: null,
  restricted: false,
  masked: false,
  advisory: null,
  offerByDefault: true,
  signed: true,
  ...over,
});
const offer = (code: string, over: Partial<MenuOffering> = {}): MenuOffering => ({
  code,
  where: "in_house",
  sectionOverride: null,
  hours: "24h",
  hoursNote: null,
  statedTurnaroundMinutes: null,
  referredTo: null,
  ...over,
});

const tests = [
  test("test.fbc"),
  test("test.esr"),
  test("test.ue", { section: "clinical_chemistry" }),
  test("test.vl", { section: "molecular", minLevel: "NRH", referTo: "CPHL" }),
  test("test.histo", { section: "histopathology_cytology", minLevel: "NRH" }),
];
const menu = [
  offer("test.fbc", { statedTurnaroundMinutes: 60 }),
  offer("test.esr", { hours: "scheduled", hoursNote: "Mon–Fri" }),
  offer("test.ue", { where: "not_offered", hours: null }),
  offer("test.vl", { where: "referred", hours: null, referredTo: "CPHL" }),
  offer("test.histo", { where: "referred", hours: null }),
  offer("test.gone"),
];

describe("Laboratory and imaging: the menu's numbers", () => {
  const rows = menuRows(tests, menu);

  it("a row is a catalogue test; an offering outside the catalogue is not one", () => {
    expect(rows.map((r) => r.t.code)).toEqual([
      "test.fbc",
      "test.esr",
      "test.ue",
      "test.vl",
      "test.histo",
    ]);
  });

  it("counts what is offered, and never fills a missing turnaround", () => {
    const n = labCounts(rows);
    expect([n.onMenu, n.inHouse, n.referred, n.noTat]).toEqual([4, 2, 2, 3]);
    expect(n.noLab.map((r) => r.t.code)).toEqual(["test.histo"]);
  });

  it("a section's hours are one value when its in-house tests agree, mixed when not", () => {
    expect(sectionHours(rows, "haematology")).toEqual({ kind: "mixed" });
    expect(sectionHours(rows, "clinical_chemistry")).toEqual({ kind: "none" });
    const one = menuRows(tests, [offer("test.fbc"), offer("test.esr")]);
    expect(sectionHours(one, "haematology")).toEqual({ kind: "24h" });
  });

  it("referrals group by the lab named; a test with no lab is not grouped", () => {
    expect(referralGroups(rows).map((g) => [g.lab, g.rows.map((r) => r.t.code)])).toEqual([
      ["CPHL", ["test.vl"]],
    ]);
  });

  it("compare lists only where the menu and the level's guide differ", () => {
    const guide = new Map(templateFor("GH", tests).map((r) => [r.code, r.where]));
    const diff = compareWithLevel("GH", tests, menu);
    for (const d of diff) {
      expect(d.guide).toBe(guide.get(d.code) ?? null);
      expect(d.guide ?? "not_offered").not.toBe(d.yours);
    }
    expect(diff.some((d) => d.code === "test.fbc")).toBe(false);
  });
});

describe("Laboratory and imaging: the page", () => {
  const files = walk("app/hospital-admin/lab");

  it("edits through the test menu's own actions on the hub surface, which the hospital admin may use", () => {
    const actions = read("lib/lab/test-menu-actions.ts");
    expect(actions).toMatch(
      /if \(s === "hub"\) \{\s*const a = await requireHospitalAdminScope\(\);/,
    );
    expect(read("app/hospital-admin/lab/page.tsx")).toMatch(/loadTestMenuData\(h, "hub", false\)/);
  });

  it("no red, no sheets, no hand-set colours", () => {
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/\b(bg|text|border)-(red|destructive|status-critical|alert)\b/);
      expect(src, f).not.toMatch(/<Sheet\b|<SheetContent/);
    }
  });

  it("Diagnostics forwards here and keeps its place", () => {
    const src = read("app/hospital-admin/departments/diagnostics/page.tsx");
    expect(src).toMatch(
      /redirect\(tab \? `\/hospital-admin\/lab\?tab=\$\{tab\}` : "\/hospital-admin\/lab"\)/,
    );
    expect(src).toMatch(/\/hospital-admin\/lab\?test=/);
  });
});
