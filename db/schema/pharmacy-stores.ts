import {
  boolean,
  date,
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
 * Pharmacy Phase 2: stores, wards and supply (migrations 0180–0181, GATED; GATE A signed 21 Oct 2026,
 * docs/pharmacy/phase-2/gate-a-proposal.md). The SQL is the source of truth: the pair trigger (SL-13), the SL-14
 * guard, the append-only and closed-record guards live there. These mirrors carry columns only.
 */
const tz = { withTimezone: true } as const;

export const LOCATION_KINDS = [
  "store",
  "dispensing_point",
  "ward",
  "cart",
  "quarantine",
  // Phase 4 (0230, SA-1): stock set aside for one prepared refill
  "prepared",
] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const pharmacyLocations = pgTable("pharmacy_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").$type<LocationKind>().notNull(),
  departmentId: uuid("department_id"),
  wardId: uuid("ward_id"),
  crashCartId: uuid("crash_cart_id"),
  name: text("name").notNull(),
  wardSupplyModel: text("ward_supply_model").$type<"stocked" | "issue_only">(),
  anyNurseConfirms: boolean("any_nurse_confirms").notNull().default(false),
  inChargeUserId: uuid("in_charge_user_id"),
  liveAt: timestamp("live_at", tz),
  switchedOffAt: timestamp("switched_off_at", tz),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", tz),
});

export const pharmacyLocationGolive = pgTable("pharmacy_location_golive", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  action: text("action").$type<"on" | "off">().notNull(),
  conditions: jsonb("conditions").notNull(),
  reason: text("reason"),
  requestedBy: uuid("requested_by").notNull(),
  approvedBy: uuid("approved_by").notNull(),
  approvalAttestationId: uuid("approval_attestation_id"),
  at: timestamp("at", tz).notNull().defaultNow(),
});

export const pharmacyCounterparties = pgTable("pharmacy_counterparties", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").$type<"supplier" | "facility">().notNull(),
  name: text("name").notNull(),
  code: text("code"),
  takesReturns: boolean("takes_returns").notNull().default(false),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  retiredAt: timestamp("retired_at", tz),
});

export const pharmacyProductLocations = pgTable(
  "pharmacy_product_locations",
  {
    productId: uuid("product_id").notNull(),
    locationId: uuid("location_id").notNull(),
    hospitalId: uuid("hospital_id").notNull(),
    active: boolean("active").notNull().default(true),
    startedAt: timestamp("started_at", tz).notNull().defaultNow(),
    endedAt: timestamp("ended_at", tz),
    endedBy: uuid("ended_by"),
  },
  (t) => [primaryKey({ columns: [t.productId, t.locationId] })],
);

export const pharmacyRecalls = pgTable("pharmacy_recalls", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  productId: uuid("product_id").notNull(),
  batchNumber: text("batch_number"),
  source: text("source").$type<"nda" | "supplier" | "manufacturer" | "hospital">().notNull(),
  noticeRef: text("notice_ref").notNull(),
  noticeDate: date("notice_date").notNull(),
  statedClass: text("stated_class").$type<"A" | "B" | "C" | "not_stated">().notNull(),
  level: text("level").notNull(),
  instructions: text("instructions").notNull(),
  mayHaveMessageApprovedBy: uuid("may_have_message_approved_by"),
  mayHaveMessageApprovedAt: timestamp("may_have_message_approved_at", tz),
  startedBy: uuid("started_by").notNull(),
  startedAt: timestamp("started_at", tz).notNull().defaultNow(),
  closedBy: uuid("closed_by"),
  closedAt: timestamp("closed_at", tz),
  returnedQuantity: integer("returned_quantity"),
  destroyedQuantity: integer("destroyed_quantity"),
  closeNote: text("close_note"),
});

export const pharmacyCostCorrections = pgTable("pharmacy_cost_corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  movementId: uuid("movement_id").notNull(),
  oldCost: numeric("old_cost", { precision: 14, scale: 2 }),
  newCost: numeric("new_cost", { precision: 14, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  actorUserId: uuid("actor_user_id").notNull(),
  correctedAt: timestamp("corrected_at", tz).notNull().defaultNow(),
});

/* ─── 0181 ─────────────────────────────────────────────────────────── */

export const pharmacyOrders = pgTable("pharmacy_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  counterpartyId: uuid("counterparty_id"),
  kind: text("kind").$type<"cycle" | "emergency">().notNull(),
  state: text("state").$type<"draft" | "open" | "closed">().notNull().default("draft"),
  cutAt: timestamp("cut_at", tz).notNull(),
  parametersSetId: uuid("parameters_set_id"),
  budget: numeric("budget", { precision: 16, scale: 2 }),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  savedAt: timestamp("saved_at", tz),
  savedBy: uuid("saved_by"),
  closedAt: timestamp("closed_at", tz),
});

