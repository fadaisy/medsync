import "server-only";

import type { Vaccine } from "@/db/schema/pharmacy-rework-patients";
import type { EmrDb } from "@/lib/emr/db";
import type { TodayItem } from "@/lib/pharmacy/derive/today-types";
import type { Client, Given } from "@/lib/pharmacy/epi/derive";
import { cache } from "react";
import { sql } from "drizzle-orm";

import { fill, PRW } from "@/content/pharmacy-rework-patients";
import { epiPlan, epiStatus, vaxStock } from "@/lib/pharmacy/epi/derive";
import { dayMs } from "@/lib/pharmacy/epi/store";
import { DAY, day0 } from "@/lib/pharmacy/wards/derive";
import { q } from "@/lib/pharmacy/wards/sql";

/** Immunisation (rework PRD §6.3): the clinic's set-up, its vaccine stock, open vials and the client register. */
const appDb = async () => (await import("@/db")).db as unknown as EmrDb;

export interface VaccineSetup {
  vaccine: Vaccine;
  productId: string;
  dosesPerVial: number;
  max: number | null;
}

async function setupOf(db: EmrDb, hospitalId: string) {
  const rows = await q<{
    location_id: string;
    place: string;
    vaccine: Vaccine | null;
    product_id: string | null;
    dpv: number | null;
    max: number | null;
  }>(
    db,
    sql`SELECT c.location_id, l.name AS place, v.vaccine, v.product_id, v.doses_per_vial AS dpv, v.max_level AS max
          FROM public.pharmacy_epi_clinics c JOIN public.pharmacy_locations l ON l.id = c.location_id
          LEFT JOIN public.pharmacy_epi_vaccines v ON v.hospital_id = c.hospital_id
         WHERE c.hospital_id = ${hospitalId}::uuid ORDER BY v.vaccine`,
  );
  if (!rows[0]) return null;
  return {
    locationId: rows[0].location_id,
    place: rows[0].place,
    vaccines: rows
      .filter((r) => r.vaccine)
      .map(
        (r): VaccineSetup => ({
          vaccine: r.vaccine!,
          productId: r.product_id!,
          dosesPerVial: r.dpv!,
          max: r.max,
        }),
      ),
  };
}
type Setup = NonNullable<Awaited<ReturnType<typeof setupOf>>>;

/** Per vaccine: usable doses at the clinic, today's and the week's use, and this month's given and wasted. */
async function usableOf(db: EmrDb, s: Setup, nowMs: number) {
  if (!s.vaccines.length) return [];
  const today = new Date(day0(nowMs));
  const k = new Date(nowMs + 3 * 3_600_000);
  const month = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 3 * 3_600_000);
  const products = sql.join(
    s.vaccines.map((v) => sql`${v.productId}::uuid`),
    sql`, `,
  );
  return q<{
    product_id: string;
    usable: number;
    today: number;
    week: number;
    given_m: number;
    wasted_m: number;
    days: number[] | null;
  }>(
    db,
    sql`SELECT p.id AS product_id,
               coalesce((SELECT sum(x.n) FROM (
                  SELECT sum(m.quantity) AS n FROM public.pharmacy_batches b JOIN public.pharmacy_stock_movements m ON m.batch_id = b.id
                   WHERE b.product_id = p.id AND coalesce(b.location_id, b.dispensing_point_id) = ${s.locationId}::uuid
                     AND private.pharmacy_expires_on(b.expiry, b.expiry_month_only) >= private.pharmacy_local_date()
                     AND NOT private.pharmacy_batch_recalled(b.id)
                     AND coalesce((SELECT v.stage FROM public.pharmacy_vvm_readings v JOIN public.pharmacy_batches b2 ON b2.id = v.batch_id
                                    WHERE b2.product_id = b.product_id AND b2.batch_number = b.batch_number ORDER BY v.read_at DESC LIMIT 1), 1) < 3
                   GROUP BY b.id HAVING sum(m.quantity) > 0) x), 0)::int AS usable,
               (SELECT count(*) FROM public.pharmacy_epi_doses d JOIN public.pharmacy_batches b ON b.id = d.batch_id
                 WHERE b.product_id = p.id AND d.given_at >= ${today.toISOString()}::timestamptz)::int AS today,
               (SELECT count(*) FROM public.pharmacy_epi_doses d JOIN public.pharmacy_batches b ON b.id = d.batch_id
                 WHERE b.product_id = p.id AND d.given_at >= ${new Date(day0(nowMs) - 6 * DAY).toISOString()}::timestamptz)::int AS week,
               (SELECT count(*) FROM public.pharmacy_epi_doses d JOIN public.pharmacy_batches b ON b.id = d.batch_id
                 WHERE b.product_id = p.id AND d.given_at >= ${month.toISOString()}::timestamptz)::int AS given_m,
               coalesce((SELECT -sum(m.quantity) FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
                 WHERE b.product_id = p.id AND m.reason_code LIKE 'wastage:%' AND m.effective_at >= ${month.toISOString()}::timestamptz), 0)::int AS wasted_m,
               (SELECT array_agg(coalesce(c.n, 0) ORDER BY g.d) FROM generate_series(0, 13) g(d)
                  LEFT JOIN LATERAL (SELECT count(*)::int AS n FROM public.pharmacy_epi_doses d2 JOIN public.pharmacy_batches b3 ON b3.id = d2.batch_id
                     WHERE b3.product_id = p.id AND d2.given_at >= ${today.toISOString()}::timestamptz - (13 - g.d) * interval '1 day'
                       AND d2.given_at < ${today.toISOString()}::timestamptz - (12 - g.d) * interval '1 day') c ON true) AS days
          FROM public.pharmacy_products p WHERE p.id IN (${products})`,
  );
}

