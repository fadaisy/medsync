import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Lab Phase 4 (migrations 0150–0153; GATED; docs/lab/phase-4/gate-a-proposal.md §3). Column for column with the
 * SQL, which is the source of truth (tests/emr-db/drizzle-parity.test.ts). Append-only triggers, guards and RLS
 * live in the migrations; nothing here carries a clinical number or a partner code.
 */
const tz = { withTimezone: true } as const;

/* ─── 0150 partners and designations ───────────────────────────────── */
export const labPartners = pgTable("lab_partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  contacts: jsonb("contacts").notNull().default([]),
  transport: jsonb("transport").notNull().default([]),
  resultsReturn: jsonb("results_return").notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
  updatedAt: timestamp("updated_at", tz),
});

export const hospitalDesignations = pgTable("hospital_designations", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  role: text("role").notNull(),
  userId: uuid("user_id").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  setBy: uuid("set_by").notNull(),
  setAt: timestamp("set_at", tz).notNull().defaultNow(),
});

/* ─── 0151 referrals and manifests ─────────────────────────────────── */
export const labReferrals = pgTable("lab_referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  number: text("number").notNull(),
  specimenId: uuid("specimen_id").notNull(),
  patientUserId: uuid("patient_user_id").notNull(),
  orderIds: uuid("order_ids").array().notNull(),
  partnerId: uuid("partner_id").notNull(),
  routine: boolean("routine").notNull(),
  externalIds: jsonb("external_ids").notNull().default({}),
  packing: jsonb("packing").notNull().default({}),
  partnerTestsConfigId: uuid("partner_tests_config_id"),
  consentRef: text("consent_ref"),
  informed: jsonb("informed"),
  recollectOf: uuid("recollect_of"),
  clientKey: text("client_key").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  state: text("state").notNull().default("draft"),
  stateAt: timestamp("state_at", tz).notNull().defaultNow(),
  cancelRequested: boolean("cancel_requested").notNull().default(false),
  sentAt: timestamp("sent_at", tz),
  completedAt: timestamp("completed_at", tz),
});

export const labReferralEvents = pgTable("lab_referral_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  referralId: uuid("referral_id").notNull(),
  kind: text("kind").notNull(),
  eventAt: timestamp("event_at", tz).notNull(),
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
  source: text("source").notNull(),
  actorUserId: uuid("actor_user_id"),
  document: text("document"),
  messageId: uuid("message_id"),
  reasonCode: text("reason_code"),
  note: text("note"),
  applied: boolean("applied").notNull(),
  recordedAt: timestamp("recorded_at", tz).notNull().defaultNow(),
});

