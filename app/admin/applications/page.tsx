import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { hospitalApplications } from "@/db/schema";
import { requireSuperadmin } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Hospital applications" };
export const dynamic = "force-dynamic";

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20 });
const db = drizzle(sql);

/**
 * /admin/applications — superadmin queue of hospital applications.
 * Shows pending first (top), then recent decisions for traceability.
 */
export default async function HospitalApplicationsQueuePage() {
  await requireSuperadmin();

  const rows = await db
    .select()
    .from(hospitalApplications)
    .orderBy(desc(hospitalApplications.createdAt))
    .limit(100);

  const pending = rows.filter((r) => r.state === "pending_approval");
  const decided = rows.filter((r) => r.state !== "pending_approval");

  return (
    <div className="mx-auto flex w-full max-w-300 flex-col gap-8 px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Superadmin queue
        </span>
        <h1
          className="font-display text-foreground text-[28px] leading-[1.1] tracking-[-0.025em] text-balance"
          style={{ fontWeight: 400 }}
        >
          Hospital applications.
        </h1>
        <p className="text-muted-foreground text-[14px]">
          {pending.length} pending · {decided.length} decided.
        </p>
      </div>

      <Section title="Pending review" emptyLabel="No applications waiting." rows={pending} />

      <Section title="Recently decided" emptyLabel="No prior decisions." rows={decided} />
    </div>
  );
}

interface Row {
  id: string;
  hospitalName: string;
  level: string;
  ownership: string;
  state: string;
  createdAt: Date;
  rejectionReason: string | null;
}

function Section({
  title,
  emptyLabel,
  rows,
}: {
  title: string;
  emptyLabel: string;
  rows: ReadonlyArray<Row>;
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
            <li key={r.id}>
              <Link
                href={`/admin/applications/${r.id}`}
                className="hover:bg-muted/40 flex items-center justify-between gap-4 px-4 py-3 transition-colors"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-foreground truncate text-[14px] font-medium">
                    {r.hospitalName}
                  </span>
                  <span className="text-muted-foreground text-[12px]">
                    {r.level.replace(/_/g, " ")} · {r.ownership.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <StatePill state={r.state} />
                  <span className="text-muted-foreground hidden font-mono text-[11px] sm:inline">
                    {r.createdAt.toLocaleDateString("en-GB", {
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
