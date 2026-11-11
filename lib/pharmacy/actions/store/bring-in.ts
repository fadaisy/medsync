import "server-only";

import type { Ctx } from "./shared";
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { STORE_SAYS as S } from "@/content/pharmacy-store";
import { markShelved } from "@/lib/pharmacy/actions/receive/after";
import { planFor, planTotal, trimToBudget } from "@/lib/pharmacy/derive/store/orders";
import { medOf } from "@/lib/pharmacy/derive/store/stock";
import { PutAwayInput, putAway as putOnShelf } from "@/lib/pharmacy/stores/shelves";
import { fail, loadLocation } from "@/lib/pharmacy/stores/write";
import {
  act,
  mustBeInCharge,
  NEED,
  one,
  replayVoucher,
  sendDispatch,
  storeOf,
  worldOf,
} from "./shared";

/**
 * Orders and put away (STORE.md §E, §I). The draft holds what was typed; the plan fills the rest from the formula, the
 * same function the screen reads (`planFor`). Trim and send run it again here, so nothing comes from the client.
 */
const draftOf = async (ctx: Ctx, supplierId: string) => {
  const h = ctx.actor.hospitalId;
  const found = await one<{ id: string }>(
    ctx,
    sql`SELECT id FROM public.pharmacy_orders WHERE hospital_id = ${h}::uuid AND supplier_id = ${supplierId}::uuid AND state = 'draft' LIMIT 1 FOR UPDATE`,
  );
  if (found) return found.id;
  const made = await one<{ id: string }>(
    ctx,
    sql`INSERT INTO public.pharmacy_orders (hospital_id, kind, state, cut_at, created_by, supplier_id)
        VALUES (${h}::uuid, 'cycle', 'draft', ${ctx.now.toISOString()}::timestamptz, ${ctx.actor.userId}::uuid, ${supplierId}::uuid)
        RETURNING id`,
  );
  return made!.id;
};

/** One line in the draft: the formula's inputs kept with it, as every order line does. */
async function putLine(
  ctx: Ctx,
  w: StoreWorld,
  orderId: string,
  medId: string,
  qty: number,
  cut: { to: number } | null,
) {
  const m = medOf(w, medId);
  const inputs = JSON.stringify({
    use: m.use,
    onOrder: m.onOrder,
    pack: m.pack,
    months: w.rules.monthsTo,
  });
  const cutJson = cut ? JSON.stringify(cut) : null;
  const had = await one<{ id: string }>(
    ctx,
    sql`SELECT id FROM public.pharmacy_order_lines WHERE order_id = ${orderId}::uuid AND product_id = ${medId}::uuid`,
  );
  if (had)
    await ctx.tx.execute(sql`
      UPDATE public.pharmacy_order_lines SET chosen_units = ${qty}, cut = ${cutJson}::jsonb WHERE id = ${had.id}::uuid`);
  else
    await ctx.tx.execute(sql`
      INSERT INTO public.pharmacy_order_lines (order_id, medicine_id, product_id, inputs, proposed_units, chosen_units, cut)
      VALUES (${orderId}::uuid, ${m.medicineId}, ${medId}::uuid, ${inputs}::jsonb, ${qty}, ${qty}, ${cutJson}::jsonb)`);
}

const Supplier = z.object({ supplierId: z.uuid() });

export const setOrderQty = act(
  Supplier.extend({ productId: z.uuid(), quantity: z.number().int().min(0).max(1_000_000) }),
  NEED,
  async (ctx, i) => {
    const w = await worldOf(ctx);
    const id = await draftOf(ctx, i.supplierId);
    await putLine(ctx, w, id, i.productId, i.quantity, null);
    return { id };
  },
);

export const setBudget = act(
  Supplier.extend({ budget: z.number({ message: S.bud }).int().min(0).max(1_000_000_000_000) }),
  NEED,
  async (ctx, i) => {
    const id = await draftOf(ctx, i.supplierId);
    await ctx.tx.execute(
      sql`UPDATE public.pharmacy_orders SET budget = ${i.budget} WHERE id = ${id}::uuid`,
    );
    return { id };
  },
);

