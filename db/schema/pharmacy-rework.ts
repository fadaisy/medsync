import { bigint, boolean, date, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Pharmacy rework (migration 0265 onwards — GATED, owner-applied). The SQL is the source of truth: the witness
 * approvals' single use, the duty roster and its on-duty test, the witness requests and controlled-drug prescribers.
 */
const tz = { withTimezone: true } as const;

export const pharmacyAttestationUses = pgTable(
  "pharmacy_attestation_uses",
  {
    attestationId: uuid("attestation_id").notNull(),
    xact: bigint("xact", { mode: "number" }).notNull(),
    usedAt: timestamp("used_at", tz).notNull().defaultNow(),
    usedFor: text("used_for").notNull(),
  },
  (t) => [primaryKey({ columns: [t.attestationId, t.xact] })],
);

export type RosterRole =
  | "pharmacist"
  | "technician"
  | "store_keeper"
  | "in_charge"
  | "second_nurse"
  | "nurse_in_charge"
  | "doctor_on_duty"
  | "epi_nurse";
export type RosterShift = "day" | "night" | "call";

export const pharmacyDutyRoster = pgTable("pharmacy_duty_roster", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  userId: uuid("user_id").notNull(),
  /** NULL: every pharmacy place. */
  locationId: uuid("location_id"),
  role: text("role").$type<RosterRole>().notNull(),
  shift: text("shift").$type<RosterShift>().notNull(),
  dateFrom: date("date_from").notNull(),
  dateTo: date("date_to").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  endedAt: timestamp("ended_at", tz),
  endedBy: uuid("ended_by"),
});

export const pharmacyWitnessRequests = pgTable("pharmacy_witness_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  actorUserId: uuid("actor_user_id").notNull(),
  witnessUserId: uuid("witness_user_id").notNull(),
  locationId: uuid("location_id"),
  purpose: text("purpose").notNull(),
  summary: text("summary").notNull(),
  status: text("status").$type<"waiting" | "approved" | "declined" | "withdrawn">().notNull().default("waiting"),
  attestationId: uuid("attestation_id"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", tz),
});

export const pharmacyCdPrescribers = pgTable("pharmacy_cd_prescribers", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  userId: uuid("user_id").notNull(),
  department: text("department"),
  cdAllowed: boolean("cd_allowed").notNull().default(true),
  onlyMedicines: text("only_medicines").array().notNull().default([]),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

// ─── 0266: daily work ────────────────────────────────────────────────────
export type RxCheckAnswer = "checked" | "prescriber_confirmed" | "query";

/** The pharmacist's answer to a check flag on a line (append-only; latest per line and code stands). */
export const pharmacyRxChecks = pgTable("pharmacy_rx_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  lineId: uuid("line_id").notNull(),
  code: text("code").notNull(),
  level: text("level").$type<"stop" | "check">().notNull(),
  answer: text("answer").$type<RxCheckAnswer>().notNull(),
  reason: text("reason"),
  prescriberUserId: uuid("prescriber_user_id"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export type CountSheetStatus = "counting" | "approval" | "done" | "cancelled";

/** A count saved as you type; differences post only on the in-charge's approval. */
export const pharmacyCountSheets = pgTable("pharmacy_count_sheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  scope: text("scope").$type<"shelf" | "medicine" | "month_end">().notNull(),
  label: text("label").notNull(),
  status: text("status").$type<CountSheetStatus>().notNull().default("counting"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  sentAt: timestamp("sent_at", tz),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", tz),
  witnessAttestationId: uuid("witness_attestation_id"),
  countId: uuid("count_id"),
});

export const pharmacyCountSheetLines = pgTable(
  "pharmacy_count_sheet_lines",
  {
    sheetId: uuid("sheet_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    shelf: text("shelf"),
    packSize: integer("pack_size").notNull().default(1),
    countedPacks: integer("counted_packs"),
    countedUnits: integer("counted_units"),
    found: boolean("found").notNull().default(false),
    reason: text("reason"),
    note: text("note"),
    updatedBy: uuid("updated_by").notNull(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sheetId, t.batchId] })],
);
