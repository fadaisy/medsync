import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { hospitalAdminRoster } from "@/db/schema/hospital-admin-roster";
import { hospitalAgreements } from "@/db/schema/hospital-agreements";
import { hospitalApplications } from "@/db/schema/hospital-applications";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitalDpaVersions } from "@/db/schema/hospital-dpa-versions";
import { hospitalStaffInvitations } from "@/db/schema/hospital-staff-invitations";
import { hospitalWards } from "@/db/schema/hospital-wards";
import { hospitals } from "@/db/schema/hospitals";
import { facilityLocations } from "@/db/schema/onboarding";
import { serviceLines } from "@/db/schema/service-lines";
import { capabilityValues, diagnosticOfferings } from "@/db/schema/services-hub";
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
 * Hospital setup checklist (kickoff §F, GATE D; onboarding v2 §5.10).
 *
 * Lives under /admin so the admin shell renders. Gated to hospital_admins whose hospital is in
 * `provisioning` — superadmins are bounced to /admin (ADR 0018 Q3: superadmin can SEE the data,
 * but submission requires the hospital_admin's session).
 *
 * Every task's done state is derived here from rows (no setup-state table, gate-a §6.8).
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

  // The checklist runs the hospital admin, not the superadmin.
  if (adminHospitalIds.length === 0) {
    if (isSuperadmin) redirect("/admin/tenants");
    redirect("/admin");
  }

  // This admin's hospital in provisioning (not just the first provisioning hospital by name).
  const [provisioning] = await db
    .select()
    .from(hospitals)
    .where(and(eq(hospitals.state, "provisioning"), inArray(hospitals.id, adminHospitalIds)))
    .orderBy(asc(hospitals.name))
    .limit(1);
  if (!provisioning) redirect("/admin");
  const hospitalId = provisioning.id;

  const [app] = await db
    .select()
    .from(hospitalApplications)
    .where(eq(hospitalApplications.approvedHospitalId, hospitalId))
    .limit(1);

  const [
    deptRows,
    wards,
    lines,
    offerings,
    capabilities,
    rosterRows,
    pendingInvitations,
    [location],
    [agreement],
  ] = await Promise.all([
    db
      .select({
        name: hospitalDepartments.name,
        parentId: hospitalDepartments.parentId,
        live: hospitalDepartments.medsyncLiveAt,
        archived: hospitalDepartments.archivedAt,
        isStart: hospitalDepartments.isStart,
      })
      .from(hospitalDepartments)
      .where(eq(hospitalDepartments.hospitalId, hospitalId)),
    db
      .select({ bedCount: hospitalWards.bedCount })
      .from(hospitalWards)
      .where(and(eq(hospitalWards.hospitalId, hospitalId), isNull(hospitalWards.archivedAt))),
    db
      .select({ id: serviceLines.id })
      .from(serviceLines)
      .where(and(eq(serviceLines.hospitalId, hospitalId), isNull(serviceLines.archivedAt))),
    db
      .select({ code: diagnosticOfferings.code })
      .from(diagnosticOfferings)
      .where(eq(diagnosticOfferings.hospitalId, hospitalId)),
    db
      .select({ key: capabilityValues.key })
      .from(capabilityValues)
      .where(eq(capabilityValues.hospitalId, hospitalId)),
    db
      .select({
        id: hospitalAdminRoster.id,
        designation: hospitalAdminRoster.designation,
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
    db
      .select({ accuracyM: facilityLocations.accuracyM, at: facilityLocations.confirmedAt })
      .from(facilityLocations)
      .where(eq(facilityLocations.hospitalId, hospitalId)),
    db
      .select({
        version: hospitalDpaVersions.version,
        name: hospitalAgreements.signatoryName,
        signedAt: hospitalAgreements.signedAt,
      })
      .from(hospitalAgreements)
      .innerJoin(hospitalDpaVersions, eq(hospitalDpaVersions.id, hospitalAgreements.dpaVersionId))
      .where(
        and(eq(hospitalAgreements.hospitalId, hospitalId), isNull(hospitalAgreements.supersededBy)),
      )
      .orderBy(desc(hospitalAgreements.signedAt))
      .limit(1),
  ]);

  // Departments & services (D-SVC-17): the checklist links there; "Departments" is done once a
  // start department is live on MedSync.
  const top = deptRows.filter((d) => d.parentId === null && !d.archived);
  const start = top.find((d) => d.isStart && d.live) ?? null;
  return (
    <SetupWizard
      hospital={{ id: hospitalId, name: provisioning.name }}
      hasApplication={!!app}
      hub={{
        departments: top.length,
        live: top.filter((d) => d.live).length,
        start: start?.name ?? null,
        wards: wards.length,
        beds: wards.reduce((n, w) => n + w.bedCount, 0),
        clinics: lines.length,
        diagnostics: offerings.length,
        capabilities: capabilities.length,
      }}
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
      location={
        location
          ? { accuracyM: location.accuracyM ?? 0, atIso: location.at?.toISOString() ?? null }
          : null
      }
      profile={
        app
          ? {
              servicesOffered: app.servicesOffered,
              specialisedClinics: app.specialisedClinics,
              diagnosticServices: app.diagnosticServices,
              supportServices: app.supportServices,
              hasOnsitePharmacy: app.hasOnsitePharmacy,
              internetConnectivity: app.internetConnectivity,
              powerBackup: app.powerBackup,
              bedCapacityBand: app.bedCapacityBand,
              clinicalStaffBand: app.clinicalStaffBand,
              dailyOpdBand: app.dailyOpdBand,
              existingEmr: app.existingEmr,
              existingEmrName: app.existingEmrName,
              mainPhone: app.mainPhone,
              officialEmail: app.officialEmail,
              website: app.website,
              hospitalAka: app.hospitalAka,
              yearEstablished: app.yearEstablished,
              physicalAddress: app.physicalAddress,
            }
          : null
      }
      agreement={
        agreement
          ? {
              version: agreement.version,
              name: agreement.name,
              signedAtIso: agreement.signedAt.toISOString(),
            }
          : null
      }
    />
  );
}
