import "server-only";

import type { EpiWasteRow, LossRow, MedRow, ReportFigures } from "./derive";
import type { ReportKind } from "@/db/schema/pharmacy-rework-records";
import type { Exec, ExtraRow } from "@/lib/pharmacy/audit/read";
import type { LossLine } from "@/lib/pharmacy/losses/derive";
import { cache } from "react";
import { sql } from "drizzle-orm";

import { RC, RULES } from "@/content/pharmacy-rework-records";
import { appDb, extraRows, iso, rowsOf } from "@/lib/pharmacy/audit/read";
import { CAUSES, losses } from "@/lib/pharmacy/losses/derive";
import { addMonths, EPI_VACCINES, lossMovements, monthStart } from "@/lib/pharmacy/losses/read";
import { openCases } from "./derive";

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
export const CASES = "pharmacy_cases";
export const EPI_DOSES = "pharmacy_epi_doses";

/** Each medicine's month, net of corrections (a reversal counts with the kind it reverses). */
async function medRows(
  database: Exec,
  hospitalId: string,
  from: Date,
  to: Date,
): Promise<MedRow[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await database.execute(sql`
    WITH mv AS (
      SELECT b.product_id, m.effective_at AS at, m.quantity AS q, m.kind, coalesce(o.kind, m.kind) AS base,
             coalesce(o.quantity, m.quantity) AS base_q, m.witness_attestation_id
        FROM public.pharmacy_stock_movements m
        JOIN public.pharmacy_batches b ON b.id = m.batch_id
        LEFT JOIN public.pharmacy_stock_movements o ON o.id = m.reverses_id
       WHERE m.hospital_id = ${hospitalId}::uuid AND m.effective_at < ${to.toISOString()}::timestamptz),
    agg AS (
      SELECT product_id,
             coalesce(sum(q) FILTER (WHERE at < ${from.toISOString()}::timestamptz), 0) AS opening,
             coalesce(sum(q) FILTER (WHERE at >= ${from.toISOString()}::timestamptz AND base = 'received'), 0) AS received,
             coalesce(-sum(q) FILTER (WHERE at >= ${from.toISOString()}::timestamptz AND base IN ('supplied','ward_used','cart_used')), 0) AS consumed,
             coalesce(-sum(q) FILTER (WHERE at >= ${from.toISOString()}::timestamptz AND (base = 'written_off'
               OR (base IN ('count_correction','adjusted') AND base_q < 0))), 0) AS lost,
             coalesce(sum(q), 0) AS closing,
             coalesce(-sum(q) FILTER (WHERE at >= ${to.toISOString()}::timestamptz - make_interval(months => ${RULES.amcMonths})
               AND base IN ('supplied','ward_used','cart_used')), 0)::float8 / ${RULES.amcMonths} AS amc,
             count(*) FILTER (WHERE at >= ${from.toISOString()}::timestamptz AND q < 0 AND witness_attestation_id IS NULL
               AND kind NOT IN ('count_correction','adjusted','quarantined_out','reversed')) AS no_witness,
             count(*) FILTER (WHERE at >= ${from.toISOString()}::timestamptz) AS moved
        FROM mv GROUP BY product_id)
    SELECT p.id, p.name, p.issue_unit, p.controlled_class IS NOT NULL AS controlled, agg.*,
           coalesce((SELECT max(ceil(extract(epoch FROM least(coalesce(s.ended_at, now()), ${to.toISOString()}::timestamptz)
                                 - greatest(s.started_at, ${from.toISOString()}::timestamptz)) / 86400))
                       FROM public.pharmacy_stockouts s
                      WHERE s.hospital_id = ${hospitalId}::uuid AND s.medicine_id = p.medicine_id
                        AND s.started_at < ${to.toISOString()}::timestamptz AND coalesce(s.ended_at, now()) > ${from.toISOString()}::timestamptz), 0) AS days_out
      FROM agg JOIN public.pharmacy_products p ON p.id = agg.product_id
     WHERE agg.moved > 0 OR agg.closing <> 0
     ORDER BY p.name`),
  );
  return rows.map((r) => ({
    productId: String(r.id),
    name: String(r.name),
    unit: String(r.issue_unit),
    controlled: r.controlled === true,
    opening: Number(r.opening),
    received: Number(r.received),
    consumed: Number(r.consumed),
    lost: Number(r.lost),
    closing: Number(r.closing),
    amc: Number(r.amc),
    daysOut: Math.max(0, Number(r.days_out)),
    noWitness: r.controlled === true ? Number(r.no_witness) : 0,
  }));
}

