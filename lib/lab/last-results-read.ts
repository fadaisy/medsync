import "server-only";

import type { EmrTx } from "@/lib/emr/db";
import { and, asc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";

import { clinicalObservations, diagnosticReports } from "@/db/schema";

/**
 * Last results (Lab Workspace v2 prompt 5.5): the main component's released values for this patient in the last
 * 30 days, oldest first, for the small trend beside Before release. Read only, under the caller's clinical
 * reader. Current released versions only (a superseded value is not shown); this order's own report excluded.
 */
export async function lastResults(
  tx: EmrTx,
  o: { hospitalId: string; patientUserId: string; conceptId: string; orderId: string; now: Date },
): Promise<{ at: Date; value: number; unit: string | null }[]> {
  const from = new Date(o.now.getTime() - 30 * 86_400_000);
  const rows = await tx
    .select({
      at: clinicalObservations.effectiveAt,
      value: clinicalObservations.valueNum,
      unit: clinicalObservations.valueUnit,
    })
    .from(clinicalObservations)
    .innerJoin(diagnosticReports, eq(diagnosticReports.id, clinicalObservations.reportId))
    .where(
      and(
        eq(clinicalObservations.hospitalId, o.hospitalId),
        eq(clinicalObservations.patientUserId, o.patientUserId),
        eq(clinicalObservations.conceptId, o.conceptId),
        isNotNull(clinicalObservations.valueNum),
        gte(clinicalObservations.effectiveAt, from),
        ne(diagnosticReports.orderId, o.orderId),
        inArray(diagnosticReports.status, ["final", "amended", "corrected"]),
        sql`not exists (select 1 from ${diagnosticReports} n where n.supersedes_id = ${diagnosticReports.id})`,
      ),
    )
    .orderBy(asc(clinicalObservations.effectiveAt))
    .limit(30);
  return rows.flatMap((r) =>
    r.at && r.value !== null ? [{ at: r.at, value: Number(r.value), unit: r.unit }] : [],
  );
}
