import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Pharmacy rework, Controls (migration 0267 — GATED, owner-applied). The SQL is the source of truth: the station rule,
 * the cases' rules (who assigns, submits and signs off), the balance check and handover triggers that open cases.
 */
const tz = { withTimezone: true } as const;

export const pharmacyCdDoses = pgTable("pharmacy_cd_doses", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  medicineId: text("medicine_id").notNull(),
  patientUserId: uuid("patient_user_id"),
  patientLabel: text("patient_label").notNull(),
  bed: text("bed"),
  prescriberUserId: uuid("prescriber_user_id").notNull(),
  givenByUserId: uuid("given_by_user_id"),
  doseMg: numeric("dose_mg", { precision: 10, scale: 2 }).notNull(),
  route: text("route").notNull(),
  units: integer("units").notNull(),
  residueMg: numeric("residue_mg", { precision: 10, scale: 2 }).notNull().default("0"),
  residueDisposed: boolean("residue_disposed").notNull(),
  lateEntry: boolean("late_entry").notNull().default(false),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export type CdEventKind = "witness_added" | "residue_recorded" | "early_reviewed" | "paper_checked";
export const pharmacyCdEvents = pgTable("pharmacy_cd_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  movementId: uuid("movement_id").notNull(),
  kind: text("kind").$type<CdEventKind>().notNull(),
  witnessAttestationId: uuid("witness_attestation_id"),
  reason: text("reason"),
  actorUserId: uuid("actor_user_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyCdChecks = pgTable("pharmacy_cd_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  checkedBy: uuid("checked_by").notNull(),
  witnessAttestationId: uuid("witness_attestation_id"),
  paperWitnessName: text("paper_witness_name"),
  shiftHandoverId: uuid("shift_handover_id"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyCdCheckLines = pgTable(
  "pharmacy_cd_check_lines",
  {
    checkId: uuid("check_id").notNull(),
    hospitalId: uuid("hospital_id").notNull(),
    medicineId: text("medicine_id").notNull(),
    expected: integer("expected").notNull(),
    counted: integer("counted").notNull(),
  },
  (t) => [primaryKey({ columns: [t.checkId, t.medicineId] })],
);

export type ResolutionHow = "recount" | "late_entry" | "loss" | "excess";
export const pharmacyControlResolutions = pgTable(
  "pharmacy_control_resolutions",
  {
    sourceType: text("source_type").$type<"cd_check" | "handover">().notNull(),
    sourceId: uuid("source_id").notNull(),
    medicineId: text("medicine_id").notNull(),
    hospitalId: uuid("hospital_id").notNull(),
    how: text("how").$type<ResolutionHow>().notNull(),
    why: text("why"),
    note: text("note"),
    incidentRef: text("incident_ref"),
    doseId: uuid("dose_id"),
    movementId: uuid("movement_id"),
    witnessAttestationId: uuid("witness_attestation_id"),
    resolvedBy: uuid("resolved_by").notNull(),
    resolvedAt: timestamp("resolved_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sourceType, t.sourceId, t.medicineId] })],
);

export const pharmacyShiftHandovers = pgTable("pharmacy_shift_handovers", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  slotAt: timestamp("slot_at", tz),
  fromUserId: uuid("from_user_id").notNull(),
  toUserId: uuid("to_user_id").notNull(),
  keysHanded: boolean("keys_handed").notNull(),
  sealNo: text("seal_no"),
  sealNew: boolean("seal_new").notNull().default(false),
  fridgeTemp: numeric("fridge_temp", { precision: 4, scale: 1 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", tz),
});

export const pharmacyShiftHandoverLines = pgTable(
  "pharmacy_shift_handover_lines",
  {
    handoverId: uuid("handover_id").notNull(),
    hospitalId: uuid("hospital_id").notNull(),
    medicineId: text("medicine_id").notNull(),
    highRisk: boolean("high_risk").notNull().default(false),
    expected: integer("expected").notNull(),
    counted: integer("counted").notNull(),
  },
  (t) => [primaryKey({ columns: [t.handoverId, t.medicineId] })],
);

export const pharmacyShiftHandoverItems = pgTable(
  "pharmacy_shift_handover_items",
  {
    handoverId: uuid("handover_id").notNull(),
    hospitalId: uuid("hospital_id").notNull(),
    n: integer("n").notNull(),
    text: text("text").notNull(),
    seenAt: timestamp("seen_at", tz).notNull(),
  },
  (t) => [primaryKey({ columns: [t.handoverId, t.n] })],
);

export type MissWhy = "paper" | "covered" | "not_done";
export const pharmacyShiftHandoverMisses = pgTable("pharmacy_shift_handover_misses", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  slotAt: timestamp("slot_at", tz).notNull(),
  why: text("why").$type<MissWhy>().notNull(),
  note: text("note"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export type CaseSource = "cd_check" | "handover" | "count" | "manual";
export type CaseSeverity = "high" | "medium" | "low";
export interface CaseFindings {
  cause: string;
  actions: string[];
  prevent: string[];
}
export const pharmacyCases = pgTable("pharmacy_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  sourceType: text("source_type").$type<CaseSource>().notNull(),
  sourceId: uuid("source_id"),
  medicineId: text("medicine_id").notNull(),
  locationId: uuid("location_id").notNull(),
  qty: integer("qty").notNull(),
  what: text("what"),
  severity: text("severity").$type<CaseSeverity>().notNull(),
  dueAt: timestamp("due_at", tz).notNull(),
  ownerUserId: uuid("owner_user_id"),
  assignedBy: uuid("assigned_by"),
  assignedAt: timestamp("assigned_at", tz),
  fixedAt: timestamp("fixed_at", tz),
  findings: jsonb("findings").$type<CaseFindings>(),
  submittedBy: uuid("submitted_by"),
  submittedAt: timestamp("submitted_at", tz),
  signedOffBy: uuid("signed_off_by"),
  signedOffAt: timestamp("signed_off_at", tz),
  selfSigned: boolean("self_signed").notNull().default(false),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  changedBy: uuid("changed_by"),
});

export type CaseEventKind =
  | "opened"
  | "assigned"
  | "taken"
  | "step"
  | "fixed"
  | "submitted"
  | "sent_back"
  | "escalated"
  | "signed_off";
export const pharmacyCaseEvents = pgTable("pharmacy_case_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  caseId: uuid("case_id").notNull(),
  kind: text("kind").$type<CaseEventKind>().notNull(),
  what: text("what"),
  note: text("note"),
  actorUserId: uuid("actor_user_id").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});
