import type { Cut, TrimLine } from "./order";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { MEDICINES } from "@/content/pharmacy-medicines";
import { STORES_B } from "@/content/pharmacy-stores";
import { ORDERS, SUPPLY_COMMON } from "@/content/pharmacy-stores-supply";
import {
  pharmacyCounterparties,
  pharmacyOrderLines,
  pharmacyOrders,
} from "@/db/schema/pharmacy-stores";
import { pharmacyOrderComparisons } from "@/db/schema/pharmacy-stores-0184";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { confirmCutRefusal, trimToBudget, wholePack } from "./order";
import { buildProposal, loadOrders } from "./order-read";
import { fail, storeNeed } from "./write";

/**
 * The order, written (Pharmacy Phase 2, 5.9, 5.10; OQ-1 to OQ-6; Law 10). A proposal is recomputed on the server
 * from the ledger and the signed parameters and saved as a draft with every row's inputs, formula and parameter
 * version (OQ-6). The in-charge's quantity is required to save as an order; cuts are confirmed one by one, a vital
 * cut with a typed reason (OQ-5). Saving sends nothing: no function here reaches the network.
 */

export const MANAGE_NEED = storeNeed("pharmacy.manage");

export const ProposalInput = z.object({
  clientKey: z.uuid(),
  kind: z.enum(["cycle", "emergency"]),
  /** An emergency order names its medicines; a cycle order takes every medicine. */
  medicineIds: z
    .array(z.string().regex(/^[a-z0-9_]{2,80}$/))
    .max(500)
    .nullish(),
  counterpartyId: z.uuid().nullish(),
  budget: z.number().min(0).max(1e13).nullish(),
  chosen: z
    .array(
      z.object({
        productId: z.uuid(),
        units: z.number().int().min(0).max(10_000_000).nullable(),
        reason: z.string().trim().min(2).max(300).nullish(),
      }),
    )
    .max(2000)
    .default([]),
});

/** The parameters the proposal is missing, in words (STORES_B.parameterMissing). */
const missingWords = (missing: readonly string[]) =>
  missing
    .map((m) => ORDERS.parameterNames[m as keyof typeof ORDERS.parameterNames] ?? m)
    .join(", ");

/** saveOrderProposal: the server's proposal as a draft order, with the in-charge's quantities so far. */
export async function saveOrderProposal(ctx: PharmacyCtx, input: z.infer<typeof ProposalInput>) {
  const hospitalId = ctx.actor.hospitalId;
  if (input.kind === "emergency" && !input.medicineIds?.length)
    throw fail("invalid", "An emergency order names its medicines.");
  const [existing] = await ctx.tx
    .select({ id: pharmacyOrders.id, state: pharmacyOrders.state })
    .from(pharmacyOrders)
    .where(and(eq(pharmacyOrders.id, input.clientKey), eq(pharmacyOrders.hospitalId, hospitalId)))
    .for("update");
  if (existing && existing.state !== "draft")
    throw fail("conflict", "That order is saved. It changes only by closing a line.");
  if (input.counterpartyId) {
    const [cp] = await ctx.tx
      .select({ id: pharmacyCounterparties.id })
      .from(pharmacyCounterparties)
      .where(
        and(
          eq(pharmacyCounterparties.id, input.counterpartyId),
          eq(pharmacyCounterparties.hospitalId, hospitalId),
          isNull(pharmacyCounterparties.retiredAt),
        ),
      );
    if (!cp) throw fail("not_found", SUPPLY_COMMON.notHere);
  }
  const proposal = await buildProposal(
    ctx.tx,
    hospitalId,
    ctx.now,
    input.kind === "emergency" ? (input.medicineIds ?? []) : null,
  );
  if (!proposal.parameters || proposal.missing.length)
    throw fail(
      "config",
      STORES_B.parameterMissing(missingWords(proposal.missing), ORDERS.roleSetsIt),
    );
  const chosen = new Map(input.chosen.map((c) => [c.productId, c]));
  // "Add to the order" from Medicines (0270): an open ask becomes the line's chosen quantity unless one is typed here.
  const [reg] = rowsOf<{ on: boolean }>(
    await ctx.tx.execute(sql`SELECT to_regclass('public.pharmacy_order_asks') IS NOT NULL AS on`),
  );
  const asks = new Map(
    reg?.on
      ? rowsOf<{ product_id: string; quantity: number }>(
          await ctx.tx.execute(sql`
        SELECT product_id, quantity FROM public.pharmacy_order_asks
         WHERE hospital_id = ${hospitalId}::uuid AND withdrawn_at IS NULL
           AND (order_id IS NULL OR order_id = ${input.clientKey}::uuid)`),
        ).map((a) => [a.product_id, Number(a.quantity)])
      : [],
  );
  if (existing)
    await ctx.tx.delete(pharmacyOrderLines).where(eq(pharmacyOrderLines.orderId, existing.id));
  else
    await ctx.tx.insert(pharmacyOrders).values({
      id: input.clientKey,
      hospitalId,
      counterpartyId: input.counterpartyId ?? null,
      kind: input.kind,
      cutAt: ctx.now,
      parametersSetId: proposal.parameters.id,
      budget: input.budget == null ? null : String(input.budget),
      createdBy: ctx.actor.userId,
    });
  if (proposal.lines.length)
    await ctx.tx.insert(pharmacyOrderLines).values(
      proposal.lines.map((l) => {
        const c = chosen.get(l.productId);
        return {
          orderId: input.clientKey,
          medicineId: l.medicineId,
          productId: l.productId,
          inputs: {
            ...l.row.inputs,
            formula: l.row.formula,
            steps: l.steps,
            flags: l.row.flags,
            notChecked: l.row.notChecked,
            version: l.row.version,
            ven: l.ven,
            unitPrice: l.unitPrice,
            notAdded: l.notAdded,
          },
          proposedUnits: l.row.proposedUnits,
          proposedPacks: l.row.proposedPacks,
          chosenUnits: c?.units ?? asks.get(l.productId) ?? null,
          reason: c?.reason ?? (asks.has(l.productId) ? MEDICINES.refused.orderAsk : null),
        };
      }),
    );
  const taken = proposal.lines.map((l) => l.productId).filter((id) => asks.has(id));
  if (taken.length)
    await ctx.tx.execute(sql`
      UPDATE public.pharmacy_order_asks SET order_id = ${input.clientKey}::uuid
       WHERE hospital_id = ${hospitalId}::uuid AND withdrawn_at IS NULL AND order_id IS NULL
         AND product_id IN (${sql.join(
           taken.map((id) => sql`${id}::uuid`),
           sql`, `,
         )})`);
  return { id: input.clientKey, lines: proposal.lines.length };
}

