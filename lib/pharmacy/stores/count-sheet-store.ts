import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { pharmacyBatches } from "@/db/schema/pharmacy-dispensing";
import { pharmacyCountSheetLines, pharmacyCountSheets } from "@/db/schema/pharmacy-rework";
import { countBlockers, countedOf } from "@/lib/pharmacy/derive/count";
import { recordMonthEndCount } from "./month-end-store";
import { balancesAt, fail, loadLocation, requireLive, storeNeed } from "./write";

/**
 * The count sheet (rework PRD §6.4 Count, test 4, review finding C4). Saved as you type and resumable; sent for
 * approval once every line is counted and each difference has a reason; the in-charge approves, and only then do
 * the differences post (through the month-end count, so the ledger and the month report stay one path). The
 * sheet's status and the in-charge rule are also held in SQL (0266).
 */
export const COUNT_NEED = storeNeed("pharmacy.stock");
export const APPROVE_NEED = storeNeed("pharmacy.manage");

const key = z.uuid();

export const StartCountInput = z.object({
  clientKey: key,
  locationId: z.uuid(),
  productId: z.uuid().nullish(),
  label: z.string().trim().min(1).max(120),
});

export async function startCount(ctx: PharmacyCtx, input: z.infer<typeof StartCountInput>) {
  const hospitalId = ctx.actor.hospitalId;
  const [done] = await ctx.tx
    .select({ id: pharmacyCountSheets.id })
    .from(pharmacyCountSheets)
    .where(eq(pharmacyCountSheets.id, input.clientKey));
  if (done) return { id: done.id };
  const loc = await loadLocation(ctx.tx, hospitalId, input.locationId);
  requireLive(loc);
  const balances = await balancesAt(ctx.tx, loc.id);
  const batches = await ctx.tx
    .select({ id: pharmacyBatches.id })
    .from(pharmacyBatches)
    .where(
      and(
        eq(pharmacyBatches.hospitalId, hospitalId),
        eq(pharmacyBatches.locationId, loc.id),
        input.productId ? eq(pharmacyBatches.productId, input.productId) : sql`true`,
      ),
    );
  const held = batches.filter((b) => (balances.get(b.id) ?? 0) !== 0);
  if (!held.length) throw fail("invalid", "Nothing is held here to count.");
  await ctx.tx.insert(pharmacyCountSheets).values({
    id: input.clientKey,
    hospitalId,
    locationId: loc.id,
    scope: input.productId ? "medicine" : "month_end",
    label: input.label,
    createdBy: ctx.actor.userId,
  });
  await ctx.tx
    .insert(pharmacyCountSheetLines)
    .values(held.map((b) => ({ sheetId: input.clientKey, batchId: b.id, updatedBy: ctx.actor.userId })));
  return { id: input.clientKey };
}

export const SaveCountLineInput = z.object({
  sheetId: z.uuid(),
  batchId: z.uuid(),
  packSize: z.number().int().min(1).max(100_000),
  countedPacks: z.number().int().min(0).max(1_000_000).nullable(),
  countedUnits: z.number().int().min(0).max(1_000_000).nullable(),
  reason: z.string().max(60).nullish(),
  note: z.string().trim().max(300).nullish(),
  /** "Add found batch": a batch at this place that was not on the sheet. */
  found: z.boolean().default(false),
});

async function sheetOf(ctx: PharmacyCtx, id: string) {
  const [s] = await ctx.tx
    .select()
    .from(pharmacyCountSheets)
    .where(and(eq(pharmacyCountSheets.id, id), eq(pharmacyCountSheets.hospitalId, ctx.actor.hospitalId)))
    .for("update");
  if (!s) throw fail("not_found", "That count is not at your hospital.");
  return s;
}

