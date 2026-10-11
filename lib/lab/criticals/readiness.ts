import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import { cache } from "react";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";

import { db as appDb } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { criticalContacts } from "@/db/schema/lab-safety";
import { encounters } from "@/db/schema/scheduling";
import { labCriticalsLiveFor } from "@/lib/lab/feature";

/**
 * S19 (Law 14): in production LAB_CRITICALS is refused while any live department has no level-1
 * contact (the wording half is checked in lib/lab/feature.ts, without the database). "Live" = a
 * department with an encounter in the last 30 days, the window the access rule uses.
 * Set-up stays reachable with the flag alone, so the lead can fix what this reports.
 */
export async function departmentsWithoutLevel1(
  hospitalId: string,
  now = new Date(),
  database: EmrDb = appDb as unknown as EmrDb,
) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const rows = await database
    .selectDistinct({ id: hospitalDepartments.id, name: hospitalDepartments.name })
    .from(encounters)
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, encounters.departmentId))
    .where(
      and(
        eq(encounters.hospitalId, hospitalId),
        isNotNull(encounters.departmentId),
        gte(encounters.startedAt, since),
        sql`not exists (select 1 from ${criticalContacts} c where c.department_id = ${hospitalDepartments.id} and c.level = 1)`,
      ),
    );
  return rows;
}

/** LAB_CRITICALS as every surface but set-up reads it. Once per request. */
export const criticalsLive = cache(async (hospitalId: string): Promise<boolean> => {
  if (!labCriticalsLiveFor(hospitalId)) return false;
  if (process.env.VERCEL_ENV !== "production") return true;
  return (await departmentsWithoutLevel1(hospitalId)).length === 0;
});
