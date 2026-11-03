import type { Ctx, Line, Place, Row } from "@/lib/pharmacy/derive/medicines";
import { describe, expect, it } from "vitest";

import { LASA_PAIRS } from "@/data/pharmacy/lasa";
import {
  condText,
  evalConditions,
  fefoWaste,
  fridgeLines,
  lasaPartners,
  lineIdentityKey,
  lineMetrics,
  newCond,
  placeStatus,
  qcChecks,
  rulesFor,
  sortLines,
  topUpSuggestion,
  validConds,
} from "@/lib/pharmacy/derive/medicines";

const places: Place[] = [
  {
    id: "store",
    name: "Main store",
    short: "Store",
    isStore: true,
    fridge: { code: "CR-01", name: "Main store cold room", temp: 4.6, sensor: true, at: "11:36" },
  },
  { id: "w3", name: "Ward 3 · Medical", short: "Ward 3", isStore: false, fridge: null },
  {
    id: "opd",
    name: "OPD dispensary",
    short: "OPD",
    isStore: false,
    fridge: { code: "RF-02", name: "OPD fridge", temp: 7.8, sensor: false, at: "08:00" },
  },
];

const line = (over: Partial<Line> = {}): Line => ({
  id: "l1",
  name: "Amlodipine 5 mg tablet",
  generic: "Amlodipine",
  strength: "5 mg",
  form: "Tablet",
  route: "Oral",
  unit: "tablet",
  cls: "Antihypertensives",
  group: "Calcium channel blocker",
  sale: "prescription_only",
  ven: "E",
  flags: { controlled: false, high: false, cold: false, freeze: false, cyto: false },
  packs: [100],
  loose: true,
  free: false,
  prices: { cash: 150 },
  brands: [],
  local: false,
  localReason: null,
  nationalControlled: false,
  cost: 100,
  usePerDay: 10,
  lastMovedDays: 1,
  reviewedDays: 10,
  batches: [{ no: "B1", days: 400, qty: 300 }],
  levels: { store: 300, w3: 60 },
  stock: { store: 250, w3: 50 },
  ...over,
});

const ctx = (lines: Line[]): Ctx => ({ places, lines, cashPayerId: "cash", namedLasa: LASA_PAIRS });
const rowOf = (l: Line, lines: Line[] = [l]): Row => {
  const mx = lineMetrics(l, places, "cash");
  const keys = new Map<string, number>();
  for (const x of lines) keys.set(lineIdentityKey(x), (keys.get(lineIdentityKey(x)) ?? 0) + 1);
  return { l, mx, qc: qcChecks(l, mx, ctx(lines), keys, (r) => r ?? "") };
};
const kinds = (l: Line, lines?: Line[]) => rowOf(l, lines).qc.map((q) => q.k);

describe("place status (§1)", () => {
  it("Out at 0, Low under half, Over above the level, OK otherwise, nothing without a level", () => {
    expect(placeStatus(0, 200)).toBe("Out");
    expect(placeStatus(60, 200)).toBe("Low");
    expect(placeStatus(100, 200)).toBe("OK");
    expect(placeStatus(201, 200)).toBe("Over");
    expect(placeStatus(50, null)).toBeNull();
    expect(topUpSuggestion(200, 60)).toBe(140);
    expect(topUpSuggestion(200, 260)).toBe(0);
  });
});

describe("line metrics", () => {
  it("sums over the places with a level and works out % of top-up and days of cover", () => {
    const mx = lineMetrics(line(), places, "cash");
    expect(mx.have).toBe(300);
    expect(mx.lvl).toBe(360);
    expect(mx.pct).toBe(83);
    expect(mx.cover).toBe(30);
    expect(mx.price).toBe(150);
    expect(mx.sev).toBe(3);
    expect(mx.exp).toBe(400);
  });
  it("orders severity Out < Low < Not set < OK < Over", () => {
    expect(lineMetrics(line({ stock: { store: 0 } }), places, "cash").sev).toBe(0);
    expect(lineMetrics(line({ stock: { store: 100, w3: 50 } }), places, "cash").sev).toBe(1);
    expect(lineMetrics(line({ levels: {} }), places, "cash").sev).toBe(2);
    expect(lineMetrics(line({ stock: { store: 400, w3: 70 } }), places, "cash").sev).toBe(4);
  });
});

