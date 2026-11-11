/** RECEIVE §D, §E, §G: GS1, EAN-13, and every branch of the line checks at their edges. */
import type {
  LineWorld,
  ReceiveDelivery,
  ReceiveLine,
  ReceiveMed,
  ReceiveOrder,
  ReceiveRules,
} from "@/lib/pharmacy/derive/receive";
import type { DeviceDelivery } from "@/lib/pharmacy/receive/offline";
import { describe, expect, it } from "vitest";

import { checkDigit, ean13Bits, inHouseCode, labelDigits } from "@/lib/pharmacy/barcode";
import {
  addDaysIso,
  claimLines,
  coldTimer,
  daysLeft,
  deliveryProblems,
  figures,
  lineInfo,
  matchRows,
  normExp,
  orderDue,
  orderState,
  stages,
  supplierStats,
} from "@/lib/pharmacy/derive/receive";
import { parseCode } from "@/lib/pharmacy/gs1";
import { syncQueue } from "@/lib/pharmacy/receive/offline";

const rules: ReceiveRules = {
  look: 180,
  priceTol: 5,
  secondCheck: 2_000_000,
  invPct: 1,
  invUgx: 1000,
  targetStock: 120,
  targetShelf: 60,
  targetMatched: 95,
  tempLow: 2,
  tempHigh: 8,
  coldMins: 30,
};
const today = "2026-11-04";
const med = (over: Partial<ReceiveMed> = {}): ReceiveMed => ({
  id: "m1",
  name: "Amoxicillin 500 mg",
  unit: "capsule",
  per: 100,
  cost: 1000,
  price: 0,
  hand: 0,
  shelf: "A-03",
  gtin: "",
  cold: false,
  controlled: false,
  vaccine: false,
  regLapsed: false,
  local: false,
  itemType: "medicine" as const,
  sterile: false,
  kit: false,
  noExpiry: false,
  ownCode: false,
  short: null,
  ...over,
});
const line = (over: Partial<ReceiveLine> = {}): ReceiveLine => ({
  id: "l1",
  no: 1,
  medId: "m1",
  source: "typed",
  orderLineId: null,
  batch: "B1",
  exp: "2028-06",
  packs: "10",
  per: "100",
  notePacks: "",
  cost: "",
  temp: "",
  decision: "",
  approvedBy: "",
  approvalAsked: false,
  regReason: "",
  regNote: "",
  seal: "" as const,
  kitTemp: "" as const,
  rejOn: false,
  rejPacks: "",
  rejWhy: "",
  rejFate: "driver",
  vvm: "",
  freeze: "",
  rank: 0,
  owedFrozen: null,
  witnessName: "",
  ...over,
});
const delivery = (lines: ReceiveLine[], over: Partial<ReceiveDelivery> = {}): ReceiveDelivery => ({
  id: "d1",
  kind: "supplier",
  supplierId: "s1",
  source: "NMS",
  from: "",
  fromPlace: null,
  orderId: null,
  note: "DN-1",
  place: "p1",
  arrived: "2026-11-04 09:00",
  deliverer: "",
  vehicle: "",
  blind: false,
  invoice: "",
  invoiceTotal: "",
  state: "counting",
  grn: "",
  finished: "",
  shelvedAt: "",
  abandonReason: "",
  secondCheck: "",
  claimRef: "",
  lines,
  put: [],
  photos: [],
  conflict: "",
  ...over,
});
const world = (m: ReceiveMed = med(), o: Partial<LineWorld> = {}): LineWorld => ({
  meds: [m],
  orders: [],
  recalls: [],
  rules,
  today,
  ...o,
});
const info = (
  l: ReceiveLine,
  m?: ReceiveMed,
  o?: Partial<LineWorld>,
  d?: Partial<ReceiveDelivery>,
) => lineInfo(l, delivery([l], d), world(m, o));
const words = (i: { words: { word: string }[] }) => i.words.map((x) => x.word);

