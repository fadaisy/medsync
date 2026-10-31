import "server-only";

import type { Extras, RosterLine, TeamEvent } from "./derive";
import type { Exec } from "@/lib/pharmacy/audit/read";
import { cache } from "react";
import { sql } from "drizzle-orm";

import { RULES } from "@/content/pharmacy-rework-records";
import { appDb, extraRows, iso, rowsOf } from "@/lib/pharmacy/audit/read";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { perHourOfDay, rosterHours, teamRows } from "./derive";

const HOURLY_DAYS = 28;
const WEEK = 7;

/**
 * Team (PRD §6.6): the last 7 days per person and shift, and prescriptions per hour over 4 weeks. `all` is the
 * in-charge's view; otherwise only the viewer's own rows are read. Three queries.
 */
export const loadTeam = cache(
  async (hospitalId: string, viewerId: string, all: boolean, database: Exec = appDb()) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - WEEK * 86_400_000);
    const [ev, roster, extra] = await Promise.all([
      database.execute(sql`
      SELECT e.t, e.uid, e.at, e.late, e.nw, e.matched, coalesce(u.full_name, u.email) AS who FROM (
        SELECT 'rx' AS t, h.actor_user_id AS uid, h.supplied_at AS at, false AS late, false AS nw, NULL::boolean AS matched
          FROM public.pharmacy_handovers h
         WHERE h.hospital_id = ${hospitalId}::uuid AND h.supplied_at >= now() - make_interval(days => ${HOURLY_DAYS})
        UNION ALL
        SELECT 'mv', m.actor_user_id, m.recorded_at, m.late AND m.correction_of_id IS NULL,
               p.controlled_class IS NOT NULL AND m.quantity < 0 AND m.witness_attestation_id IS NULL
                 AND m.kind NOT IN ('count_correction','adjusted','quarantined_out','reversed'), NULL
          FROM public.pharmacy_stock_movements m
          JOIN public.pharmacy_batches b ON b.id = m.batch_id
          JOIN public.pharmacy_products p ON p.id = b.product_id
         WHERE m.hospital_id = ${hospitalId}::uuid AND m.recorded_at >= ${weekAgo.toISOString()}::timestamptz
        UNION ALL
        SELECT 'count', c.counted_by, c.counted_at, false, false, cl.counted_quantity = cl.recorded_balance
          FROM public.pharmacy_count_lines cl JOIN public.pharmacy_counts c ON c.id = cl.count_id
         WHERE c.hospital_id = ${hospitalId}::uuid AND c.counted_at >= ${weekAgo.toISOString()}::timestamptz) e
      LEFT JOIN public.users u ON u.id = e.uid
      WHERE (${all}::boolean OR e.uid = ${viewerId}::uuid) AND (e.t <> 'mv' OR e.late OR e.nw)`),
      database.execute(sql`
      SELECT user_id, shift, date_from::text AS date_from, date_to::text AS date_to FROM public.pharmacy_duty_roster
       WHERE hospital_id = ${hospitalId}::uuid AND ended_at IS NULL
         AND date_to >= ${localDate(weekAgo)}::date AND date_from <= ${localDate(now)}::date
         AND (${all}::boolean OR user_id = ${viewerId}::uuid)`),
      extraRows(database, hospitalId, ["pharmacy_shift_handovers", "pharmacy_cases"]),
    ]);
    const events: TeamEvent[] = rowsOf<Record<string, unknown>>(ev).map((r) => ({
      userId: String(r.uid),
      who: (r.who as string | null) ?? "",
      at: iso(r.at),
      type: r.t as TeamEvent["type"],
      late: r.late === true,
      noWitness: r.nw === true,
      matched: r.matched === null || r.matched === undefined ? null : r.matched === true,
    }));
    const lines: RosterLine[] = rowsOf<Record<string, string>>(roster).map((r) => ({
      userId: r.user_id!,
      shift: r.shift as RosterLine["shift"],
      dateFrom: r.date_from!,
      dateTo: r.date_to!,
    }));
    const extras: Extras | null = extra.length
      ? {
          handovers: count(
            extra.filter((r) => r.src === "pharmacy_shift_handovers"),
            (j) => str(j.from_user_id),
          ),
          cases: new Map(
            [
              ...new Set(
                extra.filter((r) => r.src === "pharmacy_cases").map((r) => str(r.j.owner_user_id)),
              ),
            ]
              .filter((u): u is string => !!u)
              .map((u) => {
                const mine = extra.filter(
                  (r) => r.src === "pharmacy_cases" && r.j.owner_user_id === u,
                );
                const closed = mine.filter((r) => !!r.j.signed_off_at).length;
                return [u, { closed, owned: mine.length }];
              }),
          ),
        }
      : null;
    const sinceWeek = weekAgo.toISOString();
    const week = events.filter((e) => e.at >= sinceWeek);
    const rows = teamRows(
      week,
      rosterHours(lines, localDate(weekAgo), localDate(now), RULES.shiftHours),
      extras,
      { dayStarts: RULES.dayStartsHour, nightStarts: RULES.nightStartsHour },
    ).filter((r) => all || r.userId === viewerId);
    return {
      rows,
      hourly: perHourOfDay(
        events.filter((e) => e.type === "rx").map((e) => e.at),
        HOURLY_DAYS,
      ),
    };
  },
);

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
function count(
  rows: readonly { j: Record<string, unknown> }[],
  key: (j: Record<string, unknown>) => string | null,
) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r.j);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
