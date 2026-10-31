import "server-only";

import type { AuditMovement, SourceRow } from "./derive";
import type { EmrDb } from "@/lib/emr/db";
import type { SQL } from "drizzle-orm";
import { cache } from "react";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { AUDIT_SOURCES, timeline } from "./derive";

/**
 * Records reads (rework PRD §6.6). The owner connection, scoped by hospital in every WHERE. Other areas' tables are
 * read through `private.pharmacy_rows_if` (0269), which returns nothing for a table not created yet.
 */
export const appDb = () => db as unknown as EmrDb;
/** Any connection or transaction that runs SQL. */
export type Exec = Pick<EmrDb, "execute">;

export const rowsOf = <T>(r: unknown): T[] =>
  (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];

export const iso = (v: unknown): string =>
  (v instanceof Date ? v : new Date(String(v))).toISOString();

/** UGX per issue unit: the last received unit cost (what the facility paid), else the product's price. */
export const priceOf = (product: SQL) => sql`coalesce((
  SELECT m.unit_cost FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
   WHERE b.product_id = ${product} AND m.kind = 'received' AND m.unit_cost IS NOT NULL
   ORDER BY m.effective_at DESC LIMIT 1), p.price_ugx, 0)::float8`;

export interface ExtraRow extends SourceRow {
  productId: string | null;
  product: string | null;
  controlled: boolean;
  /** UGX per issue unit of the row's medicine. */
  unitPrice: number;
}

/**
 * The rows of other areas' tables, each with its medicine (from `product_id`, `batch_id` or `med_id`/`medicine_id`)
 * and the person who wrote it. One query for any number of tables; a missing table adds no rows.
 */
export async function extraRows(
  database: Exec,
  hospitalId: string,
  tables: readonly string[],
): Promise<ExtraRow[]> {
  if (!tables.length) return [];
  const union = sql.join(
    tables.map(
      (t) =>
        sql`SELECT ${t}::text AS src, j FROM private.pharmacy_rows_if(${t}, ${hospitalId}::uuid) j`,
    ),
    sql` UNION ALL `,
  );
  const rows = rowsOf<{
    src: string;
    j: Record<string, unknown>;
    who: string | null;
    product_id: string | null;
    product: string | null;
    controlled: boolean | null;
    unit_price: number | null;
  }>(
    await database.execute(sql`
    SELECT s.src, s.j, coalesce(u.full_name, u.email) AS who, p.id AS product_id, p.name AS product,
           p.controlled_class IS NOT NULL AS controlled, ${priceOf(sql`p.id`)} AS unit_price
      FROM (${union}) s
      LEFT JOIN public.users u ON u.id::text = coalesce(s.j ->> 'created_by', s.j ->> 'actor_user_id',
        s.j ->> 'counted_by', s.j ->> 'checked_by', s.j ->> 'from_user_id', s.j ->> 'acted_by')
      LEFT JOIN public.pharmacy_batches b ON b.id::text = s.j ->> 'batch_id'
      LEFT JOIN LATERAL (
        SELECT * FROM public.pharmacy_products x
         WHERE x.hospital_id = ${hospitalId}::uuid
           AND (x.id::text = coalesce(s.j ->> 'product_id', s.j ->> 'med_id') OR x.id = b.product_id
                OR x.medicine_id = coalesce(s.j ->> 'medicine_id', s.j ->> 'med_id'))
         LIMIT 1) p ON true`),
  );
  return rows.map((r) => ({
    src: r.src,
    j: r.j,
    who: r.who,
    productId: r.product_id,
    product: r.product,
    controlled: !!r.controlled,
    unitPrice: Number(r.unit_price ?? 0),
  }));
}