describe("gs1", () => {
  it("reads the bracketed form", () => {
    expect(parseCode("(01)08901234567890(17)280630(10)AMX2301(21)SN1")).toEqual({
      gtin: "08901234567890",
      exp: "2028-06-30",
      batch: "AMX2301",
      serial: "SN1",
    });
  });
  it("DD 00 means the month only", () =>
    expect(parseCode("(01)08901234567890(17)280600")?.exp).toBe("2028-06"));
  it("reads the raw form with GS", () => {
    expect(parseCode("0108901234567890172806301 0AB".replace(" ", ""))?.exp).toBe("2028-06-30");
    expect(parseCode("010890123456789010AB1\u001d21S9")).toEqual({
      gtin: "08901234567890",
      exp: "",
      batch: "AB1",
      serial: "S9",
    });
  });
  it("pads plain codes to 14", () => {
    expect(parseCode("12345678")?.gtin).toBe("00000012345678");
    expect(parseCode("12345678901234")?.gtin).toBe("12345678901234");
  });
  it("text is not a code", () => {
    expect(parseCode("amoxicillin")).toBeNull();
    expect(parseCode("1234567")).toBeNull();
  });
});

/** A decoder written from the standard, so the bars are checked by reading them back. */
function decodeEan13(bits: string): string {
  const L = [
    "0001101",
    "0011001",
    "0010011",
    "0111101",
    "0100011",
    "0110001",
    "0101111",
    "0111011",
    "0110111",
    "0001011",
  ];
  const G = L.map((x) =>
    [...x]
      .reverse()
      .map((c) => (c === "0" ? "1" : "0"))
      .join(""),
  );
  const R = L.map((x) => [...x].map((c) => (c === "0" ? "1" : "0")).join(""));
  const FIRST = [
    "LLLLLL",
    "LLGLGG",
    "LLGGLG",
    "LLGGGL",
    "LGLLGG",
    "LGGLLG",
    "LGGGLL",
    "LGLGLG",
    "LGLGGL",
    "LGGLGL",
  ];
  expect(bits).toHaveLength(95);
  expect(bits.slice(0, 3)).toBe("101");
  expect(bits.slice(45, 50)).toBe("01010");
  expect(bits.slice(92)).toBe("101");
  let par = "",
    left = "";
  for (let i = 0; i < 6; i++) {
    const c = bits.slice(3 + i * 7, 10 + i * 7);
    const l = L.indexOf(c);
    par += l >= 0 ? "L" : "G";
    left += l >= 0 ? l : G.indexOf(c);
  }
  let right = "";
  for (let i = 0; i < 6; i++) right += R.indexOf(bits.slice(50 + i * 7, 57 + i * 7));
  return `${FIRST.indexOf(par)}${left}${right}`;
}

describe("barcode", () => {
  it("check digits against known codes", () => {
    expect(checkDigit("400638133393")).toBe("1");
    expect(checkDigit("978020137962")).toBe("4");
    expect(checkDigit("590123412345")).toBe("7");
  });
  it.each(["4006381333931", "9780201379624", "5901234123457", "0012345678905"])(
    "bars decode to %s",
    (code) => {
      expect(decodeEan13(ean13Bits(code))).toBe(code);
    },
  );
  it("in-house codes are 200 + nine + check, and decode", () => {
    const c = inHouseCode(12);
    expect(c).toMatch(/^200000000012\d$/);
    expect(c[12]).toBe(checkDigit(c.slice(0, 12)));
    expect(decodeEan13(ean13Bits(c))).toBe(c);
  });
  it("label digits drop the GTIN-14 zero", () => {
    expect(labelDigits("04006381333931")).toBe("4006381333931");
    expect(labelDigits("12345678")).toBeNull();
  });
});

