import type { Fee } from "@/features/visits/logic";
import type { Ticket } from "@/features/visits/ticket-cache";
import type {
  AppointmentReason,
  AppointmentRow,
  ClinicianOption,
  ClinicSession,
  LiveIntake,
  PatientProfile,
  ServiceLine,
} from "@/lib/booking";
import type { BookingSymptom } from "@shared/symptoms";
import { feeRange } from "@shared/fees";

import { createStore, useStore } from "@/data/store";
import { clockOf, dayKeyOf, feeFor, partOf, payLook } from "@/features/visits/logic";
import { dropTicket, readTickets, saveTicket } from "@/features/visits/ticket-cache";
import { track } from "@/lib/analytics";
import {
  cancelAppointment,
  cancelIntake,
  choosePrimaryHospital,
  declareIntake,
  fetchAppointments,
  fetchBookableClinicians,
  fetchHospitals,
  fetchLiveIntake,
  fetchPatientProfile,
  fetchServiceLines,
  fetchSessions,
  fetchWalkInDepartments,
  markArrived,
  requestAppointment,
  rescheduleAppointment,
  sessionTakeable,
} from "@/lib/booking";
import { flag } from "@/lib/flags";
import { confirmAttendance } from "@/lib/notifications";
import { clearPendingCatalogDraft, getPendingCatalogDraft } from "@/lib/pending-symptoms";
import { supabase } from "@/lib/supabase";

export type { Ticket } from "@/features/visits/ticket-cache";

/**
 * Visits, booking and tickets (Gate 4, PRD F-08 to F-12), all REAL, under RLS
 * or through an Edge Function: the patient's appointments, the walk-in
 * clinics open now, joining today's line (`pt-declare-intake`), leaving it,
 * "N ahead of you" (`patient_intake_ahead`, migration 0170), the published
 * clinic days and a clinician's open slots, asking for one
 * (`pt-request-appointment`), and moving, cancelling, confirming and arriving.
 *
 * Without a chosen hospital nothing is shown in its place: the screens ask
 * the patient to choose one (`HospitalPicker`).
 *
 * The one example left is money: payments never move it (PRD non-goal), see
 * `payments`. No travel time, map or count of people is drawn: none exists.
 */

/* ─── tickets: a store over the offline cache ───────────────────── */

const tickets = createStore<Ticket[]>([]);
let hydrated = false;

/** Fills the store from the phone once, so a ticket shows before any network. */
export async function hydrateTickets(): Promise<Ticket[]> {
  if (!hydrated) {
    hydrated = true;
    // Round 1 kept example tickets with `demo-` ids; nothing reached a desk with them.
    const cached = (await readTickets()).filter((c) => !c.id.startsWith("demo-"));
    tickets.set((now) => [...now, ...cached.filter((c) => !now.some((t) => t.id === c.id))]);
  }
  return tickets.get();
}

export function useTickets(): Ticket[] {
  return useStore(tickets);
}

async function keep(ticket: Ticket): Promise<void> {
  tickets.set((all) => [ticket, ...all.filter((t) => t.id !== ticket.id)]);
  await saveTicket(ticket);
}

/** A new ticket: kept on the phone and counted (`ticket_issued`). */
async function issue(ticket: Ticket): Promise<Ticket> {
  await keep(ticket);
  track("ticket_issued", { kind: ticket.kind, look: payLook(ticket.fee, ticket.paid) });
  return ticket;
}

/** A ticket shown from the phone because the network did not answer. */
export function shownOffline(ticket: Ticket): void {
  track("ticket_shown_offline", { kind: ticket.kind });
}

/* ─── payments: never moves money ───────────────────────────────── */

export type PayResult = { ok: true; demo: boolean } | { ok: false; error: string };

/**
 * The payments seam (prompt §8.3). With `mobilePayments` off it simulates a
 * success and the ticket says "Demo payment". With it on there is still no
 * Mobile Money integration, so it refuses with words; nothing is charged.
 */
