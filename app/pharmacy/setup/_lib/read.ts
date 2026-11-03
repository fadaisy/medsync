import "server-only";

import type { Exec } from "@/lib/pharmacy/audit/read";
import { cache } from "react";
import { sql } from "drizzle-orm";

import { appDb, rowsOf } from "@/lib/pharmacy/audit/read";
import { peopleAt } from "@/lib/pharmacy/stores/packs";

/** Set-up › People: the CD prescribers (§15) and the hospital's staff, for "Add a person". */
export const loadPeople = cache(async (hospitalId: string, database: Exec = appDb()) => {
  const [prescribers, staff] = await Promise.all([
    database.execute(sql`
    SELECT DISTINCT ON (x.user_id) x.user_id, coalesce(u.full_name, u.email) AS who, x.department, x.cd_allowed,
           cardinality(x.only_medicines) AS only
      FROM public.pharmacy_cd_prescribers x LEFT JOIN public.users u ON u.id = x.user_id
     WHERE x.hospital_id = ${hospitalId}::uuid
     ORDER BY x.user_id, x.created_at DESC`),
    peopleAt(database as Parameters<typeof peopleAt>[0], hospitalId),
  ]);
  return {
    prescribers: rowsOf<{
      user_id: string;
      who: string | null;
      department: string | null;
      cd_allowed: boolean;
      only: number;
    }>(prescribers).map((r) => ({
      userId: r.user_id,
      who: r.who,
      department: r.department,
      cdAllowed: r.cd_allowed,
      only: Number(r.only),
    })),
    staff: staff.map((s) => ({ userId: s.userId, name: s.label })),
  };
});

/** Set-up › Places, the immunisation clinic and its vaccines: one query. */
export async function loadColdSetup(hospitalId: string, database: Exec = appDb()) {
  const [r] = rowsOf<{
    clinic: string | null;
    vaccines: unknown;
    products: unknown;
  }>(
    await database.execute(sql`
    SELECT
      (SELECT location_id FROM public.pharmacy_epi_clinics WHERE hospital_id = ${hospitalId}::uuid) AS clinic,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('vaccine', v.vaccine, 'product', p.name,
          'perVial', v.doses_per_vial) ORDER BY v.vaccine), '[]')
         FROM public.pharmacy_epi_vaccines v JOIN public.pharmacy_products p ON p.id = v.product_id
        WHERE v.hospital_id = ${hospitalId}::uuid) AS vaccines,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) ORDER BY p.name), '[]')
         FROM public.pharmacy_products p WHERE p.hospital_id = ${hospitalId}::uuid AND p.active) AS products`),
  );
  return {
    clinic: r?.clinic ?? null,
    vaccines: (r?.vaccines ?? []) as { vaccine: string; product: string; perVial: number }[],
    products: (r?.products ?? []) as { id: string; name: string }[],
  };
}
