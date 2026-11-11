import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { STORE } from "@/content/pharmacy-stores-store";
import { db as appDb } from "@/db";
import { asClinicalReader } from "@/lib/emr/db";
import { rowsOf } from "@/lib/exchange/store";
import { fail } from "./write";

/**
 * Shelves in the store (0272): put-away writes where a batch sits; the pick list reads it. Before 0272 is applied
 * every read is empty and put-away says so, so no page breaks.
 */

const P = STORE.putAway;
const defaultDb = () => appDb as unknown as EmrDb;

async function shelvesLive(tx: EmrTx): Promise<boolean> {
  const [r] = rowsOf<{ ok: boolean }>(
    await tx.execute(sql`SELECT to_regclass('public.pharmacy_batch_shelves') IS NOT NULL AS ok`),
  );
  return !!r?.ok;
}

/** Each batch's shelf now: its latest row. */
export async function shelvesOf(tx: EmrTx, batchIds: readonly string[]) {
  if (!batchIds.length || !(await shelvesLive(tx))) return new Map<string, string>();
  const rows = rowsOf<{ batch_id: string; shelf: string }>(
    await tx.execute(sql`
      SELECT DISTINCT ON (batch_id) batch_id, shelf FROM public.pharmacy_batch_shelves
       WHERE batch_id IN (${sql.join(
         batchIds.map((id) => sql`${id}::uuid`),
         sql`, `,
       )})
       ORDER BY batch_id, created_at DESC`),
  );
  return new Map(rows.map((r) => [r.batch_id, r.shelf]));
}

export const PutAwayInput = z.object({
  clientKey: z.uuid(),
  batchId: z.uuid(),
  shelf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9 ./-]{0,19}$/, P.bad),
});

/** Put a store batch on a shelf (or move it): one append-only row. */
export async function putAway(ctx: PharmacyCtx, input: z.infer<typeof PutAwayInput>) {
  if (!(await shelvesLive(ctx.tx))) throw fail("config", P.migration);
  const [b] = rowsOf<{ id: string }>(
    await ctx.tx.execute(sql`
      SELECT b.id FROM public.pharmacy_batches b
        JOIN public.pharmacy_locations l ON l.id = b.location_id
       WHERE b.id = ${input.batchId} AND b.hospital_id = ${ctx.actor.hospitalId} AND l.kind = 'store'`),
  );
  if (!b) throw fail("not_found", P.notHere);
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_batch_shelves (id, hospital_id, batch_id, shelf, actor_id)
    VALUES (${input.clientKey}, ${ctx.actor.hospitalId}, ${input.batchId}, ${input.shelf}, ${ctx.actor.userId})
    ON CONFLICT (id) DO NOTHING`);
  return { id: input.clientKey };
}

export interface PutAwayRow {
  batchId: string;
  place: string;
  productName: string;
  issueUnit: string;
  cold: boolean;
  batchNumber: string;
  expiry: string;
  expiryMonthOnly: boolean;
  quantity: number;
  /** The shelf another batch of the same medicine is on here. */
  suggest: string | null;
}

/** Store batches with stock and no shelf yet, cold chain first. Null before 0272 is applied. */
export async function getPutAway(
  scope: { userId: string; hospitalId: string },
  database: EmrDb = defaultDb(),
): Promise<PutAwayRow[] | null> {
  return asClinicalReader(
    scope,
    async (tx) => {
      if (!(await shelvesLive(tx))) return null;
      const rows = rowsOf<{
        id: string;
        location_id: string;
        product_id: string;
        place: string;
        name: string;
        unit: string;
        cold: boolean;
        no: string;
        expiry: string;
        month_only: boolean;
        qty: number;
      }>(
        await tx.execute(sql`
          SELECT b.id, b.location_id, b.product_id, l.name AS place, p.name, p.issue_unit AS unit,
                 coalesce(p.cold_chain, false) AS cold, b.batch_number AS no, b.expiry::text AS expiry,
                 b.expiry_month_only AS month_only,
                 (SELECT coalesce(sum(m.quantity), 0) FROM public.pharmacy_stock_movements m
                   WHERE m.batch_id = b.id)::int AS qty
            FROM public.pharmacy_batches b
            JOIN public.pharmacy_locations l ON l.id = b.location_id
            JOIN public.pharmacy_products p ON p.id = b.product_id
           WHERE b.hospital_id = ${scope.hospitalId} AND l.kind = 'store' AND l.archived_at IS NULL`),
      ).filter((r) => r.qty > 0);
      const shelves = await shelvesOf(
        tx,
        rows.map((r) => r.id),
      );
      return rows
        .filter((r) => !shelves.has(r.id))
        .map((r) => ({
          batchId: r.id,
          place: r.place,
          productName: r.name,
          issueUnit: r.unit,
          cold: r.cold,
          batchNumber: r.no,
          expiry: r.expiry,
          expiryMonthOnly: r.month_only,
          quantity: r.qty,
          suggest:
            rows
              .filter(
                (o) =>
                  o.product_id === r.product_id &&
                  o.location_id === r.location_id &&
                  shelves.has(o.id),
              )
              .map((o) => shelves.get(o.id)!)[0] ?? null,
        }))
        .sort(
          (a, b) => Number(b.cold) - Number(a.cold) || a.productName.localeCompare(b.productName),
        );
    },
    database,
  );
}
