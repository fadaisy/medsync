import "server-only";

import type { ComparisonPair } from "./acceptance";
import type { InUseKind } from "./lots-in-use";
import type { LotRefusal, LotState, StockLot } from "./stock";
import type { EmrTx } from "@/lib/emr/db";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { fill, LAB3 } from "@/content/lab-phase-3";
import {
  devices,
  labControlChecks,
  labDeliveries,
  labLotAcceptances,
  labLotsInUse,
  labQcRuns,
  labSettings,
  labStockCounts,
  labStockItems,
  labStockLotEvents,
  labStockLots,
  labStockTransactions,
} from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import {
  acceptanceNeeded,
  acceptanceOutcome,
  evaluateLotComparison,
  grandfatherLot,
} from "./acceptance";
import { loadConfigs } from "./catalogue-v2";
import { lotSnapshot } from "./lots-in-use";
import { openAutomaticNc } from "./nc-store";
import { inForce } from "./signed-config";
import { canMoveLot, countLine, fefoChoice, lotRefusal } from "./stock";

/**
 * Stock, lots and acceptance on the database (Lab Phase 3 Step 4, §6.1–§6.3; GATE A §3.2 0112, §5.1). Every
 * write runs in the caller's clinical-writer transaction (audited by trigger). On hand is the ledger's sum; a
 * lot's state moves only with its event in the same transaction (the 0112 trigger refuses anything else).
 * Hospital-local days are Africa/Kampala (DEFAULT_TIME_ZONE): MedSync has no per-hospital zone yet.
 */

type Actor = { userId: string; hospitalId: string };
const TZ = DEFAULT_TIME_ZONE;
const invalid = (m: string) => new EmrWriteError("invalid", m);
const notFound = (m: string) => new EmrWriteError("not_found", m);

/** LA-4, ST-8: the refusal in words, from the Phase 3 copy. */
export function refusalWords(r: LotRefusal, lot: string): string {
  const t = {
    not_accepted: LAB3.lotNotAccepted,
    quarantined: LAB3.lotQuarantined,
    expired: LAB3.lotExpired,
    rejected: LAB3.lotRejected,
    finished: LAB3.lotFinished,
  }[r];
  return fill(t, { lot });
}

/** The selectable-for-patients check at the server (LA-4), refusing in words. */
export function assertSelectable(lot: Pick<StockLot, "state" | "useBy" | "lot">, at: Date) {
  const r = lotRefusal(lot, at, TZ);
  if (r) throw invalid(refusalWords(r, lot.lot));
}

const toLot = (
  l: typeof labStockLots.$inferSelect,
): StockLot & { acceptedBasis: string | null } => ({
  id: l.id,
  hospitalId: l.hospitalId,
  itemId: l.itemId,
  lot: l.lot,
  useBy: l.useBy,
  receivedAt: l.receivedAt,
  state: l.state as LotState,
  acceptedBasis: l.acceptedBasis,
});

async function lotOf(tx: EmrTx, hospitalId: string, lotId: string) {
  const [l] = await tx
    .select()
    .from(labStockLots)
    .where(and(eq(labStockLots.id, lotId), eq(labStockLots.hospitalId, hospitalId)));
  if (!l) throw notFound("That lot is not in this lab's stock.");
  return toLot(l);
}

/**
 * §5.1: one state change = its event and the move, in this transaction. `via` passes through intermediate
 * states (received → in acceptance → rejected), each with its own event.
 */
async function moveLot(
  tx: EmrTx,
  a: Actor,
  lot: { id: string; state: LotState },
  path: readonly LotState[],
  e: { reason?: string | null; refKind?: string; refId?: string; basis?: string },
  now: Date,
) {
  let from = lot.state;
  for (const to of path) {
    if (!canMoveLot(from, to))
      throw new EmrWriteError("conflict", "This lot cannot make that change from its state.");
    await tx.insert(labStockLotEvents).values({
      lotId: lot.id,
      hospitalId: a.hospitalId,
      fromState: from,
      toState: to,
      reason: e.reason ?? null,
      refKind: e.refKind ?? null,
      refId: e.refId ?? null,
      actor: a.userId,
      at: now,
    });
    await tx
      .update(labStockLots)
      .set({ state: to, ...(to === "accepted" && e.basis ? { acceptedBasis: e.basis } : {}) })
      .where(eq(labStockLots.id, lot.id));
    from = to;
  }
}

