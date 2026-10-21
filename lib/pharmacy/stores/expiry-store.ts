import type { StockLocation } from "./write";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { EXPIRY, SUPPLY_COMMON } from "@/content/pharmacy-stores-supply";
import { pharmacyPrintEvents, pharmacyStockMovements } from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyCounterparties,
  pharmacyLocations,
  pharmacyWriteOffs,
} from "@/db/schema/pharmacy-stores";
import { isControlledMedicine } from "@/lib/pharmacy/controlled-read";
import { writeOffRefusals } from "./expiry";
import { reasonList } from "./packs";
import {
  balancesAt,
  batchRef,
  fail,
  loadLocation,
  move,
  movePair,
  requireAttestation,
  requireLive,
  storeNeed,
} from "./write";

/**
 * Expiry, quarantine and write-off, written (Pharmacy Phase 2, 5.6; EX-1, EX-2; Section 8). Each write is
 * `(ctx, input) => {id}` for `runPharmacyWrite`. The client key is the source id of what a write makes, so a
 * retried request finds its own rows. The database guard refuses a blocked batch leaving anywhere but into
 * quarantine (SL-14) and write-off or return-to-supplier from anywhere but quarantine.
 */

export const STOCK_NEED = storeNeed("pharmacy.stock");
export const MANAGE_NEED = storeNeed("pharmacy.manage");
export const VIEW_NEED = storeNeed("pharmacy.view");

const qty = z.number().int().min(1).max(1_000_000);
const note = z.string().trim().max(500).nullish();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, SUPPLY_COMMON.dateHint);

/** The hospital's quarantine location (5.1: one per hospital, or one per store; the first is used). */
export async function quarantineOf(ctx: PharmacyCtx): Promise<StockLocation> {
  const [q] = await ctx.tx
    .select({ id: pharmacyLocations.id })
    .from(pharmacyLocations)
    .where(
      and(
        eq(pharmacyLocations.hospitalId, ctx.actor.hospitalId),
        eq(pharmacyLocations.kind, "quarantine"),
        isNull(pharmacyLocations.archivedAt),
      ),
    )
    .orderBy(pharmacyLocations.createdAt)
    .limit(1);
  if (!q) throw fail("config", EXPIRY.noQuarantine);
  const l = await loadLocation(ctx.tx, ctx.actor.hospitalId, q.id);
  requireLive(l);
  return l;
}

/** CD-5: a controlled product moves only with `pharmacy.controlled` and a witness. */
async function witnessIfControlled(
  ctx: PharmacyCtx,
  medicineId: string,
  witnessAttestationId: string | null | undefined,
): Promise<string | null> {
  if (!(await isControlledMedicine(ctx.tx, ctx.actor.hospitalId, medicineId))) return null;
  if (!ctx.actor.access.permissions.has("pharmacy.controlled"))
    throw fail("forbidden", "A controlled medicine needs the controlled-drugs permission.");
  if (!witnessAttestationId) throw fail("forbidden", "A controlled medicine needs its witness.");
  await requireAttestation(ctx.tx, {
    id: witnessAttestationId,
    hospitalId: ctx.actor.hospitalId,
    actorUserId: ctx.actor.userId,
    now: ctx.now,
  });
  return witnessAttestationId;
}

const replayed = async (ctx: PharmacyCtx, sourceKind: string, sourceId: string) =>
  (
    await ctx.tx
      .select({ id: pharmacyStockMovements.id })
      .from(pharmacyStockMovements)
      .where(
        and(
          eq(pharmacyStockMovements.hospitalId, ctx.actor.hospitalId),
          eq(pharmacyStockMovements.sourceKind, sourceKind),
          eq(pharmacyStockMovements.sourceId, sourceId),
        ),
      )
      .limit(1)
  ).length > 0;

/* ─── Move to quarantine (5.6 Expired, Damaged anywhere) ─────────────── */

export const QuarantineInput = z.object({
  clientKey: z.uuid(),
  locationId: z.uuid(),
  batchId: z.uuid(),
  quantity: qty,
  reasonCode: z.string().trim().min(2).max(60),
  note,
  witnessAttestationId: z.uuid().nullish(),
});