describe("expiry", () => {
  it("accepts the four formats and nothing else", () => {
    expect(normExp("2028-06")).toBe("2028-06");
    expect(normExp("2028-06-30")).toBe("2028-06-30");
    expect(normExp("06/2028")).toBe("2028-06");
    expect(normExp("30/06/2028")).toBe("2028-06-30");
    for (const bad of ["June 2028", "2028/06", "13/2028", "2028-13", ""])
      expect(normExp(bad)).toBeNull();
  });
  it("a month-only expiry runs to the month's end", () => {
    expect(daysLeft("2026-11", today)).toBe(26);
    expect(daysLeft("2026-11-03", today)).toBe(-1);
    expect(daysLeft("nonsense", today)).toBeNull();
  });
  it("short-dated is under the rule: 179 yes, 180 no", () => {
    expect(info(line({ exp: addDaysIso(today, 179) })).short).toBe(true);
    expect(info(line({ exp: addDaysIso(today, 180) })).short).toBe(false);
    expect(words(info(line({ exp: addDaysIso(today, 179) })))).toContain(
      "Expires in under 180 days",
    );
  });
  it("the window follows the rule", () => {
    const l = line({ exp: addDaysIso(today, 100) });
    expect(info(l, undefined, { rules: { ...rules, look: 90 } }).short).toBe(false);
  });
});