/** ST-3: on hand of one lot, from the ledger. */
async function lotOnHand(tx: EmrTx, lotId: string): Promise<number> {
  const [r] = await tx
    .select({ n: sql<string>`coalesce(sum(${labStockTransactions.quantity}), 0)` })
    .from(labStockTransactions)
    .where(eq(labStockTransactions.lotId, lotId));
  return Number(r?.n ?? 0);
}

async function replayed(tx: EmrTx, keys: readonly string[]) {
  const [r] = await tx
    .select({ id: labStockTransactions.id, deliveryId: labStockTransactions.deliveryId })
    .from(labStockTransactions)
    .where(inArray(labStockTransactions.clientKey, [...keys]))
    .limit(1);
  return r ?? null;
}

/* ─── Items and levels (ST-1, ST-5) ─────────────────────────────────── */

export interface ItemInput {
  id?: string;
  name: string;
  kind: "reagent" | "kit" | "control" | "calibrator" | "stain" | "consumable" | "strip";
  unitOfIssue: string;
  packSize: number | null;
  testsPerUnit: number | null;
  testCodes: string[];
  conceptIds: string[];
  hmisTracerCode: string | null;
  storageDeviceId: string | null;
  /** ST-5: months of stock, set by the laboratory lead (operational). */
  minMonths: number | null;
  maxMonths: number | null;
}

export async function saveItem(tx: EmrTx, a: Actor, input: ItemInput, now: Date) {
  if (input.minMonths !== null && input.maxMonths !== null && input.minMonths > input.maxMonths)
    throw invalid("The minimum cannot be above the maximum.");
  const v = {
    name: input.name,
    kind: input.kind,
    unitOfIssue: input.unitOfIssue,
    packSize: input.packSize,
    testsPerUnit: input.testsPerUnit === null ? null : String(input.testsPerUnit),
    testCodes: input.testCodes,
    conceptIds: input.conceptIds,
    hmisTracerCode: input.hmisTracerCode,
    storageDeviceId: input.storageDeviceId,
    minMonths: input.minMonths === null ? null : String(input.minMonths),
    maxMonths: input.maxMonths === null ? null : String(input.maxMonths),
  };
  if (!input.id) {
    const [r] = await tx
      .insert(labStockItems)
      .values({ hospitalId: a.hospitalId, ...v, createdBy: a.userId, createdAt: now })
      .returning({ id: labStockItems.id });
    return r!.id;
  }
  const [r] = await tx
    .update(labStockItems)
    .set({ ...v, updatedBy: a.userId, updatedAt: now })
    .where(and(eq(labStockItems.id, input.id), eq(labStockItems.hospitalId, a.hospitalId)))
    .returning({ id: labStockItems.id });
  if (!r) throw notFound("That item is not in this lab's stock list.");
  return r.id;
}

/** Operational settings (never clinical): set by the lead, audited, not signed (GATE A §3.1). */
export interface QualitySettings {
  expiryWindowDays?: number | null;
  lookBackMonths?: number | null;
  countEveryDays?: number | null;
  tolerancePct?: number | null;
}

export async function setQualitySettings(tx: EmrTx, a: Actor, input: QualitySettings, now: Date) {
  const patch = JSON.stringify(input);
  await tx
    .insert(labSettings)
    .values({ hospitalId: a.hospitalId, quality: input, updatedBy: a.userId })
    .onConflictDoUpdate({
      target: labSettings.hospitalId,
      set: {
        quality: sql`${labSettings.quality} || ${patch}::jsonb`,
        updatedBy: a.userId,
        updatedAt: now,
      },
    });
}

/* ─── Deliveries (§5.6; ST-3, LA-2) ─────────────────────────────────── */

export interface DeliveryLineInput {
  itemId: string;
  lot: string;
  useBy: string | null;
  received: number;
  /** Damaged or refused on arrival: recorded against the supplier, never enters stock. */
  rejected: number;
  condition: { sealed: boolean; coldChain: boolean | null; note: string | null };
}

export type LineNext = "none" | "acceptance" | "controls" | "certificate" | "no_plan";

