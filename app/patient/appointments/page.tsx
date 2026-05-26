import type { PillTone } from "@/components/ui/data-table";
import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, lt } from "drizzle-orm";

import { Pill } from "@/components/ui/data-table";
import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { appointments } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { requirePatientScope } from "@/lib/patient/scope";

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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-5 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-foreground text-[24px] leading-tight font-medium tracking-[-0.015em] sm:text-[28px]">
          Your appointments
        </h1>
        <p className="text-muted-foreground text-[12.5px]">
          Cancel + reschedule controls land in the next release. For now, contact your hospital
          directly to change anything.
        </p>
      </header>

      <Section title="Upcoming" rows={upcoming} emptyText="Nothing booked." />
      <Section title="Past" rows={past} emptyText="No past visits yet." />

      <p className="text-muted-foreground text-center text-[11.5px]">
        <Link href="/patient" className="underline-offset-2 hover:underline">
          Back to home
        </Link>
      </p>
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
        <p className="text-muted-foreground border-border bg-card rounded-lg border p-4 text-[12.5px]">
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