/**
 * HMIS 105 immunisation: doses given per antigen and per vaccine from `pharmacy_epi_doses`, and opened-vial wastage per
 * vaccine from the ledger's loss lines (the clinic books leftovers as `adjusted` 'wastage:opened_vial').
 */
function epiFigures(
  rows: readonly ExtraRow[],
  lines: readonly LossLine[],
  from: Date,
  to: Date,
): ReportFigures["epi"] {
  const name = (v: string) => RC.reports.vaccines[v] ?? v;
  const vaccineOf = new Map(
    rows
      .filter((r) => r.src === EPI_VACCINES && r.productId)
      .map((r) => [r.productId!, name(String(r.j.vaccine))]),
  );
  const doses = rows.filter((r) => {
    const at = r.src === EPI_DOSES ? text(r.j.given_at) : null;
    return !!at && new Date(at) >= from && new Date(at) < to;
  });
  const antigens = new Map<string, number>();
  const given = new Map<string, number>();
  for (const d of doses) {
    const a = text(d.j.antigen) ?? "";
    antigens.set(a, (antigens.get(a) ?? 0) + 1);
    const v = name(String(d.j.vaccine));
    given.set(v, (given.get(v) ?? 0) + 1);
  }
  const wasted = new Map<string, number>();
  for (const l of lines) {
    const v = l.epi && l.productId ? vaccineOf.get(l.productId) : undefined;
    if (v) wasted.set(v, (wasted.get(v) ?? 0) + l.qty);
  }
  const waste: EpiWasteRow[] = [...new Set([...given.keys(), ...wasted.keys()])]
    .sort()
    .map((v) => ({
      vaccine: v,
      given: given.get(v) ?? 0,
      wasted: wasted.get(v) ?? 0,
    }));
  return {
    inUse: vaccineOf.size > 0,
    antigens: [...antigens].sort().map(([antigen, n]) => ({ antigen, given: n })),
    waste,
  };
}

/** Every figure the four reports need for one month (`YYYY-MM`), in three queries. */
export async function reportFigures(
  database: Exec,
  hospitalId: string,
  ym: string,
): Promise<ReportFigures> {
  const from = monthStart(ym);
  const to = monthStart(addMonths(ym, 1));
  const [meds, extra, moves] = await Promise.all([
    medRows(database, hospitalId, from, to),
    extraRows(database, hospitalId, [CASES, EPI_DOSES, EPI_VACCINES]),
    lossMovements(database, hospitalId, from, to),
  ]);
  const lines = losses(moves);
  const lossRows: LossRow[] = CAUSES.map((c) => {
    const l = lines.filter((x) => x.cause === c);
    return { cause: c, lines: l.length, value: l.reduce((a, x) => a + x.value, 0) };
  });
  return {
    meds,
    cases: openCases(extra),
    epi: epiFigures(extra, lines, from, to),
    losses: lossRows,
  };
}

export interface SavedReport {
  kind: ReportKind;
  status: "checked" | "submitted";
  remarks: Record<string, string>;
  checkedBy: string | null;
  checkedAt: string;
  submittedBy: string | null;
  submittedAt: string | null;
  snapshot: unknown;
}

export async function savedReports(
  database: Exec,
  hospitalId: string,
  ym: string,
): Promise<SavedReport[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await database.execute(sql`
    SELECT r.kind, r.status, r.remarks, r.checked_at, r.submitted_at, r.snapshot,
           coalesce(c.full_name, c.email) AS checked_by, coalesce(s.full_name, s.email) AS submitted_by
      FROM public.pharmacy_reports r
      LEFT JOIN public.users c ON c.id = r.checked_by
      LEFT JOIN public.users s ON s.id = r.submitted_by
     WHERE r.hospital_id = ${hospitalId}::uuid AND r.period = ${`${ym}-01`}::date`),
  );
  return rows.map((r) => ({
    kind: r.kind as ReportKind,
    status: r.status as "checked" | "submitted",
    remarks: (r.remarks as Record<string, string>) ?? {},
    checkedBy: (r.checked_by as string | null) ?? null,
    checkedAt: iso(r.checked_at),
    submittedBy: (r.submitted_by as string | null) ?? null,
    submittedAt: r.submitted_at ? iso(r.submitted_at) : null,
    snapshot: r.snapshot ?? null,
  }));
}

/** The Reports tab: the month's figures and what was saved (four queries). */
export const loadReports = cache(
  async (hospitalId: string, ym: string, database: Exec = appDb()) => {
    const [figures, saved] = await Promise.all([
      reportFigures(database, hospitalId, ym),
      savedReports(database, hospitalId, ym),
    ]);
    return { figures, saved };
  },
);