/**
 * S1: only accepted quantities enter stock (one receipt per line); a new lot starts `received` and moves at
 * once as its signed plan says (none → accepted; comparison or controls → in acceptance; certificate → waits).
 * A lot with no plan in force waits too, and the screen says so (Law 8).
 */
export async function receiveDelivery(
  tx: EmrTx,
  a: Actor,
  input: {
    supplier: "nms" | "jms" | "other";
    supplierName: string | null;
    noteNumber: string | null;
    receivedAt: Date;
    lines: DeliveryLineInput[];
    clientKey: string;
  },
  now: Date,
): Promise<string> {
  const keys = input.lines.map((_, i) => `${input.clientKey}:${i}`);
  // ponytail: replay is found through the receipts; a delivery with nothing accepted can be saved twice.
  const again = await replayed(tx, keys);
  if (again?.deliveryId) return again.deliveryId;
  const itemIds = [...new Set(input.lines.map((l) => l.itemId))];
  const items = await tx
    .select({ id: labStockItems.id, name: labStockItems.name })
    .from(labStockItems)
    .where(and(eq(labStockItems.hospitalId, a.hospitalId), inArray(labStockItems.id, itemIds)));
  if (items.length !== itemIds.length) throw notFound("An item is not in this lab's stock list.");
  const configs = await loadConfigs(tx, a.hospitalId);

  const lines = [];
  for (const l of input.lines) {
    if (l.rejected > l.received) throw invalid("More rejected than received on a line.");
    const [existing] = await tx
      .select()
      .from(labStockLots)
      .where(
        and(
          eq(labStockLots.itemId, l.itemId),
          eq(labStockLots.lot, l.lot),
          or(isNull(labStockLots.acceptedBasis), ne(labStockLots.acceptedBasis, "before_medsync")),
        ),
      );
    const plan = inForce(configs, "acceptance_plan", l.itemId, now)?.payload ?? null;
    let lot = existing ? toLot(existing) : null;
    let next: LineNext = plan ? "none" : "no_plan";
    if (!lot) {
      const [row] = await tx
        .insert(labStockLots)
        .values({
          hospitalId: a.hospitalId,
          itemId: l.itemId,
          lot: l.lot,
          useBy: l.useBy,
          receivedAt: input.receivedAt,
          condition: l.condition,
        })
        .returning();
      lot = toLot(row!);
      if (plan?.method === "none")
        await moveLot(tx, a, lot, ["accepted"], { refKind: "delivery", basis: "none" }, now);
      else if (plan?.method === "certificate") next = "certificate";
      else if (plan) {
        await moveLot(tx, a, lot, ["in_acceptance"], { refKind: "delivery" }, now);
        next = plan.method === "lot_comparison" ? "acceptance" : "controls";
      }
    } else if (plan && acceptanceNeeded(plan, "new_shipment")) next = "controls"; // informs (LA-2)
    lines.push({
      itemId: l.itemId,
      lotId: lot.id,
      lot: l.lot,
      received: l.received,
      accepted: l.received - l.rejected,
      rejected: l.rejected,
      condition: l.condition,
      next,
    });
  }
  const [d] = await tx
    .insert(labDeliveries)
    .values({
      hospitalId: a.hospitalId,
      supplier: input.supplier,
      supplierName: input.supplierName,
      noteNumber: input.noteNumber,
      receivedAt: input.receivedAt,
      receivedBy: a.userId,
      lines,
    })
    .returning({ id: labDeliveries.id });
  const receipts = lines.flatMap((l, i) =>
    l.accepted > 0
      ? [
          {
            hospitalId: a.hospitalId,
            itemId: l.itemId,
            lotId: l.lotId,
            kind: "receipt",
            quantity: l.accepted,
            deliveryId: d!.id,
            actor: a.userId,
            at: now,
            clientKey: keys[i]!,
          },
        ]
      : [],
  );
  if (receipts.length) await tx.insert(labStockTransactions).values(receipts);
  return d!.id;
}

/* ─── Issue, adjust, write off, count (ST-3, ST-6, ST-8, ST-10) ─────── */

async function itemLots(tx: EmrTx, a: Actor, itemId: string) {
  return (
    await tx
      .select()
      .from(labStockLots)
      .where(and(eq(labStockLots.hospitalId, a.hospitalId), eq(labStockLots.itemId, itemId)))
  ).map(toLot);
}

