import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, count, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CalendarPlusIcon,
  CheckIcon,
  HospitalIcon,
  TicketIcon,
} from "lucide-react";

import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { patientIntakes } from "@/db/schema/patient-intakes";
import { appointments, departmentSchedulingPolicy } from "@/db/schema/scheduling";
import { requirePatientScope } from "@/lib/patient/scope";
import { DeclareIntakeForm } from "./_components/declare-intake-form";

export const metadata: Metadata = {
  title: "Join today's queue · MedSync",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * /patient/queue — the "Join today's queue" door of the book-or-queue
 * choice point. Mobile-first, dept-picker only (no clinician choice —
 * queue is dept-scoped).
 *
 * "Open for walk-in today?" reuses departmentSchedulingPolicy
 * (weekdays + window) — same heuristic the Edge Function applies, so
 * the page shows what the server would accept. Departments with no
 * policy row read as closed; we say so honestly and offer booking
 * instead.
 *
 * If the patient already has a live intake or a confirmed booking
 * today at this hospital, we surface that at the top instead of
 * letting them try and bounce off a 409.
 */
export default async function PatientQueuePage() {
  const scope = await requirePatientScope();
  if (!scope.primaryHospitalId) {
    redirect("/patient/hospitals");
  }
  const hospitalId = scope.primaryHospitalId;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const nowWeekday = startOfDay.getDay();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  const [hospital, departments, existingIntake, existingAppointment] = await Promise.all([
    db
      .select({ name: hospitals.name })
      .from(hospitals)
      .where(eq(hospitals.id, hospitalId))
      .limit(1),
    db
      .select({
        id: hospitalDepartments.id,
        name: hospitalDepartments.name,
        bookableWeekdays: departmentSchedulingPolicy.bookableWeekdays,
        bookableStart: departmentSchedulingPolicy.bookableStartMinutesLocal,
        bookableEnd: departmentSchedulingPolicy.bookableEndMinutesLocal,
      })
      .from(hospitalDepartments)
      .leftJoin(
        departmentSchedulingPolicy,
        eq(departmentSchedulingPolicy.departmentId, hospitalDepartments.id),
      )
      .where(
        and(eq(hospitalDepartments.hospitalId, hospitalId), isNull(hospitalDepartments.parentId)),
      )
      .orderBy(asc(hospitalDepartments.name)),
    db
      .select({
        id: patientIntakes.id,
        status: patientIntakes.status,
        departmentId: patientIntakes.receivingDepartmentId,
      })
      .from(patientIntakes)
      .where(
        and(
          eq(patientIntakes.patientUserId, scope.userId),
          eq(patientIntakes.hospitalId, hospitalId),
          inArray(patientIntakes.status, ["declared", "arrived", "awaiting_triage", "triaged"]),
          gte(patientIntakes.arrivedAt, startOfDay),
          lt(patientIntakes.arrivedAt, endOfDay),
        ),
      )
      .limit(1),
    db
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        departmentId: appointments.departmentId,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.patientUserId, scope.userId),
          eq(appointments.hospitalId, hospitalId),
          inArray(appointments.status, [
            "confirmed",
            "pending_approval",
            "requested",
            "arrived",
            "in_progress",
          ]),
          gte(appointments.startsAt, startOfDay),
          lt(appointments.startsAt, endOfDay),
        ),
      )
      .orderBy(asc(appointments.startsAt))
      .limit(1),
  ]);

  // Per-dept count-ahead (live + waiting today). Run after we have the
  // dept list so we only query depts that exist.
  const deptIds = departments.map((d) => d.id);
  const aheadRows =
    deptIds.length > 0
      ? await db
          .select({
            departmentId: patientIntakes.receivingDepartmentId,
            n: count(),
          })
          .from(patientIntakes)
          .where(
            and(
              eq(patientIntakes.hospitalId, hospitalId),
              inArray(patientIntakes.receivingDepartmentId, deptIds),
              inArray(patientIntakes.status, ["declared", "arrived", "awaiting_triage"]),
              gte(patientIntakes.arrivedAt, startOfDay),
              lt(patientIntakes.arrivedAt, endOfDay),
            ),
          )
          .groupBy(patientIntakes.receivingDepartmentId)
      : [];
  const aheadByDept = new Map<string, number>();
  for (const r of aheadRows) {
    if (r.departmentId) aheadByDept.set(r.departmentId, Number(r.n));
  }

  const hospitalName = hospital[0]?.name ?? "your hospital";
  const liveIntake = existingIntake[0] ?? null;
  const liveAppt = existingAppointment[0] ?? null;

  const items = departments.map((d) => {
    // Open for walk-ins by DEFAULT. A scheduling policy, when present,
    // narrows the window to its hours; its absence means "no
    // restriction", not "closed". Mirrors the pt-declare-intake gate.
    const hasPolicy = d.bookableWeekdays !== null;
    const inWeekday = hasPolicy && (d.bookableWeekdays ?? []).includes(nowWeekday);
    const inWindow =
      hasPolicy &&
      d.bookableStart !== null &&
      d.bookableEnd !== null &&
      nowMinutes >= d.bookableStart &&
      nowMinutes < d.bookableEnd;
    const openNow = !hasPolicy || (inWeekday && inWindow);
    return {
      id: d.id,
      name: d.name,
      openNow,
      reason: openNow ? null : !inWeekday ? "closed today" : "outside walk-in hours",
      ahead: aheadByDept.get(d.id) ?? 0,
    };
  });

  const anyOpen = items.some((i) => i.openNow);

  return (
    <div className="stagger-children relative mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 -z-10 h-56 w-md max-w-full -translate-x-1/2 rounded-full bg-teal-500/5 blur-3xl dark:bg-teal-400/4"
      />
      <Link
        href="/patient"
        className="text-muted-foreground hover:text-foreground group inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
      >
        <ArrowLeftIcon
          className="size-3.5 transition-transform group-hover:-translate-x-0.5"
          aria-hidden
        />
        Back to home
      </Link>

      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          MedSync · Join today&rsquo;s queue
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
          You&rsquo;re coming in today.
        </h1>
        <p className="text-muted-foreground max-w-[44ch] text-[13px] leading-relaxed">
          Pick the department you&rsquo;re heading to at <strong>{hospitalName}</strong>.
          We&rsquo;ll save a spot in line. You&rsquo;ll see your position update live; check in at
          the front desk when you arrive.
        </p>
      </header>

      {/* ── Already in flight today ──────────────────────────── */}
      {liveIntake ? (
        <ExistingIntakeCard intakeId={liveIntake.id} status={liveIntake.status} />
      ) : null}

      {liveAppt && !liveIntake ? (
        <ExistingAppointmentCard
          appointmentId={liveAppt.id}
          startsAtIso={liveAppt.startsAt.toISOString()}
        />
      ) : null}

      {/* ── Honest "emergency? not here" banner ──────────────── */}
      <aside className="border-border bg-card flex items-start gap-3 rounded-xl border p-3.5">
        <span
          aria-hidden
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200/70 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800/40"
        >
          <AlertTriangleIcon className="size-3.5" aria-hidden />
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground text-[12.5px] font-medium">Emergency?</span>
          <span className="text-muted-foreground text-[11.5px] leading-snug">
            Don&rsquo;t use this — go straight to the hospital&rsquo;s emergency entrance. Staff
            handle emergencies in person and never wait in line.
          </span>
        </div>
      </aside>

      {/* ── Form ─────────────────────────────────────────────── */}
      {liveIntake ? null : (
        <DeclareIntakeForm departments={items} anyOpen={anyOpen} hospitalName={hospitalName} />
      )}

      {/* ── Footer: book instead ─────────────────────────────── */}
      <p className="text-muted-foreground text-center text-[11.5px]">
        Not coming today?{" "}
        <Link
          href="/patient/book"
          className="text-foreground underline underline-offset-2 hover:text-teal-700 dark:hover:text-teal-300"
        >
          Book a future visit
        </Link>{" "}
        instead.
      </p>
    </div>
  );
}

