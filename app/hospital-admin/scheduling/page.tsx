import type {
  ClinicianOption,
  ClinicSessionRow,
  SessionTemplateRow,
} from "./_components/clinic-sessions-section";
import type { DepartmentPolicyOption } from "./_components/policy-form";
import type { CadreFeeRow, CadreOption, ServiceLineRow } from "./_components/service-lines-section";
import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";

import { db } from "@/db";
import { clinicSessions, sessionTemplates } from "@/db/schema/clinic-sessions";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { cadres } from "@/db/schema/reference-data";
import { departmentSchedulingPolicy } from "@/db/schema/scheduling";
import { serviceLineFees, serviceLines } from "@/db/schema/service-lines";
import { users } from "@/db/schema/users";
import { sentBreakdown } from "@/lib/hospital-admin/reports";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import {
  DEFAULT_TIME_ZONE,
  localDateKey,
  startOfLocalDay,
} from "@/supabase/functions/_shared/slots";
import { PlaceholderSurface } from "../_components/placeholder-surface";
import { SchedulingOverviewCard } from "../_components/scheduling-overview-card";
import { ClinicSessionsSection } from "./_components/clinic-sessions-section";
import { PolicyForm } from "./_components/policy-form";
import { SentTodayPanel } from "./_components/sent-today-panel";
import { ServiceLinesSection } from "./_components/service-lines-section";

/** The console shows what the materialiser produces: 14 days ahead. */
const SESSION_HORIZON_DAYS = 14;

const DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Scheduling — hospital-admin surface.
 *
 * The aggregate tile, then the department booking-policy editor. Per-clinician
 * schedules stay in each clinician's own workspace (/clinician/schedule,
 * /clinician/availability) — admin sees structure and aggregates, not
 * individual encounters.
 *
 * Departments are read directly rather than through a lib/ helper because
 * this is the only surface that wants "every department, with its policy or
 * the absence of one"; a shared query would be an abstraction with one caller.
 */
