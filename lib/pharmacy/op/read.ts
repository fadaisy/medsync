import "server-only";

import type { CheckInStatus } from "@/db/schema/pharmacy-rework-patients";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { TodayItem } from "@/lib/pharmacy/derive/today-types";
import type { CheckIn, Refill } from "@/lib/pharmacy/op/derive";
import { cache } from "react";
import { sql } from "drizzle-orm";

import { fill, PRW, RULES } from "@/content/pharmacy-rework-patients";
import { identitiesFor } from "@/lib/emr/read/results";
import { entriesInForce } from "@/lib/pharmacy/clinical/read";
import { opCourse, opRefill } from "@/lib/pharmacy/op/derive";
import { courseDays, DAY } from "@/lib/pharmacy/wards/derive";
import { q } from "@/lib/pharmacy/wards/sql";

/** Outpatients (rework PRD §6.3): chronic refills (lines with repeats) and antibiotic courses (the signed AWaRe list). */
const appDb = async () => (await import("@/db")).db as unknown as EmrDb;

export interface RefillRow {
  rxId: string;
  patientId: string;
  med: string;
  daily: number;
  hist: Refill[];
  /** A pill count recorded since the last hand-over (the refill itself is handed over in Dispense). */
  pending: number | null | undefined;
}

/** Lines with a repeat authorisation and at least one supply, the supplies in order and the pill counts. */
export async function refillRows(db: EmrDb | EmrTx, hospitalId: string): Promise<RefillRow[]> {
  const rows = await q<{
    id: string;
    patient: string;
    med: string;
    frequency: string | null;
    sup: { at: string; qty: number; days: number | null }[];
    counts: { at: string; back: number | null }[] | null;
  }>(
    db,
    sql`SELECT p.id, p.patient_user_id AS patient, p.drug_name AS med, p.frequency,
               (SELECT json_agg(json_build_object('at', s.supplied_at, 'qty', s.quantity, 'days', s.days_covered) ORDER BY s.supplied_at)
                  FROM public.pharmacy_supplies s
                 WHERE s.prescription_id = p.id
                   AND NOT EXISTS (SELECT 1 FROM public.pharmacy_supply_reversals r WHERE r.supply_id = s.id)) AS sup,
               (SELECT json_agg(json_build_object('at', c.counted_at, 'back', c.brought_back) ORDER BY c.counted_at)
                  FROM public.pharmacy_op_pill_counts c WHERE c.prescription_id = p.id) AS counts
          FROM public.prescription_repeat_authorisations a
          JOIN public.prescriptions p ON p.id = a.prescription_id
         WHERE a.hospital_id = ${hospitalId}::uuid AND a.not_after >= (now() AT TIME ZONE 'Africa/Kampala')::date - 30
           AND EXISTS (SELECT 1 FROM public.pharmacy_supplies s WHERE s.prescription_id = p.id)`,
  );
  return rows
    .filter((r) => r.sup?.length)
    .map((r) => {
      const sup = r.sup.map((s) => ({ ...s, at: Date.parse(s.at) }));
      const counts = (r.counts ?? []).map((c) => ({ at: Date.parse(c.at), back: c.back }));
      const last = sup.at(-1)!;
      const daily = last.days
        ? last.qty / last.days
        : RULES.doseHours[r.frequency ?? ""]?.length || 1;
      // The count taken at a visit belongs to the hand-over that followed it.
      const hist = sup.map((s, i) => ({
        at: s.at,
        qty: s.qty,
        back: i
          ? (counts.filter((c) => c.at > sup[i - 1]!.at && c.at <= s.at).at(-1)?.back ?? null)
          : null,
      }));
      const after = counts.filter((c) => c.at > last.at).at(-1);
      return {
        rxId: r.id,
        patientId: r.patient,
        med: r.med,
        daily,
        hist,
        pending: after ? after.back : undefined,
      };
    });
}

export interface CourseRow {
  rxId: string;
  patientId: string;
  med: string;
  start: number;
  days: number;
  checks: CheckIn[];
}

