import { index, jsonb, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Clerkship working-draft autosave (W3 — no-lost-work).
 *
 * A MUTABLE, per-(encounter, author) scratchpad that holds the in-progress
 * clerkship input between explicit saves — deliberately SEPARATE from the
 * append-only `clinical_documentation` version history, so debounced autosave
 * never spams the system-of-record with versions. `payload` is the validated
 * ClerkshipInput (the same flat shape the save action accepts), so a recovered
 * draft rehydrates the form via the existing clerkshipInputToClerkship mapper.
 *
 * Lifecycle: upsert on autosave; DELETED on a successful explicit save/finalise
 * (the new version supersedes it). Transient form state, NOT system-of-record —
 * so it is not versioned and not on the audited clinical timeline.
 *
 * RLS: an author may touch ONLY their own draft (author_id = auth.uid()). Writes
 * go through a server action using the privileged client; the policies are
 * defence-in-depth against direct client access.
 *
 * ⚠️ GATED — migration 0048. The table does not exist until the owner applies it;
 * all access is gated behind CLERKSHIP_DRAFTS_LIVE so the app deploys safely dark.
 */
export const clerkshipDrafts = pgTable(
  "clerkship_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    encounterId: uuid("encounter_id").notNull(),
    authorId: uuid("author_id").notNull(),
    /** The validated ClerkshipInput (flat) — rehydrated on recovery. */
    payload: jsonb("payload").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("clerkship_drafts_encounter_author_unique").on(t.encounterId, t.authorId),
    index("clerkship_drafts_encounter_idx").on(t.encounterId),
  ],
);

export type ClerkshipDraft = typeof clerkshipDrafts.$inferSelect;
export type NewClerkshipDraft = typeof clerkshipDrafts.$inferInsert;
