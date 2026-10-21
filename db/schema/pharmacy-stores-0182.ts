import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Pharmacy Phase 2, migration 0182 (GATED): loan closures, and the location columns on drills and briefings
 * (5.3 loans, 5.12). The SQL is the source of truth. Mirrors carry columns only; the drill and briefing columns
 * are on their canonical mirrors (lab-safety.ts, pharmacy-dispensing.ts) and re-exported here by the Store's names.
 */
const tz = { withTimezone: true } as const;

export const pharmacyLoanClosures = pgTable("pharmacy_loan_closures", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalId: uuid("hospital_id").notNull(),
  loanMovementId: uuid("loan_movement_id").notNull(),
  reason: text("reason").notNull(),
  actorUserId: uuid("actor_user_id").notNull(),
  closedAt: timestamp("closed_at", tz).notNull().defaultNow(),
});

/** 0182's columns live on the canonical mirrors; these names stay for the Store code that reads them. */
export { downtimeDrills as downtimeLocationDrills } from "./lab-safety";
export { pharmacyBriefings as pharmacyLocationBriefings } from "./pharmacy-dispensing";