export const pharmacyOrderLines = pgTable("pharmacy_order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull(),
  medicineId: text("medicine_id").notNull(),
  productId: uuid("product_id").notNull(),
  inputs: jsonb("inputs").notNull(),
  proposedUnits: integer("proposed_units"),
  proposedPacks: integer("proposed_packs"),
  chosenUnits: integer("chosen_units"),
  reason: text("reason"),
  cut: jsonb("cut"),
  closedAt: timestamp("closed_at", tz),
  closedBy: uuid("closed_by"),
  closeReason: text("close_reason").$type<
    "received" | "supplier_out" | "cancelled" | "substituted" | "other"
  >(),
  closeNote: text("close_note"),
});

export const pharmacyDeliveries = pgTable("pharmacy_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  supplierId: uuid("supplier_id").notNull(),
  noteNumber: text("note_number").notNull(),
  orderId: uuid("order_id"),
  arrivedAt: timestamp("arrived_at", tz).notNull(),
  countedBy: uuid("counted_by").notNull(),
  witnessName: text("witness_name"),
  delivererName: text("deliverer_name"),
  vehicleRegistration: text("vehicle_registration"),
  state: text("state").$type<"counting" | "received" | "abandoned">().notNull().default("counting"),
  abandonReason: text("abandon_reason"),
  finishedBy: uuid("finished_by"),
  finishedAt: timestamp("finished_at", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyDeliveryLines = pgTable("pharmacy_delivery_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  deliveryId: uuid("delivery_id").notNull(),
  lineNo: integer("line_no").notNull(),
  productId: uuid("product_id").notNull(),
  noteProductId: uuid("note_product_id"),
  orderLineId: uuid("order_line_id"),
  noteQuantity: integer("note_quantity"),
  acceptedQuantity: integer("accepted_quantity").notNull().default(0),
  rejectedKeptQuantity: integer("rejected_kept_quantity").notNull().default(0),
  rejectedReturnedQuantity: integer("rejected_returned_quantity").notNull().default(0),
  rejectReason: text("reject_reason").$type<
    "damaged" | "wrong_product" | "expired" | "short_dated" | "other"
  >(),
  batchNumber: text("batch_number"),
  expiry: date("expiry"),
  expiryMonthOnly: boolean("expiry_month_only").notNull().default(false),
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }),
  shortDatedDecision: text("short_dated_decision").$type<"accept" | "accept_tell" | "reject">(),
  note: text("note"),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

export const REQUISITION_STATES = [
  "raised",
  "issued",
  "part_issued",
  "refused",
  "withdrawn",
  "confirmed",
  "confirmed_with_difference",
] as const;
export type RequisitionState = (typeof REQUISITION_STATES)[number];

export const pharmacyRequisitions = pgTable("pharmacy_requisitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  requestingLocationId: uuid("requesting_location_id").notNull(),
  issuingLocationId: uuid("issuing_location_id").notNull(),
  raisedBy: uuid("raised_by").notNull(),
  raisedAt: timestamp("raised_at", tz).notNull().defaultNow(),
  state: text("state").$type<RequisitionState>().notNull().default("raised"),
  refusedReason: text("refused_reason"),
  closedAt: timestamp("closed_at", tz),
});

export const pharmacyRequisitionLines = pgTable("pharmacy_requisition_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  requisitionId: uuid("requisition_id").notNull(),
  productId: uuid("product_id").notNull(),
  quantityAsked: integer("quantity_asked").notNull(),
  quantityIssued: integer("quantity_issued"),
  notIssuedReason: text("not_issued_reason"),
});

export const pharmacyIssues = pgTable("pharmacy_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").$type<"issue" | "return" | "restock" | "cart_move">().notNull(),
  fromLocationId: uuid("from_location_id").notNull(),
  toLocationId: uuid("to_location_id").notNull(),
  requisitionId: uuid("requisition_id"),
  returnReason: text("return_reason"),
  issuedBy: uuid("issued_by").notNull(),
  witnessAttestationId: uuid("witness_attestation_id"),
  issuedAt: timestamp("issued_at", tz).notNull().defaultNow(),
});

