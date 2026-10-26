import type { BlockReason, RepeatStatus } from "@/lib/prescribing/repeats";

import { addDays } from "@/lib/pharmacy/stores/ledger";

/**
 * Refill requests (Pharmacy Phase 4, 6.2: RF-1 to RF-5) and renewal requests (6.4: RN-1 to RN-4). Pure.
 * Neither ever closes by itself: no function here takes the clock to decide a state (RF-5, RN-4).
 */

/** RF-1: 0230 `pharmacy_refill_events.kind`. */
export type RefillState =
  | "requested"
  | "to_prepare"
  | "needs_clinic"
  | "prepared"
  | "collected"
  | "not_collected"
  | "held_longer"
  | "released"
  | "routed"
  | "closed";

export type Channel = "app" | "window" | "phone";

/** RN-1: 0230 `prescription_renewal_requests.reason`. */
export type RenewalReason =
  | "no_authorisation"
  | "none_left"
  | "expired"
  | "stopped"
  | "blocked"
  | "too_early"
  | "asked_by_pharmacy";

export type LinePlan =
  | { to: "to_prepare"; instance: true }
  /** RF-2: waits, labelled with the date preparation becomes possible. */
  | { to: "to_prepare"; instance: false; from: string }
  | { to: "needs_clinic"; reason: RenewalReason; blocked: BlockReason | null }
  /** The line's first supply is still open at the pharmacy: not a refill. */
  | { to: "not_a_refill" };

/** RF-2: what a refill request does with one line, from its RP-6 status. */
export function planLine(s: RepeatStatus): LinePlan {
  switch (s.kind) {
    case "allowed":
      return { to: "to_prepare", instance: true };
    case "too_early":
      return { to: "to_prepare", instance: false, from: s.on };
    case "first_supply_open":
      return { to: "not_a_refill" };
    case "blocked":
      return { to: "needs_clinic", reason: "blocked", blocked: s.reason };
    case "not_allowed":
      return { to: "needs_clinic", reason: "no_authorisation", blocked: null };
    default:
      return { to: "needs_clinic", reason: s.kind, blocked: null };
  }
}

/** RF-4: Phase 3's facts for this patient and medicine, as RP-6's block. */
export const phase3Block = (f: {
  openStewardshipReview: boolean;
  unconfirmedReaction: boolean;
}): BlockReason | null =>
  f.unconfirmedReaction
    ? "suspected_reaction"
    : f.openStewardshipReview
      ? "stewardship_review"
      : null;

/** Appendix D: request window and late window (pharmacy in charge + CSO). */
export interface TimingPack {
  requestWindowDays: number;
  lateWindowDays: number;
}

/** 5.4: may the patient ask now? Unsigned, they may ask at any time. */
export const mayAskNow = (today: string, refillOn: string | null, pack: TimingPack | null) =>
  !pack || !refillOn || today >= addDays(refillOn, -pack.requestWindowDays);

/**
 * RF-3: labels, never blocks. Early from the interval (RP-5); late only from a recorded refill date and a signed late
 * window. Unsigned, nothing is labelled late.
 */
export function timingLabels(input: {
  askedOn: string;
  nextAllowed: string | null;
  refillOn: string | null;
  pack: TimingPack | null;
}): { early: boolean; late: boolean } {
  const { askedOn, nextAllowed, refillOn, pack } = input;
  return {
    early: nextAllowed !== null && askedOn < nextAllowed,
    late: !!pack && !!refillOn && askedOn > addDays(refillOn, pack.lateWindowDays),
  };
}

/** RF-1: a line's state is its latest event; with none, `requested`. Time plays no part (RF-5). */
export const refillLineState = (events: readonly { kind: RefillState }[]): RefillState =>
  events.at(-1)?.kind ?? "requested";

export const REFILL_OPEN: readonly RefillState[] = [
  "requested",
  "to_prepare",
  "needs_clinic",
  "prepared",
  "not_collected",
  "held_longer",
  "routed",
];

/* ─── Renewal requests (RN) ──────────────────────────────────────────── */

export type RenewalAnswer =
  | { kind: "renewed"; prescriptionId: string }
  | { kind: "visit_needed" }
  | { kind: "declined"; reasonCode: string }
  | { kind: "withdrawn" };

export type RenewalState = "open" | RenewalAnswer["kind"];

/** RN-1, RN-2: the first answer wins (0230 `pren_one_answer`); none means open, however long ago (RN-4). */
export const renewalState = (answers: readonly { kind: RenewalAnswer["kind"] }[]): RenewalState =>
  answers[0]?.kind ?? "open";

export type AnswerRefusal = "already_answered" | "may_not_prescribe" | "decline_unsigned";

/**
 * RN-2, RN-3: may this answer be recorded? Withdrawal is the patient's or the pharmacy's. A Renew needs the new
 * prescription placed (RN-3); an abandoned dialog records nothing. Decline needs a signed reason list (Appendix D).
 */
export function checkAnswer(input: {
  state: RenewalState;
  answer: RenewalAnswer;
  mayPrescribeHere: boolean;
  declineReasons: readonly string[] | null;
}): AnswerRefusal | null {
  const { state, answer, mayPrescribeHere, declineReasons } = input;
  if (state !== "open") return "already_answered";
  if (answer.kind === "withdrawn") return null;
  if (!mayPrescribeHere) return "may_not_prescribe";
  if (answer.kind === "declined" && !declineReasons?.includes(answer.reasonCode))
    return "decline_unsigned";
  return null;
}