describe("lineInfo", () => {
  it("a clean line matches and has no problems", () => {
    const i = info(line());
    expect(words(i)).toEqual(["Matches"]);
    expect(i.problems).toEqual([]);
    expect(i.unitsText).toBe("10 × 100 = 1,000 capsules");
  });
  it("uncounted: only a free line is a problem", () => {
    expect(info(line({ packs: "" })).problems).toEqual(["Line 1: give how many packs."]);
    expect(info(line({ packs: "", orderLineId: "x" })).problems).toEqual([]);
  });
  it("needs per pack, batch and expiry", () => {
    const p = info(line({ per: "", batch: " ", exp: "" })).problems.join();
    expect(p).toContain("how many capsules in each pack");
    expect(p).toContain("batch number");
    expect(p).toContain("expiry from the pack");
    expect(info(line({ exp: "soon" })).problems[0]).toContain("write the expiry as");
  });
  it("expired blocks until rejected", () => {
    const l = line({ exp: "2026-11-03" });
    expect(info(l).problems.join()).toContain("has expired");
    expect(
      info({ ...l, rejOn: true, rejPacks: "10", rejWhy: "expired", rejFate: "quarantine" })
        .problems,
    ).toEqual([]);
  });
  it("note differences", () => {
    expect(words(info(line({ notePacks: "12" })))).toContain("2 packs fewer than the note");
    expect(words(info(line({ notePacks: "9" })))).toContain("1 pack more than the note");
  });
  it("short of the order: plain while counting, caution after", () => {
    const o: ReceiveOrder = {
      id: "o1",
      ref: "PO-1",
      supplierId: "s1",
      supplier: "NMS",
      place: "p1",
      leadDays: 7,
      sentOn: "2026-11-01",
      chasedOn: "",
      editedOn: "",
      state: "sent",
      lines: [{ id: "ol1", medId: "m1", packs: 25, received: 5, price: 0 }],
    };
    const l = line({ orderLineId: "ol1" });
    const counting = info(l, undefined, { orders: [o] }, { orderId: "o1" });
    expect(counting.words[0]).toEqual({ word: "10 packs left on the order", caution: false });
    const after = info(l, undefined, { orders: [o] }, { orderId: "o1", state: "received" });
    expect(after.words[0]).toEqual({ word: "10 packs short of the order", caution: true });
    expect(words(info(line(), undefined, { orders: [o] }, { orderId: "o1" }))).toContain(
      "Not on the order",
    );
  });
  it("price tolerance: 5 % passes, 6 % flags, order wins over usual", () => {
    expect(info(line({ cost: "1050" })).priceDiff).toBeNull();
    expect(info(line({ cost: "950" })).priceDiff).toBeNull();
    expect(info(line({ cost: "1060" })).priceDiff).toEqual({ pct: 6, ref: 1000, fromOrder: false });
    expect(words(info(line({ cost: "940" })))).toContain("Price 6% below the usual price");
    expect(
      info(line({ cost: "1060" }), undefined, undefined, { kind: "donation" }).priceDiff,
    ).toBeNull();
  });
  it("cold: needs the temperature, in range to the rule", () => {
    const m = med({ cold: true });
    expect(info(line(), m).problems.join()).toContain("temperature on arrival");
    expect(info(line({ temp: "2" }), m).problems).toEqual([]);
    expect(info(line({ temp: "8" }), m).problems).toEqual([]);
    expect(info(line({ temp: "1.9" }), m).tempBad).toBe(true);
    expect(info(line({ temp: "8.1" }), m).problems.join()).toContain("cold chain was broken");
    expect(words(info(line({ temp: "9" }), m))).toContain("Cold chain broken");
  });
  it("short-dated: decide, then the in-charge approves; reject goes to the driver", () => {
    const l = line({ exp: addDaysIso(today, 30) });
    expect(info(l).problems.join()).toContain("short-dated. Decide.");
    expect(info({ ...l, decision: "accept" }).problems.join()).toContain("in-charge's approval");
    expect(info({ ...l, decision: "accept_tell", approvedBy: "x" }).problems).toEqual([]);
    const r = info({ ...l, decision: "reject" });
    expect([r.acc, r.rej, r.why, r.fate, r.problems.length]).toEqual([
      0,
      10,
      "short_dated",
      "driver",
      0,
    ]);
  });
  it("recall matches the batch, or every batch when the notice names none", () => {
    const recalls = [{ medId: "m1", batch: "AMX1", notice: "N-1", why: "", from: "NDA" }];
    expect(info(line({ batch: "amx1 " }), undefined, { recalls }).problems.join()).toContain(
      "is on recall (N-1)",
    );
    expect(info(line({ batch: "OTHER" }), undefined, { recalls }).rc).toBeNull();
    expect(info(line(), undefined, { recalls: [{ ...recalls[0]!, batch: "" }] }).rc).not.toBeNull();
    expect(
      info(
        line({
          batch: "AMX1",
          rejOn: true,
          rejPacks: "10",
          rejWhy: "recall",
          rejFate: "quarantine",
        }),
        undefined,
        { recalls },
      ).problems,
    ).toEqual([]);
  });
  it("vaccine: VVM and freeze both required, 3–4 and tripped block", () => {
    const m = med({ vaccine: true });
    const p = info(line(), m).problems.join();
    expect(p).toContain("VVM) stage");
    expect(p).toContain("freeze indicator");
    expect(info(line({ vvm: "2", freeze: "ok" }), m).problems).toEqual([]);
    expect(info(line({ vvm: "3", freeze: "ok" }), m).problems.join()).toContain("discard point");
    expect(words(info(line({ vvm: "4", freeze: "ok" }), m))).toContain("VVM stage 4: do not use");
    expect(info(line({ vvm: "1", freeze: "tripped" }), m).problems.join()).toContain("shake test");
  });
  it("registration lapsed needs a reason, and text for other", () => {
    const m = med({ regLapsed: true });
    expect(info(line(), m).problems.join()).toContain("Say why it is received");
    expect(info(line({ regReason: "other" }), m).problems.join()).toContain("in a few words");
    expect(info(line({ regReason: "donation" }), m).problems).toEqual([]);
  });
  it("rejections: not more than counted, and a reason", () => {
    expect(
      info(line({ rejOn: true, rejPacks: "11", rejWhy: "damaged" })).problems.join(),
    ).toContain("more are rejected");
    expect(info(line({ rejOn: true, rejPacks: "1" })).problems.join()).toContain(
      "say why it was rejected",
    );
    expect(words(info(line({ rejOn: true, rejPacks: "1", rejWhy: "damaged" })))).toContain(
      "Damaged",
    );
  });
});

