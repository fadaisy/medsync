import type { PharmacyAccess, PharmacyPermission } from "@/lib/pharmacy/access";
import type { LineInput, PharmacyLineEvent } from "@/lib/pharmacy/lines";
import type { LineEventRow, MovementRow } from "@/lib/pharmacy/supply/handover";
import type { SupplyRef } from "@/lib/pharmacy/supply/reversal";
import { describe, expect, it } from "vitest";

import { applyMove, lineStatus } from "@/lib/pharmacy/lines";
import { balances } from "@/lib/pharmacy/stock/ledger";
import {
  correctionAllowed,
  correctionWrites,
  failureNeverThrows,
  reversalAllowed,
  reversalWrites,
} from "@/lib/pharmacy/supply/reversal";

/**
 * Pharmacy Phase 1 — reversal, correction, failures after commit (SU-11, SU-13, SU-14, CD-5, Law 11).
 * Fixture data: Fixture tablet A, batch FX-001 (B1), hand-over H1, invented quantities (Law 8).
 */
const T0 = new Date("2026-10-12T07:00:00.000Z");
const T = (min: number) => new Date(T0.getTime() + min * 60_000);
const access = (...p: PharmacyPermission[]): PharmacyAccess => ({ permissions: new Set(p) });
const PHARMACIST = access(
  "pharmacy.view",
  "pharmacy.review",
  "pharmacy.dispense",
  "pharmacy.stock",
  "pharmacy.controlled",
);
const TECHNICIAN = access("pharmacy.view", "pharmacy.dispense", "pharmacy.stock");
const IN_CHARGE = access("pharmacy.view", "pharmacy.dispense", "pharmacy.stock", "pharmacy.manage");
const ACTOR = { userId: "U-ph", cadre: "Pharmacist" };
let n = 0;
const newId = () => `id-${++n}`;

const supply = (o: Partial<SupplyRef> = {}): SupplyRef => ({
  id: "S1",
  handoverId: "H1",
  hospitalId: "HOSP",
  dispensingPointId: "OP",
  patientUserId: "PT9",
  prescriptionId: "L1",
  batchId: "B1",
  quantity: 28,
  ...o,
});
const day = {
  suppliedLocalDay: "2026-10-12",
  enteredAfterDowntime: false,
  enteredLocalDay: "2026-10-12",
  today: "2026-10-12",
  controlled: false,
  witness: null,
};

const ledger = (rows: { batchId: string; quantity: number; kind: MovementRow["kind"] }[]) =>
  balances(
    rows.map((m, i) => ({
      id: `m${i}`,
      batchId: m.batchId,
      pointId: "OP",
      kind: m.kind,
      quantity: m.quantity,
      effectiveAt: T0,
      recordedAt: T0,
      downtime: false,
    })),
  );

const ev = (
  kind: PharmacyLineEvent["kind"],
  min: number,
  o: Partial<PharmacyLineEvent> = {},
): PharmacyLineEvent => ({
  id: `${kind}-${min}`,
  kind,
  occurredAt: T(min),
  effectiveAt: T(min),
  lane: "standard",
  quantitySupplied: null,
  quantityNotSupplied: null,
  reasonCode: null,
  handoverId: null,
  actorCadre: "Pharmacist",
  ...o,
});
const asEvent = (e: LineEventRow, min: number): PharmacyLineEvent =>
  ev(e.kind, min, { reasonCode: e.reasonCode, handoverId: e.handoverId, lane: e.lane });
const L1: LineInput = { id: "L1", state: "active", cosign: "none", createdAt: T(-30) };
const handedOver = [
  ev("decision_saved", 0),
  ev("supplied", 5, { handoverId: "H1", quantitySupplied: 28 }),
];

