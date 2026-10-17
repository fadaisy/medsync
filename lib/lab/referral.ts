/**
 * Referrals (Lab Phase 4 §6.1, RF-1..RF-12; gate-a-proposal §5.1; D-LAB4-02..07). Pure: no I/O, `now` passed in.
 *
 * A referral belongs to the original order lines and specimen. Its state is never stored by itself: it is
 * projected from append-only events (RF-4), taken in arrival order, each applied only when its (event time,
 * sequence) is later than the last applied; a status that arrives late (dated earlier than the last one applied)
 * is kept and shown but not applied (EX-7).
 */
import type {
  ReferralEvent,
  ReferralEventKind,
  ReferralState,
  TaskStatus,
} from "@/lib/exchange/types";

import { TERMINAL_STATES } from "@/lib/exchange/types";

export const isTerminal = (s: ReferralState) => TERMINAL_STATES.includes(s);

/** The states a specimen passes after it leaves; lost and a confirmed cancel are allowed only from these. */
const AFTER_HANDOVER: readonly ReferralState[] = [
  "handed_over",
  "at_hub",
  "received_by_lab",
  "accepted",
  "in_progress",
  "on_hold",
];
/** Where the destination's answer can land once it has the specimen (gate-a §5.1). */
const FROM_TRANSIT: readonly ReferralState[] = [
  "received_by_lab",
  "accepted",
  "rejected",
  "in_progress",
  "completed",
  "failed",
  "lost",
  "cancelled",
];

/**
 * RF-3: the allowed moves, the gate-a §5.1 table cell for cell. Skipping forward is allowed (paper rarely
 * reports every stage); going back is not; terminal states have no move.
 */
export const TRANSITIONS: Readonly<Record<ReferralState, readonly ReferralState[]>> = {
  draft: ["packed", "cancelled"],
  packed: ["handed_over", "cancelled"],
  handed_over: ["at_hub", ...FROM_TRANSIT],
  at_hub: FROM_TRANSIT,
  received_by_lab: [
    "accepted",
    "rejected",
    "in_progress",
    "on_hold",
    "completed",
    "failed",
    "lost",
    "cancelled",
  ],
  accepted: ["in_progress", "on_hold", "completed", "failed", "lost", "cancelled"],
  in_progress: ["on_hold", "completed", "failed", "lost", "cancelled"],
  on_hold: ["in_progress", "completed", "failed", "lost", "cancelled"],
  rejected: [],
  completed: [],
  failed: [],
  lost: [],
  cancelled: [],
};

export const canMove = (from: ReferralState, to: ReferralState) => TRANSITIONS[from].includes(to);

/** Event kinds that move the state (the rest are notes, calls, cancel requests and a filed result). */
const STATE_KINDS = new Set<ReferralEventKind>([
  "packed",
  "handed_over",
  "at_hub",
  "received_by_lab",
  "accepted",
  "rejected",
  "in_progress",
  "on_hold",
  "completed",
  "failed",
  "lost",
  "cancelled",
]);
const isStateKind = (k: ReferralEventKind): k is Exclude<ReferralState, "draft"> =>
  STATE_KINDS.has(k);

export interface ReferralProjection {
  state: ReferralState;
  stateAt: Date | null;
  sentAt: Date | null;
  completedAt: Date | null;
  cancelRequested: boolean;
  /** Per input event (same order as given): whether it was applied. Notes and calls count as applied. */
  applied: boolean[];
}

const later = (a: ReferralEvent, b: ReferralEvent) =>
  a.eventAt.getTime() !== b.eventAt.getTime() ? a.eventAt > b.eventAt : a.seq > b.seq;

/**
 * RF-4, EX-7: fold events into the referral's state. A state event applies only when the move is allowed (RF-3)
 * and it is later, by (event time, sequence), than the last applied state event. A confirmed cancel after
 * handover is a `cancelled` event; before it, the move is the placer's alone (RF-8).
 */