describe("the delivery", () => {
  it("finishing needs no problems and one counted line", () => {
    const w = world();
    expect(deliveryProblems(delivery([line({ packs: "", orderLineId: "x" })]), w).blocked).toBe(
      true,
    );
    expect(deliveryProblems(delivery([line()]), w).blocked).toBe(false);
  });
  it("invoice tolerance: the larger of 1 % and UGX 1,000", () => {
    const w = world(med({ cost: 0 }));
    const d = (t: string, cost = "100000") =>
      delivery([line({ cost, packs: "10" })], { invoiceTotal: t });
    const inv = (x: ReceiveDelivery) => matchRows(x, w, rules).at(-1)!;
    expect(inv(d("1010000")).cls).toBe("ok");
    expect(inv(d("1010001"))).toEqual({
      cls: "warn",
      text: "Invoice is UGX 10,001 more than what was counted",
    });
    expect(inv(d("989999")).text).toContain("less");
    expect(inv(d("11000", "1000")).cls).toBe("ok");
    expect(inv(d("11001", "1000")).cls).toBe("warn");
    expect(inv(delivery([line()])).text).toBe("No invoice entered yet");
  });
  it("claims: short, rejected except short-dated, overcharged", () => {
    const w = world();
    const short = line({ notePacks: "12", cost: "1000" });
    const rej = line({ id: "l2", cost: "1000", rejOn: true, rejPacks: "2", rejWhy: "damaged" });
    const sd = line({ id: "l3", exp: addDaysIso(today, 30), decision: "reject", cost: "1000" });
    const over = line({ id: "l4", cost: "1100" });
    const lines = deliveryProblems(delivery([short, rej, sd, over]), w).infos;
    expect(claimLines(lines)).toEqual([
      { medId: "m1", kind: "Short on the note", packs: 2, value: 2000 },
      { medId: "m1", kind: "Damaged", packs: 2, value: 2000 },
      { medId: "m1", kind: "Charged above the order price", packs: 10, value: 1000 },
    ]);
  });
  it("due date crosses months and years, and tags follow", () => {
    expect(orderDue({ sentOn: "2026-10-20", leadDays: 23, state: "sent" }, today).dueIso).toBe(
      "2026-11-12",
    );
    expect(
      orderDue({ sentOn: "2026-12-20", leadDays: 23, state: "sent" }, "2026-12-21").dueIso,
    ).toBe("2027-01-12");
    expect(orderDue({ sentOn: "2026-11-01", leadDays: 6, state: "sent" }, today)).toMatchObject({
      text: "Due in 3 days",
      tone: "info",
      late: false,
    });
    expect(orderDue({ sentOn: "2026-11-01", leadDays: 3, state: "part" }, today)).toMatchObject({
      text: "Due today",
      tone: "warn",
      late: true,
    });
    expect(orderDue({ sentOn: "2026-10-25", leadDays: 7, state: "sent" }, today)).toMatchObject({
      text: "3 days late",
      tone: "bad",
      late: true,
    });
    expect(orderDue({ sentOn: "2026-10-25", leadDays: 7, state: "closed" }, today)).toMatchObject({
      text: "",
      late: false,
    });
  });
  it("cold timer: amber past two-thirds, red past the limit", () => {
    expect(coldTimer(20, 30).tone).toBe("");
    expect(coldTimer(21, 30).tone).toBe("warn");
    expect(coldTimer(30, 30).tone).toBe("warn");
    expect(coldTimer(31, 30)).toMatchObject({ tone: "bad" });
    expect(coldTimer(31, 30).text).toContain("over the 30 min limit");
    expect(coldTimer(12, 30).text).toBe(
      "Cold lines arrived 12 min ago. Into the fridge within 30 min (Rules › Cold chain).",
    );
  });
  it("order state", () => {
    expect(orderState([{ packs: 5, received: 0 }])).toBe("sent");
    expect(orderState([{ packs: 5, received: 1 }])).toBe("part");
    expect(orderState([{ packs: 5, received: 5 }])).toBe("closed");
  });
});

