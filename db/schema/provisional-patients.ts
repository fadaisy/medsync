import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";

/**
 * Identity — migration 0060 (GATED), ADR 0089, proposal §5.8 / §5.9.
 *
 *   provisional_patients  the booking identity when there is no account. A
 *                         booking never writes into the MPI (PRD §2.8): the
 *                         desk reconciles by hand, and ONLY
 *                         `ha-reconcile-identity` sets `reconciledPatientUserId`.
 *   booking_agents        who books for whom (PRD §2.9). Adults only at this
 *                         gate; a minor is refused.
 *
 * Name and phone are AES-256-GCM in the one wire format `lib/encryption.ts`
 * and `supabase/functions/_shared/encryption.ts` share; `phoneHmac` is the
 * blind index (`blindIndex()` in both).
 */

/* ─── provisional_patients ────────────────────────────────────────── */
export const provisionalPatients = pgTable(
  "provisional_patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The desk's hospital; NULL for a household member added from the patient app (readable wherever it holds a booking). */
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "cascade" }),
    declaredNameEncrypted: text("declared_name_encrypted").notNull(),
    phoneEncrypted: text("phone_encrypted").notNull(),
    /** HMAC-SHA256 hex of the E.164 phone — search and duplicate spotting. */
    phoneHmac: text("phone_hmac").notNull(),
    dateOfBirth: date("date_of_birth"),
    ageYears: smallint("age_years"),
    /** NULL when the desk created it on behalf of a caller. */
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    /** 'unreconciled' | 'confirmed' | 'created' | 'rejected' */
    reconciliationState: text("reconciliation_state").notNull().default("unreconciled"),
    /** Set ONLY by ha-reconcile-identity. Never by a trigger. */
    reconciledPatientUserId: uuid("reconciled_patient_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    reconciledByUserId: uuid("reconciled_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    /** The booking agent or desk user. */
    createdByUserId: uuid("created_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    /** Swept by cleanup-drafts when still unreconciled with no booking and no live agent link. */
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "provisional_patients_dob_or_age",
      sql`${t.dateOfBirth} IS NOT NULL OR ${t.ageYears} IS NOT NULL`,
    ),
    check(
      "provisional_patients_age_range",
      sql`${t.ageYears} IS NULL OR ${t.ageYears} BETWEEN 0 AND 130`,
    ),
    check(
      "provisional_patients_state_check",
      sql`${t.reconciliationState} IN ('unreconciled','confirmed','created','rejected')`,
    ),
    check(
      "provisional_patients_reconciled_names_patient",
      sql`${t.reconciliationState} IN ('confirmed','created') OR ${t.reconciledPatientUserId} IS NULL`,
    ),
    check(
      "provisional_patients_hospital_or_creator",
      sql`${t.hospitalId} IS NOT NULL OR ${t.createdByUserId} IS NOT NULL`,
    ),
    index("provisional_patients_hospital_phone_idx").on(t.hospitalId, t.phoneHmac),
    index("provisional_patients_phone_idx").on(t.phoneHmac),
    index("provisional_patients_expiry_idx")
      .on(t.expiresAt)
      .where(sql`${t.reconciliationState} = 'unreconciled'`),
  ],
);

export type ProvisionalPatient = typeof provisionalPatients.$inferSelect;
export type NewProvisionalPatient = typeof provisionalPatients.$inferInsert;

export const RECONCILIATION_STATES = ["unreconciled", "confirmed", "created", "rejected"] as const;
export type ReconciliationState = (typeof RECONCILIATION_STATES)[number];

/* ─── booking_agents ──────────────────────────────────────────────── */
export const bookingAgents = pgTable(
  "booking_agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentUserId: uuid("agent_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** The member: exactly one of these two. */
    patientUserId: uuid("patient_user_id").references(() => authUsers.id, { onDelete: "cascade" }),
    provisionalPatientId: uuid("provisional_patient_id").references(() => provisionalPatients.id, {
      onDelete: "cascade",
    }),
    /** The name the agent uses for this person — plaintext, the agent's own words, agent-visible only. */
    memberLabel: text("member_label").notNull(),
    /** 'parent' | 'guardian' | 'child' | 'spouse' | 'relative' | 'vht' | 'other' */
    relationship: text("relationship").notNull(),
    /** 'agent_declared' | 'member_confirmed' (flips on the member's first own sign-in; no writer yet). */
    consentBasis: text("consent_basis").notNull().default("agent_declared"),
    /** Must be true — adults only until Part 8 #12 rules on minors. */
    declaredAdult: boolean("declared_adult").notNull(),
    /** Removal is one UPDATE; the agent's read policy stops at once. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "booking_agents_member_exactly_one",
      sql`(${t.patientUserId} IS NOT NULL)::int + (${t.provisionalPatientId} IS NOT NULL)::int = 1`,
    ),
    check("booking_agents_not_self", sql`${t.patientUserId} IS DISTINCT FROM ${t.agentUserId}`),
    check("booking_agents_label_len", sql`length(trim(${t.memberLabel})) BETWEEN 1 AND 80`),
    check(
      "booking_agents_relationship_check",
      sql`${t.relationship} IN ('parent','guardian','child','spouse','relative','vht','other')`,
    ),
    check(
      "booking_agents_consent_basis_check",
      sql`${t.consentBasis} IN ('agent_declared','member_confirmed')`,
    ),
    check("booking_agents_adults_only", sql`${t.declaredAdult}`),
    uniqueIndex("booking_agents_live_patient_unique")
      .on(t.agentUserId, t.patientUserId)
      .where(sql`${t.revokedAt} IS NULL AND ${t.patientUserId} IS NOT NULL`),
    uniqueIndex("booking_agents_live_provisional_unique")
      .on(t.agentUserId, t.provisionalPatientId)
      .where(sql`${t.revokedAt} IS NULL AND ${t.provisionalPatientId} IS NOT NULL`),
    index("booking_agents_agent_idx")
      .on(t.agentUserId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

export type BookingAgent = typeof bookingAgents.$inferSelect;
export type NewBookingAgent = typeof bookingAgents.$inferInsert;

export const BOOKING_AGENT_RELATIONSHIPS = [
  "parent",
  "guardian",
  "child",
  "spouse",
  "relative",
  "vht",
  "other",
] as const;
export type BookingAgentRelationship = (typeof BOOKING_AGENT_RELATIONSHIPS)[number];
