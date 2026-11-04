import "server-only";

import type { StoreDispatchKind } from "@/db/schema/pharmacy-stores";
import type { EmrDb } from "@/lib/emr/db";
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import type { StockLocation } from "@/lib/pharmacy/stores/write";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { sql } from "drizzle-orm";

import { STORE_SAYS } from "@/content/pharmacy-store";
import { fill } from "@/content/pharmacy-workspace-v2";
import { pharmacyIssues } from "@/db/schema/pharmacy-stores";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { isInCharge } from "@/lib/pharmacy/cd/store";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { loadStoreWorld } from "@/lib/pharmacy/store/read";
import { transitOf } from "@/lib/pharmacy/stores/dispatch";
import { planIssue } from "@/lib/pharmacy/stores/issue";
import { productBatches } from "@/lib/pharmacy/stores/issue-store";
import {
  balancesAt,
  batchRef,
  fail,
  loadLocation,
  locationLive,
  movePair,
  requireAttestation,
  requireLive,
  storeNeed,
} from "@/lib/pharmacy/stores/write";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Stock › Main store, the actions' shared core (STORE.md §I, §J). The store keeper's right is `pharmacy.store`; the
 * in-charge's extra acts check `pharmacy_is_in_charge`, as the guards do. Each is idempotent on its client key: the row
 * id, so a voucher is only ever taken once.
 */
export type Ctx = PharmacyCtx;
export type Opt = { database?: EmrDb; now?: Date };
export const NEED: PharmacyNeed = storeNeed("pharmacy.store");
export const VIEW: PharmacyNeed = storeNeed("pharmacy.view");

export const act =
  <I, R extends { id: string }>(
    schema: z.ZodType<I>,
    need: PharmacyNeed,
    write: (ctx: Ctx, input: I) => Promise<R>,
  ) =>
  (actor: PharmacyActor, raw: unknown, options?: Opt) =>
    runPharmacyWrite(schema, raw, actor, need, write, options);

export const one = async <T>(ctx: Ctx, q: ReturnType<typeof sql>) =>
  rowsOf<T>(await ctx.tx.execute(q))[0];
export const all = async <T>(ctx: Ctx, q: ReturnType<typeof sql>) =>
  rowsOf<T>(await ctx.tx.execute(q));
/** A uuid[] literal: drizzle spreads a JS array into a parameter list. */
export const uuids = (xs: readonly string[]) => `{${xs.join(",")}}`;

export async function storeOf(ctx: Ctx): Promise<StockLocation> {
  const s = await one<{ id: string }>(
    ctx,
    sql`SELECT id FROM public.pharmacy_locations WHERE hospital_id = ${ctx.actor.hospitalId}::uuid AND kind = 'store'
         AND archived_at IS NULL ORDER BY created_at LIMIT 1`,
  );
  if (!s) throw fail("config", STORE_SAYS.noStore);
  return loadLocation(ctx.tx, ctx.actor.hospitalId, s.id);
}

export const nextVoucher = async (
  ctx: Ctx,
  prefix: "RIV" | "TRF" | "RTS" | "RTN" | "ADJ" | "CNT",
) =>
  (await one<{ v: string }>(
    ctx,
    sql`SELECT private.pharmacy_next_voucher(${ctx.actor.hospitalId}::uuid, ${prefix}) AS v`,
  ))!.v;

export const mustBeInCharge = async (ctx: Ctx) => {
  if (!(await isInCharge(ctx.tx, ctx.actor.userId, ctx.actor.hospitalId)))
    throw fail("forbidden", STORE_SAYS.inChargeOnly);
};

export const worldOf = async (ctx: Ctx): Promise<StoreWorld> => {
  const w = await loadStoreWorld(ctx.tx, {
    hospitalId: ctx.actor.hospitalId,
    actorUserId: ctx.actor.userId,
    now: ctx.now,
  });
  if (!w) throw fail("config", STORE_SAYS.noStore);
  return w;
};

