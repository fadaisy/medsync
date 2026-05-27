import type { PillTone } from "@/components/ui/data-table";
import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { CalendarPlusIcon, HospitalIcon } from "lucide-react";

import { Pill } from "@/components/ui/data-table";
import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { appointments } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { requirePatientScope } from "@/lib/patient/scope";
import { CancelButton } from "./_components/cancel-button";

const CANCELLABLE = new Set(["requested", "pending_approval", "confirmed", "arrived"]);

export const metadata: Metadata = { title: "Appointments · MedSync" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, PillTone> = {
  requested: "pending",
  pending_approval: "pending",
  confirmed: "stable",
  arrived: "admitted",
  in_progress: "admitted",
  completed: "discharged",
  cancelled: "neutral",
  no_show: "caution",
  rescheduled: "neutral",
  declined: "critical",
};

const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  pending_approval: "Awaiting approval",
  confirmed: "Confirmed",
  arrived: "You've arrived",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Missed",
  rescheduled: "Rescheduled",
  declined: "Declined",
};

export default async function PatientAppointments() {
  const scope = await requirePatientScope();
  const now = new Date();
  const [upcoming, past] = await Promise.all([
    fetchAppointments(scope.userId, "upcoming", now),
    fetchAppointments(scope.userId, "past", now),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          MedSync · Visits
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
          Your appointments
        </h1>
        <p className="text-muted-foreground text-[12.5px] leading-relaxed">
          Cancel any upcoming visit below. Need to reschedule? Cancel and book again.
        </p>
      </header>

      {/* ── Booking CTA: depends on affiliation ───────────────── */}
      {scope.primaryHospitalId ? (
        <Link
          href="/patient/book"
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center justify-between gap-3 rounded-xl p-3.5 transition-colors"
        >
          <span className="inline-flex items-center gap-3">
            <span
              aria-hidden
              className="bg-background/15 text-background inline-flex size-9 items-center justify-center rounded-full"
            >
              <CalendarPlusIcon className="size-4" />
            </span>
            <span className="flex flex-col">
              <span className="text-[13.5px] font-medium">Book a visit</span>
              <span className="text-background/70 text-[11.5px]">{scope.primaryHospitalName}</span>
            </span>
          </span>
          <span aria-hidden className="text-background/80 text-[14px]">
            →
          </span>
        </Link>
      ) : (
        <Link
          href="/patient/hospitals"
          className="group relative overflow-hidden rounded-xl border border-teal-500/30 bg-gradient-to-br from-teal-50/80 via-teal-50/40 to-transparent p-4 transition-colors hover:border-teal-500/60 dark:border-teal-400/20 dark:from-teal-950/30 dark:via-teal-950/15 dark:to-transparent"
        >
          <div className="relative flex items-start gap-3">
            <span
              aria-hidden
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-teal-700 ring-1 ring-teal-200/80 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-800/40"
            >
              <HospitalIcon className="size-4" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-foreground text-[13.5px] font-medium">
                Pick a hospital first
              </span>
              <span className="text-muted-foreground max-w-[44ch] text-[12px] leading-relaxed">
                Booking opens once you choose your primary hospital. It takes a tap.
              </span>
              <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-teal-700 dark:text-teal-300">
                Browse hospitals →
              </span>
            </div>
          </div>
        </Link>
      )}

      <Section title="Upcoming" rows={upcoming} emptyText="Nothing booked." />
      <Section title="Past" rows={past} emptyText="No past visits yet." />
    </div>
  );
}

function Section({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: ReadonlyArray<Row>;
  emptyText: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground border-border bg-card rounded-xl border p-4 text-[12.5px]">
          {emptyText}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-foreground text-[14px] font-medium">{r.clinicianName}</span>
                <Pill tone={STATUS_TONES[r.status] ?? "neutral"}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </Pill>
              </div>
              <p className="text-muted-foreground text-[12.5px]">
                {r.hospitalName} · {r.departmentName} ·{" "}
                {r.type === "virtual" ? "Virtual" : "In-person"}
              </p>
              <p className="text-foreground font-mono text-[12px] tabular-nums">
                {formatWhen(r.startsAtIso)}
              </p>
              {r.reasonNote ? (
                <p className="text-muted-foreground border-l-2 border-l-teal-500/50 pl-2 text-[12px] italic">
                  &ldquo;{r.reasonNote}&rdquo;
                </p>
              ) : null}
              {CANCELLABLE.has(r.status) ? (
                <div className="border-border/60 mt-1 border-t pt-2">
                  <CancelButton appointmentId={r.id} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface Row {
  id: string;
  startsAtIso: string;
  status: string;
  type: string;
  reasonNote: string | null;
  clinicianName: string;
  departmentName: string;
  hospitalName: string;
}

async function fetchAppointments(
  patientUserId: string,
  kind: "upcoming" | "past",
  now: Date,
): Promise<Row[]> {
  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      type: appointments.type,
      reasonNote: appointments.reasonNote,
      clinicianName: users.fullName,
      departmentName: hospitalDepartments.name,
      hospitalName: hospitals.name,
    })
    .from(appointments)
    .innerJoin(users, eq(users.id, appointments.clinicianUserId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, appointments.departmentId))
    .innerJoin(hospitals, eq(hospitals.id, appointments.hospitalId))
    .where(
      and(
        eq(appointments.patientUserId, patientUserId),
        kind === "upcoming" ? gte(appointments.startsAt, now) : lt(appointments.startsAt, now),
      ),
    )
    .orderBy(kind === "upcoming" ? appointments.startsAt : desc(appointments.startsAt))
    .limit(30);

  return rows.map((r) => ({
    id: r.id,
    startsAtIso: r.startsAt.toISOString(),
    status: r.status,
    type: r.type,
    reasonNote: r.reasonNote,
    clinicianName: r.clinicianName ?? "Your clinician",
    departmentName: r.departmentName,
    hospitalName: r.hospitalName,
  }));
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}
