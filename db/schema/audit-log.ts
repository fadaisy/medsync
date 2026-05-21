import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";

/**
 * Append-only system audit log. Populated ONLY by the
 * `audit.log_changes()` trigger function (added in Phase 0.6),
 * never by application code.
 *
 * Defence in depth: a BEFORE UPDATE OR DELETE trigger raises an
 * exception on any tampering attempt, AND `REVOKE UPDATE, DELETE`
 * strips privileges from the anon / authenticated / service roles
 * as a second layer.
 *
 * Auditing this table itself would recurse — no audit trigger on
 * `audit_log`.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(),
    actorId: uuid("actor_id").references(() => authUsers.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    schemaName: text("schema_name").notNull(),
    tableName: text("table_name").notNull(),
    recordId: text("record_id"),
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    requestId: uuid("request_id"),
  },
  (t) => [
    check("audit_log_action_check", sql`${t.action} IN ('insert', 'update', 'delete')`),
    index("audit_log_timestamp_idx").on(t.timestamp),
    index("audit_log_table_record_idx").on(t.tableName, t.recordId),
    index("audit_log_actor_idx").on(t.actorId),
  ],
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
