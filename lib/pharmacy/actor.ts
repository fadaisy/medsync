import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import type { PharmacyActor, PharmacyPoint } from "@/lib/pharmacy/write";
import { cookies } from "next/headers";

import { db } from "@/db";
import { pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import { actingPoint, pharmacyPointsFor } from "@/lib/pharmacy/points";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";

/** The cookie that remembers the acting point; re-checked against the person's points every time. */
export const POINT_COOKIE = "ms-pharmacy-point";

/** The signed-in pharmacy professional as a writer (and reader) of Phase 1 records. */
export async function requirePharmacyActor(): Promise<PharmacyActor & { points: PharmacyPoint[] }> {
  const scope = await requirePharmacyScope();
  const points = await pharmacyPointsFor(db as unknown as EmrDb, scope.userId, scope.hospitalId);
  const chosen = (await cookies()).get(POINT_COOKIE)?.value;
  const point = actingPoint(points, chosen);
  return {
    userId: scope.userId,
    hospitalId: scope.hospitalId,
    cadreCode: scope.cadreCode,
    cadreName: scope.cadreName,
    pointId: point?.id ?? null,
    access: pharmacyDispensingAccess(scope.cadreCode),
    points,
  };
}
