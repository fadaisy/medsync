import "server-only";

import type { DispensingServes } from "@/db/schema/pharmacy";
import type { EmrDb } from "@/lib/emr/db";
import { and, eq, isNull } from "drizzle-orm";

import { db as appDb } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { pharmacyDispensingPoints } from "@/db/schema/pharmacy";

/**
 * Dispensing points (Pharmacy Phase 0, DP-1..DP-4, ADR 0236). A point is a unit of the Pharmacy
 * department with what it serves; the hub writes it (ha-services-hub `set_dispensing_point`), this
 * reads it. One round trip each.
 */
const defaultDb = () => appDb as unknown as EmrDb;

/** unit id → what it serves, for the hub's Pharmacy panel. */
export async function loadDispensingServes(
  hospitalId: string,
  database: EmrDb = defaultDb(),
): Promise<Record<string, DispensingServes>> {
  const rows = await database
    .select({ id: pharmacyDispensingPoints.departmentId, serves: pharmacyDispensingPoints.serves })
    .from(pharmacyDispensingPoints)
    .where(eq(pharmacyDispensingPoints.hospitalId, hospitalId));
  return Object.fromEntries(rows.map((r) => [r.id, r.serves]));
}

/** The points' hub hours and archive state, for the derived capability values (DP-2). */
export async function loadPointsForCapability(hospitalId: string, database: EmrDb = defaultDb()) {
  const rows = await database
    .select({
      serviceHours: hospitalDepartments.serviceHours,
      archivedAt: hospitalDepartments.archivedAt,
    })
    .from(pharmacyDispensingPoints)
    .innerJoin(
      hospitalDepartments,
      eq(hospitalDepartments.id, pharmacyDispensingPoints.departmentId),
    )
    .where(eq(pharmacyDispensingPoints.hospitalId, hospitalId));
  return rows.map((r) => ({ serviceHours: r.serviceHours, archived: r.archivedAt !== null }));
}

/** DP-4: what the viewer's own unit serves, if it is a live dispensing point. */
export async function servesOf(
  hospitalId: string,
  departmentId: string,
  database: EmrDb = defaultDb(),
): Promise<DispensingServes | null> {
  const [row] = await database
    .select({ serves: pharmacyDispensingPoints.serves })
    .from(pharmacyDispensingPoints)
    .innerJoin(
      hospitalDepartments,
      eq(hospitalDepartments.id, pharmacyDispensingPoints.departmentId),
    )
    .where(
      and(
        eq(pharmacyDispensingPoints.hospitalId, hospitalId),
        eq(pharmacyDispensingPoints.departmentId, departmentId),
        isNull(hospitalDepartments.archivedAt),
      ),
    )
    .limit(1);
  return row?.serves ?? null;
}
