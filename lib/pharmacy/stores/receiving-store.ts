import type { DeliveryLine, LineRefusal } from "./receiving";
import type { EmrTx } from "@/lib/emr/db";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { STORE } from "@/content/pharmacy-stores-store";
import {
  pharmacyBatches,
  pharmacyHospitalSettings,
  pharmacyPrintEvents,
} from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyDeliveries,
  pharmacyDeliveryLines,
  pharmacyOrderLines,
  pharmacyOrders,
} from "@/db/schema/pharmacy-stores";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import {
  controlledSet,
  counterpartyOf,
  expiryField,
  productAt,
  quarantineFor,
  storeWitness,
} from "./location-store";
import { deliveryMovements, deliveryNext, lineRefusals } from "./receiving";
import { batchAtLocation, fail, loadLocation, move, requireLive } from "./write";

/**
 * Deliveries, written (Pharmacy Phase 2, 5.2, RG-1 to RG-6; Section 8 startDelivery, saveDeliveryLine,
 * recordShortDatedDecision, receiveDelivery, abandonDelivery, printDiscrepancyReport, printGrn). The engine
 * (receiving.ts) decides every line's results and refusals; this file only reads, locks and writes. Only a
 * `received` delivery moves stock: one transaction writes a `received` movement per batch at the counted
 * quantity, accepted at the receiving place, rejected-and-kept straight into quarantine, and nothing for what
 * went back with the deliverer (RG-3). Law 4: whole issue units, never converted.
 */

const key = z.uuid();
const qty = z.number().int().min(0).max(1_000_000);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => (s ? s : null));

