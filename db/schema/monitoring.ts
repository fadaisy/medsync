/* ─── Monitoring charts opened by the plan (migration 0089 — GATED) ────
 * ADR 0189, docs/emr/clerking-v2/plan/MONITORING-CHARTS.md §5.
 *
 * fluid_balance_entries is append-only: a correction is a new row naming the one it replaces;
 * "not measured" urine is a row with no volume, never 0. monitoring_charts is the registry of the
 * charts the plan opened, each with what opened it; one open chart per kind per visit.
 * Reads go through the clinical reader (RLS); the server writes as the owner.
 */
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";
import { prescriptions } from "./prescribing";
import { encounters } from "./scheduling";

export const fluidBalanceEntries = pgTable(
  "fluid_balance_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "restrict" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => encounters.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    /** oral_in: oral | ng; other_out: vomit | drain | stool | other. */
    routeDetail: text("route_detail"),
    volumeMl: numeric("volume_ml"),
    measured: boolean("measured").notNull().default(true),
    prescriptionId: uuid("prescription_id").references(() => prescriptions.id, {
      onDelete: "restrict",
    }),
    /** The hour the volume went in or out. */
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    recordedByUserId: uuid("recorded_by_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    state: text("state").notNull().default("recorded"),
    replacesId: uuid("replaces_id").references((): AnyPgColumn => fluidBalanceEntries.id, {
      onDelete: "restrict",
    }),
    reasonCode: text("reason_code"),
    clientKey: text("client_key"),
  },
  (t) => [
    check("fbe_kind_check", sql`${t.kind} IN ('iv_in','oral_in','urine_out','other_out')`),
    check("fbe_state_check", sql`${t.state} IN ('recorded','entered_in_error')`),
    check(
      "fbe_route_detail_check",
      sql`${t.routeDetail} IS NULL OR ${t.routeDetail} IN ('oral','ng','vomit','drain','stool','other')`,
    ),
    check("fbe_volume", sql`${t.volumeMl} IS NULL OR ${t.volumeMl} >= 0`),
    check(
      "fbe_measured",
      sql`${t.state} = 'entered_in_error'
        OR (${t.measured} AND ${t.volumeMl} IS NOT NULL)
        OR (NOT ${t.measured} AND ${t.volumeMl} IS NULL AND ${t.kind} = 'urine_out')`,
    ),
    check(
      "fbe_entered_in_error",
      sql`${t.state} <> 'entered_in_error'
        OR (${t.replacesId} IS NOT NULL AND ${t.volumeMl} IS NULL AND ${t.reasonCode} IS NOT NULL)`,
    ),
    check("fbe_prescription_kind", sql`${t.prescriptionId} IS NULL OR ${t.kind} = 'iv_in'`),
    index("fluid_balance_entries_encounter_time").on(t.encounterId, t.effectiveAt),
    uniqueIndex("fluid_balance_entries_replaces")
      .on(t.replacesId)
      .where(sql`${t.replacesId} IS NOT NULL`),
    uniqueIndex("fluid_balance_entries_client_key")
      .on(t.clientKey)
      .where(sql`${t.clientKey} IS NOT NULL`),
  ],
);

export const monitoringCharts = pgTable(
  "monitoring_charts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "restrict" }),
    patientUserId: uuid("patient_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    encounterId: uuid("encounter_id")
      .notNull()
      .references(() => encounters.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    /** {rule, label, items: [{type, id}]}: the rule that fired and the plan item(s) behind it. */
    openedBy: jsonb("opened_by").notNull(),
    frequency: text("frequency"),
    measureUrine: boolean("measure_urine").notNull().default(false),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    openedByUserId: uuid("opened_by_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => authUsers.id, {
      onDelete: "restrict",
    }),
    closeReasonCode: text("close_reason_code"),
    clientKey: text("client_key"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "mc_kind_check",
      sql`${t.kind} IN ('observations','temperature','fluid_balance','glucose','mar')`,
    ),
    check(
      "mc_frequency_check",
      sql`${t.frequency} IS NULL OR ${t.frequency} IN ('continuous','hourly','4h','6h','12h','daily','with_observations')`,
    ),
    check(
      "mc_opened_by_shape",
      sql`jsonb_typeof(${t.openedBy}) = 'object' AND ${t.openedBy} ? 'rule'`,
    ),
    check("mc_closed", sql`(${t.closedAt} IS NULL) = (${t.closedByUserId} IS NULL)`),
    uniqueIndex("monitoring_charts_one_open")
      .on(t.encounterId, t.kind)
      .where(sql`${t.closedAt} IS NULL`),
    uniqueIndex("monitoring_charts_client_key")
      .on(t.clientKey)
      .where(sql`${t.clientKey} IS NOT NULL`),
    index("monitoring_charts_patient").on(t.patientUserId, t.openedAt),
  ],
);

export type FluidBalanceEntry = typeof fluidBalanceEntries.$inferSelect;
export type MonitoringChart = typeof monitoringCharts.$inferSelect;
