import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, count, eq, gte, inArray, lt } from "drizzle-orm";
import { ArrowLeftIcon, CheckCircleIcon, ClockIcon, TicketIcon } from "lucide-react";

import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { patientIntakes } from "@/db/schema/patient-intakes";
import { requirePatientScope } from "@/lib/patient/scope";
import { CancelDeclaredIntakeButton } from "./_components/cancel-button";

export const metadata: Metadata = {
  title: "Your queue · MedSync",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ intakeId: string }>;
}

/**
 * Live status of a single intake the patient declared. RLS already
 * gates this — the existing patient_intakes_select_scoped policy grants
 * SELECT to the patient themselves (patient_user_id = auth.uid()).
 *
 * Status surface: declared → arrived → awaiting_triage → triaged.
 * Terminal: completed / cancelled — shown with a one-line summary and
 * a "back to home" anchor.
 *
 * Auto-refresh: page is force-dynamic + meta-refresh every 30s so the
 * patient sees position updates without a manual reload. Polling is
 * the honest minimum until websockets land (separate ticket).
 */
export default async function PatientQueueDetailPage({ params }: PageProps) {
  const { intakeId } = await params;
  const scope = await requirePatientScope();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const rows = await db
    .select({
      id: patientIntakes.id,
      status: patientIntakes.status,
      hospitalId: patientIntakes.hospitalId,
      hospitalName: hospitals.name,
      departmentId: patientIntakes.receivingDepartmentId,
      departmentName: hospitalDepartments.name,
      presentingComplaint: patientIntakes.presentingComplaint,
      arrivedAt: patientIntakes.arrivedAt,
      checkedInAt: patientIntakes.checkedInAt,
      patientUserId: patientIntakes.patientUserId,
    })
    .from(patientIntakes)
    .innerJoin(hospitals, eq(hospitals.id, patientIntakes.hospitalId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, patientIntakes.receivingDepartmentId))
    .where(eq(patientIntakes.id, intakeId))
    .limit(1);

  const intake = rows[0];
  if (!intake) notFound();
  if (intake.patientUserId !== scope.userId) redirect("/patient/queue");

  // Position-in-line = count of declared|arrived|awaiting_triage rows
  // for the same dept today with arrived_at <= this intake. For triaged
  // / completed / cancelled we skip — position is meaningless past
  // triage. The kickoff is explicit: no fabricated wait estimate.
  let positionAhead: number | null = null;
  if (
    intake.departmentId &&
    (intake.status === "declared" ||
      intake.status === "arrived" ||
      intake.status === "awaiting_triage")
  ) {
    const aheadRows = await db
      .select({ n: count() })
      .from(patientIntakes)
      .where(
        and(
          eq(patientIntakes.hospitalId, intake.hospitalId),
          eq(patientIntakes.receivingDepartmentId, intake.departmentId),
          inArray(patientIntakes.status, ["declared", "arrived", "awaiting_triage"]),
          gte(patientIntakes.arrivedAt, startOfDay),
          lt(patientIntakes.arrivedAt, endOfDay),
          lt(patientIntakes.arrivedAt, intake.arrivedAt),
        ),
      );
    positionAhead = Number(aheadRows[0]?.n ?? 0);
  }
  void asc; // import kept for future ordering needs

  const isTerminal = intake.status === "completed" || intake.status === "cancelled";

  return (
    <div className="stagger-children relative mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      {/* Polling refresh — 30s — until websockets land. Reduced-motion
          users are unaffected (no animation). */}
      {!isTerminal ? <meta httpEquiv="refresh" content="30" /> : null}

      <div
        aria-hidden
        className="bg-brand-500/5 dark:bg-brand-400/4 pointer-events-none absolute -top-20 left-1/2 -z-10 h-56 w-md max-w-full -translate-x-1/2 rounded-full blur-3xl"
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
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          MedSync · Your queue ticket
        </span>
        <h1 className="font-display text-foreground sm:text-heading-l text-[24px] leading-[1.15] font-medium tracking-[-0.015em]">
          {headlineFor(intake.status)}
        </h1>
        <p className="text-muted-foreground text-body-s leading-relaxed">
          {intake.hospitalName}
          {intake.departmentName ? ` · ${intake.departmentName}` : ""}
        </p>
      </header>

      {/* ── Stage card ───────────────────────────────────────── */}
      <StageCard status={intake.status} positionAhead={positionAhead} />

      {/* ── Ticket details ───────────────────────────────────── */}
      <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          Your ticket
        </h2>
        <dl className="flex flex-col gap-2">
          <Row label="Hospital" value={intake.hospitalName} />
          <Row label="Department" value={intake.departmentName ?? "—"} />
          <Row label="Declared" value={formatTime(intake.arrivedAt)} mono />
          {intake.checkedInAt ? (
            <Row label="Checked in" value={formatTime(intake.checkedInAt)} mono />
          ) : null}
          {intake.presentingComplaint ? (
            <Row label="Note to team" value={intake.presentingComplaint} />
          ) : null}
          <Row label="Ticket ID" value={shortId(intake.id)} mono />
        </dl>
      </section>

      {/* ── Cancel (declared only) ───────────────────────────── */}
      {intake.status === "declared" ? <CancelDeclaredIntakeButton intakeId={intake.id} /> : null}

      <p className="text-muted-foreground text-caption inline-flex items-center justify-center gap-1.5 text-center">
        {!isTerminal ? (
          <span aria-hidden className="pulse-dot bg-brand-500 size-1.5 rounded-full" />
        ) : null}
        Status updates every 30 seconds while this page is open.
      </p>
    </div>
  );
}