describe("FEFO waste", () => {
  it("counts what expires before it is used", () => {
    expect(
      fefoWaste(
        [
          { no: "a", days: 10, qty: 200 },
          { no: "b", days: 100, qty: 500 },
        ],
        10,
      ),
    ).toBe(100);
    expect(fefoWaste([{ no: "a", days: 10, qty: 50 }], 10)).toBe(0);
    expect(fefoWaste([{ no: "a", days: 10, qty: 50 }], 0)).toBe(0);
  });
});

describe("quality checks fire on fixtures and clear when fixed (acceptance 7)", () => {
  it("is ready when everything is set", () => expect(kinds(line())).toEqual([]));
  it("missing details", () => {
    expect(
      rowOf(line({ ven: null, levels: {}, prices: {}, packs: [], loose: false })).qc[0]!.t,
    ).toBe("Missing VEN, top-up level, price, pack size");
  });
  it("below cost", () => {
    const r = rowOf(line({ prices: { cash: 120 }, cost: 140 }));
    expect(r.qc.map((q) => q.t)).toContain("Cash price UGX 120 is below the last cost UGX 140");
    expect(kinds(line({ prices: { cash: 150 }, cost: 140 }))).not.toContain("Below cost");
  });
  it("ward above store", () => {
    expect(kinds(line({ levels: { store: 300, w3: 400 } }))).toContain("Ward above store");
  });
  it("free with a price", () => {
    expect(kinds(line({ free: true }))).toContain("Free with a price");
    expect(kinds(line({ free: true, prices: {} }))).not.toContain("Free with a price");
  });
  it("expires before use", () => {
    expect(kinds(line({ batches: [{ no: "a", days: 5, qty: 300 }] }))).toContain(
      "Expires before use",
    );
  });
  it("not moved in 90 days, review due", () => {
    expect(kinds(line({ lastMovedDays: 120 }))).toContain("Not moved in 90 days");
    expect(kinds(line({ reviewedDays: 134 }))).toContain("Review due");
    expect(kinds(line({ reviewedDays: 90 }))).not.toContain("Review due");
  });
  it("no fridge for a cold-chain line at a place without one", () => {
    const cold = line({
      flags: { controlled: false, high: false, cold: true, freeze: false, cyto: false },
    });
    expect(rowOf(cold).qc.find((q) => q.k === "No fridge")!.t).toBe(
      "Kept at a place with no fridge: Ward 3",
    );
    expect(kinds({ ...cold, levels: { store: 300 }, stock: { store: 250 } })).not.toContain(
      "No fridge",
    );
  });
  it("controlled flag missing, duplicate line, local item, top-up cover", () => {
    expect(kinds(line({ nationalControlled: true }))).toContain("Controlled flag missing");
    const a = line();
    const b = line({ id: "l2", name: "Amlodipine 5 mg tablets, pack of 30" });
    expect(kinds(a, [a, b])).toContain("Duplicate line");
    expect(kinds(line({ local: true, localReason: "Donation" }))).toContain("Local item");
    expect(kinds(line({ levels: { store: 1200, w3: 60 } }))).toContain("Top-up cover");
  });
});

