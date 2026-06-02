import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitalDepartments } from "./hospital-departments";
import { hospitals } from "./hospitals";
import { patientIntakes } from "./patient-intakes";
import { saNotifications } from "./sa-notifications";
import { encounters } from "./scheduling";
import { triageRecords } from "./triage";

/**
 * ABCDE Resuscitation surface — migration 0038.
 *
 *   - resus_episodes            one per resus activation (the header)
 *   - resus_timeline_events     the append-only, immutable medico-legal log
 *   - resus_role_assignments    who holds which team role over time
 *   - resus_mobilisation_alerts the team-call + the "who's responding" view
 *
 * Decision-support, not autonomous: these tables RECORD what the team
 * does; the clinician leads. The timeline is hard append-only (REVOKE
 * UPDATE/DELETE + a block trigger) — corrections are NEW events that
 * supersede an earlier one via supersedes_event_id; nothing is silently
 * edited or deleted. lib/resus/timeline.ts is the pure reconstruction.
 *
 * Clinical basis: docs/resus-abcde-gate-a-proposal.md (CSO-signed
 * 2026-06-02). The full cardiac-arrest ALS algorithm is a SEPARATE later
 * module — this surface only detects arrest and routes to it.
 */

/* ─── resus_episodes (the header; PHI-linked) ───────────────────────── */
export const resusEpisodes = pgTable(
  "resus_episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id").references(() => hospitalDepartments.id, {
      onDelete: "set null",
    }),
    triageRecordId: uuid("triage_record_id").references(() => triageRecords.id, {
      onDelete: "set null",
    }),
    intakeId: uuid("intake_id").references(() => patientIntakes.id, { onDelete: "set null" }),
    patientUserId: uuid("patient_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    encounterId: uuid("encounter_id").references(() => encounters.id, { onDelete: "set null" }),

    triggerKind: text("trigger_kind").notNull(),
    triggerReason: text("trigger_reason"),

    state: text("state").notNull().default("active"),
    disposition: text("disposition"),
    outcome: text("outcome"),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    arrestDetectedAt: timestamp("arrest_detected_at", { withTimezone: true }),

    openedByUserId: uuid("opened_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "re_trigger_kind_check",
      sql`${t.triggerKind} IN ('triage_red','step0_life_threat','in_resus_deterioration')`,
    ),
    check("re_state_check", sql`${t.state} IN ('active','concluded','cancelled')`),
    check(
      "re_disposition_check",
      sql`${t.disposition} IS NULL OR ${t.disposition} IN ('theatre','icu','cath_lab','ward','mortuary','transferred','deceased')`,
    ),
    index("resus_episodes_hospital_idx").on(t.hospitalId, t.startedAt),
    index("resus_episodes_patient_idx").on(t.patientUserId, t.startedAt),
    index("resus_episodes_triage_idx").on(t.triageRecordId),
  ],
);

export type ResusEpisode = typeof resusEpisodes.$inferSelect;
export type NewResusEpisode = typeof resusEpisodes.$inferInsert;

/* ─── resus_timeline_events (immutable, append-only) ────────────────── */
export const resusTimelineEvents = pgTable(
  "resus_timeline_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => resusEpisodes.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    step: text("step"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    /** Clinical time (bedside). */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    /** System time (row written). */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull().default({}),
    /** PHI narrative, AES-256-GCM (lib/encryption). Nullable. */
    narrativeEncrypted: text("narrative_encrypted"),
    /** Non-null when this event corrects (supersedes) an earlier one. */
    supersedesEventId: uuid("supersedes_event_id").references(
      (): AnyPgColumn => resusTimelineEvents.id,
      { onDelete: "set null" },
    ),
  },
  (t) => [
    check(
      "rte_kind_check",
      sql`${t.kind} IN ('assessment','action','drug','fluid','procedure','vital','decision','role_change','mobilisation','reassessment','arrest_detected','cpr_started','handover','note')`,
    ),
    check(
      "rte_step_check",
      sql`${t.step} IS NULL OR ${t.step} IN ('pre','A','B','C','D','E','arrest')`,
    ),
    index("resus_timeline_episode_recorded_idx").on(t.episodeId, t.recordedAt),
    index("resus_timeline_episode_created_idx").on(t.episodeId, t.createdAt),
  ],
);

export type ResusTimelineEventRow = typeof resusTimelineEvents.$inferSelect;
export type NewResusTimelineEvent = typeof resusTimelineEvents.$inferInsert;

/* ─── resus_role_assignments (who holds which role over time) ───────── */
export const resusRoleAssignments = pgTable(
  "resus_role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => resusEpisodes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "rra_role_check",
      sql`${t.role} IN ('leader','airway','circulation','scribe','runner','cpr_provider','family_liaison')`,
    ),
    index("resus_role_episode_open_idx")
      .on(t.episodeId, t.role)
      .where(sql`ended_at IS NULL`),
  ],
);

export type ResusRoleAssignmentRow = typeof resusRoleAssignments.$inferSelect;
export type NewResusRoleAssignment = typeof resusRoleAssignments.$inferInsert;

/* ─── resus_mobilisation_alerts (team-call + responding view) ───────── */
export const resusMobilisationAlerts = pgTable(
  "resus_mobilisation_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => resusEpisodes.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("in_app"),
    saNotificationId: uuid("sa_notification_id").references(() => saNotifications.id, {
      onDelete: "set null",
    }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    responding: boolean("responding").notNull().default(false),
  },
  (t) => [
    check("rma_channel_check", sql`${t.channel} IN ('in_app','sms','push')`),
    index("resus_mobilisation_episode_idx").on(t.episodeId),
    index("resus_mobilisation_recipient_idx").on(t.recipientUserId, t.sentAt),
  ],
);

export type ResusMobilisationAlertRow = typeof resusMobilisationAlerts.$inferSelect;
export type NewResusMobilisationAlert = typeof resusMobilisationAlerts.$inferInsert;