/** Two legs into quarantine, with the reason from the signed list (`pharmacy.stock`; witnessed if controlled). */
export async function moveToQuarantine(ctx: PharmacyCtx, input: z.infer<typeof QuarantineInput>) {
  if (await replayed(ctx, "quarantine", input.clientKey)) return { id: input.clientKey };
  const list = await reasonList(ctx.tx, ctx.actor.hospitalId, "quarantine");
  if (!list) throw fail("config", EXPIRY.noQuarantineList);
  if (!list.some((r) => r.code === input.reasonCode))
    throw fail("invalid", "Choose a reason from the list.");
  const from = await loadLocation(ctx.tx, ctx.actor.hospitalId, input.locationId);
  if (from.kind === "quarantine") throw fail("invalid", "That stock is already in quarantine.");
  requireLive(from);
  const to = await quarantineOf(ctx);
  const batch = await batchRef(ctx.tx, ctx.actor.hospitalId, input.batchId, from.id);
  const witness = await witnessIfControlled(ctx, batch.medicineId, input.witnessAttestationId);
  await movePair(ctx.tx, {
    pair: "quarantine",
    hospitalId: ctx.actor.hospitalId,
    from,
    to,
    batch,
    quantity: input.quantity,
    sourceId: input.clientKey,
    actorUserId: ctx.actor.userId,
    effectiveAt: ctx.now,
    reasonCode: input.reasonCode,
    reasonNote: input.note ?? null,
    witnessAttestationId: witness,
  });
  return { id: input.clientKey };
}

/* ─── Write off (EX-2) ───────────────────────────────────────────────── */

export const WriteOffInput = z.object({
  clientKey: z.uuid(),
  batchId: z.uuid(),
  quantity: qty,
  reasonCode: z.string().trim().min(2).max(60),
  registerNumber: z.string().trim().min(1, "Give the register entry number.").max(40),
  note,
  witnessAttestationId: z.uuid({ message: "The write-off needs its witness." }),
});

/** From quarantine only, by `pharmacy.manage`, witnessed, with a signed reason and the register entry. */
export async function writeOff(ctx: PharmacyCtx, input: z.infer<typeof WriteOffInput>) {
  const hospitalId = ctx.actor.hospitalId;
  const [done] = await ctx.tx
    .select({ id: pharmacyWriteOffs.id })
    .from(pharmacyWriteOffs)
    .where(eq(pharmacyWriteOffs.id, input.clientKey));
  if (done) return { id: done.id };
  const list = await reasonList(ctx.tx, hospitalId, "write_off");
  if (!list) throw fail("config", EXPIRY.noReasonList);
  if (!list.some((r) => r.code === input.reasonCode))
    throw fail("invalid", "Choose a reason from the list.");
  const q = await quarantineOf(ctx);
  const batch = await batchRef(ctx.tx, hospitalId, input.batchId, q.id);
  await requireAttestation(ctx.tx, {
    id: input.witnessAttestationId,
    hospitalId,
    actorUserId: ctx.actor.userId,
    now: ctx.now,
  });
  await witnessIfControlled(ctx, batch.medicineId, input.witnessAttestationId);
  const balance = (await balancesAt(ctx.tx, q.id)).get(batch.id) ?? 0;
  const refusals = writeOffRefusals({
    locationKind: q.kind,
    canManage: ctx.manages,
    reason: input.reasonCode,
    registerNumber: input.registerNumber,
    witnessAttestationId: input.witnessAttestationId,
    quantity: input.quantity,
    balance,
  });
  if (refusals.includes("invalid_quantity"))
    throw fail("conflict", `Quarantine holds ${balance} of batch ${batch.batchNumber}.`);
  if (refusals.length) throw fail("forbidden", SUPPLY_COMMON.manageOnly);
  const [row] = await ctx.tx
    .insert(pharmacyWriteOffs)
    .values({
      id: input.clientKey,
      hospitalId,
      locationId: q.id,
      registerNumber: input.registerNumber,
      reason: input.reasonCode,
      note: input.note ?? null,
      witnessAttestationId: input.witnessAttestationId,
      actorUserId: ctx.actor.userId,
      writtenOffAt: ctx.now,
    })
    .returning({ id: pharmacyWriteOffs.id });
  await move(ctx.tx, {
    hospitalId,
    location: q,
    batchId: batch.id,
    kind: "written_off",
    quantity: -input.quantity,
    sourceKind: "write_off",
    sourceId: row!.id,
    actorUserId: ctx.actor.userId,
    effectiveAt: ctx.now,
    reasonCode: input.reasonCode,
    reasonNote: input.note ?? null,
    witnessAttestationId: input.witnessAttestationId,
  });
  return { id: row!.id };
}

