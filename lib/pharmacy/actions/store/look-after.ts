import "server-only";

import type { Ctx } from "./shared";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { STORE_SAYS as S } from "@/content/pharmacy-store";
import { fill } from "@/content/pharmacy-workspace-v2";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { countDiffValue, insideLimits, onShelf } from "@/lib/pharmacy/derive/store/counts";
import { bestPlace } from "@/lib/pharmacy/derive/store/expiry";
import { lastUnitCosts } from "@/lib/pharmacy/prices/store";
import { ruleNumbers } from "@/lib/pharmacy/rules/registry";
import {
  QuarantineInput,
  quarantineOf,
  moveToQuarantine as toQuarantine,
} from "@/lib/pharmacy/stores/expiry-store";
import { reasonList } from "@/lib/pharmacy/stores/packs";
import {
  balancesAt,
  batchRef,
  fail,
  loadLocation,
  move,
  movePair,
} from "@/lib/pharmacy/stores/write";
import {
  act,
  all,
  anyControlled,
  mustBeInCharge,
  NEED,
  nextVoucher,
  one,
  sendDispatch,
  storeOf,
  witnessOf,
  worldOf,
} from "./shared";

/** Look after the stock (STORE.md §F, §I): expiry, counts, stock-takes, quarantine, losses and room readings. */
const key = z.uuid();
const witness = z.uuid().nullish();

const signedNumbers = async (ctx: Ctx) =>
  ruleNumbers(
    rowsOf<{ rule_group: string; key: string; text: string; params: { n?: number } | null }>(
      await ctx.tx.execute(
        sql`SELECT rule_group, key, text, params FROM public.pharmacy_rules WHERE hospital_id = ${ctx.actor.hospitalId}::uuid`,
      ),
    ),
  );

