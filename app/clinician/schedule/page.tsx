import type { ScheduleAppointmentRow } from "./_components/schedule-list";
import type { PillTone } from "@/components/ui/data-table";
import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { appointments } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { requireClinicianScope } from "@/lib/clinician/scope";
import { ScheduleList } from "./_components/schedule-list";

export const metadata: Metadata = { title: "Schedule · MedSync" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ aff?: string }>;
}

const STATUS_TONES: Record<string, PillTone> = {
  pending_approval: "pending",
  confirmed: "stable",
  arrived: "admitted",
  in_progress: "admitted",
};

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Awaiting your approval",
  confirmed: "Confirmed",
  arrived: "Arrived",
  in_progress: "In progress",
};

const VISIBLE_STATUSES = ["pending_approval", "confirmed", "arrived", "in_progress"] as const;

export default async function ClinicianSchedulePage({ searchParams }: PageProps) {
  const scope = await requireClinicianScope();
  const params = await searchParams;

  const today = startOfDayUTC();
  const fortnight = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: appointments.id,
      status: appointments.status,
      priority: appointments.priority,
      type: appointments.type,
      reason: appointments.reason,
      reasonNote: appointments.reasonNote,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      patientUserId: appointments.patientUserId,
      patientName: users.fullName,
      patientCode: patientProfiles.patientCode,
    })
    .from(appointments)
    .innerJoin(users, eq(users.id, appointments.patientUserId))
    .leftJoin(patientProfiles, eq(patientProfiles.id, appointments.patientUserId))
    .where(
      and(
        eq(appointments.clinicianUserId, scope.userId),
        eq(appointments.hospitalId, scope.hospitalId),
        inArray(appointments.status, [...VISIBLE_STATUSES]),
        gte(appointments.startsAt, today),
        lt(appointments.startsAt, fortnight),
      ),
    )
    .orderBy(asc(appointments.startsAt));

  const list: ScheduleAppointmentRow[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    priority: r.priority,
    type: r.type,
    reason: r.reason,
    reasonNote: r.reasonNote,
    startsAtIso: r.startsAt.toISOString(),
    endsAtIso: r.endsAt.toISOString(),
    patientName: r.patientName ?? "Patient",
    patientCode: r.patientCode ?? null,
  }));

  const pendingCount = list.filter((r) => r.status === "pending_approval").length;
  const urgentCount = list.filter((r) => r.priority === "urgent").length;

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Quiet atmosphere — a 5% teal wash behind the header, nothing louder. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(13,148,136,0.05),transparent_70%)]"
      />

      <header className="reveal-up flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex w-fit items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          {scope.hospitalName} · {scope.departmentName}
        </span>
        <h1 className="font-display text-foreground sm:text-heading-l text-[24px] leading-[1.15] font-medium tracking-[-0.015em]">
          Your schedule
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[13.5px] leading-relaxed">
          Confirmed and pending appointments for the next 14 days.{" "}
          <Link
            href="/clinician/availability"
            className="text-foreground underline-offset-2 hover:underline"
          >
            Change availability
          </Link>
          .
        </p>
        <div className="bg-brand-500/60 dark:bg-brand-400/50 h-px w-10" aria-hidden />
      </header>

      <section className="stagger-children grid grid-cols-3 gap-3">
        <Kpi label="Booked" value={list.length} tone="neutral" />
        <Kpi
          label="Awaiting approval"
          value={pendingCount}
          tone={pendingCount > 0 ? "actionable" : "neutral"}
        />
        <Kpi label="Urgent" value={urgentCount} tone={urgentCount > 0 ? "critical" : "neutral"} />
      </section>

      <ScheduleList
        rows={list}
        selectedAppointmentId={params.aff ?? null}
        statusTones={STATUS_TONES}
        statusLabel={STATUS_LABEL}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "actionable" | "critical" | "neutral";
}) {
  const cls =
    tone === "actionable"
      ? "text-brand-700 dark:text-brand-300"
      : tone === "critical"
        ? "text-red-700 dark:text-red-300"
        : "text-foreground";
  return (
    <div className="border-border bg-card card-lift flex flex-col gap-1 rounded-lg border p-3.5">
      <span className="text-muted-foreground font-mono text-[10.5px] tracking-[0.12em] uppercase">
        {label}
      </span>
      <span className={"font-display text-[24px] leading-none font-medium tabular-nums " + cls}>
        {value}
      </span>
    </div>
  );
}

function startOfDayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Re-export the Pill component type so the child doesn't import twice.
export type { PillTone };
