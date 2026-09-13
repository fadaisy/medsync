import type { SessionOption } from "./_lib/session-options";
import type { AppointmentRow } from "@/lib/patient/appointments";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { and, asc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { StethoscopeIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { db } from "@/db";
import {
  appointments,
  availabilityBlocks,
  clinicianSchedulingSettings,
  departmentSchedulingPolicy,
} from "@/db/schema/scheduling";
import {
  CANCELLABLE,
  fetchAppointments,
  formatWhen,
  STATUS_LABEL,
  STATUS_TONES,
} from "@/lib/patient/appointments";
import { formatArrivalWindow, formatShortDate } from "@/lib/patient/booking-format";
import { requirePatientScope } from "@/lib/patient/scope";
import { cn } from "@/lib/utils";
import {
  buildSlots,
  DEFAULT_TIME_ZONE,
  LIVE_APPOINTMENT_STATUSES,
} from "@/supabase/functions/_shared/slots";
import { PatientPageHeader } from "../_components/page-header";
import { TintedRow } from "../_components/tinted-row";
import { CancelButton } from "./_components/cancel-button";
import { RescheduleSheet } from "./_components/reschedule-sheet";
import { toSessionOptions } from "./_lib/session-options";

export const metadata: Metadata = { title: "Visits · MedSync" };
export const dynamic = "force-dynamic";

/** The limit `fetchAppointments` defaults to — echoed in the past-list foot-line. */
const PAST_LIMIT = 30;

/**
 * `reschedule-appointment`'s own RESCHEDULABLE set, restated because the Edge
 * Function cannot be imported from here (separate Deno tsconfig). Narrower
 * than `CANCELLABLE`: an `arrived` patient is at the desk, and moving them is
 * not a thing they can do from a phone.
 */
const RESCHEDULABLE = ["requested", "pending_approval", "confirmed"] as const;

/**
 * How far the reschedule options reach. Same 14 days `/patient/book` offers —
 * and the reason is the same evidence (ADR 0084 §8) — but this is a range to
 * derive over, not an enforcement: §8 confines the cap to
 * `pt-request-appointment` so clinician- and system-created recall stay
 * uncapped, and `reschedule-appointment` serves all three callers.
 */
const LOOKAHEAD_DAYS = 14;

/**
 * The name `fetchAppointments` substitutes when `users.fullName` is null.
 * Matching it is how this page knows not to derive "YC" initials from a
 * placeholder — a monogram built out of a fallback is fabricated identity.
 */
const CLINICIAN_FALLBACK = "Your clinician";

export default async function PatientAppointments() {
  const scope = await requirePatientScope();
  // One instant for both halves: two `new Date()`s leave a sliver in which an
  // appointment belongs to neither list.
  const now = new Date();
  const [upcoming, past, rescheduleOptions] = await Promise.all([
    fetchAppointments(scope.userId, "upcoming", PAST_LIMIT, now),
    fetchAppointments(scope.userId, "past", PAST_LIMIT, now),
    fetchRescheduleOptions(scope.userId, now),
  ]);

  return (
    <div className="stagger-children flex flex-col gap-6">
      <PatientPageHeader
        eyebrow="MedSync · Visits"
        title="Your visits"
        description="Move an upcoming visit to another day, or cancel it."
      />

      {scope.primaryHospitalId ? (
        <Link
          href="/patient/book"
          className={cn(
            buttonVariants({ size: "lg" }),
            "w-full rounded-full sm:w-auto sm:self-start",
          )}
        >
          Book a visit
        </Link>
      ) : (
        <ul className="stagger-children flex flex-col gap-2">
          <TintedRow
            tint="brand"
            iconKey="hospital"
            title="Find your hospital"
            subtitle="Booking opens once you choose your primary hospital."
            href="/patient/hospitals"
          />
        </ul>
      )}

      {/* Container query, not a viewport one: with the rail and the gutters the
          content box is ~300px narrower than the window. Below it the two
          sections fall into one column in this source order — upcoming first,
          which is the order the phone shows them in. */}
      <div className="grid gap-6 @5xl/page:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="visits-upcoming" className="flex flex-col gap-3">
          <SectionHead id="visits-upcoming" title="Upcoming" count={upcoming.length} />

          {upcoming.length === 0 ? (
            <EmptyNote>
              {scope.primaryHospitalId
                ? `No visits booked at ${scope.primaryHospitalName ?? "your hospital"}.`
                : "Connect to a hospital to book your first visit."}
            </EmptyNote>
          ) : (
            <ul className="stagger-children flex flex-col gap-3">
              {upcoming.map((r) => (
                <UpcomingVisit key={r.id} row={r} moveTo={rescheduleOptions.get(r.id)} />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="visits-past" className="flex flex-col gap-3">
          <SectionHead id="visits-past" title="Past" count={past.length} />

          {past.length === 0 ? (
            <EmptyNote>Nothing here yet.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-4">
              {groupByMonth(past).map((group) => (
                <div key={group.label} className="flex flex-col gap-2">
                  <h3 className="text-muted-foreground text-overline font-mono uppercase">
                    {group.label}
                  </h3>
                  <ul className="stagger-children flex flex-col gap-2">
                    {group.rows.map((r) => (
                      <PastVisit key={r.id} row={r} />
                    ))}
                  </ul>
                </div>
              ))}
              {past.length === PAST_LIMIT ? (
                <p className="text-muted-foreground text-body-s">
                  Showing your last {PAST_LIMIT} visits.
                </p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionHead({ id, title, count }: { id: string; title: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-foreground text-heading-s font-medium">
        {title}
      </h2>
      <span className="text-muted-foreground text-caption font-mono tabular-nums">{count}</span>
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground bg-card text-body-s dark:shadow-card rounded-xl p-4 shadow-xs">
      {children}
    </p>
  );
}

/**
 * A visit that is still ahead of the patient: full weight, full card, and the
 * only row that can carry a cancel control.
 *
 * `id` is the deep-link target home's upcoming rows point at — there is no
 * appointment detail route, so three anchors do the job of a fourth page.
 * `scroll-mt-20` clears the sticky 52px header the layout keeps at every width.
 */
function UpcomingVisit({
  row,
  /** Absent when the visit's status cannot be moved at all. */
  moveTo,
}: {
  row: AppointmentRow;
  moveTo: ReadonlyArray<SessionOption> | undefined;
}) {
  const initials = initialsOf(row.clinicianName);
  const summary = `${row.clinicianName} · ${row.departmentName} · ${formatWhen(row.startsAtIso)}`;

  return (
    <li
      id={`visit-${row.id}`}
      className="bg-card dark:shadow-card target:ring-brand-300 flex scroll-mt-20 flex-col gap-3 rounded-xl p-4 shadow-xs target:ring-1"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="bg-brand-50 text-brand-700 grid size-11 shrink-0 place-items-center rounded-xl"
        >
          {initials ? (
            <span className="text-body-s font-mono font-medium">{initials}</span>
          ) : (
            <StethoscopeIcon strokeWidth={1.5} className="size-5" />
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-foreground text-body-m truncate font-medium">
            {row.clinicianName}
          </span>
          <span className="text-muted-foreground text-body-s truncate">
            {row.departmentName} · {row.hospitalName}
          </span>
        </div>

        <Pill tone={STATUS_TONES[row.status] ?? "neutral"}>
          {STATUS_LABEL[row.status] ?? row.status}
        </Pill>
      </div>

      <p className="text-foreground text-body-s">
        <span>{formatWhen(row.startsAtIso)}</span>
        <span className="text-muted-foreground"> · {typeLabel(row.type)}</span>
      </p>

      <BookingFacts row={row} />

      {row.reasonNote ? (
        <p className="text-muted-foreground text-body-s">Reason: {row.reasonNote}</p>
      ) : null}

      {/* ADR 0084 §13 — reschedule ABOVE cancel, in DOM order and in weight.
          A reminder with no way out cut DNAs and pushed short-notice
          cancellations from 0.6% to 7.2%; the freed slot then needed a clerk
          nobody had. The `<li>` is already a column, so "above" costs no
          wrapper. */}
      {row.sessionId ? (
        // A place in a clinic day is a position, not a time, and the server
        // refuses to move it (ADR 0088). Said plainly rather than as a
        // control that would fail.
        <p className="text-muted-foreground text-body-s">
          A place in a clinic day cannot be moved yet. Cancel it and book another day.
        </p>
      ) : moveTo ? (
        moveTo.length > 0 ? (
          <RescheduleSheet appointmentId={row.id} summary={summary} options={moveTo} />
        ) : (
          // Not a disabled button: a control that cannot move anything is a
          // fake affordance. The reason is a real fact about this clinic.
          <p className="text-muted-foreground text-body-s">
            {row.departmentName} has no other days open on MedSync, so this visit cannot be moved
            here yet.
          </p>
        )
      ) : null}

      {CANCELLABLE.has(row.status) ? (
        <CancelButton appointmentId={row.id} summary={summary} />
      ) : null}
    </li>
  );
}

/**
 * A visit that has already happened: recessive by design — no fill, no lift,
 * no tone on the pill. It is a record, not a thing to act on.
 *
 * An outline, not a tint. The layout's ground is `bg-muted`, and the
 * `bg-muted/40` this carried is `color-mix(muted 40%, transparent)` over
 * `muted` — exactly `muted` again, so the row had no edge at all in either
 * theme. `border-border` is the one treatment that stays a hairline on both
 * grounds (#e5e5e5 on #fafafa, #262626 on #111111) while staying quieter
 * than the filled, shadowed cards the upcoming list uses.
 */
function PastVisit({ row }: { row: AppointmentRow }) {
  return (
    <li className="border-border flex flex-col gap-1 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-foreground text-body-s truncate font-medium">
          {row.clinicianName}
        </span>
        <Pill tone="neutral">{STATUS_LABEL[row.status] ?? row.status}</Pill>
      </div>
      <span className="text-muted-foreground text-body-s truncate">
        {row.departmentName} · {row.hospitalName}
      </span>
      <span className="text-muted-foreground text-body-s">{formatWhen(row.startsAtIso)}</span>
      {row.bookingCode ? (
        <span className="text-muted-foreground text-body-s font-mono tracking-[0.08em]">
          {row.bookingCode}
        </span>
      ) : null}
    </li>
  );
}

/**
 * The two things a patient reads aloud and shows at the desk (PRD §6.3):
 * the booking code, and for a clinic day the position with its arrival
 * window. Monospace and large for the code; the window is a range with a
 * stated basis (ADR 0088 C10), never a single time. Rows that predate
 * Gate C have no code and render nothing here.
 */
function BookingFacts({ row }: { row: AppointmentRow }) {
  if (!row.bookingCode) return null;
  const window =
    row.sessionId !== null &&
    row.positionNumber !== null &&
    row.arrivalWindowStartIso !== null &&
    row.arrivalWindowEndIso !== null
      ? formatArrivalWindow(row.arrivalWindowStartIso, row.arrivalWindowEndIso)
      : null;
  return (
    <dl className="bg-muted flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-lg px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <dt className="text-overline text-muted-foreground">Booking code</dt>
        <dd className="text-foreground text-heading-s font-mono tracking-[0.12em]">
          {row.bookingCode}
        </dd>
      </div>
      {window ? (
        <>
          <div className="flex flex-col gap-0.5">
            <dt className="text-overline text-muted-foreground">Position</dt>
            <dd className="text-foreground text-heading-s font-mono tabular-nums">
              {row.positionNumber}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-overline text-muted-foreground">
              {formatShortDate(row.startsAtIso)}
            </dt>
            <dd className="text-foreground text-body-s">
              Arrive between {window}. Arriving early does not change your position.
            </dd>
          </div>
        </>
      ) : null}
    </dl>
  );
}

function typeLabel(type: string): string {
  return type === "virtual" ? "Virtual" : "In-person";
}

/** Up to two initials, or null when the name is the placeholder. */
function initialsOf(name: string): string | null {
  if (name === CLINICIAN_FALLBACK) return null;
  const letters = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter((ch): ch is string => !!ch && /\p{L}/u.test(ch))
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return letters || null;
}

/**
 * Consecutive grouping, not a map — the rows arrive newest-first already, so a
 * single pass keeps them in that order without a second sort.
 */
function groupByMonth(rows: ReadonlyArray<AppointmentRow>) {
  const groups: { label: string; rows: AppointmentRow[] }[] = [];
  for (const row of rows) {
    const label = new Date(row.startsAtIso).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    const last = groups.at(-1);
    if (last?.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

/* ─── Reschedule options ──────────────────────────────────────────── */

/**
 * The days-and-sessions each upcoming visit can be moved into, keyed by
 * appointment id. An id that is absent is a visit whose status cannot be
 * moved; an id mapped to an empty array is one whose clinic has nothing else
 * open, which is a different sentence on the card.
 *
 * Derived HERE rather than lifted into `lib/scheduling/`. A reschedule keeps
 * the same clinician and the same department — `reschedule-appointment` copies
 * both off the original row — so the question is one (clinician, department)
 * pair per visit, where `/patient/book`'s `fetchBookableClinicians` fans out
 * across every clinical affiliation at the hospital. Sharing that would mean
 * editing `/patient/book` to become its caller, which another agent owns this
 * wave, and would answer a one-clinician question with a roster-sized payload.
 * What the two surfaces DO share is the part that must never diverge:
 * `buildSlots`, the same function `pt-request-appointment` checks writes with.
 *
 * ponytail: derived for every reschedulable visit on first paint. A patient
 * holds one or two. Ceiling: a patient with many live bookings across many
 * clinicians. Upgrade path: derive on sheet-open behind a route handler —
 * `buildSlots` is already called per row, so only the trigger moves.
 */
async function fetchRescheduleOptions(
  patientUserId: string,
  now: Date,
): Promise<Map<string, SessionOption[]>> {
  // Same window AND the same order as the upcoming list above: a row past that
  // limit is not rendered, so deriving slots for it would be work nobody sees —
  // and an unordered LIMIT would pick an arbitrary 30 of a patient holding
  // more, silently dropping the control from rows the list does render.
  const mine = await db
    .select({
      id: appointments.id,
      clinicianUserId: appointments.clinicianUserId,
      departmentId: appointments.departmentId,
      hospitalId: appointments.hospitalId,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.patientUserId, patientUserId),
        gte(appointments.startsAt, now),
        inArray(appointments.status, [...RESCHEDULABLE]),
        // A clinic-day place has no slot to move into; the card says so.
        isNull(appointments.sessionId),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(PAST_LIMIT);

  const out = new Map<string, SessionOption[]>();
  if (mine.length === 0) return out;

  const clinicianIds = Array.from(new Set(mine.map((r) => r.clinicianUserId)));
  const departmentIds = Array.from(new Set(mine.map((r) => r.departmentId)));
  const hospitalIds = Array.from(new Set(mine.map((r) => r.hospitalId)));
  const until = new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000);

  const [settings, policies, blocks, liveAppts] = await Promise.all([
    // Whole rows: `buildSlots` wants every column, and a missing one would
    // read as "no override" instead of as the bug it is.
    db
      .select()
      .from(clinicianSchedulingSettings)
      .where(
        and(
          inArray(clinicianSchedulingSettings.hospitalId, hospitalIds),
          inArray(clinicianSchedulingSettings.clinicianUserId, clinicianIds),
        ),
      ),
    db
      .select()
      .from(departmentSchedulingPolicy)
      .where(inArray(departmentSchedulingPolicy.departmentId, departmentIds)),
    // No kind/state filter, matching `pt-request-appointment`: "bookable" is
    // the engine's definition, and it also needs the blocking kinds — a
    // declared `leave` block must subtract from what we offer, or this screen
    // offers a time the write path then refuses.
    db
      .select()
      .from(availabilityBlocks)
      .where(
        and(
          inArray(availabilityBlocks.hospitalId, hospitalIds),
          inArray(availabilityBlocks.clinicianUserId, clinicianIds),
          or(
            and(gte(availabilityBlocks.endsAt, now), lt(availabilityBlocks.startsAt, until)),
            // A weekly block's own starts_at is the template — often months
            // back. Window it on the recurrence instead, or the series the
            // engine exists to expand never reaches the engine.
            and(
              eq(availabilityBlocks.recurrence, "weekly"),
              or(
                isNull(availabilityBlocks.recurrenceUntil),
                gte(availabilityBlocks.recurrenceUntil, now),
              ),
            ),
          ),
        ),
      ),
    db
      .select({
        clinicianUserId: appointments.clinicianUserId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
      })
      .from(appointments)
      .where(
        and(
          // NOT scoped to the hospital, exactly like the write path: a
          // clinician booked at their other hospital is still one person.
          // The visit being moved is in here too, so its own time is never
          // offered back as somewhere to move it to.
          inArray(appointments.clinicianUserId, clinicianIds),
          inArray(appointments.status, [...LIVE_APPOINTMENT_STATUSES]),
          gte(appointments.endsAt, now),
          lt(appointments.startsAt, until),
        ),
      ),
  ]);

  const settingsByPair = new Map(
    settings.map((s) => [`${s.clinicianUserId}:${s.hospitalId}`, s] as const),
  );
  const policyByDepartment = new Map(policies.map((p) => [p.departmentId, p] as const));

  for (const row of mine) {
    out.set(
      row.id,
      toSessionOptions(
        buildSlots({
          // A block naming another department belongs to that department's
          // hours; one naming none is this clinician's general bookable time.
          blocks: blocks.filter(
            (b) =>
              b.clinicianUserId === row.clinicianUserId &&
              b.hospitalId === row.hospitalId &&
              (b.departmentId === null || b.departmentId === row.departmentId),
          ),
          appointments: liveAppts.filter((a) => a.clinicianUserId === row.clinicianUserId),
          clinicianSettings: settingsByPair.get(`${row.clinicianUserId}:${row.hospitalId}`) ?? null,
          departmentPolicy: policyByDepartment.get(row.departmentId) ?? null,
          timeZone: DEFAULT_TIME_ZONE,
          now,
          rangeStart: now,
          rangeEnd: until,
        }),
        now,
      ),
    );
  }

  return out;
}
