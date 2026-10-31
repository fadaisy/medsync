import { boolean, date, integer, numeric, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Pharmacy rework P4 (migration 0268 — GATED, owner-applied): cold chain, ward picks, outpatient pill counts and
 * check-ins, the immunisation register and SMS reminders. The SQL is the source of truth for every guard.
 */
const tz = { withTimezone: true } as const;

/* ─── Cold chain ─────────────────────────────────────────────────── */
export const pharmacyFridges = pgTable("pharmacy_fridges", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  model: text("model"),
  sensorKeyHash: text("sensor_key_hash"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", tz),
});

export const pharmacyFridgeReadings = pgTable("pharmacy_fridge_readings", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  fridgeId: uuid("fridge_id").notNull(),
  readAt: timestamp("read_at", tz).notNull(),
  tempC: numeric("temp_c", { precision: 4, scale: 1 }).notNull(),
  source: text("source").$type<"sensor" | "chart">().notNull(),
  slot: text("slot").$type<"am" | "pm">(),
  freezeIndicator: text("freeze_indicator").$type<"ok" | "x">(),
  initials: text("initials"),
  recordedBy: uuid("recorded_by"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyExcursionAcks = pgTable("pharmacy_excursion_acks", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  fridgeId: uuid("fridge_id").notNull(),
  excursionStart: timestamp("excursion_start", tz).notNull(),
  actions: text("actions").array().notNull(),
  shakeTest: text("shake_test").$type<"passed" | "failed">(),
  actedBy: uuid("acted_by").notNull(),
  actedAt: timestamp("acted_at", tz).notNull().defaultNow(),
});

export const pharmacyFridgeContents = pgTable("pharmacy_fridge_contents", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  fridgeId: uuid("fridge_id").notNull(),
  productId: uuid("product_id").notNull(),
  addedBy: uuid("added_by").notNull(),
  addedAt: timestamp("added_at", tz).notNull().defaultNow(),
  endedBy: uuid("ended_by"),
  endedAt: timestamp("ended_at", tz),
});

/* ─── Wards ──────────────────────────────────────────────────────── */
export const pharmacyRoundPicks = pgTable("pharmacy_round_picks", {
  id: uuid("id").primaryKey(),
  hospitalId: uuid("hospital_id").notNull(),
  wardLocationId: uuid("ward_location_id").notNull(),
  kind: text("kind").$type<"round" | "patient">().notNull(),
  windowH: smallint("window_h"),
  issueId: uuid("issue_id").notNull(),
  pickedBy: uuid("picked_by").notNull(),
  pickedAt: timestamp("picked_at", tz).notNull().defaultNow(),
});

export const pharmacyRoundPickLines = pgTable("pharmacy_round_pick_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  prescriptionId: uuid("prescription_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantity: integer("quantity").notNull(),
});

export const pharmacyIpNotes = pgTable("pharmacy_ip_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  body: text("body").notNull(),
  writtenBy: uuid("written_by").notNull(),
  writtenAt: timestamp("written_at", tz).notNull().defaultNow(),
});

/* ─── Outpatients ────────────────────────────────────────────────── */
export const pharmacyOpPillCounts = pgTable("pharmacy_op_pill_counts", {
  id: uuid("id").primaryKey(),
  hospitalId: uuid("hospital_id").notNull(),
  prescriptionId: uuid("prescription_id").notNull(),
  broughtBack: integer("brought_back"),
  countedBy: uuid("counted_by").notNull(),
  countedAt: timestamp("counted_at", tz).notNull().defaultNow(),
});

export type CheckInStatus = "taking" | "missed_some" | "stopped" | "not_started";
export const pharmacyOpCheckins = pgTable("pharmacy_op_checkins", {
  id: uuid("id").primaryKey(),
  hospitalId: uuid("hospital_id").notNull(),
  prescriptionId: uuid("prescription_id").notNull(),
  how: text("how").$type<"call" | "sms" | "visit">().notNull(),
  status: text("status").$type<CheckInStatus>().notNull(),
  missed: integer("missed").notNull().default(0),
  sideEffects: text("side_effects").array().notNull(),
  checkedBy: uuid("checked_by").notNull(),
  checkedAt: timestamp("checked_at", tz).notNull().defaultNow(),
});

/* ─── Immunisation ───────────────────────────────────────────────── */
export type Vaccine = "bcg" | "bopv" | "ipv" | "penta" | "pcv" | "rota" | "mr" | "hpv" | "td";

export const pharmacyEpiClinics = pgTable("pharmacy_epi_clinics", {
  hospitalId: uuid("hospital_id").primaryKey(),
  locationId: uuid("location_id").notNull(),
  setBy: uuid("set_by").notNull(),
  setAt: timestamp("set_at", tz).notNull().defaultNow(),
});

