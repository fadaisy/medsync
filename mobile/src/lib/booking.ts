import type { EdgeResult } from "@/lib/edge";
import type { ImagePickerOptions } from "expo-image-picker";
import {
  DEFAULT_TIME_ZONE,
  LIVE_APPOINTMENT_STATUSES,
  localDateKey,
  localWeekdayAndMinutes,
} from "@shared/slots";

import { callEdge } from "@/lib/edge";
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
 * Midnight today, in the clinic's zone, as an instant.
 *
 * Not `setHours(0,0,0,0)`, which reads the DEVICE's zone — the bug this whole
 * file is arranged to avoid. Every IANA offset is a whole number of minutes,
 * so epoch seconds and wall-clock seconds agree in every zone and `% 60_000`
 * strips the seconds the engine's helper does not report.
 */
function startOfClinicDay(now: Date): Date {
  const ms = now.getTime();
  const { minutesOfDay } = localWeekdayAndMinutes(now, DEFAULT_TIME_ZONE);
  return new Date(ms - minutesOfDay * 60_000 - (ms % 60_000));
}

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
}

interface AppointmentQueryRow {
  id: string;
  hospital_id: string;
  department_id: string;
  clinician_user_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  reason: string;
  reason_note: string | null;
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

  let query = supabase
    .from("appointments")
    .select(
      "id, hospital_id, department_id, clinician_user_id, starts_at, ends_at, status, " +
        "reason, reason_note, hospital_departments(name), hospitals(name)",
    )
    .eq("patient_user_id", userId);
  query = isPast ? query.lt("starts_at", nowIso) : query.gte("starts_at", nowIso);
  if (kind === "upcoming-active") query = query.in("status", LIVE_STATUSES);

  const { data, error } = await query
    .order("starts_at", { ascending: !isPast })
    .limit(limit)
    .overrideTypes<AppointmentQueryRow[], { merge: false }>();
  if (error) raise(error.message, "your visits");

  const rows = data ?? [];
  const clinicians = await fetchClinicianCards(rows.map((r) => r.clinician_user_id));
  return rows.map((r) => ({
    id: r.id,
    startsAtIso: r.starts_at,
    endsAtIso: r.ends_at,
    status: r.status,
    reason: r.reason,
    reasonNote: r.reason_note,
    // The same fallback the web uses when `users.full_name` is null — a real
    // sentence, not a placeholder, and honest about what we actually know.
    clinicianName: clinicians.get(r.clinician_user_id)?.name ?? "Your clinician",
    clinicianPhotoUrl: clinicians.get(r.clinician_user_id)?.photoUrl ?? null,
    departmentName: embedded(r.hospital_departments)?.name ?? "Outpatients",
    hospitalName: embedded(r.hospitals)?.name ?? "Your hospital",
    hospitalId: r.hospital_id,
    departmentId: r.department_id,
    clinicianUserId: r.clinician_user_id,
  }));
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

  const now = new Date();
  const start = startOfClinicDay(now);
  const end = new Date(start.getTime() + 86_400_000);

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
  /** From `staff_affiliations.specialty_id`, or null — screens fall back to the department. */
  specialty: string | null;
  departmentId: string;
  departmentName: string;
  /** A signed URL good for an hour, or null — a monogram, never a placeholder face (ADR 0085 §1). */
  photoUrl: string | null;
  /** Real ratings only; null renders as "No ratings yet" (ADR 0085 §2). */
  rating: { average: number; count: number } | null;
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
 * Every (clinician, department) pair — at one hospital, or at every active
 * hospital when none is given (ADR 0086) — with at least one day open in the
 * next 14 days, EARLIEST OPEN DAY FIRST, so `[0]` is the soonest and a reload
 * lands on the same person. Derived server-side by `pt-bookable-clinicians`
 * from the same engine the write path validates with; see rule 1 in the header.
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

/* ─── writes ─────────────────────────────────────────────────────── */

export type AppointmentReason = "follow_up" | "new_concern" | "refill" | "routine" | "other";

/**
 * The reasons a patient may pick, with the words the web already uses.
 *
 * `urgent_review` is not here and must not come back (ADR 0084 §12). A
 * patient-picked "urgent" is not a triage signal, and it sat one query away
 * from being read as one beside the system-driven `system_urgent` origin.
 * `appointments_patient_reason_check` is the backstop; this list is the
 * message.
 */
export const APPOINTMENT_REASONS: readonly {
  value: AppointmentReason;
  title: string;
  hint: string;
}[] = [
  { value: "follow_up", title: "Follow-up", hint: "You have been seen for this before." },
  { value: "new_concern", title: "New concern", hint: "Something you want looked at fresh." },
  { value: "refill", title: "Medicine refill", hint: "You need more, or need it reviewed." },
  { value: "routine", title: "Routine check-up", hint: "A regular check, not a new problem." },
  { value: "other", title: "Something else", hint: "Use the note below to say what it is." },
];

/**
 * `cancel-appointment` and `reschedule-appointment` both require a reason of
 * at least this many characters — it lands in the audit log. Gate the submit
 * control on the same number: the server's refusal for a short one is zod's
 * "Invalid input", which is precisely the useless generic sentence a patient
 * must never be shown.
 */
export const MIN_REASON_CHARS = 8;

/** ADR 0084 §2: one POST per door, completing on one round trip. */
export function requestAppointment(input: {
  clinicianUserId: string;
  hospitalId: string;
  departmentId: string;
  reason: AppointmentReason;
  reasonNote?: string | null;
  startsAtIso: string;
  endsAtIso: string;
}): Promise<EdgeResult<{ appointment_id: string; status: string }>> {
  return callEdge("pt-request-appointment", {
    clinician_user_id: input.clinicianUserId,
    hospital_id: input.hospitalId,
    department_id: input.departmentId,
    reason: input.reason,
    reason_note: input.reasonNote ?? null,
    starts_at: input.startsAtIso,
    ends_at: input.endsAtIso,
    // `type` is deliberately omitted: the function defaults to `in_person`,
    // and virtual is not a door this app opens.
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
