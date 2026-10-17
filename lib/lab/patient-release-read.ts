import "server-only";

import type { PatientSees } from "./patient-release-store";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { rowsOf } from "@/lib/exchange/store";
import { agedResults, patientSees, releaseContext, resultFacts } from "./patient-release-store";

export interface ReleaseRow {
  reportId: string;
  patientUserId: string;
  test: string;
  restricted: boolean;
  critical: boolean;
  issuedAt: Date;
  sees: PatientSees;
}

/**
 * 5.4: the doctor's "The patient sees it" list: the clinician's own released results of the last 14 days with what
 * the patient sees for each and why, and their aged results (PR-16). The head of department reads aged results on
 * the lab's governance pages; this list is the orderer's.
 */
export async function releaseForClinician(
  scope: { userId: string; hospitalId: string },
  now: Date,
) {
  return db.transaction(async (tx) => {
    const ctx = await releaseContext(tx, scope.hospitalId, now);
    const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
    const rows = rowsOf<{ id: string; test: string | null; restricted: boolean; issued: Date }>(
      await tx.execute(sql`SELECT r.id, t.display AS test, t.restricted_class IS NOT NULL AS restricted, r.issued_at AS issued
        FROM diagnostic_reports r
        JOIN encounter_orders o ON o.id = r.order_id
        LEFT JOIN test_catalogue t ON t.id = r.test_id
       WHERE r.hospital_id = ${scope.hospitalId} AND o.authored_by_user_id = ${scope.userId}
         AND r.status IN ('final','amended','corrected')
         AND NOT EXISTS (SELECT 1 FROM diagnostic_reports n WHERE n.supersedes_id = r.id)
         AND r.issued_at > ${since}::timestamptz
       ORDER BY r.issued_at DESC LIMIT 60`),
    );
    const facts = new Map(
      (
        await resultFacts(
          tx,
          scope.hospitalId,
          rows.map((r) => r.id),
        )
      ).map((f) => [f.reportId, f]),
    );
    const aged = (
      await agedResults(tx, scope.hospitalId, now, ctx.rules?.agedWindowDays ?? null)
    ).filter((a) => a.orderer === scope.userId);
    return {
      rows: rows.flatMap((r): ReleaseRow[] => {
        const f = facts.get(r.id);
        return f
          ? [
              {
                reportId: r.id,
                patientUserId: f.patientUserId,
                test: r.restricted ? "Restricted test" : (r.test ?? "Test"),
                restricted: r.restricted,
                critical: f.snapshot.critical,
                issuedAt: new Date(r.issued),
                sees: patientSees(f, ctx),
              },
            ]
          : [];
      }),
      aged,
      agedWindowDays: ctx.rules?.agedWindowDays ?? null,
      holdMaxDays: ctx.rules?.holdMaxDays ?? null,
    };
  });
}
