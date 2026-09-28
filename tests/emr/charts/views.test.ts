import type { FluidBalanceBody, MonitoringPayload } from "@/lib/emr/charts/payload";
import type { ReactElement } from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { monitoringFixture } from "@/app/styleguide/monitoring/_lib/fixture";
import { FluidBalanceGraph } from "@/components/emr/chart/graphs/fluid-balance-graph";
import { FluidBalanceTable } from "@/components/emr/chart/graphs/fluid-balance-table";
import { UrineOutputGraph } from "@/components/emr/chart/graphs/urine-output-graph";
import { MonitoringChartsView } from "@/components/emr/chart/monitoring/monitoring-charts-view";
import { EMPTY_GRAPH_TEXT, NO_WEIGHT_TEXT } from "@/lib/emr/charts/payload";

/**
 * The monitoring views (ADR 0189, MONITORING-CHARTS.md §4) rendered to static markup from the
 * styleguide fixture: no DOM, no database.
 */

const html = (el: ReactElement) => renderToStaticMarkup(el);
const text = (m: string) =>
  m
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const view = (p: MonitoringPayload, defaultOpen: "all" | "none" | "first" = "all") =>
  html(h(MonitoringChartsView, { payload: p, defaultOpen }));
const fluidOf = (p: MonitoringPayload) =>
  p.charts.find((c) => c.kind === "fluid_balance")!.body as FluidBalanceBody;
const svgs = (m: string) =>
  [...m.matchAll(/<svg role="img" aria-label="([^"]*)"/g)].map((x) => x[1]!);

