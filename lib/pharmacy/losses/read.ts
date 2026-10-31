import "server-only";

import type { LossMovement, RiskBatch } from "./derive";
import type { Exec } from "@/lib/pharmacy/audit/read";
import { cache } from "react";
import { sql } from "drizzle-orm";

import { RULES } from "@/content/pharmacy-rework-records";
import { appDb, extraRows, iso, priceOf, rowsOf } from "@/lib/pharmacy/audit/read";
import { openCases } from "@/lib/pharmacy/reports/derive";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { atRisk, byMonth, losses, monthOf, totalOf } from "./derive";

/** Kinds that count as use when working out the average monthly consumption. */
export const USE_KINDS = ["supplied", "ward_used", "cart_used"] as const;

/** Kampala month start (UTC+3) of `YYYY-MM`, as a Date. */
export const monthStart = (ym: string) => new Date(`${ym}-01T00:00:00+03:00`);
export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

/**
 * The ledger's loss lines between `from` and `to`: write-offs and stock found short (a negative count correction or
 * adjustment). A corrected line is left out and its replacement counts; reversals are never losses.
 */
export async function lossMovements(
  database: Exec,
  hospitalId: string,
  from: Date,
  to: Date,
): Promise<LossMovement[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await database.execute(sql`
    SELECT m.id, m.effective_at, -m.quantity AS qty, m.reason_code, m.reason_note,
           coalesce(m.location_id, m.dispensing_point_id) AS place_id, l.name AS place, b.product_id, p.name AS product,
           p.issue_unit, b.batch_number, coalesce(u.full_name, u.email) AS who, ${priceOf(sql`b.product_id`)} AS unit_price
      FROM public.pharmacy_stock_movements m
      JOIN public.pharmacy_batches b ON b.id = m.batch_id
      JOIN public.pharmacy_products p ON p.id = b.product_id
      LEFT JOIN public.pharmacy_locations l ON l.id = coalesce(m.location_id, m.dispensing_point_id)
      LEFT JOIN public.users u ON u.id = m.actor_user_id
     WHERE m.hospital_id = ${hospitalId}::uuid AND m.effective_at >= ${from.toISOString()}::timestamptz AND m.effective_at < ${to.toISOString()}::timestamptz
       AND m.reverses_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.pharmacy_stock_movements r WHERE r.reverses_id = m.id)
       AND (m.kind = 'written_off' OR (m.kind IN ('count_correction','adjusted') AND m.quantity < 0))
     ORDER BY m.effective_at`),
  );
  return rows.map((r) => ({
    id: String(r.id),
    at: iso(r.effective_at),
    placeId: (r.place_id as string | null) ?? null,
    place: (r.place as string | null) ?? null,
    productId: String(r.product_id),
    product: String(r.product),
    unit: String(r.issue_unit),
    batchNumber: String(r.batch_number),
    qty: Number(r.qty),
    reasonCode: (r.reason_code as string | null) ?? null,
    reasonNote: (r.reason_note as string | null) ?? null,
    who: (r.who as string | null) ?? null,
    unitPrice: Number(r.unit_price),
  }));
}

/** Vaccines mapped to products (built with the immunisation pages): any row means the clinic is in use. */
export const EPI_VACCINES = "pharmacy_epi_vaccines";

