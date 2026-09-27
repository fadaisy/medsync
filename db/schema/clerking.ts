import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";

/**
 * Clerking desk v2 (migration 0076, GATED). One row per hospital: outbreak mode turns on the
 * outbreak VHF screen (D-CV-06). Read by the hospital's clinical staff; written only by the server,
 * every change audited (audit_log_changes).
 */
export const hospitalClinicalSettings = pgTable(
  "hospital_clinical_settings",
  {
    hospitalId: uuid("hospital_id")
      .primaryKey()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    outbreakMode: boolean("outbreak_mode").notNull().default(false),
    outbreakReason: text("outbreak_reason"),
    updatedBy: uuid("updated_by").references(() => authUsers.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "hcs_outbreak_reason",
      sql`NOT ${t.outbreakMode} OR length(btrim(coalesce(${t.outbreakReason}, ''))) > 0`,
    ),
  ],
);
export type HospitalClinicalSettingsRow = typeof hospitalClinicalSettings.$inferSelect;
