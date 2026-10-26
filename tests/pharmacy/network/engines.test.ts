import type { RouteFacts } from "@/lib/network/routing";
import type { Leg } from "@/lib/pharmacy/prepared";
import type { RepeatFacts, RepeatPack } from "@/lib/prescribing/repeats";
import { describe, expect, it } from "vitest";

import { NETWORK_MESSAGES } from "@/content/pharmacy-network";
import { renderNetworkMessage, scanNetworkTemplate } from "@/lib/network/messages";
import {
  fourEyes,
  inForce,
  neutralOrder,
  notInForce,
  reverificationDue,
} from "@/lib/network/partners";
import {
  PARTNER_LINE_FIELDS,
  partnerLineView,
  partnerSupplyRefusals,
  returnTo,
  routeRefusals,
} from "@/lib/network/routing";
import {
  checkHoldLonger,
  handOverRefusals,
  missesInARow,
  planSetAside,
  preparedState,
  recallLegs,
  releaseLegs,
} from "@/lib/pharmacy/prepared";
import {
  checkAnswer,
  mayAskNow,
  phase3Block,
  planLine,
  refillLineState,
  renewalState,
  timingLabels,
} from "@/lib/pharmacy/refills";
import { addDays } from "@/lib/pharmacy/stores/ledger";
import { allows, mayBeCounted } from "@/lib/pharmacy/stores/locations";
import { checkAuthorisation, repeatsOffered, repeatStatus } from "@/lib/prescribing/repeats";

// Test values only: no pack here is a proposed clinical value (Appendix D packs are unsigned).
const PACK: RepeatPack = {
  repeatList: ["m1", "m2"],
  neverRepeat: ["m2"],
  maxSupplies: 5,
  maxPeriodDays: 180,
  minIntervalDays: 1,
  toleranceDays: 2,
};
const T0 = "2026-11-01";