export const trimOrder = act(Supplier, NEED, async (ctx, i) => {
  const w = await worldOf(ctx);
  const id = await draftOf(ctx, i.supplierId);
  const budget = await one<{ budget: string | null }>(
    ctx,
    sql`SELECT budget FROM public.pharmacy_orders WHERE id = ${id}::uuid`,
  );
  const plan = planFor(w, i.supplierId);
  const r = trimToBudget(plan, Number(budget?.budget ?? 0));
  for (const l of plan) {
    const q = r.qty.get(l.medId) ?? l.qty;
    await putLine(ctx, w, id, l.medId, q, r.trimmed.includes(l.medId) ? { to: q } : null);
  }
  return { id, trimmed: r.trimmed, total: r.total, stillOver: r.stillOver };
});

/** Locks it: Sent until the delivery is received. The in-charge sends. */
export const sendOrder = act(Supplier, NEED, async (ctx, i) => {
  await mustBeInCharge(ctx);
  const w = await worldOf(ctx);
  const id = await draftOf(ctx, i.supplierId);
  const plan = planFor(w, i.supplierId).filter((l) => l.qty > 0);
  if (!plan.length) throw fail("invalid", S.orderEmpty);
  const trimmed = new Set(
    w.orders
      .find((o) => o.id === id)
      ?.lines.filter((l) => l.trimmed)
      .map((l) => l.medId) ?? [],
  );
  for (const l of plan)
    await putLine(ctx, w, id, l.medId, l.qty, trimmed.has(l.medId) ? { to: l.qty } : null);
  await ctx.tx.execute(sql`
    UPDATE public.pharmacy_orders SET state = 'open', saved_at = ${ctx.now.toISOString()}::timestamptz,
      saved_by = ${ctx.actor.userId}::uuid, sent_at = ${ctx.now.toISOString()}::timestamptz, sent_by = ${ctx.actor.userId}::uuid
     WHERE id = ${id}::uuid`);
  return { id, total: planTotal(plan) };
});

/** Cold-first is the database's rule (`pbs_cold_first`). */
export const putAway = act(PutAwayInput, NEED, async (ctx, i) => {
  const out = await putOnShelf(ctx, i);
  await markShelved(ctx, i.batchId, i.shelf, i.clientKey);
  return out;
});

/** Undo in the same session: a new row that says so. Only the person who put it away (`undo_own`). */
export const undoPutAway = act(
  z.object({ clientKey: z.uuid(), shelfRowId: z.uuid() }),
  NEED,
  async (ctx, i) => {
    const row = await one<{ batch_id: string }>(
      ctx,
      sql`SELECT batch_id FROM public.pharmacy_batch_shelves WHERE id = ${i.shelfRowId}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid`,
    );
    if (!row) throw fail("not_found", S.undoOwn);
    await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_batch_shelves (id, hospital_id, batch_id, shelf, undoes, actor_id)
    VALUES (${i.clientKey}::uuid, ${ctx.actor.hospitalId}::uuid, ${row.batch_id}::uuid, NULL, ${i.shelfRowId}::uuid, ${ctx.actor.userId}::uuid)
    ON CONFLICT (id) DO NOTHING`);
    return { id: i.clientKey };
  },
);

/** Part of a delivery goes out directly, never shelved: the ledger shows the GRN in and the RIV out. */
export const sendStraight = act(
  z.object({
    clientKey: z.uuid(),
    batchId: z.uuid(),
    placeId: z.uuid(),
    quantity: z.number().int().positive().max(1_000_000),
    witnessAttestationId: z.uuid().nullish(),
  }),
  NEED,
  async (ctx, i) => {
    const prior = await replayVoucher(ctx, i.clientKey);
    if (prior) return { id: i.clientKey, voucher: prior };
    const d = await sendDispatch(ctx, {
      id: i.clientKey,
      kind: "straight",
      from: await storeOf(ctx),
      to: await loadLocation(ctx.tx, ctx.actor.hospitalId, i.placeId),
      batches: [{ batchId: i.batchId, quantity: i.quantity }],
      attestationId: i.witnessAttestationId,
    });
    return { id: d.id, voucher: d.voucher };
  },
);
