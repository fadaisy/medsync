import { describe, expect, it } from "vitest";

import { pharmacyNavFor } from "@/lib/pharmacy/nav";
import { landingFor, placeOf, placesFor } from "@/lib/pharmacy/workspace-v2/places";

const ALL = new Set([
  "pharmacy.view",
  "pharmacy.review",
  "pharmacy.dispense",
  "pharmacy.stock",
  "pharmacy.controlled",
  "pharmacy.manage",
  "pharmacy.store",
] as const);
const on = {
  dispensing: true,
  downtime: true,
  refills: true,
  stores: {
    store: true,
    wardStock: true,
    carts: true,
    recall: true,
    monthEnd: true,
    ordering: true,
  },
  clinical: {
    interactions: true,
    interventionReview: true,
    stewardship: true,
    reactions: true,
    reconciliation: true,
  },
};

describe("Workspace v2 places (D-PW-03)", () => {
  it("every old nav item has one home, and nothing appears the nav would hide", () => {
    const navIds = pharmacyNavFor(ALL, on).map((i) => i.id);
    const { tabs, places } = placesFor({ navIds, dispensing: true, nationalList: true });
    const homed = new Set(tabs.map((t) => t.from).filter(Boolean));
    // Queue lives at Window › Queue; Ready also reads the supplied flag.
    for (const id of navIds) expect(homed.has(id), id).toBe(true);
    expect(places).toEqual(["today", "window", "shelf", "store", "clinical", "setup"]);
  });

  it("the shared catalogue is a Set-up tab only with its own flag (ADR 0456)", () => {
    const navIds = pharmacyNavFor(ALL, on).map((i) => i.id);
    const key = (catalogue: boolean) =>
      placesFor({ navIds, dispensing: true, nationalList: true, catalogue }).tabs.some(
        (t) => t.place === "setup" && t.key === "catalogue",
      );
    expect(key(false)).toBe(false);
    expect(key(true)).toBe(true);
  });

  it("with every Phase 1+ flag off only Window (the Phase 0 queue) and Shelf (emergency doses) remain", () => {
    const view = new Set(["pharmacy.view"] as const);
    const navIds = pharmacyNavFor(view, { dispensing: false, downtime: false }).map((i) => i.id);
    const { places, tabs } = placesFor({ navIds, dispensing: false, nationalList: false });
    expect(places).toEqual(["window", "shelf"]);
    expect(tabs.map((t) => t.key)).toEqual(["queue", "emergency"]);
  });

  it("a store tab follows its own flag and permission", () => {
    const navIds = pharmacyNavFor(new Set(["pharmacy.view"] as const), {
      ...on,
      stores: { ...on.stores, store: false },
    }).map((i) => i.id);
    const keys = placesFor({ navIds, dispensing: true, nationalList: false }).tabs.map(
      (t) => t.key,
    );
    expect(keys).not.toContain("deliveries");
    expect(keys).toContain("wards");
  });

  it("Signed packs follows its page's gate: shown with dispensing alone, hidden when the page is off", () => {
    const navIds = pharmacyNavFor(ALL, { dispensing: true, downtime: false }).map((i) => i.id);
    expect(navIds).not.toContain("packs");
    const shown = placesFor({ navIds, dispensing: true, nationalList: false, packs: true });
    expect(shown.tabs.filter((t) => t.place === "setup").map((t) => t.key)[0]).toBe("packs");
    const all = pharmacyNavFor(ALL, on).map((i) => i.id);
    expect(
      placesFor({ navIds: all, dispensing: true, nationalList: false, packs: false }).tabs.map(
        (t) => t.key,
      ),
    ).not.toContain("packs");
  });

  it("lands the in-charge on Today and everyone else on Window", () => {
    expect(landingFor(["today", "window"], true)).toBe("/pharmacy/today");
    expect(landingFor(["today", "window"], false)).toBe("/pharmacy/window");
    expect(landingFor(["window"], true)).toBe("/pharmacy/window");
  });

  it("old routes light their new place", () => {
    expect(placeOf("/pharmacy")).toBe("window");
    expect(placeOf("/pharmacy/prescriptions/abc/handover")).toBe("window");
    expect(placeOf("/pharmacy/stock/123")).toBe("shelf");
    expect(placeOf("/pharmacy/stock/national-list")).toBe("setup");
    expect(placeOf("/pharmacy/store/packs")).toBe("setup");
    expect(placeOf("/pharmacy/store/deliveries/9")).toBe("store");
    expect(placeOf("/pharmacy/clinical/content")).toBe("setup");
    expect(placeOf("/pharmacy/clinical/reactions/1")).toBe("clinical");
    expect(placeOf("/pharmacy/needs-you")).toBe("needsYou");
  });
});