export function projectReferral(events: readonly ReferralEvent[]): ReferralProjection {
  // In arrival order (the database sequence); each applies only if later, by (event time, sequence), than the
  // last one applied — so a status that arrives after a later one is kept but never moves the state back.
  const order = events.map((e, i) => ({ e, i })).sort((a, b) => a.e.seq - b.e.seq);
  const applied: boolean[] = events.map(() => false);
  let state: ReferralState = "draft";
  let last: ReferralEvent | null = null;
  let sentAt: Date | null = null;
  let completedAt: Date | null = null;
  let cancelRequested = false;
  for (const { e, i } of order) {
    if (!isStateKind(e.kind)) {
      if (e.kind === "cancel_requested") cancelRequested = true;
      applied[i] = true;
      continue;
    }
    if (last && !later(e, last)) continue; // arrived late: kept, shown, not applied
    if (!canMove(state, e.kind)) continue;
    state = e.kind;
    last = e;
    applied[i] = true;
    if (state === "handed_over" && !sentAt) sentAt = e.eventAt;
    if (state === "completed") completedAt = e.eventAt;
  }
  return { state, stateAt: last?.eventAt ?? null, sentAt, completedAt, cancelRequested, applied };
}

/** RF-3: our state as a FHIR R4 Task (FX-2): status and businessStatus. */
export function taskStatusFor(state: ReferralState): {
  status: TaskStatus;
  businessStatus?: string;
} {
  switch (state) {
    case "draft":
      return { status: "draft" };
    case "packed":
      return { status: "requested", businessStatus: "packed" };
    case "handed_over":
      return { status: "requested", businessStatus: "in transit" };
    case "at_hub":
      return { status: "requested", businessStatus: "at hub" };
    case "received_by_lab":
      return { status: "received", businessStatus: "specimen received" };
    case "accepted":
      return { status: "accepted" };
    case "rejected":
      return { status: "rejected" };
    case "in_progress":
      return { status: "in-progress", businessStatus: "testing" };
    case "on_hold":
      return { status: "on-hold" };
    case "completed":
      return { status: "completed", businessStatus: "result back" };
    case "failed":
      return { status: "failed" };
    case "lost":
      return { status: "failed", businessStatus: "lost" };
    case "cancelled":
      return { status: "cancelled" };
  }
}

/** FX-2: a partner's Task status as our state; null when it says nothing we track (draft, ready, entered-in-error). */
export function stateForTask(status: TaskStatus, businessStatus?: string): ReferralState | null {
  const b = businessStatus?.trim().toLowerCase();
  switch (status) {
    case "requested":
      return b === "at hub" ? "at_hub" : b === "packed" ? "packed" : "handed_over";
    case "received":
      return "received_by_lab";
    case "accepted":
      return "accepted";
    case "rejected":
      return "rejected";
    case "in-progress":
      return "in_progress";
    case "on-hold":
      return "on_hold";
    case "completed":
      return "completed";
    case "failed":
      return b === "lost" ? "lost" : "failed";
    case "cancelled":
      return "cancelled";
    default:
      return null;
  }
}

/* ─── RF-5: expected and overdue ─────────────────────────────────────── */

export interface StatedTurnaround {
  value: number;
  unit: "hours" | "days" | "working_days";
}

/** Africa/Kampala is UTC+3 all year (no daylight saving). */
const KAMPALA_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;
const localDay = (t: number) => new Date(t + KAMPALA_MS).toISOString().slice(0, 10);
const weekday = (t: number) => new Date(t + KAMPALA_MS).getUTCDay();

/**
 * RF-5: sent time plus the partner's stated turnaround for the test. Hours and days are elapsed time; working
 * days skip Saturdays, Sundays and the calendar's holidays (YYYY-MM-DD, hospital-local) and land at the same
 * clock time. No stated turnaround → null ("Not stated", never overdue). The figure is the partner's, not a
 * clinical target (D-LAB4-04).
 */
export function expectedBy(
  sentAt: Date,
  turnaround: StatedTurnaround | null | undefined,
  calendar: { holidays: readonly string[] } = { holidays: [] },
): Date | null {
  if (!turnaround || !(turnaround.value > 0)) return null;
  const t = sentAt.getTime();
  if (turnaround.unit === "hours") return new Date(t + turnaround.value * 3_600_000);
  if (turnaround.unit === "days") return new Date(t + turnaround.value * DAY_MS);
  let at = t;
  let left = Math.ceil(turnaround.value);
  while (left > 0) {
    at += DAY_MS;
    const d = weekday(at);
    if (d !== 0 && d !== 6 && !calendar.holidays.includes(localDay(at))) left--;
  }
  return new Date(at);
}

