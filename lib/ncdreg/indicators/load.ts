/**
 * Loads a facility's dataset for the indicator engine in one transaction under
 * medsync_ncd_analytics (no identifier column is granted to it: an accidental `SELECT *` fails).
 */
import "server-only";

import type { NcdContext } from "../context";
import type { Dataset, DPerson, DVisit } from "./dataset";
import { sql } from "drizzle-orm";

import { rows, withNcd } from "../db";

type Row = Record<string, unknown>;
const d = (x: unknown) =>
  x == null ? null : x instanceof Date ? x.toISOString().slice(0, 10) : String(x).slice(0, 10);
const n = (x: unknown) => (x == null ? null : Number(x));

/** The whole facility, or only `personIds` (a record or a list page). */
export async function loadDataset(
  ctx: NcdContext,
  personIds?: readonly string[],
): Promise<Dataset> {
  return withNcd(
    ctx,
    "analytics",
    async (tx) => {
      const tz = ctx.timeZone;
      const ids = personIds
        ? sql`ARRAY[${sql.join(
            personIds.map((i) => sql`${i}::uuid`),
            sql`, `,
          )}]::uuid[]`
        : null;
      const only = (col = "person_id") => (ids ? sql`AND ${sql.raw(col)} = ANY(${ids})` : sql``);
      if (personIds && !personIds.length)
        return { facilityId: ctx.facilityId, timeZone: tz, persons: [] };
      const local = (col: string) =>
        sql.raw(`to_char(${col} AT TIME ZONE '${tz.replace(/'/g, "")}', 'YYYY-MM-DD')`);
      const [persons, regs, visits, obs, reviews, events, appts, calls] = await Promise.all([
        rows<Row>(
          tx,
          sql`SELECT id, sex, birth_year, is_synthetic, district_name, known_cvd, has_valid_phone,
                                 to_char(recall_removed_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS recall_removed
                            FROM public.ncd_person WHERE merged_into_id IS NULL ${only("id")} ORDER BY id`,
        ),
        rows<Row>(
          tx,
          sql`SELECT id, person_id, condition_code, registration_date FROM public.ncd_registration WHERE superseded_by_id IS NULL ${only()} ORDER BY registration_date, id`,
        ),
        rows<Row>(
          tx,
          sql`SELECT id, person_id, visit_date, visit_type, status, is_invalid, is_historical,
                     ${local("coalesce(closed_at, entered_at)")} AS entered_date,
                     visit_systolic, visit_diastolic, glucose_mmol, glucose_type, hba1c_percent, hba1c_result_date, weight_kg,
                     medicines, medicines_confirmed_unchanged, missed_doses, medicines_obtained, not_obtained_reason,
                     next_appointment_date, disposition
                FROM public.ncd_visit WHERE true ${only()} ORDER BY visit_date, coalesce(closed_at, entered_at), id`,
        ),
        rows<Row>(
          tx,
          sql`SELECT visit_id, registration_id, value_text FROM public.ncd_observation WHERE code = 'recorded_control' ${only()} ORDER BY visit_id, registration_id`,
        ),
        rows<Row>(
          tx,
          sql`SELECT person_id, component, review_date, data, derived FROM public.ncd_review WHERE NOT is_invalid ${only()} ORDER BY review_date, entered_at, id`,
        ),
        rows<Row>(
          tx,
          sql`SELECT person_id, event_type, event_date, admission_reason FROM public.ncd_event WHERE NOT is_invalid ${only()} ORDER BY event_date, entered_at, id`,
        ),
        rows<Row>(
          tx,
          sql`SELECT id, person_id, appointment_date, status, status_reason,
                     ${local("entered_at")} AS created_date, ${local("updated_at")} AS updated_date
                FROM public.ncd_appointment WHERE true ${only()} ORDER BY entered_at, id`,
        ),
        rows<Row>(
          tx,
          sql`SELECT person_id, call_date, outcome FROM public.ncd_call WHERE true ${only()} ORDER BY call_date, entered_at, id`,
        ),
      ]);
      const by = <T>(xs: Row[], key: string, map: (r: Row) => T) => {
        const m = new Map<string, T[]>();
        for (const r of xs) {
          const k = String(r[key]);
          (m.get(k) ?? m.set(k, []).get(k)!).push(map(r));
        }
        return m;
      };
      const rc = new Map<string, Record<string, string>>();
      for (const o of obs) {
        const m = rc.get(String(o.visit_id)) ?? {};
        m[String(o.registration_id)] = String(o.value_text);
        rc.set(String(o.visit_id), m);
      }
      const vByP = by<DVisit>(visits, "person_id", (v) => ({
        id: String(v.id),
        date: d(v.visit_date)!,
        type: String(v.visit_type),
        closed: v.status === "closed",
        invalid: !!v.is_invalid,
        historical: !!v.is_historical,
        enteredDate: String(v.entered_date),
        bp: v.visit_systolic == null ? null : [Number(v.visit_systolic), Number(v.visit_diastolic)],
        glucose:
          v.glucose_mmol == null
            ? null
            : { value: Number(v.glucose_mmol), type: v.glucose_type as "fasting" },
        hba1c:
          v.hba1c_percent == null
            ? null
            : {
                percent: Number(v.hba1c_percent),
                resultDate: d(v.hba1c_result_date) ?? d(v.visit_date)!,
              },
        weightKg: n(v.weight_kg),
        medicines: (v.medicines as string[] | null) ?? [],
        medicinesRecorded:
          ((v.medicines as string[] | null) ?? []).length > 0 ||
          v.medicines_confirmed_unchanged != null,
        missedDoses: (v.missed_doses as string | null) ?? null,
        medicinesObtained: (v.medicines_obtained as string | null) ?? null,
        notObtainedReason: (v.not_obtained_reason as string | null) ?? null,
        nextAppointment: d(v.next_appointment_date),
        disposition: (v.disposition as string | null) ?? null,
        recordedControl: rc.get(String(v.id)) ?? {},
      }));
      const rByP = by(regs, "person_id", (r) => ({
        id: String(r.id),
        condition: String(r.condition_code),
        date: d(r.registration_date)!,
      }));
      const revByP = by(reviews, "person_id", (r) => ({
        component: String(r.component),
        date: d(r.review_date)!,
        data: (r.data as Record<string, unknown>) ?? {},
        derived: (r.derived as Record<string, unknown>) ?? {},
      }));
      const eByP = by(events, "person_id", (e) => ({
        type: String(e.event_type),
        date: d(e.event_date)!,
        admissionReason: (e.admission_reason as string | null) ?? null,
      }));
      const aByP = by(appts, "person_id", (a) => ({
        id: String(a.id),
        date: d(a.appointment_date)!,
        createdDate: String(a.created_date),
        status: String(a.status),
        updatedDate: String(a.updated_date),
        reason: (a.status_reason as string | null) ?? null,
      }));
      const cByP = by(calls, "person_id", (c) => ({
        date: d(c.call_date)!,
        outcome: String(c.outcome),
      }));
      const out: DPerson[] = persons.map((p) => {
        const id = String(p.id);
        return {
          id,
          sex: p.sex as "female" | "male",
          birthYear: Number(p.birth_year),
          isSynthetic: !!p.is_synthetic,
          district: (p.district_name as string | null) ?? null,
          knownCvd: (p.known_cvd as string[] | null) ?? [],
          hasValidPhone: !!p.has_valid_phone,
          recallRemovedAt: (p.recall_removed as string | null) ?? null,
          registrations: rByP.get(id) ?? [],
          visits: vByP.get(id) ?? [],
          reviews: revByP.get(id) ?? [],
          events: eByP.get(id) ?? [],
          appointments: aByP.get(id) ?? [],
          calls: cByP.get(id) ?? [],
        };
      });
      return { facilityId: ctx.facilityId, timeZone: tz, persons: out };
    },
    ctx.db,
  );
}