export default async function SchedulingPage() {
  const scope = await requireHospitalAdminScope();

  // Left join: a department with no policy row is unrestricted (ADR 0084
  // §14), and that is a state the editor must be able to show and replace —
  // an inner join would hide exactly the departments that need configuring.
  const rows = await db
    .select({
      departmentId: hospitalDepartments.id,
      departmentName: hospitalDepartments.name,
      defaultSlotMinutes: departmentSchedulingPolicy.defaultSlotMinutes,
      defaultBufferMinutes: departmentSchedulingPolicy.defaultBufferMinutes,
      defaultAutoConfirm: departmentSchedulingPolicy.defaultAutoConfirm,
      bookableWeekdays: departmentSchedulingPolicy.bookableWeekdays,
      bookableStartMinutesLocal: departmentSchedulingPolicy.bookableStartMinutesLocal,
      bookableEndMinutesLocal: departmentSchedulingPolicy.bookableEndMinutesLocal,
      reminderLeadMinutes: departmentSchedulingPolicy.reminderLeadMinutes,
      allowVirtual: departmentSchedulingPolicy.allowVirtual,
      notes: departmentSchedulingPolicy.notes,
    })
    .from(hospitalDepartments)
    .leftJoin(
      departmentSchedulingPolicy,
      eq(departmentSchedulingPolicy.departmentId, hospitalDepartments.id),
    )
    .where(eq(hospitalDepartments.hospitalId, scope.hospitalId))
    .orderBy(asc(hospitalDepartments.name));

  const departments: DepartmentPolicyOption[] = rows.map((r) => ({
    departmentId: r.departmentId,
    departmentName: r.departmentName,
    // Every policy column is NOT NULL, so one null means the left join found
    // no row at all — not a half-set policy.
    policy:
      r.defaultSlotMinutes === null
        ? null
        : {
            defaultSlotMinutes: r.defaultSlotMinutes,
            defaultBufferMinutes: r.defaultBufferMinutes ?? 0,
            defaultAutoConfirm: r.defaultAutoConfirm ?? false,
            bookableWeekdays: r.bookableWeekdays ?? [],
            bookableStartMinutesLocal: r.bookableStartMinutesLocal ?? 480,
            bookableEndMinutesLocal: r.bookableEndMinutesLocal ?? 1020,
            reminderLeadMinutes: r.reminderLeadMinutes ?? [1440],
            allowVirtual: r.allowVirtual ?? false,
            notes: r.notes,
          },
  }));

  const unset = departments.filter((d) => !d.policy).length;

  const [lines, templates, sessions, clinicians, unstaffedSoon, sentToday, clinicalCadres, fees] =
    await Promise.all([
      fetchServiceLines(scope.hospitalId),
      fetchTemplates(scope.hospitalId),
      fetchUpcomingSessions(scope.hospitalId),
      fetchClinicians(scope.hospitalId),
      fetchUnstaffedSessionsSoon(scope.hospitalId),
      // Today's slice of the reports lib's range query (Gate H): one SQL, two pages.
      sentBreakdown(startOfLocalDay(new Date(), DEFAULT_TIME_ZONE), new Date(), scope.hospitalId),
      fetchClinicalCadres(),
      fetchCadreFees(scope.hospitalId),
    ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex w-fit items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          {scope.hospitalName} · Scheduling
        </span>
        <h1 className="font-display text-foreground sm:text-heading-l text-[24px] leading-[1.15] font-medium tracking-[-0.015em]">
          Scheduling
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[13.5px] leading-relaxed">
          Service lines, clinic sessions and department booking policy. Per-clinician availability
          and booked appointments live in each clinician&apos;s own workspace.
        </p>
        <div className="bg-brand-500/60 dark:bg-brand-400/50 h-px w-10" aria-hidden />
      </header>

      {/* PRD §3.6: a published day starting within 12 hours with no clinician
          named. Amber — the day still runs, and the app hides it as bookable
          until someone is assigned; red is for emergencies alone. */}
      {unstaffedSoon.length > 0 ? (
        <section
          role="status"
          aria-labelledby="t12-heading"
          className="bg-status-caution-bg text-status-caution-fg ring-status-caution-fg/25 flex flex-col gap-2 rounded-xl p-4 ring-1"
        >
          <h2 id="t12-heading" className="text-body-m font-medium">
            {unstaffedSoon.length === 1
              ? "1 clinic day starts within 12 hours with no clinician named"
              : `${unstaffedSoon.length} clinic days start within 12 hours with no clinician named`}
          </h2>
          <ul className="text-body-s flex flex-col gap-1">
            {unstaffedSoon.map((u) => (
              <li key={u.id} className="tabular-nums">
                {u.serviceLineName} · {u.dateLabel} · {u.timeLabel}
                {u.bookedCount > 0 ? ` · ${u.bookedCount} booked` : ""}
              </li>
            ))}
          </ul>
          <p className="text-body-s">
            Assign a clinician in the clinic days list below, or cancel the day so the people booked
            are told.
          </p>
        </section>
      ) : null}

      <SchedulingOverviewCard hospitalId={scope.hospitalId} variant="panel" />

      <ServiceLinesSection
        lines={lines}
        departments={departments.map((d) => ({ id: d.departmentId, name: d.departmentName }))}
        cadres={clinicalCadres}
        fees={fees}
      />

      <ClinicSessionsSection
        templates={templates}
        sessions={sessions}
        sessionLines={lines
          .filter((l) => l.active && l.capacityMode === "session")
          .map((l) => ({ id: l.id, name: l.name }))}
        clinicians={clinicians}
        todayYmd={localDateKey(new Date(), DEFAULT_TIME_ZONE)}
      />

      <SentTodayPanel rows={sentToday} />

      {unset > 0 && departments.length > 0 ? (
        <p className="border-border bg-muted/50 text-muted-foreground text-body-s rounded-md border p-3 leading-relaxed">
          <span className="text-foreground font-medium">
            {unset} of {departments.length}{" "}
            {departments.length === 1 ? "department has" : "departments have"} no booking policy.
          </span>{" "}
          Those departments are unrestricted — they accept same-day arrivals at any hour, and
          booking follows each clinician&apos;s own availability alone. That is a working default,
          not an error; set a policy only where you want to narrow it.
        </p>
      ) : null}

      <PolicyForm departments={departments} />

      <PlaceholderSurface
        title="Utilisation analytics"
        description="The policy editor above is live. The operational numbers that tell you whether it is working — utilisation, no-show patterns, and the declared → arrived conversion per department that ADR 0084 names as the measure of the same-day door — land in their own prompt."
        upcoming={[
          "Slot utilisation by clinician + department",
          "Declared → arrived conversion per department",
          "No-show pattern surfacing (operational signal, never patient-punitive)",
          "Stale-pending-approval signal for clinicians sitting on requests",
        ]}
      />
    </div>
  );
}

/* ─── Gate B reads ─────────────────────────────────────────────────── */

async function fetchServiceLines(hospitalId: string): Promise<ServiceLineRow[]> {
  const rows = await db
    .select({
      id: serviceLines.id,
      name: serviceLines.name,
      slug: serviceLines.slug,
      departmentId: serviceLines.departmentId,
      departmentName: hospitalDepartments.name,
      capacityMode: serviceLines.capacityMode,
      timeToCareDays: serviceLines.timeToCareDays,
      continuityDefault: serviceLines.continuityDefault,
      confidential: serviceLines.confidential,
      paymentPosture: serviceLines.paymentPosture,
      feeUgx: serviceLines.feeUgx,
      depositUgx: serviceLines.depositUgx,
      reasonCodes: serviceLines.reasonCodes,
      isDefault: serviceLines.isDefault,
      active: serviceLines.active,
    })
    .from(serviceLines)
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, serviceLines.departmentId))
    .where(eq(serviceLines.hospitalId, hospitalId))
    .orderBy(asc(serviceLines.name));
  return rows;
}