export const payments = {
  async pay(_feeUgx: number): Promise<PayResult> {
    if (!flag("mobilePayments")) return { ok: true, demo: true };
    return { ok: false, error: "Mobile Money is not connected yet. Pay at the desk." };
  },

  /** "Pay now" on an issued ticket. */
  async payTicket(ticket: Ticket): Promise<PayResult> {
    if (!ticket.fee) return { ok: false, error: "This visit has no fee." };
    const res = await this.pay(ticket.fee);
    if (res.ok) await keep({ ...ticket, paid: true, demoPayment: res.demo });
    return res;
  },
};

/* ─── This week ─────────────────────────────────────────────────── */

export interface Week {
  upcoming: AppointmentRow[];
  past: AppointmentRow[];
  /** Day keys with a published clinic day that still has a place. */
  openDays: Set<string>;
  hospitalName: string | null;
}

export async function loadWeek(now: Date): Promise<Week> {
  const [upcoming, past, profile] = await Promise.all([
    fetchAppointments("upcoming", 30, now),
    fetchAppointments("past", 30, now),
    fetchPatientProfile().catch(() => null),
  ]);
  const sessions = profile?.hospitalId
    ? await fetchSessions({ hospitalId: profile.hospitalId }).catch(() => [] as ClinicSession[])
    : [];
  return {
    upcoming,
    past,
    openDays: new Set(sessions.filter(sessionTakeable).map((s) => dayKeyOf(s.startsAtIso))),
    hospitalName: profile?.hospitalName ?? null,
  };
}

/** One visit. There is no single-row read, so both lists, as the old screen did. */
export async function loadVisit(id: string): Promise<AppointmentRow | null> {
  const now = new Date();
  const [upcoming, past] = await Promise.all([
    fetchAppointments("upcoming", 30, now),
    fetchAppointments("past", 30, now),
  ]);
  return [...upcoming, ...past].find((r) => r.id === id) ?? null;
}

export interface MoveOption {
  dayKey: string;
  part: "Morning" | "Afternoon";
  startsAtIso: string;
  endsAtIso: string;
}

/**
 * Where a visit can move: this clinician's open slots in this department,
 * from the server's own grid. Shown as a day and a part of the day, never as
 * a clock time (law L8), so each day-part offers its earliest slot.
 */
export async function moveOptions(visit: AppointmentRow): Promise<MoveOption[]> {
  const clinicians = await fetchBookableClinicians(visit.hospitalId);
  const mine = clinicians.find(
    (c) => c.userId === visit.clinicianUserId && c.departmentId === visit.departmentId,
  );
  if (!mine) return [];
  const current = new Date(visit.startsAtIso).getTime();
  const out: MoveOption[] = [];
  for (const dayKey of Object.keys(mine.slotsByDate).sort()) {
    for (const s of mine.slotsByDate[dayKey] ?? []) {
      if (new Date(s.startsAtIso).getTime() === current) continue;
      const part = partOf(s.startsAtIso);
      if (out.some((o) => o.dayKey === dayKey && o.part === part)) continue;
      out.push({ dayKey, part, startsAtIso: s.startsAtIso, endsAtIso: s.endsAtIso });
    }
  }
  return out;
}

export const visitActions = {
  arrive: markArrived,
  confirm: confirmAttendance,
  cancel: cancelAppointment,
  move: (visit: AppointmentRow, to: MoveOption, reason: string) =>
    rescheduleAppointment({
      appointmentId: visit.id,
      newStartsAtIso: to.startsAtIso,
      newEndsAtIso: to.endsAtIso,
      reason,
    }),
};

/* ─── Come today ────────────────────────────────────────────────── */

/** A clinic taking walk-ins now. No count rides along (ADR 0084 §5). */
export interface Clinic extends Fee {
  id: string;
  name: string;
}

export interface Today {
  profile: PatientProfile | null;
  /** Null when the patient has no hospital yet: the screen asks them to choose one. */
  hospitalName: string | null;
  clinics: Clinic[];
  live: LiveIntake | null;
}

export async function loadToday(): Promise<Today> {
  const profile = await fetchPatientProfile();
  if (!profile?.hospitalId) return { profile, hospitalName: null, clinics: [], live: null };
  const [departments, live, lines] = await Promise.all([
    fetchWalkInDepartments(profile.hospitalId),
    fetchLiveIntake(profile.hospitalId),
    fetchServiceLines({ hospitalId: profile.hospitalId }),
  ]);
  return {
    profile,
    hospitalName: profile.hospitalName ?? "Your hospital",
    clinics: departments
      .filter((d) => d.openNow)
      .map((d) => ({ id: d.id, name: d.name, ...feeFor(lines, d.id, null) })),
    live,
  };
}

