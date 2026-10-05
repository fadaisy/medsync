/** What the Administration page reads besides lib/ncdreg/admin: staff at the facility and their NCD roles. */
import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { ncdStaffRole } from "@/db/schema/ncd-registry";
import { users } from "@/db/schema/users";

import { authorize, type NcdContext } from "../context";

/** Staff (names only) the administrator may give an NCD role; and the current assignments. */
export async function staffAndRoles(ctx: NcdContext) {
  authorize(ctx, "ncd_role_assign", "condition_catalogue_manage", "go_live_request");
  const staff = await db
    .selectDistinct({ userId: staffAffiliations.userId, name: users.fullName, email: users.email })
    .from(staffAffiliations)
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .where(and(eq(staffAffiliations.hospitalId, ctx.facilityId), inArray(staffAffiliations.state, ["active", "approved"])));
  const roles = await db
    .select()
    .from(ncdStaffRole)
    .where(and(eq(ncdStaffRole.facilityId, ctx.facilityId), isNull(ncdStaffRole.revokedAt)));
  const name = new Map(staff.map((s) => [s.userId, s.name ?? s.email ?? "Staff"]));
  return {
    staff: staff.map((s) => ({ userId: s.userId, name: s.name ?? s.email ?? "Staff" })),
    roles: roles.map((r) => ({ id: r.id, userId: r.userId, name: name.get(r.userId) ?? "Staff", role: r.ncdRole })),
  };
}
