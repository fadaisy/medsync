import { boolean, date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Pharmacy Phase 4: repeats, refills, renewals and collectors (migration 0230, GATED; GATE A signed 26 Oct 2026,
 * docs/pharmacy/phase-4/gate-a-proposal.md). The SQL is the source of truth: the guards (RP-2 backstop, RI-1 one open
 * instance, collectors removed never deleted) and the append-only triggers live there. These mirrors carry columns only.
 */
const tz = { withTimezone: true } as const;

export const prescriptionRepeatAuthorisations = pgTable("prescription_repeat_authorisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  prescriptionId: uuid("prescription_id").notNull().unique(),
  furtherSupplies: integer("further_supplies").notNull(),
  minIntervalDays: integer("min_interval_days").notNull(),
  notAfter: date("not_after").notNull(),
  reviewBy: date("review_by"),
  ruleVersion: integer("rule_version").notNull(),
  prescriberUserId: uuid("prescriber_user_id").notNull(),
  prescriberCadre: text("prescriber_cadre"),
  authorisedAt: timestamp("authorised_at", tz).notNull().defaultNow(),
});

export const prescriptionRepeatEvents = pgTable("prescription_repeat_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorisationId: uuid("authorisation_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").$type<"stopped">().notNull(),
  reason: text("reason").notNull(),
  actorUserId: uuid("actor_user_id").notNull(),
  actorCadre: text("actor_cadre"),
  at: timestamp("at", tz).notNull().defaultNow(),
});

export const pharmacyRepeatInstances = pgTable("pharmacy_repeat_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  authorisationId: uuid("authorisation_id").notNull(),
  prescriptionId: uuid("prescription_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export type RepeatInstanceEventKind =
  | "accepted"
  | "prepared"
  | "routed"
  | "route_returned"
  | "supplied"
  | "released"
  | "closed"
  | "reopened";

export const pharmacyRepeatInstanceEvents = pgTable("pharmacy_repeat_instance_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  instanceId: uuid("instance_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").$type<RepeatInstanceEventKind>().notNull(),
  reasonCode: text("reason_code"),
  reasonNote: text("reason_note"),
  supplyId: uuid("supply_id"),
  actorUserId: uuid("actor_user_id").notNull(),
  actorCadre: text("actor_cadre"),
  at: timestamp("at", tz).notNull().defaultNow(),
});

export const patientCollectors = pgTable("patient_collectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientUserId: uuid("patient_user_id").notNull(),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(),
  isProxy: boolean("is_proxy").notNull().default(false),
  savedBy: uuid("saved_by").notNull(),
  savedAt: timestamp("saved_at", tz).notNull().defaultNow(),
  removedAt: timestamp("removed_at", tz),
  removedBy: uuid("removed_by"),
});

export const prescriptionRenewalRequests = pgTable("prescription_renewal_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  prescriptionId: uuid("prescription_id").notNull(),
  reason: text("reason")
    .$type<
      | "no_authorisation"
      | "none_left"
      | "expired"
      | "stopped"
      | "blocked"
      | "too_early"
      | "asked_by_pharmacy"
    >()
    .notNull(),
  blockedReason: text("blocked_reason").$type<"stewardship_review" | "suspected_reaction">(),
  note: text("note"),
  askedBy: text("asked_by").$type<"patient" | "pharmacy">().notNull(),
  askedByUserId: uuid("asked_by_user_id").notNull(),
  askedAt: timestamp("asked_at", tz).notNull().defaultNow(),
  clientKey: text("client_key").unique(),
});

export const prescriptionRenewalEvents = pgTable("prescription_renewal_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  renewalId: uuid("renewal_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").$type<"renewed" | "visit_needed" | "declined" | "withdrawn">().notNull(),
  newPrescriptionId: uuid("new_prescription_id"),
  reasonCode: text("reason_code"),
  note: text("note"),
  actorUserId: uuid("actor_user_id").notNull(),
  actorCadre: text("actor_cadre"),
  at: timestamp("at", tz).notNull().defaultNow(),
});

export const pharmacyRefillRequests = pgTable("pharmacy_refill_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  channel: text("channel").$type<"app" | "window" | "phone">().notNull(),
  recordedBy: uuid("recorded_by"),
  collector: text("collector").$type<"self" | "named">().notNull(),
  collectorId: uuid("collector_id"),
  placeKind: text("place_kind").$type<"point" | "partner">().notNull(),
  dispensingPointId: uuid("dispensing_point_id"),
  partnerId: uuid("partner_id"),
  note: text("note"),
  requestedAt: timestamp("requested_at", tz).notNull().defaultNow(),
  clientKey: text("client_key").unique(),
});

export const pharmacyRefillRequestLines = pgTable("pharmacy_refill_request_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  prescriptionId: uuid("prescription_id").notNull(),
  statusAtRequest: text("status_at_request")
    .$type<
      "allowed" | "too_early" | "none_left" | "expired" | "stopped" | "blocked" | "not_allowed"
    >()
    .notNull(),
  instanceId: uuid("instance_id"),
  renewalId: uuid("renewal_id"),
});

export const pharmacyRefillEvents = pgTable("pharmacy_refill_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  lineId: uuid("line_id"),
  kind: text("kind")
    .$type<
      | "to_prepare"
      | "needs_clinic"
      | "prepared"
      | "collected"
      | "not_collected"
      | "held_longer"
      | "released"
      | "routed"
      | "closed"
    >()
    .notNull(),
  heldUntil: date("held_until"),
  reasonCode: text("reason_code"),
  reasonNote: text("reason_note"),
  actorUserId: uuid("actor_user_id").notNull(),
  actorCadre: text("actor_cadre"),
  at: timestamp("at", tz).notNull().defaultNow(),
});
