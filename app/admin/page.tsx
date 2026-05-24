import type { ApprovalItem } from "./_components/approvals/types";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { clinicianProfiles, staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalApplications } from "@/db/schema/hospital-applications";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { roles as rolesTable } from "@/db/schema/reference-data";
import { users } from "@/db/schema/users";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ApprovalsQueue } from "./_components/approvals/queue";

export const dynamic = "force-dynamic";

/**
 * Admin Approvals page (GATE B craft layer).
 *
 * Fetches both pending queues server-side, normalises them into the
 * unified ApprovalItem shape, and hands the data to the client
 * <ApprovalsQueue /> which owns filter/sort/selection state and
 * renders the DataTable + slide-out detail panel.
 *
 * Functional behaviour is unchanged — same RLS, same Edge Function
 * approve/reject paths via the existing actions.ts. This page only
 * touches presentation.
 */
export default async function AdminApprovalsPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user!.id;

  const service = createServiceClient();
  const { data: rolesData } = await service
    .from("user_roles")
    .select("role, hospital_id")
    .eq("user_id", userId);

  const isSuperadmin = !!rolesData?.some((r) => r.role === "superadmin");
  const hospitalAdminScopes = (rolesData ?? [])
    .filter((r) => r.role === "hospital_admin" && r.hospital_id)
    .map((r) => r.hospital_id as string);

  // ─── Staff affiliations ─────────────────────────────────────────────
  const staffItems: ApprovalItem[] = [];

  if (isSuperadmin || hospitalAdminScopes.length > 0) {
    const whereClauses: SQL[] = [eq(staffAffiliations.state, "pending_approval")];
    if (!isSuperadmin) {
      whereClauses.push(inArray(staffAffiliations.hospitalId, hospitalAdminScopes));
    }
    const rows = await db
      .select({
        id: staffAffiliations.id,
        userId: staffAffiliations.userId,
        hospitalId: staffAffiliations.hospitalId,
        departmentId: staffAffiliations.departmentId,
        roleId: staffAffiliations.roleId,
        employmentType: staffAffiliations.employmentType,
        createdAt: staffAffiliations.createdAt,
      })
      .from(staffAffiliations)
      .where(whereClauses.length === 1 ? whereClauses[0] : and(...whereClauses))
      .orderBy(desc(staffAffiliations.createdAt))
      .limit(50);

    if (rows.length > 0) {
      const userIds = [...new Set(rows.map((r) => r.userId))];
      const hospitalIds = [...new Set(rows.map((r) => r.hospitalId))];
      const deptIds = [...new Set(rows.map((r) => r.departmentId))];
      const roleIds = [...new Set(rows.map((r) => r.roleId))];

      const [usersData, hospitalsData, deptsData, rolesLookup, clinicianData] = await Promise.all([
        db.select().from(users).where(inArray(users.id, userIds)),
        db.select().from(hospitals).where(inArray(hospitals.id, hospitalIds)),
        db.select().from(hospitalDepartments).where(inArray(hospitalDepartments.id, deptIds)),
        db.select().from(rolesTable).where(inArray(rolesTable.id, roleIds)),
        db.select().from(clinicianProfiles).where(inArray(clinicianProfiles.id, userIds)),
      ]);

      const userById = new Map(usersData.map((u) => [u.id, u]));
      const hospitalById = new Map(hospitalsData.map((h) => [h.id, h]));
      const deptById = new Map(deptsData.map((d) => [d.id, d]));
      const roleById = new Map(rolesLookup.map((r) => [r.id, r]));
      const clinicianById = new Map(clinicianData.map((c) => [c.id, c]));

      for (const r of rows) {
        const u = userById.get(r.userId);
        const h = hospitalById.get(r.hospitalId);
        const d = deptById.get(r.departmentId);
        const role = roleById.get(r.roleId);
        const clinician = clinicianById.get(r.userId);

        staffItems.push({
          id: r.id,
          kind: "staff",
          title: u?.fullName ?? "(unknown clinician)",
          subtitle: `${role?.name ?? "—"} · ${h?.name ?? "—"}`,
          createdAtIso: r.createdAt.toISOString(),
          evidence: [
            { label: "Hospital", value: h?.name ?? "—" },
            { label: "Department", value: d?.name ?? "—" },
            { label: "Role", value: role?.name ?? "—" },
            { label: "Employment", value: r.employmentType },
            {
              label: "Reg number",
              value: clinician?.registrationNumber ?? "(not on file)",
              mono: true,
              tone: clinician?.registrationNumber ? undefined : "warning",
            },
            {
              label: "Licence doc",
              value: clinician?.licenceDocumentPath ? "Uploaded" : "Missing",
              tone: clinician?.licenceDocumentPath ? "ok" : "critical",
            },
            {
              label: "Requested",
              value: new Date(r.createdAt).toLocaleString(),
              mono: true,
            },
          ],
          documentBucket: clinician?.licenceDocumentPath ? "clinician-licences" : undefined,
          documentPath: clinician?.licenceDocumentPath ?? undefined,
        });
      }
    }
  }

  // ─── Hospital applications (superadmin only) ────────────────────────
  const hospitalItems: ApprovalItem[] = [];

  if (isSuperadmin) {
    const rows = await db
      .select()
      .from(hospitalApplications)
      .where(eq(hospitalApplications.state, "pending_approval"))
      .orderBy(desc(hospitalApplications.createdAt))
      .limit(50);

    for (const r of rows) {
      hospitalItems.push({
        id: r.id,
        kind: "hospital",
        title: r.hospitalName,
        subtitle: `${r.facilityLevel} · ${r.ownership}`,
        createdAtIso: r.createdAt.toISOString(),
        evidence: [
          { label: "Facility level", value: r.facilityLevel },
          { label: "Ownership", value: r.ownership },
          { label: "Reg number", value: r.registrationNumber, mono: true },
          { label: "Authority", value: r.registrationAuthority ?? "—" },
          { label: "Address", value: r.physicalAddress },
          { label: "Email domain", value: r.institutionalEmailDomain, mono: true },
          { label: "Applicant role", value: r.applicantRole },
          {
            label: "Authorisation doc",
            value: r.authorisationDocumentPath ? "Uploaded" : "Missing",
            tone: r.authorisationDocumentPath ? "ok" : "critical",
          },
          {
            label: "Submitted",
            value: new Date(r.createdAt).toLocaleString(),
            mono: true,
          },
        ],
        documentBucket: r.authorisationDocumentPath ? "hospital-authorisations" : undefined,
        documentPath: r.authorisationDocumentPath ?? undefined,
      });
    }
  }

  const allItems: ApprovalItem[] = [...staffItems, ...hospitalItems].sort(
    (a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime(),
  );

  return <ApprovalsQueue items={allItems} canSeeHospitalQueue={isSuperadmin} />;
}
