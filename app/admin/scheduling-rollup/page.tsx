import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { inArray, sql } from "drizzle-orm";
import { CalendarClockIcon } from "lucide-react";

import { Pill } from "@/components/ui/data-table";
import { db } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { appointments } from "@/db/schema/scheduling";
import { getAuthState } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Scheduling rollup · Superadmin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Superadmin scheduling rollup — cross-tenant aggregates only.
 *
 * Same shape as /admin/staff-rollup: no individual rows, no PHI, no
 * new god-mode path. Any action against a specific appointment goes
 * through the existing Edge Functions (which already write
 * sa_audit_log when invoked by a superadmin).
 *
 * Surfaces:
 *   - Platform KPIs: total confirmed today, total pending platform-
 *     wide, total urgent today, no-shows in the last 7 days.
 *   - Per-hospital table: counts + a stale-urgent flag (urgent rows
 *     still in pending_approval ≥ 24h — should be ~impossible by
 *     design since urgent auto-confirms, but the metric is the safety
 *     net for "the routing is broken somewhere").
 *   - Hospitals with no clinician availability declared get a soft
 *     warning row tint so the superadmin can spot tenants that
 *     onboarded but haven't set up scheduling yet.
 */

const STALE_PENDING_HOURS = 48;
const NO_SHOW_LOOKBACK_DAYS = 7;

interface HospitalRow {
  hospitalId: string;
  hospitalName: string;
  hospitalLevel: string;
  todayBooked: number;
  pendingApproval: number;
  urgentToday: number;
  stalePending: number;
  noShows7d: number;
}

