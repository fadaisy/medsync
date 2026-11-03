import "server-only";

import type { Exec } from "@/lib/pharmacy/audit/read";
import { cache } from "react";
import { sql } from "drizzle-orm";

import { PHARMACY_REWORK_COPY } from "@/content/pharmacy-rework";
import { overridesOn } from "@/lib/boot-guard";
import { appDb, rowsOf } from "@/lib/pharmacy/audit/read";
import { legalQ1RecordedFor } from "@/lib/pharmacy/legal";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { peopleAt } from "@/lib/pharmacy/stores/packs";

/** Set-up › Going live (PRD §6.7): each condition, met or missing, with where it is fixed. Two queries. */
export const loadLive = cache(async (hospitalId: string, database: Exec = appDb()) => {
  const [[c], legal] = await Promise.all([
    database
      .execute(
        sql`
    SELECT
      (SELECT count(*)::int FROM public.pharmacy_duty_roster r WHERE r.hospital_id = ${hospitalId}::uuid
          AND r.ended_at IS NULL AND r.date_to >= private.pharmacy_local_date()) AS roster,
      (SELECT count(*)::int FROM public.pharmacy_dispensing_points d WHERE d.hospital_id = ${hospitalId}::uuid
          AND d.live_at IS NOT NULL AND d.switched_off_at IS NULL) AS points,
      (SELECT count(*)::int FROM public.pharmacy_locations l WHERE l.hospital_id = ${hospitalId}::uuid) AS places,
      (SELECT count(*)::int FROM public.pharmacy_products p WHERE p.hospital_id = ${hospitalId}::uuid AND p.active
          AND NOT EXISTS (SELECT 1 FROM public.pharmacy_product_prices pp
                JOIN public.pharmacy_payers py ON py.id = pp.payer_id AND py.code = 'cash'
               WHERE pp.product_id = p.id AND pp.from_date <= private.pharmacy_local_date())) AS unpriced,
      (SELECT count(*)::int FROM public.pharmacy_cd_prescribers x WHERE x.hospital_id = ${hospitalId}::uuid) AS prescribers`,
      )
      .then((r) => rowsOf<Record<string, number>>(r)),
    legalQ1RecordedFor(hospitalId),
  ]);
  const overrides = overridesOn();
  const n = (k: string) => Number(c?.[k] ?? 0);
  return {
    overrides,
    items: [
      { key: "roster", met: n("roster") > 0, href: "/pharmacy/setup?tab=people" },
      { key: "legal1", met: legal, href: null },
      { key: "copy", met: PHARMACY_REWORK_COPY.status === "signed", href: null },
      { key: "overrides", met: overrides.length === 0, href: null },
      { key: "points", met: n("points") > 0, href: null },
      { key: "places", met: n("places") > 0, href: "/pharmacy/setup?tab=places" },
      { key: "prices", met: n("unpriced") === 0, href: "/pharmacy/setup?tab=medicines" },
      { key: "prescribers", met: n("prescribers") > 0, href: "/pharmacy/setup?tab=people" },
    ],
  };
});

/** Set-up › Rules: the signed sets' latest version per kind. One query. */
export const loadRules = cache(async (hospitalId: string, database: Exec = appDb()) =>
  rowsOf<{ kind: string; version: number; status: string; signed_at: string | null }>(
    await database.execute(sql`
    SELECT DISTINCT ON (kind) kind, version, status, signed_at::text AS signed_at
      FROM public.pharmacy_signed_sets WHERE hospital_id = ${hospitalId}::uuid
     ORDER BY kind, version DESC`),
  ),
);

export interface RosterRow {
  id: string;
  userId: string;
  who: string;
  place: string | null;
  role: string;
  shift: string;
  dateFrom: string;
  dateTo: string;
}