/** "YYYY-MM-DD HH:MM" (or with a T) in Kampala time (UTC+3, no daylight saving), as typed on the delivery. */
export function parseArrival(s: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const StartDeliveryInput = z.object({
  clientKey: key,
  supplierId: z.uuid({ message: "Choose the supplier." }),
  noteNumber: z.string().trim().min(1, "Type the delivery note number.").max(80),
  orderId: z.uuid().nullish(),
  arrivedAt: z.string().transform((s, c) => {
    const d = parseArrival(s);
    if (!d) c.addIssue({ code: "custom", message: "Give when it arrived as YYYY-MM-DD HH:MM." });
    return d ?? new Date(0);
  }),
  locationId: z.uuid({ message: "Choose where it is received." }),
  witnessName: optional(120),
  delivererName: optional(120),
  vehicleRegistration: optional(20),
});

/** 5.2 Start a delivery: at a store, or a dispensing point that receives directly; live (Law 7). */
export async function startDelivery(ctx: PharmacyCtx, input: z.infer<typeof StartDeliveryInput>) {
  const h = ctx.actor.hospitalId;
  const [again] = await ctx.tx
    .select({ id: pharmacyDeliveries.id, h: pharmacyDeliveries.hospitalId })
    .from(pharmacyDeliveries)
    .where(eq(pharmacyDeliveries.id, input.clientKey));
  if (again) {
    if (again.h !== h) throw fail("conflict", "That request key is already in use.");
    return { id: again.id };
  }
  if (input.arrivedAt.getTime() > ctx.now.getTime() + 5 * 60_000)
    throw fail("invalid", "It cannot have arrived in the future.");
  const l = await loadLocation(ctx.tx, h, input.locationId);
  if (l.kind !== "store" && l.kind !== "dispensing_point")
    throw fail("invalid", "A delivery is received at a store or a dispensing point.");
  requireLive(l);
  await counterpartyOf(ctx.tx, h, input.supplierId, "supplier");
  if (input.orderId) {
    const [o] = await ctx.tx
      .select({ state: pharmacyOrders.state })
      .from(pharmacyOrders)
      .where(and(eq(pharmacyOrders.id, input.orderId), eq(pharmacyOrders.hospitalId, h)));
    if (!o || o.state !== "open")
      throw fail("not_found", "That order is not open at this hospital.");
  }
  try {
    const [row] = await ctx.tx
      .insert(pharmacyDeliveries)
      .values({
        id: input.clientKey,
        hospitalId: h,
        locationId: l.id,
        supplierId: input.supplierId,
        noteNumber: input.noteNumber,
        orderId: input.orderId ?? null,
        arrivedAt: input.arrivedAt,
        countedBy: ctx.actor.userId,
        witnessName: input.witnessName,
        delivererName: input.delivererName,
        vehicleRegistration: input.vehicleRegistration,
        createdAt: ctx.now,
      })
      .returning({ id: pharmacyDeliveries.id });
    return { id: row!.id };
  } catch (e) {
    if (/pd_note/.test(String(e) + String((e as { cause?: unknown }).cause ?? "")))
      throw fail("conflict", "That delivery note from this supplier is already recorded.");
    throw e;
  }
}

/** The delivery, locked, still being counted. */
async function counting(tx: EmrTx, hospitalId: string, deliveryId: string) {
  const [d] = await tx
    .select()
    .from(pharmacyDeliveries)
    .where(
      and(eq(pharmacyDeliveries.id, deliveryId), eq(pharmacyDeliveries.hospitalId, hospitalId)),
    )
    .for("update");
  if (!d) throw fail("not_found", "That delivery is not at this hospital.");
  if (d.state !== "counting")
    throw fail("conflict", "This delivery is finished. It does not change.");
  return d;
}

export const DeliveryLineInput = z
  .object({
    deliveryId: z.uuid(),
    lineNo: z.number().int().min(1).max(999),
    remove: z.boolean().optional(),
    productId: z.uuid({ message: "Choose the product delivered." }),
    noteProductId: z.uuid().nullish(),
    orderLineId: z.uuid().nullish(),
    noteQuantity: qty.nullish(),
    accepted: qty,
    rejectedKept: qty,
    rejectedReturned: qty,
    rejectReason: z.enum(["damaged", "wrong_product", "expired", "short_dated", "other"]).nullish(),
    batchNumber: optional(60),
    expiry: expiryField.nullish().or(z.literal("").transform(() => null)),
    unitCost: z
      .string()
      .trim()
      .regex(/^\d{1,12}(\.\d{1,2})?$/, "Give the unit cost in Uganda shillings, for example 1500.")
      .nullish()
      .or(z.literal("").transform(() => null)),
    shortDatedDecision: z.enum(["accept", "accept_tell", "reject"]).nullish(),
    note: optional(300),
  })
  .refine((v) => v.rejectedKept + v.rejectedReturned === 0 || !!v.rejectReason, {
    message: "Say why it was rejected.",
    path: ["rejectReason"],
  })
  .refine((v) => v.accepted + v.rejectedKept === 0 || (!!v.batchNumber && !!v.expiry), {
    message: "Give the batch and the expiry of what enters stock.",
    path: ["batchNumber"],
  });

/** 5.2 Lines: one line saved (or removed) while the delivery is counted. Nothing moves until it is received. */
export async function saveDeliveryLine(ctx: PharmacyCtx, input: z.infer<typeof DeliveryLineInput>) {
  const d = await counting(ctx.tx, ctx.actor.hospitalId, input.deliveryId);
  const where = and(
    eq(pharmacyDeliveryLines.deliveryId, d.id),
    eq(pharmacyDeliveryLines.lineNo, input.lineNo),
  );
  if (input.remove) {
    await ctx.tx.delete(pharmacyDeliveryLines).where(where);
    return { id: d.id };
  }
  await productAt(ctx.tx, ctx.actor.hospitalId, input.productId);
  if (input.noteProductId) await productAt(ctx.tx, ctx.actor.hospitalId, input.noteProductId);
  if (input.orderLineId) {
    const [ol] = await ctx.tx
      .select({ id: pharmacyOrderLines.id })
      .from(pharmacyOrderLines)
      .where(
        and(
          eq(pharmacyOrderLines.id, input.orderLineId),
          eq(pharmacyOrderLines.orderId, d.orderId ?? ""),
        ),
      );
    if (!d.orderId || !ol)
      throw fail("not_found", "That line is not on the order this delivery fills.");
  }
  const values = {
    productId: input.productId,
    noteProductId:
      input.noteProductId && input.noteProductId !== input.productId ? input.noteProductId : null,
    orderLineId: input.orderLineId ?? null,
    noteQuantity: input.noteQuantity ?? null,
    acceptedQuantity: input.accepted,
    rejectedKeptQuantity: input.rejectedKept,
    rejectedReturnedQuantity: input.rejectedReturned,
    rejectReason:
      input.rejectedKept + input.rejectedReturned > 0 ? (input.rejectReason ?? null) : null,
    batchNumber: input.batchNumber,
    expiry: input.expiry?.expiry ?? null,
    expiryMonthOnly: input.expiry?.monthOnly ?? false,
    unitCost: input.unitCost ?? null,
    shortDatedDecision: input.shortDatedDecision ?? null,
    note: input.note,
    updatedAt: ctx.now,
  };
  const [row] = await ctx.tx
    .insert(pharmacyDeliveryLines)
    .values({ deliveryId: d.id, lineNo: input.lineNo, ...values })
    .onConflictDoUpdate({
      target: [pharmacyDeliveryLines.deliveryId, pharmacyDeliveryLines.lineNo],
      set: values,
    })
    .returning({ id: pharmacyDeliveryLines.id });
  return { id: row!.id };
}

export const ShortDatedInput = z.object({
  deliveryId: z.uuid(),
  lineNo: z.number().int().min(1).max(999),
  decision: z.enum(["accept", "accept_tell", "reject"]),
});

/** RG-4: the decision a short-dated line needs (accept · accept and tell the supplier · reject). */
export async function recordShortDatedDecision(
  ctx: PharmacyCtx,
  input: z.infer<typeof ShortDatedInput>,
) {
  const d = await counting(ctx.tx, ctx.actor.hospitalId, input.deliveryId);
  const [row] = await ctx.tx
    .update(pharmacyDeliveryLines)
    .set({ shortDatedDecision: input.decision, updatedAt: ctx.now })
    .where(
      and(
        eq(pharmacyDeliveryLines.deliveryId, d.id),
        eq(pharmacyDeliveryLines.lineNo, input.lineNo),
      ),
    )
    .returning({ id: pharmacyDeliveryLines.id });
  if (!row) throw fail("not_found", "That line is not on this delivery.");
  return { id: row.id };
}

/** A stored line, as the engine reads it. */
export const asLine = (l: typeof pharmacyDeliveryLines.$inferSelect): DeliveryLine => ({
  lineNo: l.lineNo,
  productId: l.productId,
  noteProductId: l.noteProductId,
  orderLineId: l.orderLineId,
  noteQuantity: l.noteQuantity,
  acceptedQuantity: l.acceptedQuantity,
  rejectedKeptQuantity: l.rejectedKeptQuantity,
  rejectedReturnedQuantity: l.rejectedReturnedQuantity,
  rejectReason: l.rejectReason,
  batchNumber: l.batchNumber,
  expiry: l.expiry,
  expiryMonthOnly: l.expiryMonthOnly,
  unitCost: l.unitCost === null ? null : Number(l.unitCost),
  shortDatedDecision: l.shortDatedDecision,
});

/** Phase 1's expiry look-ahead (D-PH1-23), applied at receipt; null when the hospital has not set it. */
export async function expiryLookahead(tx: EmrTx, hospitalId: string): Promise<number | null> {
  const [s] = await tx
    .select({ days: pharmacyHospitalSettings.expiryLookaheadDays })
    .from(pharmacyHospitalSettings)
    .where(eq(pharmacyHospitalSettings.hospitalId, hospitalId));
  return s?.days ?? null;
}

/** A line refusal in words (RG-3, RG-4, SL-3). */
export function refusalWords(
  r: LineRefusal,
  line: DeliveryLine,
  ctx: { lookaheadDays: number | null; heldExpiry?: string | null },
): string {
  const n = `Line ${line.lineNo}`;
  switch (r) {
    case "expired_cannot_enter_stock":
      return `${n} expired on arrival. It cannot enter stock: count it as rejected.`;
    case "short_dated_decision_needed":
      return `${n} expires in under ${ctx.lookaheadDays} days. Record a decision for it.`;
    case "rejected_short_dated_accepted":
      return `${n} was rejected as short-dated, so none of it can be accepted.`;
    case "batch_and_expiry_needed":
      return `${n}: give the batch and the expiry.`;
    case "batch_expiry_conflict":
      return `${n}: batch ${line.batchNumber} is already here with expiry ${ctx.heldExpiry ?? "another date"}, not ${line.expiry}. Check the pack.`;
    case "reject_reason_needed":
      return `${n}: say why it was rejected.`;
    case "expiry_lookahead_not_set":
      return STORE.delivery.noLookahead;
  }
}

export const ReceiveDeliveryInput = z.object({
  deliveryId: z.uuid(),
  /** CD-5, 5.2: each controlled line names its witness. */
  witnesses: z
    .array(z.object({ lineNo: z.number().int().min(1), attestationId: z.uuid() }))
    .max(200)
    .default([]),
});

/**
 * 5.2 "Add {n} lines to stock" (RG-1, RG-3, RG-4, SL-3): one transaction. Every line passes the engine's
 * refusals first, or nothing is written; then a `received` movement per batch at the counted quantity, linked
 * to its delivery line, with its unit cost (SL-17); rejected-and-kept at quarantine with its reason; then the
 * delivery closes. A controlled line needs `pharmacy.controlled` and its witness.
 */
export async function receiveDelivery(
  ctx: PharmacyCtx,
  input: z.infer<typeof ReceiveDeliveryInput>,
) {
  const h = ctx.actor.hospitalId;
  const d = await counting(ctx.tx, h, input.deliveryId);
  const location = await loadLocation(ctx.tx, h, d.locationId);
  requireLive(location);
  const stored = await ctx.tx
    .select()
    .from(pharmacyDeliveryLines)
    .where(eq(pharmacyDeliveryLines.deliveryId, d.id))
    .orderBy(pharmacyDeliveryLines.lineNo);
  const lines = stored.map(asLine);
  if (!lines.length) throw fail("invalid", "Add the delivery's lines first.");
  const today = localDate(ctx.now);
  const lookaheadDays = await expiryLookahead(ctx.tx, h);
  const existing = await ctx.tx
    .select({
      productId: pharmacyBatches.productId,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
    })
    .from(pharmacyBatches)
    .where(
      sql`coalesce(${pharmacyBatches.locationId}, ${pharmacyBatches.dispensingPointId}) = ${location.id}::uuid`,
    );
  for (const line of lines) {
    const refused = lineRefusals(line, { today, lookaheadDays, existing });
    if (refused.length) {
      const held = existing.find(
        (b) =>
          b.productId === line.productId &&
          b.batchNumber.toLowerCase() === line.batchNumber?.toLowerCase(),
      );
      throw fail(
        "conflict",
        refusalWords(refused[0]!, line, { lookaheadDays, heldExpiry: held?.expiry ?? null }),
      );
    }
  }
  const needsQuarantine = lines.some((l) => l.rejectedKeptQuantity > 0);
  const quarantine = needsQuarantine ? await quarantineFor(ctx.tx, h, location) : null;
  if (needsQuarantine) {
    if (!quarantine) throw fail("config", STORE.delivery.noQuarantine);
    requireLive(quarantine);
  }

  const controlled = await controlledSet(ctx.tx, h);
  const witnessOf = new Map(input.witnesses.map((w) => [w.lineNo, w.attestationId]));
  const witness = new Map<number, string | null>();
  for (const line of lines) {
    const p = await productAt(ctx.tx, h, line.productId);
    if (line.acceptedQuantity + line.rejectedKeptQuantity === 0) continue;
    witness.set(
      line.lineNo,
      await storeWitness(ctx, controlled(p.medicineId), witnessOf.get(line.lineNo)),
    );
  }

  const lineId = new Map(stored.map((s) => [s.lineNo, s.id]));
  const planned = deliveryMovements({
    state: "received",
    locationId: location.id,
    quarantineLocationId: quarantine?.id ?? location.id,
    lines,
  });
  for (const p of planned) {
    const at = quarantine && p.locationId === quarantine.id ? quarantine : location;
    const batchId = await batchAtLocation(ctx.tx, {
      hospitalId: h,
      location: at,
      productId: p.productId,
      batchNumber: p.batchNumber,
      expiry: p.expiry,
      monthOnly: p.expiryMonthOnly,
      actorUserId: ctx.actor.userId,
    });
    await move(ctx.tx, {
      hospitalId: h,
      location: at,
      batchId,
      kind: "received",
      quantity: p.quantity,
      sourceKind: "delivery",
      sourceId: lineId.get(p.lineNo) ?? d.id,
      unitCost: p.unitCost === null ? null : p.unitCost.toFixed(2),
      reasonCode: p.reasonCode,
      counterpartyId: d.supplierId,
      actorUserId: ctx.actor.userId,
      effectiveAt: ctx.now,
      witnessAttestationId: witness.get(p.lineNo) ?? null,
    });
  }
  await ctx.tx
    .update(pharmacyDeliveries)
    .set({ state: "received", finishedBy: ctx.actor.userId, finishedAt: ctx.now })
    .where(eq(pharmacyDeliveries.id, d.id));
  return { id: d.id, movements: planned.length };
}

export const AbandonInput = z.object({
  deliveryId: z.uuid(),
  reason: z.string().trim().min(3, "Say why it is abandoned.").max(300),
});

/** RG-1: a delivery abandoned with its reason moves nothing and never changes again. */
export async function abandonDelivery(ctx: PharmacyCtx, input: z.infer<typeof AbandonInput>) {
  const d = await counting(ctx.tx, ctx.actor.hospitalId, input.deliveryId);
  const next = deliveryNext(d.state, { type: "abandon", reason: input.reason });
  if (!next.ok) throw fail("invalid", "Say why it is abandoned.");
  await ctx.tx
    .update(pharmacyDeliveries)
    .set({
      state: "abandoned",
      abandonReason: input.reason,
      finishedBy: ctx.actor.userId,
      finishedAt: ctx.now,
    })
    .where(eq(pharmacyDeliveries.id, d.id));
  return { id: d.id };
}

export const PrintDeliveryInput = z.object({ clientKey: key, deliveryId: z.uuid() });

/** RG-5: the discrepancy report and the goods received note print from the closed delivery, logged. */
async function logDeliveryPrint(
  ctx: PharmacyCtx,
  input: z.infer<typeof PrintDeliveryInput>,
  kind: "discrepancy_report" | "goods_received_note",
) {
  const [d] = await ctx.tx
    .select({ state: pharmacyDeliveries.state, locationId: pharmacyDeliveries.locationId })
    .from(pharmacyDeliveries)
    .where(
      and(
        eq(pharmacyDeliveries.id, input.deliveryId),
        eq(pharmacyDeliveries.hospitalId, ctx.actor.hospitalId),
      ),
    );
  if (!d) throw fail("not_found", "That delivery is not at this hospital.");
  if (d.state !== "received") throw fail("conflict", "It prints once the delivery is received.");
  const l = await loadLocation(ctx.tx, ctx.actor.hospitalId, d.locationId);
  const [again] = await ctx.tx
    .select({ id: pharmacyPrintEvents.id })
    .from(pharmacyPrintEvents)
    .where(eq(pharmacyPrintEvents.id, input.clientKey));
  if (again) return { id: again.id };
  const [row] = await ctx.tx
    .insert(pharmacyPrintEvents)
    .values({
      id: input.clientKey,
      hospitalId: ctx.actor.hospitalId,
      dispensingPointId: l.kind === "dispensing_point" ? l.id : null,
      kind,
      refId: input.deliveryId,
      actorUserId: ctx.actor.userId,
      printedAt: ctx.now,
    })
    .returning({ id: pharmacyPrintEvents.id });
  return { id: row!.id };
}

export const printDiscrepancyReport = (
  ctx: PharmacyCtx,
  input: z.infer<typeof PrintDeliveryInput>,
) => logDeliveryPrint(ctx, input, "discrepancy_report");
export const printGrn = (ctx: PharmacyCtx, input: z.infer<typeof PrintDeliveryInput>) =>
  logDeliveryPrint(ctx, input, "goods_received_note");
