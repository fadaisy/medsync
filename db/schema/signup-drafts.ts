import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Server-side draft persistence for multi-step onboarding forms.
 *
 * Why server-side and not localStorage: forms collect identifiers that
 * may be encrypted (NIN, phone), and the user may resume on a different
 * device after a dropped connection. localStorage can't handle either.
 *
 * Records are keyed by `(draft_kind, owner_key)`:
 *   - `draft_kind` = "patient" | "clinical" | "hospital"
 *   - `owner_key` = lowercase email of the in-flight signup (pre-account)
 *     OR the user_id once an account exists (mid-flow)
 *
 * Payload is JSONB. Sensitive fields inside the payload should be
 * encrypted via lib/encryption.ts BEFORE writing — drafts table itself
 * doesn't enforce encryption.
 *
 * TTL: 14 days from last touch. Cron/scheduled function cleans up
 * expired rows in GATE F.
 *
 * RLS: pre-account drafts are keyed by email + a server-side rotating
 * token (no RLS path for anon); once an account exists, owner-only.
 */

export const DRAFT_KINDS = ["patient", "clinical", "hospital"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const signupDrafts = pgTable(
  "signup_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftKind: text("draft_kind").notNull(),
    // Either the email (lowercased) for pre-account drafts, or the
    // user_id string once an account exists. Indexed for lookup.
    ownerKey: text("owner_key").notNull(),
    // Server-only rotating token used to authorise pre-account access
    // to this draft (signed cookie or one-time link). Null once the
    // draft is owned by an authenticated user.
    accessToken: text("access_token"),
    payload: jsonb("payload").notNull(),
    // Last step the user reached (UI restores them there on resume).
    currentStep: text("current_step"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '14 days'`),
  },
  (t) => [
    check(
      "signup_drafts_kind_check",
      sql.raw(`draft_kind IN (${DRAFT_KINDS.map((k) => `'${k}'`).join(", ")})`),
    ),
    uniqueIndex("signup_drafts_owner_kind_unique").on(t.draftKind, t.ownerKey),
    index("signup_drafts_expires_idx").on(t.expiresAt),
  ],
);

export type SignupDraft = typeof signupDrafts.$inferSelect;
export type NewSignupDraft = typeof signupDrafts.$inferInsert;
