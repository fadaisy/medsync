import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";

/**
 * Four-eyes wiring (migration 0018). When a catastrophic action is
 * requested, an Edge Function inserts a row here in
 * `pending_second_approval` state. A *different* superadmin must
 * confirm. With one real superadmin the system auto-satisfies and
 * executes immediately — but the row is still written so the trail
 * shows that four-eyes was attempted.
 *
 * RLS: SELECT superadmin only; INSERT/UPDATE service-role only
 * (Edge Functions). Audited via the generic trigger as defence in
 * depth on top of the application-layer sa_audit_log writes.
 */
export const saPendingApprovals = pgTable(
  "sa_pending_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    targetKind: text("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    justification: text("justification").notNull(),
    state: text("state").notNull().default("pending_second_approval"),
    approvedBy: uuid("approved_by").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    executionError: text("execution_error"),
    cancelledBy: uuid("cancelled_by").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '24 hours'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "sa_pending_approvals_action_check",
      sql`${t.action} IN ('deactivate_tenant','suspend_tenant','deactivate_superadmin','demote_superadmin','bulk_export','edit_permission_mapping','delete_reference_data')`,
    ),
    check(
      "sa_pending_approvals_target_kind_check",
      sql`${t.targetKind} IN ('hospital','user','role_permission','reference_data','export')`,
    ),
    check(
      "sa_pending_approvals_state_check",
      sql`${t.state} IN ('pending_second_approval','auto_satisfied','executed','cancelled','expired')`,
    ),
    index("sa_pending_approvals_state_expires_idx").on(t.state, t.expiresAt),
    index("sa_pending_approvals_requested_by_idx").on(t.requestedBy, t.requestedAt),
    index("sa_pending_approvals_target_idx").on(t.targetKind, t.targetId),
  ],
);

export type SaPendingApproval = typeof saPendingApprovals.$inferSelect;
export type NewSaPendingApproval = typeof saPendingApprovals.$inferInsert;