/**
 * "N ahead of you" for the patient's own intake (ADR 0084 §6), from
 * `patient_intake_ahead` (migration 0170). Null on ANY failure, including the
 * function not existing yet: the count is then simply not shown.
 */
export async function loadAhead(intakeId: string): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc("patient_intake_ahead", { p_intake: intakeId });
    return error || typeof data !== "number" ? null : data;
  } catch {
    return null;
  }
}

export type IssueResult = { ok: true; ticket: Ticket } | { ok: false; error: string };

/**
 * Save my place: `pt-declare-intake` into the chosen clinic. A refusal because
 * a ticket already exists today recovers that ticket instead. An intake goes
 * to a clinic, never to a doctor, so the ticket names no one.
 */
export async function joinLine(input: {
  profile: PatientProfile & { hospitalId: string };
  hospitalName: string;
  clinic: Clinic;
  patient: string;
  payNow: boolean;
  now: Date;
}): Promise<IssueResult> {
  const { profile, clinic } = input;
  let id: string;
  const res = await declareIntake({
    hospitalId: profile.hospitalId,
    receivingDepartmentId: clinic.id,
    symptomSubmissionId: getPendingCatalogDraft()?.submissionId,
  });
  if (res.ok) id = res.data.intake_id;
  else {
    const live = await fetchLiveIntake(profile.hospitalId).catch(() => null);
    if (!live) return { ok: false, error: res.error };
    id = live.id;
  }
  clearPendingCatalogDraft();
  const { paid, demoPayment } = await payIfAsked(clinic.fee, input.payNow);
  const ticket = await issue({
    id,
    kind: "queue",
    hospitalName: input.hospitalName,
    clinic: clinic.name,
    see: "The clinic team",
    room: "Ask at the desk",
    patient: input.patient,
    code: profile.patientCode,
    issuedAtIso: input.now.toISOString(),
    dayKey: dayKeyOf(input.now),
    part: null,
    doors: null,
    awaiting: false,
    fee: clinic.fee,
    feeLabel: clinic.feeLabel,
    paid,
    demoPayment,
  });
  return { ok: true, ticket };
}

/** The simulated payment, when there is a fee and the patient chose to pay now. */
async function payIfAsked(
  fee: number | null,
  payNow: boolean,
): Promise<{ paid: boolean; demoPayment: boolean }> {
  if (!fee || !payNow) return { paid: false, demoPayment: false };
  const res = await payments.pay(fee);
  return res.ok ? { paid: true, demoPayment: res.demo } : { paid: false, demoPayment: false };
}

/** Give up my place: `ha-cancel-intake` admits the patient while the row is still `declared`. */
export async function leaveLine(
  ticket: Ticket,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await cancelIntake(ticket.id);
  if (!res.ok) return { ok: false, error: res.error };
  tickets.set((all) => all.filter((t) => t.id !== ticket.id));
  await dropTicket(ticket.id);
  return { ok: true };
}

/** Today's queue ticket on this phone, if any. */
export function todaysQueueTicket(all: Ticket[], now: Date): Ticket | null {
  const today = dayKeyOf(now);
  return all.find((t) => t.kind === "queue" && t.dayKey === today) ?? null;
}

/* ─── Ask for a day ─────────────────────────────────────────────── */

/** A clinician's own slot, when the day was asked for with a named clinician. */
export interface SlotPick {
  clinicianUserId: string;
  departmentId: string;
  startsAtIso: string;
  endsAtIso: string;
  serviceLineId?: string;
}

export interface SessionOption extends Fee {
  id: string;
  part: "Morning" | "Afternoon";
  /** When doors open ("08:00") for a clinic day; null for a clinician's slot, whose time is `slot.startsAtIso`. */
  doors: string | null;
  placesLeft: number;
  clinicianName: string;
  clinicName: string;
  room: string;
  /** Set when this is a clinician's slot rather than a place in a clinic day. */
  slot?: SlotPick;
}

export interface DayOption {
  key: string;
  sessions: SessionOption[];
}