const recordExpiry = (
  ctx: Ctx,
  a: {
    id: string;
    batchId: string;
    action: "move" | "first" | "return";
    qty: number;
    toId?: string | null;
    voucher?: string | null;
  },
) =>
  ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_expiry_actions (id, hospital_id, batch_id, action, qty, to_location_id, voucher, done_by, done_at)
    VALUES (${a.id}::uuid, ${ctx.actor.hospitalId}::uuid, ${a.batchId}::uuid, ${a.action}, ${a.qty}, ${a.toId ?? null}::uuid,
      ${a.voucher ?? null}, ${ctx.actor.userId}::uuid, ${ctx.now.toISOString()}::timestamptz)
    ON CONFLICT (id) DO NOTHING`);

/** Off the shelf and out, as a loss with its value: both ways out of quarantine, and the supplier return on expiry. */
async function writeOutOfQuarantine(
  ctx: Ctx,
  i: {
    decisionId: string;
    batchId: string;
    qty: number;
    decided: "destroy" | "return";
    witnessId: string | null;
    attestationId: string | null;
  },
) {
  const h = ctx.actor.hospitalId;
  const q = await quarantineOf(ctx);
  const b = await batchRef(ctx.tx, h, i.batchId, q.id);
  const cost = (await lastUnitCosts(ctx.tx, h)).get(b.productId) ?? 0;
  const value = Math.round(i.qty * cost);
  // Back to whoever delivered this batch, else the first supplier that takes returns.
  const counterparty =
    i.decided === "destroy"
      ? null
      : (
          await one<{ id: string }>(
            ctx,
            sql`SELECT c.id FROM public.pharmacy_counterparties c
                 WHERE c.hospital_id = ${h}::uuid AND c.kind = 'supplier' AND c.takes_returns AND c.retired_at IS NULL
                 ORDER BY EXISTS (SELECT 1 FROM public.pharmacy_deliveries d
                    JOIN public.pharmacy_stock_movements m ON m.source_id = d.id AND m.kind = 'received'
                    JOIN public.pharmacy_batches b ON b.id = m.batch_id
                   WHERE d.supplier_id = c.id AND b.product_id = ${b.productId}::uuid AND b.batch_number = ${b.batchNumber}) DESC, c.name
                 LIMIT 1`,
          )
        )?.id;
  if (i.decided === "return" && !counterparty) throw fail("config", S.noSupplier);
  const voucher = await nextVoucher(ctx, i.decided === "destroy" ? "ADJ" : "RTN");
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_quarantine_decisions (id, hospital_id, batch_id, decided, qty, value_ugx, voucher, witness_id, decided_by, decided_at)
    VALUES (${i.decisionId}::uuid, ${h}::uuid, ${i.batchId}::uuid, ${i.decided}, ${i.qty}, ${value}, ${voucher}, ${i.witnessId}::uuid,
      ${ctx.actor.userId}::uuid, ${ctx.now.toISOString()}::timestamptz)`);
  await move(ctx.tx, {
    hospitalId: h,
    location: q,
    batchId: i.batchId,
    kind: i.decided === "destroy" ? "written_off" : "returned_to_supplier",
    quantity: -i.qty,
    sourceKind: i.decided === "destroy" ? "write_off" : "supplier_return",
    sourceId: i.decisionId,
    actorUserId: ctx.actor.userId,
    effectiveAt: ctx.now,
    reasonCode: i.decided,
    counterpartyId: counterparty ?? null,
    witnessAttestationId: i.attestationId,
  });
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_store_losses (hospital_id, location_id, batch_id, qty, reason, value_ugx, voucher, witness_id, quarantine_decision_id, recorded_by, recorded_at)
    VALUES (${h}::uuid, ${q.id}::uuid, ${i.batchId}::uuid, ${i.qty}, ${i.decided === "destroy" ? "destroyed" : "returned"}, ${value}, ${voucher},
      ${i.witnessId}::uuid, ${i.decisionId}::uuid, ${ctx.actor.userId}::uuid, ${ctx.now.toISOString()}::timestamptz)`);
  return voucher;
}

/** §F2: move n to the place that uses it fastest, mark it first, or return n to the supplier. */
export const expiryAction = act(
  z.object({
    clientKey: key,
    batchId: z.uuid(),
    action: z.enum(["move", "first", "return"]),
    quantity: z.number().int().positive().max(1_000_000).optional(),
    witnessAttestationId: witness,
  }),
  NEED,
  async (ctx, i) => {
    const h = ctx.actor.hospitalId;
    const done = await one<{ voucher: string | null }>(
      ctx,
      sql`SELECT voucher FROM public.pharmacy_expiry_actions WHERE id = ${i.clientKey}::uuid`,
    );
    if (done) return { id: i.clientKey, voucher: done.voucher };
    const store = await storeOf(ctx);
    if (i.action === "first") {
      await recordExpiry(ctx, { id: i.clientKey, batchId: i.batchId, action: "first", qty: 0 });
      return { id: i.clientKey, voucher: null as string | null };
    }
    if (!i.quantity) throw fail("invalid", S.nothing);
    if (i.action === "move") {
      const w = await worldOf(ctx);
      const b = w.batches.find((x) => x.id === i.batchId);
      const to = b && bestPlace(w, b.medId);
      if (!to) throw fail("conflict", S.bestPlaceNone);
      const issueId = crypto.randomUUID();
      const d = await sendDispatch(ctx, {
        id: issueId,
        kind: "expiry_move",
        from: store,
        to: await loadLocation(ctx.tx, h, to),
        batches: [{ batchId: i.batchId, quantity: i.quantity }],
        attestationId: i.witnessAttestationId,
      });
      await recordExpiry(ctx, {
        id: i.clientKey,
        batchId: i.batchId,
        action: "move",
        qty: i.quantity,
        toId: to,
        voucher: d.voucher,
      });
      return { id: i.clientKey, voucher: d.voucher as string | null };
    }
    // Back to the supplier: only quarantine may hand it back (the guard), so through there in one go.
    const q = await quarantineOf(ctx);
    const controlled = await anyControlled(ctx, [i.batchId]);
    const witnessId = controlled ? await witnessOf(ctx, i.witnessAttestationId) : null;
    const attestationId = controlled ? i.witnessAttestationId! : null;
    const pair = await movePair(ctx.tx, {
      pair: "quarantine",
      hospitalId: h,
      from: store,
      to: q,
      batch: await batchRef(ctx.tx, h, i.batchId, store.id),
      quantity: i.quantity,
      sourceId: i.clientKey,
      actorUserId: ctx.actor.userId,
      effectiveAt: ctx.now,
      reasonCode: "short_dated",
      witnessAttestationId: attestationId,
    });
    const voucher = await writeOutOfQuarantine(ctx, {
      decisionId: crypto.randomUUID(),
      batchId: pair.toBatchId,
      qty: i.quantity,
      decided: "return",
      witnessId,
      attestationId,
    });
    await recordExpiry(ctx, {
      id: i.clientKey,
      batchId: i.batchId,
      action: "return",
      qty: i.quantity,
      voucher,
    });
    return { id: i.clientKey, voucher: voucher as string | null };
  },
);

/** Expired or recalled, off the shelf. The reason is from the signed list. */
export const moveToQuarantine = act(QuarantineInput, NEED, async (ctx, i) => {
  const list = await reasonList(ctx.tx, ctx.actor.hospitalId, "quarantine");
  if (list && !list.some((r) => r.code === i.reasonCode))
    throw fail("invalid", fill(S.noQuarantineReason, { code: i.reasonCode }));
  return toQuarantine(ctx, i);
});

/* ─── Counts ─── */

interface CountLine {
  batchId: string;
  expected: number;
  counted: number;
  cost: number;
  productId: string;
}

async function postCount(
  ctx: Ctx,
  countId: string,
  lines: readonly CountLine[],
  attestationId: string | null | undefined,
) {
  const store = await storeOf(ctx);
  const moved = lines.filter((l) => l.counted !== l.expected);
  const shortControlled = await anyControlled(
    ctx,
    moved.filter((l) => l.counted < l.expected).map((l) => l.batchId),
  );
  if (shortControlled) await witnessOf(ctx, attestationId);
  for (const l of moved)
    await move(ctx.tx, {
      hospitalId: ctx.actor.hospitalId,
      location: store,
      batchId: l.batchId,
      kind: "count_correction",
      quantity: l.counted - l.expected,
      sourceKind: "count",
      sourceId: countId,
      actorUserId: ctx.actor.userId,
      effectiveAt: ctx.now,
      reasonCode: "shelf_count",
      witnessAttestationId: shortControlled ? attestationId! : null,
    });
}

/**
 * Blind: expected is read here, at save, and only then shown. A difference over the sign-off value waits for the
 * in-charge; otherwise it posts now. (Opening a shelf to count writes nothing: `startCount` of the spec is the dialog.)
 */
export const saveCount = act(
  z.object({
    clientKey: key,
    shelfId: z.uuid(),
    lines: z
      .array(z.object({ batchId: z.uuid(), counted: z.number().int().min(0).max(10_000_000) }))
      .max(500),
    witnessAttestationId: witness,
  }),
  NEED,
  async (ctx, i) => {
    const h = ctx.actor.hospitalId;
    const done = await one<{ voucher: string }>(
      ctx,
      sql`SELECT voucher FROM public.pharmacy_shelf_counts WHERE id = ${i.clientKey}::uuid`,
    );
    if (done)
      return {
        id: i.clientKey,
        voucher: done.voucher,
        lines: [] as CountLine[],
        value: 0,
        needsSign: false,
        posted: false,
      };
    const store = await storeOf(ctx);
    const shelf = await one<{ code: string }>(
      ctx,
      sql`SELECT code FROM public.pharmacy_shelves WHERE id = ${i.shelfId}::uuid AND hospital_id = ${h}::uuid AND archived_at IS NULL`,
    );
    if (!shelf) throw fail("not_found", S.countAll);
    const balances = await balancesAt(ctx.tx, store.id);
    const here = await all<{ id: string; product_id: string; shelf: string | null }>(
      ctx,
      sql`SELECT b.id, b.product_id, (SELECT s.shelf FROM public.pharmacy_batch_shelves s WHERE s.batch_id = b.id
              ORDER BY s.created_at DESC, s.id DESC LIMIT 1) AS shelf
            FROM public.pharmacy_batches b WHERE b.location_id = ${store.id}::uuid`,
    );
    const onThis = here.filter((b) => onShelf(b.shelf, shelf.code));
    const typed = new Map(i.lines.map((l) => [l.batchId, l.counted]));
    if (onThis.some((b) => (balances.get(b.id) ?? 0) > 0 && !typed.has(b.id)))
      throw fail("invalid", S.countAll);
    const costs = await lastUnitCosts(ctx.tx, h);
    const lines: CountLine[] = onThis
      .filter((b) => typed.has(b.id))
      .map((b) => ({
        batchId: b.id,
        productId: b.product_id,
        expected: balances.get(b.id) ?? 0,
        counted: typed.get(b.id)!,
        cost: costs.get(b.product_id) ?? 0,
      }));
    const value = Math.round(countDiffValue(lines));
    const signOver = (await signedNumbers(ctx))("cold", "count_sign");
    const voucher = await nextVoucher(ctx, "CNT");
    const take = await one<{ id: string }>(
      ctx,
      sql`SELECT id FROM public.pharmacy_stocktakes WHERE location_id = ${store.id}::uuid AND closed_at IS NULL`,
    );
    await ctx.tx.execute(sql`
      INSERT INTO public.pharmacy_shelf_counts (id, hospital_id, shelf_id, stocktake_id, voucher, counted_by, counted_at, diff_value, sign_over)
      VALUES (${i.clientKey}::uuid, ${h}::uuid, ${i.shelfId}::uuid, ${take?.id ?? null}::uuid, ${voucher}, ${ctx.actor.userId}::uuid,
        ${ctx.now.toISOString()}::timestamptz, ${value}, ${signOver})`);
    for (const l of lines)
      await ctx.tx.execute(sql`
        INSERT INTO public.pharmacy_shelf_count_lines (count_id, batch_id, expected, counted, unit_cost)
        VALUES (${i.clientKey}::uuid, ${l.batchId}::uuid, ${l.expected}, ${l.counted}, ${l.cost})`);
    const needsSign = value > signOver;
    if (!needsSign) await postCount(ctx, i.clientKey, lines, i.witnessAttestationId);
    return { id: i.clientKey, voucher, lines, value, needsSign, posted: !needsSign };
  },
);

export const signOffCount = act(
  z.object({ countId: z.uuid(), witnessAttestationId: witness }),
  NEED,
  async (ctx, i) => {
    await mustBeInCharge(ctx);
    const c = await one<{ needs_sign: boolean; signed_at: string | null }>(
      ctx,
      sql`SELECT needs_sign, signed_at FROM public.pharmacy_shelf_counts WHERE id = ${i.countId}::uuid
           AND hospital_id = ${ctx.actor.hospitalId}::uuid FOR UPDATE`,
    );
    if (!c || !c.needs_sign) throw fail("conflict", S.noDiff);
    if (c.signed_at) return { id: i.countId };
    await ctx.tx.execute(sql`
      UPDATE public.pharmacy_shelf_counts SET signed_by = ${ctx.actor.userId}::uuid, signed_at = ${ctx.now.toISOString()}::timestamptz
       WHERE id = ${i.countId}::uuid`);
    const lines = (
      await all<{ batch_id: string; expected: number; counted: number; unit_cost: string }>(
        ctx,
        sql`SELECT batch_id, expected, counted, unit_cost FROM public.pharmacy_shelf_count_lines WHERE count_id = ${i.countId}::uuid`,
      )
    ).map((l) => ({
      batchId: l.batch_id,
      productId: "",
      expected: Number(l.expected),
      counted: Number(l.counted),
      cost: Number(l.unit_cost),
    }));
    await postCount(ctx, i.countId, lines, i.witnessAttestationId);
    return { id: i.countId };
  },
);

export const startStocktake = act(z.object({ clientKey: key }), NEED, async (ctx, i) => {
  const store = await storeOf(ctx);
  const open = await one<{ id: string }>(
    ctx,
    sql`SELECT id FROM public.pharmacy_stocktakes WHERE location_id = ${store.id}::uuid AND closed_at IS NULL`,
  );
  if (open) {
    if (open.id === i.clientKey) return { id: i.clientKey };
    throw fail("conflict", S.stocktakeOpen);
  }
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_stocktakes (id, hospital_id, location_id, started_by, started_at)
    VALUES (${i.clientKey}::uuid, ${ctx.actor.hospitalId}::uuid, ${store.id}::uuid, ${ctx.actor.userId}::uuid, ${ctx.now.toISOString()}::timestamptz)`);
  return { id: i.clientKey };
});