/** Batches with stock, grouped by batch number across places, with the medicine's use, price and actions taken. */
async function riskBatches(database: Exec, hospitalId: string): Promise<RiskBatch[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await database.execute(sql`
    WITH bal AS (
      SELECT b.product_id, b.batch_number,
             min(private.pharmacy_expires_on(b.expiry, b.expiry_month_only)) AS expires,
             bool_or(private.pharmacy_batch_recalled(b.id)) AS recalled,
             sum(s.n) AS have,
             json_agg(json_build_object('place', l.name, 'n', s.n) ORDER BY l.name) FILTER (WHERE s.n > 0) AS places
        FROM public.pharmacy_batches b
        JOIN LATERAL (SELECT coalesce(sum(quantity), 0)::int AS n FROM public.pharmacy_stock_movements WHERE batch_id = b.id) s ON true
        LEFT JOIN public.pharmacy_locations l ON l.id = coalesce(b.location_id, b.dispensing_point_id)
       WHERE b.hospital_id = ${hospitalId}::uuid AND l.kind IS DISTINCT FROM 'quarantine'
       GROUP BY b.product_id, b.batch_number
      HAVING sum(s.n) > 0),
    use AS (
      SELECT b.product_id, -sum(m.quantity)::float8 / ${RULES.amcMonths} AS amc
        FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
       WHERE m.hospital_id = ${hospitalId}::uuid AND m.kind IN ('supplied','ward_used','cart_used')
         AND m.effective_at >= now() - make_interval(months => ${RULES.amcMonths})
       GROUP BY b.product_id)
    SELECT bal.*, p.name AS product, p.issue_unit, coalesce(use.amc, 0) AS amc, ${priceOf(sql`p.id`)} AS unit_price,
           (SELECT json_agg(json_build_object('action', a.action, 'by', coalesce(u.full_name, u.email), 'at', a.created_at)
                            ORDER BY a.created_at)
              FROM public.pharmacy_risk_actions a LEFT JOIN public.users u ON u.id = a.created_by
             WHERE a.hospital_id = ${hospitalId}::uuid AND a.product_id = bal.product_id
               AND a.batch_number = bal.batch_number) AS done
      FROM bal JOIN public.pharmacy_products p ON p.id = bal.product_id
      LEFT JOIN use ON use.product_id = bal.product_id`),
  );
  return rows.map((r) => ({
    productId: String(r.product_id),
    product: String(r.product),
    unit: String(r.issue_unit),
    batchNumber: String(r.batch_number),
    expires: (r.expires instanceof Date ? r.expires.toISOString() : String(r.expires)).slice(0, 10),
    recalled: r.recalled === true,
    have: Number(r.have),
    amc: Number(r.amc),
    unitPrice: Number(r.unit_price),
    places: ((r.places as { place: string | null; n: number }[] | null) ?? []).map((x) => ({
      place: x.place ?? "",
      n: Number(x.n),
    })),
    done: ((r.done as { action: string; by: string | null; at: string }[] | null) ?? []).map(
      (d) => ({
        ...d,
        at: iso(d.at),
      }),
    ),
  }));
}

/**
 * The Losses tab (PRD §6.6): this month's lines and the months before for the chart, stock at risk, and the open
 * cases valued. Three queries: loss movements, risk batches, and the other areas' rows (cases, the clinic's vaccines).
 */
export const loadLosses = cache(async (hospitalId: string, database: Exec = appDb()) => {
  const now = new Date();
  const ym = monthOf(now.toISOString());
  const from = monthStart(addMonths(ym, -(RULES.lossMonths - 1)));
  const to = monthStart(addMonths(ym, 1));
  const [moves, batches, extra] = await Promise.all([
    lossMovements(database, hospitalId, from, to),
    riskBatches(database, hospitalId),
    extraRows(database, hospitalId, ["pharmacy_cases", EPI_VACCINES]),
  ]);
  const all = losses(moves);
  const month = all.filter((l) => monthOf(l.at) === ym);
  const months = byMonth(all, now.toISOString(), RULES.lossMonths);
  const risk = atRisk(batches, localDate(now), RULES.riskMonths).filter((r) => r.waste > 0);
  const shorts = openCases(extra).filter((c) => c.qty !== null && c.qty < 0);
  return {
    month,
    total: totalOf(month),
    months,
    risk,
    riskValue: totalOf(risk),
    openValue: shorts.reduce((a, c) => a + -c.qty! * c.unitPrice, 0),
    epiInUse: extra.some((r) => r.src === EPI_VACCINES),
  };
});