async function draftOf(ctx: PharmacyCtx, orderId: string) {
  const [o] = await loadOrders(ctx.tx, ctx.actor.hospitalId, orderId);
  if (!o) throw fail("not_found", SUPPLY_COMMON.notHere);
  return o;
}

/** OQ-5 over a draft: its lines at the in-charge's quantity (or the proposal) against its budget. */
export async function proposedCuts(ctx: PharmacyCtx, orderId: string) {
  const o = await draftOf(ctx, orderId);
  if (o.budget === null) return { order: o, cuts: [] as Cut[], missing: [] as string[] };
  const proposal = await buildProposal(ctx.tx, ctx.actor.hospitalId, ctx.now, null);
  const unclassed = proposal.parameters?.unclassedTrimAs ?? null;
  const lines: TrimLine[] = o.lines.map((l) => {
    const inputs = l.inputs as {
      ven?: TrimLine["ven"];
      unitPrice?: number | null;
      packSize?: string | null;
    };
    return {
      productId: l.productId,
      ven: inputs.ven ?? null,
      units: l.chosenUnits ?? l.proposedUnits ?? 0,
      unitPrice: inputs.unitPrice ?? null,
      packSize: wholePack(inputs.packSize ?? null),
    };
  });
  const t = trimToBudget(lines, o.budget, unclassed);
  return "missing" in t
    ? { order: o, cuts: [] as Cut[], missing: t.missing as string[] }
    : { order: o, cuts: t.cuts, missing: [] as string[] };
}

export const ConfirmCutInput = z.object({
  clientKey: z.uuid(),
  orderId: z.uuid(),
  productId: z.uuid(),
  reason: z.string().trim().max(300).nullish(),
});

/** OQ-5: one proposed cut, confirmed by the in-charge; a vital cut only with a typed reason. */
export async function confirmCut(ctx: PharmacyCtx, input: z.infer<typeof ConfirmCutInput>) {
  const { order, cuts, missing } = await proposedCuts(ctx, input.orderId);
  if (order.state !== "draft") throw fail("conflict", "That order is saved.");
  if (missing.length) throw fail("config", ORDERS.unpriced);
  const cut = cuts.find((c) => c.productId === input.productId);
  if (!cut) throw fail("conflict", "That cut is no longer proposed.");
  if (confirmCutRefusal(cut, input.reason ?? null)) throw fail("invalid", ORDERS.vitalReason);
  const line = order.lines.find((l) => l.productId === input.productId)!;
  await ctx.tx
    .update(pharmacyOrderLines)
    .set({
      chosenUnits: cut.toUnits,
      reason: input.reason?.trim() || line.reason || "Trimmed to the budget",
      cut: {
        ...cut,
        reason: input.reason ?? null,
        confirmedBy: ctx.actor.userId,
        at: ctx.now.toISOString(),
      },
    })
    .where(eq(pharmacyOrderLines.id, line.id));
  return { id: line.id };
}

export const SaveOrderInput = z.object({ clientKey: z.uuid(), orderId: z.uuid() });

