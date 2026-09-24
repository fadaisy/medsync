import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { wardInChargeAssignments } from "@/db/schema/nurse-workspace";

/** Consultant cadres — the head-of-department proxy (no HOD role exists; flagged for the CSO). */
const CONSULTANT_CADRES: readonly string[] = ["CONSULTANT", "SENIOR_CONSULTANT"];

/**
 * In-charge / head of department (D14, LC-04): an active ward in-charge at the
 * hospital, or a consultant cadre. Used for the administrative close of an idle
 * episode (≥ 24 h, reason required).
 */
export async function canAdminCloseResus(
  userId: string,
  hospitalId: string,
  cadreCode: string,
): Promise<boolean> {
  if (CONSULTANT_CADRES.includes(cadreCode)) return true;
  const [row] = await db
    .select({ id: wardInChargeAssignments.id })
    .from(wardInChargeAssignments)
    .where(
      and(
        eq(wardInChargeAssignments.hospitalId, hospitalId),
        eq(wardInChargeAssignments.nurseUserId, userId),
        isNull(wardInChargeAssignments.endsAt),
      ),
    )
    .limit(1);
  return !!row;
}