describe("figures", () => {
  const row = (n: number, stock: number, shelf: number, matched: number) => ({
    note: `DN-${n}`,
    supplierId: "s1",
    arrived: "2026-11-01 08:00",
    finished: `2026-11-01 ${String(8 + Math.floor(stock / 60)).padStart(2, "0")}:${String(stock % 60).padStart(2, "0")}`,
    shelvedAt: `2026-11-02 ${String(8 + Math.floor(shelf / 60)).padStart(2, "0")}:${String(shelf % 60).padStart(2, "0")}`,
    lines: 10,
    matched,
  });
  it("median, target and delta", () => {
    const f = figures([row(1, 100, 0, 10), row(2, 200, 0, 9), row(3, 72, 0, 10)], [], rules);
    expect(f[0]).toMatchObject({
      label: "Arrival to in stock",
      value: "1 h 40 min",
      onTarget: true,
      sub: "Median · Down 2 h 8 min on the delivery before",
      subTone: "ok",
    });
    expect(f[2]).toMatchObject({
      value: "100%",
      onTarget: true,
      sub: "Last delivery · Up 10 points on the delivery before",
    });
    expect(figures([row(1, 121, 0, 9)], [], rules)[0]!.onTarget).toBe(false);
    expect(figures([row(1, 120, 0, 9)], [], rules)[0]!.onTarget).toBe(true);
  });
  it("the chart keeps the last 8, and the target follows the rule", () => {
    const f = figures(
      Array.from({ length: 10 }, (_, i) => row(i, 60, 0, 10)),
      [],
      { ...rules, targetStock: 45 },
    );
    const c = f[0]!.chart!;
    expect(c.bars).toHaveLength(8);
    expect(c.refLabel).toBe("Target 45 min");
    expect(c.xFirst).toBe("8 deliveries ago");
    expect(c.bars[7]).toMatchObject({ last: true, good: false, tip: "DN-9: 1 h · missed target" });
  });
  it("claims open adds draft and sent only, oldest last", () => {
    const claim = (id: string, state: "draft" | "sent" | "credit", total: number) => ({
      id,
      ref: id,
      note: "",
      grn: "",
      deliveryId: "",
      supplierId: "s",
      supplier: "NMS",
      state,
      made: "",
      total,
      creditNote: "",
      lines: [],
    });
    const f = figures(
      [],
      [claim("new", "draft", 1000), claim("old", "sent", 2000), claim("c", "credit", 9000)],
      rules,
    )[3]!;
    expect(f).toMatchObject({
      value: "UGX 3,000",
      sub: "2 claims waiting for credit",
      oldestClaimId: "old",
    });
  });
  it("suppliers: fill, lead against promised, on time", () => {
    const base = { supplierId: "s", leadDays: 7 };
    const [s] = supplierStats(
      [
        {
          ...base,
          orderId: "a",
          sentOn: "2026-10-01",
          packs: 5,
          received: 5,
          firstAt: "2026-10-06",
        },
        {
          ...base,
          orderId: "a",
          sentOn: "2026-10-01",
          packs: 5,
          received: 3,
          firstAt: "2026-10-06",
        },
        {
          ...base,
          orderId: "b",
          sentOn: "2026-10-01",
          packs: 5,
          received: 5,
          firstAt: "2026-10-11",
        },
      ],
      new Map([["s", 4]]),
    );
    expect(s).toEqual({
      supplierId: "s",
      fill: 67,
      lead: 5,
      promised: 7,
      onTime: 50,
      differences: 4,
    });
  });
});

