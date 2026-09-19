/**
 * The booking wizard's vocabulary and arithmetic — pure, route-private, no
 * React and no `server-only`, so the page (server) and the wizard (client)
 * read one copy and a test can reach the parts that decide what a patient
 * is offered.
 *
 * Nothing in this file asks a clinical question (PRD §7.2 rule 1). A reason
 * is an administrative word from Appendix A; no entry is a symptom.
 */

import type { CapacityMode } from "@/db/schema/service-lines";
import type { PatientReasonCode } from "@/supabase/functions/_shared/sessions-sql";

/* ─── Reasons (PRD Appendix A) ────────────────────────────────────── */

export interface ReasonChip {
  value: PatientReasonCode;
  title: string;
  hint: string;
}

/**
 * Appendix A's 13, in its order, with its words as the titles. `other` is
 * accepted by the server and deliberately not offered: a reason that maps
 * to no service line maps to no capacity (PRD §2.3).
 */
export const REASONS: ReadonlyArray<ReasonChip> = [
  { value: "follow_up", title: "Routine follow-up", hint: "You have been seen for this before." },
  {
    value: "post_discharge",
    title: "Post-discharge review",
    hint: "You were recently discharged from a ward.",
  },
  {
    value: "new_concern",
    title: "New or worsening problem",
    hint: "Something new, or something that has got worse.",
  },
  { value: "refill", title: "Medicine refill", hint: "You need more of a medicine you take." },
  {
    value: "test_results",
    title: "Test or scan results",
    hint: "To go through results you are waiting for.",
  },
  { value: "antenatal", title: "Antenatal visit", hint: "A pregnancy check." },
  { value: "immunisation", title: "Child immunisation", hint: "A vaccine for a child." },
  {
    value: "child_wellness",
    title: "Child wellness / growth",
    hint: "A growth or wellbeing check for a child.",
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
    hint: "A planned procedure, or a dressing change.",
  },
  {
    value: "counselling",
    title: "Counselling or support",
    hint: "Talking with someone, or ongoing support.",
  },
  { value: "second_opinion", title: "Second opinion", hint: "Another clinician's view on a plan." },
];

/** The one reason that intercepts with the interstitial (Appendix A). */
export const INTERSTITIAL_REASON: PatientReasonCode = "new_concern";

/**
 * ⚠ CSO-PROVISIONAL, ASCII, and byte-identical on the phone (ADR 0088). Do
 * not paraphrase. Static: no question, no input, no branch.
 */
export const INTERSTITIAL = {
  title: "Booking is for care that can wait.",
  body: "If this cannot wait, do not book. Go to the nearest emergency unit now.",
  dismiss: "Continue to book",
} as const;

/* ─── Options the page derives and the wizard renders ─────────────── */

export const MODE_LABEL: Record<CapacityMode, string> = {
  session: "Clinic day",
  slot: "Appointment time",
  open_queue: "Same-day queue",
};

export interface SlotOffer {
  startsAtIso: string;
  endsAtIso: string;
}

export interface ClinicianOption {
  userId: string;
  fullName: string;
  autoConfirm: boolean;
  allowVirtual: boolean;
  /** PRD §2.7: the clinician who last saw this patient in this department. */
  seenBefore: boolean;
  /** Open slots keyed by "YYYY-MM-DD" in the hospital's zone, ascending; days with nothing open absent. */
  slotsByDate: Record<string, SlotOffer[]>;
}

export interface SessionOption {
  id: string;
  startsAtIso: string;
  endsAtIso: string;
  /**
   * The clinician the day names, or null. PRD §3.6: "The app never shows a
   * session with no clinician as bookable" — and `_shared/book.ts` refuses one
   * with a 409, so this is the field the tile must gate on. NOT `clinicianName`,
   * which is a left-joined `users.full_name` and is also null for a named
   * clinician who has no name on file.
   */
  clinicianUserId: string | null;
  /** Null renders as "Clinician not yet named" — a day may name one later (T-12h rule). */
  clinicianName: string | null;
  venue: string | null;
  /** ceil(capacity_booked × overbooking) − booked_count; 0 is "Full". */
  placesLeft: number;
}

/** The same service at another hospital, with something bookable inside this line's window. */
export interface ElsewhereOption {
  hospitalId: string;
  hospitalName: string;
  region: string | null;
}

export interface LineOption {
  id: string;
  name: string;
  capacityMode: CapacityMode;
  /** PRD §2.9: never shown to, or bookable by, someone booking for another person. */
  confidential: boolean;
  reasonCodes: string[];
  timeToCareDays: number;
  departmentId: string;
  departmentName: string;
  /** Slot mode: continuity first, then whoever has a day soonest. */
  clinicians: ClinicianOption[];
  /** Session mode: published days in the next 14, ascending. */
  sessions: SessionOption[];
  elsewhere: ElsewhereOption[];
}

/* ─── Arithmetic ──────────────────────────────────────────────────── */

export const DAY_MS = 86_400_000;

/** The last instant inside a line's time-to-care window (PRD §2.4). */
export function windowEndMs(nowMs: number, timeToCareDays: number): number {
  return nowMs + timeToCareDays * DAY_MS;
}