describe("SU-11 who may reverse, and when", () => {
  it("SU-11 S51: the same hospital-local day, by a pharmacist or the in-charge", () => {
    expect(reversalAllowed({ ...day, actorHolds: PHARMACIST })).toEqual({ ok: true });
    expect(reversalAllowed({ ...day, actorHolds: IN_CHARGE })).toEqual({ ok: true });
    expect(reversalAllowed({ ...day, actorHolds: TECHNICIAN })).toEqual({
      ok: false,
      reason: "not_permitted",
    });
  });

  it("SU-11 S51: the next day 'Reverse' is not offered", () => {
    expect(reversalAllowed({ ...day, today: "2026-10-13", actorHolds: PHARMACIST })).toEqual({
      ok: false,
      reason: "not_today",
    });
  });

  it("SU-11: a back-entered supply counts from the day it was entered", () => {
    const back = {
      ...day,
      suppliedLocalDay: "2026-10-11",
      enteredAfterDowntime: true,
      enteredLocalDay: "2026-10-12",
    };
    expect(reversalAllowed({ ...back, actorHolds: PHARMACIST })).toEqual({ ok: true });
    expect(
      reversalAllowed({ ...back, enteredAfterDowntime: false, actorHolds: PHARMACIST }),
    ).toEqual({ ok: false, reason: "not_today" });
  });

  it("CD-5: a controlled supply also needs pharmacy.controlled and a witness", () => {
    const c = { ...day, controlled: true };
    expect(reversalAllowed({ ...c, actorHolds: PHARMACIST })).toEqual({
      ok: false,
      reason: "witness_needed",
    });
    expect(reversalAllowed({ ...c, actorHolds: PHARMACIST, witness: "att-1" })).toEqual({
      ok: true,
    });
    expect(reversalAllowed({ ...c, actorHolds: IN_CHARGE, witness: "att-1" })).toEqual({
      ok: false,
      reason: "controlled_permission",
    });
  });
});

describe("SU-11 the reversal's rows", () => {
  it("SU-11 S51: pack fit: the quantity is back in its batch", () => {
    const r = reversalWrites({
      supplies: [supply()],
      packFit: true,
      reasonCode: "handed_back",
      actor: ACTOR,
      witness: null,
      now: T(30),
      newId,
    });
    if (!r.ok) throw new Error("expected writes");
    expect(r.movements).toEqual([
      expect.objectContaining({
        kind: "reversed",
        quantity: 28,
        batchId: "B1",
        sourceKind: "reversal",
      }),
    ]);
    expect(r.reversals[0]).toMatchObject({
      supplyId: "S1",
      packFit: true,
      returnedMovementId: r.movements[0]!.id,
      writeoffMovementId: null,
    });
    const shelf = ledger([
      { batchId: "B1", quantity: 140, kind: "received" },
      { batchId: "B1", quantity: -28, kind: "supplied" },
      ...r.movements,
    ]);
    expect(shelf.get("B1")).toBe(140);
  });

  it("SU-11 S51: pack not fit: back and written off in the same step; the shelf figure is unchanged", () => {
    const r = reversalWrites({
      supplies: [supply()],
      packFit: false,
      reasonCode: "handed_back",
      actor: ACTOR,
      witness: null,
      now: T(30),
      newId,
    });
    if (!r.ok) throw new Error("expected writes");
    expect(r.movements.map((m) => [m.kind, m.quantity])).toEqual([
      ["reversed", 28],
      ["adjusted", -28],
    ]);
    expect(r.reversals[0]!.writeoffMovementId).toBe(r.movements[1]!.id);
    const shelf = ledger([
      { batchId: "B1", quantity: 140, kind: "received" },
      { batchId: "B1", quantity: -28, kind: "supplied" },
      ...r.movements,
    ]);
    expect(shelf.get("B1")).toBe(112);
  });

  it("SU-11 S51: the line returns to where it was before the hand-over; the supply stays in the record", () => {
    const r = reversalWrites({
      supplies: [supply()],
      packFit: true,
      reasonCode: "handed_back",
      actor: ACTOR,
      witness: null,
      now: T(30),
      newId,
    });
    if (!r.ok) throw new Error("expected writes");
    expect(r.lineEvents).toEqual([
      expect.objectContaining({ kind: "returned", handoverId: "H1", reasonCode: "handed_back" }),
    ]);
    expect(lineStatus(L1, handedOver, [], "standard")).toEqual({
      kind: "closed",
      outcome: "supplied",
    });
    expect(lineStatus(L1, [...handedOver, asEvent(r.lineEvents[0]!, 30)], [], "standard")).toEqual({
      kind: "stage",
      stage: "ready",
    });
  });

  it("SU-11 S38: a line split across two batches: two reversal rows, one return of the line", () => {
    const r = reversalWrites({
      supplies: [supply({ quantity: 10 }), supply({ id: "S2", batchId: "B2", quantity: 18 })],
      packFit: true,
      reasonCode: "handed_back",
      actor: ACTOR,
      witness: null,
      now: T(30),
      newId,
    });
    expect(r.ok && r.reversals.map((x) => x.supplyId)).toEqual(["S1", "S2"]);
    expect(r.ok && r.lineEvents).toHaveLength(1);
  });

  it("SU-11: a reason is needed, and the supplies come from one hand-over", () => {
    const base = { packFit: true, actor: ACTOR, witness: null, now: T(30), newId };
    expect(reversalWrites({ ...base, supplies: [supply()], reasonCode: " " })).toEqual({
      ok: false,
      reason: "no_reason",
    });
    expect(
      reversalWrites({
        ...base,
        supplies: [supply(), supply({ id: "S9", handoverId: "H2" })],
        reasonCode: "handed_back",
      }),
    ).toEqual({ ok: false, reason: "mixed_handovers" });
    expect(reversalWrites({ ...base, supplies: [], reasonCode: "handed_back" })).toEqual({
      ok: false,
      reason: "no_supplies",
    });
  });
});