/* ─── stage card ──────────────────────────────────────────────── */

function StageCard({ status, positionAhead }: { status: string; positionAhead: number | null }) {
  if (status === "declared") {
    return (
      <article className="border-brand-500/40 bg-brand-50/40 ring-brand-500/10 dark:border-brand-400/30 dark:bg-brand-950/20 flex flex-col gap-2 rounded-xl border p-4 ring-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="scale-in bg-brand-100 text-brand-700 ring-brand-200/80 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-800/40 inline-flex size-7 items-center justify-center rounded-full ring-1"
          >
            <TicketIcon className="size-3.5" />
          </span>
          <span className="text-foreground text-[14px] font-medium">
            Saved your spot · come in when you can
          </span>
        </div>
        <p className="text-muted-foreground text-[12.5px] leading-snug">
          You&rsquo;re in the line but haven&rsquo;t arrived yet. Check in at the front desk when
          you get there — they&rsquo;ll flip your ticket to arrived.
        </p>
        {positionAhead !== null ? (
          positionAhead === 0 ? (
            <p className="text-foreground text-body-s font-medium">
              No one ahead of you right now.
            </p>
          ) : (
            <p className="text-foreground text-body-s flex items-baseline gap-2 font-medium">
              <span className="scale-in text-heading-l font-mono leading-none font-medium tabular-nums">
                {positionAhead}
              </span>
              ahead of you right now.
            </p>
          )
        ) : null}
      </article>
    );
  }
  if (status === "arrived" || status === "awaiting_triage") {
    return (
      <article className="border-brand-500/40 bg-brand-50/40 ring-brand-500/10 dark:border-brand-400/30 dark:bg-brand-950/20 flex flex-col gap-2 rounded-xl border p-4 ring-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="scale-in bg-brand-100 text-brand-700 ring-brand-200/80 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-800/40 inline-flex size-7 items-center justify-center rounded-full ring-1"
          >
            <ClockIcon className="size-3.5" />
          </span>
          <span className="text-foreground text-[14px] font-medium">
            You&rsquo;re here · awaiting triage
          </span>
        </div>
        <p className="text-muted-foreground text-[12.5px] leading-snug">
          A nurse will see you in turn for a quick triage. After that, you&rsquo;ll be assigned to a
          clinician.
        </p>
        {positionAhead !== null ? (
          positionAhead === 0 ? (
            <p className="text-foreground text-body-s font-medium">You&rsquo;re next.</p>
          ) : (
            <p className="text-foreground text-body-s flex items-baseline gap-2 font-medium">
              <span className="scale-in text-heading-l font-mono leading-none font-medium tabular-nums">
                {positionAhead}
              </span>
              ahead of you.
            </p>
          )
        ) : null}
      </article>
    );
  }
  if (status === "triaged") {
    return (
      <article className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="bg-brand-100 text-brand-700 ring-brand-200/80 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-800/40 inline-flex size-7 items-center justify-center rounded-full ring-1"
          >
            <CheckCircleIcon className="size-3.5" />
          </span>
          <span className="text-foreground text-[14px] font-medium">
            Triage complete · follow the team&rsquo;s instructions
          </span>
        </div>
      </article>
    );
  }
  // completed / cancelled
  return (
    <article className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4">
      <span className="text-foreground text-[14px] font-medium">
        {status === "completed" ? "Visit complete" : "Ticket cancelled"}
      </span>
      <p className="text-muted-foreground text-[12.5px] leading-snug">
        {status === "completed"
          ? "Hope it went well. You can join the queue again any time from home."
          : "This ticket has been closed. You can join the queue again any time from home."}
      </p>
    </article>
  );
}

/* ─── helpers ─────────────────────────────────────────────────── */

function headlineFor(status: string): string {
  switch (status) {
    case "declared":
      return "You're in today's queue.";
    case "arrived":
      return "You're checked in.";
    case "awaiting_triage":
      return "You're checked in.";
    case "triaged":
      return "Triage complete.";
    case "completed":
      return "All done for today.";
    case "cancelled":
      return "Ticket cancelled.";
    default:
      return "Your queue ticket.";
  }
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-x-3 text-[12.5px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "text-foreground font-mono tabular-nums" : "text-foreground"}>
        {value}
      </dd>
    </div>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function shortId(id: string): string {
  return id.split("-")[0]?.toUpperCase() ?? id.slice(0, 8).toUpperCase();
}