export const openDays = (c: ClinicianOption): string[] => Object.keys(c.slotsByDate).sort();

export const firstOpenDay = (c: ClinicianOption): string | undefined => openDays(c)[0];

/** Whether this clinician has any slot starting inside the window. */
export function clinicianWithin(c: ClinicianOption, endMs: number): boolean {
  const first = firstOpenDay(c);
  const slot = first ? c.slotsByDate[first]?.[0] : undefined;
  return !!slot && new Date(slot.startsAtIso).getTime() <= endMs;
}

/**
 * A clinic day a patient can actually take: a place left AND a clinician
 * named. PRD §3.6 — "the app never shows a session with no clinician as
 * bookable" — and the core 409s one; the gate lives HERE so every "soonest",
 * "within" and "nothing open" reads it once and cannot drift.
 */
export function sessionTakeable(s: Pick<SessionOption, "placesLeft" | "clinicianUserId">): boolean {
  return s.placesLeft > 0 && s.clinicianUserId !== null;
}

export function sessionWithin(s: SessionOption, endMs: number): boolean {
  return sessionTakeable(s) && new Date(s.startsAtIso).getTime() <= endMs;
}

/**
 * Split a clinician's open days at the window: `within` is offered plainly,
 * `beyond` is offered under the "Beyond this clinic's target of N days"
 * label — never silently (PRD §2.4 rule 4).
 */
export function splitDays(
  c: ClinicianOption,
  endMs: number,
): { within: string[]; beyond: string[] } {
  const within: string[] = [];
  const beyond: string[] = [];
  for (const day of openDays(c)) {
    const first = c.slotsByDate[day]?.[0];
    if (!first) continue;
    (new Date(first.startsAtIso).getTime() <= endMs ? within : beyond).push(day);
  }
  return { within, beyond };
}

export function splitSessions(
  sessions: ReadonlyArray<SessionOption>,
  endMs: number,
): { within: SessionOption[]; beyond: SessionOption[] } {
  const within: SessionOption[] = [];
  const beyond: SessionOption[] = [];
  for (const s of sessions) {
    (new Date(s.startsAtIso).getTime() <= endMs ? within : beyond).push(s);
  }
  return { within, beyond };
}

/**
 * PRD §2.4's ordered alternatives, computed only when the preferred option
 * has nothing inside the window. `null` means the plain offer stands.
 *
 *   1. another clinician in the same line (slot mode only)
 *   2. the same-named line at another hospital
 *   3. the same-day queue here — always offered; the wizard renders it
 *   4. the beyond-window options, labelled — the wizard renders them
 */
export function accessAlternatives(
  line: LineOption,
  preferred: ClinicianOption | null,
  nowMs: number,
): { otherClinicians: ClinicianOption[]; elsewhere: ElsewhereOption[] } | null {
  const endMs = windowEndMs(nowMs, line.timeToCareDays);
  if (line.capacityMode === "session") {
    if (line.sessions.some((s) => sessionWithin(s, endMs))) return null;
    return { otherClinicians: [], elsewhere: line.elsewhere };
  }
  if (preferred && clinicianWithin(preferred, endMs)) return null;
  return {
    otherClinicians: line.clinicians.filter((c) => c !== preferred && clinicianWithin(c, endMs)),
    elsewhere: line.elsewhere,
  };
}

/* ─── Draft persistence ───────────────────────────────────────────── */

export interface BookingDraft {
  v: 1;
  /** Gate D: a household member's provisional id, or null for "me". */
  forProvisionalId: string | null;
  reason: PatientReasonCode | null;
  reasonNote: string;
  interstitialSeen: boolean;
  lineId: string | null;
  clinicianUserId: string | null;
  dateIso: string;
  slotStartsAtIso: string | null;
  sessionId: string | null;
  appointmentType: "in_person" | "virtual";
  /** One per submission attempt; reused across retries; replaced on a new pick. */
  idempotencyKey: string;
}

export const draftKey = (hospitalId: string) => `medsync:book-draft:${hospitalId}`;

export function parseDraft(raw: string | null): BookingDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<BookingDraft>;
    if (d.v !== 1 || typeof d.idempotencyKey !== "string") return null;
    return {
      v: 1,
      forProvisionalId: typeof d.forProvisionalId === "string" ? d.forProvisionalId : null,
      reason: REASONS.some((r) => r.value === d.reason) ? (d.reason as PatientReasonCode) : null,
      reasonNote: typeof d.reasonNote === "string" ? d.reasonNote.slice(0, 500) : "",
      interstitialSeen: d.interstitialSeen === true,
      lineId: typeof d.lineId === "string" ? d.lineId : null,
      clinicianUserId: typeof d.clinicianUserId === "string" ? d.clinicianUserId : null,
      dateIso: typeof d.dateIso === "string" ? d.dateIso : "",
      slotStartsAtIso: typeof d.slotStartsAtIso === "string" ? d.slotStartsAtIso : null,
      sessionId: typeof d.sessionId === "string" ? d.sessionId : null,
      appointmentType: d.appointmentType === "virtual" ? "virtual" : "in_person",
      idempotencyKey: d.idempotencyKey,
    };
  } catch {
    return null;
  }
}
