import "server-only";

import type { Ctx } from "@/lib/pharmacy/actions/store/shared";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { RC } from "@/content/pharmacy-receive";
import { act, all, NEED, one, replayVoucher, sendDispatch, storeOf } from "@/lib/pharmacy/actions/store/shared";
import { inHouseCode } from "@/lib/pharmacy/barcode";
import { PutAwayInput, putAway as putOnShelf } from "@/lib/pharmacy/stores/shelves";
import { fail, loadLocation } from "@/lib/pharmacy/stores/write";

/** After a delivery: put away, labels, orders and claims (RECEIVE §C, §E). */
const S = RC.says;

const putRow = async (ctx: Ctx, lineId: string) => {
  const r = await one<{
    id: string;
    batch_id: string;
    qty: number;
    sent_qty: number;
    delivery_id: string;
    shelf_row_id: string | null;
    product_id: string;
    cold: boolean;
  }>(
    ctx,
    sql`SELECT p.id, p.batch_id, p.qty, p.sent_qty, l.delivery_id, p.shelf_row_id, l.product_id, coalesce(m.cold_chain, false) AS cold
          FROM public.pharmacy_delivery_put_away p JOIN public.pharmacy_delivery_lines l ON l.id = p.delivery_line_id
          JOIN public.pharmacy_products m ON m.id = l.product_id
         WHERE p.delivery_line_id = ${lineId}::uuid AND p.hospital_id = ${ctx.actor.hospitalId}::uuid FOR UPDATE OF p`,
  );
  if (!r) throw fail("not_found", S.shelf);
  return r;
};

const settle = async (ctx: Ctx, deliveryId: string) => {
  await ctx.tx.execute(sql`
    UPDATE public.pharmacy_deliveries d SET shelved_at = CASE WHEN EXISTS (
        SELECT 1 FROM public.pharmacy_delivery_put_away p JOIN public.pharmacy_delivery_lines l ON l.id = p.delivery_line_id
         WHERE l.delivery_id = d.id AND p.done_at IS NULL) THEN NULL ELSE coalesce(d.shelved_at, ${ctx.now.toISOString()}::timestamptz) END
     WHERE d.id = ${deliveryId}::uuid`);
};

/** Any shelving of a batch, from here or the Main store's Put away, marks its waiting rows. Cold first (0275's guard too). */
export async function markShelved(ctx: Ctx, batchId: string, shelf: string, rowId: string) {
  const rows = await all<{ delivery_id: string }>(
    ctx,
    sql`UPDATE public.pharmacy_delivery_put_away p SET shelf = ${shelf}, done_at = ${ctx.now.toISOString()}::timestamptz,
          done_by = ${ctx.actor.userId}::uuid, shelf_row_id = ${rowId}::uuid
        FROM public.pharmacy_delivery_lines l
       WHERE l.id = p.delivery_line_id AND p.batch_id = ${batchId}::uuid AND p.done_at IS NULL RETURNING l.delivery_id`,
  );
  for (const r of rows) await settle(ctx, r.delivery_id);
}

export const putAwayLine = act(
  z.object({ clientKey: z.uuid(), lineId: z.uuid(), shelf: PutAwayInput.shape.shelf }),
  NEED,
  async (ctx, i) => {
    const row = await putRow(ctx, i.lineId);
    if (!row.cold) {
      const waiting = await one<{ name: string; shelf: string | null }>(
        ctx,
        sql`SELECT m.name, p.shelf FROM public.pharmacy_delivery_put_away p JOIN public.pharmacy_delivery_lines l ON l.id = p.delivery_line_id
              JOIN public.pharmacy_products m ON m.id = l.product_id
             WHERE l.delivery_id = ${row.delivery_id}::uuid AND p.done_at IS NULL AND coalesce(m.cold_chain, false) LIMIT 1`,
      );
      if (waiting) throw fail("conflict", S.cold(waiting.name.split(" ")[0]!.toLowerCase(), waiting.shelf ?? ""));
    }
    await putOnShelf(ctx, { clientKey: i.clientKey, batchId: row.batch_id, shelf: i.shelf });
    await markShelved(ctx, row.batch_id, i.shelf, i.clientKey);
    await ctx.tx.execute(sql`UPDATE public.pharmacy_products SET usual_shelf = ${i.shelf} WHERE id = ${row.product_id}::uuid AND usual_shelf IS NULL`);
    return { id: i.clientKey };
  },
);

