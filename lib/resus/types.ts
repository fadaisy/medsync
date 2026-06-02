/**
 * ABCDE Resuscitation surface — core types (GATE B).
 *
 * The resus surface is DECISION-SUPPORT: it records the timed actions a
 * clinical team performs during a resuscitation; it never acts, orders,
 * or auto-administers. The timeline is an append-only, medico-legal
 * record (corrections create new versioned events; nothing is silently
 * edited or deleted).
 *
 * Clinical basis: docs/resus-abcde-gate-a-proposal.md (CSO-signed
 * 2026-06-02) + resuscitation-abcde-clinical-reference.md.
 */

/** The five primary-survey steps, plus the pre-survey and arrest exits. */
export const ABCDE_STEPS = ["pre", "A", "B", "C", "D", "E", "arrest"] as const;
export type AbcdeStep = (typeof ABCDE_STEPS)[number];

/** The five letters that carry assess→action content (excludes pre/arrest). */
export const ABCDE_LETTERS = ["A", "B", "C", "D", "E"] as const;
export type AbcdeLetter = (typeof ABCDE_LETTERS)[number];

/**
 * Timeline event kinds. Every clinically meaningful thing that happens
 * in a resus is one immutable, timestamped row of one of these kinds.
 */
export const RESUS_EVENT_KINDS = [
  "assessment", // a finding captured against a step (look/listen/feel/measure)
  "action", // a category-level intervention logged as performed
  "drug", // a drug given (name + dose + route + time)
  "fluid", // a fluid given (type + volume + time)
  "procedure", // a procedure performed (e.g. needle decompression, intubation, IO)
  "vital", // a vital reading snapshotted onto the timeline
  "decision", // a clinical decision / escalation
  "role_change", // a team role assigned / handed over
  "mobilisation", // a team-mobilisation alert fired / acknowledged
  "reassessment", // a post-intervention reassessment prompt satisfied
  "arrest_detected", // the arrest seam fired (routes to the ALS module)
  "cpr_started", // CPR commenced (prompted; performed by the team)
  "handover", // SBAR / RSVP handover recorded
  "note", // free narrative (encrypted at rest)
] as const;
export type ResusEventKind = (typeof RESUS_EVENT_KINDS)[number];

/** Team roles (per reference §10). Assignment is open under pressure; */
/* `leader` is recommended for a doctor / clinical officer (soft, not gated). */
export const RESUS_ROLES = [
  "leader",
  "airway",
  "circulation",
  "scribe",
  "runner",
  "cpr_provider",
  "family_liaison",
] as const;
export type ResusRole = (typeof RESUS_ROLES)[number];

export type ResusTriggerKind = "triage_red" | "step0_life_threat" | "in_resus_deterioration";
export type ResusEpisodeState = "active" | "concluded" | "cancelled";
export type ResusDisposition =
  | "theatre"
  | "icu"
  | "cath_lab"
  | "ward"
  | "mortuary"
  | "transferred"
  | "deceased";

/**
 * An immutable timeline event as stored. `recordedAt` is the CLINICAL
 * time (when it happened at the bedside); `createdAt` is the SYSTEM time
 * (when the row was written). A correction is a NEW event whose
 * `supersedesEventId` points at the event it replaces — the original is
 * retained in the store and only excluded from the active VIEW.
 */
export interface TimelineEvent {
  id: string;
  episodeId: string;
  kind: ResusEventKind;
  step: AbcdeStep | null;
  recordedByUserId: string | null;
  /** ISO-8601. Clinical time (bedside). */
  recordedAt: string;
  /** ISO-8601. System time (row written). */
  createdAt: string;
  payload: Record<string, unknown>;
  /** Non-null when this event is a correction of an earlier one. */
  supersedesEventId: string | null;
}

/** A role-assignment row. Current roster = rows with `endedAt === null`. */
export interface RoleAssignment {
  id: string;
  episodeId: string;
  userId: string;
  role: ResusRole;
  /** ISO-8601. */
  assignedAt: string;
  /** ISO-8601, or null while the holder still holds the role. */
  endedAt: string | null;
}