export const DisposalInput = z.object({
  clientKey: z.uuid(),
  writeOffId: z.uuid(),
  reference: z.string().trim().min(2).max(120),
  disposalOn: isoDay,
});

/** D-PH2-18: the disposal reference and date, added once, later. MedSync does not certify destruction. */
export async function recordDisposalReference(
  ctx: PharmacyCtx,
  input: z.infer<typeof DisposalInput>,
) {
  const [w] = await ctx.tx
    .select({ id: pharmacyWriteOffs.id, ref: pharmacyWriteOffs.disposalReference })
    .from(pharmacyWriteOffs)
    .where(
      and(
        eq(pharmacyWriteOffs.id, input.writeOffId),
        eq(pharmacyWriteOffs.hospitalId, ctx.actor.hospitalId),
      ),
    )
    .for("update");
  if (!w) throw fail("not_found", SUPPLY_COMMON.notHere);
  if (w.ref) return { id: w.id };
  await ctx.tx
    .update(pharmacyWriteOffs)
    .set({
      disposalReference: input.reference,
      disposalOn: input.disposalOn,
      disposalRecordedBy: ctx.actor.userId,
    })
    .where(eq(pharmacyWriteOffs.id, w.id));
  return { id: w.id };
}

/* ─── Return to supplier (from quarantine) ───────────────────────────── */

export const SupplierReturnInput = z.object({
  clientKey: z.uuid(),
  batchId: z.uuid(),
  quantity: qty,
  counterpartyId: z.uuid(),
  note,
  witnessAttestationId: z.uuid().nullish(),
});

export async function returnToSupplier(
  ctx: PharmacyCtx,
  input: z.infer<typeof SupplierReturnInput>,
) {
  if (await replayed(ctx, "supplier_return", input.clientKey)) return { id: input.clientKey };
  const [cp] = await ctx.tx
    .select({ id: pharmacyCounterparties.id, takes: pharmacyCounterparties.takesReturns })
    .from(pharmacyCounterparties)
    .where(
      and(
        eq(pharmacyCounterparties.id, input.counterpartyId),
        eq(pharmacyCounterparties.hospitalId, ctx.actor.hospitalId),
        eq(pharmacyCounterparties.kind, "supplier"),
        isNull(pharmacyCounterparties.retiredAt),
      ),
    );
  if (!cp?.takes) throw fail("invalid", EXPIRY.noSupplier);
  const q = await quarantineOf(ctx);
  const batch = await batchRef(ctx.tx, ctx.actor.hospitalId, input.batchId, q.id);
  const witness = await witnessIfControlled(ctx, batch.medicineId, input.witnessAttestationId);
  await move(ctx.tx, {
    hospitalId: ctx.actor.hospitalId,
    location: q,
    batchId: batch.id,
    kind: "returned_to_supplier",
    quantity: -input.quantity,
    sourceKind: "supplier_return",
    sourceId: input.clientKey,
    actorUserId: ctx.actor.userId,
    effectiveAt: ctx.now,
    counterpartyId: cp.id,
    reasonNote: input.note ?? null,
    witnessAttestationId: witness,
  });
  return { id: input.clientKey };
}

/* ─── Prints (logged) ────────────────────────────────────────────────── */

export const PRINT_KINDS = [
  "write_off_register",
  "stock_status",
  "tracer_audit",
  "order_085",
  "order_084b",
  "purchase_list",
  "recall_list",
  "recall_reconciliation",
  "quantities_text",
] as const;
export type SupplyPrintKind = (typeof PRINT_KINDS)[number];

export const PrintInput = z.object({
  clientKey: z.uuid(),
  kind: z.enum(PRINT_KINDS),
  refId: z.uuid().nullish(),
});

/** Every print is logged (Section 12). The record it prints is checked by the caller's read. */
export async function logPrint(ctx: PharmacyCtx, input: z.infer<typeof PrintInput>) {
  const [row] = await ctx.tx
    .insert(pharmacyPrintEvents)
    .values({
      id: input.clientKey,
      hospitalId: ctx.actor.hospitalId,
      kind: input.kind,
      refId: input.refId ?? null,
      actorUserId: ctx.actor.userId,
      printedAt: ctx.now,
    })
    .onConflictDoNothing()
    .returning({ id: pharmacyPrintEvents.id });
  return { id: row?.id ?? input.clientKey };
}