async function fetchTemplates(hospitalId: string): Promise<SessionTemplateRow[]> {
  const rows = await db
    .select({
      id: sessionTemplates.id,
      serviceLineId: sessionTemplates.serviceLineId,
      serviceLineName: serviceLines.name,
      clinicianUserId: sessionTemplates.clinicianUserId,
      clinicianName: users.fullName,
      venue: sessionTemplates.venue,
      weekday: sessionTemplates.weekday,
      startMinutesLocal: sessionTemplates.startMinutesLocal,
      durationMinutes: sessionTemplates.durationMinutes,
      capacityTotal: sessionTemplates.capacityTotal,
      capacityBooked: sessionTemplates.capacityBooked,
      interleaveBooked: sessionTemplates.interleaveBooked,
      interleaveWalkIn: sessionTemplates.interleaveWalkIn,
      overbookingFactor: sessionTemplates.overbookingFactor,
      validFrom: sessionTemplates.validFrom,
      validUntil: sessionTemplates.validUntil,
      active: sessionTemplates.active,
    })
    .from(sessionTemplates)
    .innerJoin(serviceLines, eq(serviceLines.id, sessionTemplates.serviceLineId))
    .leftJoin(users, eq(users.id, sessionTemplates.clinicianUserId))
    .where(eq(sessionTemplates.hospitalId, hospitalId))
    .orderBy(asc(sessionTemplates.weekday), asc(sessionTemplates.startMinutesLocal));
  // numeric(3,2) arrives as a string ("1.00"); the editor wants a number.
  return rows.map((r) => ({ ...r, overbookingFactor: Number(r.overbookingFactor) }));
}