export const labManifests = pgTable("lab_manifests", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  number: text("number").notNull(),
  partnerId: uuid("partner_id").notNull(),
  transport: text("transport").notNull(),
  packages: integer("packages"),
  state: text("state").notNull().default("open"),
  sealedBy: uuid("sealed_by"),
  sealedAt: timestamp("sealed_at", tz),
  handedTo: text("handed_to"),
  handedAt: timestamp("handed_at", tz),
  received: jsonb("received"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const labManifestItems = pgTable(
  "lab_manifest_items",
  {
    manifestId: uuid("manifest_id").notNull(),
    referralId: uuid("referral_id").notNull(),
    hospitalId: uuid("hospital_id").notNull(),
    position: integer("position").notNull(),
    addedBy: uuid("added_by").notNull(),
    addedAt: timestamp("added_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.manifestId, t.referralId] })],
);

export const labManifestPrints = pgTable("lab_manifest_prints", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  manifestId: uuid("manifest_id").notNull(),
  copy: boolean("copy").notNull(),
  printedBy: uuid("printed_by").notNull(),
  printedAt: timestamp("printed_at", tz).notNull().defaultNow(),
});

/* ─── 0152 results back ────────────────────────────────────────────── */
export const labResultAttachments = pgTable("lab_result_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  referralId: uuid("referral_id").notNull(),
  reportId: uuid("report_id"),
  path: text("path").notNull(),
  sha256: text("sha256").notNull(),
  bytes: integer("bytes").notNull(),
  mime: text("mime").notNull(),
  theirReport: text("their_report"),
  uploadedBy: uuid("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at", tz).notNull().defaultNow(),
});

export const labTranscriptionChecks = pgTable("lab_transcription_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  reportId: uuid("report_id").notNull(),
  kind: text("kind").notNull(),
  checkerUserId: uuid("checker_user_id"),
  scanConfirmed: boolean("scan_confirmed").notNull().default(false),
  note: text("note"),
  at: timestamp("at", tz).notNull().defaultNow(),
});

/* ─── 0153 the exchange ────────────────────────────────────────────── */
export const exchangeSenders = pgTable("exchange_senders", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  kind: text("kind").notNull(),
  partnerId: uuid("partner_id"),
  name: text("name").notNull(),
  state: text("state").notNull().default("pairing"),
  jwks: jsonb("jwks"),
  keyFingerprint: text("key_fingerprint"),
  scopes: text("scopes").array().notNull().default([]),
  zone: text("zone").notNull().default("Africa/Kampala"),
  pairingHash: text("pairing_hash"),
  pairingExpiresAt: timestamp("pairing_expires_at", tz),
  pairingFailures: integer("pairing_failures").notNull().default(0),
  enabledBy: uuid("enabled_by"),
  enabledAt: timestamp("enabled_at", tz),
  lastHeardAt: timestamp("last_heard_at", tz),
  revokedBy: uuid("revoked_by"),
  revokedAt: timestamp("revoked_at", tz),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

export const exchangeTokens = pgTable("exchange_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  senderId: uuid("sender_id").notNull(),
  scopes: text("scopes").array().notNull(),
  issuedAt: timestamp("issued_at", tz).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", tz).notNull(),
});

export const exchangeJti = pgTable("exchange_jti", {
  jti: text("jti").primaryKey(),
  senderId: uuid("sender_id").notNull(),
  expiresAt: timestamp("expires_at", tz).notNull(),
});

export const exchangeMessages = pgTable("exchange_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  senderId: uuid("sender_id"),
  direction: text("direction").notNull(),
  channel: text("channel").notNull(),
  contentType: text("content_type").notNull(),
  payloadCiphertext: text("payload_ciphertext"),
  payloadPath: text("payload_path"),
  sha256: text("sha256").notNull(),
  externalId: text("external_id"),
  about: text("about").notNull(),
  receivedAt: timestamp("received_at", tz).notNull().defaultNow(),
  senderTime: text("sender_time"),
  senderTimeUtc: timestamp("sender_time_utc", tz),
  zoneAssumed: text("zone_assumed"),
});

export const exchangeEvents = pgTable("exchange_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  hospitalId: uuid("hospital_id").notNull(),
  messageId: uuid("message_id").notNull(),
  state: text("state").notNull(),
  detail: jsonb("detail"),
  actorUserId: uuid("actor_user_id"),
  at: timestamp("at", tz).notNull().defaultNow(),
});

export const exchangeOutbox = pgTable("exchange_outbox", {
  messageId: uuid("message_id").primaryKey(),
  hospitalId: uuid("hospital_id").notNull(),
  senderId: uuid("sender_id").notNull(),
  state: text("state").notNull(),
  attempts: integer("attempts").notNull().default(0),
  nextAt: timestamp("next_at", tz),
  lastError: text("last_error"),
  claimedUntil: timestamp("claimed_until", tz),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

export const labMatchItems = pgTable("lab_match_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  messageId: uuid("message_id").notNull(),
  componentKey: text("component_key").notNull(),
  reason: text("reason"),
  candidateReferralId: uuid("candidate_referral_id"),
  candidateSpecimenId: uuid("candidate_specimen_id"),
  comparison: jsonb("comparison").notNull().default([]),
  state: text("state").notNull(),
  reportId: uuid("report_id"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", tz),
});

export const labMatchResolutions = pgTable("lab_match_resolutions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  itemId: uuid("item_id").notNull(),
  action: text("action").notNull(),
  method: text("method"),
  spokeTo: text("spoke_to"),
  secondUserId: uuid("second_user_id"),
  reason: text("reason").notNull(),
  actorUserId: uuid("actor_user_id").notNull(),
  at: timestamp("at", tz).notNull().defaultNow(),
});