/**
 * ST-6, ST-8: issue from the lot FEFO offers, or another with a reason; never an expired, quarantined or
 * unaccepted lot, never more than its lot holds. The first issue puts an accepted lot in use; the last
 * finishes it.
 */
export async function issueStock(
  tx: EmrTx,
  a: Actor,
  input: {
    itemId: string;
    lotId: string;
    quantity: number;
    toKind: "bench" | "device" | "ward";
    toRef: string | null;
    fefoReason: string | null;
    clientKey: string;
  },
  now: Date,
): Promise<string> {
  const again = await replayed(tx, [input.clientKey]);
  if (again) return again.id;
  const lots = await itemLots(tx, a, input.itemId);
  const choice = fefoChoice(lots, {
    hospitalId: a.hospitalId,
    itemId: input.itemId,
    chosenLotId: input.lotId,
    reason: input.fefoReason,
    at: now,
    timeZone: TZ,
  });
  const lot = lots.find((l) => l.id === input.lotId);
  if (!choice.ok) {
    if (choice.error === "unknown_lot" || !lot)
      throw notFound("That lot is not in this lab's stock.");
    if (choice.error === "fefo_reason_required")
      throw invalid("This is not the lot that expires first: say why you are using it.");
    throw invalid(refusalWords(choice.error, lot.lot));
  }
  const left = (await lotOnHand(tx, lot!.id)) - input.quantity;
  if (left < 0) throw invalid(`Only ${left + input.quantity} on hand in lot ${lot!.lot}.`);
  const [t] = await tx
    .insert(labStockTransactions)
    .values({
      hospitalId: a.hospitalId,
      itemId: input.itemId,
      lotId: lot!.id,
      kind: "issue",
      quantity: -input.quantity,
      toKind: input.toKind,
      toRef: input.toRef,
      fefoReason: choice.fefoReason,
      actor: a.userId,
      at: now,
      clientKey: input.clientKey,
    })
    .returning({ id: labStockTransactions.id });
  const path: LotState[] = [
    ...(lot!.state === "accepted" ? (["in_use"] as const) : []),
    ...(left === 0 ? (["finished"] as const) : []),
  ];
  if (path.length) await moveLot(tx, a, lot!, path, { refKind: "issue", refId: t!.id }, now);
  return t!.id;
}

/** ST-3: an adjustment (signed), a write-off (expired or damaged) or a return, each with its reason. */
export async function recordMovement(
  tx: EmrTx,
  a: Actor,
  input: {
    kind: "adjustment" | "write_off" | "return";
    lotId: string;
    quantity: number;
    reason: string;
    clientKey: string;
  },
  now: Date,
): Promise<string> {
  const again = await replayed(tx, [input.clientKey]);
  if (again) return again.id;
  const lot = await lotOf(tx, a.hospitalId, input.lotId);
  const q =
    input.kind === "write_off"
      ? -Math.abs(input.quantity)
      : input.kind === "return"
        ? Math.abs(input.quantity)
        : input.quantity;
  if (q === 0) throw invalid("Type a quantity.");
  if ((await lotOnHand(tx, lot.id)) + q < 0)
    throw invalid(`That would take lot ${lot.lot} below nothing on hand.`);
  const [t] = await tx
    .insert(labStockTransactions)
    .values({
      hospitalId: a.hospitalId,
      itemId: lot.itemId,
      lotId: lot.id,
      kind: input.kind,
      quantity: q,
      reason: input.reason,
      actor: a.userId,
      at: now,
      clientKey: input.clientKey,
    })
    .returning({ id: labStockTransactions.id });
  return t!.id;
}

