import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";
import { saAuditLog } from "./sa-audit-log";

/**
 * Time-boxed superadmin grant to view ONE patient's record for a
 * typed-justified purpose. Per kickoff section 4, this is the only
 * legitimate path that surfaces decrypted PHI from the workspace —
 * everything else operates on operational fields only.
 *
 * Each row carries:
 *   - actor + patient + purpose (free-text, ≥ 16 chars) + category
 *   - granted_at + expires_at (default 15 minutes; per-grant override
 *     up to 60 minutes)
 *   - revoked_at / by / reason (manual close OR auto-expire via cron)
 *   - hospital_id captured at grant-time for the admin notification
 *   - sa_audit_log_id linking to the loudest audit row written at
 *     grant-time (FK ON DELETE RESTRICT — the audit reference is
 *     immutable proof, never orphaned)
 *
 * RLS: superadmin (all) + patient (own row, transparency) +
 * hospital_admin of the affected hospital (their tenant's events).
 * INSERT/UPDATE service-role only.
 */
export const saBreakGlassGrants = pgTable(
  "sa_break_glass_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    purpose: text("purpose").notNull(),
    category: text("category").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '15 minutes'`),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => authUsers.id, { onDelete: "set null" }),
    revocationReason: text("revocation_reason"),
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    saAuditLogId: bigint("sa_audit_log_id", { mode: "number" })
      .notNull()
      .references(() => saAuditLog.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "sa_break_glass_category_check",
      sql`${t.category} IN ('emergency','regulator_request','safety_review','research_per_pdc','other')`,
    ),
    index("sa_break_glass_expires_idx").on(t.expiresAt),
    index("sa_break_glass_actor_idx").on(t.actorId, t.grantedAt),
    index("sa_break_glass_patient_idx").on(t.patientId),
  ],
);

export type SaBreakGlassGrant = typeof saBreakGlassGrants.$inferSelect;
export type NewSaBreakGlassGrant = typeof saBreakGlassGrants.$inferInsert;
