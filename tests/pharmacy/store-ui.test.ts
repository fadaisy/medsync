// @vitest-environment jsdom
import type { StoreSection } from "@/content/pharmacy-store";
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import snapshot from "@/app/styleguide/pharmacy-store/world.json";
import { ChartGrid, FigureTiles } from "@/components/pharmacy/charts/card";
import { SectionBar } from "@/components/pharmacy/store/shell/nav";
import { SECTION_LABEL, ST } from "@/content/pharmacy-store";
import { openReqs, shareMed } from "@/lib/pharmacy/derive/store/requisitions";
import { navGroups, sectionStats, storeValueByWeek } from "@/lib/pharmacy/derive/store/stats";
import { onHand, storeValue } from "@/lib/pharmacy/derive/store/stock";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, scroll: _, ...rest }: Record<string, unknown>) => h("a", { href, ...rest }),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The fixture is one saved `loadStoreWorld` over the seed. */
const world = (snapshot as unknown as { world: StoreWorld }).world;
const SECTIONS = Object.keys(SECTION_LABEL) as StoreSection[];

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const mount = (el: ReturnType<typeof h>) => act(() => root.render(el));
const key = (k: string, target: EventTarget = document) =>
  act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));

describe("§M13 the charts", () => {
  it.each(SECTIONS)(
    "%s: every chart lists its numbers, every mark has words and a stop",
    async (section) => {
      const { tiles, charts } = sectionStats(world, section);
      mount(h("div", null, h(FigureTiles, { tiles }), h(ChartGrid, { charts })));
      expect(host.querySelectorAll("details").length).toBe(charts.length);
      host
        .querySelectorAll("summary")
        .forEach((s) => expect(s.textContent).toBe(ST.chart.showNumbers));
      charts.forEach((c, i) => {
        const rows = host.querySelectorAll("details")[i]!.querySelectorAll("tbody tr");
        expect(rows.length).toBe(c.table.rows.length);
        c.table.rows.forEach((r, n) =>
          expect([...rows[n]!.querySelectorAll("td")].map((d) => d.textContent)).toEqual(
            r.map(String),
          ),
        );
      });
      host
        .querySelectorAll('[tabindex="0"]')
        .forEach((m) => expect(m.getAttribute("aria-label")).toBeTruthy());
      const a11y = await axe.run(host, { rules: { "color-contrast": { enabled: false } } });
      expect(a11y.violations.map((v) => v.id)).toEqual([]);
    },
  );

  it("the store value line ends at the live value", () => {
    const flow = sectionStats(world, "home").charts.find((c) => c.key === "value")!.plot;
    if (flow.form !== "line") throw new Error("the store value is a line");
    expect(flow.pts.at(-1)!.v).toBe(storeValue(world));
    expect(storeValueByWeek(storeValue(world), world.weeks).at(-1)).toBe(storeValue(world));
  });
});

describe("§M3 share fairly on the seed", () => {
  it("never gives more than the store has", () => {
    const meds = new Set(openReqs(world).flatMap((r) => r.lines.map((l) => l.medId)));
    expect(meds.size).toBeGreaterThan(0);
    for (const m of meds) {
      const given = Object.values(shareMed(world, m, 0).give).reduce((a, n) => a + n, 0);
      expect(given).toBeLessThanOrEqual(onHand(world, m));
    }
  });
});

describe("§M14 the section bar", () => {
  const groups = navGroups(world);
  const button = (i: number) => host.querySelectorAll<HTMLButtonElement>("nav button")[i]!;

  it("opens by click, Esc closes and gives focus back", () => {
    mount(h(SectionBar, { groups, section: "home" }));
    const b = button(0);
    expect(b.getAttribute("aria-expanded")).toBe("false");
    act(() => b.click());
    expect(b.getAttribute("aria-expanded")).toBe("true");
    const items = host.querySelectorAll('[role="menu"] [role="menuitem"]');
    expect(items.length).toBe(groups[0]!.items.length);
    key("Escape");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(b);
  });

  it("a click outside closes it", () => {
    mount(h(SectionBar, { groups, section: "home" }));
    act(() => button(1).click());
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    act(() => void document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });

  it("the group's count is the sum of its sections, with the most serious tone", () => {
    const rank = ["neutral", "info", "warn", "bad"];
    for (const g of groups) {
      expect(g.count).toBe(g.items.reduce((a, i) => a + i.count, 0));
      const counted = g.items.filter((i) => i.count > 0).map((i) => rank.indexOf(i.tone));
      if (counted.length) expect(rank.indexOf(g.tone)).toBe(Math.max(...counted));
    }
  });

  it("the active group reads Group · Section; the phone select carries every section", () => {
    mount(h(SectionBar, { groups, section: "req" }));
    expect(button(0).textContent).toContain(`${groups[0]!.label} · ${SECTION_LABEL.req}`);
    const values = [...host.querySelectorAll("select option")].map((o) => o.getAttribute("value"));
    expect(values).toEqual(["home", ...groups.flatMap((g) => g.items.map((i) => i.key))]);
    expect(host.querySelector("select")!.closest("label")!.className).toContain(
      "min-[761px]:hidden",
    );
    expect(host.querySelector("nav")!.className).toContain("min-[761px]:flex");
  });
});