/** saveOrder: the draft becomes an open order once every line has the in-charge's quantity (and a reason where it differs). */
export async function saveOrder(ctx: PharmacyCtx, input: z.infer<typeof SaveOrderInput>) {
  const o = await draftOf(ctx, input.orderId);
  if (o.state === "open") return { id: o.id };
  if (o.state !== "draft") throw fail("conflict", "That order is closed.");
  if (!o.lines.length) throw fail("invalid", "The order has no lines.");
  if (o.lines.some((l) => l.chosenUnits === null)) throw fail("invalid", ORDERS.yoursRequired);
  const unreasoned = o.lines.find((l) => l.chosenUnits !== l.proposedUnits && !l.reason?.trim());
  if (unreasoned) throw fail("invalid", ORDERS.reasonRequired(unreasoned.medicineId));
  await ctx.tx
    .update(pharmacyOrders)
    .set({ state: "open", savedAt: ctx.now, savedBy: ctx.actor.userId })
    .where(eq(pharmacyOrders.id, o.id));
  return { id: o.id };
}

export const CloseLineInput = z.object({
  clientKey: z.uuid(),
  orderLineId: z.uuid(),
  reason: z.enum(["supplier_out", "cancelled", "substituted", "other"]),
  note: z.string().trim().max(300).nullish(),
});

/** 5.10: a line closes with a reason; the order closes when every line is received or closed. */
export async function closeOrderLine(ctx: PharmacyCtx, input: z.infer<typeof CloseLineInput>) {
  const [line] = await ctx.tx
    .select({
      id: pharmacyOrderLines.id,
      orderId: pharmacyOrderLines.orderId,
      closedAt: pharmacyOrderLines.closedAt,
    })
    .from(pharmacyOrderLines)
    .innerJoin(pharmacyOrders, eq(pharmacyOrders.id, pharmacyOrderLines.orderId))
    .where(
      and(
        eq(pharmacyOrderLines.id, input.orderLineId),
        eq(pharmacyOrders.hospitalId, ctx.actor.hospitalId),
      ),
    );
  if (!line) throw fail("not_found", SUPPLY_COMMON.notHere);
  if (line.closedAt) return { id: line.id };
  const [o] = await loadOrders(ctx.tx, ctx.actor.hospitalId, line.orderId);
  if (o!.state !== "open") throw fail("conflict", "Only a saved, open order's line is closed.");
  if (input.reason === "other" && !input.note) throw fail("invalid", "Say why.");
  await ctx.tx
    .update(pharmacyOrderLines)
    .set({
      closedAt: ctx.now,
      closedBy: ctx.actor.userId,
      closeReason: input.reason,
      closeNote: input.note ?? null,
    })
    .where(eq(pharmacyOrderLines.id, line.id));
  const after = (await loadOrders(ctx.tx, ctx.actor.hospitalId, line.orderId))[0]!;
  if (after.lines.every((l) => l.state === "received" || l.state === "closed"))
    await ctx.tx
      .update(pharmacyOrders)
      .set({ state: "closed", closedAt: ctx.now })
      .where(eq(pharmacyOrders.id, after.id));
  return { id: line.id };
}

export const PaperComparisonInput = z.object({
  clientKey: z.uuid(),
  orderId: z.uuid(),
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        paperUnits: z.number().int().min(0),
        explanation: z.string().trim().max(500).nullish(),
      }),
    )
    .min(1),
});

/** The ordering go-live condition (5.12): the paper figure for every line, and a written reason for each difference. */
export async function recordPaperOrderComparison(
  ctx: PharmacyCtx,
  input: z.infer<typeof PaperComparisonInput>,
) {
  const [done] = await ctx.tx
    .select({ id: pharmacyOrderComparisons.id })
    .from(pharmacyOrderComparisons)
    .where(eq(pharmacyOrderComparisons.id, input.clientKey));
  if (done) return { id: done.id };
  const o = await draftOf(ctx, input.orderId);
  const paper = new Map(input.lines.map((l) => [l.productId, l]));
  if (o.lines.some((l) => !paper.has(l.productId)))
    throw fail("invalid", "Give the paper figure for every line.");
  await ctx.tx.insert(pharmacyOrderComparisons).values({
    id: input.clientKey,
    hospitalId: ctx.actor.hospitalId,
    orderId: o.id,
    lines: o.lines.map((l) => ({
      productId: l.productId,
      proposedUnits: l.proposedUnits ?? 0,
      paperUnits: paper.get(l.productId)!.paperUnits,
      explanation: paper.get(l.productId)!.explanation ?? null,
    })),
    recordedBy: ctx.actor.userId,
    recordedAt: ctx.now,
  });
  return { id: input.clientKey };
}

/** 5.9 Copy the quantities: plain text, product and quantity, for typing into the NMS portal by a person. */
export const quantitiesText = (lines: readonly { name: string; units: number; unit: string }[]) =>
  lines.map((l) => `${l.name}\t${l.units} ${l.unit}`).join("\n");
