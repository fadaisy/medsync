import type { PharmacyAccess, PharmacyPermission } from "@/lib/pharmacy/access";
import type { LineInput, PharmacyLineEvent } from "@/lib/pharmacy/lines";
import type { Batch } from "@/lib/pharmacy/stock/ledger";
import type {
  HandoverFacts,
  HandoverPlan,
  LineEventRow,
  LineFacts,
  PlanLine,
} from "@/lib/pharmacy/supply/handover";
import { describe, expect, it } from "vitest";

import { applyMove, lineStatus } from "@/lib/pharmacy/lines";
import { proposeBatches } from "@/lib/pharmacy/stock/fefo";
import { balances } from "@/lib/pharmacy/stock/ledger";
import {
  checkHandover,
  HANDOVER_COPY,
  handoverClientKey,
  handoverWrites,
  paymentPasses,
  quantityPrefill,
} from "@/lib/pharmacy/supply/handover";

/**
 * Pharmacy Phase 1 — the hand-over (SU-1..SU-3, SU-6..SU-10, SU-12, Law 3, Law 6, H1, H2, H3, W4).
 * Fixture data: Fixture tablet A (FTA) at "Outpatient pharmacy" (OP), products P1 (strength "10 fx"),
 * P2 (another pack, same strength), P3 ("20 fx"), batches FX-001 / FX-002, invented quantities (Law 8).
 */
const T0 = new Date("2026-10-12T07:00:00.000Z"); // 10:00 in Kampala
const T = (min: number) => new Date(T0.getTime() + min * 60_000);
const TODAY = "2026-10-12";

const access = (...p: PharmacyPermission[]): PharmacyAccess => ({ permissions: new Set(p) });
const PHARMACIST = access(
  "pharmacy.view",
  "pharmacy.review",
  "pharmacy.dispense",
  "pharmacy.stock",
  "pharmacy.controlled",
);
const TECHNICIAN = access("pharmacy.view", "pharmacy.dispense", "pharmacy.stock");
const TECH_ACTOR = { userId: "U-tech", cadre: "Pharmacy technician", access: TECHNICIAN };
const PHARM_ACTOR = { userId: "U-ph", cadre: "Pharmacist", access: PHARMACIST };

const batch = (id: string, batchNumber: string, expiry: string, o: Partial<Batch> = {}): Batch => ({
  id,
  pointId: "OP",
  productId: "P1",
  medicineId: "FTA",
  batchNumber,
  expiry,
  expiryMonthOnly: false,
  ...o,
});
const lineFacts = (o: Partial<LineFacts> = {}): LineFacts => ({
  medicineId: "FTA",
  medicineName: "Fixture tablet A",
  prescribedStrength: "10 fx",
  currentVersionId: "L1",
  changedAt: null,
  cosign: "none",
  state: "active",
  controlled: false,
  lane: "standard",
  status: { kind: "stage", stage: "ready" },
  decided: null,
  reviewEvents: [{ id: "d1", prescriptionId: "L1", kind: "decision_saved" }],
  lastSupply: null,
  ...o,
});
const facts = (o: Partial<HandoverFacts> = {}, l: Partial<LineFacts> = {}): HandoverFacts => ({
  today: TODAY,
  pointLive: true,
  paymentRequired: false,
  inpatientSupplyOn: false,
  collectorIsHospitalStaff: false,
  supplyWithoutReview: { settingOn: false, legalQ1OnRecord: false },
  strengthChangeSigned: false,
  identityRoutes: ["card_shown", "known", "other"],
  secondIdentifierMatched: "date_of_birth",
  lines: new Map([["L1", lineFacts(l)]]),
  products: new Map([
    ["P1", { medicineId: "FTA", strength: "10 fx", issueUnit: "tablet", priceUgx: null }],
    ["P2", { medicineId: "FTA", strength: "10 FX", issueUnit: "tablet", priceUgx: "500.00" }],
    ["P3", { medicineId: "FTA", strength: "20 fx", issueUnit: "tablet", priceUgx: null }],
    ["P4", { medicineId: "FTB", strength: "10 fx", issueUnit: "tablet", priceUgx: null }],
    ["P5", { medicineId: "FTA", strength: null, issueUnit: "tablet", priceUgx: null }],
  ]),
  batches: [
    batch("B1", "FX-001", "2027-01-31"),
    batch("B2", "FX-002", "2027-06-30"),
    batch("B0", "FX-000", "2026-10-01"),
    batch("BP2", "FX-201", "2027-01-31", { productId: "P2" }),
    batch("BP3", "FX-301", "2027-01-31", { productId: "P3" }),
    batch("BP5", "FX-501", "2027-01-31", { productId: "P5" }),
    batch("BIP", "FX-901", "2027-01-31", { pointId: "IP" }),
  ],
  balances: new Map([
    ["B1", 140],
    ["B2", 200],
    ["B0", 50],
    ["BP2", 60],
    ["BP3", 60],
    ["BP5", 60],
    ["BIP", 60],
  ]),
  ...o,
});
const planLine = (o: Partial<PlanLine> = {}): PlanLine => ({
  lineId: "L1",
  productId: "P1",
  rows: [{ batchId: "B1", quantity: 28 }],
  ...o,
});
const plan = (o: Partial<HandoverPlan> = {}, l: Partial<PlanLine> = {}): HandoverPlan => ({
  clientKey: "hand-over-0001",
  hospitalId: "H1",
  pointId: "OP",
  patientUserId: "PT9",
  actor: TECH_ACTOR,
  lines: [planLine(l)],
  collector: { kind: "patient" },
  identity: { route: "two_identifiers", nameAttested: true },
  labelMode: "printed",
  payment: { status: "not_recorded" },
  suppliedAt: T0,
  ...o,
});
const codes = (r: ReturnType<typeof checkHandover>) => (r.ok ? [] : r.refusals.map((x) => x.code));
const words = (r: ReturnType<typeof checkHandover>) => (r.ok ? [] : r.refusals.map((x) => x.words));
let n = 0;
const newId = () => `id-${++n}`;

