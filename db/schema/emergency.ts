import type {
  Classification,
  ItemFlag,
  Tier,
} from "../../supabase/functions/_shared/symptom-catalog/types";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";
import { patientIntakes } from "./patient-intakes";
import { appointments } from "./scheduling";

/**
 * The patient symptom catalog and the Emergency Pathway (migration 0066,
 * GATED; PRD MS-PRD-SYM-001; ADR 0098).
 *
 * Two small engines: what the patient reported (`symptom_submissions`) and
 * the pre-alert (`emergency_pre_arrivals`), plus the catalog's provenance
 * mirror and the emergency-contacts reference data. Every PHI column is
 * app-encrypted (`*_enc`); every hash is a salted blind index. Superadmin
 * appears in no policy here — there is no routine PHI access.
 */

/* ── Catalog provenance ────────────────────────────────────────────── */
export const patientSymptomCatalogVersions = pgTable(
  "patient_symptom_catalog_versions",
  {
    version: text("version").primaryKey(),
    /** draft | signed | retired — production renders `signed` only (Gate CS). */
    status: text("status").notNull().default("draft"),
    checksum: text("checksum").notNull(),
    itemCount: integer("item_count").notNull().default(0),
    signedByUserId: uuid("signed_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signoffArtifactRef: text("signoff_artifact_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "patient_symptom_catalog_versions_status_check",
      sql`${t.status} IN ('draft','signed','retired')`,
    ),
  ],
);

export const patientSymptomCatalogItems = pgTable(
  "patient_symptom_catalog_items",
  {
    key: text("key").notNull(),
    version: text("version")
      .notNull()
      .references(() => patientSymptomCatalogVersions.version, { onDelete: "cascade" }),
    tier: text("tier").$type<Tier>().notNull(),
    category: text("category").notNull(),
    audience: text("audience")
      .array()
      .notNull()
      .default(sql`'{}'`),
    triageDiscriminatorRef: text("triage_discriminator_ref"),
    reasoningTokenRef: text("reasoning_token_ref"),
    flags: text("flags")
      .array()
      .$type<ItemFlag[]>()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.version] }),
    check("patient_symptom_catalog_items_tier_check", sql`${t.tier} IN ('E','U','R')`),
  ],
);

/* ── What the patient reported ─────────────────────────────────────── */
export const SUBMISSION_OUTCOMES = [
  "booked",
  "queued",
  "same_day",
  "emergency",
  "emergency_declined",
  "abandoned",
] as const;
export type SubmissionOutcome = (typeof SUBMISSION_OUTCOMES)[number];

export const symptomSubmissions = pgTable(
  "symptom_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
    patientUserId: uuid("patient_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    reporterUserId: uuid("reporter_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    audience: text("audience").notNull(),
    pregnant: boolean("pregnant").notNull().default(false),
    /** Catalog item keys, in the order chosen. */
    items: jsonb("items").$type<string[]>().notNull().default([]),
    /** item key → qualifier key → option key. */
    qualifiers: jsonb("qualifiers")
      .$type<Record<string, Record<string, string>>>()
      .notNull()
      .default({}),
    computedTier: text("computed_tier").$type<Tier>().notNull(),
    ruleTrace: jsonb("rule_trace").$type<Classification["trace"]>().notNull().default([]),
    catalogVersion: text("catalog_version").notNull(),
    /** AES-256-GCM; never read by any engine (R6). */
    freeTextEnc: text("free_text_enc"),
    outcome: text("outcome").$type<SubmissionOutcome>().notNull().default("abandoned"),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    intakeId: uuid("intake_id").references(() => patientIntakes.id, { onDelete: "set null" }),
    /** FK added after emergency_pre_arrivals exists (migration 0066 §3); lazy here for the same reason. */
    preArrivalId: uuid("pre_arrival_id").references((): AnyPgColumn => emergencyPreArrivals.id, {
      onDelete: "set null",
    }),
    deviceHash: text("device_hash"),
    channel: text("channel").notNull().default("web"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "symptom_submissions_audience_check",
      sql`${t.audience} IN ('adult','child_u2m','child_2m_5y','child_5_12','pregnant')`,
    ),
    check("symptom_submissions_tier_check", sql`${t.computedTier} IN ('E','U','R')`),
    check(
      "symptom_submissions_outcome_check",
      sql`${t.outcome} IN ('booked','queued','same_day','emergency','emergency_declined','abandoned')`,
    ),
    check("symptom_submissions_channel_check", sql`${t.channel} IN ('web','app','desk')`),
    check("symptom_submissions_items_is_list", sql`jsonb_typeof(${t.items}) = 'array'`),
    check(
      "symptom_submissions_someone",
      sql`${t.patientUserId} IS NOT NULL OR ${t.reporterUserId} IS NOT NULL OR ${t.deviceHash} IS NOT NULL`,
    ),
    index("symptom_submissions_patient_idx").on(t.patientUserId, t.createdAt),
    index("symptom_submissions_hospital_idx").on(t.hospitalId, t.createdAt),
  ],
);