describe("SU-14 recorded in error", () => {
  it("SU-14 S52: only the in-charge; a controlled supply also needs pharmacy.controlled and a witness", () => {
    expect(correctionAllowed({ actorHolds: IN_CHARGE, controlled: false, witness: null })).toEqual({
      ok: true,
    });
    expect(correctionAllowed({ actorHolds: PHARMACIST, controlled: false, witness: null })).toEqual(
      {
        ok: false,
        reason: "not_permitted",
      },
    );
    expect(
      correctionAllowed({ actorHolds: IN_CHARGE, controlled: true, witness: "att-1" }),
    ).toEqual({
      ok: false,
      reason: "controlled_permission",
    });
  });

  it("SU-14 S52: a three-day-old supply: no stock moves, the line is back where it stood and can be supplied", () => {
    const r = correctionWrites({
      supplies: [supply()],
      reasonCode: "wrong_patient",
      note: "Fixture note",
      actor: { userId: "U-ic", cadre: "Pharmacist" },
      now: T(3 * 24 * 60),
      newId,
    });
    if (!r.ok) throw new Error("expected writes");
    expect(r.movements).toEqual([]);
    expect(r.corrections).toEqual([
      expect.objectContaining({
        supplyId: "S1",
        reasonCode: "wrong_patient",
        note: "Fixture note",
      }),
    ]);
    const status = lineStatus(
      L1,
      [...handedOver, asEvent(r.lineEvents[0]!, 3 * 24 * 60)],
      [],
      "standard",
    );
    expect(status).toEqual({ kind: "stage", stage: "ready" });
    expect(applyMove(status, { kind: "handover_full", quantitySupplied: 28 }).ok).toBe(true);
  });
});

describe("SU-13 Law 11 a failure after commit never throws", () => {
  it("SU-13: a rejected promise becomes words", async () => {
    await expect(
      failureNeverThrows(() => Promise.reject(new Error("printer")), "Labels did not print."),
    ).resolves.toEqual({ ok: false, words: "Labels did not print." });
  });

  it("SU-13: a synchronous throw becomes words too; success is ok", async () => {
    await expect(
      failureNeverThrows(() => {
        throw new Error("sms");
      }, "No message was sent."),
    ).resolves.toEqual({ ok: false, words: "No message was sent." });
    await expect(failureNeverThrows(async () => "sent", "unused")).resolves.toEqual({ ok: true });
  });
});
