import type { EdgeResult } from "@/lib/edge";
import type { PatientReasonCode } from "@shared/sessions-sql";
import type { ImagePickerOptions } from "expo-image-picker";
import {
  DEFAULT_TIME_ZONE,
  endOfLocalDay,
  LIVE_APPOINTMENT_STATUSES,
  localDateKey,
  localWeekdayAndMinutes,
  startOfLocalDay,
} from "@shared/slots";

import { callEdge, requestId } from "@/lib/edge";
import { supabase } from "@/lib/supabase";

/**
 * Every read and every write the booking app makes. Screens call this file and
 * nothing else; nothing else in the app touches PostgREST or an Edge Function.
 *
 * Three rules hold the whole thing together.
 *
 * 1. SLOTS ARE NEVER DERIVED HERE. The days a patient can ask for come from
 *    `pt-bookable-clinicians`, which runs `_shared/slots.ts` — the same file
 *    the Next app and `pt-request-appointment` import — server-side, and
 *    hands back slots. The rows the engine needs are not patient-readable
 *    and must not become so (other patients' bookings are PHI, leave rows
 *    say who is away), and the moment the phone computed its own grid it
 *    would start offering times the server refuses. What lives here is the
 *    PRESENTATION of what the server offered, never the arithmetic.
 *
 * 2. THE CLOCK IS THE HOSPITAL'S, NEVER THE DEVICE'S. Every zone-sensitive
 *    value goes through `DEFAULT_TIME_ZONE` / `localWeekdayAndMinutes`. A
 *    patient who travels — or whose phone has the wrong zone set — must see
 *    the identical grid the server validates against. There is no
 *    `hospitals.time_zone` column; the engine owns that ceiling and its
 *    upgrade path.
 *
 * 3. NOTHING IS RENDERED THAT THE DATABASE CANNOT PROVE (ADR 0084 §6, §12;
 *    narrowed by ADR 0085). No wait estimate, no countdown, no hospital-wide
 *    queue position — the queue is DEPARTMENT-scoped, so a hospital-wide
 *    number does not exist to show. The one count a screen may print is
 *    `slotsByDate[day].length`: the length of the list it is already
 *    showing. Every star comes from a `visit_ratings` row a patient wrote
 *    after a visit that happened; no rating is "No ratings yet".
 *
 * READS of the patient's own rows go straight to PostgREST under Row Level
 * Security: the database decides what a patient may see, not the `.eq()`
 * calls below. Reads RLS cannot serve, and every WRITE, go to Edge Functions,
 * whose refusal sentences reach the screen verbatim.
 */

/* ─── shared plumbing ────────────────────────────────────────────── */

/**
 * The signed-in patient's id, from the locally stored session.
 *
 * RLS already scopes every query to this user, but the policies on
 * `appointments` and `patient_intakes` ALSO admit clinician and hospital-admin
 * rows — so a patient who is also a nurse at the same hospital would read a
 * ward's worth of intakes without the explicit `patient_user_id` filter. The
 * filter is the query saying what it wants; RLS is what makes it safe.
 */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * PostgREST returns an embedded to-one row as an object, and a one-to-one
 * detected through a reverse foreign key as an array. Rather than betting on
 * which, the row types say both and `embedded` unwraps both.
 */
type Embed<T> = T | T[] | null;

function embedded<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** A read that failed is not an empty read. Screens catch and offer a retry. */
function raise(message: string | undefined, what: string): never {
  throw new Error(message ?? `Couldn't load ${what}.`);
}

/* ─── time, in the hospital's zone ───────────────────────────────── */

/** "2026-09-15" in the clinic's zone — the key day chips are grouped by. */
export function dateKey(at: Date): string {
  return localDateKey(at, DEFAULT_TIME_ZONE);
}

/** "Thu 18 Sep" in the clinic's zone — display only, so a locale fallback is survivable. */
const DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/**
 * "9:30 AM" in the clinic's zone (ADR 0085 §3). 12-hour with the AM/PM word;
 * ADR 0084 §10's dawn-anchored-clock risk is accepted and recorded there, and
 * the mitigation is that a time is never shown without its day beside it —
 * which is why `formatWhen` exists and screens use it, or a Day tile.
 */
const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: DEFAULT_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatTime(iso: string): string {
  return TIME_FMT.format(new Date(iso));
}

/** "Thu 18 Sep · 9:30 AM" — the day always accompanies the time. */
export function formatWhen(iso: string): string {
  return `${DAY_FMT.format(new Date(iso))} · ${formatTime(iso)}`;
}

/**
 * "Tuesday 22 September" — the date in full, for the things a patient reads
 * aloud to a relative: a clinic day, a receipt (PRD §6.3, never relative-only).
 */
const LONG_DAY_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function formatDateLong(iso: string): string {
  return LONG_DAY_FMT.format(new Date(iso));
}

