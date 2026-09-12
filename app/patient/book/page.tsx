import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";

import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { cadres } from "@/db/schema/reference-data";
import {
  appointments,
  availabilityBlocks,
  clinicianSchedulingSettings,
  departmentSchedulingPolicy,
} from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { requirePatientScope } from "@/lib/patient/scope";
import { cn } from "@/lib/utils";
import {
  buildSlots,
  DEFAULT_TIME_ZONE,
  LIVE_APPOINTMENT_STATUSES,
  localWeekdayAndMinutes,
  resolveSchedulingSettings,
} from "@/supabase/functions/_shared/slots";
import { EmergencyNotice } from "../_components/emergency-notice";
import { PatientPageHeader } from "../_components/page-header";
import { BookingWizard } from "./_components/booking-wizard";

// ADR 0084 §2: no jargon anywhere in the flow, and that includes the browser
// tab. "Book" is one of the five words the rule names.
export const metadata: Metadata = { title: "Ask for a day · MedSync" };
export const dynamic = "force-dynamic";

/** The two day-parts the patient surface is allowed to name (ADR 0084 §10). */
export type DaySession = "morning" | "afternoon";

/**
 * One session a patient can ask for, and the concrete slot the request will
 * carry. The patient never sees a clock numeral — `pt-request-appointment`
 * still needs an instant, so the offer holds one and the screen does not.
 */
export interface SessionOffer {
  session: DaySession;
  startsAtIso: string;
  endsAtIso: string;
}

export interface ClinicianOption {
  userId: string;
  fullName: string;
  departmentId: string;
  departmentName: string;
  autoConfirm: boolean;
  allowVirtual: boolean;
  /**
   * Open sessions keyed by local date ("YYYY-MM-DD" in `DEFAULT_TIME_ZONE`),
   * at most one entry per day-part, days with nothing open absent.
   *
   * The client gets sessions, never the blocks and appointments they came
   * from: deriving them twice is how the read path and the write path came to
   * disagree, and the raw rows are the larger payload on a phone.
   */
  sessionsByDate: Record<string, SessionOffer[]>;
}

/**
 * ADR 0084 §8. A rule, never a promise: nothing on this screen says "the next
 * two weeks", because the days the patient can actually see are the covering
 * clinician's open days, which are usually far fewer. The label names real
 * availability instead.
 */
const LOOKAHEAD_DAYS = 14;

/** Local noon in the clinic's zone — the morning / afternoon boundary. */
const NOON_MINUTES = 12 * 60;

