import "server-only";

import type { Ctx } from "./shared";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { STORE_SAYS as S } from "@/content/pharmacy-store";
import { fill } from "@/content/pharmacy-workspace-v2";
import {
  pharmacyIssues,
  pharmacyRequisitionLines,
  pharmacyRequisitions,
} from "@/db/schema/pharmacy-stores";
import { isInCharge } from "@/lib/pharmacy/cd/store";
import { dayOf, kampala } from "@/lib/pharmacy/derive/store/format";
import { placeBalance, runLines } from "@/lib/pharmacy/derive/store/places";
import { medOf } from "@/lib/pharmacy/derive/store/stock";
import { confirmIssue, lockedRequisition } from "@/lib/pharmacy/stores/issue-store";
import {
  batchRef,
  fail,
  hasLocationRight,
  loadLocation,
  movePair,
} from "@/lib/pharmacy/stores/write";
import {
  act,
  all,
  mustBeInCharge,
  NEED,
  nextVoucher,
  one,
  replayVoucher,
  sendDispatch,
  storeOf,
  VIEW,
  worldOf,
} from "./shared";

/** Send out and the places (STORE.md §C, §D, §I): every dispatch leaves through `sendDispatch`. */
const key = z.uuid();
const qty = z.number().int().positive().max(1_000_000);
const witness = z.uuid().nullish();

/** What has left the store against a requisition, by product: the ledger, never a stored count. */
const issuedSoFar = async (ctx: Ctx, requisitionId: string) =>
  new Map(
    (
      await all<{ product_id: string; n: number }>(
        ctx,
        sql`SELECT b.product_id, (-sum(m.quantity))::int AS n
              FROM public.pharmacy_issues i
              JOIN public.pharmacy_stock_movements m ON m.source_id = i.id AND m.kind = 'issued'
               AND m.location_id = i.from_location_id
              JOIN public.pharmacy_batches b ON b.id = m.batch_id
             WHERE i.requisition_id = ${requisitionId}::uuid GROUP BY 1`,
      )
    ).map((r) => [r.product_id, Number(r.n)]),
  );

export const issueRequisition = act(
  z.object({
    clientKey: key,
    requisitionId: z.uuid(),
    lines: z
      .array(z.object({ productId: z.uuid(), quantity: qty }))
      .min(1)
      .max(100),
    witnessAttestationId: witness,
  }),
  NEED,
  async (ctx, i) => {
    const prior = await replayVoucher(ctx, i.clientKey);
    if (prior) return { id: i.clientKey, voucher: prior, state: "replayed" };
    const h = ctx.actor.hospitalId;
    const r = await lockedRequisition(ctx.tx, h, i.requisitionId);
    if (r.state !== "raised" && r.state !== "part_issued") throw fail("conflict", S.reqDone);
    const lines = await ctx.tx
      .select()
      .from(pharmacyRequisitionLines)
      .where(sql`${pharmacyRequisitionLines.requisitionId} = ${r.id}::uuid`);
    const before = await issuedSoFar(ctx, r.id);
    for (const l of i.lines) {
      const line = lines.find((x) => x.productId === l.productId);
      const owed = line ? line.quantityAsked - (before.get(l.productId) ?? 0) : 0;
      if (l.quantity > owed) throw fail("conflict", fill(S.overOwed, { n: Math.max(0, owed) }));
    }
    const d = await sendDispatch(ctx, {
      id: i.clientKey,
      kind: "requisition",
      from: await loadLocation(ctx.tx, h, r.issuingLocationId),
      to: await loadLocation(ctx.tx, h, r.requestingLocationId),
      requisitionId: r.id,
      lines: i.lines,
      attestationId: i.witnessAttestationId,
    });
    let full = true;
    for (const line of lines) {
      const total =
        (before.get(line.productId) ?? 0) +
        (i.lines.find((l) => l.productId === line.productId)?.quantity ?? 0);
      if (total < line.quantityAsked) full = false;
      else if (line.quantityIssued === null)
        await ctx.tx
          .update(pharmacyRequisitionLines)
          .set({ quantityIssued: total })
          .where(sql`${pharmacyRequisitionLines.id} = ${line.id}::uuid`);
    }
    const state = full ? "issued" : "part_issued";
    await ctx.tx
      .update(pharmacyRequisitions)
      .set({ state })
      .where(sql`${pharmacyRequisitions.id} = ${r.id}::uuid`);
    return { id: d.id, voucher: d.voucher, state };
  },
);

