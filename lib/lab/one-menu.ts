/**
 * One menu, one record (Lab Phase 2 §6.6–§6.12: OM-*, PY-*, ID-*, SR-*, LV-4, CX-*, HR-*; ADRs 0255–0258).
 * Pure. Availability wraps the hub's own ordering contract (DX-4, `orderingAvailability`) and never copies
 * it; payment, labels, receipt, clinical context and the high-risk warning are decided here from the rows the
 * stores hand over. Informs, never blocks care: the only stops protect the record (Law 5).
 */
import type { Offering, OpenProblem } from "@/supabase/functions/_shared/services-hub";

import { orderingAvailability } from "@/supabase/functions/_shared/services-hub";

/* ─── OM: availability ───────────────────────────────────────────────── */

export type AvailabilityState =
  | "in_house"
  | "referred"
  | "down_referred"
  | "not_offered"
  | "not_linked"
  | "unknown";

export interface Availability {
  state: AvailabilityState;
  hours: string | null;
  /** OM-5: the hub's stated figure, this lab's operational turnaround, never a clinical target. */
  turnaround: string | null;
  referredTo: string | null;
  since: string | null;
}

/** OM-1..OM-4. `offeringCode` is the test's link; `offering` the hub row; `sectionId` its lab section. */
export function availabilityFor(input: {
  offeringCode: string | null;
  offering: (Offering & { sectionId?: string | null }) | null;
  problems: readonly OpenProblem[] | null;
}): Availability {
  const none = { hours: null, turnaround: null, referredTo: null, since: null };
  if (!input.offeringCode) return { state: "not_linked", ...none };
  // OM-3, Law 8: a hub that cannot be read is "Not known today", never "available".
  if (input.problems === null) return { state: "unknown", ...none };
  const a = orderingAvailability(input.offeringCode, input.offering, input.problems);
  const section = input.offering?.sectionId
    ? input.problems.find(
        (p) => p.subjectKind === "lab_section" && p.subjectRef === input.offering!.sectionId,
      )
    : undefined;
  const down =
    a.availability?.state === "unavailable" ||
    a.availability?.state === "unconfirmed" ||
    section?.state === "unavailable";
  const base = { hours: a.hours, turnaround: a.statedTurnaround, referredTo: a.referredTo };
  if (a.where === "unknown") return { state: "unknown", ...none };
  if (a.where === "not_offered") return { state: "not_offered", ...base, since: null };
  if (a.where === "referred") return { state: "referred", ...base, since: null };
  if (down)
    return {
      state: "down_referred",
      ...base,
      since: a.availability?.since ?? section?.since ?? null,
    };
  return { state: "in_house", ...base, since: null };
}

/** OM-4, D-LAB2-16: only a test the hub does not offer, or one not linked, cannot be ordered here. */
export const orderable = (a: Availability) => a.state !== "not_offered" && a.state !== "not_linked";

/* ─── PY: payment ─────────────────────────────────────────────────────── */

export type PaymentMode = "off" | "inform" | "hold";
export type PaymentState =
  | "not_required"
  | "awaiting"
  | "paid"
  | "insured"
  | "waived"
  | "emergency";

/** PY-2: decided from the order itself; no setting, role or later event can hold an emergency. */
export function paymentAtPlacement(
  order: { priority: string; intentSource: string | null },
  mode: PaymentMode,
): PaymentState {
  if (
    order.priority === "immediate" ||
    order.priority === "emergency" ||
    order.intentSource === "resus_handover"
  )
    return "emergency";
  return mode === "off" ? "not_required" : "awaiting";
}

/** PY-1: the newest event wins; no event means not required (placed before payment was on). */
export function currentPayment(
  events: readonly { state: string; recordedAt: Date }[],
): PaymentState {
  const last = [...events].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
  return (last?.state as PaymentState | undefined) ?? "not_required";
}

/** PY-3: always true except `awaiting`, which needs a reason in inform mode and is held in hold mode. */
export function canCollect(state: PaymentState, mode: PaymentMode, reason: string | null): boolean {
  if (state !== "awaiting") return true;
  if (mode === "hold") return false;
  return (reason?.trim().length ?? 0) >= 3;
}

/* ─── ID: identity at collection ─────────────────────────────────────── */

export type LabelOutcome =
  | { outcome: "match" }
  | { outcome: "other_patient"; otherPatientUserId: string }
  | { outcome: "other_order_same_patient" }
  | { outcome: "unknown_label" }
  | { outcome: "voided_label" };