/** A written line event, read back as the `lines.ts` fold sees it. */
const asEvent = (e: LineEventRow, at: Date): PharmacyLineEvent => ({
  id: e.id,
  kind: e.kind,
  occurredAt: at,
  effectiveAt: at,
  lane: e.lane,
  quantitySupplied: e.quantitySupplied,
  quantityNotSupplied: e.quantityNotSupplied,
  reasonCode: e.reasonCode,
  handoverId: e.handoverId,
  actorCadre: e.actorCadre,
});
const L1: LineInput = { id: "L1", state: "active", cosign: "none", createdAt: T(-30) };
const saved = (min: number): PharmacyLineEvent => ({
  id: `s${min}`,
  kind: "decision_saved",
  occurredAt: T(min),
  effectiveAt: T(min),
  lane: "standard",
  quantitySupplied: null,
  quantityNotSupplied: null,
  reasonCode: null,
  handoverId: null,
  actorCadre: "Pharmacy technician",
});

describe("SU-2 a hand-over that meets every condition", () => {
  it("SU-2 S35: a standard-lane line at ready, identity confirmed, on the shelf: passes", () => {
    expect(checkHandover(plan(), facts())).toEqual({ ok: true });
  });

  it("SU-1 Law 3: one supply and one movement of the same quantity per batch; one outcome; one hand-over", () => {
    const r = handoverWrites(plan(), facts(), newId);
    if (!r.ok) throw new Error("expected writes");
    const w = r.writes;
    expect(w.supplies).toHaveLength(1);
    expect(w.movements).toHaveLength(1);
    expect(w.movements[0]).toMatchObject({
      kind: "supplied",
      quantity: -28,
      batchId: "B1",
      sourceKind: "supply",
      sourceId: w.supplies[0]!.id,
    });
    expect(w.lineEvents).toEqual([
      expect.objectContaining({
        kind: "supplied",
        quantitySupplied: 28,
        handoverId: w.handover.id,
      }),
    ]);
    expect(w.handover).toMatchObject({
      identityRoute: "two_identifiers",
      secondIdentifier: "date_of_birth",
      clientKey: "hand-over-0001",
      paymentStatus: "not_recorded",
    });
    // RQ-1: the standard lane is checked at supply; no review event is named.
    expect(w.supplies[0]!.reviewEventId).toBeNull();
  });

  it("SU-9: the supplying point and organisation are their own fields", () => {
    const r = handoverWrites(plan(), facts(), newId);
    expect(r.ok && r.writes.supplies[0]).toMatchObject({
      dispensingPointId: "OP",
      supplyingHospitalId: "H1",
      hospitalId: "H1",
    });
  });

  it("SU-1: the written outcome reads back through the line fold as supplied", () => {
    const r = handoverWrites(plan(), facts(), newId);
    if (!r.ok) throw new Error("expected writes");
    expect(
      lineStatus(L1, [saved(0), asEvent(r.writes.lineEvents[0]!, T(5))], [], "standard"),
    ).toEqual({ kind: "closed", outcome: "supplied" });
  });
});

