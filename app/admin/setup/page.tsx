import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { hospitalAdminRoster } from "@/db/schema/hospital-admin-roster";
import { hospitalApplicationDepartments } from "@/db/schema/hospital-application-departments";
import { hospitalApplications } from "@/db/schema/hospital-applications";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitalStaffInvitations } from "@/db/schema/hospital-staff-invitations";
import { hospitalWards } from "@/db/schema/hospital-wards";
import { hospitals } from "@/db/schema/hospitals";
import { users } from "@/db/schema/users";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { SetupWizard } from "./_components/wizard";

export const metadata: Metadata = {
  title: "Set up your hospital · MedSync",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Hospital setup wizard (kickoff §F, GATE D).
 *
 * Lives under /admin so the admin shell renders (sidebar / topbar /
 * ⌘K palette). Gated to hospital_admins whose hospital is in
 * `provisioning` — superadmins are bounced to /admin to avoid the
 * impersonation pattern (ADR 0018 Q3: superadmin can SEE the data,
 * but submission requires the hospital_admin's session).
 *
 * Server fetches: the admin's hospital, the application's confirmed
 * department codes (pre-fill for step 1), the current
 * hospital_departments rows, hospital_wards, hospital_admin_roster,
 * and pending hospital_staff_invitations.
 */
export default async function HospitalSetupPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/sign-in?redirect=/admin/setup");

  const service = createServiceClient();
  const { data: roles } = await service
    .from("user_roles")
    .select("role,hospital_id")
    .eq("user_id", userData.user.id);

  const isSuperadmin = !!roles?.some((r) => r.role === "superadmin");
  const adminHospitalIds = (roles ?? [])
    .filter((r) => r.role === "hospital_admin" && r.hospital_id)
    .map((r) => r.hospital_id as string);

  // The wizard runs the hospital admin, not the superadmin.
  if (adminHospitalIds.length === 0) {
    if (isSuperadmin) redirect("/admin/tenants");
    redirect("/admin");
  }

  // Find a hospital in provisioning that this admin can act on.
  const [provisioning] = await db
    .select()
    .from(hospitals)
    .where(and(eq(hospitals.state, "provisioning")))
    .orderBy(asc(hospitals.name));

  const myProvisioning = adminHospitalIds.find((id) => id === provisioning?.id);
  if (!provisioning || !myProvisioning) {
    // Nothing to set up — back to the admin landing.
    redirect("/admin");
  }
  const hospitalId = provisioning.id;

  // Find the application that spawned this hospital (for department prefill).
  const [app] = await db
    .select()
    .from(hospitalApplications)
    .where(eq(hospitalApplications.approvedHospitalId, hospitalId))
    .limit(1);

  const prefilledDepartments = app
    ? await db
        .select({
          code: hospitalApplicationDepartments.departmentFamily,
          isPrimary: hospitalApplicationDepartments.isPrimary,
        })
        .from(hospitalApplicationDepartments)
        .where(eq(hospitalApplicationDepartments.applicationId, app.id))
    : [];

  // Currently-confirmed hospital departments + wards.
  const [confirmedDepts, wards, rosterRows, pendingInvitations] = await Promise.all([
    db.select().from(hospitalDepartments).where(eq(hospitalDepartments.hospitalId, hospitalId)),
    db
      .select()
      .from(hospitalWards)
      .where(eq(hospitalWards.hospitalId, hospitalId))
      .orderBy(asc(hospitalWards.name)),
    db
      .select({
        id: hospitalAdminRoster.id,
        userId: hospitalAdminRoster.userId,
        designation: hospitalAdminRoster.designation,
        designatedAt: hospitalAdminRoster.designatedAt,
        email: users.email,
        fullName: users.fullName,
      })
      .from(hospitalAdminRoster)
      .leftJoin(users, eq(users.id, hospitalAdminRoster.userId))
      .where(
        and(
          eq(hospitalAdminRoster.hospitalId, hospitalId),
          isNull(hospitalAdminRoster.succeededAt),
        ),
      ),
    db
      .select()
      .from(hospitalStaffInvitations)
      .where(
        and(
          eq(hospitalStaffInvitations.hospitalId, hospitalId),
          isNull(hospitalStaffInvitations.acceptedAt),
          isNull(hospitalStaffInvitations.revokedAt),
        ),
      )
      .orderBy(desc(hospitalStaffInvitations.invitedAt))
      .limit(50),
  ]);

  return (
    <SetupWizard
      hospital={{ id: hospitalId, name: provisioning.name, state: provisioning.state }}
      prefilledDepartments={prefilledDepartments}
      confirmedDepartmentSlugs={confirmedDepts.map((d) => d.slug)}
      wards={wards.map((w) => ({ id: w.id, name: w.name, bedCount: w.bedCount }))}
      roster={rosterRows.map((r) => ({
        id: r.id,
        designation: r.designation,
        email: r.email ?? "(unknown)",
        fullName: r.fullName ?? "(unknown)",
      }))}
      pendingInvitations={pendingInvitations.map((i) => ({
        id: i.id,
        email: i.invitedEmail,
        invitedAtIso: i.invitedAt.toISOString(),
      }))}
    />
  );
}
