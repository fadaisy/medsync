import type { PillTone } from "@/components/ui/data-table";
import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { CalendarPlusIcon } from "lucide-react";

import { Pill } from "@/components/ui/data-table";
import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { appointments } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { requirePatientScope } from "@/lib/patient/scope";

export const metadata: Metadata = { title: "Home · MedSync" };
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

export default async function PatientHome() {
  const scope = await requirePatientScope();
  const upcoming = await fetchUpcoming(scope.userId);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8">
      <section className="flex flex-col gap-1">
        <p className="text-muted-foreground text-[12.5px]">
          Good to see you{scope.fullName ? `, ${scope.fullName.split(" ")[0]}` : ""}.
        </p>
        <h1 className="font-display text-foreground text-[24px] leading-tight font-medium tracking-[-0.015em] sm:text-[28px]">
          {scope.primaryHospitalName ? scope.primaryHospitalName : "Your MedSync"}
        </h1>
        {!scope.primaryHospitalId ? (
          <p className="text-[12.5px] leading-relaxed text-amber-700 dark:text-amber-300">
            Set your primary hospital from your profile before booking.
          </p>
        ) : null}
      </section>

      {scope.primaryHospitalId ? (
        <Link
          href="/patient/book"
          className="border-border bg-card hover:bg-muted/30 flex items-center gap-3 rounded-xl border p-4 transition-colors hover:border-teal-500/40"
        >
          <span
            aria-hidden
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700 ring-1 ring-teal-200/70 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/40"
          >
            <CalendarPlusIcon className="size-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-foreground text-[14.5px] font-medium">Book an appointment</span>
            <span className="text-muted-foreground text-[12px]">
              Pick a reason, clinician, and time.
            </span>
          </span>
          <span className="text-muted-foreground text-[12.5px]">→</span>
        </Link>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground border-border bg-card rounded-lg border p-4 text-[12.5px] leading-relaxed">
            Nothing on your schedule. When you book, the next visit lands here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/patient/appointments`}
                  className="border-border bg-card hover:bg-muted/30 flex flex-col gap-2 rounded-xl border p-4 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground text-[14px] font-medium">
                      {a.clinicianName}
                    </span>
                    <Pill tone={STATUS_TONES[a.status] ?? "neutral"}>
                      {STATUS_LABEL[a.status] ?? a.status}
                    </Pill>
                  </div>
                  <p className="text-muted-foreground text-[12.5px]">
                    {a.departmentName} · {a.type === "virtual" ? "Virtual" : "In-person"}
                  </p>
                  <p className="text-foreground font-mono text-[12px] tabular-nums">
                    {formatWhen(a.startsAtIso)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!scope.primaryHospitalId ? null : (
        <Link
          href="/patient/appointments"
          className="text-muted-foreground hover:text-foreground self-center text-[12.5px] transition-colors"
        >
          See all appointments →
        </Link>
      )}
    </div>
  );
}

interface UpcomingRow {
  id: string;
  startsAtIso: string;
  status: string;
  type: string;
  clinicianName: string;
  departmentName: string;
}

async function fetchUpcoming(patientUserId: string): Promise<UpcomingRow[]> {
  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      type: appointments.type,
      clinicianName: users.fullName,
      departmentName: hospitalDepartments.name,
    })
    .from(appointments)
    .innerJoin(users, eq(users.id, appointments.clinicianUserId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, appointments.departmentId))
    .where(
      and(
        eq(appointments.patientUserId, patientUserId),
        gte(appointments.startsAt, new Date()),
        inArray(appointments.status, [
          "requested",
          "pending_approval",
          "confirmed",
          "arrived",
          "in_progress",
        ]),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(3);

  return rows.map((r) => ({
    id: r.id,
    startsAtIso: r.startsAt.toISOString(),
    status: r.status,
    type: r.type,
    clinicianName: r.clinicianName ?? "Your clinician",
    departmentName: r.departmentName,
  }));
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}