describe("SU-4 Law 6 identity at the hand-over", () => {
  it("SU-4 S36: with the name alone, the server refuses", () => {
    const r = checkHandover(plan(), facts({ secondIdentifierMatched: null }));
    expect(codes(r)).toEqual(["identity"]);
    expect(words(r)).toEqual([
      "Two identifiers are needed before the hand-over can be recorded. Ask the person to say them; do not read them out.",
    ]);
  });

  it("SU-4: a second identifier without the name attested is refused", () => {
    expect(
      codes(
        checkHandover(
          plan({ identity: { route: "two_identifiers", nameAttested: false } }),
          facts(),
        ),
      ),
    ).toEqual(["identity"]);
  });

  it("SU-4 S36: 'Identified another way' with a note lets the hand-over through and is stored", () => {
    const p = plan({
      identity: {
        route: "identified_another_way",
        nameAttested: true,
        how: "other",
        note: "Known to the ward sister",
      },
    });
    const f = facts({ secondIdentifierMatched: null });
    expect(checkHandover(p, f)).toEqual({ ok: true });
    const r = handoverWrites(p, f, newId);
    expect(r.ok && r.writes.handover).toMatchObject({
      identityRoute: "identified_another_way",
      identifiedHow: "other",
      identifiedNote: "Known to the ward sister",
      secondIdentifier: null,
    });
    expect(
      codes(
        checkHandover(
          plan({ identity: { route: "identified_another_way", nameAttested: true, how: "other" } }),
          f,
        ),
      ),
    ).toEqual(["identity_route"]);
  });

  it("SU-4 S55: ward staff collect only with inpatient supply on; the typed check is not asked", () => {
    const p = plan({
      collector: { kind: "ward_staff", userId: "U-nurse" },
      identity: { route: "ward_staff" },
    });
    expect(codes(checkHandover(p, facts({ secondIdentifierMatched: null })))).toEqual([
      "collector",
    ]);
    const on = facts({
      secondIdentifierMatched: null,
      inpatientSupplyOn: true,
      collectorIsHospitalStaff: true,
    });
    const r = handoverWrites(p, on, newId);
    expect(r.ok && r.writes.handover).toMatchObject({
      collector: "ward_staff",
      collectorUserId: "U-nurse",
      identityRoute: "ward_staff",
    });
  });

  it("SU-5 S37: someone else collecting gives a name and relationship", () => {
    const r = handoverWrites(
      plan({ collector: { kind: "representative", name: "Fixture Kin", relationship: "Brother" } }),
      facts(),
      newId,
    );
    expect(r.ok && r.writes.handover).toMatchObject({
      collector: "representative",
      collectorName: "Fixture Kin",
      collectorRelationship: "Brother",
    });
  });
});

