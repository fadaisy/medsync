import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitalDpaVersions } from "./hospital-dpa-versions";
import { hospitals } from "./hospitals";

/**
 * Per-hospital DPA signings. The agreement gate for hospital
 * activation is enforced server-side at the Edge Function layer —
 * before a hospital transitions to `active`, the function asserts
 * `EXISTS (SELECT 1 FROM hospital_agreements WHERE hospital_id = $1
 * AND superseded_by IS NULL)`. There is no FK on hospitals.state
 * enforcing this; the enforcement lives in code so the same Edge
 * Function can also handle the renewal flow.
 *
 * `source`:
 *   - `applicant_flow`     — accepted during the standard application
 *                             (E7 toggle path).
 *   - `superadmin_offline` — superadmin-created hospital path; the
 *                             hospital signed a physical agreement
 *                             outside the platform and the superadmin
 *                             records the offline evidence path.
 */
export const hospitalAgreements = pgTable(
  "hospital_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    dpaVersionId: uuid("dpa_version_id")
      .notNull()
      .references(() => hospitalDpaVersions.id, { onDelete: "restrict" }),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
    signedByUserId: uuid("signed_by_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    signatoryName: text("signatory_name").notNull(),
    signatoryTitle: text("signatory_title").notNull(),
    source: text("source").notNull(),
    offlineEvidencePath: text("offline_evidence_path"),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    supersededBy: uuid("superseded_by").references((): AnyPgColumn => hospitalAgreements.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "hospital_agreements_source_check",
      sql`${t.source} IN ('applicant_flow','superadmin_offline')`,
    ),
    check(
      "hospital_agreements_superadmin_evidence",
      sql`${t.source} <> 'superadmin_offline' OR ${t.offlineEvidencePath} IS NOT NULL`,
    ),
    index("hospital_agreements_hospital_idx").on(t.hospitalId),
    index("hospital_agreements_signed_at_idx").on(t.signedAt),
  ],
);

export type HospitalAgreement = typeof hospitalAgreements.$inferSelect;
export type NewHospitalAgreement = typeof hospitalAgreements.$inferInsert;
