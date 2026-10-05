/**
 * NCDSync dashboard (F1–F7, §11.4): suppression (F6), the shared trend scale, row order by patients
 * under care, the outcome colour ramp, and the F7 one-screen layout contract at component level
 * (no browser runner is configured: fixed regions and internal scroll are asserted on the markup).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { View } from "@/lib/ncdreg/read/dashboard";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CARE_BAND_TONES,
  KIDNEY_TONES,
  OUTCOME_RAMP,
  outcomeTone,
} from "@/app/ncd/_components/charts/tones";
import {
  ChartBands,
  DASHBOARD_LAYOUT,
  DashboardFrame,
} from "@/app/ncd/dashboard/_components/frame";
import { outcomeClasses } from "@/lib/ncdreg/indicators/engine";
import {
  cell,
  isSuppressed,
  line,
  orderByUnderCare,
  sharedTrendMax,
  SUPPRESSED_TEXT,
} from "@/lib/ncdreg/read/dashboard";
import { CONDITION_CATALOGUE } from "@/lib/ncdreg/standard/conditions";

const real = () => false;
const synthetic = (id: string) => id.startsWith("syn");
const view = (canDrill: boolean, isSynthetic = real): View => ({
  month: "2026-09",
  canDrill,
  links: true,
  isSynthetic,
  filterQuery: "",
});

describe("F6 suppression", () => {
  it("hides counts 1 to 4 for roles without drill-down", () => {
    for (const n of [1, 2, 3, 4])
      expect(
        isSuppressed(
          n,
          Array.from({ length: n }, (_, i) => `p${i}`),
          real,
          false,
        ),
      ).toBe(true);
    expect(isSuppressed(0, [], real, false)).toBe(false);
    expect(isSuppressed(5, ["a", "b", "c", "d", "e"], real, false)).toBe(false);
  });
  it("never suppresses for drill-down roles", () => {
    expect(isSuppressed(3, ["a", "b", "c"], real, true)).toBe(false);
  });
  it("exempts a count made up only of synthetic persons, not a mixed one", () => {
    expect(isSuppressed(2, ["syn1", "syn2"], synthetic, false)).toBe(false);
    expect(isSuppressed(2, ["syn1", "p2"], synthetic, false)).toBe(true);
  });
  it("never exempts a count whose people are unknown (a stored snapshot)", () => {
    expect(isSuppressed(3, [], () => true, false)).toBe(true);
  });
  it("a suppressed cell shows 1–4, no link and no percentage", () => {
    const c = cell(view(false), 3, "C12", "num", ["a", "b", "c"]);
    expect(c).toMatchObject({ text: SUPPRESSED_TEXT, suppressed: true, href: null });
    const r = {
      code: "C12",
      version: "v",
      num: 3,
      den: 40,
      ids: { num: ["a", "b", "c"], den: [] },
    };
    expect(line(view(false), "C12", r, "num", "Lost").pct).toBeNull();
    expect(line(view(true), "C12", r, "num", "Lost").pct).toBe(8);
  });
  it("drill-down roles get a link to the patients behind the count", () => {
    const c = cell(view(true), 3, "G04.x", "no_visit", ["a", "b", "c"]);
    expect(c.text).toBe("3");
    expect(c.href).toBe("/ncd/dashboard/patients?code=G04.x&part=no_visit&month=2026-09");
    expect(cell(view(false), 30, "C01", "num", []).href).toBeNull();
  });
});

describe("trend scale and row order", () => {
  it("one percentage scale from 0 shared by every row", () => {
    expect(
      sharedTrendMax([
        [12, 40, null],
        [55, 20],
      ]),
    ).toBe(60);
    expect(sharedTrendMax([[null], []])).toBe(10);
    expect(sharedTrendMax([[100]])).toBe(100);
  });
  it("orders rows by G02 under care, most first", () => {
    const mods = CONDITION_CATALOGUE.slice(0, 3);
    const results = Object.fromEntries(
      mods.map((m, i) => [`G02.${m.code}`, { num: (i + 1) * 10 }]),
    );
    expect(orderByUnderCare(mods, results).map((m) => m.code)).toEqual(
      [...mods].reverse().map((m) => m.code),
    );
  });
});

describe("§11.4 colour", () => {
  it("leading class takes the darkest action step; greys carry no visit, not recorded, not assessed", () => {
    for (const m of CONDITION_CATALOGUE) {
      const { classes, leading } = outcomeClasses(m);
      const ordered = [
        leading,
        ...classes.filter((c) => c !== leading),
        "not_recorded",
        "no_visit",
      ];
      expect(outcomeTone(leading, ordered)).toBe(OUTCOME_RAMP[0]);
      for (const c of ["not_recorded", "no_visit", "not_assessed", "not_classifiable"])
        expect(outcomeTone(c, ordered)).toMatch(/^bg-ink-/);
      const measured = ordered.filter((c) => !outcomeTone(c, ordered).startsWith("bg-ink-"));
      expect(measured.map((c) => outcomeTone(c, ordered))).toEqual(
        OUTCOME_RAMP.slice(0, measured.length),
      );
    }
  });
  it("never red, amber or green, and no hard-coded colour in the dashboard files", () => {
    const tokens = [...OUTCOME_RAMP, ...CARE_BAND_TONES, ...KIDNEY_TONES].join(" ");
    expect(tokens).not.toMatch(/red|amber|green|critical|caution|stable/);
    const root = resolve(__dirname, "../..");
    const walk = (d: string): string[] =>
      readdirSync(join(root, d)).flatMap((n) =>
        statSync(join(root, d, n)).isDirectory() ? walk(join(d, n)) : [join(root, d, n)],
      );
    const files = ["app/ncd/dashboard", "app/ncd/report", "app/ncd/_components/charts"].flatMap(
      walk,
    );
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|oklch\(/);
      expect(src, f).not.toMatch(
        /\b(?:bg|text|fill|stroke)-(?:red|amber|green|status-critical|status-caution)/,
      );
    }
  });
});

describe("F7 layout contract", () => {
  const html = renderToStaticMarkup(
    h(
      DashboardFrame,
      null,
      h(ChartBands, {
        strip: "S",
        conditionsTitle: "Outcomes",
        conditions: h(
          "ul",
          null,
          ...Array.from({ length: 6 }, (_, i) => h("li", { key: i }, `row ${i}`)),
        ),
        cards: "C",
      }),
    ),
  );
  const region = (name: string) =>
    html.match(new RegExp(`data-region="${name}"[^>]*class="([^"]+)"`))?.[1] ??
    html.match(new RegExp(`class="([^"]+)"[^>]*data-region="${name}"`))?.[1] ??
    "";

  it("the frame is fixed to the viewport at xl and never scrolls", () => {
    expect(region("frame")).toContain("xl:h-[calc(100svh");
    expect(region("frame")).toContain("xl:overflow-hidden");
  });
  it("strip and cards keep their height; the conditions card takes the rest and scrolls inside", () => {
    expect(region("strip")).toContain("shrink-0");
    expect(region("cards")).toContain("shrink-0");
    expect(region("conditions")).toMatch(/xl:flex-1/);
    expect(region("conditions")).toContain("min-h-0");
    expect(region("conditions-scroll")).toContain("overflow-y-auto");
    expect(region("conditions-scroll")).toContain("min-h-0");
    expect(html.match(/row \d/g)).toHaveLength(6);
  });
  it("the contract object is what the components use", () => {
    expect(region("frame")).toBe(DASHBOARD_LAYOUT.frame);
    expect(region("strip")).toBe(DASHBOARD_LAYOUT.strip);
  });
});
