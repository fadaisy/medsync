import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { Who } from "@/lib/pharmacy/stores/ward-store";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { GAP_REASONS } from "@/content/pharmacy-catalogue";
import { pharmacyCounts } from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyIssuePicks,
  pharmacySealEvents,
  pharmacyUseGapReasons,
} from "@/db/schema/pharmacy-distribution";
import { pharmacyRequisitionLines } from "@/db/schema/pharmacy-stores";
import { pharmacyCatalogueLiveFor } from "@/lib/pharmacy/feature";
import { resolveScan } from "@/lib/pharmacy/shared-catalogue/scan";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { planIssue } from "@/lib/pharmacy/stores/issue";
import { lockedRequisition, mayIssueFrom } from "@/lib/pharmacy/stores/issue-store";
import { productAt } from "@/lib/pharmacy/stores/location-store";
import { productsForPack } from "@/lib/pharmacy/stores/receiving-store";
import { balancesOf, batchesAtPlaces, recalledBatches } from "@/lib/pharmacy/stores/store-read";
import { fail, loadLocation } from "@/lib/pharmacy/stores/write";
import { pickCheck } from "./engine";

const live = (hospitalId: string) => {
  if (!pharmacyCatalogueLiveFor(hospitalId))
    throw fail("config", "This check is not switched on here.");
};

/** The plan's batches for a product at a place, first to expire first (IS-2), as `getRequisition` shows them. */
export async function plannedBatches(
  tx: EmrTx,
  hospitalId: string,
  locationId: string,
  productId: string,
  asked: number,
  now: Date,
) {
  const batches = (await batchesAtPlaces(tx, [locationId])).filter(
    (b) => b.productId === productId,
  );
  const ids = batches.map((b) => b.id);
  const plan = planIssue(asked, {
    batches: batches.map((b) => ({ ...b, pointId: b.locationId })),
    balances: await balancesOf(tx, ids),
    blocked: await recalledBatches(tx, hospitalId, ids),
    localDate: localDate(now),
  });
  const byId = new Map(batches.map((b) => [b.id, b]));
  return plan.rows.map((r) => ({
    ...r,
    batchNumber: byId.get(r.batchId)!.batchNumber,
    expiry: byId.get(r.batchId)!.expiry,
  }));
}

/** Lines of a requisition that have a pick (S38). */
export async function pickedLines(tx: EmrTx, requisitionId: string) {
  const rows = await tx
    .select({
      lineId: pharmacyIssuePicks.lineId,
      method: pharmacyIssuePicks.method,
      pickedAt: pharmacyIssuePicks.pickedAt,
    })
    .from(pharmacyIssuePicks)
    .where(eq(pharmacyIssuePicks.requisitionId, requisitionId))
    .orderBy(desc(pharmacyIssuePicks.pickedAt));
  return new Map(rows.map((r) => [r.lineId, r]));
}

export const RecordPickInput = z.object({
  requisitionId: z.uuid(),
  lineId: z.uuid(),
  /** What the scanner typed; null ticks the line by hand (D-CAT-15: a pack with no barcode). */
  raw: z.string().trim().min(1).max(300).nullable(),
  /** A batch that is not first to expire: the existing coded list, without "other" (a pick carries no text). */
  laterReason: z.enum(["first_not_found", "first_unfit"]).nullish(),
});

/**
 * 4.11 Pick by scan (S38, S39): a check recorded before the issue, never a movement. A wrong product or strength,
 * or a later batch without its coded reason, is refused in words and nothing is written.
 */
export async function recordPick(ctx: PharmacyCtx, input: z.infer<typeof RecordPickInput>) {
  const h = ctx.actor.hospitalId;
  live(h);
  const r = await lockedRequisition(ctx.tx, h, input.requisitionId);
  if (r.state !== "raised") throw fail("conflict", "This requisition is closed.");
  mayIssueFrom(ctx, r.issuingLocationId);
  const [line] = await ctx.tx
    .select()
    .from(pharmacyRequisitionLines)
    .where(
      and(
        eq(pharmacyRequisitionLines.id, input.lineId),
        eq(pharmacyRequisitionLines.requisitionId, r.id),
      ),
    );
  if (!line) throw fail("not_found", "That line is not on this requisition.");
  const wanted = await productAt(ctx.tx, h, line.productId);
  let productId = line.productId;
  let batchId: string | null = null;
  if (input.raw !== null) {
    const s = await resolveScan(ctx.tx, h, input.raw);
    let scannedId: string | null = null;
    if (s.kind === "product") scannedId = s.productId;
    else if (s.kind === "pack") {
      const linked = await productsForPack(ctx.tx, h, s.packId);
      scannedId = linked.includes(line.productId) ? line.productId : (linked[0] ?? null);
    }
    const scanned = scannedId ? await productAt(ctx.tx, h, scannedId) : null;
    const scan = s.kind === "product" || s.kind === "pack" ? s.scan : null;
    const planned = await plannedBatches(
      ctx.tx,
      h,
      r.issuingLocationId,
      line.productId,
      line.quantityAsked,
      ctx.now,
    );
    const batch = scan?.batch
      ? ((await batchesAtPlaces(ctx.tx, [r.issuingLocationId])).find(
          (b) =>
            b.productId === line.productId &&
            b.batchNumber.toLowerCase() === scan.batch!.toLowerCase(),
        ) ?? null)
      : null;
    const checked = pickCheck({
      line: { productId: wanted.id, name: wanted.name, strength: wanted.strength },
      scanned: scanned && { productId: scanned.id, name: scanned.name, strength: scanned.strength },
      batch,
      planned,
      laterReason: input.laterReason ?? null,
    });
    // A later batch is `conflict`, so the screen asks for the reason; a wrong product is `invalid`.
    if (checked.kind !== "ok")
      throw fail(checked.kind === "later_batch" ? "conflict" : "invalid", checked.words);
    productId = scanned!.id;
    batchId = batch?.id ?? null;
  }
  const [row] = await ctx.tx
    .insert(pharmacyIssuePicks)
    .values({
      hospitalId: h,
      requisitionId: r.id,
      lineId: line.id,
      productId,
      batchId,
      method: input.raw === null ? "hand" : "scan",
      code: input.raw,
      laterBatchReason: input.laterReason ?? null,
      pickedBy: ctx.actor.userId,
    })
    .returning({ id: pharmacyIssuePicks.id });
  return { id: row!.id };
}

