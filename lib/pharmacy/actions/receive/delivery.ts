import "server-only";

import type { Ctx } from "@/lib/pharmacy/actions/store/shared";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { RC } from "@/content/pharmacy-receive";
import { act, mustBeInCharge, NEED, one, VIEW } from "@/lib/pharmacy/actions/store/shared";
import { GtinInput, setGtin } from "@/lib/pharmacy/stores/location-store";
import { fail, loadLocation } from "@/lib/pharmacy/stores/write";

/** Starting a delivery and counting it (RECEIVE §B, §D). Counting saves as it goes; nothing here moves stock. */
const S = RC.says;
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const Head = z.object({
  id: z.uuid(),
  kind: z.enum(["supplier", "donation", "facility", "ward"]),
  supplierId: z.uuid().nullable(),
  fromText: opt(120),
  fromPlaceId: z.uuid().nullable(),
  orderId: z.uuid().nullable(),
  note: z.string().trim().min(1).max(60),
  placeId: z.uuid(),
  /** `YYYY-MM-DD HH:MM`, Kampala. */
  arrived: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, S.arrival),
  deliverer: opt(120),
  vehicle: opt(20),
  blind: z.boolean(),
});
export type StartInput = z.input<typeof Head>;

const arrivedAt = (s: string) => sql`(${s}::timestamp AT TIME ZONE 'Africa/Kampala')`;

async function duplicateOf(ctx: Ctx, i: z.infer<typeof Head>) {
  const found = await one<{ id: string }>(
    ctx,
    sql`SELECT id FROM public.pharmacy_deliveries
         WHERE hospital_id = ${ctx.actor.hospitalId}::uuid AND kind = ${i.kind} AND state <> 'abandoned' AND id <> ${i.id}::uuid
           AND lower(note_number) = lower(${i.note})
           AND coalesce(pharmacy_supplier_id::text, from_location_id::text, lower(from_text)) =
               ${i.supplierId ?? i.fromPlaceId ?? (i.fromText ?? "").toLowerCase()}`,
  );
  return found?.id ?? null;
}

async function checkArrival(ctx: Ctx, arrived: string) {
  const r = await one<{ later: boolean }>(
    ctx,
    sql`SELECT ${arrivedAt(arrived)} > ${ctx.now.toISOString()}::timestamptz AS later`,
  );
  if (r?.later) throw fail("invalid", S.future);
}

