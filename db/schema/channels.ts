import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { hospitals } from "./hospitals";
import { provisionalPatients } from "./provisional-patients";
import { serviceLines } from "./service-lines";

/**
 * Low-bandwidth channels — migration 0062 (GATED), ADR 0091, proposal §5.12.
 *
 *   ussd_sessions  resumable menu state per Africa's Talking sessionId;
 *                  `last_input`/`last_reply` make a replayed callback idempotent.
 *   inbound_sms    every inbound SMS once (UNIQUE on AT's id); keyword + code,
 *                  never the body.
 *   sms_opt_outs   STOP by phone — stronger than consent; covers provisional
 *                  phones that hold no account.
 *
 * All three: zero RLS policies (service-role only).
 */

export const USSD_STEPS = [
  "root",
  "language",
  "hospital",
  "line",
  "day",
  "name",
  "confirm",
  "done",
  "cancel_code",
  "confirm_code",
] as const;
export type UssdStep = (typeof USSD_STEPS)[number];

export const ussdSessions = pgTable(
  "ussd_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerSessionId: text("provider_session_id").notNull(),
    phoneEncrypted: text("phone_encrypted").notNull(),
    phoneHmac: text("phone_hmac").notNull(),
    language: text("language").notNull().default("en"),
    step: text("step").notNull().default("root"),
    /** The machine's selections — ids, page numbers, the caller's name/age. */
    selections: jsonb("selections").$type<Record<string, unknown>>().notNull().default({}),
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
    serviceLineId: uuid("service_line_id").references(() => serviceLines.id, {
      onDelete: "set null",
    }),
    provisionalPatientId: uuid("provisional_patient_id").references(() => provisionalPatients.id, {
      onDelete: "set null",
    }),
    lastInput: text("last_input"),
    lastReply: text("last_reply"),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '10 minutes'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("ussd_sessions_provider_unique").on(t.providerSessionId),
    index("ussd_sessions_expires_idx").on(t.expiresAt),
    index("ussd_sessions_phone_created_idx").on(t.phoneHmac, t.createdAt),
  ],
);

export const INBOUND_SMS_KEYWORDS = ["confirm", "cancel", "stop", "help", "unknown"] as const;
export type InboundSmsKeyword = (typeof INBOUND_SMS_KEYWORDS)[number];

export const inboundSms = pgTable(
  "inbound_sms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerMessageId: text("provider_message_id").notNull(),
    phoneEncrypted: text("phone_encrypted").notNull(),
    phoneHmac: text("phone_hmac").notNull(),
    keyword: text("keyword").notNull(),
    bookingCode: text("booking_code"),
    /** What was done: the reply key the dispatcher renders. */
    outcome: text("outcome").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("inbound_sms_provider_unique").on(t.providerMessageId),
    check(
      "inbound_sms_keyword_check",
      sql`${t.keyword} IN ('confirm','cancel','stop','help','unknown')`,
    ),
    index("inbound_sms_phone_received_idx").on(t.phoneHmac, t.receivedAt),
  ],
);

export const smsOptOuts = pgTable("sms_opt_outs", {
  phoneHmac: text("phone_hmac").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UssdSession = typeof ussdSessions.$inferSelect;
export type InboundSms = typeof inboundSms.$inferSelect;
