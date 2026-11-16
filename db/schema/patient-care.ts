/**
 * Care mode: enrolment, plan, dose events, team, helpers, messages, alerts, programmes priced by team
 * (migration 0301, GATED; patient app v2 §8.1; ADR 0519). The SQL holds the CHECKs, RLS and functions; these
 * mirror its columns for typed reads. Behind `careMode` until Gate CG (MR11).
 */
import { boolean, date, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

export const careProgrammes = pgTable("care_programmes", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  condition: text("condition").notNull(),
  name: text("name").notNull(),
  team: jsonb("team").notNull(),
  monthlyUgx: integer("monthly_ugx").notNull(),
  quarterlyUgx: integer("quarterly_ugx").notNull(),
  yearlyUgx: integer("yearly_ugx").notNull(),
  proposedBy: uuid("proposed_by").notNull(),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", tz),
  retiredAt: timestamp("retired_at", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const careProgrammeAddons = pgTable("care_programme_addons", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").notNull(),
  monthlyUgx: integer("monthly_ugx").notNull(),
  proposedBy: uuid("proposed_by").notNull(),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", tz),
  retiredAt: timestamp("retired_at", tz),
});

export const careEnrolments = pgTable("care_enrolments", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientUserId: uuid("patient_user_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  programme: text("programme").notNull(),
  startedAt: timestamp("started_at", tz).notNull().defaultNow(),
  endedAt: timestamp("ended_at", tz),
  enrolledBy: uuid("enrolled_by").notNull(),
  endedBy: uuid("ended_by"),
  programmeId: uuid("programme_id"),
  addonIds: uuid("addon_ids").array().notNull(),
});

export const careProgrammePeriods = pgTable("care_programme_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrolmentId: uuid("enrolment_id").notNull(),
  billId: uuid("bill_id").notNull(),
  period: text("period").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  sponsor: text("sponsor").notNull().default("self"),
});

export const carePlanVersions = pgTable("care_plan_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrolmentId: uuid("enrolment_id").notNull(),
  version: integer("version").notNull(),
  items: jsonb("items").notNull(),
  targets: jsonb("targets").notNull(),
  checkIntervals: jsonb("check_intervals").notNull(),
  authoredBy: uuid("authored_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const doseEvents = pgTable("dose_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientUserId: uuid("patient_user_id").notNull(),
  planVersionId: uuid("plan_version_id"),
  medicineKey: text("medicine_key").notNull(),
  dueAt: timestamp("due_at", tz).notNull(),
  status: text("status").notNull(),
  skipReason: text("skip_reason"),
  clientKey: text("client_key").notNull(),
  recordedAt: timestamp("recorded_at", tz).notNull().defaultNow(),
});

export const careTeamMembers = pgTable("care_team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrolmentId: uuid("enrolment_id").notNull(),
  userId: uuid("user_id"),
  role: text("role").notNull(),
  firstContact: boolean("first_contact").notNull().default(false),
  nameConsent: boolean("name_consent").notNull().default(false),
  nextStep: text("next_step"),
  addedAt: timestamp("added_at", tz).notNull().defaultNow(),
  removedAt: timestamp("removed_at", tz),
});

export const careHelpers = pgTable("care_helpers", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientUserId: uuid("patient_user_id").notNull(),
  helperUserId: uuid("helper_user_id").notNull(),
  scope: text("scope").notNull(),
  grantedAt: timestamp("granted_at", tz).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", tz),
});

export const careMessages = pgTable("care_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrolmentId: uuid("enrolment_id").notNull(),
  authorUserId: uuid("author_user_id"),
  fromPatient: boolean("from_patient").notNull(),
  kind: text("kind").notNull().default("text"),
  body: text("body").notNull(),
  clientKey: text("client_key"),
  readAt: timestamp("read_at", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const careAlerts = pgTable("care_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrolmentId: uuid("enrolment_id").notNull(),
  readingId: uuid("reading_id").notNull(),
  kind: text("kind").notNull(),
  rulesVersion: text("rules_version").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  acknowledgedBy: uuid("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at", tz),
});