/** The guard refuses it until every shelf is counted and signed. Closing files the report (Records reads it). */
export const closeStocktake = act(z.object({ stocktakeId: z.uuid() }), NEED, async (ctx, i) => {
  await mustBeInCharge(ctx);
  const rows = await all<{
    code: string;
    name: string;
    voucher: string;
    diff_value: string;
    needs_sign: boolean;
    signed_by: string | null;
    counted_at: string;
  }>(
    ctx,
    sql`SELECT s.code, s.name, c.voucher, c.diff_value, c.needs_sign, c.signed_by, c.counted_at
          FROM public.pharmacy_shelf_counts c JOIN public.pharmacy_shelves s ON s.id = c.shelf_id
         WHERE c.stocktake_id = ${i.stocktakeId}::uuid ORDER BY s.code, c.counted_at`,
  );
  const report = JSON.stringify({
    shelves: rows.map((r) => ({
      code: r.code,
      name: r.name,
      voucher: r.voucher,
      diffValue: Number(r.diff_value),
      signed: r.needs_sign ? !!r.signed_by : null,
      countedAt: r.counted_at,
    })),
    totalDiff: rows.reduce((a, r) => a + Number(r.diff_value), 0),
  });
  await ctx.tx.execute(sql`
    UPDATE public.pharmacy_stocktakes SET closed_by = ${ctx.actor.userId}::uuid, closed_at = ${ctx.now.toISOString()}::timestamptz,
      report = ${report}::jsonb WHERE id = ${i.stocktakeId}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid`);
  return { id: i.stocktakeId };
});

