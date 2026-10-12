import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import { cache } from "react";
import { and, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";

import { db as appDb } from "@/db";
import { testCatalogue } from "@/db/schema/emr";
import { encounterOrders } from "@/db/schema/encounter";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { criticalContacts, labComponentMeasures } from "@/db/schema/lab-safety";
import { encounters } from "@/db/schema/scheduling";
import { conceptDef } from "@/lib/facts/project/shared";
import { labCriticalsLiveFor, labUnitsRangesLiveFor } from "@/lib/lab/feature";

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

/**
 * S29 (Law 14): in production LAB_UNITS_RANGES is refused while a test in use here lacks a unit on
 * any numeric component. "In use" = a laboratory test ordered in-house at this hospital in the last
 * 90 days (the hub's offerings carry LOINC codes, the catalogue does not, so orders are the link).
 */
export async function testsWithoutUnit(
  hospitalId: string,
  now = new Date(),
  database: EmrDb = appDb as unknown as EmrDb,
) {
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const used = await database
    .selectDistinct({
      id: testCatalogue.id,
      display: testCatalogue.display,
      components: testCatalogue.components,
    })
    .from(encounterOrders)
    .innerJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
    .where(
      and(
        eq(encounterOrders.hospitalId, hospitalId),
        eq(encounterOrders.kind, "lab"),
        eq(encounterOrders.performer, "in_house"),
        gte(encounterOrders.createdAt, since),
      ),
    );
  if (used.length === 0) return [];
  const measures = await database
    .select({
      testId: labComponentMeasures.testId,
      conceptId: labComponentMeasures.conceptId,
      unit: labComponentMeasures.unitUcum,
    })
    .from(labComponentMeasures)
    .where(
      and(
        eq(labComponentMeasures.hospitalId, hospitalId),
        isNull(labComponentMeasures.supersededBy),
      ),
    );
  const has = new Set(measures.filter((m) => m.unit).map((m) => `${m.testId}|${m.conceptId}`));
  return used.filter((t) =>
    (t.components ?? []).some(
      (c) => conceptDef(c)?.valueType === "quantity" && !has.has(`${t.id}|${c}`),
    ),
  );
}

/** LAB_UNITS_RANGES as the write path and the entry screen read it. Once per request. */
export const unitsRangesLive = cache(async (hospitalId: string): Promise<boolean> => {
  if (!labUnitsRangesLiveFor(hospitalId)) return false;
  if (process.env.VERCEL_ENV !== "production") return true;
  return (await testsWithoutUnit(hospitalId)).length === 0;
});
