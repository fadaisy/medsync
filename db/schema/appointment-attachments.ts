import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { authUsers } from "./_auth";
import { appointments } from "./scheduling";

/**
 * Photos, videos and voice notes a patient sends with "Ask for a day" —
 * migration 0186 (ADR 0404). One row per object in the private
 * `appointment-attachments` bucket, at `<uploaded_by>/<appointment_id>/…`.
 * Append-only; readable by whoever can read the appointment, added only by
 * its patient or the agent who booked it. Descriptive, never routed on.
 */
export const appointmentAttachments = pgTable(
  "appointment_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ["photo", "video", "voice"] }).notNull(),
    storagePath: text("storage_path").notNull().unique(),
    mime: text("mime").notNull(),
    bytes: bigint("bytes", { mode: "number" }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appointment_attachments_appointment_idx").on(t.appointmentId, t.createdAt),
    check("appointment_attachments_kind", sql`${t.kind} IN ('photo', 'video', 'voice')`),
    check(
      "appointment_attachments_path_shape",
      sql`${t.storagePath} LIKE ${t.uploadedBy}::text || '/' || ${t.appointmentId}::text || '/%'`,
    ),
  ],
);
