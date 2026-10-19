/**
 * Lab test menu v2 (docs/lab/test-menu-v2/gate-a-proposal.md; TM-4 to TM-10, TM-12; ADRs 0350–0353). Pure and
 * client-safe: the menu screen, the order sheet and the migration script all call these. A menu row is a catalogue
 * test, never a result (Law 1); its section is the catalogue's unless the lab changed it (Law 2).
 */

export const SECTIONS = [
  { key: "haematology", display: "Haematology" },
  { key: "blood_transfusion", display: "Blood transfusion" },
  { key: "clinical_chemistry", display: "Clinical chemistry" },
  { key: "immunology_serology", display: "Immunology and serology" },
  { key: "microbiology", display: "Microbiology" },
  { key: "parasitology", display: "Parasitology" },
  { key: "molecular", display: "Molecular" },
  { key: "histopathology_cytology", display: "Histopathology and cytology" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];
export const sectionName = (k: string | null) =>
  SECTIONS.find((s) => s.key === k)?.display ?? "Laboratory";
/** Hub A.3 names one section differently (STOP 0). */
export const hubSectionCode = (k: SectionKey) =>
  k === "immunology_serology" ? "serology_immunology" : k;
/** A hub unit's A.3 code → the catalogue section (null for a unit outside A.3). */
export const sectionOfUnit = (code: string | null): SectionKey | null => {
  const k = code === "serology_immunology" ? "immunology_serology" : code;
  return (SECTIONS.find((s) => s.key === k)?.key ?? null) as SectionKey | null;
};

export const LEVELS = ["HC II", "HC III", "HC IV", "GH", "RRH", "NRH", "Reference"] as const;
export type Level = (typeof LEVELS)[number];
export const TEMPLATE_LEVELS = ["HC III", "HC IV", "GH", "RRH", "NRH"] as const;
export const levelIndex = (l: string | null) => LEVELS.indexOf((l ?? "Reference") as Level);
/** hospitals.level → the catalogue's level; a private laboratory chooses its nearest. */
export const levelOf = (hospitalLevel: string | null): Level | null =>
  (
    ({
      hc3: "HC III",
      hc4: "HC IV",
      district: "GH",
      regional: "RRH",
      national_referral: "NRH",
    }) as Record<string, Level>
  )[hospitalLevel ?? ""] ?? null;

/** TM-6: national tests go to their national laboratory through the hub. */
export const NATIONAL_LABS = ["CPHL", "NTRL", "UVRI", "UBTS"] as const;
export type Where = "in_house" | "referred" | "not_offered";
export type Hours = "24h" | "scheduled" | null;

export interface MenuComponent {
  id: string;
  display: string;
  unit: string | null;
  loinc: string | null;
}

/** One catalogue test as the menu reads it. A masked test carries no name, aliases or results (Law 6). */
export interface CatalogueTest {
  code: string;
  display: string;
  aliases: readonly string[];
  section: SectionKey | null;
  components: readonly MenuComponent[];
  specimen: string | null;
  tube: string | null;
  orderLoinc: string | null;
  minLevel: string | null;
  levelBasis: { basis: string; table: string | null; narrative: string | null } | null;
  usualRoute: "in_house" | "referred" | null;
  referTo: string | null;
  restricted: boolean;
  masked: boolean;
  advisory: string | null;
  offerByDefault: boolean;
  /** Active in the catalogue: its addendum is signed (TM-1, Law 4). */
  signed: boolean;
}

export interface MenuOffering {
  code: string;
  where: Where;
  sectionOverride: SectionKey | null;
  hours: Hours;
  hoursNote: string | null;
  statedTurnaroundMinutes: number | null;
  referredTo: string | null;
}

/** TM-4: never null for a catalogue test. */
export const sectionFor = (
  o: Pick<MenuOffering, "sectionOverride"> | null | undefined,
  t: Pick<CatalogueTest, "section">,
) => o?.sectionOverride ?? t.section;

/* ─── TM-6, TM-7: level templates ──────────────────────────────────────── */

export interface TemplateRow {
  code: string;
  where: "in_house" | "referred";
  referredTo: string | null;
}

export function templateFor(level: Level, tests: readonly CatalogueTest[]): TemplateRow[] {
  const L = levelIndex(level);
  const nrh = levelIndex("NRH");
  return tests.flatMap((t): TemplateRow[] => {
    if (!t.offerByDefault || !t.signed) return [];
    const m = levelIndex(t.minLevel);
    const national = (NATIONAL_LABS as readonly string[]).includes(t.referTo ?? "");
    if (
      m <= L &&
      (t.levelBasis?.basis === "national_menu_2017" || t.usualRoute === "in_house" || L >= nrh)
    )
      return [{ code: t.code, where: "in_house", referredTo: null }];
    if (m <= L + 1 || national)
      return [{ code: t.code, where: "referred", referredTo: national ? t.referTo : null }];
    return [];
  });
}

/** TM-7: adds only what is missing; never changes or removes an offering. Returns the 5.2 preview counts. */
export function applyTemplate(
  menu: readonly Pick<MenuOffering, "code">[],
  template: readonly TemplateRow[],
  hours: Hours,
) {
  const have = new Set(menu.map((o) => o.code));
  const inTemplate = new Set(template.map((r) => r.code));
  const add: MenuOffering[] = template
    .filter((r) => !have.has(r.code))
    .map((r) => ({
      code: r.code,
      where: r.where,
      sectionOverride: null,
      hours: r.where === "in_house" ? hours : null,
      hoursNote: r.where === "in_house" && hours === "scheduled" ? "Working hours" : null,
      statedTurnaroundMinutes: null, // Law 5: templates never fill it
      referredTo: r.referredTo,
    }));
  return {
    add,
    counts: {
      added: add.length,
      kept: template.length - add.length,
      outside: menu.filter((o) => !inTemplate.has(o.code)).length,
    },
  };
}

/* ─── TM-8: search ─────────────────────────────────────────────────────── */

export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const tokens = (s: string) => fold(s).split(" ").filter(Boolean);
/** Every query token is a prefix of some token of `s`, or `s` starts with the whole query. */
const tokenMatch = (s: string, q: string) => {
  const f = fold(s);
  if (f.startsWith(q)) return true;
  const have = tokens(s);
  return tokens(q).every((w) => have.some((h) => h.startsWith(w)));
};

/**
 * Ranks: exact alias (or name) first, then name prefix, then alias match, then a result inside the test. Masked
 * tests never match: their hidden name was never handed over, and they do not match on the mask either.
 */
export function rankTests<
  T extends {
    display: string;
    aliases: readonly string[];
    components: readonly { display: string }[];
    masked: boolean;
  },
>(tests: readonly T[], query: string): T[] {
  const q = fold(query);
  if (!q) return [...tests];
  const scored: { t: T; r: number }[] = [];
  for (const t of tests) {
    if (t.masked) continue;
    const r =
      fold(t.display) === q || t.aliases.some((a) => fold(a) === q)
        ? 0
        : fold(t.display).startsWith(q)
          ? 1
          : tokenMatch(t.display, q) || t.aliases.some((a) => tokenMatch(a, q))
            ? 2
            : t.components.some((c) => tokenMatch(c.display, q))
              ? 3
              : -1;
    if (r >= 0) scored.push({ t, r });
  }
  return scored.sort((a, b) => a.r - b.r || a.t.display.localeCompare(b.t.display)).map((s) => s.t);
}

/** Law 6: what a viewer without access may see of a restricted test. */
export function mask<T extends CatalogueTest>(t: T, canSee: boolean): T {
  if (!t.restricted || canSee) return t;
  return {
    ...t,
    display: "Restricted test",
    aliases: [],
    components: [],
    specimen: null,
    tube: null,
    orderLoinc: null,
    advisory: null,
    levelBasis: null,
    masked: true,
  };
}

/** 5.3: the catalogue's relatedTests are absent from v2, so the same section and the same specimen. */
export const relatedTo = (t: CatalogueTest, all: readonly CatalogueTest[]) =>
  all.filter(
    (x) =>
      x.code !== t.code &&
      !x.masked &&
      x.section === t.section &&
      !!t.specimen &&
      x.specimen === t.specimen,
  );

/* ─── TM-10: profiles ──────────────────────────────────────────────────── */

/** Law 6: whole words, any case or accent. */
export function namesRestricted(name: string, restrictedNames: readonly string[]) {
  const n = ` ${fold(name)} `;
  return restrictedNames.some((w) => n.includes(` ${fold(w)} `));
}

/** TM-10: only tests on the menu that are offered. Returns the codes that are not. */
export const notOffered = (codes: readonly string[], menu: readonly MenuOffering[]) =>
  codes.filter((c) => {
    const o = menu.find((m) => m.code === c);
    return !o || o.where === "not_offered";
  });

/** §9: a catalogue request is about a test, never a patient: hospital numbers, lab numbers, long digit runs. */
export const looksLikeIdentifier = (s: string) =>
  /\bMS-?\d{4}-?\d+\b/i.test(s) ||
  /\bL-?\d{6,}\b/i.test(s) ||
  /\d{7,}/.test(s.replace(/[\s-]/g, ""));

/* ─── 5.1: summary, words ──────────────────────────────────────────────── */

export function menuSummary(
  menu: readonly MenuOffering[],
  tests: ReadonlyMap<string, Pick<CatalogueTest, "section">>,
) {
  const on = menu.filter((o) => o.where !== "not_offered" && tests.has(o.code));
  return {
    onMenu: on.length,
    inHouse: on.filter((o) => o.where === "in_house").length,
    referred: on.filter((o) => o.where === "referred").length,
    noSection: on.filter((o) => !sectionFor(o, tests.get(o.code)!)).length,
    changed: on.filter((o) => o.sectionOverride && o.sectionOverride !== tests.get(o.code)!.section)
      .length,
  };
}

/** "45 min", "2 h", "1 h 30 min", "7 days". */
export function minutesWords(m: number | null): string | null {
  if (m == null) return null;
  if (m % 1440 === 0) return `${m / 1440} ${m === 1440 ? "day" : "days"}`;
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

/* ─── TM-9: per-LOINC settings to tests ────────────────────────────────── */

export interface LegacyRow {
  code: string;
  provision: Where;
  hours: Hours;
  hoursNote: string | null;
  statedTat: string | null;
  referredTo: string | null;
  /** The hub unit's catalogue section, when the old row had one. */
  section: SectionKey | null;
}

export interface MigrationPlan {
  rows: (MenuOffering & { statedTat: string | null; from: string[]; coverage: string })[];
  conflicts: { code: string; field: string; values: Record<string, string> }[];
  unmapped: string[];
  skipped: string[];
}

const mode = <T>(xs: readonly T[]) => {
  const n = new Map<string, { v: T; c: number }>();
  for (const x of xs) {
    const k = JSON.stringify(x);
    n.set(k, { v: x, c: (n.get(k)?.c ?? 0) + 1 });
  }
  return [...n.values()].sort((a, b) => b.c - a.c)[0]!.v;
};

/**
 * TM-9, TM-D10. `loincTo` maps a LOINC code to the concept ids that carry it; `existing` are test codes that
 * already have a row (never overwritten). A test inherits when all its set components agree; otherwise the most
 * common value, and the conflict is listed.
 */
export function planOfferingMigration(input: {
  legacy: readonly LegacyRow[];
  tests: readonly { code: string; section: SectionKey | null; components: readonly string[] }[];
  loincTo: ReadonlyMap<string, readonly string[]>;
  existing: ReadonlySet<string>;
}): MigrationPlan {
  const plan: MigrationPlan = { rows: [], conflicts: [], unmapped: [], skipped: [] };
  const byTest = new Map<string, LegacyRow[]>();
  for (const r of input.legacy) {
    const concepts = new Set(input.loincTo.get(r.code) ?? []);
    const hits = input.tests.filter((t) => t.components.some((c) => concepts.has(c)));
    if (!hits.length) plan.unmapped.push(r.code);
    for (const t of hits) byTest.set(t.code, [...(byTest.get(t.code) ?? []), r]);
  }
  for (const t of input.tests) {
    const rows = byTest.get(t.code);
    if (!rows) continue;
    if (input.existing.has(t.code)) {
      plan.skipped.push(t.code);
      continue;
    }
    const pick = <K extends keyof LegacyRow>(field: K) => {
      const vals = rows.map((r) => r[field]);
      if (new Set(vals.map((v) => JSON.stringify(v))).size > 1)
        plan.conflicts.push({
          code: t.code,
          field,
          values: Object.fromEntries(rows.map((r) => [r.code, String(r[field] ?? "—")])),
        });
      return mode(vals);
    };
    const where = pick("provision");
    const section = pick("section");
    const covered = new Set(rows.flatMap((r) => input.loincTo.get(r.code) ?? []));
    plan.rows.push({
      code: t.code,
      where,
      sectionOverride: section && section !== t.section ? section : null,
      hours: where === "in_house" ? pick("hours") : null,
      hoursNote: where === "in_house" ? pick("hoursNote") : null,
      statedTurnaroundMinutes: null,
      statedTat: where === "not_offered" ? null : pick("statedTat"),
      referredTo: where === "referred" ? pick("referredTo") : null,
      from: rows.map((r) => r.code),
      coverage: `${t.components.filter((c) => covered.has(c)).length} of ${t.components.length}`,
    });
  }
  return plan;
}