describe("SU-2 SU-3 batches", () => {
  it("SU-3 S38: the first batch holds less: the split across batches in expiry order passes, two supplies, two movements", () => {
    const f = facts({
      balances: new Map([
        ["B1", 10],
        ["B2", 200],
      ]),
    });
    const proposal = proposeBatches({
      batches: f.batches.filter((b) => b.productId === "P1" && b.pointId === "OP"),
      balances: f.balances,
      quantity: 28,
      localDate: TODAY,
    });
    expect(proposal).toEqual({
      ok: true,
      rows: [
        { batchId: "B1", quantity: 10 },
        { batchId: "B2", quantity: 18 },
      ],
    });
    const p = plan({}, { rows: proposal.ok ? proposal.rows : [] });
    const r = handoverWrites(p, f, newId);
    if (!r.ok) throw new Error("expected writes");
    expect(r.writes.supplies.map((s) => [s.batchId, s.quantity])).toEqual([
      ["B1", 10],
      ["B2", 18],
    ]);
    // Law 3: per batch, the movement is exactly the supply.
    const moved = balances(
      r.writes.movements.map((m) => ({
        id: m.id,
        batchId: m.batchId,
        pointId: m.dispensingPointId,
        kind: m.kind,
        quantity: m.quantity,
        effectiveAt: m.effectiveAt,
        recordedAt: m.effectiveAt,
        downtime: false,
      })),
    );
    for (const s of r.writes.supplies) expect(moved.get(s.batchId)).toBe(-s.quantity);
    expect(r.writes.lineEvents).toHaveLength(1);
    expect(r.writes.lineEvents[0]!.quantitySupplied).toBe(28);
  });

  it("SU-3 S39: a batch that is not first to expire needs a reason", () => {
    const off = { rows: [{ batchId: "B2", quantity: 28 }] };
    expect(codes(checkHandover(plan({}, off), facts()))).toEqual(["batch_reason"]);
    const r = handoverWrites(
      plan({}, { ...off, batchChoiceReason: "first_not_found" }),
      facts(),
      newId,
    );
    expect(r.ok && r.writes.supplies[0]!.batchChoiceReason).toBe("first_not_found");
  });

  it("SU-2 S42: the batch was taken down under you: refused with its figure, nothing written", () => {
    const f = facts({
      balances: new Map([
        ["B1", 20],
        ["B2", 0],
      ]),
    });
    const r = handoverWrites(plan(), f, newId);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.refusals).toContainEqual({
      lineId: "L1",
      code: "batch_short",
      words: "Batch FX-001 now holds 20. Choose again.",
    });
    expect("writes" in r).toBe(false);
  });

  it("SU-2: two lines from one batch are summed against its balance", () => {
    const f = facts({
      balances: new Map([
        ["B1", 40],
        ["B2", 200],
      ]),
      lines: new Map([
        ["L1", lineFacts()],
        ["L2", lineFacts({ currentVersionId: "L2", reviewEvents: [] })],
      ]),
    });
    const p = plan({
      lines: [planLine(), planLine({ lineId: "L2", rows: [{ batchId: "B1", quantity: 28 }] })],
    });
    expect(codes(checkHandover(p, f))).toContain("batch_short");
  });

  it("SU-2 SL-5: an expired batch is refused", () => {
    const r = checkHandover(
      plan({}, { rows: [{ batchId: "B0", quantity: 28 }], batchChoiceReason: "other" }),
      facts(),
    );
    expect(codes(r)).toEqual(["batch_expired"]);
    expect(words(r)).toEqual(["Batch FX-000 expired on 2026-10-01. Remove it from the shelf."]);
  });

  it("SU-2: a batch of another product or another point is refused", () => {
    expect(
      codes(checkHandover(plan({}, { rows: [{ batchId: "BIP", quantity: 1 }] }), facts())),
    ).toContain("batch_wrong");
    expect(
      codes(checkHandover(plan({}, { rows: [{ batchId: "BP2", quantity: 1 }] }), facts())),
    ).toContain("batch_wrong");
  });

  it("SU-2: each quantity is a whole number above zero", () => {
    for (const quantity of [0, -3, 2.5])
      expect(
        codes(checkHandover(plan({}, { rows: [{ batchId: "B1", quantity }] }), facts())),
      ).toContain("quantity");
    expect(codes(checkHandover(plan({}, { rows: [] }), facts()))).toContain("quantity");
  });
});

