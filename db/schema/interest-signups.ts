import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Landing-page interest captures. Three audiences (patient / clinical /
 * hospital); a single table holds all three with a CHECK on `audience`.
 *
 * RLS:
 *   - anon INSERT allowed (the landing-page forms run unauthenticated)
 *   - SELECT for superadmin only (these are leads)
 *   - No UPDATE / DELETE policy → blocked
 *
 * No PHI here. Hospital-pilot interest may include hospital name + role,
 * which is org-data, not PHI. Email + name are PII (covered by audit + the
 * existing logger redaction list).
 */
export const interestSignups = pgTable(
  "interest_signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    audience: text("audience").notNull(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    /** Free-text "tell us more" — optional. */
    context: text("context"),
    /** Hospital name (hospital audience only). */
    hospitalName: text("hospital_name"),
    /** Role / title (clinical or hospital audience). */
    role: text("role"),
    /** Source: which CTA / page section triggered the signup. */
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "interest_signups_audience_check",
      sql`${t.audience} IN ('patient', 'clinical', 'hospital')`,
    ),
    index("interest_signups_email_idx").on(t.email),
    index("interest_signups_audience_created_idx").on(t.audience, t.createdAt),
  ],
);

export type InterestSignup = typeof interestSignups.$inferSelect;
export type NewInterestSignup = typeof interestSignups.$inferInsert;

export const INTEREST_AUDIENCES = ["patient", "clinical", "hospital"] as const;
export type InterestAudience = (typeof INTEREST_AUDIENCES)[number];