/* ─── small dumb display cards ─────────────────────────────────── */

function ExistingIntakeCard({ intakeId, status }: { intakeId: string; status: string }) {
  const label =
    status === "declared"
      ? "You're in today's queue — not checked in yet."
      : status === "arrived"
        ? "You're checked in — the team will see you in turn."
        : status === "awaiting_triage"
          ? "You're checked in — awaiting triage."
          : "You've been triaged — follow the staff's directions.";
  return (
    <Link
      href={`/patient/queue/${intakeId}`}
      className="group card-lift flex items-start gap-3 rounded-xl border border-teal-500/40 bg-teal-50/40 p-4 hover:border-teal-500/60 dark:border-teal-400/30 dark:bg-teal-950/20"
    >
      <span
        aria-hidden
        className="scale-in relative inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 ring-1 ring-teal-200/80 dark:bg-teal-900/40 dark:text-teal-300 dark:ring-teal-800/40"
      >
        <span
          aria-hidden
          className="pulse-dot absolute -top-0.5 -right-0.5 size-2 rounded-full bg-teal-500 ring-2 ring-white dark:ring-teal-950"
        />
        <TicketIcon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-foreground text-[13.5px] font-medium">{label}</span>
        <span className="text-muted-foreground text-[12px]">
          Tap to see your live queue status.
        </span>
      </div>
      <span className="text-[12px] font-medium text-teal-700 transition-transform group-hover:translate-x-0.5 dark:text-teal-300">
        →
      </span>
    </Link>
  );
}

function ExistingAppointmentCard({
  appointmentId,
  startsAtIso,
}: {
  appointmentId: string;
  startsAtIso: string;
}) {
  void appointmentId;
  const time = new Date(startsAtIso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <Link
      href="/patient/appointments"
      className="border-border bg-card card-lift flex items-start gap-3 rounded-xl border p-4 hover:border-teal-500/40"
    >
      <span
        aria-hidden
        className="bg-muted text-foreground/80 inline-flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <CalendarPlusIcon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-foreground text-[13.5px] font-medium">
          You already have a booking at {time} today.
        </span>
        <span className="text-muted-foreground text-[12px]">
          Just check in at the front desk when you arrive — no need to take a ticket.
        </span>
      </div>
      <span className="text-muted-foreground text-[12px]">→</span>
    </Link>
  );
}

void HospitalIcon;
void CheckIcon;