describe("stages", () => {
  const w = {
    ...world(),
    hospitalId: "",
    facility: "",
    me: { id: "", name: "", inCharge: false },
    placeId: "p1",
    suppliers: [],
    claims: [],
    asks: [],
    figureRows: [],
    supplierRows: [],
    differencesBy: [],
    registration: [],
    dispatches: [],
    places: [
      { id: "p1", name: "Main store", kind: "store", direct: true },
      { id: "p2", name: "OPD", kind: "dispensing_point", direct: false },
    ],
    deliveries: [],
    orders: [],
  };
  it("a receiving place has four columns, others two", () => {
    expect(stages(w, "p1").stages.map((s) => s.key)).toEqual([
      "expected",
      "counting",
      "put",
      "received",
    ]);
    expect(stages(w, "p2").stages.map((s) => s.key)).toEqual(["way", "received"]);
  });
  it("a dispatch on its way adds the column first", () => {
    const dispatches = [
      {
        id: "x",
        voucher: "RIV-1",
        kindText: "Requisition",
        sentAt: "2026-11-04 09:00",
        state: "transit" as const,
        note: "",
        lines: [],
      },
    ];
    expect(stages({ ...w, dispatches }, "p1").stages[0]!.key).toBe("way");
  });
  it("a queued delivery waits for the network", () => {
    const d = delivery([line()], { state: "queued", place: "p1" });
    const c = stages({ ...w, deliveries: [d] }, "p1").stages[1]!.cards[0]!;
    expect(c).toMatchObject({ kind: "count", queued: true, tag: "Waiting for the network" });
  });
});

describe("syncQueue (RECEIVE §H)", () => {
  const device = (id: string, savedAt: number, queued = true): DeviceDelivery => ({
    delivery: { id, state: "queued" } as ReceiveDelivery,
    queued,
    removed: [],
    savedAt,
  });
  const memory = () => {
    const put: DeviceDelivery[] = [];
    const dropped: string[] = [];
    return {
      put,
      dropped,
      store: {
        put: async (d: DeviceDelivery) => put.push(d),
        drop: async (id: string) => dropped.push(id),
      },
    };
  };
  const ok = {
    push: async () => ({ ok: true as const }),
    finish: async () => ({ ok: true as const }),
  };

  it("commits oldest first, once each, and skips what is not queued", async () => {
    const m = memory();
    const order: string[] = [];
    const r = await syncQueue(
      [device("b", 2), device("a", 1), device("c", 3, false)],
      { ...ok, finish: async (d) => (order.push(d.delivery.id), { ok: true as const }) },
      "dup",
      m.store,
    );
    expect(order).toEqual(["a", "b"]);
    expect(r.added).toEqual(["a", "b"]);
    expect(m.dropped).toEqual(["a", "b"]);
  });

  it("a refusal returns the delivery to Counting with the reason, and the next one still runs", async () => {
    const m = memory();
    const r = await syncQueue(
      [device("a", 1), device("b", 2)],
      {
        ...ok,
        finish: async (d) =>
          d.delivery.id === "a" ? { ok: false as const, error: "Recalled" } : { ok: true as const },
      },
      "dup",
      m.store,
    );
    expect(r.conflicts).toEqual([{ id: "a", reason: "Recalled" }]);
    expect(m.put[0]).toMatchObject({
      queued: false,
      delivery: { state: "counting", conflict: "Recalled" },
    });
    expect(r.added).toEqual(["b"]);
  });

  it("a duplicate on the server returns it with the duplicate words and never finishes", async () => {
    const m = memory();
    let finished = 0;
    const r = await syncQueue(
      [device("a", 1)],
      {
        push: async () => ({ ok: true as const, duplicate: true }),
        finish: async () => (finished++, { ok: true as const }),
      },
      "Someone recorded it",
      m.store,
    );
    expect(finished).toBe(0);
    expect(r.conflicts[0]?.reason).toBe("Someone recorded it");
  });

  it("a lost network stops the run and leaves everything queued", async () => {
    const m = memory();
    const r = await syncQueue(
      [device("a", 1), device("b", 2)],
      {
        ...ok,
        finish: async () => {
          throw new Error("offline");
        },
      },
      "dup",
      m.store,
    );
    expect(r).toEqual({ added: [], conflicts: [] });
    expect(m.put).toEqual([]);
    expect(m.dropped).toEqual([]);
  });
});