describe("conditions, strictly left to right (§7)", () => {
  const vital = rowOf(line({ ven: "V", stock: { store: 100, w3: 50 } }));
  const ok = rowOf(line({ ven: "V" }));
  const ess = rowOf(line({ ven: "E" }));
  const vitalLow = [
    { ...newCond("ven"), val: "Vital" },
    { ...newCond("status"), val: "Low or out" },
  ];
  it("AND narrows", () => {
    expect(evalConditions(vitalLow, vital)).toBe(true);
    expect(evalConditions(vitalLow, ok)).toBe(false);
  });
  it("OR widens what came before", () => {
    const cs = [vitalLow[0]!, { ...vitalLow[1]!, join: "OR" as const }];
    expect(evalConditions(cs, ess)).toBe(false);
    expect(evalConditions(cs, ok)).toBe(true);
  });
  it("routes match a token, numbers compare, empties are dropped", () => {
    const iv = rowOf(line({ route: "IV/IM" }));
    expect(evalConditions([{ ...newCond("route"), val: "IM" }], iv)).toBe(true);
    expect(evalConditions([{ ...newCond("cover"), op: "less than", val: "14" }], ok)).toBe(false);
    expect(
      evalConditions(
        [{ ...newCond("price"), op: "is empty", val: "" }],
        rowOf(line({ prices: {} })),
      ),
    ).toBe(true);
    expect(validConds([{ ...newCond("name"), val: " " }])).toEqual([]);
    expect(condText(vitalLow[1]!, 1)).toBe("AND Stock status any place is Low or out");
  });
});

describe("sort (§3)", () => {
  const a = rowOf(line({ id: "a", name: "Amlodipine 10 mg tablet", strength: "10 mg", ven: "N" }));
  const b = rowOf(line({ id: "b", ven: "V" }));
  const c = rowOf(line({ id: "c", name: "Zinc", generic: "Zinc", ven: null, prices: {} }));
  it("puts strengths of one medicine together, smallest first", () => {
    expect(sortLines([a, b], "name", 1, false).map((r) => r.l.id)).toEqual(["b", "a"]);
  });
  it("VEN V < E < N < Not set", () => {
    expect(sortLines([c, a, b], "ven", 1, false).map((r) => r.l.id)).toEqual(["b", "a", "c"]);
  });
  it("blanks sort last either way", () => {
    expect(sortLines([c, a], "price", -1, false).map((r) => r.l.id)).toEqual(["a", "c"]);
  });
});

describe("LASA, rules, fridges", () => {
  it("pairs the same generic and the named pairs", () => {
    const metro = line({ id: "m1", generic: "Metronidazole", name: "Metronidazole 400 mg tablet" });
    const metf = line({ id: "m2", generic: "Metformin", name: "Metformin 500 mg tablet" });
    const a10 = line({ id: "a10", strength: "10 mg" });
    expect(lasaPartners(metro, [metro, metf], LASA_PAIRS).map((l) => l.id)).toEqual(["m2"]);
    expect(lasaPartners(line(), [line(), a10], LASA_PAIRS).map((l) => l.id)).toEqual(["a10"]);
  });
  it("a cytotoxic line gets the cytotoxic group, shared by n", () => {
    const f = { controlled: false, high: true, cold: false, freeze: false, cyto: true };
    const ids = rulesFor(f, "Antineoplastics (anticancer)", "Cyclophosphamide", [
      { flags: f, cls: null, generic: "x" },
    ]);
    expect(ids.map((g) => g.group.id)).toEqual(["all", "hr", "cyto"]);
    expect(ids.find((g) => g.group.id === "cyto")!.shared).toBe(1);
    expect(rulesFor(f, null, "Paracetamol", []).map((g) => g.group.id)).toContain("rx");
  });
  it("names each place's fridge and temperature", () => {
    const w = {
      noFridge: "no fridge here",
      moveIt: "Move it",
      live: (t: string, at: string | null) => `${t} live ${at}`,
      typed: (t: string, at: string | null) => `${t} typed ${at}`,
      noReading: "none",
    };
    const fl = fridgeLines({ stock: { store: 5, w3: 0, opd: 1 }, levels: { w3: 10 } }, places, w);
    expect(fl.map((x) => [x.where, x.tone])).toEqual([
      ["Store", "ok"],
      ["Ward 3", "bad"],
      ["OPD", "near"],
    ]);
    expect(fl[0]!.temp).toBe("4.6 live 11:36");
  });
});
