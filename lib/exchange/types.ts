/**
 * Lab Phase 4 shared shapes (docs/lab/phase-4/gate-a-proposal.md §3–§7). Pure types: the referral engine, the
 * results-back engine, the matching rule, the FHIR adapter and the outbox all speak these. Values that identify a
 * patient live only in memory here; what is stored is in migrations 0150–0153.
 */

/** RF-3: the referral states, in the order a specimen usually moves. */
export const REFERRAL_STATES = [
  "draft",
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
] as const;
export type ReferralState = (typeof REFERRAL_STATES)[number];

export const TERMINAL_STATES: readonly ReferralState[] = [
  "completed",
  "failed",
  "lost",
  "cancelled",
  "rejected",
];

/** `lab_referral_events.kind` (0151). The state kinds plus notes, calls, cancel requests and a filed result. */
export type ReferralEventKind =
  | Exclude<ReferralState, "draft">
  | "created"
  | "cancel_requested"
  | "note"
  | "call"
  | "result_filed";

export type EventSource = "person" | "partner_message" | "system";

export interface ReferralEvent {
  kind: ReferralEventKind;
  eventAt: Date;
  /** Database sequence: breaks ties in event time (EX-7). */
  seq: number;
  source: EventSource;
}

/** FHIR R4 Task.status (H21, FX-2). */
export type TaskStatus =
  | "draft"
  | "requested"
  | "received"
  | "accepted"
  | "rejected"
  | "ready"
  | "cancelled"
  | "in-progress"
  | "on-hold"
  | "failed"
  | "completed"
  | "entered-in-error";

/** MA-3: why an inbound component waits for a person. */
export const MATCH_REASONS = [
  "not_found",
  "not_received",
  "demographics_disagree",
  "ambiguous",
  "not_ordered",
  "already_released",
  "unit_differs",
  "code_unmapped",
  "partner_not_enabled",
] as const;
export type MatchReason = (typeof MATCH_REASONS)[number];

/** One check on the comparison card (MA-5): words only, never the values. */
export type CheckOutcome = "same" | "differs" | "cannot_compare";
export interface ComparisonRow {
  check: "their_number" | "name" | "birth_date" | "hospital_number" | "test" | "unit";
  outcome: CheckOutcome;
}

/** What a parser yields from one inbound result message (FX-3, AB-2). In memory only. */
export interface InboundResult {
  /** Their form or accession number, our lab number echoed back, or an analyser's sample id. */
  identifiers: { theirNumber?: string; labNumber?: string; sampleId?: string };
  patient?: { name?: string; birthDate?: string; hospitalNumber?: string };
  report?: { number?: string; issued?: string; authorisedBy?: string; status?: string };
  components: InboundComponent[];
  /** FX-7: false when it parsed under the partner's profile but is not base-R4 conformant. */
  conformant: boolean;
}

export interface InboundComponent {
  /** Stable within the message: the idempotency key with the message hash (EX-6). */
  key: string;
  code: string;
  codeSystem?: string;
  /** As sent: a number or coded text. */
  value: string;
  unit?: string;
  ucum?: string;
  rangeText?: string;
  flagText?: string;
  observedAt?: string;
}

/** A status update from a partner (FX-2), already mapped to our referral number. */
export interface TaskStatusUpdate {
  referralNumber: string;
  status: TaskStatus;
  businessStatus?: string;
  statusReason?: string;
  eventAt: Date;
}
