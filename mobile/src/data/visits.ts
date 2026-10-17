import type { Ticket } from "@/features/visits/ticket-cache";
import type {
  AppointmentReason,
  AppointmentRow,
  ClinicSession,
  LiveIntake,
  PatientProfile,
  ServiceLine,
} from "@/lib/booking";
import { feeRange } from "@shared/fees";

import { createStore, useStore } from "@/data/store";
import { addDays, clockOf, dayKeyOf, deskCode, partOf, payLook } from "@/features/visits/logic";
import { dropTicket, readTickets, saveTicket } from "@/features/visits/ticket-cache";
import { track } from "@/lib/analytics";
import {
  cancelAppointment,
  cancelIntake,
  declareIntake,
  fetchAppointments,
  fetchBookableClinicians,
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

export type { Ticket } from "@/features/visits/ticket-cache";

/**
 * Visits, booking and tickets (Gate 4, PRD F-08 to F-12).
 *
 * REAL where an engine with RLS exists: the patient's appointments, the walk-in
 * clinics open now, joining today's line (`pt-declare-intake`), leaving it,
 * the published clinic days, asking for one (`pt-request-appointment`), and
 * moving, cancelling, confirming and arriving for a visit.
 *
 * DEMO where none does, always shown with the ribbon (law L1):
 * - The people before you in a line. `patient_intakes` RLS lets a patient
 *   read their own rows only, so a count from the phone is always 0; it needs
 *   a server-side read (ADR 0084 §6). The counts here are fixtures.
 * - Per-doctor lines: an intake is declared into a department, never to a
 *   doctor, so the doctor picked in Come today is a preference on the ticket.
 * - Lab and care-team days, the care plan (clinical, law L2), travel times
 *   and the drawn map.
 *
 * Payments never move money (PRD non-goal): see `payments`.
 */

/* ─── art and fixtures ──────────────────────────────────────────── */

/** The drawn map's colours: art, not UI, so they live with the fixture. */
export const MAP_ART = {
  land: "#e4e7ee",
  road: "#ffffff",
  route: "#1b2540",
  start: "#2dd4bf",
  end: "#1b2540",
  ring: "#ffffff",
} as const;

/** "Map and travel times illustrative." */
export const TRAVEL = { distance: "4.2 km", boda: "~15 min", taxi: "~35 min" } as const;

/** One doctor's line in Come today. `ahead` is a fixture (see the header). */
export interface DemoLine {
  id: string;
  name: string;
  role: string;
  initials: string;
  ahead: number;
  yours: boolean;
  /** UGX; null = no fee. Public services never charge (PRD Q4). */
  fee: number | null;
}

const LINE_SETS: DemoLine[][] = [
  [
    {
      id: "na",
      name: "Dr [Name A]",
      role: "Specialist · your usual",
      initials: "NA",
      ahead: 5,
      yours: true,
      fee: 30000,
    },
    {
      id: "nb",
      name: "Dr [Name B]",
      role: "Diabetes doctor",
      initials: "NB",
      ahead: 2,
      yours: false,
      fee: null,
    },
    {
      id: "nc",
      name: "[Name C]",
      role: "Clinical officer",
      initials: "NC",
      ahead: 1,
      yours: false,
      fee: null,
    },
  ],
  [
    {
      id: "nd",
      name: "Dr [Name D]",
      role: "Medical officer",
      initials: "ND",
      ahead: 7,
      yours: false,
      fee: null,
    },
    {
      id: "ne",
      name: "Dr [Name E]",
      role: "Private wing",
      initials: "NE",
      ahead: 4,
      yours: false,
      fee: 20000,
    },
    {
      id: "nf",
      name: "[Name F]",
      role: "Clinical officer",
      initials: "NF",
      ahead: 3,
      yours: false,
      fee: null,
    },
  ],
  [
    {
      id: "ng",
      name: "[Name G]",
      role: "Eye clinical officer",
      initials: "NG",
      ahead: 6,
      yours: false,
      fee: 15000,
    },
  ],
];

export interface Clinic {
  id: string;
  name: string;
  /** "Room 4 · 3 doctors" on a demo clinic; "Open now" on a real one (no room is recorded). */
  sub: string;
  room: string;
  lines: DemoLine[];
}

const DEMO_CLINICS: Clinic[] = [
  {
    id: "dm",
    name: "Diabetes clinic",
    sub: "Room 4 · 3 doctors",
    room: "Room 4",
    lines: LINE_SETS[0],
  },
  { id: "opd", name: "General clinic", sub: "OPD · 4 doctors", room: "OPD", lines: LINE_SETS[1] },
  { id: "eye", name: "Eye clinic", sub: "Room 9 · 1 doctor", room: "Room 9", lines: LINE_SETS[2] },
];

/** Clinical items on the week (law L2: fixtures until Gate CG), days after today. */
export const WEEK_FIXTURES = [
  {
    offset: 3,
    kind: "lab" as const,
    label: "Lab",
    title: "Blood test",
    time: "08:00",
    line: "Lab at 08:00.",
  },
  {
    offset: 5,
    kind: "team" as const,
    label: "Care team",
    title: "Phone check-in",
    time: "10:00",
    line: "Your care team calls you at 10:00",
  },
];
export const CARE_PLAN = { readings: 2, medicines: 3, done: 3, total: 5 } as const;

/* ─── tickets: a store over the offline cache ───────────────────── */

const tickets = createStore<Ticket[]>([]);
let hydrated = false;

/** Fills the store from the phone once, so a ticket shows before any network. */
export async function hydrateTickets(): Promise<Ticket[]> {
  if (!hydrated) {
    hydrated = true;
    const cached = await readTickets();
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
  track("ticket_issued", {
    kind: ticket.kind,
    look: payLook(ticket.fee, ticket.paid),
    demo: ticket.demo,
  });
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

export interface Today {
  /** False when the patient has no hospital yet: the whole screen is a demo. */
  real: boolean;
  profile: PatientProfile | null;
  hospitalName: string;
  clinics: Clinic[];
  live: LiveIntake | null;
}

export async function loadToday(): Promise<Today> {
  const profile = await fetchPatientProfile();
  if (!profile?.hospitalId)
    return {
      real: false,
      profile,
      hospitalName: "[Hospital name]",
      clinics: DEMO_CLINICS,
      live: null,
    };
  const [departments, live] = await Promise.all([
    fetchWalkInDepartments(profile.hospitalId),
    fetchLiveIntake(profile.hospitalId),
  ]);
  const clinics = departments
    .filter((d) => d.openNow)
    .map((d, i) => ({
      id: d.id,
      name: d.name,
      sub: "Open now",
      room: "Ask at the desk",
      lines: LINE_SETS[i % 3],
    }));
  return {
    real: true,
    profile,
    hospitalName: profile.hospitalName ?? "Your hospital",
    clinics,
    live,
  };
}

export type IssueResult = { ok: true; ticket: Ticket } | { ok: false; error: string };

/**
 * Save my place. Real: `pt-declare-intake` into the chosen clinic; a refusal
 * because a ticket already exists today recovers that ticket instead. The
 * doctor is a preference printed on the ticket (intakes are not per doctor),
 * and the count before you is the fixture's.
 */
export async function joinLine(input: {
  today: Today;
  clinic: Clinic;
  line: DemoLine | null;
  ahead: number;
  patient: string;
  payNow: boolean;
  now: Date;
}): Promise<IssueResult> {
  const { today, clinic, line } = input;
  let id = `demo-${input.now.getTime().toString(36)}`;
  if (today.real && today.profile?.hospitalId) {
    const res = await declareIntake({
      hospitalId: today.profile.hospitalId,
      receivingDepartmentId: clinic.id,
      symptomSubmissionId: getPendingCatalogDraft()?.submissionId,
    });
    if (res.ok) id = res.data.intake_id;
    else {
      const live = await fetchLiveIntake(today.profile.hospitalId).catch(() => null);
      if (!live) return { ok: false, error: res.error };
      id = live.id;
    }
    clearPendingCatalogDraft();
  }
  const fee = line?.fee ?? null;
  let paid = false;
  let demoPayment = false;
  if (fee && input.payNow) {
    const res = await payments.pay(fee);
    if (res.ok) {
      paid = true;
      demoPayment = res.demo;
    }
  }
  const ticket = await issue({
    id,
    kind: "queue",
    hospitalName: today.hospitalName,
    clinic: clinic.name,
    see: line?.name ?? "Any doctor",
    room: clinic.room,
    patient: input.patient,
    code: today.profile?.patientCode ?? deskCode("KWP", id),
    issuedAtIso: input.now.toISOString(),
    ahead: input.ahead,
    dayKey: dayKeyOf(input.now),
    part: null,
    doors: null,
    awaiting: false,
    fee,
    feeLabel: null,
    paid,
    demoPayment,
    countDemo: true,
    demo: !today.real,
  });
  return { ok: true, ticket };
}

/** Give up my place: `ha-cancel-intake` admits the patient while the row is still `declared`. */
export async function leaveLine(
  ticket: Ticket,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ticket.demo) {
    const res = await cancelIntake(ticket.id);
    if (!res.ok) return { ok: false, error: res.error };
  }
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

export interface SessionOption {
  id: string;
  part: "Morning" | "Afternoon";
  doors: string;
  placesLeft: number;
  clinicianName: string;
  clinicName: string;
  room: string;
  fee: number | null;
  feeLabel: string | null;
}

export interface DayOption {
  key: string;
  sessions: SessionOption[];
}

export interface Days {
  real: boolean;
  hospitalId: string | null;
  hospitalName: string;
  days: DayOption[];
}

function sessionFee(line: ServiceLine | undefined): {
  fee: number | null;
  feeLabel: string | null;
} {
  const range = line ? feeRange(line.fee) : null;
  if (!range) return { fee: null, feeLabel: null };
  return { fee: range.minUgx, feeLabel: range.single ? null : (line?.feeLine ?? null) };
}

function demoDays(now: Date): DayOption[] {
  const today = dayKeyOf(now);
  return [3, 6, 10, 13].map((offset, i) => {
    const key = addDays(today, offset);
    const s = (
      part: "Morning" | "Afternoon",
      doors: string,
      places: number,
      named: boolean,
    ): SessionOption => ({
      id: `demo-${key}-${part}-${named ? "a" : "any"}`,
      part,
      doors,
      placesLeft: places,
      clinicianName: named ? "Dr [Name A]" : "Clinic team",
      clinicName: "Diabetes clinic",
      room: "Room 4",
      fee: named ? 30000 : null,
      feeLabel: null,
    });
    return {
      key,
      sessions: [
        s("Morning", "08:00", i === 1 ? 0 : 6, false),
        s("Morning", "08:00", i === 1 ? 0 : 3, true),
        s("Afternoon", "13:00", 4, false),
      ],
    };
  });
}

/**
 * Published clinic days within the 14-day horizon that take this reason,
 * grouped by day. A day with no place left stays on the rail as "Full".
 */
export async function loadDays(reason: AppointmentReason, now: Date): Promise<Days> {
  const profile = await fetchPatientProfile();
  if (!profile?.hospitalId)
    return { real: false, hospitalId: null, hospitalName: "[Hospital name]", days: demoDays(now) };
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
  return {
    real: true,
    hospitalId: profile.hospitalId,
    hospitalName: profile.hospitalName ?? "Your hospital",
    days,
  };
}

/** Ask for a day: one place in a clinic day, through `pt-request-appointment`. */
export async function requestDay(input: {
  days: Days;
  day: DayOption;
  session: SessionOption;
  reason: AppointmentReason;
  note: string;
  forProvisionalId: string | null;
  patient: string;
  payNow: boolean;
  idempotencyKey: string;
  now: Date;
}): Promise<IssueResult> {
  const { days, session } = input;
  let id = `demo-${input.now.getTime().toString(36)}`;
  let code = deskCode("KWP", id);
  let awaiting = true;
  if (days.real && days.hospitalId) {
    const res = await requestAppointment({
      hospitalId: days.hospitalId,
      reason: input.reason,
      reasonNote: input.note.trim() || null,
      idempotencyKey: input.idempotencyKey,
      ...(input.forProvisionalId ? { forProvisionalId: input.forProvisionalId } : {}),
      session: { sessionId: session.id },
    });
    if (!res.ok) return { ok: false, error: res.error };
    id = res.data.appointment_id;
    code = res.data.booking_code ?? code;
    awaiting = res.data.status === "requested" || res.data.status === "pending_approval";
  }
  let paid = false;
  let demoPayment = false;
  if (session.fee && input.payNow) {
    const res = await payments.pay(session.fee);
    if (res.ok) {
      paid = true;
      demoPayment = res.demo;
    }
  }
  const ticket = await issue({
    id,
    kind: "day",
    hospitalName: days.hospitalName,
    clinic: session.clinicName,
    see: session.clinicianName,
    room: session.room,
    patient: input.patient,
    code,
    issuedAtIso: input.now.toISOString(),
    ahead: null,
    dayKey: input.day.key,
    part: session.part,
    doors: session.doors,
    awaiting,
    fee: session.fee,
    feeLabel: session.feeLabel,
    paid,
    demoPayment,
    countDemo: false,
    demo: !days.real,
  });
  return { ok: true, ticket };
}

/* ─── Book: the glance on the two doors ─────────────────────────── */

export interface BookGlance {
  /** Null when the patient has no hospital yet (the doors then run on demo data). */
  openNow: boolean | null;
  nextDayKey: string | null;
}

/** Whether a clinic takes walk-ins now, and the next clinic day with a place. No counts (ADR 0084 §5). */
export async function loadBookGlance(): Promise<BookGlance> {
  const profile = await fetchPatientProfile();
  if (!profile?.hospitalId) return { openNow: null, nextDayKey: null };
  const [departments, sessions] = await Promise.all([
    fetchWalkInDepartments(profile.hospitalId),
    fetchSessions({ hospitalId: profile.hospitalId }),
  ]);
  const next = sessions.find(sessionTakeable);
  return {
    openNow: departments.some((d) => d.openNow),
    nextDayKey: next ? dayKeyOf(next.startsAtIso) : null,
  };
}