/** The second person, for a controlled line: their approval, or a refusal in words. Returns who it was. */
export async function witnessOf(
  ctx: Ctx,
  attestationId: string | null | undefined,
  say: string = STORE_SAYS.chooseWitness,
) {
  if (!attestationId) throw fail("invalid", say);
  return requireAttestation(ctx.tx, {
    id: attestationId,
    hospitalId: ctx.actor.hospitalId,
    actorUserId: ctx.actor.userId,
    now: ctx.now,
  });
}

export const anyControlled = async (ctx: Ctx, batchIds: readonly string[]) =>
  (
    await one<{ ok: boolean }>(
      ctx,
      sql`SELECT coalesce(bool_or(private.pharmacy_batch_controlled(id)), false) AS ok FROM public.pharmacy_batches
           WHERE id = ANY(${uuids(batchIds)}::uuid[])`,
    )
  )?.ok === true;

/** First expiry first, on the server: blocked and expired batches are never taken. */
export async function pickFefo(ctx: Ctx, from: StockLocation, productId: string, quantity: number) {
  const { batches, blocked } = await productBatches(ctx.tx, from, productId);
  const plan = planIssue(quantity, {
    batches,
    balances: await balancesAt(ctx.tx, from.id),
    blocked,
    localDate: localDate(ctx.now),
  });
  if (plan.issue < quantity) throw fail("conflict", fill(STORE_SAYS.onlyN, { n: plan.held }));
  return plan.rows;
}

/** A dispatch: voucher, an issue row, and every batch from → on the way. Nothing reaches the place yet. */
export async function sendDispatch(
  ctx: Ctx,
  i: {
    id: string;
    kind: StoreDispatchKind;
    prefix?: "RIV" | "TRF";
    from: StockLocation;
    to: StockLocation;
    requisitionId?: string | null;
    lines?: readonly { productId: string; quantity: number }[];
    batches?: readonly { batchId: string; quantity: number }[];
    attestationId?: string | null;
  },
) {
  const h = ctx.actor.hospitalId;
  requireLive(i.from);
  if (!locationLive(i.to)) throw fail("config", `${i.to.name} is not live yet.`);
  const rows = [...(i.batches ?? [])];
  for (const l of i.lines ?? [])
    rows.push(...(await pickFefo(ctx, i.from, l.productId, l.quantity)));
  if (!rows.length) throw fail("invalid", STORE_SAYS.nothing);
  const controlled = await anyControlled(
    ctx,
    rows.map((r) => r.batchId),
  );
  const witnessId = controlled ? await witnessOf(ctx, i.attestationId) : null;
  const voucher = await nextVoucher(ctx, i.prefix ?? "RIV");
  await ctx.tx.insert(pharmacyIssues).values({
    id: i.id,
    hospitalId: h,
    kind: "issue",
    fromLocationId: i.from.id,
    toLocationId: i.to.id,
    requisitionId: i.requisitionId ?? null,
    issuedBy: ctx.actor.userId,
    witnessAttestationId: controlled ? i.attestationId! : null,
    issuedAt: ctx.now,
    voucher,
    dispatchKind: i.kind,
    witnessId,
  });
  const transit = await transitOf(ctx.tx, h);
  for (const r of rows)
    await movePair(ctx.tx, {
      pair: "issue",
      hospitalId: h,
      from: i.from,
      to: transit,
      batch: await batchRef(ctx.tx, h, r.batchId, i.from.id),
      quantity: r.quantity,
      sourceId: i.id,
      actorUserId: ctx.actor.userId,
      effectiveAt: ctx.now,
      witnessAttestationId: controlled ? i.attestationId! : null,
    });
  return { id: i.id, voucher, rows };
}

/** The voucher already taken for this key, when the same tap arrives twice. */
export const replayVoucher = async (ctx: Ctx, id: string) =>
  (
    await one<{ voucher: string }>(
      ctx,
      sql`SELECT voucher FROM public.pharmacy_issues WHERE id = ${id}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid`,
    )
  )?.voucher ?? null;
