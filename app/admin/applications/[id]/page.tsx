import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { hospitalApplications, refDistricts, refSubcounties, users } from "@/db/schema";
import { requireSuperadmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { ApplicationDecisionForms } from "./_forms";

export const metadata: Metadata = { title: "Review hospital application" };
export const dynamic = "force-dynamic";

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20 });
const db = drizzle(sql);

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HospitalApplicationDetailPage({ params }: PageProps) {
  await requireSuperadmin();
  const { id } = await params;

  const rows = await db
    .select({
      application: hospitalApplications,
      applicantEmail: users.email,
      applicantName: users.fullName,
      districtName: refDistricts.name,
      subcountyName: refSubcounties.name,
    })
    .from(hospitalApplications)
    .leftJoin(users, eq(users.id, hospitalApplications.applicantUserId))
    .leftJoin(refDistricts, eq(refDistricts.id, hospitalApplications.districtId))
    .leftJoin(refSubcounties, eq(refSubcounties.id, hospitalApplications.subcountyId))
    .where(eq(hospitalApplications.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) notFound();

  const a = row.application;
  const pending = a.state === "pending_approval";

  return (
    <div className="mx-auto flex w-full max-w-200 flex-col gap-8 px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/applications"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[12.5px] transition-colors"
        >
          &larr; All applications
        </Link>
        <h1
          className="font-display text-foreground mt-2 text-[28px] leading-[1.1] tracking-[-0.025em] text-balance"
          style={{ fontWeight: 400 }}
        >
          {a.hospitalName}
        </h1>
        <p className="text-muted-foreground text-[14px]">
          {a.level.replace(/_/g, " ")} · {a.ownership.replace(/_/g, " ")} ·{" "}
          <StatePill state={a.state} />
        </p>
      </div>

      <Card title="Facility">
        <DL
          rows={[
            ["Registration #", a.registrationNumber],
            ["Registering authority", a.registrationAuthority ?? "—"],
            ["District", row.districtName ?? "—"],
            ["Subcounty / division", row.subcountyName ?? "—"],
            ["Physical address", a.physicalAddress],
            [
              "Institutional email domain",
              a.institutionalEmailDomain ? (
                <code className="font-mono text-[12px]">{a.institutionalEmailDomain}</code>
              ) : (
                "—"
              ),
            ],
          ]}
        />
      </Card>

      <Card title="Applicant">
        <DL
          rows={[
            ["Name", row.applicantName ?? "—"],
            ["Email", row.applicantEmail ?? "—"],
            ["Role at facility", a.applicantRole],
            [
              "Authorisation letter",
              a.authorisationDocumentPath ? (
                <code className="font-mono text-[11px] break-all">
                  {a.authorisationDocumentPath}
                </code>
              ) : (
                <span className="text-status-critical-fg">Missing</span>
              ),
            ],
          ]}
        />
        {a.authorisationDocumentPath ? (
          <p className="text-muted-foreground mt-2 text-[11.5px] italic">
            Document path on the private hospital-authorisations bucket. Open via Supabase Studio or
            a signed-URL helper (GATE G surface).
          </p>
        ) : null}
      </Card>

      {a.rejectionReason ? (
        <Card title="Prior decision notes">
          <p className="text-foreground text-[13px] whitespace-pre-line">{a.rejectionReason}</p>
        </Card>
      ) : null}

      {pending ? (
        <ApplicationDecisionForms applicationId={a.id} />
      ) : (
        <Card title="Decision">
          <p className="text-muted-foreground text-[13px]">
            This application is already in state <strong>{a.state.replace(/_/g, " ")}</strong>.
            Re-opening a decided application is a service-role operation — talk to the engineering
            on-call.
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
    state === "approved" || state === "active"
      ? "bg-teal-500/15 text-teal-700 dark:text-teal-300"
      : state === "rejected"
        ? "bg-red-500/15 text-red-700 dark:text-red-300"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  const label =
    state === "pending_approval"
      ? "Pending"
      : state === "approved" || state === "active"
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