/** Undo, for the same session: a row that says so, by the person who put it away (the shelf guard's `undo_own`). */
export const undoPutAwayLine = act(z.object({ clientKey: z.uuid(), lineId: z.uuid() }), NEED, async (ctx, i) => {
  const row = await putRow(ctx, i.lineId);
  if (row.shelf_row_id)
    await ctx.tx.execute(sql`
      INSERT INTO public.pharmacy_batch_shelves (id, hospital_id, batch_id, shelf, undoes, actor_id)
      VALUES (${i.clientKey}::uuid, ${ctx.actor.hospitalId}::uuid, ${row.batch_id}::uuid, NULL, ${row.shelf_row_id}::uuid, ${ctx.actor.userId}::uuid)
      ON CONFLICT (id) DO NOTHING`);
  await ctx.tx.execute(sql`UPDATE public.pharmacy_delivery_put_away SET done_at = NULL, done_by = NULL, shelf_row_id = NULL WHERE id = ${row.id}::uuid`);
  await settle(ctx, row.delivery_id);
  return { id: i.clientKey };
});

/** Part of a line goes straight to a place short of it, on a new RIV; it joins that place on confirmation. */
export const sendStraightLine = act(
  z.object({ clientKey: z.uuid(), lineId: z.uuid(), placeId: z.uuid(), quantity: z.number().int().positive().max(1_000_000) }),
  NEED,
  async (ctx, i) => {
    const prior = await replayVoucher(ctx, i.clientKey);
    if (prior) return { id: i.clientKey, voucher: prior };
    const row = await putRow(ctx, i.lineId);
    const quantity = Math.min(i.quantity, row.qty);
    const d = await sendDispatch(ctx, {
      id: i.clientKey,
      kind: "straight",
      from: await storeOf(ctx),
      to: await loadLocation(ctx.tx, ctx.actor.hospitalId, i.placeId),
      batches: [{ batchId: row.batch_id, quantity }],
      attestationId: null,
    });
    const left = row.qty - quantity;
    await ctx.tx.execute(sql`UPDATE public.pharmacy_delivery_put_away SET qty = ${left}, sent_qty = sent_qty + ${quantity},
      done_at = CASE WHEN ${left} = 0 THEN ${ctx.now.toISOString()}::timestamptz ELSE done_at END,
      done_by = CASE WHEN ${left} = 0 THEN ${ctx.actor.userId}::uuid ELSE done_by END WHERE id = ${row.id}::uuid`);
    await settle(ctx, row.delivery_id);
    return { id: d.id, voucher: d.voucher };
  },
);

/** A medicine with no GTIN gets a `200` code, saved, so its label scans next time. */
export const assignInHouseCode = act(z.object({ productId: z.uuid() }), NEED, async (ctx, i) => {
  const h = ctx.actor.hospitalId;
  const p = await one<{ gtin: string | null }>(ctx, sql`SELECT gtin FROM public.pharmacy_products WHERE id = ${i.productId}::uuid AND hospital_id = ${h}::uuid FOR UPDATE`);
  if (!p) throw fail("not_found", S.shelf);
  if (p.gtin) return { id: i.productId, gtin: p.gtin };
  const v = (await one<{ v: string }>(ctx, sql`SELECT private.pharmacy_next_voucher(${h}::uuid, 'OWN') AS v`))!.v;
  const gtin = `0${inHouseCode(Number(v.replace(/\D/g, "")))}`;
  await ctx.tx.execute(sql`UPDATE public.pharmacy_products SET gtin = ${gtin}, own_code = true WHERE id = ${i.productId}::uuid`);
  return { id: i.productId, gtin };
});

/* ─── Orders ─── */

