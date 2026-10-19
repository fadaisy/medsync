/**
 * Lab test menu v2 engines (Step 4): TM-4 sectionFor (property), TM-6 template snapshot, TM-7 never overwrites
 * (property), TM-8 search ranking and masking, TM-10 names, TM-9 migration. The catalogue is the signed file itself.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CatalogueTest, MenuOffering, SectionKey } from "@/lib/lab/test-menu";
import { describe, expect, it } from "vitest";

import { LAB_TEST_MENU } from "@/content/lab-test-menu";
import {
  applyTemplate,
  levelOf,
  mask,
  menuSummary,
  minutesWords,
  namesRestricted,
  notOffered,
  planOfferingMigration,
  rankTests,
  relatedTo,
  sectionFor,
  SECTIONS,
  TEMPLATE_LEVELS,
  templateFor,
} from "@/lib/lab/test-menu";

type Raw = { tests: Record<string, any>[]; concepts: Record<string, any>[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
const raw: Raw = JSON.parse(
  readFileSync(join(process.cwd(), "docs/lab/test-menu-v2/lab-catalogue-v2.json"), "utf8"),
);
const conceptName = new Map(raw.concepts.map((c) => [c.id as string, c.display as string]));
const catalogue: CatalogueTest[] = raw.tests.map((t) => ({
  code: t.id,
  display: t.display,
  aliases: t.aliases,
  section: t.section,
  components: (t.components as string[]).map((id) => ({
    id,
    display: conceptName.get(id) ?? id,
    unit: null,
    loinc: null,
  })),
  specimen: t.specimen,
  tube: t.container,
  orderLoinc: null,
  minLevel: t.minLevel,
  levelBasis: t.levelBasis,
  usualRoute: t.usualRoute,
  referTo: t.referTo,
  restricted: !!t.restricted,
  masked: false,
  advisory: t.advisory,
  offerByDefault: t.offerByDefault,
  signed: true,
}));
const byCode = (c: string) => catalogue.find((t) => t.code === c)!;
const offering = (code: string, o: Partial<MenuOffering> = {}): MenuOffering => ({
  code,
  where: "in_house",
  sectionOverride: null,
  hours: "24h",
  hoursNote: null,
  statedTurnaroundMinutes: null,
  referredTo: null,
  ...o,
});

describe("TM-4 sectionFor", () => {
  it("is never null for any catalogue test, with or without an override", () => {
    for (const t of catalogue) {
      expect(sectionFor(null, t)).toBeTruthy();
      for (const s of SECTIONS)
        expect(sectionFor(offering(t.code, { sectionOverride: s.key }), t)).toBe(s.key);
      expect(sectionFor(offering(t.code), t)).toBe(t.section);
    }
  });
});

describe("TM-6 templateFor: snapshot against the catalogue file (re-baseline only with a signed change)", () => {
  it("in-house/referred per level", () => {
    const counts = Object.fromEntries(
      TEMPLATE_LEVELS.map((l) => {
        const tpl = templateFor(l, catalogue);
        return [
          l,
          `${tpl.filter((r) => r.where === "in_house").length}/${tpl.filter((r) => r.where === "referred").length}`,
        ];
      }),
    );
    expect(counts).toEqual({
      "HC III": "33/69",
      "HC IV": "61/83",
      GH: "110/69",
      RRH: "151/64",
      NRH: "197/88",
    });
  });
  it("S15: low-value tests are in no template; unsigned tests are never added (Law 4)", () => {
    const low = catalogue.filter((t) => !t.offerByDefault).map((t) => t.code);
    expect(low).toHaveLength(6);
    for (const l of TEMPLATE_LEVELS)
      expect(templateFor(l, catalogue).some((r) => low.includes(r.code))).toBe(false);
    expect(
      templateFor(
        "RRH",
        catalogue.map((t) => ({ ...t, signed: false })),
      ),
    ).toEqual([]);
  });
  it("a national referTo becomes referred_to", () => {
    const vl = templateFor("HC III", catalogue).find((r) => r.code === "test.hiv_viral_load")!;
    expect(vl).toEqual({ code: "test.hiv_viral_load", where: "referred", referredTo: "CPHL" });
  });
  it("hospital levels map; a private laboratory chooses", () => {
    expect(levelOf("regional")).toBe("RRH");
    expect(levelOf("district")).toBe("GH");
    expect(levelOf("private")).toBeNull();
  });
});

describe("TM-7 applyTemplate", () => {
  it("S11/S12: an empty menu gets the snapshot; again changes nothing; stated turnaround stays empty", () => {
    const tpl = templateFor("RRH", catalogue);
    const first = applyTemplate([], tpl, "24h");
    expect(first.counts).toEqual({ added: 215, kept: 0, outside: 0 });
    expect(first.add.every((o) => o.statedTurnaroundMinutes === null)).toBe(true);
    expect(first.add.filter((o) => o.where === "referred").every((o) => o.hours === null)).toBe(
      true,
    );
    expect(applyTemplate(first.add, tpl, "24h").add).toEqual([]);
  });
  it("property: never changes or removes an existing offering (S13)", () => {
    for (const level of TEMPLATE_LEVELS)
      for (let seed = 0; seed < 20; seed++) {
        const menu = catalogue
          .filter((_, i) => (i * 7 + seed) % 5 === 0)
          .map((t, i) =>
            offering(t.code, {
              where: (["in_house", "referred", "not_offered"] as const)[i % 3],
              statedTurnaroundMinutes: i + 1,
            }),
          );
        const tpl = templateFor(level, catalogue);
        const { add, counts } = applyTemplate(menu, tpl, "scheduled");
        expect(add.some((a) => menu.some((m) => m.code === a.code))).toBe(false);
        expect(counts.added + counts.kept).toBe(tpl.length);
        expect(counts.outside).toBe(menu.filter((m) => !tpl.some((r) => r.code === m.code)).length);
      }
  });
});

describe("TM-8 search", () => {
  const codes = (q: string) => rankTests(catalogue, q).map((t) => t.code);
  it("S14: complement finds C3+C4, C3, C4 and CH50", () => {
    const found = codes("complement");
    for (const c of ["test.c3_c4", "test.c3", "test.c4", "test.ch50"]) expect(found).toContain(c);
  });
  it("S14: ALT finds LFTs by a result; RFTs finds U&E by an alias; B/S finds the malaria smear", () => {
    expect(codes("ALT")).toContain("test.lft");
    expect(codes("RFTs")[0]).toBe("test.urea_electrolytes");
    expect(codes("B/S")).toContain(catalogue.find((t) => t.aliases.includes("B/S"))!.code);
  });
  it("ranks an exact alias before a name prefix before a result match", () => {
    const tests = [
      {
        display: "Zeta panel",
        aliases: [],
        components: [{ id: "x", display: "Ferritin", unit: null, loinc: null }],
        masked: false,
      },
      { display: "Ferritin level", aliases: [], components: [], masked: false },
      { display: "Iron studies", aliases: ["Ferritin"], components: [], masked: false },
    ];
    expect(rankTests(tests, "ferritin").map((t) => t.display)).toEqual([
      "Iron studies",
      "Ferritin level",
      "Zeta panel",
    ]);
  });
  it("is case- and accent-insensitive", () => {
    expect(codes("haemoglobin éléctrophoresis".replace("é", "e"))).toEqual(
      codes("HAEMOGLOBIN ELECTROPHORESIS"),
    );
  });
  it("S10: a masked test shows 'Restricted test' and search never reveals it", () => {
    const masked = catalogue.map((t) => mask(t, false));
    const vl = masked.find((t) => t.code === "test.hiv_viral_load")!;
    expect(vl.display).toBe("Restricted test");
    expect(vl.aliases).toEqual([]);
    expect(vl.components).toEqual([]);
    for (const q of ["viral load", "VL", "HIV", "restricted"])
      expect(rankTests(masked, q).some((t) => t.code === "test.hiv_viral_load")).toBe(false);
    expect(mask(byCode("test.hiv_viral_load"), true).display).toBe("HIV-1 viral load");
  });
  it("search across 291 tests stays under 50 ms (p95 budget)", () => {
    const qs = [
      "alt",
      "rfts",
      "complement",
      "b/s",
      "culture",
      "hiv",
      "glucose",
      "c3",
      "urine",
      "x",
    ];
    const times = qs.flatMap((q) =>
      Array.from({ length: 5 }, () => {
        const s = performance.now();
        rankTests(catalogue, q);
        return performance.now() - s;
      }),
    );
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.95)]!).toBeLessThan(50);
  });
});

describe("5.3 related tests", () => {
  it("same section and same specimen", () => {
    const fbc = byCode("test.fbc");
    const rel = relatedTo(fbc, catalogue);
    expect(rel.every((t) => t.section === fbc.section && t.specimen === fbc.specimen)).toBe(true);
  });
});

describe("TM-10 profiles", () => {
  const words = LAB_TEST_MENU.restrictedNames;
  it("S21: a name naming a restricted condition is refused, whole words only", () => {
    expect(namesRestricted("HIV care", words)).toBe(true);
    expect(namesRestricted("tb screen", words)).toBe(true);
    expect(namesRestricted("Syphilis profile", words)).toBe(true);
    expect(namesRestricted("Antenatal booking", words)).toBe(false);
    expect(namesRestricted("Stable patient", words)).toBe(false); // "tb" inside a word is not a match
  });
  it("only offered menu tests", () => {
    const menu = [offering("test.fbc"), offering("test.esr", { where: "not_offered" })];
    expect(notOffered(["test.fbc", "test.esr", "test.crp"], menu)).toEqual([
      "test.esr",
      "test.crp",
    ]);
  });
});

describe("5.1 summary and words", () => {
  it("counts only menu tests; changed sections; 'without a section' is 0 for catalogue tests", () => {
    const map = new Map(catalogue.map((t) => [t.code, t]));
    const s = menuSummary(
      [
        offering("test.fbc"),
        offering("test.urinalysis_complete", {
          sectionOverride: "clinical_chemistry" as SectionKey,
        }),
        offering("test.c3", { where: "referred" }),
        offering("test.esr", { where: "not_offered" }),
      ],
      map,
    );
    expect(s).toEqual({ onMenu: 3, inHouse: 2, referred: 1, noSection: 0, changed: 1 });
  });
  it("menu table filter over 300 rows stays under 100 ms", () => {
    const menu = catalogue.map((t) => offering(t.code));
    const start = performance.now();
    for (let i = 0; i < 20; i++)
      menu.filter((o) => o.where === "in_house" && sectionFor(o, byCode(o.code)));
    expect((performance.now() - start) / 20).toBeLessThan(100);
  });
  it("minutes in words", () => {
    expect([45, 120, 90, 1440, 10080, null].map(minutesWords)).toEqual([
      "45 min",
      "2 h",
      "1 h 30 min",
      "1 day",
      "7 days",
      null,
    ]);
  });
});

describe("TM-9 planOfferingMigration", () => {
  const tests = [
    {
      code: "test.lft",
      section: "clinical_chemistry" as SectionKey,
      components: ["obs.alt", "obs.ast", "obs.alp"],
    },
    { code: "test.alt", section: "clinical_chemistry" as SectionKey, components: ["obs.alt"] },
  ];
  const loincTo = new Map([
    ["1742-6", ["obs.alt"]],
    ["1920-8", ["obs.ast"]],
  ]);
  const row = (code: string, o: Record<string, unknown> = {}) => ({
    code,
    provision: "in_house" as const,
    hours: "24h" as const,
    hoursNote: null,
    statedTat: null,
    referredTo: null,
    section: "clinical_chemistry" as SectionKey,
    ...o,
  });
  it("agreeing components carry over; a test row that exists is never overwritten", () => {
    const p = planOfferingMigration({
      legacy: [row("1742-6"), row("1920-8"), row("DEMO-X")],
      tests,
      loincTo,
      existing: new Set(["test.alt"]),
    });
    expect(p.rows.map((r) => [r.code, r.where, r.hours, r.coverage])).toEqual([
      ["test.lft", "in_house", "24h", "2 of 3"],
    ]);
    expect(p.skipped).toEqual(["test.alt"]);
    expect(p.unmapped).toEqual(["DEMO-X"]);
    expect(p.conflicts).toEqual([]);
  });
  it("TM-D10: disagreement takes the most common value and is listed; a differing section is an override", () => {
    const p = planOfferingMigration({
      legacy: [
        row("1742-6", { statedTat: "2 h", section: "haematology" }),
        row("1920-8", { statedTat: "4 h", section: "haematology" }),
      ],
      tests: [tests[0]!],
      loincTo,
      existing: new Set(),
    });
    expect(p.rows[0]!.sectionOverride).toBe("haematology");
    expect(p.conflicts).toEqual([
      { code: "test.lft", field: "statedTat", values: { "1742-6": "2 h", "1920-8": "4 h" } },
    ]);
  });
});

describe("§9 catalogue requests carry no patient data", () => {
  it("refuses hospital numbers, lab numbers and long digit runs; allows test words", async () => {
    const { looksLikeIdentifier } = await import("@/lib/lab/test-menu");
    for (const s of ["for MS-2026-00123", "L00012345", "phone 0772 123 456"])
      expect(looksLikeIdentifier(s)).toBe(true);
    for (const s of ["Anti-MOG antibody", "CSF, 2 mL", "Kit insert v3 (2024)"])
      expect(looksLikeIdentifier(s)).toBe(false);
  });
});