/** Set-up › People: the current and coming roster, the people and places to choose from, the CD prescribers. */
export const loadPeople = cache(async (hospitalId: string, database: Exec = appDb()) => {
  const today = localDate(new Date());
  const [roster, places, prescribers, people] = await Promise.all([
    database.execute(sql`
    SELECT r.id, r.user_id, coalesce(u.full_name, u.email) AS who, l.name AS place, r.role, r.shift,
           r.date_from::text AS date_from, r.date_to::text AS date_to
      FROM public.pharmacy_duty_roster r
      LEFT JOIN public.users u ON u.id = r.user_id
      LEFT JOIN public.pharmacy_locations l ON l.id = r.location_id
     WHERE r.hospital_id = ${hospitalId}::uuid AND r.ended_at IS NULL AND r.date_to >= ${today}::date
     ORDER BY r.date_from, who
     LIMIT 500`),
    database.execute(sql`
    SELECT id, name FROM public.pharmacy_locations
     WHERE hospital_id = ${hospitalId}::uuid AND switched_off_at IS NULL ORDER BY name`),
    database.execute(sql`
    SELECT DISTINCT ON (x.user_id) x.user_id, coalesce(u.full_name, u.email) AS who, x.department, x.cd_allowed,
           cardinality(x.only_medicines) AS only
      FROM public.pharmacy_cd_prescribers x LEFT JOIN public.users u ON u.id = x.user_id
     WHERE x.hospital_id = ${hospitalId}::uuid
     ORDER BY x.user_id, x.created_at DESC`),
    peopleAt(database as Parameters<typeof peopleAt>[0], hospitalId),
  ]);
  return {
    today,
    roster: rowsOf<Record<string, string>>(roster).map(
      (r): RosterRow => ({
        id: r.id!,
        userId: r.user_id!,
        who: r.who ?? "",
        place: r.place ?? null,
        role: r.role!,
        shift: r.shift!,
        dateFrom: r.date_from!,
        dateTo: r.date_to!,
      }),
    ),
    places: rowsOf<{ id: string; name: string }>(places),
    prescribers: rowsOf<{
      user_id: string;
      who: string | null;
      department: string | null;
      cd_allowed: boolean;
      only: number;
    }>(prescribers),
    people,
  };
});

/** Set-up › Places, fridges and immunisation: one query. */
export async function loadColdSetup(hospitalId: string, database: Exec = appDb()) {
  const [r] = rowsOf<{
    fridges: unknown;
    clinic: string | null;
    vaccines: unknown;
    products: unknown;
  }>(
    await database.execute(sql`
    SELECT
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'code', f.code, 'name', f.name, 'place', l.name,
          'sensor', f.sensor_key_hash IS NOT NULL) ORDER BY f.code), '[]')
         FROM public.pharmacy_fridges f JOIN public.pharmacy_locations l ON l.id = f.location_id
        WHERE f.hospital_id = ${hospitalId}::uuid AND f.archived_at IS NULL) AS fridges,
      (SELECT location_id FROM public.pharmacy_epi_clinics WHERE hospital_id = ${hospitalId}::uuid) AS clinic,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('vaccine', v.vaccine, 'product', p.name,
          'perVial', v.doses_per_vial) ORDER BY v.vaccine), '[]')
         FROM public.pharmacy_epi_vaccines v JOIN public.pharmacy_products p ON p.id = v.product_id
        WHERE v.hospital_id = ${hospitalId}::uuid) AS vaccines,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name), '[]')
         FROM public.pharmacy_products p WHERE p.hospital_id = ${hospitalId}::uuid AND p.active) AS products`),
  );
  return {
    fridges: (r?.fridges ?? []) as {
      id: string;
      code: string;
      name: string;
      place: string;
      sensor: boolean;
    }[],
    clinic: r?.clinic ?? null,
    vaccines: (r?.vaccines ?? []) as { vaccine: string; product: string; perVial: number }[],
    products: (r?.products ?? []) as { id: string; name: string }[],
  };
}
