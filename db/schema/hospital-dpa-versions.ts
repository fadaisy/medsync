import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Versioned text of the Hospital Data-Processing Agreement / MoU.
 *
 * Append-only by convention — you don't edit a shipped version, you
 * supersede it by inserting a new one with `supersedes_id` pointing
 * at the previous row. The SHA-256 of `body` MUST match what gets
 * shown to applicants; the application layer asserts equality.
 *
 * `legal_review_status`:
 *   - `placeholder` — drafted by engineering, awaiting counsel review.
 *     A hospital that accepts a placeholder version is on a known-
 *     transitional contract and is re-prompted when the lawyer-
 *     approved version lands (deferred renewal flow).
 *   - `under_review` — counsel is reviewing.
 *   - `approved`    — counsel-approved, production legal basis.
 */
export const hospitalDpaVersions = pgTable(
  "hospital_dpa_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: text("version").notNull(),
    effectiveDate: date("effective_date").notNull(),
    body: text("body").notNull(),
    bodySha256: text("body_sha256").notNull(),
    legalReviewStatus: text("legal_review_status").notNull().default("placeholder"),
    supersedesId: uuid("supersedes_id").references((): AnyPgColumn => hospitalDpaVersions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "hospital_dpa_versions_legal_status_check",
      sql`${t.legalReviewStatus} IN ('placeholder','under_review','approved')`,
    ),
    uniqueIndex("hospital_dpa_versions_unique").on(t.version),
    index("hospital_dpa_versions_effective_idx").on(t.effectiveDate),
  ],
);

export type HospitalDpaVersion = typeof hospitalDpaVersions.$inferSelect;
export type NewHospitalDpaVersion = typeof hospitalDpaVersions.$inferInsert;