/** Ledger lines recorded since `since`, newest first, with names, the witness, and the correction if any. */
export async function auditMovements(
  database: Exec,
  hospitalId: string,
  since: Date | null,
  limit = 500,
): Promise<AuditMovement[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await database.execute(sql`
    SELECT m.id, m.kind, m.quantity, m.effective_at, m.recorded_at, m.late, m.downtime, m.paper_witness_name,
           m.reason_code, m.reason_note, m.reverses_id, m.correction_of_id, m.actor_user_id, m.batch_id,
           b.batch_number, b.product_id, p.name AS product, p.issue_unit, p.controlled_class IS NOT NULL AS controlled,
           coalesce(m.location_id, m.dispensing_point_id) AS place_id, l.name AS place,
           coalesce(u.full_name, u.email) AS who, coalesce(wu.full_name, wu.email) AS witness,
           (SELECT coalesce(sum(x.quantity), 0) FROM public.pharmacy_stock_movements x WHERE x.batch_id = m.batch_id)
             AS batch_balance,
           r.recorded_at AS corrected_at, coalesce(ru.full_name, ru.email) AS corrected_by, r.reason_code AS corrected_why
      FROM public.pharmacy_stock_movements m
      JOIN public.pharmacy_batches b ON b.id = m.batch_id
      JOIN public.pharmacy_products p ON p.id = b.product_id
      LEFT JOIN public.pharmacy_locations l ON l.id = coalesce(m.location_id, m.dispensing_point_id)
      LEFT JOIN public.users u ON u.id = m.actor_user_id
      LEFT JOIN public.pharmacy_attestations a ON a.id = m.witness_attestation_id
      LEFT JOIN public.users wu ON wu.id = a.attester_user_id
      LEFT JOIN public.pharmacy_stock_movements r ON r.reverses_id = m.id
      LEFT JOIN public.users ru ON ru.id = r.actor_user_id
     WHERE m.hospital_id = ${hospitalId}::uuid
       AND (${since === null}::boolean OR m.recorded_at >= ${(since ?? new Date(0)).toISOString()}::timestamptz)
     ORDER BY m.recorded_at DESC, m.id
     LIMIT ${limit}`),
  );
  return rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    quantity: Number(r.quantity),
    effectiveAt: iso(r.effective_at),
    recordedAt: iso(r.recorded_at),
    late: r.late === true,
    downtime: r.downtime === true,
    paperWitness: (r.paper_witness_name as string | null) ?? null,
    reasonCode: (r.reason_code as string | null) ?? null,
    reasonNote: (r.reason_note as string | null) ?? null,
    reversesId: (r.reverses_id as string | null) ?? null,
    correctionOfId: (r.correction_of_id as string | null) ?? null,
    actorId: String(r.actor_user_id),
    who: (r.who as string | null) ?? null,
    witness: (r.witness as string | null) ?? null,
    batchId: String(r.batch_id),
    batchNumber: String(r.batch_number),
    productId: String(r.product_id),
    product: String(r.product),
    unit: String(r.issue_unit),
    controlled: r.controlled === true,
    placeId: (r.place_id as string | null) ?? null,
    place: (r.place as string | null) ?? null,
    batchBalance: Number(r.batch_balance),
    correctedAt: r.corrected_at ? iso(r.corrected_at) : null,
    correctedBy: (r.corrected_by as string | null) ?? null,
    correctedWhy: (r.corrected_why as string | null) ?? null,
  }));
}

/** The Audit trail tab: one timeline for the period (days; 0 = all), in two queries. */
export const loadAudit = cache(
  async (hospitalId: string, days: number, database: Exec = appDb()) => {
    const since = days ? new Date(Date.now() - days * 86_400_000) : null;
    const [moves, rows] = await Promise.all([
      auditMovements(database, hospitalId, since),
      extraRows(database, hospitalId, Object.keys(AUDIT_SOURCES)),
    ]);
    const sinceIso = since?.toISOString() ?? "";
    return timeline(moves, rows).filter((e) => e.at >= sinceIso);
  },
);

/** For "Wrong batch": other usable batches of the same medicine at the same place as the line being corrected. */
export async function otherBatches(database: Exec, hospitalId: string, movementId: string) {
  return rowsOf<{ id: string; batch_number: string; expires: string; n: number }>(
    await database.execute(sql`
    SELECT b.id, b.batch_number, private.pharmacy_expires_on(b.expiry, b.expiry_month_only)::text AS expires,
           (SELECT coalesce(sum(x.quantity), 0)::int FROM public.pharmacy_stock_movements x WHERE x.batch_id = b.id) AS n
      FROM public.pharmacy_stock_movements m
      JOIN public.pharmacy_batches o ON o.id = m.batch_id
      JOIN public.pharmacy_batches b ON b.product_id = o.product_id AND b.id <> o.id
       AND coalesce(b.location_id, b.dispensing_point_id) = coalesce(m.location_id, m.dispensing_point_id)
     WHERE m.id = ${movementId}::uuid AND m.hospital_id = ${hospitalId}::uuid
       AND private.pharmacy_expires_on(b.expiry, b.expiry_month_only) >= private.pharmacy_local_date()
     ORDER BY 3`),
  ).map((b) => ({ id: b.id, batchNumber: b.batch_number, expires: b.expires, n: Number(b.n) }));
}

/** Records' head, one query: is the viewer the in-charge, and how many paper sheets wait to be entered (tab count). */
export const recordsHead = cache(
  async (hospitalId: string, userId: string, database: Exec = appDb()) => {
    const [r] = rowsOf<{ manages: boolean; sheets: number }>(
      await database.execute(sql`
    SELECT private.pharmacy_can_user(${userId}::uuid, ${hospitalId}::uuid, 'pharmacy.manage') AS manages,
           (SELECT count(*)::int FROM public.downtime_form_numbers d
             WHERE d.hospital_id = ${hospitalId}::uuid AND d.workspace = 'pharmacy' AND d.state = 'to_enter') AS sheets`),
    );
    return { inCharge: r?.manages === true, toEnter: Number(r?.sheets ?? 0) };
  },
);