/** "9:30 AM and 11:00 AM" — the arrival window as a range with its basis said beside it (ADR 0088 C10). */
export function formatWindow(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} and ${formatTime(endIso)}`;
}

/** "Today" / "Tomorrow" / "Thu 18 Sep" for a `dateKey` — ADR 0084 §10's day chips. */
export function dayLabel(key: string): string {
  const now = new Date();
  if (key === dateKey(now)) return "Today";
  // EAT has no DST, so a flat 24h step cannot land on the wrong civil day.
  if (key === dateKey(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  // Noon so the parsed instant is the intended civil day in every zone.
  return DAY_FMT.format(new Date(`${key}T12:00:00Z`));
}

/* ─── the patient ────────────────────────────────────────────────── */

export interface PatientProfile {
  userId: string;
  /** DB-issued, NOT NULL. What reception matches against at the desk. */
  patientCode: string;
  /** Null until the patient has chosen one; both doors need it. */
  hospitalId: string | null;
  hospitalName: string | null;
  /**
   * `hospitals.emergency_phone` — null until someone verified a number for
   * this hospital during activation (ADR 0084 §3). Null is the CORRECT state,
   * not an error one: the emergency block then shows the destination alone.
   * A guessed or hardcoded number would be the most dangerous fabricated
   * datum in the product.
   */
  emergencyPhone: string | null;
}

interface ProfileRow {
  id: string;
  patient_code: string;
  primary_facility_id: string | null;
  hospitals: Embed<{ name: string; emergency_phone: string | null }>;
}

/**
 * The signed-in patient, with their primary hospital resolved in the same
 * round trip. Null when the session is gone or no `patient_profiles` row
 * exists (a staff account signed into this app).
 */
export async function fetchPatientProfile(): Promise<PatientProfile | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from("patient_profiles")
    .select("id, patient_code, primary_facility_id, hospitals(name, emergency_phone)")
    .eq("id", userId)
    .maybeSingle()
    .overrideTypes<ProfileRow, { merge: false }>();
  if (error) raise(error.message, "your profile");
  if (!data) return null;
  const hospital = embedded(data.hospitals);
  return {
    userId: data.id,
    patientCode: data.patient_code,
    hospitalId: data.primary_facility_id,
    hospitalName: hospital?.name ?? null,
    emergencyPhone: hospital?.emergency_phone ?? null,
  };
}

/* ─── appointments ───────────────────────────────────────────────── */

/**
 * Patient-facing word for every status the CHECK constraint allows. Never
 * colour alone for state — a screen pairs the tone with one of these.
 * Lifted from `lib/patient/appointments.ts` so the phone and the web cannot
 * name the same appointment differently.
 */
export const STATUS_LABEL: Record<string, string> = {
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

/** What `cancel-appointment` will accept. Gate the control on this, not on a guess. */
export const CANCELLABLE: ReadonlySet<string> = new Set([
  "requested",
  "pending_approval",
  "confirmed",
  "arrived",
]);

/** What `reschedule-appointment` will accept. Note `arrived` is NOT in it. */
export const RESCHEDULABLE: ReadonlySet<string> = new Set([
  "requested",
  "pending_approval",
  "confirmed",
]);

/** Statuses whose appointment is still going to happen — the engine's list, not a copy. */
const LIVE_STATUSES = [...LIVE_APPOINTMENT_STATUSES];

export interface AppointmentRow {
  id: string;
  startsAtIso: string;
  endsAtIso: string;
  status: string;
  reason: string;
  reasonNote: string | null;
  /** In person, or video/phone — a virtual visit has no arrival and no queue. */
  type: "in_person" | "virtual";
  /** From `clinician_directory` (migration 0057); "Your clinician" until that lands or when the row has none. */
  clinicianName: string;
  /** A signed URL to the clinician's photograph, or null. */
  clinicianPhotoUrl: string | null;
  departmentName: string;
  hospitalName: string;
  /** Carried because rescheduling has to rebuild this clinician's grid. */
  hospitalId: string;
  departmentId: string;
  clinicianUserId: string;
  /** Six characters the desk searches by (Gate C). Null on rows booked before it. */
  bookingCode: string | null;
  /** Set only on a session booking — a place in a clinic day, not a time (ADR 0087). */
  sessionId: string | null;
  positionNumber: number | null;
  /** The arrival window stored at confirmation; never recomputed (ADR 0088 C10). */
  arrivalWindowStartIso: string | null;
  arrivalWindowEndIso: string | null;
  /**
   * The household member this visit was booked for, by the label the agent
   * gave them (Gate D, PRD §2.9) — or null for the patient's own visit. A
   * member's visit is logistics only: no move, cancel, arrival or rating from
   * this account (the functions check `patient_user_id = caller`).
   */
  forMember: string | null;
  /** Gate E: the patient's answer to the T-24h confirmation request; null = not yet. */
  confirmedByPatientAtIso: string | null;
  /** Gate E: 'session_cancelled' when the clinic cancelled the day — the screen offers a rebooking. */
  cancelledReason: string | null;
}

interface AppointmentQueryRow {
  id: string;
  provisional_patient_id: string | null;
  hospital_id: string;
  department_id: string;
  clinician_user_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  type: "in_person" | "virtual";
  reason: string;
  reason_note: string | null;
  booking_code: string | null;
  session_id: string | null;
  position_number: number | null;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
  confirmed_by_patient_at: string | null;
  cancelled_reason: string | null;
  hospital_departments: Embed<{ name: string }>;
  hospitals: Embed<{ name: string }>;
}

/**
 * - `upcoming` — everything from `now` forward, whatever its status. A
 *   cancelled or declined future visit is still something the patient must
 *   be able to see.
 * - `upcoming-active` — only what is still going to happen. The home glance,
 *   which must not offer a cancelled visit as the next thing you are doing.
 * - `past` — everything before `now`, newest first.
 */
export type AppointmentListKind = "upcoming" | "upcoming-active" | "past";

export async function fetchAppointments(
  kind: AppointmentListKind,
  limit = 30,
  now: Date = new Date(),
): Promise<AppointmentRow[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  const isPast = kind === "past";
  const nowIso = now.toISOString();

  // The patient's own visits, plus the ones they made for a household member
  // (RLS `appointments_select_agent` admits rows they created; the filter
  // narrows that to their live members, so a nurse-patient's desk bookings
  // never surface here). A reconciled member visit keeps its provisional id
  // (the provenance), so it stays a member visit on this list.
  const household = await fetchHousehold().catch(() => [] as HouseholdMember[]);
  const labelByProvisional = new Map(household.map((m) => [m.provisionalPatientId, m.label]));
  const own = `patient_user_id.eq.${userId}`;
  const members =
    household.length > 0
      ? `,and(created_by_user_id.eq.${userId},provisional_patient_id.in.(${[...labelByProvisional.keys()].join(",")}))`
      : "";

  let query = supabase
    .from("appointments")
    .select(
      "id, provisional_patient_id, hospital_id, department_id, clinician_user_id, starts_at, ends_at, status, type, " +
        "reason, reason_note, booking_code, session_id, position_number, " +
        "arrival_window_start, arrival_window_end, confirmed_by_patient_at, cancelled_reason, " +
        "hospital_departments(name), hospitals(name)",
    )
    .or(`${own}${members}`);
  query = isPast ? query.lt("starts_at", nowIso) : query.gte("starts_at", nowIso);
  if (kind === "upcoming-active") query = query.in("status", LIVE_STATUSES);

  const { data, error } = await query
    .order("starts_at", { ascending: !isPast })
    .limit(limit)
    .overrideTypes<AppointmentQueryRow[], { merge: false }>();
  if (error) raise(error.message, "your visits");

  const rows = data ?? [];
  const clinicians = await fetchClinicianCards(rows.map((r) => r.clinician_user_id));
  return rows.map((r) => {
    const forMember =
      (r.provisional_patient_id && labelByProvisional.get(r.provisional_patient_id)) || null;
    return {
      id: r.id,
      startsAtIso: r.starts_at,
      endsAtIso: r.ends_at,
      status: r.status,
      type: r.type,
      reason: r.reason,
      // A member's visit is logistics only (PRD §2.9): the note is dropped
      // here, so no screen has to remember to hide it.
      reasonNote: forMember ? null : r.reason_note,
      // The same fallback the web uses when `users.full_name` is null — a real
      // sentence, not a placeholder, and honest about what we actually know.
      clinicianName: clinicians.get(r.clinician_user_id)?.name ?? "Your clinician",
      clinicianPhotoUrl: clinicians.get(r.clinician_user_id)?.photoUrl ?? null,
      departmentName: embedded(r.hospital_departments)?.name ?? "Outpatients",
      hospitalName: embedded(r.hospitals)?.name ?? "Your hospital",
      hospitalId: r.hospital_id,
      departmentId: r.department_id,
      clinicianUserId: r.clinician_user_id,
      bookingCode: r.booking_code,
      sessionId: r.session_id,
      positionNumber: r.position_number,
      arrivalWindowStartIso: r.arrival_window_start,
      arrivalWindowEndIso: r.arrival_window_end,
      forMember,
      confirmedByPatientAtIso: r.confirmed_by_patient_at,
      cancelledReason: r.cancelled_reason,
    };
  });
}

/**
 * Name and photograph for a set of clinicians, from `clinician_directory`
 * (migration 0057) — the narrow view that exposes exactly those two columns
 * of `users` for active clinical staff. One read and one signing call for
 * the whole list, never one per row.
 *
 * Fails to EMPTY, never to an error: a visit card that cannot say who it is
 * with still says when and where, and "Your clinician" is the honest word
 * until the directory exists or the row has no name.
 */
async function fetchClinicianCards(
  ids: readonly string[],
): Promise<Map<string, { name: string | null; photoUrl: string | null }>> {
  const unique = [...new Set(ids)];
  const cards = new Map<string, { name: string | null; photoUrl: string | null }>();
  if (unique.length === 0) return cards;

  const { data, error } = await supabase
    .from("clinician_directory")
    .select("id, full_name, avatar_path")
    .in("id", unique)
    .overrideTypes<
      { id: string; full_name: string | null; avatar_path: string | null }[],
      { merge: false }
    >();
  if (error || !data) return cards;

  const paths = data.map((d) => d.avatar_path).filter((p): p is string => !!p);
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("avatars")
      .createSignedUrls(paths, AVATAR_URL_TTL_SECONDS);
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
    }
  }

  for (const d of data) {
    cards.set(d.id, {
      name: d.full_name?.trim() || null,
      photoUrl: (d.avatar_path && urlByPath.get(d.avatar_path)) || null,
    });
  }
  return cards;
}

/* ─── today's queue ticket ───────────────────────────────────────── */

/**
 * The statuses `pt-declare-intake` refuses a second ticket against.
 *
 * Four, not the three the same-day door names: the function's duplicate check
 * includes `triaged`, so a patient already triaged who is shown "no ticket"
 * taps the door and eats a 409 with nothing on screen explaining it. The list
 * a screen renders from must be the list the write path refuses on.
 */
const LIVE_INTAKE_STATUSES = ["declared", "arrived", "awaiting_triage", "triaged"];

/**
 * The stage of a live intake as a WORD — the home hero's tile and the ticket's
 * timeline both read it from here so the two screens cannot name the same row
 * differently. `arrived` and `awaiting_triage` are one stage to the patient:
 * both mean "at the desk, not yet seen". A state is a word, never colour alone.
 */
export const STAGE_WORD: Record<string, string> = {
  declared: "Place saved",
  arrived: "In the line",
  awaiting_triage: "In the line",
  triaged: "Seen by the nurse",
};

export interface LiveIntake {
  id: string;
  /** declared | arrived | awaiting_triage | triaged — pair with a word, never colour alone. */
  status: string;
  departmentId: string | null;
  departmentName: string | null;
  arrivedAtIso: string;
}

interface IntakeRow {
  id: string;
  status: string;
  receiving_department_id: string | null;
  arrived_at: string;
  hospital_departments: Embed<{ name: string }>;
}

/**
 * This patient's live intake at this hospital TODAY, or null.
 *
 * "Today" is the hospital's day, not the device's. Without the day window a
 * `declared` row nobody ever dispositioned would resurface weeks later as
 * today's ticket, which is exactly the kind of unprovable claim §12 forbids.
 *
 * No position and no count come back from here. `aheadByDept` is the
 * department's whole `declared | arrived | awaiting_triage` population — it
 * counts people already past you and people who have not arrived — so it is
 * not "ahead of you" and must not be rendered as one. The only honest count
 * is computed against this patient's own row on the ticket surface.
 */
export async function fetchLiveIntake(hospitalId: string): Promise<LiveIntake | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  // Midnight today in the CLINIC's zone, never `setHours(0)` (the device's).
  // The engine's helper, so the phone and every server window agree.
  const now = new Date();
  const start = startOfLocalDay(now, DEFAULT_TIME_ZONE);
  const end = endOfLocalDay(now, DEFAULT_TIME_ZONE);

  const { data, error } = await supabase
    .from("patient_intakes")
    .select("id, status, receiving_department_id, arrived_at, hospital_departments(name)")
    .eq("patient_user_id", userId)
    .eq("hospital_id", hospitalId)
    .in("status", LIVE_INTAKE_STATUSES)
    .gte("arrived_at", start.toISOString())
    .lt("arrived_at", end.toISOString())
    .order("arrived_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .overrideTypes<IntakeRow, { merge: false }>();
  if (error) raise(error.message, "your place in line");
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    departmentId: data.receiving_department_id,
    departmentName: embedded(data.hospital_departments)?.name ?? null,
    arrivedAtIso: data.arrived_at,
  };
}

/* ─── the same-day door ──────────────────────────────────────────── */

export interface WalkInDepartment {
  id: string;
  name: string;
  /**
   * Whether the hospital's clock is inside this department's walk-in window
   * right now. NO queue length rides along: pricing each clinical destination
   * by wait turns a differential ("Cardiology or General Medicine?") into a
   * wait-shopping decision (ADR 0084 §5).
   */
  openNow: boolean;
}

interface DepartmentRow {
  id: string;
  name: string;
  department_scheduling_policy: Embed<{
    bookable_weekdays: number[] | null;
    bookable_start_minutes_local: number | null;
    bookable_end_minutes_local: number | null;
  }>;
}

/**
 * Top-level departments a walk-in can be declared into, each with whether it
 * is open right now.
 *
 * Walk-ins are open by DEFAULT (ADR 0084 §14). A `department_scheduling_policy`
 * row, when present, NARROWS the window to its hours; its absence is "no
 * restriction", not "closed" — policy-as-gate made the feature unusable for
 * any hospital without booking policies set. Same rule and same helper as the
 * gate inside `pt-declare-intake`, so what this offers and what the function
 * accepts cannot drift.
 */
export async function fetchWalkInDepartments(hospitalId: string): Promise<WalkInDepartment[]> {
  const { isoWeekday, minutesOfDay } = localWeekdayAndMinutes(new Date(), DEFAULT_TIME_ZONE);

  const { data, error } = await supabase
    .from("hospital_departments")
    .select(
      "id, name, department_scheduling_policy(bookable_weekdays, " +
        "bookable_start_minutes_local, bookable_end_minutes_local)",
    )
    .eq("hospital_id", hospitalId)
    .is("parent_id", null)
    .order("name")
    .overrideTypes<DepartmentRow[], { merge: false }>();
  if (error) raise(error.message, "the clinics at this hospital");

  const rows = data ?? [];
  return rows.map((d) => {
    const policy = embedded(d.department_scheduling_policy);
    const openNow =
      !policy ||
      ((policy.bookable_weekdays ?? []).includes(isoWeekday) &&
        minutesOfDay >= (policy.bookable_start_minutes_local ?? 0) &&
        minutesOfDay < (policy.bookable_end_minutes_local ?? 0));
    return { id: d.id, name: d.name, openNow };
  });
}

/* ─── the booking door ───────────────────────────────────────────── */

/** One slot a patient can ask for — the instants the request will carry. */
export interface SlotOffer {
  startsAtIso: string;
  endsAtIso: string;
}

export interface ClinicianOption {
  userId: string;
  /** The clinician's name, read server-side; "Your clinician" if the row has none. */
  fullName: string;
  /** The hospital this row books at — the doctor's, which need not be the patient's (ADR 0086). */
  hospitalId: string;
  hospitalName: string;
  /** "Senior Consultant", "Specialist Nurse" — what kind of clinician this row is. */
  cadre: string;
  /** From `staff_affiliations.specialty_id`, or null — screens fall back to the cadre. */
  specialty: string | null;
  departmentId: string;
  departmentName: string;
  /** A signed URL good for an hour, or null — a monogram, never a placeholder face (ADR 0085 §1). */
  photoUrl: string | null;
  /** Real ratings only; null renders as "No ratings yet" (ADR 0085 §2). */
  rating: { average: number; count: number } | null;
  /** A video visit is bookable with this clinician (their row, else the department's). */
  allowVirtual: boolean;
  /** PRD §2.7: this patient has an attended visit with this clinician here. */
  seenBefore: boolean;
  /** Distinct patients with an attended visit, counted server-side. "—" for zero. */
  patientsSeen: number;
  /** When this affiliation began — "With us" on the strip. Never a career length. */
  withUsSinceIso: string | null;
  /**
   * Whether asking for this day books it outright or files a request. Read the
   * NARROW way `pt-request-appointment` reads it — the clinician's own settings
   * row alone, not ADR 0029 §2's fallback chain — because a department policy
   * setting `default_auto_confirm` for a clinician with no settings row makes
   * the chain say true while the insert writes `pending_approval`. Turning that
   * into "this day is yours as soon as you ask" is a promise the database
   * refuses to keep; reading it this way can only under-promise.
   */
  autoConfirm: boolean;
  /**
   * Open slots keyed by `dateKey`, ascending within a day, days with nothing
   * open absent. The screen gets slots, never the blocks and appointments they
   * came from; `slotsByDate[day].length` is the only count it may print.
   */
  slotsByDate: Record<string, SlotOffer[]>;
}

/**
 * Every active clinician — at one hospital, or at every active hospital when
 * none is given (ADR 0086) — whether or not a day is open: those with one
 * first, soonest first, then the rest by name. `slotsByDate` is empty for a
 * clinician with nothing open, and the row says so. Derived server-side by
 * `pt-bookable-clinicians` from the same engine the write path validates
 * with; see rule 1 in the header.
 *
 * ponytail: "whoever has a day soonest" is the whole rota model, because there
 * is no rota table and §5's default assessment-department row does not exist
 * in `hospital_departments` yet. Ceiling: a hospital where the soonest
 * clinician is not the right one. Upgrade path: once a department is marked
 * as the hospital's assessment clinic, the function filters to it before the
 * sort and nothing here moves.
 */
export async function fetchBookableClinicians(hospitalId?: string): Promise<ClinicianOption[]> {
  const res = await callEdge<ClinicianOption[]>("pt-bookable-clinicians", {
    // Absent, not null: zod's `.optional()` takes undefined and JSON drops it.
    ...(hospitalId ? { hospital_id: hospitalId } : {}),
  });
  if (!res.ok) raise(res.error, "the clinic's open days");
  return res.data ?? [];
}

/* ─── service lines and clinic days (Gate C, ADR 0087/0088) ────── */

export interface ServiceLine {
  id: string;
  name: string;
  hospitalId: string;
  hospitalName: string;
  /** `hospitals.emergency_phone` for THIS line's hospital — the interstitial's Call control, or null. */
  emergencyPhone: string | null;
  departmentId: string;
  departmentName: string;
  /** slot | session | open_queue — decides which page books it. */
  capacityMode: string;
  /** The Appendix A codes this line takes; the server refuses any other. */
  reasonCodes: string[];
  /** The facility's own target lead time — the no-silent-wait rule's window (PRD §2.4). */
  timeToCareDays: number;
  /**
   * PRD §2.9: a confidential line is never shown to, or bookable for, a
   * household member — the server refuses; the page hides the choice first.
   */
  confidential: boolean;
}

interface ServiceLineRow {
  id: string;
  name: string;
  hospital_id: string;
  department_id: string;
  capacity_mode: string;
  reason_codes: string[];
  time_to_care_days: number;
  confidential: boolean;
  hospital_departments: Embed<{ name: string }>;
  hospitals: Embed<{ name: string; emergency_phone: string | null }>;
}

const LINE_SELECT =
  "id, name, hospital_id, department_id, capacity_mode, reason_codes, time_to_care_days, confidential, " +
  "hospital_departments(name), hospitals(name, emergency_phone)";

function toLine(r: ServiceLineRow): ServiceLine {
  const hospital = embedded(r.hospitals);
  return {
    id: r.id,
    name: r.name,
    hospitalId: r.hospital_id,
    hospitalName: hospital?.name ?? "Your hospital",
    emergencyPhone: hospital?.emergency_phone ?? null,
    departmentId: r.department_id,
    departmentName: embedded(r.hospital_departments)?.name ?? "Outpatients",
    capacityMode: r.capacity_mode,
    reasonCodes: r.reason_codes ?? [],
    timeToCareDays: r.time_to_care_days,
    confidential: r.confidential,
  };
}

/**
 * The active service lines — at one hospital, or every hospital's lines of
 * one NAME (the no-silent-wait rule's second option: the same service
 * elsewhere). Readable by any signed-in user under RLS (0058).
 */
export async function fetchServiceLines(
  scope: { hospitalId: string } | { name: string },
): Promise<ServiceLine[]> {
  let query = supabase.from("service_lines").select(LINE_SELECT).eq("active", true);
  query =
    "hospitalId" in scope
      ? query.eq("hospital_id", scope.hospitalId)
      : query.eq("name", scope.name);
  const { data, error } = await query
    .order("name")
    .overrideTypes<ServiceLineRow[], { merge: false }>();
  if (error) raise(error.message, "the clinics at this hospital");
  return (data ?? []).map(toLine);
}

export async function fetchServiceLine(id: string): Promise<ServiceLine | null> {
  const { data, error } = await supabase
    .from("service_lines")
    .select(LINE_SELECT)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<ServiceLineRow, { merge: false }>();
  if (error) raise(error.message, "this clinic");
  return data ? toLine(data) : null;
}

/** One published clinic day a patient can take a place in. */
export interface ClinicSession {
  id: string;
  serviceLineId: string;
  startsAtIso: string;
  endsAtIso: string;
  clinicianUserId: string | null;
  /** From `clinician_directory`, or "Clinic team" when the day names nobody yet. */
  clinicianName: string;
  venue: string | null;
  /**
   * ceil(capacity_booked × overbooking) − booked_count, floored at 0 — the
   * same arithmetic as the allocator's WHERE, so what the tile says and what
   * the server accepts cannot drift. 0 is "Full".
   */
  placesLeft: number;
}

interface SessionRow {
  id: string;
  service_line_id: string;
  starts_at: string;
  ends_at: string;
  clinician_user_id: string | null;
  venue: string | null;
  capacity_booked: number;
  overbooking_factor: number | string;
  booked_count: number;
}

/** ADR 0084 §8: the server refuses a day past this; the list never offers one. */
const HORIZON_MS = 14 * 86_400_000;

/**
 * Published, future clinic days within the 14-day horizon — every line at a
 * hospital (the home's glance) or one line (its page). Soonest first. RLS
 * shows published rows only, so a draft or cancelled day never appears.
 */
export async function fetchSessions(
  scope: { hospitalId: string } | { serviceLineId: string },
): Promise<ClinicSession[]> {
  const now = Date.now();
  let query = supabase
    .from("clinic_sessions")
    .select(
      "id, service_line_id, starts_at, ends_at, clinician_user_id, venue, " +
        "capacity_booked, overbooking_factor, booked_count",
    )
    .eq("status", "published")
    .gt("starts_at", new Date(now).toISOString())
    .lt("starts_at", new Date(now + HORIZON_MS).toISOString());
  query =
    "hospitalId" in scope
      ? query.eq("hospital_id", scope.hospitalId)
      : query.eq("service_line_id", scope.serviceLineId);
  const { data, error } = await query
    .order("starts_at")
    .overrideTypes<SessionRow[], { merge: false }>();
  if (error) raise(error.message, "the clinic days");

  const rows = data ?? [];
  const clinicians = await fetchClinicianCards(
    rows.map((r) => r.clinician_user_id).filter((id): id is string => !!id),
  );
  return rows.map((r) => ({
    id: r.id,
    serviceLineId: r.service_line_id,
    startsAtIso: r.starts_at,
    endsAtIso: r.ends_at,
    clinicianUserId: r.clinician_user_id,
    clinicianName:
      (r.clinician_user_id && clinicians.get(r.clinician_user_id)?.name) || "Clinic team",
    venue: r.venue,
    placesLeft: Math.max(
      Math.ceil(r.capacity_booked * Number(r.overbooking_factor)) - r.booked_count,
      0,
    ),
  }));
}

/* ─── writes ─────────────────────────────────────────────────────── */

export type AppointmentReason = PatientReasonCode;

/**
 * Appendix A's 13 reasons (PRD §2.3), in its order, with its words as the
 * titles. Administrative only: no entry is a symptom, and the hint under a
 * chip says what kind of visit it is, never what is wrong.
 *
 * `urgent_review` is not here and must not come back (ADR 0084 §12): a
 * patient-picked "urgent" is not a triage signal.
 * `appointments_reason_check` is the backstop; this list is the message.
 */
export const APPOINTMENT_REASONS: readonly {
  value: AppointmentReason;
  title: string;
  hint: string;
}[] = [
  { value: "follow_up", title: "Routine follow-up", hint: "You have been seen for this before." },
  {
    value: "post_discharge",
    title: "Post-discharge review",
    hint: "A check after a hospital stay.",
  },
  {
    value: "new_concern",
    title: "New or worsening problem",
    hint: "Something you want looked at fresh.",
  },
  { value: "refill", title: "Medicine refill", hint: "You need more, or need it reviewed." },
  {
    value: "test_results",
    title: "Test or scan results",
    hint: "To go through results with the clinic.",
  },
  { value: "antenatal", title: "Antenatal visit", hint: "A pregnancy check." },
  { value: "immunisation", title: "Child immunisation", hint: "A vaccine on the schedule." },
  {
    value: "child_wellness",
    title: "Child wellness / growth",
    hint: "A growth and development check.",
  },
  {
    value: "specialist_review",
    title: "Specialist review (referred)",
    hint: "You were referred to a specialist.",
  },
  { value: "routine", title: "Screening or check-up", hint: "A regular check, not a new problem." },
  {
    value: "procedure",
    title: "Procedure or dressing",
    hint: "A planned procedure or a wound dressing.",
  },
  { value: "counselling", title: "Counselling or support", hint: "Time to talk with someone." },
  { value: "second_opinion", title: "Second opinion", hint: "Another clinician's view." },
];

/** The reasons a line takes, in Appendix A's order — for a page that books one line. */
export function reasonsFor(line: Pick<ServiceLine, "reasonCodes">) {
  return APPOINTMENT_REASONS.filter((r) => line.reasonCodes.includes(r.value));
}

/** Every reason that opens the emergency interstitial before any capacity step (PRD §2.5). */
export const INTERSTITIAL_REASONS: ReadonlySet<string> = new Set<AppointmentReason>([
  "new_concern",
]);

/**
 * `cancel-appointment` and `reschedule-appointment` both require a reason of
 * at least this many characters — it lands in the audit log. Gate the submit
 * control on the same number: the server's refusal for a short one is zod's
 * "Invalid input", which is precisely the useless generic sentence a patient
 * must never be shown.
 */
export const MIN_REASON_CHARS = 8;

/**
 * One key per submission attempt, reused across retries of it — a 2G retry
 * then returns the first attempt's booking instead of making a second
 * (PRD §3.3.2). A NEW key after success or after the pick changes.
 */
export const newIdempotencyKey = requestId;

/** What `pt-request-appointment` returns — the receipt, on a fresh insert and on a replay alike. */
export interface BookingReceipt {
  appointment_id: string;
  status: string;
  booking_code: string | null;
  position_number: number | null;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
}

/**
 * ADR 0084 §2: one POST per door, completing on one round trip. Exactly one
 * of `slot` (a clinician's time) or `session` (a place in a clinic day).
 */
export function requestAppointment(
  input: {
    hospitalId: string;
    reason: AppointmentReason;
    reasonNote?: string | null;
    idempotencyKey: string;
    /** A household member's provisional id — the server books it with `created_by` = this account (Gate D). */
    forProvisionalId?: string;
  } & (
    | {
        slot: {
          clinicianUserId: string;
          departmentId: string;
          startsAtIso: string;
          endsAtIso: string;
        };
      }
    | { session: { sessionId: string } }
  ),
): Promise<EdgeResult<BookingReceipt>> {
  return callEdge("pt-request-appointment", {
    hospital_id: input.hospitalId,
    reason: input.reason,
    reason_note: input.reasonNote ?? null,
    idempotency_key: input.idempotencyKey,
    channel: "app",
    // Absent, not null: zod's `.optional()` takes undefined and JSON drops it.
    ...(input.forProvisionalId ? { for_provisional_id: input.forProvisionalId } : {}),
    ...("slot" in input
      ? {
          slot: {
            clinician_user_id: input.slot.clinicianUserId,
            department_id: input.slot.departmentId,
            starts_at: input.slot.startsAtIso,
            ends_at: input.slot.endsAtIso,
            // `type` is deliberately omitted: the function defaults to
            // `in_person`, and virtual is not a door this app opens.
          },
        }
      : { session: { session_id: input.session.sessionId } }),
  });
}

export function declareIntake(input: {
  hospitalId: string;
  receivingDepartmentId: string;
  presentingComplaint?: string | null;
}): Promise<EdgeResult<{ intake_id: string; status: string }>> {
  return callEdge("pt-declare-intake", {
    hospital_id: input.hospitalId,
    receiving_department_id: input.receivingDepartmentId,
    presenting_complaint: input.presentingComplaint ?? null,
  });
}

/**
 * ADR 0034 §5: a patient may take their own place out of today's line only
 * while it is still `declared`. `ha-cancel-intake` is a hospital-admin
 * function that admits the patient for exactly that one case (its check, not
 * this file's — once reception has registered them, the desk owns the row).
 * The reason is the web's own string, so the audit log reads the same
 * whichever client cancelled.
 */
export function cancelIntake(intakeId: string): Promise<EdgeResult<{ intake_id: string }>> {
  return callEdge("ha-cancel-intake", {
    intake_id: intakeId,
    reason: "Patient cancelled their own queue ticket before checking in.",
  });
}

/**
 * Whether `ha-mark-arrived` would take "I have arrived" from this account:
 * the patient's own visit, confirmed, on the hospital's today. Gate the
 * control on this, not on a guess — the function's refusal sentence reaches
 * the screen verbatim if the two ever disagree.
 */
export function canArrive(
  row: Pick<AppointmentRow, "status" | "startsAtIso" | "forMember" | "type">,
): boolean {
  return (
    row.status === "confirmed" &&
    row.type !== "virtual" &&
    row.forMember === null &&
    dateKey(new Date(row.startsAtIso)) === dateKey(new Date())
  );
}

/**
 * The digital pre-queue (Gate D): confirmed → arrived, and a queue row. The
 * reason is fixed so the audit log reads the same from every phone.
 */
export function markArrived(
  appointmentId: string,
): Promise<EdgeResult<{ appointment_id: string; queue_entry_id: string | null }>> {
  return callEdge("ha-mark-arrived", {
    appointment_id: appointmentId,
    reason: "Patient marked their own arrival from the app.",
  });
}

export function cancelAppointment(
  appointmentId: string,
  reason: string,
): Promise<EdgeResult<{ appointment_id: string; status: string }>> {
  if (reason.trim().length < MIN_REASON_CHARS) {
    return Promise.resolve({
      ok: false,
      error: `Say a little more about why — at least ${MIN_REASON_CHARS} characters.`,
    });
  }
  return callEdge("cancel-appointment", {
    appointment_id: appointmentId,
    reason: reason.trim(),
  });
}

export function rescheduleAppointment(input: {
  appointmentId: string;
  newStartsAtIso: string;
  newEndsAtIso: string;
  reason: string;
}): Promise<
  EdgeResult<{ old_appointment_id: string; new_appointment_id: string; new_status: string }>
> {
  if (input.reason.trim().length < MIN_REASON_CHARS) {
    return Promise.resolve({
      ok: false,
      error: `Say a little more about why — at least ${MIN_REASON_CHARS} characters.`,
    });
  }
  return callEdge("reschedule-appointment", {
    appointment_id: input.appointmentId,
    new_starts_at: input.newStartsAtIso,
    new_ends_at: input.newEndsAtIso,
    reason: input.reason.trim(),
  });
}

/* ─── the household (Gate D, ADR 0089; PRD §2.9) ─────────────────── */

/** `booking_agents.relationship` — the migration's CHECK list, with the words a patient picks. */
export const HOUSEHOLD_RELATIONSHIPS = [
  { value: "parent", label: "Parent" },
  { value: "guardian", label: "Guardian" },
  { value: "child", label: "Adult child" },
  { value: "spouse", label: "Spouse" },
  { value: "relative", label: "Relative" },
  { value: "vht", label: "VHT" },
  { value: "other", label: "Other" },
] as const;

export type HouseholdRelationship = (typeof HOUSEHOLD_RELATIONSHIPS)[number]["value"];

/** Someone this account books for — a live `booking_agents` row about a provisional record. */
export interface HouseholdMember {
  id: string;
  provisionalPatientId: string;
  /** The name the agent gave — their own words, plaintext, agent-visible only (RLS). */
  label: string;
  relationship: HouseholdRelationship;
}

/**
 * The people this account may book for. Live links only (RLS hides revoked
 * ones); provisional members only, because that is the only kind
 * `pt-add-household-member` creates and `for_provisional_id` accepts.
 */
export async function fetchHousehold(): Promise<HouseholdMember[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("booking_agents")
    .select("id, provisional_patient_id, member_label, relationship")
    .eq("agent_user_id", userId)
    .is("revoked_at", null)
    .not("provisional_patient_id", "is", null)
    .order("created_at")
    .overrideTypes<
      {
        id: string;
        provisional_patient_id: string;
        member_label: string;
        relationship: HouseholdRelationship;
      }[],
      { merge: false }
    >();
  if (error) raise(error.message, "the people you book for");
  return (data ?? []).map((r) => ({
    id: r.id,
    provisionalPatientId: r.provisional_patient_id,
    label: r.member_label,
    relationship: r.relationship,
  }));
}

/**
 * "+256XXXXXXXXX" from the ways a Ugandan number gets typed — "0772 123 456",
 * "256772123456". Spaces and dashes dropped, a leading 0 swapped for the
 * country code. Anything else is sent as typed and the server's own sentence
 * says what shape it wants.
 */
export function toUgandaE164(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.startsWith("256")) return `+${digits}`;
  return digits;
}

/**
 * Add an adult this account books for. The phone cannot encrypt, so the
 * provisional record is minted server-side; a minor is refused there with
 * "Booking for a child is not available yet." and the sentence reaches the
 * screen verbatim. Exactly one of `dateOfBirth` (YYYY-MM-DD) / `ageYears`
 * is needed; both may be given.
 */
export function addHouseholdMember(input: {
  label: string;
  phone: string;
  dateOfBirth?: string | null;
  ageYears?: number | null;
  declaredAdult: boolean;
  relationship: HouseholdRelationship;
}): Promise<
  EdgeResult<{
    booking_agent_id: string;
    provisional_patient_id: string;
    member_label: string;
    relationship: string;
    consent_basis: string;
  }>
> {
  return callEdge("pt-add-household-member", {
    member_label: input.label.trim(),
    phone_e164: toUgandaE164(input.phone),
    ...(input.dateOfBirth ? { date_of_birth: input.dateOfBirth } : {}),
    ...(input.ageYears != null ? { age_years: input.ageYears } : {}),
    declared_adult: input.declaredAdult,
    relationship: input.relationship,
  });
}

/* ─── ratings (ADR 0085 §2) ──────────────────────────────────────── */

/** The statuses that prove the patient was there — `pt-rate-visit`'s own list. */
const ATTENDED: ReadonlySet<string> = new Set(["arrived", "in_progress", "completed"]);

/**
 * Whether `pt-rate-visit` would accept a rating of this visit: the patient was
 * there and it is over. Gate the control on this, not on a guess — the
 * function's refusal is the sentence "You can rate a visit once it has
 * happened.", and it reaches the screen verbatim if the gate is wrong.
 */
export function canRate(row: Pick<AppointmentRow, "status" | "endsAtIso">): boolean {
  return ATTENDED.has(row.status) && new Date(row.endsAtIso).getTime() < Date.now();
}

/** The patient's own rating of a visit, or null. Own row only, under RLS. */
export async function fetchMyRating(
  appointmentId: string,
): Promise<{ stars: number; comment: string | null } | null> {
  const { data, error } = await supabase
    .from("visit_ratings")
    .select("stars, comment")
    .eq("appointment_id", appointmentId)
    .maybeSingle()
    .overrideTypes<{ stars: number; comment: string | null }, { merge: false }>();
  if (error) raise(error.message, "your rating");
  return data ?? null;
}

/** One rating per visit; a second replaces the first. The server is the only writer. */
export function rateVisit(input: {
  appointmentId: string;
  stars: number;
  comment?: string | null;
}): Promise<EdgeResult<{ rating_id: string; stars: number }>> {
  return callEdge("pt-rate-visit", {
    appointment_id: input.appointmentId,
    stars: input.stars,
    comment: input.comment?.trim() || null,
  });
}

/* ─── the patient's photograph (ADR 0085 §1) ─────────────────────── */

/** A signed URL lives this long; a screen is open for minutes, not days. */
const AVATAR_URL_TTL_SECONDS = 3600;

/**
 * What the Settings screen hands `expo-image-picker`. Square crop and a 0.7
 * JPEG so the file is already small: there is no downscale step in React
 * Native without another dependency, and the picker's own compression keeps
 * a phone photo well under the bucket's 2 MB cap.
 */
export const AVATAR_PICKER_OPTIONS: ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.7,
};

async function signAvatar(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, AVATAR_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

/**
 * A signed URL for the caller's own photograph, or null.
 *
 * Null on every failure, not a throw: no photo is the ordinary day-one state
 * and renders as a monogram, and a signing hiccup must not take the home
 * screen down with it.
 */
export async function fetchMyAvatarUrl(): Promise<string | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data } = await supabase
    .from("users")
    .select("avatar_path")
    .eq("id", userId)
    .maybeSingle()
    .overrideTypes<{ avatar_path: string | null }, { merge: false }>();
  return data?.avatar_path ? signAvatar(data.avatar_path) : null;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Upload a picked image as the caller's photograph and point `users.avatar_path`
 * at it. Returns the new signed URL, or throws with a sentence a screen can
 * show. `localUri` and `mime` come straight off the picker's asset.
 *
 * ponytail: the key's id is time + randomness, the same shape `edge.ts` uses
 * for request ids, because Hermes has no `crypto.randomUUID` and the key only
 * has to be unique inside this user's own folder. Upgrade path: `expo-crypto`.
 */
export async function uploadAvatar(localUri: string, mime: string): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new Error("You're signed out. Sign in and try again.");

  const contentType = EXT_BY_MIME[mime] ? mime : "image/jpeg";
  const path = `${userId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${EXT_BY_MIME[contentType]}`;

  const body = await (await fetch(localUri)).arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, body, { contentType, upsert: false });
  if (uploadError) throw new Error("Couldn't save your photo. Try again.");

  const { error } = await supabase.from("users").update({ avatar_path: path }).eq("id", userId);
  if (error) throw new Error("Couldn't save your photo. Try again.");

  const url = await signAvatar(path);
  if (!url) throw new Error("Couldn't save your photo. Try again.");
  return url;
}