/** Creates the delivery with the order's unfinished lines waiting to be counted. Idempotent on the delivery id. */
export async function startCore(
  ctx: Ctx,
  i: z.infer<typeof Head>,
  seedOrder = true,
): Promise<{ id: string; duplicateOf?: string }> {
  const h = ctx.actor.hospitalId;
  if (
    await one(
      ctx,
      sql`SELECT 1 AS ok FROM public.pharmacy_deliveries WHERE id = ${i.id}::uuid AND hospital_id = ${h}::uuid`,
    )
  )
    return { id: i.id };
  const dup = await duplicateOf(ctx, i);
  if (dup) return { id: i.id, duplicateOf: dup };
  await checkArrival(ctx, i.arrived);
  await loadLocation(ctx.tx, h, i.placeId);
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_deliveries (id, hospital_id, location_id, kind, pharmacy_supplier_id, from_text, from_location_id,
      order_id, note_number, arrived_at, counted_by, deliverer_name, vehicle_registration, blind)
    VALUES (${i.id}::uuid, ${h}::uuid, ${i.placeId}::uuid, ${i.kind}, ${i.supplierId}::uuid, ${i.fromText}, ${i.fromPlaceId}::uuid,
      ${i.orderId}::uuid, ${i.note}, ${arrivedAt(i.arrived)}, ${ctx.actor.userId}::uuid, ${i.deliverer}, ${i.vehicle}, ${i.blind})`);
  if (i.orderId && seedOrder)
    await ctx.tx.execute(sql`
      INSERT INTO public.pharmacy_delivery_lines (id, delivery_id, line_no, product_id, order_line_id, identity_source, pack_contents, cost_per_pack)
      SELECT gen_random_uuid(), ${i.id}::uuid, row_number() OVER (ORDER BY l.id), l.product_id, l.id, 'order',
             coalesce(l.per_pack, p.packs[1], 1), l.price_per_pack
        FROM public.pharmacy_order_lines l JOIN public.pharmacy_products p ON p.id = l.product_id
       WHERE l.order_id = ${i.orderId}::uuid AND l.closed_at IS NULL
         AND coalesce(l.packs, ceil(coalesce(l.chosen_units, l.proposed_units, 0)::numeric / coalesce(l.per_pack, p.packs[1], 1))) > l.received_packs`);
  return { id: i.id };
}

export const startDelivery = act(Head, NEED, (ctx, i) => startCore(ctx, i));

export const editDelivery = act(Head, NEED, async (ctx, i) => {
  const dup = await duplicateOf(ctx, i);
  if (dup) return { id: i.id, duplicateOf: dup };
  await checkArrival(ctx, i.arrived);
  await ctx.tx.execute(sql`
    UPDATE public.pharmacy_deliveries SET pharmacy_supplier_id = ${i.supplierId}::uuid, from_text = ${i.fromText}, from_location_id = ${i.fromPlaceId}::uuid,
      note_number = ${i.note}, arrived_at = ${arrivedAt(i.arrived)}, deliverer_name = ${i.deliverer}, vehicle_registration = ${i.vehicle}, blind = ${i.blind}
     WHERE id = ${i.id}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid AND state = 'counting'`);
  return { id: i.id };
});

export const saveInvoice = act(
  z.object({
    deliveryId: z.uuid(),
    invoice: opt(60),
    total: z.number().nonnegative().max(1e13).nullable(),
  }),
  NEED,
  async (ctx, i) => {
    await ctx.tx.execute(sql`
      UPDATE public.pharmacy_deliveries SET invoice_no = ${i.invoice}, invoice_total = ${i.total}
       WHERE id = ${i.deliveryId}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid AND state = 'counting'`);
    return { id: i.deliveryId };
  },
);

/* ─── Lines ─── */

const whole = (max: number) =>
  z.string().transform((v) => {
    const n = Number(v);
    return v.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
  });
const amount = z.string().transform((v) => {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) && n >= 0 && n < 1e12 ? n : null;
});

export const LineDoc = z.object({
  id: z.uuid(),
  no: z.number().int().positive(),
  medId: z.uuid(),
  source: z.enum(["scan", "catalogue", "typed", "order"]),
  orderLineId: z.uuid().nullable(),
  batch: opt(60),
  exp: opt(20),
  packs: whole(1_000_000),
  per: whole(1_000_000).transform((n) => n || null),
  notePacks: whole(1_000_000),
  cost: amount,
  temp: z.string().transform((v) => {
    const n = Number(v);
    return v.trim() !== "" && Number.isFinite(n) && n >= -40 && n <= 60 ? n : null;
  }),
  decision: z.enum(["", "accept", "accept_tell", "reject"]).transform((v) => v || null),
  regReason: z
    .enum(["", "donation", "no_registered_alternative", "renewal_pending", "other"])
    .transform((v) => v || null),
  regNote: opt(300),
  rejOn: z.boolean(),
  rejPacks: whole(1_000_000),
  rejWhy: z
    .enum([
      "",
      "damaged",
      "wrong_product",
      "expired",
      "short_dated",
      "recall",
      "cold_chain",
      "other",
    ])
    .transform((v) => v || null),
  rejFate: z.enum(["driver", "quarantine"]),
  vvm: z.enum(["", "1", "2", "3", "4"]).transform((v) => (v ? Number(v) : null)),
  freeze: z.enum(["", "ok", "tripped"]).transform((v) => v || null),
  // Lines queued on a device before this field have none: nothing answered.
  seal: z
    .enum(["", "ok", "broken"])
    .default("")
    .transform((v) => v || null),
  kitTemp: z
    .enum(["", "ok", "hot"])
    .default("")
    .transform((v) => v || null),
});

const SaveLines = z.object({
  deliveryId: z.uuid(),
  lines: z.array(LineDoc).max(500),
  removed: z.array(z.uuid()).max(500),
});

async function counting(ctx: Ctx, deliveryId: string) {
  const d = await one<{ state: string; note_number: string }>(
    ctx,
    sql`SELECT state, note_number FROM public.pharmacy_deliveries WHERE id = ${deliveryId}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid FOR UPDATE`,
  );
  if (!d) throw fail("not_found", S.finished);
  if (d.state !== "counting") throw fail("conflict", S.finished);
  return d;
}

/** `addLines`, `updateLine` and `removeLine`: whole lines, idempotent on the line id, so a device can replay them. A changed batch or expiry loses its approval. */
export async function saveLinesCore(ctx: Ctx, i: z.infer<typeof SaveLines>) {
  await counting(ctx, i.deliveryId);
  if (i.removed.length)
    await ctx.tx.execute(
      sql`DELETE FROM public.pharmacy_delivery_lines WHERE delivery_id = ${i.deliveryId}::uuid AND id = ANY(${`{${i.removed.join(",")}}`}::uuid[])`,
    );
  if (i.lines.length) {
    await ctx.tx.execute(
      sql`UPDATE public.pharmacy_delivery_lines SET line_no = line_no + 100000 WHERE delivery_id = ${i.deliveryId}::uuid`,
    );
    for (const l of i.lines)
      await ctx.tx.execute(sql`
        INSERT INTO public.pharmacy_delivery_lines AS t (id, delivery_id, line_no, product_id, order_line_id, identity_source, batch_number, expiry_text,
          counted_packs, pack_contents, note_packs, cost_per_pack, temp_c, short_dated_decision, registration_reason, registration_note,
          rej_packs, reject_reason, rej_fate, vvm_stage, freeze_check, seal, kit_temp)
        VALUES (${l.id}::uuid, ${i.deliveryId}::uuid, ${l.no}, ${l.medId}::uuid, ${l.orderLineId}::uuid, ${l.source}, ${l.batch}, ${l.exp},
          ${l.packs}, ${l.per}, ${l.notePacks}, ${l.cost}, ${l.temp}, ${l.decision}, ${l.regReason}, ${l.regNote},
          ${l.rejOn ? l.rejPacks : null}, ${l.rejOn ? l.rejWhy : null}, ${l.rejOn ? l.rejFate : null}, ${l.vvm}, ${l.freeze}, ${l.seal}, ${l.kitTemp})
        ON CONFLICT (id) DO UPDATE SET line_no = EXCLUDED.line_no, identity_source = EXCLUDED.identity_source, order_line_id = EXCLUDED.order_line_id,
          batch_number = EXCLUDED.batch_number, expiry_text = EXCLUDED.expiry_text, counted_packs = EXCLUDED.counted_packs,
          pack_contents = EXCLUDED.pack_contents, note_packs = EXCLUDED.note_packs, cost_per_pack = EXCLUDED.cost_per_pack, temp_c = EXCLUDED.temp_c,
          short_dated_decision = EXCLUDED.short_dated_decision, registration_reason = EXCLUDED.registration_reason,
          registration_note = EXCLUDED.registration_note, rej_packs = EXCLUDED.rej_packs, reject_reason = EXCLUDED.reject_reason,
          rej_fate = EXCLUDED.rej_fate, vvm_stage = EXCLUDED.vvm_stage, freeze_check = EXCLUDED.freeze_check, seal = EXCLUDED.seal, kit_temp = EXCLUDED.kit_temp, updated_at = now(),
          approved_by = CASE WHEN t.batch_number IS DISTINCT FROM EXCLUDED.batch_number OR t.expiry_text IS DISTINCT FROM EXCLUDED.expiry_text
                             OR coalesce(EXCLUDED.short_dated_decision, '') NOT IN ('accept','accept_tell') THEN NULL ELSE t.approved_by END,
          approved_at = CASE WHEN t.batch_number IS DISTINCT FROM EXCLUDED.batch_number OR t.expiry_text IS DISTINCT FROM EXCLUDED.expiry_text
                             OR coalesce(EXCLUDED.short_dated_decision, '') NOT IN ('accept','accept_tell') THEN NULL ELSE t.approved_at END
        WHERE t.delivery_id = EXCLUDED.delivery_id`);
    await ctx.tx.execute(sql`UPDATE public.pharmacy_delivery_lines l SET line_no = 200000 + s.n
      FROM (SELECT id, row_number() OVER (ORDER BY line_no) AS n FROM public.pharmacy_delivery_lines WHERE delivery_id = ${i.deliveryId}::uuid AND line_no > 100000) s
      WHERE l.id = s.id AND l.delivery_id = ${i.deliveryId}::uuid AND l.line_no > 100000`);
    const top = await one<{ n: number }>(
      ctx,
      sql`SELECT coalesce(max(line_no) FILTER (WHERE line_no < 100000), 0)::int AS n FROM public.pharmacy_delivery_lines WHERE delivery_id = ${i.deliveryId}::uuid`,
    );
    await ctx.tx.execute(
      sql`UPDATE public.pharmacy_delivery_lines SET line_no = line_no - 200000 + ${top?.n ?? 0} WHERE delivery_id = ${i.deliveryId}::uuid AND line_no > 200000`,
    );
  }
  return { id: i.deliveryId };
}

export const saveLines = act(SaveLines, NEED, saveLinesCore);

/** A device's delivery: its head and the lines it made itself (order lines included), in one step. */
export const syncCounting = act(
  z.object({ head: Head, lines: z.array(LineDoc).max(500) }),
  NEED,
  async (ctx, i) => {
    const started = await startCore(ctx, i.head, false);
    if (started.duplicateOf) return started;
    await saveLinesCore(ctx, { deliveryId: i.head.id, lines: i.lines, removed: [] });
    return { id: i.head.id };
  },
);

/** A pack's serial, claimed once for the hospital. The same pack on the same line again is the same refusal. */
export const scanPack = act(
  z.object({
    deliveryId: z.uuid(),
    gtin: z.string().regex(/^\d{8,14}$/),
    serial: z.string().trim().min(1).max(40),
  }),
  NEED,
  async (ctx, i) => {
    const h = ctx.actor.hospitalId;
    await counting(ctx, i.deliveryId);
    const row = await one<{ gtin: string }>(
      ctx,
      sql`INSERT INTO public.pharmacy_pack_serials (hospital_id, gtin, serial, delivery_id) VALUES (${h}::uuid, ${i.gtin}, ${i.serial}, ${i.deliveryId}::uuid)
          ON CONFLICT DO NOTHING RETURNING gtin`,
    );
    if (row) return { id: i.deliveryId };
    const at = await one<{ note: string }>(
      ctx,
      sql`SELECT d.note_number AS note FROM public.pharmacy_pack_serials s JOIN public.pharmacy_deliveries d ON d.id = s.delivery_id
           WHERE s.hospital_id = ${h}::uuid AND s.gtin = ${i.gtin} AND s.serial = ${i.serial}`,
    );
    throw fail("conflict", S.serial(i.serial, at?.note ?? ""));
  },
);

/** An unknown barcode, linked by hand for this hospital. */
export const linkGtin = act(GtinInput, NEED, setGtin);

/** "Not stocked yet? Add it": a local line, reviewed in Set-up › Medicines. */
export const addLocalMedicine = act(
  z.object({
    id: z.uuid(),
    generic: z.string().trim().min(1, S.localBlank).max(100),
    strength: z.string().trim().min(1, S.localBlank).max(60),
    unit: z.string().trim().min(1).max(30),
  }),
  NEED,
  async (ctx, i) => {
    await ctx.tx.execute(sql`
      INSERT INTO public.pharmacy_products (id, hospital_id, medicine_id, item_kind, name, strength, issue_unit, created_by)
      VALUES (${i.id}::uuid, ${ctx.actor.hospitalId}::uuid, ${`cat_local_${i.id.replaceAll("-", "_")}`}, 'health_supply', ${`${i.generic} ${i.strength} ${i.unit}`}, ${i.strength}, ${i.unit}, ${ctx.actor.userId}::uuid)
      ON CONFLICT (id) DO NOTHING`);
    return { id: i.id };
  },
);

/** The request to the in-charge's device; their board shows it live. */
export const askApproval = act(
  z.object({ deliveryId: z.uuid(), lineId: z.uuid() }),
  NEED,
  async (ctx, i) => {
    await counting(ctx, i.deliveryId);
    await ctx.tx
      .execute(sql`UPDATE public.pharmacy_delivery_lines SET approval_asked_at = ${ctx.now.toISOString()}::timestamptz
    WHERE id = ${i.lineId}::uuid AND delivery_id = ${i.deliveryId}::uuid`);
    return { id: i.lineId };
  },
);

export const approveShortDated = act(
  z.object({ deliveryId: z.uuid(), lineId: z.uuid() }),
  VIEW,
  async (ctx, i) => {
    await mustBeInCharge(ctx);
    await counting(ctx, i.deliveryId);
    await ctx.tx
      .execute(sql`UPDATE public.pharmacy_delivery_lines SET approved_by = ${ctx.actor.userId}::uuid, approved_at = ${ctx.now.toISOString()}::timestamptz
    WHERE id = ${i.lineId}::uuid AND delivery_id = ${i.deliveryId}::uuid`);
    return { id: i.lineId };
  },
);

/** Nothing moved, so nothing to undo: stock and orders stay as they were. Its serials are free again. */
export const abandonDelivery = act(
  z.object({ deliveryId: z.uuid(), reason: z.string().trim().min(3, S.abandon).max(300) }),
  NEED,
  async (ctx, i) => {
    const h = ctx.actor.hospitalId;
    const d = await one<{ state: string }>(
      ctx,
      sql`SELECT state FROM public.pharmacy_deliveries WHERE id = ${i.deliveryId}::uuid AND hospital_id = ${h}::uuid FOR UPDATE`,
    );
    if (!d) throw fail("not_found", S.finished);
    if (d.state === "abandoned") return { id: i.deliveryId };
    if (d.state !== "counting") throw fail("conflict", S.finished);
    await ctx.tx.execute(
      sql`DELETE FROM public.pharmacy_pack_serials WHERE delivery_id = ${i.deliveryId}::uuid`,
    );
    await ctx.tx
      .execute(sql`UPDATE public.pharmacy_deliveries SET state = 'abandoned', abandon_reason = ${i.reason}, finished_by = ${ctx.actor.userId}::uuid,
      finished_at = ${ctx.now.toISOString()}::timestamptz WHERE id = ${i.deliveryId}::uuid`);
    return { id: i.deliveryId };
  },
);

export const addPhoto = act(
  z.object({
    id: z.uuid(),
    deliveryId: z.uuid(),
    kind: z.enum(["note", "invoice", "damage"]),
    file: z.string().min(3).max(300),
  }),
  NEED,
  async (ctx, i) => {
    const h = ctx.actor.hospitalId;
    if (!i.file.startsWith(`${h}/${i.deliveryId}/`)) throw fail("invalid", S.photo);
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_delivery_photos (id, hospital_id, delivery_id, kind, file, by_user)
      VALUES (${i.id}::uuid, ${h}::uuid, ${i.deliveryId}::uuid, ${i.kind}, ${i.file}, ${ctx.actor.userId}::uuid) ON CONFLICT (id) DO NOTHING`);
    return { id: i.id };
  },
);