/** A shelf the store counts by. The code decides which bins are on it. */
export const saveShelf = act(
  z.object({
    clientKey: key,
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{0,9}$/, S.shelfCode),
    name: z.string().trim().min(2).max(80),
    controlled: z.boolean(),
  }),
  NEED,
  async (ctx, i) => {
    const store = await storeOf(ctx);
    await ctx.tx.execute(sql`
      INSERT INTO public.pharmacy_shelves (id, hospital_id, location_id, code, name, controlled, created_by)
      VALUES (${i.clientKey}::uuid, ${ctx.actor.hospitalId}::uuid, ${store.id}::uuid, ${i.code}, ${i.name}, ${i.controlled}, ${ctx.actor.userId}::uuid)
      ON CONFLICT (id) DO NOTHING`);
    return { id: i.clientKey };
  },
);

/* ─── Quarantine and losses ─── */

export const quarantineDecide = act(
  z.object({
    clientKey: key,
    batchId: z.uuid(),
    decided: z.enum(["destroy", "return"]),
    witnessAttestationId: witness,
  }),
  NEED,
  async (ctx, i) => {
    const q = await quarantineOf(ctx);
    const seen = await one<{ voucher: string }>(
      ctx,
      sql`SELECT voucher FROM public.pharmacy_quarantine_decisions WHERE id = ${i.clientKey}::uuid`,
    );
    if (seen) return { id: i.clientKey, voucher: seen.voucher };
    const qty = (await balancesAt(ctx.tx, q.id)).get(i.batchId) ?? 0;
    if (qty <= 0) throw fail("conflict", S.quarantineEmpty);
    const controlled = await anyControlled(ctx, [i.batchId]);
    const needs = i.decided === "destroy" || controlled;
    const witnessId = needs
      ? await witnessOf(
          ctx,
          i.witnessAttestationId,
          i.decided === "destroy" ? S.destroyWitness : S.chooseWitness,
        )
      : null;
    const voucher = await writeOutOfQuarantine(ctx, {
      decisionId: i.clientKey,
      batchId: i.batchId,
      qty,
      decided: i.decided,
      witnessId,
      attestationId: controlled && needs ? i.witnessAttestationId! : null,
    });
    return { id: i.clientKey, voucher };
  },
);