/** The stock tab: per vaccine batches at the clinic (with VVM), the cold room's stock, open vials and the month's control. */
async function stockOf(db: EmrDb, s: Setup, nowMs: number) {
  if (!s.vaccines.length) return { batches: [], cold: [], vials: [], control: [] };
  const k = new Date(nowMs + 3 * 3_600_000);
  const month = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 3 * 3_600_000);
  const products = sql.join(
    s.vaccines.map((v) => sql`${v.productId}::uuid`),
    sql`, `,
  );
  const [row] = await q<{
    batches:
      | { product: string; id: string; no: string; exp: string; n: number; vvm: number | null }[]
      | null;
    cold: { product: string; n: number }[] | null;
    vials:
      | {
          id: string;
          product: string;
          batch: string;
          opened: string;
          used: number;
          total: number;
        }[]
      | null;
    control:
      | {
          product: string;
          opening: number;
          received: number;
          given: number;
          wasted: number;
          balance: number;
        }[]
      | null;
  }>(
    db,
    sql`SELECT
          (SELECT json_agg(x ORDER BY x.exp) FROM (
             SELECT b.product_id AS product, b.id, b.batch_number AS no, b.expiry AS exp, sum(m.quantity)::int AS n,
                    (SELECT v.stage FROM public.pharmacy_vvm_readings v JOIN public.pharmacy_batches b2 ON b2.id = v.batch_id
                      WHERE b2.product_id = b.product_id AND b2.batch_number = b.batch_number ORDER BY v.read_at DESC LIMIT 1) AS vvm
               FROM public.pharmacy_batches b JOIN public.pharmacy_stock_movements m ON m.batch_id = b.id
              WHERE b.product_id IN (${products}) AND coalesce(b.location_id, b.dispensing_point_id) = ${s.locationId}::uuid
              GROUP BY b.id HAVING sum(m.quantity) > 0) x) AS batches,
          (SELECT json_agg(x) FROM (
             SELECT b.product_id AS product, sum(m.quantity)::int AS n
               FROM public.pharmacy_batches b JOIN public.pharmacy_stock_movements m ON m.batch_id = b.id
               JOIN public.pharmacy_locations l ON l.id = coalesce(m.location_id, m.dispensing_point_id)
              WHERE b.product_id IN (${products}) AND l.kind = 'store' AND l.id <> ${s.locationId}::uuid
              GROUP BY b.product_id HAVING sum(m.quantity) > 0) x) AS cold,
          (SELECT json_agg(x ORDER BY x.opened) FROM (
             SELECT o.id, b.product_id AS product, b.batch_number AS batch, o.opened_at AS opened, o.doses_per_vial AS total,
                    (SELECT count(*) FROM public.pharmacy_epi_doses d WHERE d.vial_id = o.id)::int AS used
               FROM public.pharmacy_epi_open_vials o JOIN public.pharmacy_batches b ON b.id = o.batch_id
              WHERE b.product_id IN (${products}) AND o.discarded_at IS NULL) x) AS vials,
          (SELECT json_agg(x) FROM (
             SELECT b.product_id AS product,
                    coalesce(sum(m.quantity) FILTER (WHERE m.effective_at < ${month.toISOString()}::timestamptz), 0)::int AS opening,
                    coalesce(sum(m.quantity) FILTER (WHERE m.effective_at >= ${month.toISOString()}::timestamptz AND m.quantity > 0), 0)::int AS received,
                    coalesce(-sum(m.quantity) FILTER (WHERE m.effective_at >= ${month.toISOString()}::timestamptz AND m.reason_code = 'vaccinated'), 0)::int AS given,
                    coalesce(-sum(m.quantity) FILTER (WHERE m.effective_at >= ${month.toISOString()}::timestamptz AND m.reason_code LIKE 'wastage:%'), 0)::int AS wasted,
                    coalesce(sum(m.quantity), 0)::int AS balance
               FROM public.pharmacy_batches b JOIN public.pharmacy_stock_movements m ON m.batch_id = b.id
              WHERE b.product_id IN (${products}) AND coalesce(m.location_id, m.dispensing_point_id) = ${s.locationId}::uuid
              GROUP BY b.product_id) x) AS control`,
  );
  return {
    batches: row?.batches ?? [],
    cold: row?.cold ?? [],
    vials: row?.vials ?? [],
    control: row?.control ?? [],
  };
}

