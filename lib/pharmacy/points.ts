import type { EmrDb } from "@/lib/emr/db";
import type { PharmacyPoint } from "@/lib/pharmacy/write";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { pharmacyDispensingPoints } from "@/db/schema/pharmacy";
import { cadres } from "@/db/schema/reference-data";
import { PHARMACY_MAP_CADRES } from "@/lib/pharmacy/access";

/**
 * The dispensing points a pharmacy professional may act at (D-PH1-45, PA2-4): every point of the
 * hospital for an affiliation on the Pharmacy department itself; the point for an affiliation on a
 * point's unit. In the hub's order (by name). One round trip.
 */
const parent = alias(hospitalDepartments, "parent_department");

export async function pharmacyPointsFor(
  database: EmrDb,
  userId: string,
  hospitalId: string,
): Promise<PharmacyPoint[]> {
  const affs = await database
    .select({
      departmentId: staffAffiliations.departmentId,
      code: hospitalDepartments.catalogueCode,
    })
    .from(staffAffiliations)
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, staffAffiliations.departmentId))
    .where(
      and(
        eq(staffAffiliations.userId, userId),
        eq(staffAffiliations.hospitalId, hospitalId),
        inArray(staffAffiliations.state, ["active", "approved"]),
        inArray(cadres.code, [...PHARMACY_MAP_CADRES]),
      ),
    );
  const wholePharmacy = affs.some((a) => a.code === "PHARMACY");
  const own = affs.map((a) => a.departmentId).filter((d): d is string => !!d);
  const rows = await database
    .select({
      id: pharmacyDispensingPoints.departmentId,
      hospitalId: pharmacyDispensingPoints.hospitalId,
      name: hospitalDepartments.name,
      serves: pharmacyDispensingPoints.serves,
      liveAt: pharmacyDispensingPoints.liveAt,
      switchedOffAt: pharmacyDispensingPoints.switchedOffAt,
      labelMode: pharmacyDispensingPoints.labelMode,
      countFreshnessDays: pharmacyDispensingPoints.countFreshnessDays,
      phone: pharmacyDispensingPoints.phone,
      parentCode: parent.catalogueCode,
    })
    .from(pharmacyDispensingPoints)
    .innerJoin(
      hospitalDepartments,
      eq(hospitalDepartments.id, pharmacyDispensingPoints.departmentId),
    )
    .leftJoin(parent, eq(parent.id, hospitalDepartments.parentId))
    .where(
      and(
        eq(pharmacyDispensingPoints.hospitalId, hospitalId),
        isNull(hospitalDepartments.archivedAt),
      ),
    )
    .orderBy(asc(hospitalDepartments.name));
  return rows
    .filter((r) => r.parentCode === "PHARMACY" && (wholePharmacy || own.includes(r.id)))
    .map(({ parentCode: _, ...p }) => p as PharmacyPoint);
}

/** The acting point: the one chosen if the person may still act there, else the first (D-PH1-45). */
export function actingPoint(points: readonly PharmacyPoint[], chosen: string | undefined) {
  return points.find((p) => p.id === chosen) ?? points[0] ?? null;
}