export const pharmacyIssueConfirmations = pgTable("pharmacy_issue_confirmations", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: uuid("issue_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  confirmedBy: uuid("confirmed_by").notNull(),
  attestationId: uuid("attestation_id"),
  differences: jsonb("differences").notNull().default({}),
  confirmedAt: timestamp("confirmed_at", tz).notNull().defaultNow(),
});

export const pharmacyLocationPacks = pgTable("pharmacy_location_packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  kind: text("kind").$type<"ward_levels" | "cart_list">().notNull(),
  version: integer("version").notNull(),
  content: jsonb("content").notNull(),
  sha256: text("sha256"),
  status: text("status").$type<"draft" | "signed" | "retired">().notNull().default("draft"),
  authoredBy: uuid("authored_by").notNull(),
  firstSigner: uuid("first_signer"),
  firstSignerRole: text("first_signer_role"),
  secondSigner: uuid("second_signer"),
  secondSignerRole: text("second_signer_role"),
  exceptionText: text("exception_text"),
  signedAt: timestamp("signed_at", tz),
  retiredAt: timestamp("retired_at", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyCartChecks = pgTable("pharmacy_cart_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  countId: uuid("count_id").notNull(),
  restockIssueId: uuid("restock_issue_id"),
  sealNumber: text("seal_number"),
  explanations: jsonb("explanations").notNull().default({}),
  checkedBy: uuid("checked_by").notNull(),
  confirmedBy: uuid("confirmed_by").notNull(),
  confirmAttestationId: uuid("confirm_attestation_id"),
  checkedAt: timestamp("checked_at", tz).notNull().defaultNow(),
});

export const pharmacyWriteOffs = pgTable("pharmacy_write_offs", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  registerNumber: text("register_number").notNull(),
  reason: text("reason").notNull(),
  note: text("note"),
  witnessAttestationId: uuid("witness_attestation_id").notNull(),
  actorUserId: uuid("actor_user_id").notNull(),
  writtenOffAt: timestamp("written_off_at", tz).notNull().defaultNow(),
  disposalReference: text("disposal_reference"),
  disposalOn: date("disposal_on"),
  disposalRecordedBy: uuid("disposal_recorded_by"),
});

export const pharmacyRecallEvents = pgTable("pharmacy_recall_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  recallId: uuid("recall_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  list: text("list").$type<"exact" | "may_have">().notNull(),
  outcome: text("outcome")
    .$type<"told_by_message" | "reached_by_phone" | "reached_at_visit" | "could_not_reach">()
    .notNull(),
  note: text("note"),
  actorUserId: uuid("actor_user_id").notNull(),
  at: timestamp("at", tz).notNull().defaultNow(),
});

export const pharmacyRecallWardNotices = pgTable("pharmacy_recall_ward_notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  recallId: uuid("recall_id").notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  postedBy: uuid("posted_by").notNull(),
  postedAt: timestamp("posted_at", tz).notNull().defaultNow(),
});

export const pharmacyPeriods = pgTable("pharmacy_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id"),
  month: date("month").notNull(),
  closedBy: uuid("closed_by").notNull(),
  approvedBy: uuid("approved_by").notNull(),
  approvalAttestationId: uuid("approval_attestation_id").notNull(),
  closedAt: timestamp("closed_at", tz).notNull().defaultNow(),
});

export const pharmacyPeriodSnapshots = pgTable("pharmacy_period_snapshots", {
  periodId: uuid("period_id").primaryKey(),
  hospitalId: uuid("hospital_id").notNull(),
  content: jsonb("content").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const pharmacyPeriodDifferenceReasons = pgTable("pharmacy_period_difference_reasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  locationId: uuid("location_id").notNull(),
  month: date("month").notNull(),
  productId: uuid("product_id").notNull(),
  kind: text("kind").$type<"difference" | "not_counted">().notNull(),
  reasonCode: text("reason_code"),
  unexplained: boolean("unexplained").notNull().default(false),
  note: text("note"),
  actorUserId: uuid("actor_user_id").notNull(),
  at: timestamp("at", tz).notNull().defaultNow(),
});
