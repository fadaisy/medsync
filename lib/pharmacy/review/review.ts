import type { PharmacyAccess } from "@/lib/pharmacy/access";
import type { LaneReasonCode, PrescriptionLane } from "@/lib/pharmacy/lanes";
import type { LineEventKind, QueryLite } from "@/lib/pharmacy/lines";

import { can } from "@/lib/pharmacy/access";
import { canDecline } from "@/lib/pharmacy/lines";

/**
 * Review (Pharmacy Phase 1; RQ-1, RQ-9, RQ-12, LN-2, LO-7, 5.3, Section 8). Pure: the caller brings the
 * lane, its per-line reasons (`laneFor`) and the line's review events; nothing here reads a clock or a
 * database.
 *
 * - RQ-1 A review is an event on one line version by a holder of `pharmacy.review`: `accepted`, or
 *   `accepted_overridden_stop` (the pharmacist read the override reason). A standard-lane line needs
 *   none; its supply records "checked at supply".
 * - LN-2, 5.3, S14 In a pharmacist-first prescription every line needs an acceptance. A line with a lane
 *   reason needs its own tap; "Accept the remaining lines" takes only the lines with no reason.
 * - RQ-9 A changed line voids every acceptance and staged decision of the old version: an event counts
 *   only for the row id it was written on.
 * - RQ-12, D-PH1-05 Supply without a pharmacist: only with the setting on, legal question 1 answered on
 *   record, by a holder of `pharmacy.dispense`, and never for a controlled line.
 * - LO-7 A line can be declined only by a holder of `pharmacy.review`, once a query was sent on it.
 * - Section 8 `recordNotSupplied` on a pharmacist-first line waits for an acceptance or D-PH1-05's reason.
 */

/** Appendix B, "Waiting for a pharmacist" (draft). */
export const WAITING_FOR_PHARMACIST = "Waiting for a pharmacist";

export type AcceptanceNeed = "none" | "own_tap" | "accept_remaining";

/** LN-2, 5.3: what acceptance a line needs, and how it can be given. */
export function acceptanceNeeded(
  lane: PrescriptionLane,
  perLineReasons: ReadonlyMap<string, readonly LaneReasonCode[]>,
  lineId: string,
): AcceptanceNeed {
  if (lane === "standard") return "none";
  return (perLineReasons.get(lineId)?.length ?? 0) > 0 ? "own_tap" : "accept_remaining";
}

/** S14: the lines "Accept the remaining lines" takes: no reason, not yet accepted. */
export function remainingLines(
  lane: PrescriptionLane,
  perLineReasons: ReadonlyMap<string, readonly LaneReasonCode[]>,
  lineIds: readonly string[],
  accepted: ReadonlySet<string>,
): string[] {
  return lineIds.filter(
    (id) => !accepted.has(id) && acceptanceNeeded(lane, perLineReasons, id) === "accept_remaining",
  );
}

/** RQ-1: "Reason accepted, supply" on an overridden stop records that the reason was read. */
export const acceptKind = (
  lineReasons: readonly LaneReasonCode[],
): "accepted" | "accepted_overridden_stop" =>
  lineReasons.includes("overridden_stop") ? "accepted_overridden_stop" : "accepted";

/** RQ-1, Section 8: `acceptLine` and `acceptRemainingLines` need `pharmacy.review`. */
export const mayAccept = (access: PharmacyAccess): boolean => can(access, "pharmacy.review");

/** 5.3, S13: a viewer who cannot accept sees a pharmacist-first prescription read-only, with this. */
export const readOnlyNotice = (
  access: PharmacyAccess,
  lane: PrescriptionLane,
): typeof WAITING_FOR_PHARMACIST | null =>
  lane === "pharmacist_first" && !mayAccept(access) ? WAITING_FOR_PHARMACIST : null;

