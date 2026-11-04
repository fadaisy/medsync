import "server-only";

import type { Ctx } from "@/lib/pharmacy/actions/store/shared";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { RC } from "@/content/pharmacy-receive";
import { act, NEED, one } from "@/lib/pharmacy/actions/store/shared";
import { claimLines, deliveryProblems, normExp } from "@/lib/pharmacy/derive/receive";
import { loadLines, loadMeds, loadOrders, loadRecalls, loadRules } from "@/lib/pharmacy/receive/read";
import { quarantineFor } from "@/lib/pharmacy/stores/location-store";
import { batchAtLocation, fail, loadLocation, move, requireAttestation, requireLive } from "@/lib/pharmacy/stores/write";

const S = RC.says;
const num = (s: string) => Number(s) || 0;

const FinishInput = z.object({
  deliveryId: z.uuid(),
  witnesses: z.array(z.object({ lineId: z.uuid(), attestationId: z.uuid() })).max(500),
  secondAttestationId: z.uuid().nullable(),
});

/** `2028-06` is stored as the month's last day, month-only; `2028-06-30` as itself. */
const expiryColumns = (norm: string) => {
  const [y, m, d] = norm.split("-").map(Number);
  if (d) return { expiry: norm, monthOnly: false };
  return { expiry: new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10), monthOnly: true };
};

/**
 * `applyCommit` (RECEIVE §D4): one transaction, idempotent on the delivery id. The GRN, the ledger, put-away rows,
 * quarantine, the order, witnesses, the second checker and the claim all land together, or none does. Lines are checked
 * again here with the same engine the device ran, and the database guards check them a third time.
 */
