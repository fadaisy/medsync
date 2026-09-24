import type { ApprovalEvidence, ApprovalItem } from "./_components/approvals/types";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { clinicianProfiles, staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalApplicationDepartments } from "@/db/schema/hospital-application-departments";
import { hospitalApplicationSpecialties } from "@/db/schema/hospital-application-specialties";
import { hospitalApplications } from "@/db/schema/hospital-applications";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitalDpaVersions } from "@/db/schema/hospital-dpa-versions";
import { hospitals } from "@/db/schema/hospitals";
import {
  districts,
  regions,
  roles as rolesTable,
  specialties,
  subcounties,
} from "@/db/schema/reference-data";
import { users } from "@/db/schema/users";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
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

  // --- Staff affiliations ---------------------------------------------
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
          documents: clinician?.licenceDocumentPath
            ? [
                {
                  label: "Licence document",
                  bucket: "clinician-licences",
                  path: clinician.licenceDocumentPath,
                },
              ]
            : undefined,
        });
      }
    }
  }

  // --- Hospital applications (superadmin only) ------------------------
  const hospitalItems: ApprovalItem[] = [];

  if (isSuperadmin) {
    const rows = await db
      .select()
      .from(hospitalApplications)
      .where(inArray(hospitalApplications.state, ["pending_approval", "under_review"]))
      .orderBy(desc(hospitalApplications.createdAt))
      .limit(50);

    if (rows.length > 0) {
      const appIds = rows.map((r) => r.id);
      const districtIds = [...new Set(rows.map((r) => r.districtId))];
      const subcountyIds = [
        ...new Set(rows.map((r) => r.subcountyId).filter((v): v is string => !!v)),
      ];
      const regionIds = [...new Set(rows.map((r) => r.regionId).filter((v): v is string => !!v))];
      const dpaIds = [
        ...new Set(rows.map((r) => r.agreementAcceptedVersion).filter((v): v is string => !!v)),
      ];

      const [districtRows, subcountyRows, regionRows, deptRows, specRows, dpaRows] =
        await Promise.all([
          districtIds.length
            ? db.select().from(districts).where(inArray(districts.id, districtIds))
            : Promise.resolve([] as Array<{ id: string; name: string }>),
          subcountyIds.length
            ? db.select().from(subcounties).where(inArray(subcounties.id, subcountyIds))
            : Promise.resolve([] as Array<{ id: string; name: string }>),
          regionIds.length
            ? db.select().from(regions).where(inArray(regions.id, regionIds))
            : Promise.resolve([] as Array<{ id: string; name: string }>),
          db
            .select()
            .from(hospitalApplicationDepartments)
            .where(inArray(hospitalApplicationDepartments.applicationId, appIds)),
          db
            .select({
              applicationId: hospitalApplicationSpecialties.applicationId,
              specialtyId: hospitalApplicationSpecialties.specialtyId,
              name: specialties.name,
            })
            .from(hospitalApplicationSpecialties)
            .leftJoin(specialties, eq(specialties.id, hospitalApplicationSpecialties.specialtyId))
            .where(inArray(hospitalApplicationSpecialties.applicationId, appIds)),
          dpaIds.length
            ? db.select().from(hospitalDpaVersions).where(inArray(hospitalDpaVersions.id, dpaIds))
            : Promise.resolve([] as Array<{ id: string; version: string }>),
        ]);

      const districtById = new Map(districtRows.map((d) => [d.id, d.name]));
      const subcountyById = new Map(subcountyRows.map((s) => [s.id, s.name]));
      const regionById = new Map(regionRows.map((r) => [r.id, r.name]));
      const dpaById = new Map(dpaRows.map((d) => [d.id, d.version]));

      const deptsByApp = new Map<string, Array<{ code: string; isPrimary: boolean }>>();
      for (const d of deptRows) {
        const list = deptsByApp.get(d.applicationId) ?? [];
        list.push({ code: d.departmentFamily, isPrimary: d.isPrimary });
        deptsByApp.set(d.applicationId, list);
      }

      const specsByApp = new Map<string, string[]>();
      for (const s of specRows) {
        const list = specsByApp.get(s.applicationId) ?? [];
        if (s.name) list.push(s.name);
        specsByApp.set(s.applicationId, list);
      }

      for (const r of rows) {
        const depts = deptsByApp.get(r.id) ?? [];
        const primaryDept = depts.find((d) => d.isPrimary)?.code;
        const allDepts = depts.map((d) => humanise(d.code)).join(", ") || "—";
        const subSpecs = (specsByApp.get(r.id) ?? []).join(", ") || "—";

        // PII decryption — fail soft. If a row pre-dates the upgrade
        // and the field is plain text, decrypt() throws; we fall back
        // to the stored value with a "(plaintext)" suffix so the
        // reviewer at least sees something.
        const applicantPhone = tryDecrypt(r.applicantPhone);
        const callbackContact = tryDecrypt(r.callbackContactValue);

        hospitalItems.push({
          id: r.id,
          kind: "hospital",
          title: r.hospitalName,
          subtitle: `${r.facilityLevel} · ${r.ownership}${
            r.emailDomainMismatch ? " · ⚠ email-domain mismatch" : ""
          }`,
          createdAtIso: r.createdAt.toISOString(),
          evidence: [
            /* --- Institution profile (§B) --- */
            { section: "Institution", label: "Official name", value: r.hospitalName },
            ...(r.hospitalAka
              ? [{ section: "Institution", label: "Also known as", value: r.hospitalAka }]
              : []),
            { section: "Institution", label: "Facility level", value: r.facilityLevel },
            { section: "Institution", label: "Ownership", value: r.ownership },
            ...(r.yearEstablished
              ? [
                  {
                    section: "Institution",
                    label: "Year established",
                    value: String(r.yearEstablished),
                    mono: true,
                  },
                ]
              : []),
            ...(r.regionId
              ? [
                  {
                    section: "Institution",
                    label: "Region",
                    value: regionById.get(r.regionId) ?? "—",
                  },
                ]
              : []),
            {
              section: "Institution",
              label: "District",
              value: districtById.get(r.districtId) ?? "—",
            },
            ...(r.subcountyId
              ? [
                  {
                    section: "Institution",
                    label: "Subcounty",
                    value: subcountyById.get(r.subcountyId) ?? "—",
                  },
                ]
              : []),
            { section: "Institution", label: "Address", value: r.physicalAddress },
            ...(r.mainPhone
              ? [
                  {
                    section: "Institution",
                    label: "Main phone",
                    value: r.mainPhone,
                    mono: true,
                  },
                ]
              : []),
            ...(r.officialEmail
              ? [
                  {
                    section: "Institution",
                    label: "Official email",
                    value: r.officialEmail,
                    mono: true,
                  },
                ]
              : []),
            ...(r.website ? [{ section: "Institution", label: "Website", value: r.website }] : []),

            /* --- Clinical & operating (§C–§E5) --- */
            { section: "Clinical & operating", label: "Departments", value: allDepts },
            ...(primaryDept
              ? [
                  {
                    section: "Clinical & operating",
                    label: "Primary department",
                    value: humanise(primaryDept),
                  },
                ]
              : []),
            ...((specsByApp.get(r.id)?.length ?? 0) > 0
              ? [
                  {
                    section: "Clinical & operating",
                    label: "IM sub-specialties",
                    value: subSpecs,
                  },
                ]
              : []),
            ...(r.specialisedClinics.length > 0
              ? [
                  {
                    section: "Clinical & operating",
                    label: "Specialised clinics",
                    value: r.specialisedClinics.map(humanise).join(", "),
                  },
                ]
              : []),
            ...(r.diagnosticServices.length > 0
              ? [
                  {
                    section: "Clinical & operating",
                    label: "Diagnostics",
                    value: r.diagnosticServices.map(humanise).join(", "),
                  },
                ]
              : []),
            ...(r.supportServices.length > 0
              ? [
                  {
                    section: "Clinical & operating",
                    label: "Support services",
                    value: r.supportServices.map(humanise).join(", "),
                  },
                ]
              : []),
            ...(r.servicesOffered.length > 0
              ? [
                  {
                    section: "Clinical & operating",
                    label: "Services offered",
                    value: r.servicesOffered.map(humanise).join(", "),
                  },
                ]
              : []),
            ...(r.hasOnsitePharmacy !== null
              ? [
                  {
                    section: "Clinical & operating",
                    label: "On-site pharmacy",
                    value: r.hasOnsitePharmacy ? "Yes" : "No",
                    tone: r.hasOnsitePharmacy ? ("ok" as const) : undefined,
                  },
                ]
              : []),
            ...(r.bedCapacityBand
              ? [
                  {
                    section: "Clinical & operating",
                    label: "Bed capacity",
                    value: r.bedCapacityBand,
                    mono: true,
                  },
                ]
              : []),
            ...(r.clinicalStaffBand
              ? [
                  {
                    section: "Clinical & operating",
                    label: "Clinical staff",
                    value: r.clinicalStaffBand,
                    mono: true,
                  },
                ]
              : []),
            ...(r.dailyOpdBand
              ? [
                  {
                    section: "Clinical & operating",
                    label: "Daily OPD",
                    value: r.dailyOpdBand,
                    mono: true,
                  },
                ]
              : []),
            ...(r.internetConnectivity
              ? [
                  {
                    section: "Clinical & operating",
                    label: "Connectivity",
                    value: humanise(r.internetConnectivity),
                  },
                ]
              : []),
            ...(r.powerBackup
              ? [
                  {
                    section: "Clinical & operating",
                    label: "Power / backup",
                    value: humanise(r.powerBackup),
                  },
                ]
              : []),
            ...(r.existingEmr
              ? [
                  {
                    section: "Clinical & operating",
                    label: "Existing EMR",
                    value:
                      r.existingEmr === "existing" && r.existingEmrName
                        ? `${humanise(r.existingEmr)} (${r.existingEmrName})`
                        : humanise(r.existingEmr),
                  },
                ]
              : []),

            /* --- Verification & authority (§E6) --- */
            {
              section: "Verification",
              label: "Reg number",
              value: r.registrationNumber,
              mono: true,
            },
            ...(r.registrationAuthority
              ? [
                  {
                    section: "Verification",
                    label: "Registration authority",
                    value: r.registrationAuthority,
                  },
                ]
              : []),
            ...(r.licensingBody
              ? [
                  {
                    section: "Verification",
                    label: "Licensing body",
                    value: humanise(r.licensingBody),
                  },
                ]
              : []),
            {
              section: "Verification",
              label: "Institutional email domain",
              value: r.institutionalEmailDomain,
              mono: true,
            },
            ...(r.facilityLicencePath
              ? [
                  {
                    section: "Verification",
                    label: "Facility licence",
                    value: "Uploaded — see Documents below",
                    tone: "ok" as const,
                  },
                ]
              : [
                  {
                    section: "Verification",
                    label: "Facility licence",
                    value: "Missing",
                    tone: "critical" as const,
                  },
                ]),

            /* --- Applicant --- */
            ...(r.applicantFullName
              ? [{ section: "Applicant", label: "Full name", value: r.applicantFullName }]
              : []),
            { section: "Applicant", label: "Role / title", value: r.applicantRole },
            ...(r.applicantWorkEmail
              ? [
                  {
                    section: "Applicant",
                    label: "Work email",
                    value: r.applicantWorkEmail,
                    mono: true,
                    tone: r.emailDomainMismatch ? ("warning" as const) : undefined,
                  },
                ]
              : []),
            ...(applicantPhone
              ? [
                  {
                    section: "Applicant",
                    label: "Phone",
                    value: applicantPhone,
                    mono: true,
                  },
                ]
              : []),
            ...(r.applicantCouncilNumber
              ? [
                  {
                    section: "Applicant",
                    label: "Council number",
                    value: r.applicantCouncilNumber,
                    mono: true,
                  },
                ]
              : []),
            ...(r.emailDomainMismatch
              ? [
                  {
                    section: "Applicant",
                    label: "Domain check",
                    value: "Mismatch — applicant work email doesn't match declared domain",
                    tone: "warning" as const,
                  },
                ]
              : []),

            /* --- Authority anchor --- */
            ...(r.authorityOfficerName
              ? [{ section: "Authority", label: "Officer name", value: r.authorityOfficerName }]
              : []),
            ...(r.authorityOfficerTitle
              ? [
                  {
                    section: "Authority",
                    label: "Officer title",
                    value: humanise(r.authorityOfficerTitle),
                  },
                ]
              : []),
            ...(r.authorityLetterPath
              ? [
                  {
                    section: "Authority",
                    label: "Authorisation letter",
                    value: "Uploaded — see Documents below",
                    tone: "ok" as const,
                  },
                ]
              : [
                  {
                    section: "Authority",
                    label: "Authorisation letter",
                    value: "Missing",
                    tone: "critical" as const,
                  },
                ]),
            ...(callbackContact
              ? [
                  {
                    section: "Authority",
                    label: `Callback (${r.callbackContactKind ?? "?"})`,
                    value: callbackContact,
                    mono: true,
                  },
                ]
              : []),

            /* --- Agreement (§E7) --- */
            ...(r.signatoryName
              ? [{ section: "Agreement", label: "Signatory", value: r.signatoryName }]
              : []),
            ...(r.signatoryTitle
              ? [
                  {
                    section: "Agreement",
                    label: "Signatory title",
                    value: humanise(r.signatoryTitle),
                  },
                ]
              : []),
            {
              section: "Agreement",
              label: "Authorised to bind",
              value: r.authorisedToBind ? "Yes" : "No",
              tone: r.authorisedToBind ? ("ok" as const) : ("critical" as const),
            },
            ...(r.agreementAcceptedVersion
              ? [
                  {
                    section: "Agreement",
                    label: "DPA version accepted",
                    value: dpaById.get(r.agreementAcceptedVersion) ?? "(unknown)",
                    mono: true,
                  },
                ]
              : []),
            ...(r.agreementAcceptedAt
              ? [
                  {
                    section: "Agreement",
                    label: "Accepted at",
                    value: new Date(r.agreementAcceptedAt).toLocaleString(),
                    mono: true,
                  },
                ]
              : []),

            /* --- Meta --- */
            {
              section: "Meta",
              label: "Submitted",
              value: new Date(r.createdAt).toLocaleString(),
              mono: true,
            },
            { section: "Meta", label: "Application ID", value: r.id, mono: true },
          ] satisfies ApprovalEvidence[],
          documents: [
            ...(r.facilityLicencePath
              ? [
                  {
                    label: "Facility licence document",
                    bucket: "hospital-authorisations" as const,
                    path: r.facilityLicencePath,
                  },
                ]
              : []),
            ...(r.authorityLetterPath
              ? [
                  {
                    label: "Authorisation letter",
                    bucket: "hospital-authorisations" as const,
                    path: r.authorityLetterPath,
                  },
                ]
              : []),
            // Legacy single-doc field — keep for pre-upgrade rows that
            // never populated the new facility/authority pair.
            ...(r.authorisationDocumentPath && r.authorisationDocumentPath !== r.authorityLetterPath
              ? [
                  {
                    label: "Authorisation document (legacy)",
                    bucket: "hospital-authorisations" as const,
                    path: r.authorisationDocumentPath,
                  },
                ]
              : []),
          ],
        });
      }
    }
  }

  const allItems: ApprovalItem[] = [...staffItems, ...hospitalItems].sort(
    (a, b) => new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime(),
  );

  return <ApprovalsQueue items={allItems} canSeeHospitalQueue={isSuperadmin} />;
}

/* --- Local helpers -------------------------------------------------- */

/** Humanise a stored code ("INTERNAL_MEDICINE" → "Internal Medicine"). */
function humanise(code: string): string {
  return code
    .toLowerCase()
    .split(/[_-]/)
    .map((p) => (p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(" ");
}

/**
 * PII decrypt that fails soft. The hospital_applications.applicant_phone
 * + callback_contact_value columns are encrypted at write time by the
 * signup action, but pre-upgrade rows or column-add-defaulted values
 * may sit as plain text. Returning null on failure suppresses the row
 * entirely so the operator doesn't see a base64 blob.
 */
function tryDecrypt(value: string | null): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch (e) {
    logger.warn("approvals.decrypt.failed", { reason: String(e).slice(0, 100) });
    return null;
  }
}
