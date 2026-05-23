import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  clinicianProfiles,
  hospitalDepartments,
  hospitals as hospitalsTable,
  refCadres,
  refCouncils,
  refRoles,
  refSpecialties,
  staffAffiliations,
  users,
} from "@/db/schema";
import { adminHospitalIds, requireAdminish } from "@/lib/auth";
import { env } from "@/lib/env";
import { AffiliationDecisionForms } from "./_forms";

export const metadata: Metadata = { title: "Review staff affiliation" };
export const dynamic = "force-dynamic";

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20 });
const db = drizzle(sql);

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StaffAffiliationDetailPage({ params }: PageProps) {
  const auth = await requireAdminish();
  const isSuperadmin = auth.roles.includes("superadmin");
  const { id } = await params;

  const rows = await db
    .select({
      affiliation: staffAffiliations,
      userName: users.fullName,
      userEmail: users.email,
      userPhone: users.phone,
      hospitalName: hospitalsTable.name,
      hospitalLevel: hospitalsTable.level,
      departmentName: hospitalDepartments.name,
      roleName: refRoles.name,
      cadreName: refCadres.name,
      specialtyName: refSpecialties.name,
      council: refCouncils.name,
      registrationNumber: clinicianProfiles.registrationNumber,
      registrationExpiry: clinicianProfiles.registrationExpiry,
      licenceDocumentPath: clinicianProfiles.licenceDocumentPath,
    })
    .from(staffAffiliations)
    .leftJoin(users, eq(users.id, staffAffiliations.userId))
    .leftJoin(hospitalsTable, eq(hospitalsTable.id, staffAffiliations.hospitalId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, staffAffiliations.departmentId))
    .leftJoin(refRoles, eq(refRoles.id, staffAffiliations.roleId))
    .leftJoin(refCadres, eq(refCadres.id, staffAffiliations.cadreId))
    .leftJoin(refSpecialties, eq(refSpecialties.id, staffAffiliations.specialtyId))
    .leftJoin(clinicianProfiles, eq(clinicianProfiles.userId, staffAffiliations.userId))
    .leftJoin(refCouncils, eq(refCouncils.id, clinicianProfiles.councilId))
    .where(eq(staffAffiliations.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) notFound();

  // Hospital_admins can only see affiliations at their hospital(s).
  if (!isSuperadmin && !adminHospitalIds(auth).includes(row.affiliation.hospitalId)) {
    redirect("/admin/affiliations?denied=scope");
  }

  const a = row.affiliation;
  const pending = a.state === "pending_approval";

  return (
    <div className="mx-auto flex w-full max-w-200 flex-col gap-8 px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/affiliations"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[12.5px] transition-colors"
        >
          &larr; All affiliations
        </Link>
        <h1
          className="font-display text-foreground mt-2 text-[28px] leading-[1.1] tracking-[-0.025em] text-balance"
          style={{ fontWeight: 400 }}
        >
          {row.userName ?? "—"}
        </h1>
        <p className="text-muted-foreground text-[14px]">
          {row.roleName ?? "—"} · {row.cadreName ?? "—"} · <StatePill state={a.state} />
        </p>
      </div>

      <Card title="Clinician">
        <DL
          rows={[
            ["Email", row.userEmail ?? "—"],
            ["Phone", row.userPhone ?? "—"],
            ["Council", row.council ?? "—"],
            [
              "Registration #",
              row.registrationNumber ? (
                <code className="font-mono text-[12px]">{row.registrationNumber}</code>
              ) : (
                "—"
              ),
            ],
            [
              "Registration expiry",
              row.registrationExpiry
                ? row.registrationExpiry.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—",
            ],
            [
              "Licence document",
              row.licenceDocumentPath ? (
                <code className="font-mono text-[11px] break-all">{row.licenceDocumentPath}</code>
              ) : (
                <span className="text-status-critical-fg">Missing</span>
              ),
            ],
          ]}
        />
      </Card>

      <Card title="Affiliation">
        <DL
          rows={[
            ["Hospital", row.hospitalName ?? "—"],
            ["Hospital level", row.hospitalLevel?.replace(/_/g, " ") ?? "—"],
            ["Department", row.departmentName ?? "—"],
            ["Specialty", row.specialtyName ?? "—"],
            ["Employment", a.employmentType.replace(/_/g, " ")],
            [
              "Submitted",
              a.createdAt.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }),
            ],
          ]}
        />
      </Card>

      {a.rejectionReason ? (
        <Card title="Prior decision notes">
          <p className="text-foreground text-[13px] whitespace-pre-line">{a.rejectionReason}</p>
        </Card>
      ) : null}

      {pending ? (
        <AffiliationDecisionForms affiliationId={a.id} />
      ) : (
        <Card title="Decision">
          <p className="text-muted-foreground text-[13px]">
            This affiliation is already in state <strong>{a.state.replace(/_/g, " ")}</strong>.
          </p>
        </Card>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-lg border p-5">
      <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
        {title}
      </span>
      {children}
    </section>
  );
}

function DL({ rows }: { rows: ReadonlyArray<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[180px_1fr]">
      {rows.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground text-[12px]">{key}</dt>
          <dd className="text-foreground text-[13px]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatePill({ state }: { state: string }) {
  const tone =
    state === "active" || state === "approved"
      ? "bg-teal-500/15 text-teal-700 dark:text-teal-300"
      : state === "rejected"
        ? "bg-red-500/15 text-red-700 dark:text-red-300"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  const label =
    state === "pending_approval"
      ? "Pending"
      : state === "active" || state === "approved"
        ? "Approved"
        : state === "rejected"
          ? "Rejected"
          : state.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-medium ${tone}`}
    >
      {label}
    </span>
  );
}