export const sendUrgent = act(
  z.object({
    clientKey: key,
    placeId: z.uuid(),
    productId: z.uuid(),
    quantity: qty,
    witnessAttestationId: witness,
  }),
  NEED,
  async (ctx, i) => {
    const prior = await replayVoucher(ctx, i.clientKey);
    if (prior) return { id: i.clientKey, voucher: prior };
    const d = await sendDispatch(ctx, {
      id: i.clientKey,
      kind: "urgent",
      from: await storeOf(ctx),
      to: await loadLocation(ctx.tx, ctx.actor.hospitalId, i.placeId),
      lines: [{ productId: i.productId, quantity: i.quantity }],
      attestationId: i.witnessAttestationId,
    });
    return { id: d.id, voucher: d.voucher };
  },
);

/** Top-up level − on hand − on the way, limited by the store: computed here, never taken from the client. */
export const sendTopUpRun = act(
  z.object({ clientKey: key, runId: z.uuid(), witnessAttestationId: witness }),
  NEED,
  async (ctx, i) => {
    const prior = await replayVoucher(ctx, i.clientKey);
    if (prior) return { id: i.clientKey, voucher: prior, short: [] as string[] };
    const h = ctx.actor.hospitalId;
    const run = await one<{ location_id: string }>(
      ctx,
      sql`SELECT location_id FROM public.pharmacy_topup_runs WHERE id = ${i.runId}::uuid AND hospital_id = ${h}::uuid
           AND ended_at IS NULL`,
    );
    if (!run) throw fail("not_found", S.runMissing);
    const today = dayOf(ctx.now.toISOString());
    const sent = await one<{ voucher: string }>(
      ctx,
      sql`SELECT i.voucher FROM public.pharmacy_topup_run_log l JOIN public.pharmacy_issues i ON i.id = l.issue_id
           WHERE l.run_id = ${i.runId}::uuid AND l.on_date = ${today}::date`,
    );
    if (sent) throw fail("conflict", fill(S.runSent, { voucher: sent.voucher }));
    const w = await worldOf(ctx);
    const lines = runLines(w, run.location_id);
    const d = await sendDispatch(ctx, {
      id: i.clientKey,
      kind: "topup",
      from: await storeOf(ctx),
      to: await loadLocation(ctx.tx, h, run.location_id),
      lines: lines.filter((l) => l.give > 0).map((l) => ({ productId: l.medId, quantity: l.give })),
      attestationId: i.witnessAttestationId,
    });
    await ctx.tx.execute(sql`
      INSERT INTO public.pharmacy_topup_run_log (hospital_id, run_id, on_date, issue_id)
      VALUES (${h}::uuid, ${i.runId}::uuid, ${today}::date, ${d.id}::uuid)`);
    return {
      id: d.id,
      voucher: d.voucher,
      short: lines.filter((l) => l.give < l.need).map((l) => medOf(w, l.medId).short),
    };
  },
);