/** Mulberry32: a seeded PRNG, so property runs repeat exactly. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const facts = (over: Partial<RepeatFacts> = {}): RepeatFacts => ({
  authorisation: {
    lineVersionId: "v1",
    furtherSupplies: 2,
    minIntervalDays: 28,
    notAfter: "2027-03-01",
    reviewBy: null,
  },
  line: { versionId: "v1", cancelled: false, replaced: false, renewed: false },
  stopped: false,
  instances: [],
  lastSupplyOn: T0,
  blocked: null,
  neverRepeat: false,
  toleranceDays: 0,
  ...over,
});

describe("RP-2 who may have repeats", () => {
  const m = (over = {}) => ({ medicineId: "m1", controlled: false, emergency: false, ...over });
  it("unsigned pack: no Repeats step", () => expect(repeatsOffered(m(), null)).toBe(false));
  it("controlled, emergency, never-repeat and off-list lines never offer it", () => {
    expect(repeatsOffered(m(), PACK)).toBe(true);
    expect(repeatsOffered(m({ controlled: true }), PACK)).toBe(false);
    expect(repeatsOffered(m({ emergency: true }), PACK)).toBe(false);
    expect(repeatsOffered(m({ medicineId: "m2" }), PACK)).toBe(false);
    expect(repeatsOffered(m({ medicineId: "m3" }), PACK)).toBe(false);
  });
  it("refuses terms beyond the signed maxima, each separately", () => {
    const ok = {
      furtherSupplies: 2,
      minIntervalDays: 28,
      notAfter: addDays(T0, 90),
      reviewBy: null,
    };
    expect(checkAuthorisation(ok, m(), PACK, T0)).toEqual([]);
    expect(checkAuthorisation({ ...ok, furtherSupplies: 6 }, m(), PACK, T0)).toEqual(["supplies"]);
    expect(checkAuthorisation({ ...ok, minIntervalDays: 0 }, m(), PACK, T0)).toEqual(["interval"]);
    expect(checkAuthorisation({ ...ok, notAfter: addDays(T0, 181) }, m(), PACK, T0)).toEqual([
      "not_after",
    ]);
    expect(checkAuthorisation({ ...ok, reviewBy: addDays(T0, 91) }, m(), PACK, T0)).toEqual([
      "review_by",
    ]);
    expect(checkAuthorisation(ok, m({ controlled: true }), PACK, T0)).toEqual(["not_offered"]);
  });
});

describe("RP-3 to RP-6 repeat status", () => {
  it("each status", () => {
    expect(repeatStatus(facts({ authorisation: null }), T0).kind).toBe("not_allowed");
    expect(repeatStatus(facts({ stopped: true }), T0)).toEqual({ kind: "stopped", by: "stopped" });
    expect(
      repeatStatus(
        facts({ line: { versionId: "v2", cancelled: false, replaced: false, renewed: false } }),
        T0,
      ),
    ).toEqual({ kind: "stopped", by: "changed" });
    expect(repeatStatus(facts(), "2027-03-02").kind).toBe("expired");
    expect(
      repeatStatus(
        facts({
          instances: [
            { handedOver: true, reversed: false },
            { handedOver: true, reversed: false },
          ],
        }),
        T0,
      ).kind,
    ).toBe("none_left");
    expect(repeatStatus(facts({ blocked: "suspected_reaction" }), T0)).toEqual({
      kind: "blocked",
      reason: "suspected_reaction",
    });
    expect(repeatStatus(facts({ lastSupplyOn: null }), T0).kind).toBe("first_supply_open");
    expect(repeatStatus(facts(), addDays(T0, 27))).toEqual({
      kind: "too_early",
      on: addDays(T0, 28),
    });
    expect(repeatStatus(facts(), addDays(T0, 28))).toEqual({
      kind: "allowed",
      remaining: 2,
      nextAllowed: addDays(T0, 28),
    });
  });
  it("RP-4: a reversed hand-over gives the repeat back; an unhanded instance uses none", () => {
    const s = repeatStatus(
      facts({
        instances: [
          { handedOver: true, reversed: true },
          { handedOver: false, reversed: false },
        ],
      }),
      addDays(T0, 30),
    );
    expect(s).toEqual({ kind: "allowed", remaining: 2, nextAllowed: addDays(T0, 28) });
  });

  it("S4: supplies never exceed n, none before next allowed, always expired after not after", () => {
    const r = rng(7);
    for (let run = 0; run < 300; run++) {
      const n = 1 + Math.floor(r() * 5);
      const d = 1 + Math.floor(r() * 40);
      const tol = Math.floor(r() * Math.min(d, 5));
      const notAfter = addDays(T0, 30 + Math.floor(r() * 300));
      const supplies: string[] = [T0];
      for (let day = 0; day < 400; day++) {
        const today = addDays(T0, day);
        const f = facts({
          authorisation: {
            lineVersionId: "v1",
            furtherSupplies: n,
            minIntervalDays: d,
            notAfter,
            reviewBy: null,
          },
          instances: supplies.slice(1).map(() => ({ handedOver: true, reversed: false })),
          lastSupplyOn: supplies.at(-1)!,
          toleranceDays: tol,
        });
        const s = repeatStatus(f, today);
        if (today > notAfter) expect(s.kind).toBe("expired");
        if (s.kind === "allowed" && r() < 0.5) supplies.push(today);
      }
      expect(supplies.length - 1).toBeLessThanOrEqual(n);
      for (let i = 1; i < supplies.length; i++)
        expect(supplies[i]! >= addDays(supplies[i - 1]!, d - tol)).toBe(true);
      expect(supplies.every((s) => s <= notAfter)).toBe(true);
    }
  });
});

describe("RF refill requests and RN renewals", () => {
  it("RF-2: allowed prepares, too early waits with its date, everything else goes to the clinic", () => {
    expect(planLine({ kind: "allowed", remaining: 1, nextAllowed: T0 })).toEqual({
      to: "to_prepare",
      instance: true,
    });
    expect(planLine({ kind: "too_early", on: T0 })).toEqual({
      to: "to_prepare",
      instance: false,
      from: T0,
    });
    expect(planLine({ kind: "none_left" })).toEqual({
      to: "needs_clinic",
      reason: "none_left",
      blocked: null,
    });
    expect(planLine({ kind: "not_allowed" })).toEqual({
      to: "needs_clinic",
      reason: "no_authorisation",
      blocked: null,
    });
    expect(planLine({ kind: "blocked", reason: "stewardship_review" })).toEqual({
      to: "needs_clinic",
      reason: "blocked",
      blocked: "stewardship_review",
    });
    expect(planLine({ kind: "first_supply_open" })).toEqual({ to: "not_a_refill" });
  });
  it("RF-4: Phase 3 blocks", () => {
    expect(phase3Block({ openStewardshipReview: true, unconfirmedReaction: false })).toBe(
      "stewardship_review",
    );
    expect(phase3Block({ openStewardshipReview: true, unconfirmedReaction: true })).toBe(
      "suspected_reaction",
    );
    expect(phase3Block({ openStewardshipReview: false, unconfirmedReaction: false })).toBeNull();
  });
  it("RF-3: early from the interval; late only with a signed window; unsigned, ask any time", () => {
    expect(
      timingLabels({ askedOn: T0, nextAllowed: addDays(T0, 1), refillOn: null, pack: null }),
    ).toEqual({ early: true, late: false });
    expect(
      timingLabels({ askedOn: addDays(T0, 30), nextAllowed: T0, refillOn: T0, pack: null }).late,
    ).toBe(false);
    expect(
      timingLabels({
        askedOn: addDays(T0, 30),
        nextAllowed: T0,
        refillOn: T0,
        pack: { requestWindowDays: 7, lateWindowDays: 14 },
      }).late,
    ).toBe(true);
    expect(mayAskNow(T0, addDays(T0, 60), null)).toBe(true);
    expect(mayAskNow(T0, addDays(T0, 60), { requestWindowDays: 7, lateWindowDays: 14 })).toBe(
      false,
    );
  });
  it("RN: the first answer wins; decline needs a signed reason; a non-prescriber cannot answer", () => {
    expect(renewalState([])).toBe("open");
    expect(renewalState([{ kind: "visit_needed" }, { kind: "renewed" }])).toBe("visit_needed");
    const base = { state: "open" as const, mayPrescribeHere: true, declineReasons: null };
    expect(checkAnswer({ ...base, answer: { kind: "declined", reasonCode: "x" } })).toBe(
      "decline_unsigned",
    );
    expect(checkAnswer({ ...base, answer: { kind: "renewed", prescriptionId: "p" } })).toBeNull();
    expect(
      checkAnswer({ ...base, mayPrescribeHere: false, answer: { kind: "visit_needed" } }),
    ).toBe("may_not_prescribe");
    expect(checkAnswer({ ...base, state: "renewed", answer: { kind: "visit_needed" } })).toBe(
      "already_answered",
    );
  });
  it("S9: after 60 days nothing has closed by itself (RF-5, RN-4)", () => {
    // Neither projection takes the clock: the same events give the same open state on any day.
    const events = [{ kind: "to_prepare" as const }];
    for (let day = 0; day <= 60; day++) {
      expect(refillLineState(events)).toBe("to_prepare");
      expect(renewalState([])).toBe("open");
    }
    expect(refillLineState.length + renewalState.length).toBe(2);
  });
});

describe("SA set aside and prepared stock", () => {
  const HOLD = { holdDays: 7, extensions: 1, holdLongerMaxDays: 14, missThreshold: 2 };
  const batch = (id: string, expiry: string) => ({
    id,
    pointId: "pt",
    productId: "pr",
    medicineId: "m1",
    batchNumber: id,
    expiry,
    expiryMonthOnly: false,
  });
  const B = [batch("b2", "2027-06-30"), batch("b1", "2026-11-05"), batch("b3", "2027-01-31")];
  const bal = new Map([
    ["b1", 50],
    ["b2", 50],
    ["b3", 10],
  ]);
  const plan = (quantity: number, pack: typeof HOLD | null = HOLD) =>
    planSetAside({
      pack,
      today: T0,
      quantity,
      pointId: "pt",
      preparedId: "pp",
      batches: B,
      balances: bal,
      blocked: new Set(),
    });

  it("unsigned: refills cannot be set aside", () =>
    expect(plan(5, null)).toEqual({ ok: false, reason: "unsigned" }));
  it("SA-1: first expiry first, skipping a batch that expires before held-until, two legs per batch", () => {
    const r = plan(15);
    expect(r.ok && r.heldUntil).toBe(addDays(T0, 7));
    expect(r.ok && r.legs).toEqual([
      { batchId: "b3", locationId: "pt", kind: "set_aside_out", quantity: -10 },
      { batchId: "b3", locationId: "pp", kind: "set_aside_in", quantity: 10 },
      { batchId: "b2", locationId: "pt", kind: "set_aside_out", quantity: -5 },
      { batchId: "b2", locationId: "pp", kind: "set_aside_in", quantity: 5 },
    ]);
    expect(plan(61)).toEqual({ ok: false, reason: "not_enough_in_date" });
  });
  it("SA-2 with LC-3: held stock takes only its four kinds and no count corrects it", () => {
    expect(mayBeCounted("prepared", null)).toBe(false);
    expect(allows("prepared", null, "count_correction", "in")).toBe(false);
    expect(allows("prepared", null, "supplied", "out")).toBe(true);
  });
  it("SA-3: held, then not collected; hold longer once, within the maximum", () => {
    const p = { preparedOn: T0, heldUntil: addDays(T0, 7), extensions: 0, released: false };
    expect(preparedState(p, addDays(T0, 7))).toBe("held");
    expect(preparedState(p, addDays(T0, 8))).toBe("not_collected");
    expect(checkHoldLonger(p, addDays(T0, 14), HOLD)).toBeNull();
    expect(checkHoldLonger(p, addDays(T0, 15), HOLD)).toBe("past_maximum");
    expect(checkHoldLonger({ ...p, extensions: 1 }, addDays(T0, 10), HOLD)).toBe(
      "no_extensions_left",
    );
  });
  it("SA-4, SA-5: released, stopped, expired or recalled stock is not handed over", () => {
    const p = { preparedOn: T0, heldUntil: addDays(T0, 7), extensions: 0, released: false };
    const ok = {
      prepared: p,
      today: T0,
      repeat: "allowed" as const,
      batches: [B[0]!],
      blocked: new Set<string>(),
    };
    expect(handOverRefusals(ok)).toEqual([]);
    expect(handOverRefusals({ ...ok, today: addDays(T0, 9) })).toEqual([]);
    expect(handOverRefusals({ ...ok, prepared: { ...p, released: true } })).toEqual(["released"]);
    expect(handOverRefusals({ ...ok, repeat: "stopped" })).toEqual(["line_ended"]);
    expect(handOverRefusals({ ...ok, today: "2027-07-01" })).toEqual(["batch_expired"]);
    expect(handOverRefusals({ ...ok, blocked: new Set(["b2"]) })).toEqual(["batch_blocked"]);
  });
  it("D-PH4-08: misses in a row", () => {
    expect(missesInARow(["not_collected", "collected", "not_collected", "not_collected"])).toBe(2);
  });

  it("S5 (SA-6): every unit set aside ends supplied, released or quarantined, never in two places", () => {
    const r = rng(11);
    for (let run = 0; run < 200; run++) {
      const ledger = new Map<string, number>(); // `${location}|${batch}` → units
      const put = (legs: readonly Pick<Leg, "batchId" | "locationId" | "quantity">[]) => {
        for (const l of legs)
          ledger.set(
            `${l.locationId}|${l.batchId}`,
            (ledger.get(`${l.locationId}|${l.batchId}`) ?? 0) + l.quantity,
          );
      };
      const start = new Map([
        ["b1", 50],
        ["b2", 50],
        ["b3", 10],
      ]);
      put([...start].map(([b, q]) => ({ batchId: b, locationId: "pt", quantity: q })));
      const atPoint = () => new Map(B.map((b) => [b.id, ledger.get(`pt|${b.id}`) ?? 0]));
      const res = planSetAside({
        pack: HOLD,
        today: T0,
        quantity: 1 + Math.floor(r() * 30),
        pointId: "pt",
        preparedId: "pp",
        batches: B,
        balances: atPoint(),
        blocked: new Set(),
      });
      if (!res.ok) continue;
      put(res.legs);
      const held = new Map(
        res.legs.filter((l) => l.kind === "set_aside_in").map((l) => [l.batchId, l.quantity]),
      );
      const end = r();
      let supplied = 0;
      if (end < 1 / 3) {
        for (const [b, q] of held) put([{ batchId: b, locationId: "pp", quantity: -q }]);
        supplied = [...held.values()].reduce((a, b) => a + b, 0);
      } else if (end < 2 / 3) put(releaseLegs(res.legs, "pt", "pp"));
      else put(recallLegs(held, "pp", "qz"));
      for (const b of B) {
        expect(ledger.get(`pp|${b.id}`) ?? 0).toBe(0);
        for (const loc of ["pt", "qz"])
          expect(ledger.get(`${loc}|${b.id}`) ?? 0).toBeGreaterThanOrEqual(0);
      }
      const total = [...ledger.values()].reduce((a, b) => a + b, 0);
      expect(total + supplied).toBe(110);
    }
  });
});

describe("PN the partner register", () => {
  const PK = { reverifyDays: 365, licenceWarningDays: 30, pharmacistRegistrationRequired: true };
  const P = {
    confirmedOn: "2026-06-01",
    suspended: false,
    withdrawn: false,
    licenceExpiry: "2026-12-31",
    responsiblePharmacist: { registrationExpiry: "2027-12-31" },
  };
  it("unsigned: no partner is in force", () =>
    expect(notInForce(P, T0, null)).toEqual(["unsigned"]));
  it("S8: not in force the day after licence expiry, with no job running", () => {
    expect(inForce(P, "2026-12-31", PK)).toBe(true);
    expect(notInForce(P, "2027-01-01", PK)).toContain("licence_expired");
  });
  it("PN-3: re-verification due is the earlier of period and licence expiry; overdue is not in force", () => {
    expect(reverificationDue(P, PK)).toBe("2026-12-31");
    const later = { ...P, licenceExpiry: "2028-01-01" };
    expect(reverificationDue(later, PK)).toBe("2027-06-01");
    expect(notInForce(later, "2027-06-02", PK)).toEqual(["reverification_overdue"]);
  });
  it("PN-4: two different people, neither interested", () => {
    expect(fourEyes("a", "b", new Set())).toBeNull();
    expect(fourEyes("a", "a", new Set())).toBe("same_person");
    expect(fourEyes("a", "b", new Set(["b"]))).toBe("interested");
  });
  it("Law 13: district then name, nothing else", () => {
    const out = neutralOrder([
      { district: "Wakiso", tradingName: "A", interest: true },
      { district: "Kampala", tradingName: "Z", interest: false },
      { district: "Kampala", tradingName: "B", interest: true },
    ]);
    expect(out.map((p) => p.tradingName)).toEqual(["B", "Z", "A"]);
  });
});

describe("RT routing", () => {
  const agreement = {
    switchedOn: true,
    paused: false,
    ended: false,
    startsOn: "2026-10-01",
    endsOn: null,
    kinds: ["refills" as const],
    dispensingPointIds: ["pt"],
    routingList: ["m1"],
    programmes: [],
  };
  const ok: RouteFacts = {
    pack: { routingList: ["m1"], neverRouted: [], responseWindowHours: 24 },
    date: T0,
    medicineId: "m1",
    controlled: false,
    programme: null,
    pointId: "pt",
    kind: "refills",
    consented: true,
    partnerInForce: true,
    agreement,
    taken: false,
    repeat: "allowed",
    pharmacistFirst: false,
    pharmacistAccepted: false,
    routedQuantity: 30,
  };
  it("unsigned lists: nothing can be routed", () =>
    expect(routeRefusals({ ...ok, pack: null })).toEqual(["routing_unsigned"]));
  it("S6: each missing condition is refused separately and named", () => {
    expect(routeRefusals(ok)).toEqual([]);
    const cases: [Partial<RouteFacts>, string][] = [
      [{ consented: false }, "no_consent"],
      [{ partnerInForce: false }, "partner_not_in_force"],
      [{ agreement: { ...agreement, paused: true } }, "agreement_not_in_force"],
      [{ pointId: "other" }, "agreement_not_in_force"],
      [{ kind: "out_of_stock", repeat: null }, "agreement_not_in_force"],
      [
        { pack: { routingList: [], neverRouted: [], responseWindowHours: 24 } },
        "not_on_routing_list",
      ],
      [
        { pack: { routingList: ["m1"], neverRouted: ["m1"], responseWindowHours: 24 } },
        "never_routed",
      ],
      [{ controlled: true }, "controlled"],
      [{ taken: true }, "already_taken"],
      [{ repeat: "too_early" }, "repeat_not_allowed"],
      [{ pharmacistFirst: true }, "needs_pharmacist_acceptance"],
      [{ programme: "art" }, "programme_not_in_agreement"],
      [{ routedQuantity: null }, "no_quantity"],
    ];
    for (const [over, reason] of cases)
      expect(routeRefusals({ ...ok, ...over }), reason).toEqual([reason]);
  });
  it("RT-4: a returned line goes back where it was routed from", () => {
    expect(returnTo("ready")).toBe("ready");
    expect(returnTo("owed")).toBe("owed");
    expect(returnTo("instance")).toBe("to_prepare");
  });
  it("RT-5: refusals, and a second supply names the first", () => {
    const f = {
      codeLive: true,
      partnerInForce: true,
      agreementInForce: true,
      identityConfirmed: true,
      paperPresented: true,
      quantity: 30,
      accepted: 30,
      repeat: "allowed" as const,
      lineChangedSinceRouting: false,
      firstSupplyId: null,
    };
    expect(partnerSupplyRefusals(f)).toEqual([]);
    expect(partnerSupplyRefusals({ ...f, quantity: 31 })).toEqual(["over_accepted"]);
    expect(
      partnerSupplyRefusals({ ...f, identityConfirmed: false, paperPresented: false }),
    ).toEqual(["identity_not_confirmed", "paper_not_presented"]);
    expect(partnerSupplyRefusals({ ...f, firstSupplyId: "s1" })).toEqual(["already_supplied"]);
  });
  it("S7 (RT-6): the partner read is exactly Law 6's fields", () => {
    expect([...PARTNER_LINE_FIELDS]).toEqual([
      "patientName",
      "age",
      "sex",
      "medicine",
      "form",
      "strength",
      "directions",
      "quantity",
      "prescriberName",
      "prescriberCadre",
      "prescriberCouncilNumber",
      "hospitalName",
      "pharmacyPhone",
      "routingReference",
    ]);
    const full = {
      ...Object.fromEntries(PARTNER_LINE_FIELDS.map((k) => [k, "x"])),
      diagnosis: "secret",
      dateOfBirth: "1990-01-01",
      phone: "0700",
      medsyncNumber: "MS-2026-00001",
    };
    expect(Object.keys(partnerLineView(full as never))).toEqual([...PARTNER_LINE_FIELDS]);
  });
});

describe("NM messages", () => {
  it("NM-1: renders with only the values each kind needs; a missing phone fails loud", () => {
    const r = renderNetworkMessage("refill_ready", { messageName: "Mulago", date: "8 November" });
    expect(r).toEqual({
      ok: true,
      text: "Mulago pharmacy: your medicines are ready to collect until 8 November. Bring your MedSync number.",
      fitsOneSms: true,
    });
    expect(
      renderNetworkMessage("partner_declined", {
        messageName: "Mulago",
        pharmacy: "Kisenyi Pharmacy",
        phone: null,
      }),
    ).toEqual({ ok: false, reason: "no_point_phone" });
  });
  it("NM-2: every 5.10 template passes the scan; a partner name is caught where the kind names none", () => {
    for (const [kind, text] of Object.entries(NETWORK_MESSAGES))
      expect(
        scanNetworkTemplate(kind as keyof typeof NETWORK_MESSAGES, text, ["Kisenyi Pharmacy"]),
      ).toEqual([]);
    expect(
      scanNetworkTemplate("refill_due", "Kisenyi Pharmacy: a supply is due.", ["Kisenyi Pharmacy"])
        .length,
    ).toBeGreaterThan(0);
    expect(
      scanNetworkTemplate("partner_accepted", "Kisenyi Pharmacy can supply your medicines.", [
        "Kisenyi Pharmacy",
      ]),
    ).toEqual([]);
  });
});