/* ── The pre-alert ─────────────────────────────────────────────────── */
export const PRE_ARRIVAL_STATUSES = [
  "sent",
  "seen",
  "ready",
  "arrived",
  "cancelled",
  "expired",
  "not_arriving",
  "hoax",
] as const;
export type PreArrivalStatus = (typeof PRE_ARRIVAL_STATUSES)[number];

export const TRANSPORT_MODES = ["boda", "car", "taxi", "ambulance", "walking"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const ETA_BANDS = ["under_15", "15_30", "30_60", "over_60"] as const;
export type EtaBand = (typeof ETA_BANDS)[number];

/** Never a name: PRD §8.5 "subject descriptor". */
export interface SubjectDescriptor {
  audience: string;
  ageBand?: string | null;
  sex?: string | null;
  pregnant?: boolean;
}

export const emergencyPreArrivals = pgTable(
  "emergency_pre_arrivals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id").references(() => symptomSubmissions.id, {
      onDelete: "set null",
    }),
    patientUserId: uuid("patient_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    reporterUserId: uuid("reporter_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    subjectDescriptor: jsonb("subject_descriptor")
      .$type<SubjectDescriptor>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Catalog item keys; the board prints their lay labels + clinical discriminator. */
    redFlags: text("red_flags")
      .array()
      .notNull()
      .default(sql`'{}'`),
    tier: text("tier").$type<Tier>().notNull().default("E"),
    /** R4: fever + bleeding — the hospital prepares isolation before arrival. */
    isolationFlag: boolean("isolation_flag").notNull().default(false),
    onsetAt: timestamp("onset_at", { withTimezone: true }),
    /** `stroke_time`: "When were they last normal?" */
    lastKnownWellAt: timestamp("last_known_well_at", { withTimezone: true }),
    transportMode: text("transport_mode").$type<TransportMode>().notNull().default("boda"),
    etaBand: text("eta_band").$type<EtaBand>().notNull().default("15_30"),
    callbackPhoneEnc: text("callback_phone_enc"),
    /** Only when the reporter chose "Share my location"; nulled after 72 h by the sweeper. */
    locationEnc: text("location_enc"),
    status: text("status").$type<PreArrivalStatus>().notNull().default("sent"),
    /** True when the reporter was signed in (PRD §8.7). */
    verified: boolean("verified").notNull().default(false),
    acknowledgedByUserId: uuid("acknowledged_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    arrivedIntakeId: uuid("arrived_intake_id").references(() => patientIntakes.id, {
      onDelete: "set null",
    }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** Hash of the one-time reporter capability token; the token itself is never stored. */
    reporterTokenHash: text("reporter_token_hash").notNull(),
    deviceHash: text("device_hash"),
    phoneHash: text("phone_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '6 hours'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("emergency_pre_arrivals_tier_check", sql`${t.tier} IN ('E','U','R')`),
    check(
      "emergency_pre_arrivals_transport_check",
      sql`${t.transportMode} IN ('boda','car','taxi','ambulance','walking')`,
    ),
    check(
      "emergency_pre_arrivals_eta_check",
      sql`${t.etaBand} IN ('under_15','15_30','30_60','over_60')`,
    ),
    check(
      "emergency_pre_arrivals_status_check",
      sql`${t.status} IN ('sent','seen','ready','arrived','cancelled','expired','not_arriving','hoax')`,
    ),
    check(
      "emergency_pre_arrivals_descriptor_is_object",
      sql`jsonb_typeof(${t.subjectDescriptor}) = 'object'`,
    ),
    index("emergency_pre_arrivals_board_idx").on(t.facilityId, t.status, t.createdAt),
    index("emergency_pre_arrivals_device_idx").on(t.deviceHash, t.createdAt),
    index("emergency_pre_arrivals_phone_idx").on(t.phoneHash, t.createdAt),
    index("emergency_pre_arrivals_token_idx").on(t.reporterTokenHash),
  ],
);

/**
 * The status machine (PRD §9.4 / build prompt Phase 2 §5). Enforced by every
 * writer; `canTransition` is the one place it is written down.
 */
export const PRE_ARRIVAL_TRANSITIONS: Record<PreArrivalStatus, ReadonlyArray<PreArrivalStatus>> = {
  sent: ["seen", "ready", "arrived", "cancelled", "not_arriving", "hoax", "expired"],
  seen: ["ready", "arrived", "cancelled", "not_arriving", "hoax", "expired"],
  ready: ["arrived", "cancelled", "not_arriving", "hoax", "expired"],
  arrived: [],
  cancelled: [],
  expired: [],
  not_arriving: [],
  hoax: [],
};

export function canTransition(from: PreArrivalStatus, to: PreArrivalStatus): boolean {
  return PRE_ARRIVAL_TRANSITIONS[from].includes(to);
}

/* ── Emergency contacts (reference data with verification) ─────────── */
export const emergencyContacts = pgTable(
  "emergency_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable seed key, e.g. UG.NATIONAL.112. */
    key: text("key").notNull().unique(),
    scope: text("scope").notNull(),
    district: text("district"),
    facilityId: uuid("facility_id").references(() => hospitals.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    number: text("number"),
    kind: text("kind").notNull(),
    priority: integer("priority").notNull().default(100),
    /** Production renders `verified` only (PRD Appendix B rule). */
    verificationStatus: text("verification_status").notNull().default("unverified"),
    verifiedByUserId: uuid("verified_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    basis: text("basis"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("emergency_contacts_scope_check", sql`${t.scope} IN ('national','district','facility')`),
    check("emergency_contacts_kind_check", sql`${t.kind} IN ('general','ambulance','crisis','sv')`),
    check(
      "emergency_contacts_status_check",
      sql`${t.verificationStatus} IN ('verified','unverified','to_source')`,
    ),
    check(
      "emergency_contacts_verified_has_number",
      sql`${t.verificationStatus} <> 'verified' OR ${t.number} IS NOT NULL`,
    ),
    check(
      "emergency_contacts_facility_scope",
      sql`${t.scope} <> 'facility' OR ${t.facilityId} IS NOT NULL`,
    ),
    index("emergency_contacts_lookup_idx").on(t.active, t.verificationStatus, t.scope, t.priority),
  ],
);

/* ── Outbox for the notifications engine that is not built ─────────── */
export const preArrivalOutbox = pgTable(
  "pre_arrival_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    preArrivalId: uuid("pre_arrival_id")
      .notNull()
      .references(() => emergencyPreArrivals.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("facility_sms"),
    body: text("body").notNull(),
    /** Nothing reads `awaiting_notifications_engine` as sent (PRD §8.6). */
    state: text("state").notNull().default("awaiting_notifications_engine"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("pre_arrival_outbox_channel_check", sql`${t.channel} IN ('facility_sms')`),
    check(
      "pre_arrival_outbox_state_check",
      sql`${t.state} IN ('awaiting_notifications_engine','sent','failed','cancelled')`,
    ),
  ],
);

/** Kept beside the table so a reader sees the shape the board draws from. */
export const EMERGENCY_CAPABILITIES = ["none", "daytime", "24h"] as const;
export type EmergencyCapability = (typeof EMERGENCY_CAPABILITIES)[number];