describe("SU-2 the line's state", () => {
  it("SU-2 S46: a prescription awaiting co-signature is refused", () => {
    const r = checkHandover(plan(), facts({}, { cosign: "awaiting" }));
    expect(codes(r)).toEqual(["awaiting_cosign"]);
    expect(words(r)).toEqual([
      "Cannot be supplied yet. A senior has not signed this prescription.",
    ]);
  });

  it("SU-2 S44: the prescriber changed the line after the decision: 'Review it again', nothing written", () => {
    const f = facts({}, { currentVersionId: "L1b", changedAt: T(5) });
    const r = handoverWrites(plan(), f, newId);
    expect(r).toEqual({
      ok: false,
      refusals: [
        {
          lineId: "L1",
          code: "changed",
          words: "Fixture tablet A was changed by the prescriber at 10:05. Review it again.",
        },
      ],
    });
  });

  it("SU-2 S43: already supplied at another point: told where and when", () => {
    const f = facts(
      {},
      {
        status: { kind: "closed", outcome: "supplied" },
        lastSupply: { pointName: "Inpatient pharmacy", at: T0 },
      },
    );
    expect(words(checkHandover(plan(), f))).toEqual([
      "Fixture tablet A was already supplied at Inpatient pharmacy, 10:00.",
    ]);
  });

  it("SU-2 H1: a line not continued at visit close, or cancelled, is refused", () => {
    expect(codes(checkHandover(plan(), facts({}, { state: "completed" })))).toEqual(["stopped"]);
    expect(
      codes(
        checkHandover(
          plan(),
          facts({}, { status: { kind: "closed", outcome: "cancelled_by_prescriber" } }),
        ),
      ),
    ).toEqual(["stopped"]);
  });

  it("SU-2 H3: a line with another closed outcome is refused; a line still to review is not ready", () => {
    expect(
      codes(checkHandover(plan(), facts({}, { status: { kind: "closed", outcome: "declined" } }))),
    ).toEqual(["has_outcome"]);
    expect(
      codes(
        checkHandover(
          plan(),
          facts({}, { status: { kind: "stage", stage: "to_review" }, reviewEvents: [] }),
        ),
      ),
    ).toEqual(["not_ready"]);
  });

  it("6.9: a controlled line is refused here: use the controlled supply", () => {
    const r = checkHandover(plan({ actor: PHARM_ACTOR }), facts({}, { controlled: true }));
    expect(r).toEqual({
      ok: false,
      refusals: [
        {
          lineId: "L1",
          code: "controlled",
          words: "Fixture tablet A is a controlled drug. Use the controlled supply.",
        },
      ],
    });
  });
});

describe("SU-2 RQ-12 a pharmacist-first line", () => {
  const pf = { lane: "pharmacist_first" as const, reviewEvents: [] };

  it("SU-2 S13: without an acceptance the hand-over is refused: 'Waiting for a pharmacist'", () => {
    const r = checkHandover(plan(), facts({}, pf));
    expect(codes(r)).toEqual(["not_accepted"]);
    expect(words(r)).toEqual(["Waiting for a pharmacist"]);
  });

  it("SU-2: an acceptance of this version clears it; the supply names the review event", () => {
    const f = facts(
      {},
      { ...pf, reviewEvents: [{ id: "acc1", prescriptionId: "L1", kind: "accepted" }] },
    );
    const r = handoverWrites(plan(), f, newId);
    expect(r.ok && r.writes.supplies[0]!.reviewEventId).toBe("acc1");
  });

  it("SU-2 RQ-9: an acceptance of an older version does not count", () => {
    const f = facts(
      {},
      { ...pf, reviewEvents: [{ id: "acc0", prescriptionId: "L0", kind: "accepted" }] },
    );
    expect(codes(checkHandover(plan(), f))).toEqual(["not_accepted"]);
  });

  it("RQ-12 S54: D-PH1-05's reason clears it only with the setting on; the supply goes to look-back", () => {
    const without = {
      ...pf,
      reviewEvents: [
        {
          id: "w1",
          prescriptionId: "L1",
          kind: "supplied_without_review" as const,
          reasonCode: "no_pharmacist",
        },
      ],
    };
    expect(codes(checkHandover(plan(), facts({}, without)))).toEqual(["not_accepted"]);
    const on = facts({ supplyWithoutReview: { settingOn: true, legalQ1OnRecord: true } }, without);
    const r = handoverWrites(plan(), on, newId);
    if (!r.ok) throw new Error("expected writes");
    expect(r.writes.lookBacks).toEqual([
      expect.objectContaining({
        kind: "flagged",
        reasons: ["supplied_without_review"],
        supplyId: r.writes.supplies[0]!.id,
      }),
    ]);
    expect(
      codes(
        checkHandover(
          plan({ actor: PHARM_ACTOR }),
          facts({ supplyWithoutReview: on.supplyWithoutReview }, { ...without, controlled: true }),
        ),
      ),
    ).toEqual(["controlled"]);
  });
});

