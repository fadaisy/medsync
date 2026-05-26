import type { StaffTab } from "./_components/staff-tabs";
import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { clinicianProfiles, staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { cadreGrades, cadres, councils, roles, specialties } from "@/db/schema/reference-data";
import { users } from "@/db/schema/users";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { PendingQueue } from "./_components/pending-queue";
import { StaffTabs } from "./_components/staff-tabs";

export const metadata: Metadata = {
  title: "Staff · Hospital Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ tab?: string; aff?: string }>;
}

/**
 * Staff Management — the daily admin surface.
 *
 * Three tabs (driven by ?tab=…):
 *   - pending   — pending_approval affiliations awaiting triage
 *   - directory — every staff member at this hospital, with filters
 *   - invites   — outstanding + completed staff invitations
 *
 * Server-rendered data fetch; client components handle the panel /
 * actions. The whole page re-renders cleanly on a Server Action
 * revalidation because we use force-dynamic + revalidatePath in
 * actions.ts.
 *
 * GATE B ships the Pending tab + slide-out evidence + approve / reject /
 * request-info actions. The Directory and Invites tabs are wired but
 * render thin placeholders for GATE C / D to land into without
 * touching this file.
 */
export default async function StaffPage({ searchParams }: PageProps) {
  const scope = await requireHospitalAdminScope();
  const params = await searchParams;
  const activeTab: StaffTab =
    params.tab === "directory" || params.tab === "invites" ? params.tab : "pending";

  const pendingRows = await fetchPendingAffiliations(scope.hospitalId);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex w-fit items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          {scope.hospitalName} · Staff
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
          Staff
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[13.5px] leading-relaxed">
          Triage pending affiliations, manage your active directory, and invite staff to join. Every
          action is scoped to {scope.hospitalName} and audited.
        </p>
        <div className="h-px w-10 bg-teal-500/60 dark:bg-teal-400/50" aria-hidden />
      </header>

      <StaffTabs activeTab={activeTab} pendingCount={pendingRows.length} />

      {activeTab === "pending" ? (
        <PendingQueue rows={pendingRows} selectedAffiliationId={params.aff ?? null} />
      ) : null}

      {activeTab === "directory" ? (
        <p className="text-muted-foreground text-[13px]">
          Directory lands in GATE C — table, filters, per-staff slide-out detail.
        </p>
      ) : null}

      {activeTab === "invites" ? (
        <p className="text-muted-foreground text-[13px]">
          Invitations land in GATE D — single + bulk invite, claim-URL list.
        </p>
      ) : null}
    </div>
  );
}

/* ─── Data fetchers ────────────────────────────────────────────────── */

export interface PendingAffiliationRow {
  id: string;
  fullName: string;
  email: string;
  cadreName: string;
  cadreGradeName: string | null;
  roleName: string;
  departmentName: string;
  specialtyName: string | null;
  councilName: string;
  registrationNumber: string;
  registrationExpiry: string | null;
  licenceDocumentPath: string | null;
  employmentType: string;
  reviewNote: string | null;
  createdAtIso: string;
  /** Days since submission, computed server-side at fetch time.
   * The client renders this as the aging chip without calling
   * Date.now() during render (which React's new purity rules flag). */
  daysSinceSubmission: number;
}

async function fetchPendingAffiliations(hospitalId: string): Promise<PendingAffiliationRow[]> {
  const rows = await db
    .select({
      id: staffAffiliations.id,
      employmentType: staffAffiliations.employmentType,
      reviewNote: staffAffiliations.reviewNote,
      createdAt: staffAffiliations.createdAt,
      fullName: users.fullName,
      email: users.email,
      cadreName: cadres.name,
      cadreGradeName: cadreGrades.name,
      roleName: roles.name,
      departmentName: hospitalDepartments.name,
      specialtyName: specialties.name,
      councilName: councils.name,
      registrationNumber: clinicianProfiles.registrationNumber,
      registrationExpiry: clinicianProfiles.registrationExpiry,
      licenceDocumentPath: clinicianProfiles.licenceDocumentPath,
    })
    .from(staffAffiliations)
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .innerJoin(clinicianProfiles, eq(clinicianProfiles.id, staffAffiliations.userId))
    .innerJoin(councils, eq(councils.id, clinicianProfiles.councilId))
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .leftJoin(cadreGrades, eq(cadreGrades.id, staffAffiliations.cadreGradeId))
    .innerJoin(roles, eq(roles.id, staffAffiliations.roleId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, staffAffiliations.departmentId))
    .leftJoin(specialties, eq(specialties.id, staffAffiliations.specialtyId))
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        eq(staffAffiliations.state, "pending_approval"),
      ),
    )
    .orderBy(desc(staffAffiliations.createdAt));

  const nowMs = Date.now();

  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    cadreName: r.cadreName,
    cadreGradeName: r.cadreGradeName,
    roleName: r.roleName,
    departmentName: r.departmentName,
    specialtyName: r.specialtyName,
    councilName: r.councilName,
    registrationNumber: r.registrationNumber,
    registrationExpiry: r.registrationExpiry ? r.registrationExpiry.toString() : null,
    licenceDocumentPath: r.licenceDocumentPath,
    employmentType: r.employmentType,
    reviewNote: r.reviewNote,
    createdAtIso: r.createdAt.toISOString(),
    daysSinceSubmission: Math.floor((nowMs - r.createdAt.getTime()) / 86_400_000),
  }));
}
