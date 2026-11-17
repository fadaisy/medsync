import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { rowsOf } from "@/lib/exchange/store";
import { openRecordsRequests } from "@/lib/lab/patient-results";

/** One open copy request (Lab Phase 5 PR-15): only the hospital number, never a name. */
export interface CopyRequest {
  id: string;
  code: string | null;
  /** `YYYY-MM-DD`, 30 days after the request (DPPA 2019 s.24(9)). */
  dueOn: string;
  held: boolean;
}

/** Open copy requests at this hospital, soonest due first, each with the patient's hospital number. */
export async function loadCopyRequests(hospitalId: string): Promise<CopyRequest[]> {
  const open = await openRecordsRequests(hospitalId);
  if (!open.length) return [];
  const codes = new Map(
    rowsOf<{ id: string; code: string | null }>(
      await db.execute(
        sql`SELECT id, patient_code AS code FROM patient_profiles WHERE id IN (${sql.join(
          open.map((o) => sql`${o.patientUserId}::uuid`),
          sql`, `,
        )})`,
      ),
    ).map((r) => [r.id, r.code]),
  );
  return open.map((o) => ({
    id: o.id,
    code: codes.get(o.patientUserId) ?? null,
    dueOn: o.dueOn,
    held: o.held,
  }));
}