/** The schedule of one place's run. Replaces what was there. */
export const saveTopUpRun = act(
  z.object({
    clientKey: key,
    placeId: z.uuid(),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    at: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  NEED,
  async (ctx, i) => {
    const h = ctx.actor.hospitalId;
    await ctx.tx.execute(sql`
      UPDATE public.pharmacy_topup_runs SET ended_at = ${ctx.now.toISOString()}::timestamptz
       WHERE hospital_id = ${h}::uuid AND location_id = ${i.placeId}::uuid AND ended_at IS NULL AND id <> ${i.clientKey}::uuid`);
    await ctx.tx.execute(sql`
      INSERT INTO public.pharmacy_topup_runs (id, hospital_id, location_id, weekdays, at, created_by)
      VALUES (${i.clientKey}::uuid, ${h}::uuid, ${i.placeId}::uuid, ${`{${i.weekdays.join(",")}}`}::smallint[],
        ${i.at}::time, ${ctx.actor.userId}::uuid)
      ON CONFLICT (id) DO NOTHING`);
    return { id: i.clientKey };
  },
);

/** From a place with spare to a place in need, on a TRF. It reaches the other place when that place confirms it. */
export const arrangeTransfer = act(
  z.object({
    clientKey: key,
    fromId: z.uuid(),
    toId: z.uuid(),
    productId: z.uuid(),
    quantity: qty,
    witnessAttestationId: witness,
  }),
  NEED,
  async (ctx, i) => {
    const prior = await replayVoucher(ctx, i.clientKey);
    if (prior) return { id: i.clientKey, voucher: prior };
    const h = ctx.actor.hospitalId;
    const d = await sendDispatch(ctx, {
      id: i.clientKey,
      kind: "transfer",
      prefix: "TRF",
      from: await loadLocation(ctx.tx, h, i.fromId),
      to: await loadLocation(ctx.tx, h, i.toId),
      lines: [{ productId: i.productId, quantity: i.quantity }],
      attestationId: i.witnessAttestationId,
    });
    return { id: d.id, voucher: d.voucher };
  },
);

/** For an emergency: an RIV, a dispatch on the way and an issued requisition, linked by one id. */
export const issueWithoutRequisition = act(
  z.object({
    clientKey: key,
    placeId: z.uuid(),
    why: z.string().trim().min(2).max(200),
    productId: z.uuid(),
    quantity: qty,
    witnessAttestationId: witness,
  }),
  NEED,
  async (ctx, i) => {
    const prior = await replayVoucher(ctx, i.clientKey);
    if (prior) return { id: i.clientKey, voucher: prior };
    const h = ctx.actor.hospitalId;
    const store = await storeOf(ctx);
    await ctx.tx.insert(pharmacyRequisitions).values({
      id: i.clientKey,
      hospitalId: h,
      requestingLocationId: i.placeId,
      issuingLocationId: store.id,
      raisedBy: ctx.actor.userId,
      raisedAt: ctx.now,
      state: "issued",
      urgent: true,
      reason: i.why,
    });
    await ctx.tx.insert(pharmacyRequisitionLines).values({
      requisitionId: i.clientKey,
      productId: i.productId,
      quantityAsked: i.quantity,
      quantityIssued: i.quantity,
    });
    const d = await sendDispatch(ctx, {
      id: i.clientKey,
      kind: "no_requisition",
      from: store,
      to: await loadLocation(ctx.tx, h, i.placeId),
      requisitionId: i.clientKey,
      lines: [{ productId: i.productId, quantity: i.quantity }],
      attestationId: i.witnessAttestationId,
    });
    return { id: d.id, voucher: d.voucher };
  },
);

/**
 * "Confirm (as <place>)". The person who sent it does not confirm it: only someone at that place (their acting point,
 * today's roster, or a hub right at the ward), or the in-charge.
 */
export const confirmDispatch = act(
  z.object({ issueId: z.uuid(), note: z.string().trim().max(300).nullish() }),
  VIEW,
  async (ctx, i) => {
    const h = ctx.actor.hospitalId;
    const [issue] = await ctx.tx
      .select({ to: pharmacyIssues.toLocationId })
      .from(pharmacyIssues)
      .where(
        sql`${pharmacyIssues.id} = ${i.issueId}::uuid AND ${pharmacyIssues.hospitalId} = ${h}::uuid`,
      );
    if (!issue) throw fail("not_found", S.nothing);
    const place = await loadLocation(ctx.tx, h, issue.to);
    const today = kampala(ctx.now.toISOString()).slice(0, 10);
    const allowed =
      ctx.actor.pointId === place.id ||
      (await isInCharge(ctx.tx, ctx.actor.userId, h)) ||
      (await hasLocationRight(ctx.tx, ctx.actor.userId, place.id, "ward_confirm")) ||
      !!(await one(
        ctx,
        sql`SELECT 1 AS ok FROM public.pharmacy_duty_roster WHERE hospital_id = ${h}::uuid AND user_id = ${ctx.actor.userId}::uuid
             AND location_id = ${place.id}::uuid AND ended_at IS NULL AND ${today}::date BETWEEN date_from AND date_to LIMIT 1`,
      ));
    if (!allowed) throw fail("forbidden", fill(S.placeOnly, { place: place.name }));
    const { id } = await confirmIssue(ctx.tx, {
      hospitalId: h,
      issueId: i.issueId,
      receivingLocationId: place.id,
      confirmedByUserId: ctx.actor.userId,
      lines: [],
      reason: i.note || null,
      now: ctx.now,
    });
    return { id };
  },
);

/** "Accept into the store": an RTS, back on the medicine's bin, off the place. */
export const acceptReturn = act(z.object({ returnId: z.uuid() }), NEED, async (ctx, i) => {
  const h = ctx.actor.hospitalId;
  const r = await one<{
    id: string;
    location_id: string;
    batch_id: string;
    qty: number;
    reason: string;
    accepted_at: string | null;
  }>(
    ctx,
    sql`SELECT id, location_id, batch_id, qty, reason, accepted_at FROM public.pharmacy_store_returns
         WHERE id = ${i.returnId}::uuid AND hospital_id = ${h}::uuid FOR UPDATE`,
  );
  if (!r) throw fail("not_found", S.returnGone);
  if (r.accepted_at) throw fail("conflict", S.returnGone);
  const store = await storeOf(ctx);
  const from = await loadLocation(ctx.tx, h, r.location_id);
  const voucher = await nextVoucher(ctx, "RTS");
  const issueId = crypto.randomUUID();
  await ctx.tx.insert(pharmacyIssues).values({
    id: issueId,
    hospitalId: h,
    kind: "return",
    fromLocationId: from.id,
    toLocationId: store.id,
    returnReason: r.reason,
    issuedBy: ctx.actor.userId,
    issuedAt: ctx.now,
    voucher,
    dispatchKind: "return",
  });
  const batch = await batchRef(ctx.tx, h, r.batch_id, from.id);
  const pair = await movePair(ctx.tx, {
    pair: "return",
    hospitalId: h,
    from,
    to: store,
    batch,
    quantity: Number(r.qty),
    sourceId: issueId,
    actorUserId: ctx.actor.userId,
    effectiveAt: ctx.now,
    reasonCode: "returned_to_store",
  });
  // On the shelf where the medicine already is.
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_batch_shelves (hospital_id, batch_id, shelf, actor_id)
    SELECT ${h}::uuid, ${pair.toBatchId}::uuid, s.shelf, ${ctx.actor.userId}::uuid
      FROM public.pharmacy_batch_shelves s JOIN public.pharmacy_batches b ON b.id = s.batch_id
     WHERE b.location_id = ${store.id}::uuid AND b.product_id = ${batch.productId}::uuid AND s.shelf IS NOT NULL
     ORDER BY s.created_at DESC LIMIT 1`);
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_issue_confirmations (issue_id, hospital_id, confirmed_by, confirmed_at)
    VALUES (${issueId}::uuid, ${h}::uuid, ${ctx.actor.userId}::uuid, ${ctx.now.toISOString()}::timestamptz)`);
  await ctx.tx.execute(sql`
    UPDATE public.pharmacy_store_returns SET accepted_issue_id = ${issueId}::uuid, accepted_by = ${ctx.actor.userId}::uuid,
      accepted_at = ${ctx.now.toISOString()}::timestamptz WHERE id = ${r.id}::uuid`);
  return { id: issueId, voucher };
});

/** A case for a place's gap, one per place per month. Offered only on a bad gap, and the server checks it again. */
export const openBalanceCase = act(z.object({ placeId: z.uuid() }), VIEW, async (ctx, i) => {
  await mustBeInCharge(ctx);
  const w = await worldOf(ctx);
  const b = placeBalance(w, i.placeId);
  if (b.state !== "bad") throw fail("conflict", S.gapSmall);
  const med = w.meds.find((m) => m.short === b.why);
  const row = await one<{ id: string | null }>(
    ctx,
    sql`SELECT private.pharmacy_open_case(${ctx.actor.hospitalId}::uuid, 'balance',
          md5(${`${i.placeId}|${w.today.slice(0, 7)}`})::uuid, ${med?.medicineId ?? "unknown"}, ${i.placeId}::uuid, 0, 'high',
          ${ctx.actor.userId}::uuid, ${ctx.now.toISOString()}::timestamptz) AS id`,
  );
  return { id: row?.id ?? i.placeId };
});