export const recordLoss = act(
  z.object({
    clientKey: key,
    batchId: z.uuid({ message: S.chooseMedBatch }),
    quantity: z.number().int().positive().max(1_000_000),
    reason: z.enum(["damaged", "broken", "spoilt", "missing", "other"]),
    note: z.string({ message: S.sayWhat }).trim().min(2, S.sayWhat).max(300),
    witnessAttestationId: witness,
  }),
  NEED,
  async (ctx, i) => {
    const h = ctx.actor.hospitalId;
    const seen = await one<{ voucher: string }>(
      ctx,
      sql`SELECT voucher FROM public.pharmacy_store_losses WHERE id = ${i.clientKey}::uuid`,
    );
    if (seen) return { id: i.clientKey, voucher: seen.voucher, caseId: null as string | null };
    const store = await storeOf(ctx);
    const batch = await batchRef(ctx.tx, h, i.batchId, store.id);
    const held = (await balancesAt(ctx.tx, store.id)).get(i.batchId) ?? 0;
    if (i.quantity > held) throw fail("conflict", fill(S.onlyNBatch, { n: held }));
    const controlled = await anyControlled(ctx, [i.batchId]);
    const witnessId = controlled ? await witnessOf(ctx, i.witnessAttestationId) : null;
    const voucher = await nextVoucher(ctx, "ADJ");
    await move(ctx.tx, {
      hospitalId: h,
      location: store,
      batchId: i.batchId,
      kind: "adjusted",
      quantity: -i.quantity,
      sourceKind: "adjustment",
      sourceId: i.clientKey,
      actorUserId: ctx.actor.userId,
      effectiveAt: ctx.now,
      reasonCode: i.reason,
      reasonNote: i.note,
      witnessAttestationId: controlled ? i.witnessAttestationId! : null,
    });
    const value = Math.round(
      i.quantity * ((await lastUnitCosts(ctx.tx, h)).get(batch.productId) ?? 0),
    );
    const c =
      controlled || i.reason === "missing"
        ? await one<{ id: string }>(
            ctx,
            sql`SELECT private.pharmacy_open_case(${h}::uuid, 'loss', ${i.clientKey}::uuid, ${batch.medicineId}, ${store.id}::uuid,
                  ${-i.quantity}, 'high', ${ctx.actor.userId}::uuid, ${ctx.now.toISOString()}::timestamptz) AS id`,
          )
        : null;
    await ctx.tx.execute(sql`
      INSERT INTO public.pharmacy_store_losses (id, hospital_id, location_id, batch_id, qty, reason, note, value_ugx, voucher, witness_id, case_id, recorded_by, recorded_at)
      VALUES (${i.clientKey}::uuid, ${h}::uuid, ${store.id}::uuid, ${i.batchId}::uuid, ${i.quantity}, ${i.reason}, ${i.note}, ${value}, ${voucher},
        ${witnessId}::uuid, ${c?.id ?? null}::uuid, ${ctx.actor.userId}::uuid, ${ctx.now.toISOString()}::timestamptz)`);
    return { id: i.clientKey, voucher, caseId: c?.id ?? null };
  },
);

/** Morning and afternoon. Outside the limits, the in-charge sees it in the section's own list. */
export const recordRoomReading = act(
  z.object({
    clientKey: key,
    temp: z.number().min(-10).max(60),
    humidity: z.number().int().min(0).max(100),
  }),
  NEED,
  async (ctx, i) => {
    const store = await storeOf(ctx);
    const n = await signedNumbers(ctx);
    await ctx.tx.execute(sql`
      INSERT INTO public.pharmacy_store_room_readings (id, hospital_id, location_id, read_at, temp_c, humidity, recorded_by)
      VALUES (${i.clientKey}::uuid, ${ctx.actor.hospitalId}::uuid, ${store.id}::uuid, ${ctx.now.toISOString()}::timestamptz, ${i.temp}, ${i.humidity}, ${ctx.actor.userId}::uuid)
      ON CONFLICT (id) DO NOTHING`);
    return {
      id: i.clientKey,
      inside: insideLimits(i.temp, i.humidity, {
        roomTemp: n("cold", "room_temp"),
        humidity: n("cold", "humidity"),
      } as never),
      tooWarm: i.temp >= n("cold", "room_temp"),
      tooDamp: i.humidity >= n("cold", "humidity"),
    };
  },
);