/** One review-family pharmacy_line_events row: `prescriptionId` is the line version it was written on. */
export interface ReviewEvent {
  id: string;
  prescriptionId: string;
  kind: LineEventKind;
  reasonCode?: string | null;
}

const COUNTS = new Set<LineEventKind>([
  "accepted",
  "accepted_overridden_stop",
  "decision_saved",
  "supplied_without_review",
]);

/**
 * RQ-9: of the acceptances and staged decisions given (in the order recorded), those that stand for the
 * current version and those a change voided. A `decision_cleared` withdraws that version's staged decision.
 */
export function voidedByChange(
  currentVersionId: string,
  events: readonly ReviewEvent[],
): { standing: ReviewEvent[]; voided: ReviewEvent[] } {
  const standing: ReviewEvent[] = [];
  const voided: ReviewEvent[] = [];
  for (const e of events) {
    if (e.kind === "decision_cleared" && e.prescriptionId === currentVersionId) {
      const i = standing.findLastIndex((s) => s.kind === "decision_saved");
      if (i >= 0) standing.splice(i, 1);
      continue;
    }
    if (!COUNTS.has(e.kind)) continue;
    (e.prescriptionId === currentVersionId ? standing : voided).push(e);
  }
  return { standing, voided };
}

export type ReviewBasis =
  | { kind: "accepted"; eventId: string }
  | { kind: "checked_at_supply" }
  | { kind: "supplied_without_review"; eventId: string; reasonCode: string | null }
  | null;

/**
 * RQ-1, RQ-12: what clears this version for supply. Standard lane: checked at supply. Pharmacist-first:
 * a standing acceptance, else a standing D-PH1-05 reason, else nothing.
 */
export function reviewBasis(
  lane: PrescriptionLane,
  versionId: string,
  events: readonly ReviewEvent[],
): ReviewBasis {
  if (lane === "standard") return { kind: "checked_at_supply" };
  const { standing } = voidedByChange(versionId, events);
  const accepted = standing.find(
    (e) => e.kind === "accepted" || e.kind === "accepted_overridden_stop",
  );
  if (accepted) return { kind: "accepted", eventId: accepted.id };
  const without = standing.find((e) => e.kind === "supplied_without_review");
  if (without)
    return {
      kind: "supplied_without_review",
      eventId: without.id,
      reasonCode: without.reasonCode ?? null,
    };
  return null;
}

export type WithoutReviewRefusal =
  | "controlled"
  | "setting_off"
  | "no_legal_answer"
  | "not_permitted";

/** RQ-12, D-PH1-05, CD-4: supply without a pharmacist, where (and only where) it is allowed. */
export function supplyWithoutReviewAllowed(input: {
  settingOn: boolean;
  legalQ1OnRecord: boolean;
  controlled: boolean;
  access: PharmacyAccess;
}): { ok: true } | { ok: false; reason: WithoutReviewRefusal } {
  if (input.controlled) return { ok: false, reason: "controlled" };
  if (!input.settingOn) return { ok: false, reason: "setting_off" };
  if (!input.legalQ1OnRecord) return { ok: false, reason: "no_legal_answer" };
  if (!can(input.access, "pharmacy.dispense")) return { ok: false, reason: "not_permitted" };
  return { ok: true };
}

/** LO-7, Section 8: `declineLine` needs `pharmacy.review` and a query sent on the line's version. */
export const mayDecline = (input: {
  access: PharmacyAccess;
  lineId: string;
  queries: readonly QueryLite[];
}): boolean => can(input.access, "pharmacy.review") && canDecline(input.lineId, input.queries);

/** Section 8, S13: `recordNotSupplied` needs `pharmacy.dispense`; pharmacist-first, a basis first. */
export const mayRecordNotSupplied = (input: {
  access: PharmacyAccess;
  lane: PrescriptionLane;
  versionId: string;
  events: readonly ReviewEvent[];
}): boolean =>
  can(input.access, "pharmacy.dispense") &&
  reviewBasis(input.lane, input.versionId, input.events) !== null;