async function fetchUpcomingSessions(hospitalId: string): Promise<ClinicSessionRow[]> {
  const from = startOfLocalDay(new Date(), DEFAULT_TIME_ZONE);
  const to = new Date(from.getTime() + SESSION_HORIZON_DAYS * 86_400_000);
  const rows = await db
    .select({
      id: clinicSessions.id,
      startsAt: clinicSessions.startsAt,
      endsAt: clinicSessions.endsAt,
      serviceLineName: serviceLines.name,
      clinicianName: users.fullName,
      bookedCount: clinicSessions.bookedCount,
      capacityBooked: clinicSessions.capacityBooked,
      capacityTotal: clinicSessions.capacityTotal,
      overbookingFactor: clinicSessions.overbookingFactor,
      status: clinicSessions.status,
      delayMinutes: clinicSessions.delayMinutes,
    })
    .from(clinicSessions)
    .innerJoin(serviceLines, eq(serviceLines.id, clinicSessions.serviceLineId))
    .leftJoin(users, eq(users.id, clinicSessions.clinicianUserId))
    .where(
      and(
        eq(clinicSessions.hospitalId, hospitalId),
        gte(clinicSessions.startsAt, from),
        lt(clinicSessions.startsAt, to),
      ),
    )
    .orderBy(asc(clinicSessions.startsAt));
  return rows.map((r) => ({
    id: r.id,
    dateLabel: DAY_FMT.format(r.startsAt),
    timeLabel: `${TIME_FMT.format(r.startsAt)}–${TIME_FMT.format(r.endsAt)}`,
    serviceLineName: r.serviceLineName,
    clinicianName: r.clinicianName,
    bookedCount: r.bookedCount,
    capacityBooked: r.capacityBooked,
    capacityTotal: r.capacityTotal,
    overbookingFactor: Number(r.overbookingFactor),
    status: r.status,
    delayMinutes: r.delayMinutes,
  }));
}

/* ─── Gate E: "Sent today" (PRD §3.4 reports seed) ─────────────────── */

/** The T-12h rule (PRD §3.6): published, within 12 hours, no clinician. */
const T12H_MS = 12 * 3_600_000;

async function fetchUnstaffedSessionsSoon(hospitalId: string) {
  const now = new Date();
  const rows = await db
    .select({
      id: clinicSessions.id,
      startsAt: clinicSessions.startsAt,
      endsAt: clinicSessions.endsAt,
      serviceLineName: serviceLines.name,
      bookedCount: clinicSessions.bookedCount,
    })
    .from(clinicSessions)
    .innerJoin(serviceLines, eq(serviceLines.id, clinicSessions.serviceLineId))
    .where(
      and(
        eq(clinicSessions.hospitalId, hospitalId),
        eq(clinicSessions.status, "published"),
        isNull(clinicSessions.clinicianUserId),
        gte(clinicSessions.startsAt, now),
        lt(clinicSessions.startsAt, new Date(now.getTime() + T12H_MS)),
      ),
    )
    .orderBy(asc(clinicSessions.startsAt));
  return rows.map((r) => ({
    id: r.id,
    serviceLineName: r.serviceLineName,
    dateLabel: DAY_FMT.format(r.startsAt),
    timeLabel: `${TIME_FMT.format(r.startsAt)}–${TIME_FMT.format(r.endsAt)}`,
    bookedCount: r.bookedCount,
  }));
}

/**
 * Who a session can be assigned to: active clinical staff at this hospital
 * — the same test `ha-upsert-session-template` applies to `clinician_user_id`.
 */
async function fetchClinicians(hospitalId: string): Promise<ClinicianOption[]> {
  const rows = await db
    .selectDistinct({ userId: users.id, fullName: users.fullName })
    .from(staffAffiliations)
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        inArray(staffAffiliations.state, ["active", "approved"]),
        eq(cadres.isClinical, true),
      ),
    )
    .orderBy(asc(users.fullName));
  return rows;
}

/* ─── Gate G (ADR 0092): fees by cadre ─────────────────────────────── */

/** The clinical ladder a fee may attach to. */
async function fetchClinicalCadres(): Promise<CadreOption[]> {
  return db
    .select({ id: cadres.id, name: cadres.name })
    .from(cadres)
    .where(eq(cadres.isClinical, true))
    .orderBy(asc(cadres.name));
}

/** Every override at this hospital, keyed by line in the section. */
async function fetchCadreFees(hospitalId: string): Promise<CadreFeeRow[]> {
  return db
    .select({
      serviceLineId: serviceLineFees.serviceLineId,
      cadreId: serviceLineFees.cadreId,
      cadreName: cadres.name,
      feeUgx: serviceLineFees.feeUgx,
    })
    .from(serviceLineFees)
    .innerJoin(serviceLines, eq(serviceLines.id, serviceLineFees.serviceLineId))
    .innerJoin(cadres, eq(cadres.id, serviceLineFees.cadreId))
    .where(eq(serviceLines.hospitalId, hospitalId))
    .orderBy(asc(cadres.name));
}
