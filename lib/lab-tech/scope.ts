import "server-only";

import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { cadres, roles } from "@/db/schema/reference-data";
import { users } from "@/db/schema/users";
import { getAuthState } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * Laboratory-technician workspace scope. The single source of truth for "who is
 * the signed-in lab tech, at which hospital + department, in which cadre." Mirrors
 * the doctor/nurse scope pattern (auth + AAL2/MFA, most-recent active affiliation,
 * server-enforced cadre — never hardcoded on the client).
 *
 * GATE A (CSO-signed 2026-06-14): the lab cadres register under the AHPC branch
 * (LAB_TECH / LAB_TECHNOLOGIST — already seeded), and the cadre is is_clinical, so
 * the tech acts on orders/results under the existing clinical-relationship RLS,
 * department-scoped. A non-lab user who reaches /lab bounces to the landing.
 */

export const LAB_TECH_CADRE_CODES = ["LAB_TECH", "LAB_TECHNOLOGIST"] as const;
export type LabTechCadreCode = (typeof LAB_TECH_CADRE_CODES)[number];

export interface LabTechScope {
  userId: string;
  userEmail: string;
  fullName: string | null;

  affiliationId: string;
  hospitalId: string;
  hospitalName: string;
  hospitalLevel: string;
  /** The lab/department the tech is affiliated to (may be null if hospital-wide). */
  departmentId: string | null;
  departmentName: string | null;

  cadreId: string;
  cadreCode: LabTechCadreCode;
  cadreName: string;
  roleId: string;
  roleCode: string;
  roleName: string;
}

export async function requireLabTechScope(): Promise<LabTechScope> {
  const state = await getAuthState();
  if (!state.user) redirect("/sign-in?redirect=/lab");

  // MFA mandatory (MFA_REQUIRED_ROLES includes lab_tech) — mirror the gate.
  if (state.nextAal !== "aal2") redirect("/onboarding/mfa-setup");
  if (state.aal !== "aal2") redirect("/sign-in/mfa?redirect=/lab");

  const me = await findLabTechAffiliation(state.user.id);
  if (!me) {
    logger.warn("lab_tech.scope.no_active_affiliation", { user_id: state.user.id });
    redirect("/");
  }

  return {
    userId: state.user.id,
    userEmail: me.userEmail ?? state.user.email ?? "lab-tech",
    fullName: me.fullName,
    affiliationId: me.affiliationId,
    hospitalId: me.hospitalId,
    hospitalName: me.hospitalName,
    hospitalLevel: me.hospitalLevel,
    departmentId: me.departmentId,
    departmentName: me.departmentName,
    cadreId: me.cadreId,
    cadreCode: me.cadreCode as LabTechCadreCode,
    cadreName: me.cadreName,
    roleId: me.roleId,
    roleCode: me.roleCode,
    roleName: me.roleName,
  };
}

/**
 * True when the user has an active lab affiliation — the /clinician guard uses it so a lab tech
 * who lands there (a stale link, an old ?redirect=) goes to /lab. Same query as the gate above,
 * so the two cannot bounce a user back and forth.
 */
export async function isLabTechUser(userId: string): Promise<boolean> {
  return !!(await findLabTechAffiliation(userId));
}

async function findLabTechAffiliation(userId: string) {
  const [me] = await db
    .select({
      affiliationId: staffAffiliations.id,
      hospitalId: staffAffiliations.hospitalId,
      hospitalName: hospitals.name,
      hospitalLevel: hospitals.level,
      departmentId: staffAffiliations.departmentId,
      departmentName: hospitalDepartments.name,
      cadreId: staffAffiliations.cadreId,
      cadreCode: cadres.code,
      cadreName: cadres.name,
      roleId: staffAffiliations.roleId,
      roleCode: roles.code,
      roleName: roles.name,
      fullName: users.fullName,
      userEmail: users.email,
    })
    .from(staffAffiliations)
    .innerJoin(hospitals, eq(hospitals.id, staffAffiliations.hospitalId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, staffAffiliations.departmentId))
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .innerJoin(roles, eq(roles.id, staffAffiliations.roleId))
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .where(
      and(
        eq(staffAffiliations.userId, userId),
        inArray(staffAffiliations.state, ["active", "approved"]),
        inArray(cadres.code, LAB_TECH_CADRE_CODES as unknown as string[]),
      ),
    )
    .orderBy(desc(staffAffiliations.approvedAt), desc(staffAffiliations.createdAt))
    .limit(1);
  return me;
}
