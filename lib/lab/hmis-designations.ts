import "server-only";

import type { EmrTx } from "@/lib/emr/db";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";

import { hmisDesignations } from "@/db/schema";

/**
 * HMIS roles (Lab Phase 3, gate-a-proposal §4, E-LAB3-11): the Health Unit In-Charge signs the HMIS 105 and the
 * HMIS focal person co-signs the mapping. Neither is a lab permission: each is an open `hmis_designations` row
 * at the hospital, set by the hospital admin, read here on the hospital-local day (Africa/Kampala).
 */
export type HmisRole = "in_charge" | "focal";

export async function hmisRolesFor(
  tx: EmrTx,
  hospitalId: string,
  userId: string,
  at: Date,
): Promise<HmisRole[]> {
  const day = at.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const rows = await tx
    .selectDistinct({ role: hmisDesignations.role })
    .from(hmisDesignations)
    .where(
      and(
        eq(hmisDesignations.hospitalId, hospitalId),
        eq(hmisDesignations.userId, userId),
        lte(hmisDesignations.startsOn, day),
        or(isNull(hmisDesignations.endsOn), gte(hmisDesignations.endsOn, day)),
      ),
    );
  return rows.map((r) => r.role as HmisRole).sort();
}
