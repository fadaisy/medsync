import { createHash } from "node:crypto";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { MONTH_END } from "@/content/pharmacy-stores-supply";
import { pharmacyCountLines, pharmacyCounts } from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyPeriodDifferenceReasons,
  pharmacyPeriods,
  pharmacyPeriodSnapshots,
} from "@/db/schema/pharmacy-stores";
import { isControlledMedicine } from "@/lib/pharmacy/controlled-read";
import { localMonth } from "./ledger";
import { canClose, snapshotContent } from "./month-end";
import { buildMonth } from "./month-end-read";
import { reasonList, signedPack } from "./packs";
import {
  balancesAt,
  batchRef,
  fail,
  loadLocation,
  move,
  placeCols,
  requireAttestation,
  requireLive,
  storeNeed,
} from "./write";

/**
 * Month end, written (Pharmacy Phase 2, 5.8; MR-1 to MR-4; D-PH2-12, D-PH2-23). The count is blind (Law 5): the
 * figures go in first and differences come back only after commit. Closing writes the period and its immutable
 * snapshot (0181 append-only), with a second approver's fresh attestation; a closed month never re-opens.
 */

export const COUNT_NEED = storeNeed("pharmacy.stock");
export const REASON_NEED = storeNeed("pharmacy.stock");
export const CLOSE_NEED = storeNeed("pharmacy.manage");

const month = z.string().regex(/^\d{4}-\d{2}-01$/, "Choose a month.");

export const MonthEndCountInput = z.object({
  clientKey: z.uuid(),
  locationId: z.uuid(),
  lines: z
    .array(z.object({ batchId: z.uuid(), counted: z.number().int().min(0).max(1_000_000) }))
    .min(1)
    .max(2000),
  witnessAttestationId: z.uuid().nullish(),
});

/**
 * The month-end blind count of a store, a dispensing point or quarantine (scope `month_end`). Each difference is a
 * `count_correction` from this count, so the ledger then equals the count; the month report shows it under
 * Difference, not Adjusted (MR-1). Wards and carts are counted on their own pages (WS-3, EC-3).
 */
export async function recordMonthEndCount(
  ctx: PharmacyCtx,
  input: z.infer<typeof MonthEndCountInput>,
) {
  const hospitalId = ctx.actor.hospitalId;
  const [done] = await ctx.tx
    .select({ id: pharmacyCounts.id })
    .from(pharmacyCounts)
    .where(eq(pharmacyCounts.id, input.clientKey));
  if (done) return { id: done.id, differences: 0 };
  const loc = await loadLocation(ctx.tx, hospitalId, input.locationId);
  if (!["store", "dispensing_point", "quarantine"].includes(loc.kind))
    throw fail("invalid", MONTH_END.countWhere);
  requireLive(loc);
  if (new Set(input.lines.map((l) => l.batchId)).size !== input.lines.length)
    throw fail("invalid", "Each batch is counted once.");
  const batches = [];
  for (const l of [...input.lines].sort((a, b) => a.batchId.localeCompare(b.batchId)))
    batches.push({ line: l, batch: await batchRef(ctx.tx, hospitalId, l.batchId, loc.id) });
  let witness: string | null = null;
  for (const { batch } of batches)
    if (await isControlledMedicine(ctx.tx, hospitalId, batch.medicineId)) {
      if (!input.witnessAttestationId)
        throw fail("forbidden", "A controlled medicine is counted with its witness.");
      witness = await requireAttestation(ctx.tx, {
        id: input.witnessAttestationId,
        hospitalId,
        actorUserId: ctx.actor.userId,
        now: ctx.now,
      }).then(() => input.witnessAttestationId!);
      break;
    }
  const balances = await balancesAt(ctx.tx, loc.id);
  const pc = placeCols(loc);
  await ctx.tx.insert(pharmacyCounts).values({
    id: input.clientKey,
    hospitalId,
    dispensingPointId: pc.dispensingPointId,
    locationId: loc.id,
    scope: "month_end",
    countedBy: ctx.actor.userId,
    witnessAttestationId: witness,
    countedAt: ctx.now,
  });
  let differences = 0;
  for (const { line, batch } of batches) {
    const recorded = balances.get(batch.id) ?? 0;
    await ctx.tx.insert(pharmacyCountLines).values({
      countId: input.clientKey,
      batchId: batch.id,
      countedQuantity: line.counted,
      recordedBalance: recorded,
    });
    if (line.counted === recorded) continue;
    differences++;
    await move(ctx.tx, {
      hospitalId,
      location: loc,
      batchId: batch.id,
      kind: "count_correction",
      quantity: line.counted - recorded,
      sourceKind: "count",
      sourceId: input.clientKey,
      actorUserId: ctx.actor.userId,
      effectiveAt: ctx.now,
      reasonCode: "month_end_count",
      witnessAttestationId: witness,
    });
  }
  return { id: input.clientKey, differences };
}

export const DifferenceReasonInput = z
  .object({
    clientKey: z.uuid(),
    locationId: z.uuid(),
    month,
    productId: z.uuid(),
    kind: z.enum(["difference", "not_counted"]),
    reasonCode: z.string().trim().min(2).max(60).nullish(),
    unexplained: z.boolean(),
    note: z.string().trim().max(500).nullish(),
  })
  .refine((v) => v.unexplained !== !!v.reasonCode, {
    message: "Choose a reason, or leave it unexplained.",
  })
  .refine((v) => !(v.kind === "not_counted" && v.unexplained), {
    message: "Give the reason it was not counted.",
  });

