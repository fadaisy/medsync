// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlacesTab } from "@/components/pharmacy/setup/places";
import { placesFixture } from "@/components/pharmacy/setup/places/fixture";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/pharmacy/setup/setup-actions", () => ({
  addFridgeAction: vi.fn(),
  addPlaceAction: vi.fn(),
  closePlaceAction: vi.fn(),
  linkSensorAction: vi.fn(),
  moveFridgeAction: vi.fn(),
  proposeRegistryRuleAction: vi.fn(),
  recordReadingAction: vi.fn(),
  reopenPlaceAction: vi.fn(),
  unlinkSensorAction: vi.fn(),
  updatePlaceAction: vi.fn(),
  upsertSupplierAction: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

function show(edit: (v: ReturnType<typeof placesFixture>["view"]) => void, addStore = true) {
  const { view, rules } = placesFixture();
  edit(view);
  const el = document.body.appendChild(document.createElement("div"));
  root = createRoot(el);
  act(() => root!.render(h(PlacesTab, { view, rules, addStore })));
  return [...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input')].map(
    (i) => i.value,
  );
}
const noStore = (v: ReturnType<typeof placesFixture>["view"]) => {
  v.places = v.places.filter((p) => p.kind !== "store");
  v.hub.units = [{ id: "00000000-0000-4000-8000-000000000001", name: "Pharmacy" }];
};

describe("Main store's Add the main store link", () => {
  it("opens Add a place on a store named Main store", () => {
    expect(show(noStore)).toEqual(expect.arrayContaining(["Store", "Main store"]));
  });
  it("stays closed without the link", () => {
    expect(show(noStore, false)).toEqual([]);
  });
  it("stays closed once the hospital has a store", () => {
    expect(
      show(
        (v) =>
          void (v.hub.units = [{ id: "00000000-0000-4000-8000-000000000001", name: "Pharmacy" }]),
      ),
    ).toEqual([]);
  });
  it("stays closed for someone who cannot manage places", () => {
    expect(show((v) => (noStore(v), (v.can.manage = false)))).toEqual([]);
  });
});
