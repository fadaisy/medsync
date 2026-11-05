import type { Flags, Line, Place } from "@/lib/pharmacy/derive/medicines";
import type { MedicinesPayload } from "@/lib/pharmacy/medicines/read";

import lines from "./fixture-lines.json";

/** The prototype's list (47 medicines, 21 health and 7 lab supplies), for the fixture route and UI tests. Not real stock. */
const PLACES: (Place & { key: string })[] = [
  ["store", "Main store", "Store"],
  ["opd", "OPD dispensary", "OPD"],
  ["w3", "Ward 3 · Medical", "W3"],
  ["mat", "Maternity", "Mat"],
  ["paed", "Paediatrics", "Paed"],
  ["epi", "EPI clinic", "EPI"],
].map(([key, name, short]) => ({
  key: key!,
  id: key!,
  name: name!,
  short: short!,
  isStore: key === "store",
  fridge: null,
}));
const has = (fl: string, c: string) => fl.includes(c);

export function medicinesFixture(over: Partial<MedicinesPayload> = {}): MedicinesPayload {
  return {
    ok: true,
    today: "2026-11-05",
    lines: lines.map((r) => {
      const flags: Flags = {
        controlled: has(r.fl, "c"),
        high: has(r.fl, "h"),
        cold: has(r.fl, "k"),
        freeze: has(r.fl, "f"),
        cyto: has(r.fl, "y"),
        sterile: has(r.fl, "s"),
        kit: has(r.fl, "t"),
      };
      const level = (p: string) => r.use * (p === "store" ? 60 : 14);
      const noExpiry = r.key === "sbox";
      const line: Line = {
        id: r.key,
        name: r.name,
        generic: r.generic,
        strength: r.strength || null,
        form: r.form || null,
        route: r.route,
        unit: r.unit,
        cls: r.cls,
        group: r.level ? `EMHSLU 2023 · from ${r.level}` : null,
        sale: r.section ? "supply" : flags.controlled ? "controlled" : "prescription_only",
        ven: r.ven as Line["ven"],
        flags,
        itemType: r.section === "D" ? "lab_supply" : r.section === "B" ? "health_supply" : "medicine",
        noExpiry,
        packs: r.packs,
        loose: r.loose,
        free: has(r.fl, "z"),
        prices: {},
        brands: [],
        local: false,
        localReason: null,
        nationalControlled: flags.controlled,
        cost: null,
        usePerDay: r.use,
        lastMovedDays: 3,
        reviewedDays: 30,
        batches: [{ no: `${r.key.toUpperCase()}-1`, days: noExpiry ? 26_000 : 400, qty: r.use * 30 }],
        batchRows: [],
        levels: Object.fromEntries(r.places.map((p) => [p, level(p)])),
        stock: Object.fromEntries(r.places.map((p) => [p, Math.round(level(p) * 0.7)])),
      };
      return line;
    }),
    places: PLACES,
    storeId: "store",
    payers: [],
    cashPayerId: null,
    sectionC: false,
    rulePct: null,
    rules: [],
    proposals: [],
    views: [],
    requests: {},
    orders: {},
    lastMove: null,
    starters: {},
    can: {
      edit: true,
      levels: true,
      review: true,
      propose: true,
      signInCharge: true,
      signSecond: true,
      request: true,
    },
    ...over,
  };
}
