import "server-only";

import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { cadres } from "@/db/schema/reference-data";
import { saBreakGlassGrants } from "@/db/schema/sa-break-glass-grants";
import { encounters } from "@/db/schema/scheduling";

/**
 * Application-level "legitimate clinical relationship" gate.
 *
 * ⚠️ Why this exists even though migration 0040 ships a `has_clinical_relationship`
 * RLS predicate: the engine's reads/writes run through the service-role Drizzle
 * client (`db`, a direct `DATABASE_URL` connection as the table owner), which
 * BYPASSES row-level security. RLS only defends client-key (anon/authenticated)
 * access — for which there are no callers. So the relationship MUST be re-checked
 * in application code on every service-role clinical read/write. RLS is
 * necessary-but-not-sufficient for these paths.
 *
 * This mirrors the SQL predicate EXACTLY: a clinician has a legitimate
 * relationship with a patient if they are active clinical staff
 * (is_clinical=true, state active/approved) at a hospital where the patient has
 * an encounter — OR there is a live, un-revoked break-glass grant (the audited
 * emergency out-of-relationship path). Reception (is_clinical=false) never
 * matches.
 */
export async function hasClinicalRelationship(
  userId: string,
  patientUserId: string,
): Promise<boolean> {
  const [staffRel] = await db
    .select({ ok: sql<number>`1` })
    .from(staffAffiliations)
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .innerJoin(encounters, eq(encounters.hospitalId, staffAffiliations.hospitalId))
    .where(
      and(
        eq(staffAffiliations.userId, userId),
        inArray(staffAffiliations.state, ["active", "approved"]),
        eq(cadres.isClinical, true),
        eq(encounters.patientUserId, patientUserId),
      ),
    )
    .limit(1);
  if (staffRel) return true;

  const [grant] = await db
    .select({ ok: sql<number>`1` })
    .from(saBreakGlassGrants)
    .where(
      and(
        eq(saBreakGlassGrants.actorId, userId),
        eq(saBreakGlassGrants.patientId, patientUserId),
        isNull(saBreakGlassGrants.revokedAt),
        gt(saBreakGlassGrants.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return Boolean(grant);
}