/** ST-10, S8: a count per lot; a discrepancy needs its reason and becomes a `count` row of that size. */
export async function recordCount(
  tx: EmrTx,
  a: Actor,
  input: {
    lines: { lotId: string; counted: number; reason: string | null }[];
    clientKey: string;
  },
  now: Date,
): Promise<string> {
  const keys = input.lines.map((_, i) => `${input.clientKey}:${i}`);
  const again = await replayed(tx, keys);
  if (again) return again.id;
  const lines = [];
  for (const l of input.lines) {
    const lot = await lotOf(tx, a.hospitalId, l.lotId);
    const expected = await lotOnHand(tx, lot.id);
    const c = countLine({ expected, counted: l.counted, reason: l.reason });
    if (!c.ok) throw invalid(`Lot ${lot.lot}: the count differs from the record, so say why.`);
    lines.push({
      itemId: lot.itemId,
      lotId: lot.id,
      expected,
      counted: l.counted,
      discrepancy: c.discrepancy,
      reason: l.reason?.trim() || null,
    });
  }
  const [c] = await tx
    .insert(labStockCounts)
    .values({ hospitalId: a.hospitalId, countedAt: now, countedBy: a.userId, lines })
    .returning({ id: labStockCounts.id });
  await tx.insert(labStockTransactions).values(
    lines.map((l, i) => ({
      hospitalId: a.hospitalId,
      itemId: l.itemId,
      lotId: l.lotId,
      kind: "count",
      quantity: l.discrepancy,
      reason: l.reason,
      countId: c!.id,
      actor: a.userId,
      at: now,
      clientKey: keys[i]!,
    })),
  );
  return c!.id;
}

/* ─── Quarantine (§5.1) ─────────────────────────────────────────────── */

export async function quarantineLot(
  tx: EmrTx,
  a: Actor,
  input: { lotId: string; reason: string },
  now: Date,
) {
  const lot = await lotOf(tx, a.hospitalId, input.lotId);
  await moveLot(tx, a, lot, ["quarantined"], { reason: input.reason, refKind: "lead" }, now);
}

/** Quarantined → accepted: the lead releases after a passing rerun (basis kept, or QC). */
export async function releaseLotFromQuarantine(
  tx: EmrTx,
  a: Actor,
  input: { lotId: string; reason: string },
  now: Date,
) {
  const lot = await lotOf(tx, a.hospitalId, input.lotId);
  await moveLot(
    tx,
    a,
    lot,
    ["accepted"],
    { reason: input.reason, refKind: "lead", basis: lot.acceptedBasis ?? "qc" },
    now,
  );
}

/* ─── Acceptance (§6.2; LA-1..LA-6) ─────────────────────────────────── */

/**
 * QC evidence on the new lot: accepted or warning QC runs here, or passing control checks of this lot.
 * Every id must be found, at this hospital, and passing.
 */
async function qcEvidence(tx: EmrTx, a: Actor, lotId: string, ids: readonly string[]) {
  if (ids.length === 0) return undefined;
  const [runs, checks] = await Promise.all([
    tx
      .select({ id: labQcRuns.id })
      .from(labQcRuns)
      .where(
        and(
          inArray(labQcRuns.id, [...ids]),
          eq(labQcRuns.hospitalId, a.hospitalId),
          inArray(labQcRuns.decision, ["accepted", "warning"]),
        ),
      ),
    tx
      .select({ id: labControlChecks.id })
      .from(labControlChecks)
      .where(
        and(
          inArray(labControlChecks.id, [...ids]),
          eq(labControlChecks.hospitalId, a.hospitalId),
          eq(labControlChecks.lotId, lotId),
          eq(labControlChecks.outcome, "pass"),
        ),
      ),
  ]);
  if (runs.length + checks.length !== new Set(ids).size)
    throw invalid("A QC record named here is not an accepted run or a passing check of this lot.");
  return true;
}

async function planOf(tx: EmrTx, a: Actor, itemId: string, now: Date) {
  return inForce(await loadConfigs(tx, a.hospitalId), "acceptance_plan", itemId, now);
}

/**
 * S2: Accept lot, only when the signed plan in force is met by the evidence: every comparison sample within
 * the criterion (LA-3), QC on the new lot where the plan asks, or the certificate where allowed.
 */