export interface Days {
  /** Null when the patient has no hospital yet: the screen asks them to choose one. */
  hospitalId: string | null;
  hospitalName: string;
  /** The patient's own MedSync number: the ticket's code when the clinic issues none. */
  patientCode: string | null;
  /** The clinician the days were asked for (Home's "Ask for a day"); null for every clinic day. */
  doctorName: string | null;
  days: DayOption[];
}

function sessionFee(line: ServiceLine | undefined): Fee {
  const range = line ? feeRange(line.fee) : null;
  if (!range) return { fee: null, feeLabel: null };
  return { fee: range.minUgx, feeLabel: range.single ? null : (line?.feeLine ?? null) };
}

/**
 * One clinician's open slots as day options: every open time of each day, in
 * order, each its own option (one place, never a count shown). The server
 * already returns only truly bookable slots. The fee is the line in their
 * department that takes this reason; that line is sent with the request so
 * the record keeps the same quote.
 */
export function slotDays(
  c: ClinicianOption,
  lines: readonly ServiceLine[],
  reason: AppointmentReason,
): DayOption[] {
  const line = lines.find(
    (l) => l.departmentId === c.departmentId && l.reasonCodes.includes(reason),
  );
  const fee = line ? feeFor([line], c.departmentId, c.cadreId) : { fee: null, feeLabel: null };
  return Object.keys(c.slotsByDate)
    .sort()
    .flatMap((key) => {
      const sessions = [...(c.slotsByDate[key] ?? [])]
        .sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso))
        .map(
          (s): SessionOption => ({
            id: `slot:${s.startsAtIso}`,
            part: partOf(s.startsAtIso),
            doors: null,
            placesLeft: 1,
            clinicianName: c.fullName,
            clinicName: c.departmentName,
            room: c.departmentName,
            ...fee,
            slot: {
              clinicianUserId: c.userId,
              departmentId: c.departmentId,
              startsAtIso: s.startsAtIso,
              endsAtIso: s.endsAtIso,
              ...(line ? { serviceLineId: line.id } : {}),
            },
          }),
        );
      return sessions.length ? [{ key, sessions }] : [];
    });
}

/**
 * Published clinic days within the booking horizon that take this reason,
 * grouped by day; or, with `doctor`, that clinician's own open slots. A day
 * with no place left stays on the calendar as "no open times".
 */
export async function loadDays(
  reason: AppointmentReason,
  doctor: { userId: string; departmentId?: string; hospitalId?: string } | null,
): Promise<Days> {
  const profile = await fetchPatientProfile();
  // A doctor's own hospital may be another one: a patient may book at any (ADR 0086).
  if (doctor?.hospitalId) {
    const [clinicians, lines] = await Promise.all([
      fetchBookableClinicians(doctor.hospitalId),
      fetchServiceLines({ hospitalId: doctor.hospitalId }),
    ]);
    const c = clinicians.find(
      (x) =>
        x.userId === doctor.userId &&
        (!doctor.departmentId || x.departmentId === doctor.departmentId),
    );
    if (c)
      return {
        hospitalId: doctor.hospitalId,
        hospitalName: c.hospitalName,
        patientCode: profile?.patientCode ?? null,
        doctorName: c.fullName,
        days: slotDays(c, lines, reason),
      };
  }
  if (!profile?.hospitalId)
    return { hospitalId: null, hospitalName: "", patientCode: null, doctorName: null, days: [] };
  const base = {
    hospitalId: profile.hospitalId,
    hospitalName: profile.hospitalName ?? "Your hospital",
    patientCode: profile.patientCode,
  };
  if (doctor) {
    const [clinicians, lines] = await Promise.all([
      fetchBookableClinicians(profile.hospitalId),
      fetchServiceLines({ hospitalId: profile.hospitalId }),
    ]);
    const c = clinicians.find(
      (x) =>
        x.userId === doctor.userId &&
        (!doctor.departmentId || x.departmentId === doctor.departmentId),
    );
    if (c) return { ...base, doctorName: c.fullName, days: slotDays(c, lines, reason) };
  }
  const [lines, sessions] = await Promise.all([
    fetchServiceLines({ hospitalId: profile.hospitalId }),
    fetchSessions({ hospitalId: profile.hospitalId }),
  ]);
  const byId = new Map(lines.map((l) => [l.id, l]));
  const days: DayOption[] = [];
  for (const s of sessions) {
    const line = byId.get(s.serviceLineId);
    if (!line || !line.reasonCodes.includes(reason) || s.clinicianUserId === null) continue;
    const key = dayKeyOf(s.startsAtIso);
    let day = days.find((d) => d.key === key);
    if (!day) days.push((day = { key, sessions: [] }));
    day.sessions.push({
      id: s.id,
      part: partOf(s.startsAtIso),
      doors: clockOf(s.startsAtIso),
      placesLeft: s.placesLeft,
      clinicianName: s.clinicianName,
      clinicName: line.name,
      room: s.venue ?? line.departmentName,
      ...sessionFee(line),
    });
  }
  return { ...base, doctorName: null, days };
}

