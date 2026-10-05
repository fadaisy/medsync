/**
 * Sidebar counts as single SQL statements, so a navigation never loads the whole registry. They
 * mirror the list rules (recall: a pending appointment passed with no visit since, not removed, seen
 * within 12 months); the lists themselves are computed by the engine.
 */
import "server-only";

import type { NcdContext } from "../context";
import { sql } from "drizzle-orm";

import { can } from "../context";
import { rows, withNcd } from "../db";

export type SidebarCounts = { today: number; patients: number; recall: number; queries: number };

export async function sidebarCounts(ctx: NcdContext): Promise<SidebarCounts> {
  const zero = { today: 0, patients: 0, recall: 0, queries: 0 };
  if (!can(ctx, "person_search", "recall_work", "data_quality")) return zero;
  return withNcd(
    ctx,
    "app",
    async (tx) => {
      const [r] = await rows<SidebarCounts>(
        tx,
        sql`SELECT
          (SELECT count(DISTINCT person_id)::int FROM (
             SELECT person_id FROM public.ncd_appointment WHERE appointment_date = ${ctx.today} AND status IN ('pending','attended')
             UNION SELECT person_id FROM public.ncd_visit WHERE visit_date = ${ctx.today} AND NOT is_invalid AND NOT is_historical) t) AS today,
          (SELECT count(*)::int FROM public.ncd_person WHERE merged_into_id IS NULL) AS patients,
          (SELECT count(*)::int FROM public.ncd_appointment a JOIN public.ncd_person p ON p.id = a.person_id
             WHERE a.status = 'pending' AND a.appointment_date < ${ctx.today} AND p.recall_removed_at IS NULL AND p.merged_into_id IS NULL
               AND NOT EXISTS (SELECT 1 FROM public.ncd_visit v WHERE v.person_id = a.person_id AND v.status = 'closed'
                               AND NOT v.is_invalid AND v.visit_date >= a.appointment_date)
               AND EXISTS (SELECT 1 FROM public.ncd_visit v WHERE v.person_id = a.person_id AND v.status = 'closed'
                           AND v.visit_date > (${ctx.today}::date - 365))) AS recall,
          (SELECT count(*)::int FROM public.ncd_query WHERE status = 'open') AS queries`,
      );
      return r ?? zero;
    },
    ctx.db,
  ).catch(() => zero);
}
