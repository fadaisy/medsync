import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { hospitals } from "./hospitals";
import { roles } from "./reference-data";

/**
 * Staff invitations for the setup wizard's "kick off onboarding" step
 * (kickoff §F4). The invitation NEVER grants access — it pre-fills
 * fields and tracks intent. The invitee still goes through the
 * council-anchored affiliation verification flow.
 *
 * `source`:
 *   - `individual` — single invitation typed in by an admin.
 *   - `bulk`       — created from a CSV/list import (stubbed this
 *                     phase per kickoff Q2 confirmation).
 */
export const hospitalStaffInvitations = pgTable(
  "hospital_staff_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    invitedEmail: text("invited_email").notNull(),
    invitedName: text("invited_name"),
    invitedRoleId: uuid("invited_role_id").references(() => roles.id, { onDelete: "restrict" }),
    invitedCouncilNumber: text("invited_council_number"),
    invitationTokenHash: text("invitation_token_hash").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`(now() + interval '14 days')`),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => authUsers.id, { onDelete: "set null" }),
    revocationReason: text("revocation_reason"),
    source: text("source").notNull().default("individual"),
  },
  (t) => [
    check("hospital_staff_invitations_source_check", sql`${t.source} IN ('individual','bulk')`),
    check(
      "hospital_staff_invitations_state_pair",
      sql`${t.acceptedAt} IS NULL OR ${t.revokedAt} IS NULL`,
    ),
    index("hospital_staff_invitations_hospital_idx").on(t.hospitalId, t.invitedAt),
    index("hospital_staff_invitations_email_idx").on(t.invitedEmail),
  ],
);

export type HospitalStaffInvitation = typeof hospitalStaffInvitations.$inferSelect;
export type NewHospitalStaffInvitation = typeof hospitalStaffInvitations.$inferInsert;