/** ID-1. `label` is the row for the typed number at this hospital (null when none). */
export function checkLabel(
  label: { orderId: string; patientUserId: string; voidedAt: Date | null } | null,
  target: { orderId: string; patientUserId: string },
): LabelOutcome {
  if (!label) return { outcome: "unknown_label" };
  if (label.voidedAt) return { outcome: "voided_label" };
  if (label.patientUserId !== target.patientUserId)
    return { outcome: "other_patient", otherPatientUserId: label.patientUserId };
  if (label.orderId !== target.orderId) return { outcome: "other_order_same_patient" };
  return { outcome: "match" };
}

/** SR-4: what a keyboard-wedge scan typed, cleaned; null when it is not a label number. */
export function scannedLabel(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  return /^L\d{8}$/.test(s) ? s : null;
}

/* ─── SR: scan to receive ────────────────────────────────────────────── */

export type ReceiveDecision =
  | { do: "receive" }
  | { do: "already"; at: Date; cadre: string }
  | { do: "not_found" }
  | { do: "not_collected" }
  | { do: "rejected" }
  | { do: "voided" }
  | { do: "procedure_first" };

/** SR-1..SR-3. Another hospital's label reads as not found (no disclosure). */
export function receiveDecision(s: {
  label: { voided: boolean; hospitalMatches: boolean } | null;
  specimen: { id: string } | null;
  lastEvent: { kind: string; at: Date; cadre: string } | null;
  highRisk: boolean;
  procedureFollowed: boolean;
  receiveAnywayReason: string | null;
}): ReceiveDecision {
  if (!s.label || !s.label.hospitalMatches) return { do: "not_found" };
  if (s.label.voided) return { do: "voided" };
  if (!s.specimen && !s.receiveAnywayReason?.trim()) return { do: "not_collected" };
  if (s.lastEvent?.kind === "received")
    return { do: "already", at: s.lastEvent.at, cadre: s.lastEvent.cadre };
  if (s.lastEvent?.kind === "rejected") return { do: "rejected" };
  if (s.highRisk && !s.procedureFollowed) return { do: "procedure_first" };
  return { do: "receive" };
}

/** SR-5: an undo is allowed within the window (an operational setting, D-LAB2-19). */
export const UNDO_WINDOW_MS = 5 * 60_000;
export const canUndo = (receivedAt: Date, now: Date) =>
  now.getTime() - receivedAt.getTime() <= UNDO_WINDOW_MS;

/* ─── LV-4: announcements ────────────────────────────────────────────── */

/** One polite announcement per window, summarising the count since the last one. */
export function announce(
  state: { lastAt: number | null; pending: number },
  now: number,
  windowMs = 10_000,
) {
  if (state.pending === 0 || (state.lastAt !== null && now - state.lastAt < windowMs))
    return { say: null, state };
  return { say: state.pending, state: { lastAt: now, pending: 0 } };
}

/* ─── CX: clinical question and working diagnosis ────────────────────── */

export type Restricted = "hiv" | "tb" | "mental_health" | "sexual_reproductive_health";

/**
 * CX-2, CX-4, D-LAB2-07: a restricted-class diagnosis travels to the lab (inserted, or revealed) only when
 * the order's own tests share its class; otherwise it is masked.
 */
export function diagnosisVisible(
  dxClass: Restricted | null,
  orderClasses: readonly (Restricted | null)[],
) {
  return dxClass === null || orderClasses.includes(dxClass);
}

/* ─── HR: the high-risk specimen warning ─────────────────────────────── */

export interface HighRiskEvent {
  kind: "flag" | "clear";
  source: "rule" | "manual";
  ruleId: string | null;
  reason: string | null;
  recordedAt: Date;
}

/** HR-2: on from the newest flag until a clinician clears it. */
export function highRiskNow(events: readonly HighRiskEvent[]): HighRiskEvent | null {
  const last = [...events].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
  return last?.kind === "flag" ? last : null;
}

/** HR-1: the clerking desk's fever-with-bleeding rules (FLAG-EX-FEVER-BLEEDING, FLAG-VHF-*). */
export const HIGH_RISK_RULES = /^(FLAG-EX-FEVER-BLEEDING|FLAG-VHF-[A-Z]+)$/;
export const ruleFlagsHighRisk = (firedRuleIds: readonly string[]) =>
  firedRuleIds.find((r) => HIGH_RISK_RULES.test(r)) ?? null;