describe("SU-7 H3 part supplies and what is left", () => {
  it("SU-7 S40: part supplied, the rest owed: both quantities recorded, the line owed", () => {
    const p = plan(
      {},
      {
        rows: [{ batchId: "B1", quantity: 14 }],
        rest: { outcome: "owed", quantityNotSupplied: 14, reasonCode: "out_of_stock" },
      },
    );
    const r = handoverWrites(p, facts({}, { decided: 28 }), newId);
    if (!r.ok) throw new Error("expected writes");
    const e = r.writes.lineEvents[0]!;
    expect(e).toMatchObject({
      kind: "owed",
      quantitySupplied: 14,
      quantityNotSupplied: 14,
      reasonCode: "out_of_stock",
      handoverId: r.writes.handover.id,
    });
    expect(lineStatus(L1, [saved(0), asEvent(e, T(5))], [], "standard")).toEqual({
      kind: "open",
      outcome: "owed",
      supplied: 14,
      notSupplied: 14,
    });
  });

  it("SU-7: a part supply from ready needs a reason for the rest", () => {
    const p = plan(
      {},
      {
        rows: [{ batchId: "B1", quantity: 14 }],
        rest: { outcome: "owed", quantityNotSupplied: 14, reasonCode: "" },
      },
    );
    expect(codes(checkHandover(p, facts()))).toEqual(["rest"]);
  });

  it("S40: a later 'Supply now' of part keeps it owed with the new quantities; of the rest closes it", () => {
    const owed = {
      status: { kind: "open" as const, outcome: "owed" as const, supplied: 14, notSupplied: 14 },
    };
    const part = handoverWrites(
      plan(
        {},
        {
          rows: [{ batchId: "B1", quantity: 7 }],
          rest: { outcome: "owed", quantityNotSupplied: 7, reasonCode: "" },
        },
      ),
      facts({}, owed),
      newId,
    );
    if (!part.ok) throw new Error("expected writes");
    expect(part.writes.lineEvents[0]!.kind).toBe("part_supplied");
    expect(applyMove(owed.status, { kind: "handover_part", quantitySupplied: 7 })).toEqual({
      ok: true,
      status: { kind: "open", outcome: "owed", supplied: 21, notSupplied: 7 },
    });
    const rest = handoverWrites(
      plan({}, { rows: [{ batchId: "B1", quantity: 14 }] }),
      facts({}, owed),
      newId,
    );
    expect(rest.ok && rest.writes.lineEvents[0]!.kind).toBe("supplied");
  });

  it("S40 H3: a quantity above what is owed is refused; a 'full' hand-over of less than is left is refused", () => {
    const owed = {
      status: { kind: "open" as const, outcome: "owed" as const, supplied: 14, notSupplied: 14 },
    };
    const over = checkHandover(
      plan({}, { rows: [{ batchId: "B1", quantity: 20 }] }),
      facts({}, owed),
    );
    expect(codes(over)).toEqual(["over_quantity"]);
    expect(words(over)).toEqual(["Fixture tablet A: only 14 left to supply."]);
    expect(
      codes(checkHandover(plan({}, { rows: [{ batchId: "B1", quantity: 7 }] }), facts({}, owed))),
    ).toEqual(["whole_quantity"]);
  });

  it("S40: part of what is owed cannot switch it to buying outside in the same step", () => {
    const owed = {
      status: { kind: "open" as const, outcome: "owed" as const, supplied: 14, notSupplied: 14 },
    };
    const p = plan(
      {},
      {
        rows: [{ batchId: "B1", quantity: 7 }],
        rest: { outcome: "buying_outside", quantityNotSupplied: 7, reasonCode: "out_of_stock" },
      },
    );
    expect(codes(checkHandover(p, facts({}, owed)))).toEqual(["rest"]);
  });
});