export const editOrder = act(
  z.object({
    orderId: z.uuid(),
    lines: z
      .array(
        z.object({
          id: z.uuid().nullable(),
          productId: z.uuid(),
          name: z.string().max(200),
          packs: z.number().int().min(0).max(1_000_000),
          price: z.number().min(0).max(1e12),
          per: z.number().int().positive().max(1_000_000),
        }),
      )
      .max(500),
    removed: z.array(z.uuid()).max(500),
  }),
  NEED,
  async (ctx, i) => {
    const h = ctx.actor.hospitalId;
    const o = await one<{ state: string }>(ctx, sql`SELECT state FROM public.pharmacy_orders WHERE id = ${i.orderId}::uuid AND hospital_id = ${h}::uuid FOR UPDATE`);
    if (!o || o.state !== "open") throw fail("conflict", S.orderEmpty);
    if (!i.lines.length) throw fail("invalid", S.orderEmpty);
    const got = new Map(
      (await all<{ id: string; received: number }>(ctx, sql`SELECT id, received_packs AS received FROM public.pharmacy_order_lines WHERE order_id = ${i.orderId}::uuid`)).map((r) => [r.id, r.received]),
    );
    for (const l of i.lines) {
      if (!l.packs) throw fail("invalid", S.lineEmpty(l.name));
      const received = l.id ? (got.get(l.id) ?? 0) : 0;
      if (l.packs < received) throw fail("conflict", S.below(l.name, received));
    }
    for (const id of i.removed) await ctx.tx.execute(sql`DELETE FROM public.pharmacy_order_lines WHERE id = ${id}::uuid AND order_id = ${i.orderId}::uuid`);
    for (const l of i.lines) {
      if (l.id)
        await ctx.tx.execute(sql`UPDATE public.pharmacy_order_lines SET packs = ${l.packs}, per_pack = ${l.per}, price_per_pack = ${l.price}, chosen_units = ${l.packs * l.per}
          WHERE id = ${l.id}::uuid AND order_id = ${i.orderId}::uuid`);
      else
        await ctx.tx.execute(sql`
          INSERT INTO public.pharmacy_order_lines (order_id, medicine_id, product_id, inputs, chosen_units, packs, per_pack, price_per_pack)
          SELECT ${i.orderId}::uuid, medicine_id, id, '{}'::jsonb, ${l.packs * l.per}, ${l.packs}, ${l.per}, ${l.price} FROM public.pharmacy_products WHERE id = ${l.productId}::uuid AND hospital_id = ${h}::uuid`);
    }
    const allIn = i.lines.every((l) => l.packs <= (l.id ? (got.get(l.id) ?? 0) : 0));
    await ctx.tx.execute(sql`UPDATE public.pharmacy_orders SET edited_on = (${ctx.now.toISOString()}::timestamptz AT TIME ZONE 'Africa/Kampala')::date,
      state = ${allIn ? "closed" : "open"}, closed_at = ${allIn ? ctx.now.toISOString() : null}::timestamptz WHERE id = ${i.orderId}::uuid`);
    return { id: i.orderId };
  },
);

export const markChased = act(z.object({ orderId: z.uuid() }), NEED, async (ctx, i) => {
  await ctx.tx.execute(sql`UPDATE public.pharmacy_orders SET chased_on = (${ctx.now.toISOString()}::timestamptz AT TIME ZONE 'Africa/Kampala')::date
    WHERE id = ${i.orderId}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid`);
  return { id: i.orderId };
});

/* ─── Claims ─── */

export const sendClaim = act(z.object({ claimId: z.uuid() }), NEED, async (ctx, i) => {
  await ctx.tx.execute(sql`UPDATE public.pharmacy_supplier_claims SET state = 'sent', sent_at = ${ctx.now.toISOString()}::timestamptz, sent_by = ${ctx.actor.userId}::uuid
    WHERE id = ${i.claimId}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid AND state = 'draft'`);
  return { id: i.claimId };
});

export const creditClaim = act(
  z.object({ claimId: z.uuid(), creditNote: z.string().trim().min(1, S.credit).max(80) }),
  NEED,
  async (ctx, i) => {
    await ctx.tx.execute(sql`UPDATE public.pharmacy_supplier_claims SET state = 'credit', credit_note = ${i.creditNote}, credited_at = ${ctx.now.toISOString()}::timestamptz
      WHERE id = ${i.claimId}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid AND state = 'sent'`);
    return { id: i.claimId };
  },
);