/** S38: with the check on, every line issued above zero has a pick; called by `issueRequisition`. */
export async function assertPicked(
  tx: EmrTx,
  hospitalId: string,
  requisitionId: string,
  lines: readonly { lineId: string; quantity: number }[],
) {
  if (!pharmacyCatalogueLiveFor(hospitalId)) return;
  const picked = await pickedLines(tx, requisitionId);
  if (lines.some((l) => l.quantity > 0 && !picked.has(l.lineId)))
    throw fail("invalid", "Pick every line before it is issued: scan a pack, or tick it by hand.");
}

export const GapReasonInput = z.object({
  locationId: z.uuid(),
  countId: z.uuid(),
  productId: z.uuid(),
  gap: z
    .number()
    .int()
    .refine((n) => n !== 0),
  reasonCode: z.enum(Object.keys(GAP_REASONS) as [keyof typeof GAP_REASONS]),
  note: z.string().trim().max(300).nullish(),
});

/** 4.13 (S41): the nurse in charge's reason for a ward-use gap, once per count and product. Never a movement. */
export async function recordGapReason(who: Who, input: z.infer<typeof GapReasonInput>) {
  const h = who.hospitalId;
  live(h);
  if (input.reasonCode === "other" && !input.note) throw fail("invalid", "Say what happened.");
  const [count] = await who.tx
    .select({ id: pharmacyCounts.id })
    .from(pharmacyCounts)
    .where(
      and(
        eq(pharmacyCounts.id, input.countId),
        eq(pharmacyCounts.hospitalId, h),
        eq(pharmacyCounts.locationId, input.locationId),
      ),
    );
  if (!count) throw fail("not_found", "That count is not on this ward.");
  const [row] = await who.tx
    .insert(pharmacyUseGapReasons)
    .values({
      hospitalId: h,
      locationId: input.locationId,
      countId: count.id,
      productId: input.productId,
      gap: input.gap,
      reasonCode: input.reasonCode,
      note: input.note ?? null,
      recordedBy: who.userId,
    })
    .onConflictDoNothing()
    .returning({ id: pharmacyUseGapReasons.id });
  if (!row) throw fail("conflict", "A reason is already recorded for this count.");
  return { id: row.id };
}

/** Gap reasons recorded against some counts, by count and product. */
export async function gapReasonsOf(tx: EmrDb | EmrTx, countIds: readonly string[]) {
  if (!countIds.length) return new Map<string, string>();
  const rows = await tx
    .select({
      countId: pharmacyUseGapReasons.countId,
      productId: pharmacyUseGapReasons.productId,
      code: pharmacyUseGapReasons.reasonCode,
    })
    .from(pharmacyUseGapReasons)
    .where(inArray(pharmacyUseGapReasons.countId, [...countIds]));
  return new Map(rows.map((r) => [`${r.countId}:${r.productId}`, r.code]));
}

export const SealBrokenInput = z.object({
  locationId: z.uuid(),
  note: z.string().trim().max(300).nullish(),
});

/** 4.14 (S42): a cart's seal reported broken, from the cart page or the ward-stock page. Never a movement. */
export async function reportSealBroken(who: Who, input: z.infer<typeof SealBrokenInput>) {
  const h = who.hospitalId;
  live(h);
  const loc = await loadLocation(who.tx, h, input.locationId);
  if (loc.kind !== "cart") throw fail("invalid", "Only a cart carries a seal.");
  const [row] = await who.tx
    .insert(pharmacySealEvents)
    .values({
      hospitalId: h,
      locationId: loc.id,
      kind: "broken",
      note: input.note ?? null,
      reportedBy: who.userId,
    })
    .returning({ id: pharmacySealEvents.id });
  return { id: row!.id };
}

/** The seal applied at "Restock and seal" (S42); called by the cart check when it completes with a seal number. */
export async function sealApplied(
  who: Who,
  args: { locationId: string; sealNumber: string | null; cartCheckId: string },
) {
  if (!args.sealNumber || !pharmacyCatalogueLiveFor(who.hospitalId)) return;
  await who.tx.insert(pharmacySealEvents).values({
    hospitalId: who.hospitalId,
    locationId: args.locationId,
    kind: "applied",
    sealNumber: args.sealNumber,
    cartCheckId: args.cartCheckId,
    reportedBy: who.userId,
  });
}

/** Seal events of some carts, newest first. */
export async function sealsOf(tx: EmrDb | EmrTx, locationIds: readonly string[]) {
  if (!locationIds.length) return [];
  return tx
    .select()
    .from(pharmacySealEvents)
    .where(inArray(pharmacySealEvents.locationId, [...locationIds]))
    .orderBy(desc(pharmacySealEvents.reportedAt));
}
