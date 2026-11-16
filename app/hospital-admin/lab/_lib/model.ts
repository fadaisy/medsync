/**
 * Laboratory and imaging (phase 2 of ADR 0516): the page's numbers and groupings, pure and client-safe. Everything
 * is read from the hospital's own menu rows and the signed catalogue; nothing is filled in for the lab (a missing
 * turnaround stays missing, Law 5).
 */
import type { CatalogueTest, Level, MenuOffering, SectionKey, Where } from "@/lib/lab/test-menu";

import { sectionFor, templateFor } from "@/lib/lab/test-menu";

export interface MenuRow {
  t: CatalogueTest;
  o: MenuOffering;
  section: SectionKey;
}

/** The menu's rows: an offering whose test is in the catalogue, with its section (Law 2). */
export function menuRows(
  tests: readonly CatalogueTest[],
  menu: readonly MenuOffering[],
): MenuRow[] {
  const byCode = new Map(tests.map((t) => [t.code, t]));
  return menu.flatMap((o) => {
    const t = byCode.get(o.code);
    const section = t ? sectionFor(o, t) : null;
    return t && section ? [{ t, o, section }] : [];
  });
}

export const offered = (rows: readonly MenuRow[]) =>
  rows.filter((r) => r.o.where !== "not_offered");

/** The four counts at the top, and the referred tests with no lab chosen. */
export function labCounts(rows: readonly MenuRow[]) {
  const on = offered(rows);
  const referred = on.filter((r) => r.o.where === "referred");
  return {
    onMenu: on.length,
    inHouse: on.filter((r) => r.o.where === "in_house").length,
    referred: referred.length,
    noTat: on.filter((r) => r.o.statedTurnaroundMinutes == null).length,
    noLab: referred.filter((r) => !r.o.referredTo?.trim()),
  };
}

export type SectionHours =
  | { kind: "none" }
  | { kind: "unset" }
  | { kind: "24h" }
  | { kind: "scheduled"; note: string | null }
  | { kind: "mixed" };

/** A section's hours, read from its in-house tests: one value when they agree, "mixed" when they do not. */
export function sectionHours(rows: readonly MenuRow[], section: SectionKey): SectionHours {
  const inHouse = rows.filter((r) => r.section === section && r.o.where === "in_house");
  if (!inHouse.length) return { kind: "none" };
  const keys = new Set(inHouse.map((r) => `${r.o.hours ?? ""}|${r.o.hoursNote ?? ""}`));
  if (keys.size > 1) return { kind: "mixed" };
  const o = inHouse[0]!.o;
  if (!o.hours) return { kind: "unset" };
  return o.hours === "24h" ? { kind: "24h" } : { kind: "scheduled", note: o.hoursNote };
}

/** Referred tests by the lab they go to, labs by name; the tests with no lab are left to `labCounts`. */
export function referralGroups(rows: readonly MenuRow[]) {
  const groups = new Map<string, MenuRow[]>();
  for (const r of offered(rows)) {
    const lab = r.o.where === "referred" ? r.o.referredTo?.trim() : "";
    if (!lab) continue;
    groups.set(lab, [...(groups.get(lab) ?? []), r]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lab, list]) => ({
      lab,
      rows: list.sort((a, b) => a.t.display.localeCompare(b.t.display)),
    }));
}

export interface CompareRow {
  code: string;
  test: CatalogueTest;
  /** Where the level's guide puts the test; null when the guide leaves it out. */
  guide: Exclude<Where, "not_offered"> | null;
  yours: Where;
}

/**
 * The tests where the menu differs from the guide for a level (TM-6's template over the signed catalogue): a test
 * the guide offers that the hospital does not, or does elsewhere, and a test the hospital offers outside the guide.
 */
export function compareWithLevel(
  level: Level,
  tests: readonly CatalogueTest[],
  menu: readonly MenuOffering[],
): CompareRow[] {
  const guide = new Map(templateFor(level, tests).map((r) => [r.code, r.where]));
  const mine = new Map(menu.map((o) => [o.code, o.where]));
  return tests
    .flatMap((t): CompareRow[] => {
      const g = guide.get(t.code) ?? null;
      const y = mine.get(t.code) ?? "not_offered";
      if ((g ?? "not_offered") === y) return [];
      return [{ code: t.code, test: t, guide: g, yours: y }];
    })
    .sort((a, b) => a.test.display.localeCompare(b.test.display));
}
