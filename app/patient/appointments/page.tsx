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
    <div className="stagger-children relative mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <div
        aria-hidden
        className="bg-brand-500/5 dark:bg-brand-400/4 pointer-events-none absolute -top-20 left-1/2 -z-10 h-56 w-md max-w-full -translate-x-1/2 rounded-full blur-3xl"
      />
      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          MedSync · Visits
        </span>
        <h1 className="font-display text-foreground sm:text-heading-l text-[24px] leading-[1.15] font-medium tracking-[-0.015em]">
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
          className="bg-foreground text-background hover:bg-foreground/90 tap group inline-flex items-center justify-between gap-3 rounded-xl p-3.5 transition-colors"
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
          <span
            aria-hidden
            className="text-background/80 text-[14px] transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>
      ) : (
        <Link
          href="/patient/hospitals"
          className="group card-lift border-brand-500/30 from-brand-50/80 via-brand-50/40 hover:border-brand-500/60 dark:border-brand-400/20 dark:from-brand-950/30 dark:via-brand-950/15 relative overflow-hidden rounded-xl border bg-linear-to-br to-transparent p-4 dark:to-transparent"
        >
          <div className="relative flex items-start gap-3">
            <span
              aria-hidden
              className="text-brand-700 ring-brand-200/80 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-800/40 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/80 ring-1"
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
              <span className="text-brand-700 dark:text-brand-300 mt-1 inline-flex items-center gap-1 text-[12px] font-medium">
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
        <ul className="stagger-children flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4 transition-colors hover:border-gray-300"
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
                <p className="text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5 text-[12px] italic">
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