export async function acceptLot(
  tx: EmrTx,
  a: Actor,
  input: {
    lotId: string;
    pairs: ComparisonPair[];
    qcIds: string[];
    certificate: string | null;
  },
  now: Date,
): Promise<string> {
  const lot = await lotOf(tx, a.hospitalId, input.lotId);
  if (lot.state !== "received" && lot.state !== "in_acceptance")
    throw new EmrWriteError("conflict", "This lot is not waiting for acceptance.");
  const plan = await planOf(tx, a, lot.itemId, now);
  if (!plan) {
    const [i] = await tx
      .select({ name: labStockItems.name })
      .from(labStockItems)
      .where(eq(labStockItems.id, lot.itemId));
    throw new EmrWriteError(
      "config",
      fill(LAB3.noAcceptancePlan, { Item: i?.name ?? "This item" }),
    );
  }
  const comparison =
    plan.payload.method === "lot_comparison"
      ? evaluateLotComparison(plan.payload, input.pairs).outcome
      : undefined;
  const out = acceptanceOutcome(plan.payload, {
    comparison,
    qcPassed: await qcEvidence(tx, a, lot.id, input.qcIds),
    certificateAccepted: !!input.certificate?.trim() && plan.payload.certificateAllowed,
  });
  if (out.kind !== "accepted")
    throw invalid(
      comparison === "outside"
        ? "A sample is outside the criterion: this lot cannot be accepted. Reject it with a reason."
        : "The plan is not met yet: record every sample, and QC on the new lot where the plan asks.",
    );
  const [r] = await tx
    .insert(labLotAcceptances)
    .values({
      hospitalId: a.hospitalId,
      lotId: lot.id,
      planConfigId: plan.id,
      planVersion: plan.version,
      method: plan.payload.method,
      pairs: input.pairs,
      qcCheckIds: input.qcIds,
      certificatePath: input.certificate?.trim() || null,
      outcome: "accepted",
      decidedBy: a.userId,
      decidedAt: now,
    })
    .returning({ id: labLotAcceptances.id });
  await moveLot(
    tx,
    a,
    lot,
    ["accepted"],
    { refKind: "acceptance", refId: r!.id, basis: out.basis },
    now,
  );
  return r!.id;
}

/** S3: Reject lot, with the reason; a lot rejected opens a nonconformity (NC-1, source lot_rejected). */
export async function rejectLot(
  tx: EmrTx,
  a: Actor,
  input: { lotId: string; reason: string; pairs: ComparisonPair[] },
  now: Date,
): Promise<string> {
  const lot = await lotOf(tx, a.hospitalId, input.lotId);
  const plan = await planOf(tx, a, lot.itemId, now);
  const [r] = await tx
    .insert(labLotAcceptances)
    .values({
      hospitalId: a.hospitalId,
      lotId: lot.id,
      planConfigId: plan?.id ?? null,
      planVersion: plan?.version ?? null,
      method: plan?.payload.method ?? "none",
      pairs: input.pairs,
      outcome: "rejected",
      reason: input.reason,
      decidedBy: a.userId,
      decidedAt: now,
    })
    .returning({ id: labLotAcceptances.id });
  const path: LotState[] = lot.state === "received" ? ["in_acceptance", "rejected"] : ["rejected"];
  await moveLot(
    tx,
    a,
    lot,
    path,
    { reason: input.reason, refKind: "acceptance", refId: r!.id },
    now,
  );
  await openAutomaticNc(
    tx,
    a.hospitalId,
    {
      source: "lot_rejected",
      sourceRef: lot.id,
      deviceId: null,
      title: `Lot ${lot.lot} rejected`,
      whatHappened: input.reason,
    },
    now,
  );
  return r!.id;
}

/** LA-6, S10: lots on hand at switch-on, accepted (before MedSync) on the lead's written statement. */
export async function grandfatherLots(
  tx: EmrTx,
  a: Actor,
  input: {
    statement: string;
    lots: { itemId: string; lot: string; useBy: string | null; quantity: number }[];
    clientKey: string;
  },
  now: Date,
): Promise<string[]> {
  const g = grandfatherLot(input.statement);
  if (!g || g.statement.length < 10)
    throw invalid("Write the statement: which lots were on hand, and that they were in use.");
  const keys = input.lots.map((_, i) => `${input.clientKey}:${i}`);
  if (await replayed(tx, keys)) return [];
  const ids: string[] = [];
  for (const [i, l] of input.lots.entries()) {
    const [item] = await tx
      .select({ id: labStockItems.id })
      .from(labStockItems)
      .where(and(eq(labStockItems.id, l.itemId), eq(labStockItems.hospitalId, a.hospitalId)));
    if (!item) throw notFound("An item is not in this lab's stock list.");
    const [lot] = await tx
      .insert(labStockLots)
      .values({
        hospitalId: a.hospitalId,
        itemId: l.itemId,
        lot: l.lot,
        useBy: l.useBy,
        receivedAt: now,
        state: g.state,
        acceptedBasis: g.acceptedBasis,
        statement: g.statement,
      })
      .returning({ id: labStockLots.id });
    await tx.insert(labStockLotEvents).values({
      lotId: lot!.id,
      hospitalId: a.hospitalId,
      toState: g.state,
      reason: "On hand when stock was switched on",
      refKind: "switch_on",
      actor: a.userId,
      at: now,
    });
    if (l.quantity > 0)
      await tx.insert(labStockTransactions).values({
        hospitalId: a.hospitalId,
        itemId: l.itemId,
        lotId: lot!.id,
        kind: "receipt",
        quantity: l.quantity,
        reason: "On hand when stock was switched on",
        actor: a.userId,
        at: now,
        clientKey: keys[i]!,
      });
    ids.push(lot!.id);
  }
  return ids;
}