export const pharmacyEpiVaccines = pgTable(
  "pharmacy_epi_vaccines",
  {
    hospitalId: uuid("hospital_id").notNull(),
    vaccine: text("vaccine").$type<Vaccine>().notNull(),
    productId: uuid("product_id").notNull(),
    dosesPerVial: smallint("doses_per_vial").notNull(),
    maxLevel: integer("max_level"),
    setBy: uuid("set_by").notNull(),
    setAt: timestamp("set_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.hospitalId, t.vaccine] })],
);

export const pharmacyEpiClients = pgTable("pharmacy_epi_clients", {
  id: uuid("id").primaryKey(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").$type<"child" | "woman" | "girl">().notNull(),
  name: text("name").notNull(),
  sex: text("sex").$type<"F" | "M">().notNull(),
  dob: date("dob").notNull(),
  cardNo: text("card_no").notNull(),
  carer: text("carer").notNull(),
  phoneEncrypted: text("phone_encrypted").notNull(),
  phoneHmac: text("phone_hmac").notNull(),
  village: text("village"),
  note: text("note"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyEpiAppointments = pgTable("pharmacy_epi_appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  clientId: uuid("client_id").notNull(),
  comeBackOn: date("come_back_on").notNull(),
  setBy: uuid("set_by").notNull(),
  setAt: timestamp("set_at", tz).notNull().defaultNow(),
});

export const pharmacyVvmReadings = pgTable("pharmacy_vvm_readings", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  batchId: uuid("batch_id").notNull(),
  stage: smallint("stage").notNull(),
  readBy: uuid("read_by").notNull(),
  readAt: timestamp("read_at", tz).notNull().defaultNow(),
});

export const pharmacyEpiOpenVials = pgTable("pharmacy_epi_open_vials", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  batchId: uuid("batch_id").notNull(),
  dosesPerVial: smallint("doses_per_vial").notNull(),
  openedBy: uuid("opened_by").notNull(),
  openedAt: timestamp("opened_at", tz).notNull().defaultNow(),
  discardedBy: uuid("discarded_by"),
  discardedAt: timestamp("discarded_at", tz),
  wastedMovementId: uuid("wasted_movement_id"),
});

export const pharmacyEpiDoses = pgTable("pharmacy_epi_doses", {
  id: uuid("id").primaryKey(),
  hospitalId: uuid("hospital_id").notNull(),
  clientId: uuid("client_id").notNull(),
  antigen: text("antigen").notNull(),
  vaccine: text("vaccine").$type<Vaccine>().notNull(),
  batchId: uuid("batch_id").notNull(),
  movementId: uuid("movement_id").notNull(),
  vialId: uuid("vial_id"),
  site: text("site").notNull(),
  aefi: text("aefi").$type<"none" | "mild" | "serious">().notNull(),
  givenBy: uuid("given_by").notNull(),
  givenAt: timestamp("given_at", tz).notNull().defaultNow(),
});

/* ─── Reminders ──────────────────────────────────────────────────── */
export type SmsRule = "refill_due" | "refill_missed" | "course" | "epi_tomorrow" | "epi_defaulter";
export type SmsStatus = "scheduled" | "sent" | "failed" | "skipped" | "called";

export const pharmacySmsRules = pgTable("pharmacy_sms_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  rule: text("rule").$type<SmsRule>().notNull(),
  enabled: boolean("enabled").notNull(),
  templateEn: text("template_en"),
  templateLg: text("template_lg"),
  status: text("status").$type<"draft" | "signed">().notNull().default("draft"),
  setBy: uuid("set_by").notNull(),
  setAt: timestamp("set_at", tz).notNull().defaultNow(),
});

export const pharmacySmsMessages = pgTable("pharmacy_sms_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  day: date("day").notNull(),
  rule: text("rule").$type<SmsRule>().notNull(),
  refKey: text("ref_key").notNull(),
  recipient: text("recipient").notNull(),
  phoneEncrypted: text("phone_encrypted").notNull(),
  phoneHmac: text("phone_hmac").notNull(),
  lang: text("lang").$type<"en" | "lg">().notNull(),
  body: text("body").notNull(),
  status: text("status").$type<SmsStatus>().notNull(),
  providerId: text("provider_id"),
  cost: text("cost"),
  failure: text("failure"),
  sentAt: timestamp("sent_at", tz),
  statusBy: uuid("status_by"),
  statusAt: timestamp("status_at", tz).notNull().defaultNow(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacySmsOptouts = pgTable(
  "pharmacy_sms_optouts",
  {
    hospitalId: uuid("hospital_id").notNull(),
    phoneHmac: text("phone_hmac").notNull(),
    source: text("source").$type<"reply_stop" | "staff">().notNull(),
    recordedBy: uuid("recorded_by"),
    recordedAt: timestamp("recorded_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.hospitalId, t.phoneHmac] })],
);