describe("the chart cards", () => {
  const m = view(monitoringFixture(), "none");
  it("each card names the chart, what opened it and its frequency, behind a disclosure", () => {
    const t = text(m);
    for (const words of [
      "Observations and NEWS2",
      "Opened by: Hourly observations in the plan",
      "Fluid balance",
      "Opened by: Ringer's lactate 1000 mL over 8 h",
      "An IV fluid prescription placed",
      "Medicine administration record",
      "6-hourly",
    ])
      expect(t).toContain(words);
    expect(m.match(/aria-expanded="false"/g)).toHaveLength(5);
    expect(m.match(/<div id="[^"]+-body" hidden=""/g)).toHaveLength(5);
  });
  it("the chevron turns in 150 ms on the design system's curve, and not at all with reduced motion", () => {
    expect(m).toContain(
      "ease-expo-out transition-transform duration-150 motion-reduce:transition-none",
    );
  });
  it("an empty visit says the plan opens the charts", () => {
    const empty = view({ ...monitoringFixture(), charts: [] });
    expect(text(empty)).toBe("No monitoring charts for this visit. The plan opens them.");
  });
});

describe("the graphs", () => {
  const m = view(monitoringFixture());
  const labels = svgs(m);

  it("every graph is an image with a sentence: the latest value and the trend", () => {
    expect(labels.length).toBeGreaterThanOrEqual(7);
    const find = (s: string) => labels.find((l) => l.startsWith(s))!;
    expect(find("NEWS2 over time")).toContain("latest 1 at 06:00, down from 5 at 23:00");
    expect(find("Fluid in and out by hour")).toContain("Running balance latest +538 mL at 07:00");
    expect(find("Fluid in and out by hour")).toContain("1 hour with no entry");
    expect(find("Urine output per hour")).toContain("29 mL/h (0.5 mL/kg/h × 58 kg)");
    expect(find("Urine output per hour")).toContain("hours below it are not flagged");
    // The temperature graph (the NEWS2 strip for temperature has the same opening words).
    const temperature = labels.find(
      (l) => l.startsWith("Temperature:") && l.includes("Reference"),
    )!;
    expect(temperature).toContain(
      "latest 37.6 °C at 06:00, down from 38.4 °C at 23:00. 1 core reading",
    );
    expect(find("Capillary glucose")).toContain(
      "latest 4.8 mmol/L at 07:10, down from 7.2 mmol/L at 23:10",
    );
  });

  it("the x axis is clock time in Geist Mono", () => {
    expect(m).toMatch(
      /<text[^>]*class="fill-muted-foreground font-mono text-kbd"[^>]*>00:00<\/text>/,
    );
  });

  it("reference lines are dashed amber and labelled; the NEWS2 7+ band is the only red, with its words", () => {
    const t = text(m);
    expect(t).toContain("KDIGO oliguria threshold, to verify · 29 mL/h");
    expect(t).toContain("35 °C, to verify");
    expect(t).toContain("4.0 mmol/L (JBDS 2023)");
    expect(m.match(/stroke-status-caution-fg/g)!.length).toBeGreaterThanOrEqual(3);
    const red = [...m.matchAll(/class="[^"]*status-critical[^"]*"/g)].map((x) => x[0]);
    expect(red).toEqual([
      'class="fill-status-critical-bg"',
      'class="text-caption fill-status-critical-fg-aa"',
    ]);
    expect(m).toMatch(
      /fill-status-critical-fg-aa"><tspan [^>]*>NEWS2 ≥ 7: emergency response<\/tspan><\/text>/,
    );
  });

  it("the clerking value is an ink dot and nursing entries teal dots, named in the legend", () => {
    expect(m).toContain('class="fill-foreground stroke-card"');
    expect(m).toContain('class="fill-teal-icon stroke-card"');
    expect(text(m)).toContain("At clerking");
    expect(text(m)).toContain("Nursing entry");
  });

  it("a core temperature is a square", () => {
    expect(m).toMatch(
      /<rect x="[^"]+" y="[^"]+" width="8" height="8" class="fill-teal-icon stroke-card"/,
    );
  });

  it("nothing animates in", () => {
    const graphs = m.slice(m.indexOf("<figure"));
    expect(graphs).not.toMatch(/animate-|<animate|reveal|stagger|scale-in/);
  });
});

describe("the fluid balance table", () => {
  const body = fluidOf(monitoringFixture());
  const m = html(h(FluidBalanceTable, { body }));
  const rowFor = (hhmm: string) => {
    const i = m.indexOf(`${hhmm} to `);
    return m.slice(i, m.indexOf("</tr>", i));
  };

  it("a blank cell is an en dash read as not recorded, never 0", () => {
    const gap = rowFor("03:00");
    expect(gap).toContain('<span aria-hidden="true" class="text-muted-foreground">–</span>');
    expect(gap).toContain("no entry this hour");
    expect(text(gap)).not.toMatch(/\b0\b/);
    expect(text(rowFor("00:00"))).toContain("not recorded"); // no oral at 00:00
  });

  it("urine not measured is written out", () => {
    expect(text(rowFor("02:00"))).toContain("Not measured");
  });

  it("IV in has a column per fluid with its planned rate and drops per minute", () => {
    expect(text(m)).toContain(
      "IV in: Ringer's lactate 1000 mL over 8 h Plan 125 mL/h · 42 drops/min",
    );
  });

  it("the running balance carries its sign, and the hour under way says so", () => {
    expect(text(rowFor("06:00"))).toContain("+538");
    expect(rowFor("07:00")).toContain("hour under way");
  });

  it("the 24-hour summary: total in, total out, net, hours below the reference", () => {
    const t = text(m);
    expect(t).toContain("Total in 850 mL");
    expect(t).toContain("Total out 312 mL");
    expect(t).toContain("Net +538 mL");
    expect(t).toContain("1 hour with measured urine below 29 mL/h (a reference line, not flagged)");
  });
});

describe("empty and no-weight states", () => {
  it("an empty graph says so in words and draws no line at zero", () => {
    const p = monitoringFixture("empty");
    const m = view(p);
    expect(text(m).split(EMPTY_GRAPH_TEXT).length - 1).toBeGreaterThanOrEqual(5);
    expect(svgs(m)).toEqual([]);
    const b = fluidOf(p);
    expect(html(h(FluidBalanceGraph, { body: b }))).not.toContain("<svg");
  });

  it("with no weight there is no reference line, and the reason is given", () => {
    const b = fluidOf(monitoringFixture("noweight"));
    const m = html(h(UrineOutputGraph, { body: b, weightKg: null }));
    expect(m).not.toContain("KDIGO");
    expect(m).not.toContain("stroke-status-caution-fg");
    expect(text(m)).toContain(NO_WEIGHT_TEXT);
    expect(text(html(h(FluidBalanceTable, { body: b })))).toContain(
      "Not worked out: no weight in the vitals.",
    );
  });

  it("hours below the reference are drawn like any other hour", () => {
    const b = fluidOf(monitoringFixture());
    const m = html(h(UrineOutputGraph, { body: b, weightKg: 58 }));
    const bars = [...m.matchAll(/<rect [^>]*class="([^"]+)"/g)].map((x) => x[1]);
    expect(new Set(bars)).toEqual(new Set(["fill-ink-400"]));
  });
});

describe("the MAR grid", () => {
  it("every cell has its words in a square tag, no red, amber or green", () => {
    const m = view(monitoringFixture());
    const mar = m.slice(m.indexOf("Medicine administration record: each prescription"));
    const t = text(mar);
    for (const w of [
      "Running",
      "From 23:50",
      "Given 23:55",
      "Given 23:58",
      "Omitted (declined when woken)",
      "Awaiting co-sign",
      "Delayed",
      "Due",
    ])
      expect(t).toContain(w);
    expect(mar).toContain('data-slot="tag"');
    expect(mar).not.toMatch(
      /status-(?:critical|caution|stable)|(?:bg|text)-(?:red|amber|green|rose)-/,
    );
  });
});