/** RF-5: overdue is computed, never stored. Whole days late, counted from the expected time. */
export function overdue(
  now: Date,
  expected: Date | null,
  state: ReferralState,
): { overdue: false } | { overdue: true; days: number; since: Date } {
  if (!expected || isTerminal(state) || state === "draft" || state === "packed")
    return { overdue: false };
  if (now <= expected) return { overdue: false };
  return {
    overdue: true,
    days: Math.max(1, Math.floor((now.getTime() - expected.getTime()) / DAY_MS)),
    since: expected,
  };
}

/* ─── RF-1, RF-2, RF-7..RF-10 ────────────────────────────────────────── */

/** RF-1: only a specimen on To refer becomes a referral. */
export function referrable(o: { availability: string; nationalProgrammeTest: boolean }): boolean {
  return (
    o.availability === "referred" || o.availability === "down_referred" || o.nationalProgrammeTest
  );
}

/**
 * RF-2: one referral per specimen per destination. A second destination for the same tube needs an aliquot (a
 * child specimen with its own lab number); a second referral to the same destination is refused.
 */
export function destinationCheck(
  existing: readonly { partnerId: string; state: ReferralState }[],
  partnerId: string,
): "ok" | "already_referred_there" | "needs_aliquot" {
  const live = existing.filter((r) => r.state !== "cancelled");
  if (live.some((r) => r.partnerId === partnerId)) return "already_referred_there";
  return live.length > 0 ? "needs_aliquot" : "ok";
}

/**
 * RF-7, Law 10: a high-risk specimen never goes on a routine send. Its referral is an outbreak referral: a
 * partner of kind `outbreak`, no manifest, and a note of who was informed (IPC lead and district surveillance
 * focal person). MedSync records it; it does not arrange the transport.
 */
export function routineAllowed(highRisk: boolean): boolean {
  return !highRisk;
}
export function outbreakReferralErrors(o: {
  partnerKind: string;
  informed: { ipcLead?: string; surveillanceFocal?: string } | null | undefined;
}): string[] {
  const e: string[] = [];
  if (o.partnerKind !== "outbreak") e.push("partner_not_outbreak");
  if (!o.informed?.ipcLead?.trim()) e.push("ipc_lead_not_recorded");
  if (!o.informed?.surveillanceFocal?.trim()) e.push("surveillance_focal_not_recorded");
  return e;
}

/**
 * RF-8: cancel is the placer's act. Before handover the referral is cancelled; after it, a cancellation is
 * requested (sent, or a call noted) and the destination decides; a terminal referral is past cancelling.
 */
export function cancelEffect(state: ReferralState): "cancel_now" | "request_cancel" | "too_late" {
  if (state === "draft" || state === "packed") return "cancel_now";
  return isTerminal(state) ? "too_late" : "request_cancel";
}

/** RF-9: after a rejection, Recollect needs a new specimen received for that order (never the same tube). */
export function recollectAllowed(o: {
  rejectedSpecimenId: string;
  newSpecimenId: string | null;
  newSpecimenReceived: boolean;
}): boolean {
  return !!o.newSpecimenId && o.newSpecimenId !== o.rejectedSpecimenId && o.newSpecimenReceived;
}

/** RF-10: Lost needs the last known event, a note of the call made, `lab.refer`, and a specimen that has left. */
export function markLostErrors(o: {
  state: ReferralState;
  lastKnownEvent: boolean;
  callNote: string | null | undefined;
  hasPermission: boolean;
}): string[] {
  const e: string[] = [];
  if (!o.hasPermission) e.push("permission");
  if (!AFTER_HANDOVER.includes(o.state)) e.push("not_in_transit");
  if (!o.lastKnownEvent) e.push("no_last_known_event");
  if (!o.callNote || o.callNote.trim().length < 3) e.push("no_call_note");
  return e;
}

/** `RF-2026-0294`. */
export const referralNumber = (year: number, seq: number) =>
  `RF-${year}-${String(seq).padStart(4, "0")}`;
