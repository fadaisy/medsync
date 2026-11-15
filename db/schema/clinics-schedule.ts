import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";

/**
 * Migration 0296 (GATED): clinics and schedule (ADRs 0501–0507). The draft log, versions and scheduled publishes,
 * fee bands and per-hospital holiday decisions. None holds a clinic, session, place, holiday, closure or person:
 * those stay in the engine's tables, which are the published version (CS2, CS3).
 */
export const scheduleVersions = pgTable(
  "schedule_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    publishedBy: uuid("published_by")
      .notNull()
      .references(() => authUsers.id),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    changeIds: uuid("change_ids").array().notNull(),
    textsSent: integer("texts_sent").notNull().default(0),
  },
  (t) => [unique().on(t.hospitalId, t.number)],
);

export const schedulePublishJobs = pgTable("schedule_publish_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id")
    .notNull()
    .references(() => hospitals.id, { onDelete: "cascade" }),
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  author: uuid("author")
    .notNull()
    .references(() => authUsers.id),
  changeIds: uuid("change_ids").array().notNull(),
  status: text("status").notNull().default("waiting"),
  failure: text("failure"),
  ranAt: timestamp("ran_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scheduleChanges = pgTable("schedule_changes", {
  id: uuid("id").primaryKey(),
  hospitalId: uuid("hospital_id")
    .notNull()
    .references(() => hospitals.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  edits: jsonb("edits").notNull(),
  author: uuid("author")
    .notNull()
    .references(() => authUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("draft"),
  versionId: uuid("version_id").references(() => scheduleVersions.id),
  jobId: uuid("job_id").references(() => schedulePublishJobs.id),
  supersededBy: uuid("superseded_by"),
});

export const hospitalFeeBands = pgTable(
  "hospital_fee_bands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    band: text("band").notNull(),
    generalUgx: integer("general_ugx").notNull(),
    privateUgx: integer("private_ugx").notNull(),
    version: integer("version").notNull().default(1),
    proposedBy: uuid("proposed_by")
      .notNull()
      .references(() => authUsers.id),
    approvedBy: uuid("approved_by").references(() => authUsers.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.hospitalId, t.band)],
);

export const hospitalHolidayDecisions = pgTable(
  "hospital_holiday_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    holidayId: integer("holiday_id").notNull(),
    decision: text("decision").notNull(),
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique().on(t.hospitalId, t.holidayId)],
);