/** "2026-09-15" in the clinic's zone — the key the day chips speak. */
const DATE_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: DEFAULT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default async function PatientBookPage() {
  const scope = await requirePatientScope();

  if (!scope.primaryHospitalId) {
    // No hospital, so no hospital to name: the emergency block is scoped to
    // one and there is nothing honest to put in it here.
    return (
      <div className="stagger-children mx-auto flex w-full max-w-xl flex-col gap-6">
        <PatientPageHeader
          eyebrow="MedSync"
          title="Choose your hospital first"
          description="A day can only be asked for at the hospital you go to. Choose one, then come back."
        />
        <Link
          href="/patient/hospitals"
          className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-fit")}
        >
          Choose a hospital
        </Link>
      </div>
    );
  }

  const hospitalName = scope.primaryHospitalName ?? "This hospital";
  // §3's block carries a number wherever one has been verified and the
  // destination alone where none has — and "none has" must mean the column is
  // null, not that a page forgot to ask. `requirePatientScope` reads it for
  // every patient surface, so this page asks nobody a second time.
  const emergencyPhone = scope.emergencyEntrancePhone;
  const clinicians = await fetchBookableClinicians(scope.primaryHospitalId);
  // Only clinicians with a day to offer reach the screen. A hospital with
  // clinical staff but no declared availability returns a full list whose
  // every `sessionsByDate` is empty, and rendering those as disabled rows is
  // what forced the old "No open times in the next 2 weeks" label — a
  // sentence about the horizon rather than about this clinic (§8).
  const open = clinicians.filter((c) => firstOpenDay(c) !== undefined);

  if (open.length === 0) {
    return (
      <div className="stagger-children mx-auto flex w-full max-w-xl flex-col gap-6">
        {/* The emergency block is first on every door page, unconditionally:
            a patient mid-stroke may be on this one (§3). */}
        <EmergencyNotice hospitalName={hospitalName} emergencyPhone={emergencyPhone} />
        <PatientPageHeader
          eyebrow={hospitalName}
          title="No days open yet"
          // Nothing here promises a message. There is no SMS or push
          // transport (§11), so "we'll notify you when slots open" was a
          // promise the product could not keep. What replaces it is the other
          // door, which is open by default and needs no configuration (§14).
          description={`${hospitalName} has not put any clinic days on MedSync yet. You can still be seen — going to the hospital does not depend on this app.`}
        />
        <div className="flex flex-col gap-3">
          <Link
            href="/patient/queue"
            className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-fit")}
          >
            Coming to the hospital today
          </Link>
          {/* Three sentences, and they stay three. §2 replaced an antithesis
              ("it is a place, not a time") precisely because the compound
              construction lost when a relative paraphrased it aloud; an em
              dash rebuilds the construction the ADR discarded. The last
              sentence is not ratified copy — it is §11's true statement that
              the hospital works without this app. */}
          <p className="text-muted-foreground text-body-s leading-relaxed">
            We save your place in line. You will be seen in turn. We cannot tell you the hour. If
            you arrive without doing that, reception can register you at the desk.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="stagger-children mx-auto flex w-full max-w-xl flex-col gap-6">
      <EmergencyNotice hospitalName={hospitalName} emergencyPhone={emergencyPhone} />
      {/* ADR 0084 §2. The words are the decision — the title names the act and
          the sub-line names real availability, never the 14-day horizon. */}
      <PatientPageHeader
        eyebrow={hospitalName}
        title="Ask for a day — the clinic confirms"
        description="Choose from the days the clinic has open."
      />
      <BookingWizard
        clinicians={open}
        hospitalName={hospitalName}
        defaultKey={defaultClinicianKey(open)}
        todayIso={DATE_KEY.format(new Date())}
      />
    </div>
  );
}

/* ─── The assignment the patient no longer makes ──────────────────── */

/** Earliest day this clinician has anything open, or undefined if none. */
function firstOpenDay(c: ClinicianOption): string | undefined {
  return Object.keys(c.sessionsByDate).sort()[0];
}

/**
 * ADR 0084 §9: the patient stops choosing a clinician. Two IM registrars are
 * equivalents, cover rotates, and a first-time patient has no basis to pick —
 * so the assignment is made and the patient may change it.
 *
 * ponytail: there is no rota table, and §5's default assessment-department
 * row does not exist in `hospital_departments` yet, so the only thing this
 * schema knows about "who is covering" is who declared open time. The default
 * is therefore whoever has a day soonest, ties falling to the query's order
 * (department, then name) so a reload lands on the same person. Upgrade path:
 * once a department is marked as the hospital's assessment clinic, filter to
 * it before this reduce and the rest of the flow is unchanged.
 */
function defaultClinicianKey(open: ReadonlyArray<ClinicianOption>): string {
  const best = open.reduce((a, b) => ((firstOpenDay(b) ?? "") < (firstOpenDay(a) ?? "") ? b : a));
  return `${best.userId}:${best.departmentId}`;
}

/* ─── Data fetch ──────────────────────────────────────────────────── */

/**
 * ponytail: every bookable clinician's sessions ship on first paint, so the
 * payload grows with the hospital's clinical roster. Collapsing each day to
 * at most two offers keeps that an order of magnitude smaller than the old
 * per-slot list, and it keeps the wizard a pure renderer with no round trip
 * per pick — §2 costs a chatty flow in shillings, not just in delay.
 * Ceiling: a Mulago-sized roster. Upgrade path: ship the default clinician's
 * sessions and fetch the rest when the "I was told to see a particular
 * doctor" disclosure opens — `buildSlots` is already called per (clinician,
 * department) pair, so only the fan-out moves.
 */
async function fetchBookableClinicians(hospitalId: string): Promise<ClinicianOption[]> {
  // 1. Active CLINICAL affiliations at this hospital — that's the bookable
  //    set. The cadres join is what keeps reception, lab and pharmacy staff
  //    out of a patient's clinician list (same filter as lib/triage/notify.ts).
  const affiliations = await db
    .select({
      userId: staffAffiliations.userId,
      departmentId: staffAffiliations.departmentId,
      fullName: users.fullName,
      departmentName: hospitalDepartments.name,
    })
    .from(staffAffiliations)
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, staffAffiliations.departmentId))
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        inArray(staffAffiliations.state, ["active", "approved"]),
        eq(cadres.isClinical, true),
      ),
    )
    .orderBy(asc(hospitalDepartments.name), asc(users.fullName));

  if (affiliations.length === 0) return [];

  const clinicianIds = Array.from(new Set(affiliations.map((a) => a.userId)));
  const departmentIds = Array.from(new Set(affiliations.map((a) => a.departmentId)));
  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000);

  // 2-5. Independent of each other, all four scoped by step 1's ids.
  const [settings, deptPolicies, blocks, liveAppts] = await Promise.all([
    // Whole rows: `resolveSchedulingSettings` wants every column, and a
    // missing one would read as "no override" instead of as the bug it is.
    db
      .select()
      .from(clinicianSchedulingSettings)
      .where(
        and(
          eq(clinicianSchedulingSettings.hospitalId, hospitalId),
          inArray(clinicianSchedulingSettings.clinicianUserId, clinicianIds),
        ),
      ),
    db
      .select()
      .from(departmentSchedulingPolicy)
      .where(inArray(departmentSchedulingPolicy.departmentId, departmentIds)),
    db
      .select()
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.hospitalId, hospitalId),
          eq(availabilityBlocks.kind, "bookable"),
          eq(availabilityBlocks.state, "active"),
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
          // NOT scoped to the hospital, and that is the point: the write
          // path (pt-request-appointment) subtracts a clinician's live
          // appointments everywhere, because a clinician booked at their
          // other hospital is still one person. Scoping this read to the
          // hospital offered a slot `checkSlot` then refused with "refresh
          // and pick again" — and refreshing re-offered the same slot.
          inArray(appointments.clinicianUserId, clinicianIds),
          inArray(appointments.status, [...LIVE_APPOINTMENT_STATUSES]),
          gte(appointments.endsAt, now),
          lt(appointments.startsAt, until),
        ),
      ),
  ]);

  const settingsByClinician = new Map(settings.map((s) => [s.clinicianUserId, s]));
  const policyByDepartment = new Map(deptPolicies.map((d) => [d.departmentId, d]));
  const blocksByClinician = groupBy(blocks, (b) => b.clinicianUserId);
  // Appointments are NOT split by department or hospital: a clinician booked
  // in Medicine — or at their other hospital — is unavailable here too.
  const apptsByClinician = groupBy(liveAppts, (a) => a.clinicianUserId);

  // 6. Derive. One row per (clinician, department) pair — a clinician
  //    affiliated to two departments shows twice, and each pair is judged
  //    against its own department's policy.
  return affiliations.map((a) => {
    const clinicianSettings = settingsByClinician.get(a.userId) ?? null;
    const departmentPolicy = policyByDepartment.get(a.departmentId) ?? null;
    const effective = resolveSchedulingSettings(clinicianSettings, departmentPolicy);

    const slots = buildSlots({
      // A block naming another department belongs to that department's
      // hours; one naming none is this clinician's general bookable time.
      blocks: (blocksByClinician.get(a.userId) ?? []).filter(
        (b) => b.departmentId === null || b.departmentId === a.departmentId,
      ),
      appointments: apptsByClinician.get(a.userId) ?? [],
      clinicianSettings,
      departmentPolicy,
      timeZone: DEFAULT_TIME_ZONE,
      now,
      rangeStart: now,
      rangeEnd: until,
    });

    const sessionsByDate: Record<string, SessionOffer[]> = {};
    for (const slot of slots) {
      const day = (sessionsByDate[DATE_KEY.format(slot.startsAt)] ??= []);
      // The clinic's clock decides which half of the day this is, never the
      // server's — the same helper the walk-in window uses.
      //
      // ponytail: the split is local noon, giving exactly the two day-parts
      // the ADR names. A clinic running an evening list would have those
      // slots called "afternoon session". Upgrade path: a third label, once
      // a word for it is ratified alongside the other two.
      const session: DaySession =
        localWeekdayAndMinutes(slot.startsAt, DEFAULT_TIME_ZONE).minutesOfDay < NOON_MINUTES
          ? "morning"
          : "afternoon";
      if (day.some((o) => o.session === session)) continue;
      // `buildSlots` returns ascending, so the first slot of a session is its
      // earliest, and that is the one the request carries.
      //
      // ponytail: two patients asking for the same session in the same second
      // are handed the same instant. `appointments_no_double_booking` is the
      // backstop, the 409 reaches the patient verbatim, and the page is
      // force-dynamic so the next render offers the next slot. Upgrade path:
      // let `pt-request-appointment` accept a session and choose inside it,
      // which removes the race rather than absorbing it.
      day.push({
        session,
        startsAtIso: slot.startsAt.toISOString(),
        endsAtIso: slot.endsAt.toISOString(),
      });
    }

    return {
      userId: a.userId,
      fullName: a.fullName,
      departmentId: a.departmentId,
      departmentName: a.departmentName,
      // NOT `effective.autoConfirm`, and the difference is a promise.
      // `pt-request-appointment` picks its initial status from the clinician's
      // own settings row alone (`settings?.auto_confirm ? "confirmed" :
      // "pending_approval"`) — it does not run ADR 0029 §2's fallback for this
      // one field. So at a department whose policy sets `default_auto_confirm`
      // for a clinician with no settings row, the resolved chain says true and
      // the insert writes `pending_approval`. The wizard turns this flag into
      // "This day is yours as soon as you ask", which would then be a promise
      // the database refuses to keep. Reading it the way the write path reads
      // it can only under-promise, which is the safe direction.
      // ponytail: the real fix is one expression in the Edge Function —
      // resolve the chain there, then this reverts to `effective.autoConfirm`.
      // Reported, not applied: that function is another agent's file.
      autoConfirm: clinicianSettings?.autoConfirm ?? false,
      allowVirtual: effective.allowVirtual,
      sessionsByDate,
    };
  });
}

function groupBy<T>(rows: ReadonlyArray<T>, key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(key(row));
    if (list) list.push(row);
    else grouped.set(key(row), [row]);
  }
  return grouped;
}