export async function saveCountLine(ctx: PharmacyCtx, input: z.infer<typeof SaveCountLineInput>) {
  const s = await sheetOf(ctx, input.sheetId);
  if (s.status !== "counting") throw fail("conflict", "This count was sent for approval; it is not changed now.");
  if (input.found) {
    const [b] = await ctx.tx
      .select({ id: pharmacyBatches.id })
      .from(pharmacyBatches)
      .where(and(eq(pharmacyBatches.id, input.batchId), eq(pharmacyBatches.locationId, s.locationId)));
    if (!b) throw fail("invalid", "That batch is not at this place.");
  }
  const values = {
    packSize: input.packSize,
    countedPacks: input.countedPacks,
    countedUnits: input.countedUnits,
    reason: input.reason || null,
    note: input.note || null,
    updatedBy: ctx.actor.userId,
    updatedAt: ctx.now,
  };
  await ctx.tx
    .insert(pharmacyCountSheetLines)
    .values({ sheetId: s.id, batchId: input.batchId, found: input.found, ...values })
    .onConflictDoUpdate({
      target: [pharmacyCountSheetLines.sheetId, pharmacyCountSheetLines.batchId],
      set: values,
    });
  return { id: s.id };
}

const linesOf = (ctx: PharmacyCtx, sheetId: string) =>
  ctx.tx.select().from(pharmacyCountSheetLines).where(eq(pharmacyCountSheetLines.sheetId, sheetId));

export const SheetInput = z.object({ sheetId: z.uuid() });

export async function sendCountForApproval(ctx: PharmacyCtx, input: z.infer<typeof SheetInput>) {
  const s = await sheetOf(ctx, input.sheetId);
  if (s.status === "approval") return { id: s.id };
  if (s.status !== "counting") throw fail("conflict", "This count is already closed.");
  const b = countBlockers(await linesOf(ctx, s.id), await balancesAt(ctx.tx, s.locationId));
  if (b.uncounted) throw fail("invalid", `${b.uncounted} lines are not counted yet.`);
  if (b.unexplained) throw fail("invalid", `${b.unexplained} differences need a reason.`);
  await ctx.tx
    .update(pharmacyCountSheets)
    .set({ status: "approval", sentAt: ctx.now })
    .where(eq(pharmacyCountSheets.id, s.id));
  return { id: s.id };
}

export async function sendCountBack(ctx: PharmacyCtx, input: z.infer<typeof SheetInput>) {
  const s = await sheetOf(ctx, input.sheetId);
  if (s.status !== "approval") throw fail("conflict", "Only a count waiting for approval goes back.");
  await ctx.tx
    .update(pharmacyCountSheets)
    .set({ status: "counting", sentAt: null })
    .where(eq(pharmacyCountSheets.id, s.id));
  return { id: s.id };
}

export const ApproveCountInput = SheetInput.extend({ witnessAttestationId: z.uuid().nullish() });

/** The in-charge approves: the differences post now, through the month-end count. */
export async function approveCount(ctx: PharmacyCtx, input: z.infer<typeof ApproveCountInput>) {
  const s = await sheetOf(ctx, input.sheetId);
  if (s.status === "done") return { id: s.id };
  if (s.status !== "approval") throw fail("conflict", "Send the count for approval first.");
  if (s.createdBy === ctx.actor.userId)
    throw fail("forbidden", "Someone other than the counter approves the count.");
  const lines = await linesOf(ctx, s.id);
  const countId = crypto.randomUUID();
  await recordMonthEndCount(ctx, {
    clientKey: countId,
    locationId: s.locationId,
    lines: lines.map((l) => ({ batchId: l.batchId, counted: countedOf(l) ?? 0 })),
    witnessAttestationId: input.witnessAttestationId,
  });
  await ctx.tx
    .update(pharmacyCountSheets)
    .set({
      status: "done",
      approvedBy: ctx.actor.userId,
      approvedAt: ctx.now,
      witnessAttestationId: input.witnessAttestationId ?? null,
      countId,
    })
    .where(eq(pharmacyCountSheets.id, s.id));
  return { id: s.id };
}