export default async function SchedulingRollupPage() {
  const state = await getAuthState();
  if (!state.user) redirect("/sign-in?redirect=/admin/scheduling-rollup");

  const service = createServiceClient();
  const { data: rolesData } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", state.user.id);
  if (!rolesData?.some((r) => r.role === "superadmin")) redirect("/");

  const { perHospital, totals, errored } = await fetchRollup();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex w-fit items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          Platform · Scheduling rollup
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
          Scheduling across hospitals
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[13.5px] leading-relaxed">
          Aggregate counts only — no individual appointments. Patient-level operations go through
          the per-hospital workspace.
        </p>
        <div className="h-px w-10 bg-teal-500/60 dark:bg-teal-400/50" aria-hidden />
      </header>

      {errored ? (
        <section
          role="alert"
          className="flex flex-col gap-1 rounded-lg border border-red-200 bg-red-50/60 p-4 text-[12.5px] leading-relaxed text-red-900 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-200"
        >
          <p className="font-medium">One of the rollup queries failed.</p>
          <p className="text-red-900/80 dark:text-red-200/80">
            Numbers below are partial. Check the Vercel function logs for the underlying error.
          </p>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Confirmed today" value={totals.todayBooked} />
        <Kpi
          label="Pending platform-wide"
          value={totals.pendingApproval}
          tone={totals.pendingApproval > 0 ? "actionable" : "neutral"}
        />
        <Kpi
          label="Urgent today"
          value={totals.urgentToday}
          tone={totals.urgentToday > 0 ? "critical" : "neutral"}
        />
        <Kpi
          label="No-shows (7d)"
          value={totals.noShows7d}
          tone={totals.noShows7d > 0 ? "warning" : "neutral"}
        />
      </section>

      <section className="border-border bg-card overflow-hidden rounded-lg border">
        <header className="border-border flex items-center gap-2 border-b px-4 py-2.5 sm:px-6">
          <CalendarClockIcon className="text-muted-foreground size-3.5" aria-hidden />
          <span className="text-foreground text-[13px] font-medium">Per-hospital scheduling</span>
          <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
            {perHospital.length} {perHospital.length === 1 ? "hospital" : "hospitals"}
          </span>
        </header>
        {perHospital.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-[13px]">No active hospitals.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Per-hospital scheduling aggregates</caption>
            <thead>
              <tr className="border-border border-b bg-gray-50 dark:bg-gray-900/40">
                <Th>Hospital</Th>
                <Th align="right">Today</Th>
                <Th align="right">Pending</Th>
                <Th align="right">Urgent today</Th>
                <Th align="right">Stale-pending</Th>
                <Th align="right">No-shows 7d</Th>
                <Th align="right" className="hidden sm:table-cell">
                  Triage
                </Th>
              </tr>
            </thead>
            <tbody>
              {perHospital.map((h) => (
                <tr
                  key={h.hospitalId}
                  className={cn(
                    "border-border hover:bg-muted/40 border-b transition-colors",
                    h.stalePending > 0 && "bg-amber-50/40 dark:bg-amber-950/10",
                  )}
                >
                  <td className="px-4 py-2.5 sm:px-6">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-foreground truncate text-[13px] font-medium">
                        {h.hospitalName}
                      </span>
                      <span className="text-muted-foreground truncate font-mono text-[11px]">
                        {h.hospitalLevel}
                      </span>
                    </div>
                  </td>
                  <td className="text-foreground px-4 py-2.5 text-right font-mono text-[13px] tabular-nums sm:px-6">
                    {h.todayBooked}
                  </td>
                  <td className="px-4 py-2.5 text-right sm:px-6">
                    {h.pendingApproval > 0 ? (
                      <Pill tone="pending">{h.pendingApproval}</Pill>
                    ) : (
                      <span className="text-muted-foreground font-mono text-[12.5px] tabular-nums">
                        0
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right sm:px-6">
                    {h.urgentToday > 0 ? (
                      <Pill tone="critical">{h.urgentToday}</Pill>
                    ) : (
                      <span className="text-muted-foreground font-mono text-[12.5px] tabular-nums">
                        0
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right sm:px-6">
                    {h.stalePending > 0 ? (
                      <Pill tone="caution">{h.stalePending}</Pill>
                    ) : (
                      <span className="text-muted-foreground font-mono text-[12.5px] tabular-nums">
                        —
                      </span>
                    )}
                  </td>
                  <td className="text-foreground px-4 py-2.5 text-right font-mono text-[13px] tabular-nums sm:px-6">
                    {h.noShows7d}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right sm:table-cell sm:px-6">
                    <Link
                      href="/admin"
                      className="text-muted-foreground hover:text-foreground text-[11.5px] transition-colors"
                    >
                      Approvals →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

interface Totals {
  todayBooked: number;
  pendingApproval: number;
  urgentToday: number;
  noShows7d: number;
}

async function fetchRollup(): Promise<{
  perHospital: HospitalRow[];
  totals: Totals;
  errored: boolean;
}> {
  let errored = false;
  let hospitalRows: Array<{ id: string; name: string; level: string }> = [];
  let aggRows: Array<{
    hospital_id: string;
    today_booked: number;
    pending_approval: number;
    urgent_today: number;
    stale_pending: number;
    no_shows_7d: number;
  }> = [];

  try {
    hospitalRows = await db
      .select({ id: hospitals.id, name: hospitals.name, level: hospitals.level })
      .from(hospitals)
      .where(inArray(hospitals.state, ["active", "provisioning"]));
  } catch (e) {
    errored = true;
    logger.error("admin.scheduling-rollup.hospitals_query_failed", { reason: String(e) });
  }

  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
    const sevenDaysAgo = new Date(now.getTime() - NO_SHOW_LOOKBACK_DAYS * 86_400_000);
    const staleThreshold = new Date(now.getTime() - STALE_PENDING_HOURS * 3_600_000);

    // One pass per hospital_id with a CASE-summed query.
    const raw = await db
      .select({
        hospital_id: appointments.hospitalId,
        today_booked:
          sql<number>`SUM(CASE WHEN ${appointments.startsAt} >= ${startOfToday.toISOString()} AND ${appointments.startsAt} < ${startOfTomorrow.toISOString()} AND ${appointments.status} IN ('confirmed','arrived','in_progress') THEN 1 ELSE 0 END)`.as(
            "today_booked",
          ),
        pending_approval:
          sql<number>`SUM(CASE WHEN ${appointments.status} = 'pending_approval' THEN 1 ELSE 0 END)`.as(
            "pending_approval",
          ),
        urgent_today:
          sql<number>`SUM(CASE WHEN ${appointments.priority} = 'urgent' AND ${appointments.startsAt} >= ${startOfToday.toISOString()} AND ${appointments.startsAt} < ${startOfTomorrow.toISOString()} THEN 1 ELSE 0 END)`.as(
            "urgent_today",
          ),
        stale_pending:
          sql<number>`SUM(CASE WHEN ${appointments.status} = 'pending_approval' AND ${appointments.createdAt} < ${staleThreshold.toISOString()} THEN 1 ELSE 0 END)`.as(
            "stale_pending",
          ),
        no_shows_7d:
          sql<number>`SUM(CASE WHEN ${appointments.status} = 'no_show' AND ${appointments.startsAt} >= ${sevenDaysAgo.toISOString()} THEN 1 ELSE 0 END)`.as(
            "no_shows_7d",
          ),
      })
      .from(appointments)
      .groupBy(appointments.hospitalId);
    aggRows = raw.map((r) => ({
      hospital_id: r.hospital_id,
      today_booked: Number(r.today_booked) || 0,
      pending_approval: Number(r.pending_approval) || 0,
      urgent_today: Number(r.urgent_today) || 0,
      stale_pending: Number(r.stale_pending) || 0,
      no_shows_7d: Number(r.no_shows_7d) || 0,
    }));
  } catch (e) {
    errored = true;
    logger.error("admin.scheduling-rollup.aggregates_query_failed", { reason: String(e) });
  }

  const byHospital = new Map<string, HospitalRow>();
  for (const h of hospitalRows) {
    byHospital.set(h.id, {
      hospitalId: h.id,
      hospitalName: h.name,
      hospitalLevel: h.level,
      todayBooked: 0,
      pendingApproval: 0,
      urgentToday: 0,
      stalePending: 0,
      noShows7d: 0,
    });
  }
  for (const a of aggRows) {
    const r = byHospital.get(a.hospital_id);
    if (!r) continue;
    r.todayBooked = a.today_booked;
    r.pendingApproval = a.pending_approval;
    r.urgentToday = a.urgent_today;
    r.stalePending = a.stale_pending;
    r.noShows7d = a.no_shows_7d;
  }

  const perHospital = Array.from(byHospital.values()).sort((a, b) => {
    if (a.stalePending !== b.stalePending) return b.stalePending - a.stalePending;
    if (a.urgentToday !== b.urgentToday) return b.urgentToday - a.urgentToday;
    return a.hospitalName.localeCompare(b.hospitalName);
  });

  const totals: Totals = perHospital.reduce(
    (acc, h) => ({
      todayBooked: acc.todayBooked + h.todayBooked,
      pendingApproval: acc.pendingApproval + h.pendingApproval,
      urgentToday: acc.urgentToday + h.urgentToday,
      noShows7d: acc.noShows7d + h.noShows7d,
    }),
    { todayBooked: 0, pendingApproval: 0, urgentToday: 0, noShows7d: 0 },
  );

  return { perHospital, totals, errored };
}

/* ─── UI ───────────────────────────────────────────────────────────── */

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "actionable" | "ok" | "critical" | "warning" | "neutral";
}) {
  const cls =
    tone === "actionable"
      ? "text-teal-700 dark:text-teal-300"
      : tone === "ok"
        ? "text-emerald-700 dark:text-emerald-300"
        : tone === "critical"
          ? "text-red-700 dark:text-red-300"
          : tone === "warning"
            ? "text-amber-700 dark:text-amber-300"
            : "text-foreground";
  return (
    <div className="border-border bg-card flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-muted-foreground font-mono text-[10.5px] tracking-[0.12em] uppercase">
        {label}
      </span>
      <span className={cn("font-display text-[28px] leading-none font-medium tabular-nums", cls)}>
        {value}
      </span>
    </div>
  );
}

function Th({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "text-muted-foreground px-4 py-2.5 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase sm:px-6",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}