export const finishDelivery = act(FinishInput, NEED, async (ctx: Ctx, i) => {
  const h = ctx.actor.hospitalId;
  const me = ctx.actor.userId;
  const head = await one<{
    state: string;
    location_id: string;
    order_id: string | null;
    kind: "supplier" | "donation" | "facility" | "ward";
    pharmacy_supplier_id: string | null;
    grn: string | null;
    note_number: string;
  }>(
    ctx,
    sql`SELECT state, location_id, order_id, kind, pharmacy_supplier_id, grn, note_number FROM public.pharmacy_deliveries
         WHERE id = ${i.deliveryId}::uuid AND hospital_id = ${h}::uuid FOR UPDATE`,
  );
  if (!head) throw fail("not_found", S.finished);
  if (head.state === "received") {
    const c = await one<{ ref: string; total: string }>(ctx, sql`SELECT ref, total FROM public.pharmacy_supplier_claims WHERE delivery_id = ${i.deliveryId}::uuid`);
    return { id: i.deliveryId, grn: head.grn ?? "", claim: c ? { ref: c.ref, total: Number(c.total) } : null, replay: true };
  }
  if (head.state !== "counting") throw fail("conflict", S.finished);
  const place = await loadLocation(ctx.tx, h, head.location_id);
  requireLive(place);

  const [rules, meds, recalls] = await Promise.all([loadRules(ctx.tx, h), loadMeds(ctx.tx, h), loadRecalls(ctx.tx, h)]);
  const orders = head.order_id ? await loadOrders(ctx.tx, h, place.id, meds, [head.order_id]) : [];
  const today = (await one<{ d: string }>(ctx, sql`SELECT to_char(${ctx.now.toISOString()}::timestamptz AT TIME ZONE 'Africa/Kampala', 'YYYY-MM-DD') AS d`))!.d;
  const world = { meds, orders, recalls, rules, today };
  const lines = (await loadLines(ctx.tx, [i.deliveryId])).get(i.deliveryId) ?? [];
  const doc = {
    id: i.deliveryId,
    kind: head.kind,
    orderId: head.order_id,
    state: "counting",
    lines,
    invoiceTotal: "",
  } as never;
  const { problems, counted, value, blocked } = deliveryProblems(doc, world);
  if (problems[0]) throw fail("conflict", problems[0].text);
  if (blocked) throw fail("invalid", RC.problem.packs(1));

  // Witnesses and the second check are real people confirming now, so each is checked as the receiver is not them.
  const witnessOf = new Map(i.witnesses.map((w) => [w.lineId, w.attestationId]));
  const witness = new Map<string, { id: string; by: string }>();
  for (const { l, i: info } of counted) {
    if (!info.m.controlled || info.acc <= 0) continue;
    const id = witnessOf.get(l.id);
    if (!id) throw fail("conflict", S.witness);
    const by = await requireAttestation(ctx.tx, { id, hospitalId: h, actorUserId: me, now: ctx.now });
    if (by === me) throw fail("conflict", S.witness);
    witness.set(l.id, { id, by });
  }
  let second: string | null = null;
  if (value > rules.secondCheck) {
    if (!i.secondAttestationId) throw fail("conflict", S.second);
    second = await requireAttestation(ctx.tx, { id: i.secondAttestationId, hospitalId: h, actorUserId: me, now: ctx.now });
    if (second === me) throw fail("conflict", S.sameChecker);
  }

  const kept = counted.some((x) => x.i.rej > 0 && x.i.fate === "quarantine");
  const quarantine = kept ? await quarantineFor(ctx.tx, h, place) : null;
  if (kept && !quarantine) throw fail("config", S.noQuarantine);
  const grn = (await one<{ v: string }>(ctx, sql`SELECT private.pharmacy_next_voucher(${h}::uuid, 'GRN') AS v`))!.v;
  const isStore = place.kind === "store";

  await ctx.tx.execute(sql`DELETE FROM public.pharmacy_delivery_lines WHERE delivery_id = ${i.deliveryId}::uuid AND coalesce(counted_packs, 0) = 0`);
  for (const { l, i: info } of counted) {
    const norm = normExp(l.exp);
    const when = norm ? expiryColumns(norm) : null;
    const cost = l.cost === "" ? null : num(l.cost);
    const unitCost = cost === null ? null : (cost / info.per).toFixed(2);
    await ctx.tx.execute(sql`
      UPDATE public.pharmacy_delivery_lines SET
        accepted_quantity = ${info.accUnits},
        rejected_kept_quantity = ${info.fate === "quarantine" ? info.rejUnits : 0},
        rejected_returned_quantity = ${info.fate === "quarantine" ? 0 : info.rejUnits},
        reject_reason = ${info.rej > 0 ? info.why : null},
        rej_packs = ${info.rej > 0 ? info.rej : null}, rej_fate = ${info.rej > 0 ? info.fate : null},
        expiry = ${when?.expiry ?? null}::date, expiry_month_only = ${when?.monthOnly ?? false},
        unit_cost = ${unitCost}, note_quantity = ${l.notePacks === "" ? null : num(l.notePacks) * info.per},
        witness_id = ${witness.get(l.id)?.by ?? null}::uuid, owed_frozen = ${info.owed}
      WHERE id = ${l.id}::uuid`);
    const w = witness.get(l.id)?.id ?? null;
    if (info.accUnits > 0 && when) {
      const batchId = await batchAtLocation(ctx.tx, {
        hospitalId: h,
        location: place,
        productId: l.medId,
        batchNumber: l.batch.trim(),
        expiry: when.expiry,
        monthOnly: when.monthOnly,
        actorUserId: me,
      });
      await move(ctx.tx, {
        hospitalId: h,
        location: place,
        batchId,
        kind: "received",
        quantity: info.accUnits,
        sourceKind: "delivery",
        sourceId: i.deliveryId,
        unitCost,
        actorUserId: me,
        effectiveAt: ctx.now,
        witnessAttestationId: w,
      });
      if (isStore)
        await ctx.tx.execute(sql`
          INSERT INTO public.pharmacy_delivery_put_away (hospital_id, delivery_line_id, batch_id, shelf, qty)
          VALUES (${h}::uuid, ${l.id}::uuid, ${batchId}::uuid, ${info.m.shelf || null}, ${info.accUnits})`);
    }
    if (info.rej > 0 && info.fate === "quarantine" && when && quarantine) {
      const batchId = await batchAtLocation(ctx.tx, {
        hospitalId: h,
        location: quarantine,
        productId: l.medId,
        batchNumber: l.batch.trim(),
        expiry: when.expiry,
        monthOnly: when.monthOnly,
        actorUserId: me,
      });
      await move(ctx.tx, {
        hospitalId: h,
        location: quarantine,
        batchId,
        kind: "received",
        quantity: info.rejUnits,
        sourceKind: "delivery",
        sourceId: i.deliveryId,
        unitCost,
        reasonCode: info.why || null,
        actorUserId: me,
        effectiveAt: ctx.now,
      });
    }
    if (l.orderLineId && info.ol)
      await ctx.tx.execute(sql`
        UPDATE public.pharmacy_order_lines SET packs = ${info.ol.packs}, received_packs = received_packs + ${info.acc} WHERE id = ${l.orderLineId}::uuid`);
  }
  if (head.order_id) {
    const open = await one<{ n: number }>(
      ctx,
      sql`SELECT count(*)::int AS n FROM public.pharmacy_order_lines WHERE order_id = ${head.order_id}::uuid AND closed_at IS NULL
           AND coalesce(packs, 1) > received_packs`,
    );
    if (!open?.n)
      await ctx.tx.execute(sql`UPDATE public.pharmacy_orders SET state = 'closed', closed_at = ${ctx.now.toISOString()}::timestamptz
        WHERE id = ${head.order_id}::uuid AND state = 'open'`);
  }

  let claim: { ref: string; total: number } | null = null;
  const claimed = head.kind === "supplier" && head.pharmacy_supplier_id ? claimLines(counted) : [];
  if (claimed.length) {
    const ref = (await one<{ v: string }>(ctx, sql`SELECT private.pharmacy_next_voucher(${h}::uuid, 'CLM') AS v`))!.v;
    const total = claimed.reduce((a, x) => a + x.value, 0);
    const made = await one<{ id: string }>(
      ctx,
      sql`INSERT INTO public.pharmacy_supplier_claims (hospital_id, ref, delivery_id, pharmacy_supplier_id, total, created_by)
          VALUES (${h}::uuid, ${ref}, ${i.deliveryId}::uuid, ${head.pharmacy_supplier_id}::uuid, ${total}, ${me}::uuid) RETURNING id`,
    );
    for (const x of claimed)
      await ctx.tx.execute(sql`INSERT INTO public.pharmacy_claim_lines (claim_id, product_id, kind, packs, value)
        VALUES (${made!.id}::uuid, ${x.medId}::uuid, ${x.kind}, ${x.packs}, ${x.value})`);
    claim = { ref, total };
  }

  await ctx.tx.execute(sql`
    UPDATE public.pharmacy_deliveries SET state = 'received', grn = ${grn}, finished_by = ${me}::uuid,
      finished_at = ${ctx.now.toISOString()}::timestamptz, second_checker_id = ${second}::uuid
     WHERE id = ${i.deliveryId}::uuid`);
  return { id: i.deliveryId, grn, claim, replay: false };
});
