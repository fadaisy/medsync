import type { SQL } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { hospitals as hospitalsTable, refRoles, staffAffiliations, users } from "@/db/schema";
import { adminHospitalIds, requireAdminish } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Staff affiliations" };
export const dynamic = "force-dynamic";

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20 });
const db = drizzle(sql);

/**
 * /admin/affiliations — pending staff affiliations queue.
 *
 * Visible to superadmin (all hospitals) and hospital_admin (their
 * hospital(s) only — the WHERE clause filters by adminHospitalIds()).
 *
 * Each row links to a detail page where the admin can approve or
 * reject the affiliation with a reason.
 */
export default async function StaffAffiliationsQueuePage() {
  const state = await requireAdminish();
  const isSuperadmin = state.roles.includes("superadmin");
  const hospitals = adminHospitalIds(state);

  let scopeFilter: SQL | undefined;
  if (!isSuperadmin) {
    if (hospitals.length === 0) {
      // Hospital_admin without any hospital scope — nothing to show.
      return (
        <EmptyShell
          title="No hospitals assigned."
          body="Your account holds the hospital_admin role but isn't scoped to any hospital yet. Talk to a MedSync superadmin to repair this."
        />
      );
    }
    scopeFilter = inArray(staffAffiliations.hospitalId, hospitals);
  }

  const rows = await db
    .select({
      affiliation: staffAffiliations,
      userName: users.fullName,
      userEmail: users.email,
      hospitalName: hospitalsTable.name,
      roleName: refRoles.name,
    })
    .from(staffAffiliations)
    .leftJoin(users, eq(users.id, staffAffiliations.userId))
    .leftJoin(hospitalsTable, eq(hospitalsTable.id, staffAffiliations.hospitalId))
    .leftJoin(refRoles, eq(refRoles.id, staffAffiliations.roleId))
    .where(scopeFilter ? and(scopeFilter) : undefined)
    .orderBy(desc(staffAffiliations.createdAt))
    .limit(200);

  const pending = rows.filter((r) => r.affiliation.state === "pending_approval");
  const decided = rows.filter((r) => r.affiliation.state !== "pending_approval");

  return (
    <div className="mx-auto flex w-full max-w-300 flex-col gap-8 px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          {isSuperadmin ? "Superadmin queue" : "Hospital admin queue"}
        </span>
        <h1
          className="font-display text-foreground text-[28px] leading-[1.1] tracking-[-0.025em] text-balance"
          style={{ fontWeight: 400 }}
        >
          Staff affiliations.
        </h1>
        <p className="text-muted-foreground text-[14px]">
          {pending.length} pending · {decided.length} decided.
        </p>
      </div>

      <Section title="Pending review" emptyLabel="No affiliations waiting." rows={pending} />
      <Section title="Recently decided" emptyLabel="No prior decisions." rows={decided} />
    </div>
  );
}

interface JoinedRow {
  affiliation: {
    id: string;
    state: string;
    employmentType: string;
    createdAt: Date;
  };
  userName: string | null;
  userEmail: string | null;
  hospitalName: string | null;
  roleName: string | null;
}

function Section({
  title,
  emptyLabel,
  rows,
}: {
  title: string;
  emptyLabel: string;
  rows: ReadonlyArray<JoinedRow>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
        {title}
      </span>
      {rows.length === 0 ? (
        <p className="text-muted-foreground bg-card border-border rounded-md border p-4 text-[13px]">
          {emptyLabel}
        </p>
      ) : (
        <ul className="border-border bg-card divide-gray-150 flex flex-col divide-y rounded-lg border dark:divide-gray-800">
          {rows.map((r) => (
            <li key={r.affiliation.id}>
              <Link
                href={`/admin/affiliations/${r.affiliation.id}`}
                className="hover:bg-muted/40 flex items-center justify-between gap-4 px-4 py-3 transition-colors"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-foreground truncate text-[14px] font-medium">
                    {r.userName ?? "—"}{" "}
                    <span className="text-muted-foreground font-normal">· {r.roleName ?? "—"}</span>
                  </span>
                  <span className="text-muted-foreground truncate text-[12px]">
                    {r.hospitalName ?? "—"} · {r.affiliation.employmentType.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <StatePill state={r.affiliation.state} />
                  <span className="text-muted-foreground hidden font-mono text-[11px] sm:inline">
                    {r.affiliation.createdAt.toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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

function EmptyShell({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto flex w-full max-w-200 flex-col gap-3 px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-foreground text-[24px] tracking-tight">{title}</h1>
      <p className="text-muted-foreground text-[14px]">{body}</p>
    </div>
  );
}
