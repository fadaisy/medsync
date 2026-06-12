import Link from "next/link";
import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { ArrowRightIcon, CalendarClockIcon } from "lucide-react";

import { db } from "@/db";
import { appointments } from "@/db/schema/scheduling";
import { cn } from "@/lib/utils";

/**
 * Scheduling summary tile for the hospital-admin Overview surface.
 *
 * Mirrors the StaffOverviewCard pattern: self-contained server
 * component, fetches its own aggregates, drops into a KPI grid or
 * renders standalone on the placeholder overview page.
 *
 * All counts are scoped to THIS hospital. No PHI.
 */

export interface SchedulingOverviewCardProps {
  hospitalId: string;
  variant?: "card" | "panel";
  className?: string;
}

interface SchedulingStats {
  todayBooked: number;
  pendingApproval: number;
  urgentToday: number;
  noShows7d: number;
}

const NO_SHOW_LOOKBACK_DAYS = 7;

async function fetchStats(hospitalId: string): Promise<SchedulingStats> {
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
    const sevenDaysAgo = new Date(now.getTime() - NO_SHOW_LOOKBACK_DAYS * 86_400_000);

    const [todayCounts, pendingRow, noShowRow] = await Promise.all([
      // Aggregated counts for today, split by priority.
      db
        .select({
          priority: appointments.priority,
          value: count(),
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.hospitalId, hospitalId),
            inArray(appointments.status, ["confirmed", "arrived", "in_progress"]),
            gte(appointments.startsAt, startOfToday),
            lt(appointments.startsAt, startOfTomorrow),
          ),
        )
        .groupBy(appointments.priority),
      db
        .select({ value: count() })
        .from(appointments)
        .where(
          and(eq(appointments.hospitalId, hospitalId), eq(appointments.status, "pending_approval")),
        ),
      db
        .select({ value: count() })
        .from(appointments)
        .where(
          and(
            eq(appointments.hospitalId, hospitalId),
            eq(appointments.status, "no_show"),
            gte(appointments.startsAt, sevenDaysAgo),
          ),
        ),
    ]);

    const byPriority = Object.fromEntries(todayCounts.map((r) => [r.priority, r.value])) as Record<
      string,
      number
    >;
    const todayBooked = (byPriority["routine"] ?? 0) + (byPriority["urgent"] ?? 0);
    const urgentToday = byPriority["urgent"] ?? 0;

    return {
      todayBooked,
      pendingApproval: pendingRow[0]?.value ?? 0,
      urgentToday,
      noShows7d: noShowRow[0]?.value ?? 0,
    };
  } catch {
    return { todayBooked: 0, pendingApproval: 0, urgentToday: 0, noShows7d: 0 };
  }
}

export async function SchedulingOverviewCard({
  hospitalId,
  variant = "card",
  className,
}: SchedulingOverviewCardProps) {
  const stats = await fetchStats(hospitalId);
  const isPanel = variant === "panel";

  return (
    <section
      className={cn(
        "border-border bg-card flex flex-col gap-4 rounded-lg border",
        isPanel ? "p-6" : "p-5",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-foreground inline-flex items-center gap-2 text-[14px] font-medium tracking-[-0.005em]">
          <CalendarClockIcon className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
          Scheduling
        </h2>
        <Link
          href="/hospital-admin/scheduling"
          className="text-muted-foreground hover:text-foreground group inline-flex items-center gap-1 text-[11.5px] transition-colors"
        >
          View
          <ArrowRightIcon
            className="size-3 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Today" value={stats.todayBooked} tone="neutral" hint="confirmed bookings" />
        <Stat
          label="Pending"
          value={stats.pendingApproval}
          tone={stats.pendingApproval > 0 ? "actionable" : "neutral"}
          hint="awaiting clinician"
        />
        <Stat
          label="Urgent today"
          value={stats.urgentToday}
          tone={stats.urgentToday > 0 ? "critical" : "neutral"}
          hint="alert-triggered"
        />
        <Stat
          label="No-shows (7d)"
          value={stats.noShows7d}
          tone={stats.noShows7d > 0 ? "warning" : "neutral"}
          hint="signal only"
        />
      </div>

      {isPanel ? (
        <p className="text-muted-foreground border-border/60 border-t pt-3 text-[12px] leading-relaxed">
          Operational signals. Per-clinician schedules live in each clinician&apos;s workspace —
          this rolls up the hospital-wide view.
        </p>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "actionable" | "ok" | "critical" | "warning" | "neutral";
  hint?: string;
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
    <div className="border-border/60 rounded-md border p-3 transition-colors hover:border-gray-300">
      <span className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
        {label}
      </span>
      <div className={cn("mt-1 font-mono text-[24px] leading-none font-medium tabular-nums", cls)}>
        {value}
      </div>
      {hint ? <span className="text-muted-foreground text-[10.5px]">{hint}</span> : null}
    </div>
  );
}
