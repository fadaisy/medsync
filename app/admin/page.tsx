import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { hospitalApplications, staffAffiliations } from "@/db/schema";
import { adminHospitalIds, requireAdminish } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20 });
const db = drizzle(sql);

/**
 * /admin — landing card. Surfaces the two pending-review counts so
 * the operator sees at a glance whether anything needs attention.
 */
export default async function AdminLandingPage() {
  const state = await requireAdminish();
  const isSuperadmin = state.roles.includes("superadmin");

  const [pendingApps, pendingAffils] = await Promise.all([
    isSuperadmin
      ? db
          .select({ id: hospitalApplications.id })
          .from(hospitalApplications)
          .where(eq(hospitalApplications.state, "pending_approval"))
      : Promise.resolve([] as Array<{ id: string }>),
    pendingAffiliationsFor(state, isSuperadmin),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-300 flex-col gap-8 px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Review queues
        </span>
        <h1
          className="font-display text-foreground text-[32px] leading-[1.1] tracking-[-0.025em] text-balance"
          style={{ fontWeight: 400 }}
        >
          {isSuperadmin ? "Approvals — superadmin." : "Approvals — hospital admin."}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {isSuperadmin ? (
          <QueueCard
            href="/admin/applications"
            label="Hospital applications"
            count={pendingApps.length}
            description="Facilities applying for a MedSync pilot. Confirm registration + applicant authority before approving."
          />
        ) : null}
        <QueueCard
          href="/admin/affiliations"
          label="Staff affiliations"
          count={pendingAffils.length}
          description={
            isSuperadmin
              ? "Pending clinician affiliations across all hospitals."
              : "Pending clinician affiliations at the hospital(s) you administer."
          }
        />
      </div>
    </div>
  );
}

function QueueCard({
  href,
  label,
  count,
  description,
}: {
  href: string;
  label: string;
  count: number;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="border-border bg-card flex flex-col gap-3 rounded-lg border p-5 transition-colors hover:border-teal-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 dark:hover:border-teal-700"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          {label}
        </span>
        <span
          className={
            count > 0
              ? "inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500/15 px-2 text-[12px] font-medium text-amber-700 dark:text-amber-400"
              : "inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-teal-500/15 px-2 text-[12px] font-medium text-teal-700 dark:text-teal-300"
          }
        >
          {count}
        </span>
      </div>
      <p className="text-foreground text-[14px] leading-snug">{description}</p>
      <span className="text-muted-foreground mt-1 text-[12px]">Open queue &rarr;</span>
    </Link>
  );
}

async function pendingAffiliationsFor(
  state: Awaited<ReturnType<typeof requireAdminish>>,
  isSuperadmin: boolean,
): Promise<Array<{ id: string }>> {
  if (isSuperadmin) {
    return db
      .select({ id: staffAffiliations.id })
      .from(staffAffiliations)
      .where(eq(staffAffiliations.state, "pending_approval"));
  }
  const hospitals = adminHospitalIds(state);
  if (hospitals.length === 0) return [];
  return db
    .select({ id: staffAffiliations.id })
    .from(staffAffiliations)
    .where(
      and(
        eq(staffAffiliations.state, "pending_approval"),
        inArray(staffAffiliations.hospitalId, hospitals),
      ),
    );
}
