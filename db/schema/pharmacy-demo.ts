import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

/* ─── 0250 pharmacy demo data (ADR 0450): loads and patients, in a hospital marked in lab_demo_hospitals ─── */
export const pharmacyDemoLoads = pgTable("pharmacy_demo_loads", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  startedBy: uuid("started_by").notNull(),
  startedAt: timestamp("started_at", tz).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", tz),
  scenario: text("scenario").notNull(),
  counts: jsonb("counts").notNull().default({}),
  notes: jsonb("notes").notNull().default({}),
  error: text("error"),
  /** 0260: set when the demo was removed from the hospital. */
  removedAt: timestamp("removed_at", tz),
});

export const pharmacyDemoPatients = pgTable(
  "pharmacy_demo_patients",
  {
    loadId: uuid("load_id").notNull(),
    hospitalId: uuid("hospital_id").notNull(),
    patientUserId: uuid("patient_user_id").notNull(),
    label: text("label").notNull(),
  },
  (t) => [primaryKey({ columns: [t.loadId, t.patientUserId] })],
);
