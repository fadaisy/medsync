// @vitest-environment jsdom
/** SUPPLIES.md §H1, §H2 and §C on the rendered screens, with axe. */
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import snapshot from "@/app/styleguide/pharmacy-store/world.json";
import { MedicinesGrid } from "@/components/pharmacy/medicines/grid";
import { medicinesFixture } from "@/components/pharmacy/medicines/fixture";
import { StoreStock } from "@/components/pharmacy/store/look-after";
import { pickLabel } from "@/content/pharmacy-supplies";
import { sectionStats } from "@/lib/pharmacy/derive/store/stats";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, scroll: _, ...rest }: Record<string, unknown>) => h("a", { href, ...rest }),
}));
vi.mock("@/app/pharmacy/medicines-actions", () => ({}));
vi.mock("@/components/pharmacy/medicines/use-stock-live", () => ({ useStockLive: () => false }));
vi.mock("@/lib/pharmacy/actions/store/look-after", () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;

const world = (snapshot as unknown as { world: StoreWorld }).world;
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
const render = (el: Parameters<typeof root.render>[0]) => act(() => root.render(el));
const press = (label: RegExp) => {
  const b = [...host.querySelectorAll("button")].find((x) => label.test(x.textContent ?? ""))!;
  act(() => b.click());
};
const clean = async () => {
  const r = await axe.run(host, { rules: { "color-contrast": { enabled: false } } });
  expect(r.violations.map((v) => v.id)).toEqual([]);
};

describe("Medicines and supplies tab (§C, H1)", () => {
  beforeEach(() =>
    render(h(MedicinesGrid, { data: medicinesFixture(), hospitalId: "h", mode: "edit" })),
  );
  it("the switch counts are right and it filters the list and the tiles", async () => {
    const sw = host.querySelector('[role="group"][aria-label="What to show"]')!;
    expect(sw.textContent).toBe("Everything75Medicines47Health supplies21Lab supplies7");
    expect(host.textContent).toContain("47 medicines · 28 supplies");
    expect(host.querySelector("th[aria-sort], th")!.closest("table")!.textContent).toContain("Item");
    press(/^Lab supplies/);
    expect(host.textContent).toContain("0 medicines · 7 supplies");
    expect(host.querySelector("table")!.textContent).toContain("Supply");
    expect(host.textContent).toContain("Malaria");
    expect(host.textContent).not.toContain("Amoxicillin");
    press(/^Medicines/);
    expect(host.textContent).toContain("47 medicines · 0 supplies");
    expect(host.querySelector("table")!.textContent).toContain("Medicine");
    await clean();
  });
  it("Everything is the first view, and search and Section C read as specified", () => {
    expect(host.textContent).toContain("Everything");
    expect(host.textContent).not.toContain("All medicines");
    expect((host.querySelector('input[placeholder]') as HTMLInputElement).placeholder).toBe(
      "Find a medicine, supply or class",
    );
    const sw = host.querySelector('[role="switch"]')!;
    expect(sw.getAttribute("aria-checked")).toBe("false");
  });
});

describe("Main store › Stock health (§D, H2)", () => {
  const Harness = ({ t }: { t: "all" | "lab_supply" | "health_supply" }) =>
    h(StoreStock, { world, filter: null, itemType: t, onItemType: () => {} });
  const mos = (t: "all" | "lab_supply" | "health_supply") => {
    const c = sectionStats(world, "health", { itemType: t }).charts.find((x) => x.key === "mos")!;
    return c.table!.rows.length;
  };
  it("seed counts, and the switch filters the table and the chart together", async () => {
    render(h(Harness, { t: "all" }));
    expect(host.querySelector('[role="group"]')!.textContent).toBe(
      "Everything18Medicines11Health supplies5Lab supplies2",
    );
    expect(host.querySelectorAll("tbody tr")).toHaveLength(18);
    expect(mos("all")).toBe(18);
    expect(host.querySelector("thead")!.textContent).toMatch(/^Item/);
    await clean();
    render(h(Harness, { t: "health_supply" }));
    expect(host.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(mos("health_supply")).toBe(5);
    expect(host.querySelector("h3")!.textContent).toContain("· health supplies");
    expect(host.textContent).toContain("Health supply · sterile");
    render(h(Harness, { t: "lab_supply" }));
    expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(mos("lab_supply")).toBe(2);
    expect(host.textContent).toMatch(/Lab supply · 2–\d+ °C/);
  });
  it("VEN legend lines say items; pickers prefix supplies", () => {
    const ven = sectionStats(world, "health").charts.find((x) => x.key === "ven")!;
    expect(JSON.stringify(ven)).toMatch(/\d+ items?\b/);
    expect(pickLabel("Gloves", "health_supply")).toBe("[Supply] Gloves");
    expect(pickLabel("RDT", "lab_supply")).toBe("[Lab] RDT");
    expect(pickLabel("Amoxicillin", "medicine")).toBe("Amoxicillin");
  });
});