/* ─── Lots in use (§6.3; LU-1, LU-2) ────────────────────────────────── */

/**
 * LU-2, LA-4: a lot set in use at an analyser, a bench or a bedside device must be selectable now (accepted or
 * in use, not expired, hospital-local day). Setting an accepted lot in use moves it to in use.
 */
export async function setLotInUse(
  tx: EmrTx,
  a: Actor,
  input: {
    lotId: string;
    deviceId: string | null;
    sectionId: string | null;
    conceptId: string | null;
    kind: "reagent" | "calibrator" | "control" | "strip" | "kit";
  },
  now: Date,
): Promise<string> {
  if (!input.deviceId && !input.sectionId) throw invalid("Choose the analyser, bench or device.");
  const lot = await lotOf(tx, a.hospitalId, input.lotId);
  assertSelectable(lot, now);
  if (input.deviceId) {
    const [d] = await tx
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.id, input.deviceId), eq(devices.hospitalId, a.hospitalId)));
    if (!d) throw notFound("That device is not at this hospital.");
  }
  const [r] = await tx
    .insert(labLotsInUse)
    .values({
      hospitalId: a.hospitalId,
      deviceId: input.deviceId,
      sectionId: input.sectionId,
      conceptId: input.conceptId,
      kind: input.kind,
      lotId: lot.id,
      fromAt: now,
      setBy: a.userId,
    })
    .returning({ id: labLotsInUse.id });
  if (lot.state === "accepted")
    await moveLot(tx, a, lot, ["in_use"], { refKind: "lot_in_use", refId: r!.id }, now);
  return r!.id;
}

/* ─── What a released result was made with (LU-3, Law 4) ────────────── */

export type LotsJson = "not_recorded" | Partial<Record<string, { id: string; lot: string }>>;

/**
 * LU-3: per component, the lots in use at the device at the result time (a concept's own lot wins over the
 * device's), with their numbers, or "not_recorded". Read once per release.
 * ponytail: the place is the device (analyser profile or bedside device); bench-only lots (section rows)
 * join here when results carry their section.
 */
export async function lotsAtRelease(
  tx: EmrTx,
  hospitalId: string,
  deviceId: string | null,
  conceptIds: readonly string[],
  resultAt: Date | null,
): Promise<Map<string, LotsJson>> {
  const out = new Map<string, LotsJson>(conceptIds.map((c) => [c, "not_recorded"]));
  if (!deviceId || !resultAt) return out;
  const rows = await tx
    .select({ u: labLotsInUse, lot: labStockLots.lot })
    .from(labLotsInUse)
    .innerJoin(labStockLots, eq(labStockLots.id, labLotsInUse.lotId))
    .where(and(eq(labLotsInUse.hospitalId, hospitalId), eq(labLotsInUse.deviceId, deviceId)));
  const number = new Map(rows.map((r) => [r.u.lotId, r.lot]));
  const inUse = rows.map((r) => ({ ...r.u, kind: r.u.kind as InUseKind }));
  for (const c of conceptIds) {
    const s = lotSnapshot(inUse, { hospitalId, deviceId, conceptId: c }, resultAt);
    out.set(
      c,
      s === "not_recorded"
        ? s
        : Object.fromEntries(
            Object.entries(s).map(([k, id]) => [k, { id: id!, lot: number.get(id!) ?? "" }]),
          ),
    );
  }
  return out;
}