/** Antibiotic courses handed over in the last 30 days (a medicine in the signed AWaRe pack), with check-ins. */
export async function courseRows(
  db: EmrDb | EmrTx,
  hospitalId: string,
): Promise<CourseRow[] | null> {
  const aware = await entriesInForce(db, hospitalId, "aware_pack");
  const tags = (aware[0]?.payload as { tags?: Record<string, string> } | undefined)?.tags ?? {};
  const ids = [...new Set(Object.keys(tags).map((k) => k.split(":")[0]!))];
  if (!ids.length) return null;
  const rows = await q<{
    id: string;
    patient: string;
    med: string;
    duration: string | null;
    at: string;
    days: number | null;
    checks: { at: string; status: CheckInStatus; missed: number }[] | null;
  }>(
    db,
    sql`SELECT p.id, p.patient_user_id AS patient, p.drug_name AS med, p.duration, min(s.supplied_at) AS at, max(s.days_covered) AS days,
               (SELECT json_agg(json_build_object('at', c.checked_at, 'status', c.status, 'missed', c.missed) ORDER BY c.checked_at)
                  FROM public.pharmacy_op_checkins c WHERE c.prescription_id = p.id) AS checks
          FROM public.pharmacy_supplies s JOIN public.prescriptions p ON p.id = s.prescription_id
         WHERE s.hospital_id = ${hospitalId}::uuid AND s.supplied_at > now() - interval '30 days'
           AND p.drug_id IN (${sql.join(
             ids.map((i) => sql`${i}`),
             sql`, `,
           )})
           AND NOT EXISTS (SELECT 1 FROM public.pharmacy_supply_reversals r WHERE r.supply_id = s.id)
         GROUP BY p.id ORDER BY min(s.supplied_at) DESC`,
  );
  return rows.flatMap((r) => {
    const days = courseDays(r.duration) ?? r.days;
    return days
      ? [
          {
            rxId: r.id,
            patientId: r.patient,
            med: r.med,
            start: Date.parse(r.at),
            days,
            checks: (r.checks ?? []).map((c) => ({
              at: Date.parse(c.at),
              status: c.status,
              missed: c.missed,
            })),
          },
        ]
      : [];
  });
}

export const outpatientsData = cache(
  async (viewer: { userId: string; hospitalId: string }, tab: string, database?: EmrDb) => {
    const db = database ?? (await appDb());
    if (tab === "courses") {
      const courses = await courseRows(db, viewer.hospitalId);
      const ids = await identitiesFor(
        viewer,
        (courses ?? []).map((c) => c.patientId),
        "pharmacy_outpatients",
        database,
      );
      return { tab: "courses" as const, courses, ids };
    }
    const refills = await refillRows(db, viewer.hospitalId);
    const ids = await identitiesFor(
      viewer,
      refills.map((r) => r.patientId),
      "pharmacy_outpatients",
      database,
    );
    return { tab: "refills" as const, refills, ids };
  },
);

/** Today, kind `op`: run-out refills, refills due today or tomorrow, courses due a check-in. Counts only. */
export async function opTodayItems(
  hospitalId: string,
  now = new Date(),
  database?: EmrDb,
): Promise<TodayItem[]> {
  const db = database ?? (await appDb());
  const t = now.getTime();
  const [refills, courses] = await Promise.all([
    refillRows(db, hospitalId),
    courseRows(db, hospitalId),
  ]);
  const st = refills.map((r) => opRefill(r.hist, r.daily, t));
  const overdue = st.filter((s) => s.k === "overdue").length;
  const due = st.filter((s) => s.k !== "overdue" && s.runOut - t <= 2 * DAY).length;
  const check = (courses ?? []).filter(
    (c) => opCourse(c.start, c.days, c.checks, t).needCheck,
  ).length;
  const href = "/pharmacy/patients/outpatients";
  const out: TodayItem[] = [];
  if (overdue)
    out.push({
      kind: "op",
      key: "op:overdue",
      title: fill(PRW.today.opOverdue, { n: overdue }),
      meta: "",
      action: PRW.today.opReview,
      href,
      late: true,
    });
  if (due)
    out.push({
      kind: "op",
      key: "op:due",
      title: fill(PRW.today.opDue, { n: due }),
      meta: "",
      action: PRW.today.opReview,
      href,
    });
  if (check)
    out.push({
      kind: "op",
      key: "op:courses",
      title: fill(PRW.today.opCourses, { n: check }),
      meta: "",
      action: PRW.today.opCheck,
      href: `${href}?tab=courses`,
    });
  return out;
}