/** Ask for a day: a place in a clinic day, or a clinician's slot, through `pt-request-appointment`. */
export async function requestDay(input: {
  days: Days & { hospitalId: string };
  day: DayOption;
  session: SessionOption;
  reason: AppointmentReason;
  note: string;
  forProvisionalId: string | null;
  patient: string;
  payNow: boolean;
  idempotencyKey: string;
  now: Date;
  /** What the patient chose from the symptom catalogue, as words (ADR 0095, 0098). */
  symptoms?: BookingSymptom[];
}): Promise<IssueResult> {
  const { days, session } = input;
  const res = await requestAppointment({
    hospitalId: days.hospitalId,
    reason: input.reason,
    reasonNote: input.note.trim() || null,
    idempotencyKey: input.idempotencyKey,
    ...(input.symptoms?.length ? { symptoms: input.symptoms } : {}),
    // ADR 0098 ruling 3: a catalog report filed before this door rides with the booking.
    // ponytail: when one rides, the server keeps the report's symptoms over the ones chosen here.
    symptomSubmissionId: getPendingCatalogDraft()?.submissionId,
    ...(input.forProvisionalId ? { forProvisionalId: input.forProvisionalId } : {}),
    ...(session.slot ? { slot: session.slot } : { session: { sessionId: session.id } }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  clearPendingCatalogDraft();
  const { paid, demoPayment } = await payIfAsked(session.fee, input.payNow);
  const ticket = await issue({
    id: res.data.appointment_id,
    kind: "day",
    hospitalName: days.hospitalName,
    clinic: session.clinicName,
    see: session.clinicianName,
    room: session.room,
    patient: input.patient,
    code: res.data.booking_code ?? days.patientCode ?? "Ask at the desk",
    issuedAtIso: input.now.toISOString(),
    dayKey: input.day.key,
    part: session.part,
    doors: session.doors,
    time: session.slot ? clockOf(session.slot.startsAtIso) : null,
    awaiting: res.data.status === "requested" || res.data.status === "pending_approval",
    fee: session.fee,
    feeLabel: session.feeLabel,
    paid,
    demoPayment,
  });
  return { ok: true, ticket };
}

/* ─── the patient's hospital ────────────────────────────────────── */

export type { HospitalOption } from "@/lib/booking";

/** Every active hospital, by name (ADR 0086). */
export const loadHospitals = fetchHospitals;

/** Make one the patient's hospital: the web's own write, under RLS. */
export const chooseHospital = choosePrimaryHospital;

/* ─── Book: the glance on the two doors ─────────────────────────── */

export interface BookGlance {
  /** False until the patient has chosen a hospital: the page asks them to. */
  hasHospital: boolean;
  openNow: boolean | null;
  nextDayKey: string | null;
}

/** Whether a clinic takes walk-ins now, and the next clinic day with a place. No counts (ADR 0084 §5). */
export async function loadBookGlance(): Promise<BookGlance> {
  const profile = await fetchPatientProfile();
  if (!profile?.hospitalId) return { hasHospital: false, openNow: null, nextDayKey: null };
  const [departments, sessions] = await Promise.all([
    fetchWalkInDepartments(profile.hospitalId),
    fetchSessions({ hospitalId: profile.hospitalId }),
  ]);
  const next = sessions.find(sessionTakeable);
  return {
    hasHospital: true,
    openNow: departments.some((d) => d.openNow),
    nextDayKey: next ? dayKeyOf(next.startsAtIso) : null,
  };
}
