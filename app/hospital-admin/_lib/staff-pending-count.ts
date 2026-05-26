import "server-only";

import { and, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";

/**
 * Hospital-scoped pending-staff badge for the sidebar.
 *
 * Returns the count of pending staff_affiliations for THIS hospital
 * only. The full Staff feature (its own prompt) will replace this
 * with a more nuanced count (e.g. flagged + unflagged segments), but
 * the badge plumbing is shipped here so the shell renders the chip
 * without a no-op.
 *
 * Best-effort: any query failure returns 0 so chrome never blocks
 * page render. The Staff feature is the source of truth.
 */
export async function getHospitalPendingStaffCount(hospitalId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ value: count() })
      .from(staffAffiliations)
      .where(
        and(
          eq(staffAffiliations.hospitalId, hospitalId),
          eq(staffAffiliations.state, "pending_approval"),
        ),
      );
    return row?.value ?? 0;
  } catch {
    return 0;
  }
}