/** A difference's reason from the signed list, or Unexplained (carried, MR-2); or why a product was not counted. */
export async function recordDifferenceReason(
  ctx: PharmacyCtx,
  input: z.infer<typeof DifferenceReasonInput>,
) {
  const [done] = await ctx.tx
    .select({ id: pharmacyPeriodDifferenceReasons.id })
    .from(pharmacyPeriodDifferenceReasons)
    .where(eq(pharmacyPeriodDifferenceReasons.id, input.clientKey));
  if (done) return { id: done.id };
  await loadLocation(ctx.tx, ctx.actor.hospitalId, input.locationId);
  const [closed] = await ctx.tx
    .select({ id: pharmacyPeriods.id })
    .from(pharmacyPeriods)
    .where(
      and(
        eq(pharmacyPeriods.hospitalId, ctx.actor.hospitalId),
        eq(pharmacyPeriods.locationId, input.locationId),
        eq(pharmacyPeriods.month, input.month),
      ),
    );
  if (closed) throw fail("conflict", "That month is closed. Nothing in it changes.");
  if (input.reasonCode) {
    const list = await reasonList(ctx.tx, ctx.actor.hospitalId, "month_end_differences");
    if (!list?.some((r) => r.code === input.reasonCode))
      throw fail("invalid", MONTH_END.noReasonList);
  }
  await ctx.tx.insert(pharmacyPeriodDifferenceReasons).values({
    id: input.clientKey,
    hospitalId: ctx.actor.hospitalId,
    locationId: input.locationId,
    month: input.month,
    productId: input.productId,
    kind: input.kind,
    reasonCode: input.reasonCode ?? null,
    unexplained: input.unexplained,
    note: input.note ?? null,
    actorUserId: ctx.actor.userId,
    at: ctx.now,
  });
  return { id: input.clientKey };
}

export const CloseMonthInput = z.object({
  clientKey: z.uuid(),
  /** Null: the hospital as a whole. */
  locationId: z.uuid().nullable(),
  month,
  approvalAttestationId: z.uuid({ message: "The second approver confirms first." }),
});

/** MR-3, MR-4: close one scope's month with a second approver; the snapshot's sha256 is of its stable JSON. */
export async function closeMonth(ctx: PharmacyCtx, input: z.infer<typeof CloseMonthInput>) {
  const hospitalId = ctx.actor.hospitalId;
  const [done] = await ctx.tx
    .select({ id: pharmacyPeriods.id })
    .from(pharmacyPeriods)
    .where(eq(pharmacyPeriods.id, input.clientKey));
  if (done) return { id: done.id };
  if (input.month > localMonth(ctx.now)) throw fail("invalid", "That month has not happened yet.");
  const scope = input.locationId
    ? ({
        kind: "location",
        locationId: (await loadLocation(ctx.tx, hospitalId, input.locationId)).id,
      } as const)
    : ({ kind: "hospital" } as const);
  const rules = await signedPack(ctx.tx, hospitalId, "month_end_rules");
  if (!rules) throw fail("config", MONTH_END.noWindow);
  const report = await buildMonth(ctx.tx, hospitalId, scope, input.month);
  if (report.closed) throw fail("conflict", "That month is already closed.");
  const approvedBy = await requireAttestation(ctx.tx, {
    id: input.approvalAttestationId,
    hospitalId,
    actorUserId: ctx.actor.userId,
    now: ctx.now,
  });
  const verdict = canClose({
    month: input.month,
    rows: report.rows,
    counts: report.counts,
    notCountedReasons: report.notCountedReasons,
    countWindow: rules.content.countWindow,
    closedBy: ctx.actor.userId,
    approvedBy,
    approvalAttestationId: input.approvalAttestationId,
  });
  if ("missing" in verdict) throw fail("config", MONTH_END.noWindow);
  if (!verdict.ok) {
    const name = (id: string) => report.ledger.products.get(id)?.name ?? id;
    const where = (id: string) => report.ledger.locations.get(id)?.name ?? id;
    const B = MONTH_END.blockers;
    throw fail(
      "conflict",
      verdict.blockers
        .map((b) =>
          b.kind === "not_counted"
            ? B.not_counted(name(b.productId))
            : b.kind === "difference_without_reason"
              ? B.difference_without_reason(name(b.productId))
              : b.kind === "count_outside_window"
                ? B.count_outside_window(where(b.locationId))
                : B[b.kind],
        )
        .join(" "),
    );
  }
  const scopeKey = input.locationId ?? "hospital";
  const content = snapshotContent(scopeKey, input.month, report.rows);
  const [period] = await ctx.tx
    .insert(pharmacyPeriods)
    .values({
      id: input.clientKey,
      hospitalId,
      locationId: input.locationId,
      month: input.month,
      closedBy: ctx.actor.userId,
      approvedBy,
      approvalAttestationId: input.approvalAttestationId,
      closedAt: ctx.now,
    })
    .returning({ id: pharmacyPeriods.id });
  await ctx.tx.insert(pharmacyPeriodSnapshots).values({
    periodId: period!.id,
    hospitalId,
    content: JSON.parse(content) as unknown,
    sha256: createHash("sha256").update(content, "utf8").digest("hex"),
    createdAt: ctx.now,
  });
  return { id: period!.id };
}
