import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";

/**
 * Patient places and live location shares — migration 0185 (ADR 0402).
 *
 *   - patient_places      pins the patient drops on a real map and labels (home, work, their own word);
 *                         at most one is the home. Patient-only RLS.
 *   - location_shares     "Share my live location" for a bounded time (at most 8 hours). Only the latest
 *                         position, never a trail; the family link reads it through
 *                         `location_share_view(token)` while it is live.
 */
export const patientPlaces = pgTable(
  "patient_places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    customLabel: text("custom_label"),
    lat: numeric("lat", { precision: 9, scale: 6 }).notNull(),
    lng: numeric("lng", { precision: 9, scale: 6 }).notNull(),
    address: text("address"),
    isHome: boolean("is_home").notNull().default(false),
    consentVersion: text("consent_version").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("patient_places_kind_check", sql`${t.kind} IN ('home', 'work', 'other')`),
    check(
      "patient_places_other_label",
      sql`(${t.kind} = 'other') = (${t.customLabel} IS NOT NULL)`,
    ),
    index("patient_places_patient_idx").on(t.patientUserId, t.createdAt),
  ],
);

export const locationShares = pgTable(
  "location_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    /** Made by the database (two random v4 UUIDs, 64 hex), never by the phone. */
    token: text("token")
      .notNull()
      .unique()
      .default(
        sql`replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')`,
      ),
    purpose: text("purpose").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    accuracyM: numeric("accuracy_m", { precision: 8, scale: 1 }),
    positionAt: timestamp("position_at", { withTimezone: true }),
    consentVersion: text("consent_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("location_shares_purpose_check", sql`${t.purpose} IN ('emergency', 'visit', 'other')`),
    check(
      "location_shares_window",
      sql`${t.endsAt} > ${t.startedAt} AND ${t.endsAt} <= ${t.startedAt} + interval '8 hours'`,
    ),
    index("location_shares_patient_idx").on(t.patientUserId, t.startedAt),
  ],
);