describe("SU-8 W4 H2 the product and its strength", () => {
  it("SU-8 S48: a different pack of the same strength is supplied by a pharmacy technician", () => {
    const r = checkHandover(
      plan({}, { productId: "P2", rows: [{ batchId: "BP2", quantity: 28 }] }),
      facts(),
    );
    expect(r).toEqual({ ok: true });
  });

  it("W4 S48: with no signed strength mapping, a different strength is refused for everyone", () => {
    const l = { productId: "P3", rows: [{ batchId: "BP3", quantity: 28 }] };
    expect(codes(checkHandover(plan({}, l), facts()))).toEqual(["strength_unsigned"]);
    expect(
      codes(
        checkHandover(
          plan(
            { actor: PHARM_ACTOR },
            { ...l, strengthChange: { reasonCode: "strength_out", pharmacistLine: "Take one" } },
          ),
          facts(),
        ),
      ),
    ).toEqual(["strength_unsigned"]);
  });

  it("SU-8 S48: once signed, a technician is refused; a pharmacist needs a reason and the pharmacist's line", () => {
    const l = { productId: "P3", rows: [{ batchId: "BP3", quantity: 28 }] };
    const signed = facts({ strengthChangeSigned: true });
    expect(codes(checkHandover(plan({}, l), signed))).toEqual(["strength_pharmacist"]);
    expect(codes(checkHandover(plan({ actor: PHARM_ACTOR }, l), signed))).toEqual([
      "strength_reason",
    ]);
    expect(
      codes(
        checkHandover(
          plan(
            { actor: PHARM_ACTOR },
            {
              ...l,
              strengthChange: { reasonCode: "strength_out", pharmacistLine: "x".repeat(81) },
            },
          ),
          signed,
        ),
      ),
    ).toEqual(["strength_reason"]);
    const r = handoverWrites(
      plan(
        { actor: PHARM_ACTOR },
        {
          ...l,
          strengthChange: { reasonCode: "strength_out", pharmacistLine: "Fixture line as typed" },
        },
      ),
      signed,
      newId,
    );
    expect(r.ok && r.writes.supplies[0]).toMatchObject({
      prescribedStrength: "10 fx",
      suppliedStrength: "20 fx",
      substitutionReason: "strength_out",
      pharmacistLine: "Fixture line as typed",
      pharmacistLineBy: "U-ph",
    });
  });

  it("SU-2: a product of another medicine is refused", () => {
    expect(
      codes(
        checkHandover(
          plan({}, { productId: "P4", rows: [{ batchId: "B1", quantity: 1 }] }),
          facts(),
        ),
      ),
    ).toContain("product");
  });

  it("H2: a strength that cannot be compared needs the supplier's check", () => {
    const l = { productId: "P5", rows: [{ batchId: "BP5", quantity: 28 }] };
    expect(codes(checkHandover(plan({}, l), facts()))).toEqual(["strength_check"]);
    expect(checkHandover(plan({}, { ...l, strengthConfirmed: true }), facts())).toEqual({
      ok: true,
    });
  });
});

describe("SU-6 SU-10 SU-12 and the hand-over as a whole", () => {
  it("SU-6 S49: the quantity is never pre-filled", () => {
    expect(quantityPrefill()).toBeNull();
    expect(quantityPrefill("1 tab twice daily for 14 days")).toBeNull();
    expect(quantityPrefill(28)).toBeNull();
  });

  it("SU-12 S50: where required, 'Not recorded' is refused and 'Emergency' passes with nothing further", () => {
    expect(codes(checkHandover(plan(), facts({ paymentRequired: true })))).toEqual(["payment"]);
    expect(
      checkHandover(plan({ payment: { status: "emergency" } }), facts({ paymentRequired: true })),
    ).toEqual({ ok: true });
    expect(paymentPasses("paid", true)).toBe(true);
    expect(paymentPasses("not_recorded", false)).toBe(true);
    expect(paymentPasses("emergency", true)).toBe(true);
  });

  it("SU-2: the actor must hold pharmacy.dispense, and the point must be live", () => {
    expect(
      codes(
        checkHandover(plan({ actor: { ...TECH_ACTOR, access: access("pharmacy.view") } }), facts()),
      ),
    ).toEqual(["permission"]);
    expect(codes(checkHandover(plan(), facts({ pointLive: false })))).toEqual(["point_not_live"]);
  });

  it("D-PH1-17: labels written by hand need the tick", () => {
    expect(codes(checkHandover(plan({ labelMode: "by_hand" }), facts()))).toEqual(["labels"]);
    const r = handoverWrites(
      plan({ labelMode: "by_hand", labelsWrittenAttested: true }),
      facts(),
      newId,
    );
    expect(r.ok && r.writes.handover.labelsWrittenAttested).toBe(true);
  });

  it("SU-10: the client key's shape; a line listed twice is refused", () => {
    expect(handoverClientKey("short")).toBe(false);
    expect(handoverClientKey("hand-over-0001")).toBe(true);
    expect(handoverClientKey("k".repeat(121))).toBe(false);
    expect(codes(checkHandover(plan({ clientKey: "x" }), facts()))).toEqual(["client_key"]);
    expect(codes(checkHandover(plan({ lines: [planLine(), planLine()] }), facts()))).toContain(
      "lines",
    );
    expect(codes(checkHandover(plan({ lines: [] }), facts()))).toEqual(["lines"]);
  });

  it("5.6: the refusal words are the drafted copy", () => {
    expect(HANDOVER_COPY.status).toBe("draft");
    expect(HANDOVER_COPY.batchShort).toBe("Batch {number} now holds {n}. Choose again.");
  });
});