export interface ClientRow {
  c: Client & {
    name: string;
    sex: "F" | "M";
    cardNo: string;
    carer: string;
    village: string | null;
    note: string | null;
  };
  given: Record<string, Given & { site: string; aefi: string }>;
  appt: number | null;
}

async function clientsOf(db: EmrDb, hospitalId: string): Promise<ClientRow[]> {
  const rows = await q<{
    id: string;
    kind: Client["kind"];
    name: string;
    sex: "F" | "M";
    dob: string;
    card_no: string;
    carer: string;
    village: string | null;
    note: string | null;
    appt: string | null;
    doses: { lab: string; at: string; batch: string; site: string; aefi: string }[] | null;
  }>(
    db,
    sql`SELECT c.id, c.kind, c.name, c.sex, c.dob::text AS dob, c.card_no, c.carer, c.village, c.note,
               (SELECT a.come_back_on::text FROM public.pharmacy_epi_appointments a WHERE a.client_id = c.id ORDER BY a.set_at DESC LIMIT 1) AS appt,
               (SELECT json_agg(json_build_object('lab', d.antigen, 'at', d.given_at, 'batch', d.batch_id, 'site', d.site, 'aefi', d.aefi))
                  FROM public.pharmacy_epi_doses d WHERE d.client_id = c.id) AS doses
          FROM public.pharmacy_epi_clients c WHERE c.hospital_id = ${hospitalId}::uuid ORDER BY c.name`,
  );
  return rows.map((r) => ({
    c: {
      id: r.id,
      kind: r.kind,
      dob: dayMs(r.dob),
      name: r.name,
      sex: r.sex,
      cardNo: r.card_no,
      carer: r.carer,
      village: r.village,
      note: r.note,
    },
    given: Object.fromEntries(
      (r.doses ?? []).map((d) => [
        d.lab,
        { at: Date.parse(d.at), batchId: d.batch, site: d.site, aefi: d.aefi },
      ]),
    ),
    appt: r.appt ? dayMs(r.appt) : null,
  }));
}

export const immunisationData = cache(
  async (hospitalId: string, tab: string, nowMs: number, database?: EmrDb) => {
    const db = database ?? (await appDb());
    const setup = await setupOf(db, hospitalId);
    if (!setup) return { setup: null } as const;
    if (tab === "cold") return { setup, tab } as const;
    if (tab === "stock") {
      const [usable, stock] = await Promise.all([
        usableOf(db, setup, nowMs),
        stockOf(db, setup, nowMs),
      ]);
      return { setup, tab, usable, ...stock } as const;
    }
    const [usable, clients] = await Promise.all([
      usableOf(db, setup, nowMs),
      clientsOf(db, hospitalId),
    ]);
    return { setup, tab: "register" as const, usable, clients };
  },
);
export type ImmunisationData = Awaited<ReturnType<typeof immunisationData>>;

/** Today, kind `vax`: children due today, defaulters to trace, vaccines to refill from the cold room. */
export async function vaxTodayItems(
  hospitalId: string,
  now = new Date(),
  database?: EmrDb,
): Promise<TodayItem[]> {
  const db = database ?? (await appDb());
  const setup = await setupOf(db, hospitalId);
  if (!setup) return [];
  const t = now.getTime();
  const [usable, clients] = await Promise.all([usableOf(db, setup, t), clientsOf(db, hospitalId)]);
  const st = clients.map((c) => epiStatus(epiPlan(c.c, c.given, t), c.appt));
  const due = st.filter((s) => s.k === "due").length;
  const defaulters = st.filter((s) => s.k === "overdue").length;
  const refill = setup.vaccines.filter((v) => {
    const u = usable.find((x) => x.product_id === v.productId);
    return (
      vaxStock({
        vaccine: v.vaccine,
        at: u?.usable ?? 0,
        cold: 0,
        max: v.max,
        todayUsed: u?.today ?? 0,
        week: u?.week ?? 0,
        perDay: (u?.days ?? []).reduce((a, b) => a + b, 0) / 14,
      }).k === "refill"
    );
  }).length;
  const base = "/pharmacy/patients/immunisation";
  const out: TodayItem[] = [];
  if (due)
    out.push({
      kind: "vax",
      key: "vax:due",
      title: fill(PRW.today.vaxDue, { n: due }),
      meta: "",
      action: PRW.today.vaxOpen,
      href: `${base}?tab=clinic`,
    });
  if (defaulters)
    out.push({
      kind: "vax",
      key: "vax:defaulters",
      title: fill(PRW.today.vaxDefaulters, { n: defaulters }),
      meta: "",
      action: PRW.today.vaxOpen,
      href: `${base}?tab=defaulters`,
      late: true,
    });
  if (refill)
    out.push({
      kind: "vax",
      key: "vax:refill",
      title: fill(PRW.today.vaxRefill, { n: refill }),
      meta: "",
      action: PRW.today.vaxStock,
      href: `${base}?tab=stock`,
    });
  return out;
}
