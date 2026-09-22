import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Hospital / facility. Uganda MoH facility taxonomy for `level`.
 * Seeded with Mulago National Referral Hospital in Phase 0.11.
 */
export const hospitals = pgTable(
  "hospitals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    country: text("country").notNull().default("UG"),
    region: text("region"),
    district: text("district"),
    level: text("level").notNull(),
    /**
     * Tenant lifecycle state. Added in migration 0018 to support the
     * superadmin workspace's tenant-management surface. Drizzle sees
     * the value as text; the underlying type is `public.lifecycle_state`.
     */
    state: text("state").notNull().default("active"),
    /**
     * The number rendered as a `tel:` link beside "Go to the hospital's
     * emergency entrance" (ADR 0084 §3, migration 0053). Nullable with no
     * default and no backfill: until someone has dialled and verified a
     * number for this hospital, the emergency block shows the destination
     * alone. Entered by a superadmin during activation.
     */
    emergencyPhone: text("emergency_phone"),
    /**
     * Quiet hours (migration 0061, ADR 0090): minutes past local midnight,
     * Africa/Kampala; wraps midnight when start > end. DEFAULT 21:00–07:00.
     * The dispatcher HOLDS offers / confirmation requests / arrival windows
     * inside the window; receipts and session cancellations are exempt.
     */
    quietHoursStartMinutesLocal: smallint("quiet_hours_start_minutes_local")
      .notNull()
      .default(1260),
    quietHoursEndMinutesLocal: smallint("quiet_hours_end_minutes_local").notNull().default(420),
    /**
     * Migration 0066 / ADR 0098 — the Emergency Pathway's facility side.
     * `emergencyCapability` none|daytime|24h; `preAlertEnabled` needs a named
     * board owner per shift (`boardOwnerNote`) — a board nobody owns is a
     * board nobody watches (PRD §12). Directions and numbers are what the
     * status screen and the SMS fallback print. Coordinates are nullable and
     * empty today: "nearest" falls back to an honest ordering without them.
     */
    emergencyCapability: text("emergency_capability").notNull().default("none"),
    preAlertEnabled: boolean("pre_alert_enabled").notNull().default(false),
    boardOwnerNote: text("board_owner_note"),
    emergencyEntranceDirections: text("emergency_entrance_directions"),
    emergencySmsNumber: text("emergency_sms_number"),
    ambulanceNumber: text("ambulance_number"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "hospitals_level_check",
      sql`${t.level} IN ('national_referral', 'regional', 'district', 'hc4', 'hc3', 'private')`,
    ),
    // Migration 0053. The Ugandan E.164 shape PHONE_E164_UG enforces in the
    // signup actions, written with [+] / [0-9] so the same literal reads in
    // SQL and here without escaping. NULL passes — "no verified number" is
    // the correct default state, not a violation.
    check(
      "hospitals_emergency_phone_format",
      sql`${t.emergencyPhone} IS NULL OR ${t.emergencyPhone} ~ '^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$'`,
    ),
    check(
      "hospitals_quiet_hours_range",
      sql`${t.quietHoursStartMinutesLocal} BETWEEN 0 AND 1440 AND ${t.quietHoursEndMinutesLocal} BETWEEN 0 AND 1440`,
    ),
    // Migration 0066 / ADR 0098.
    check(
      "hospitals_emergency_capability_check",
      sql`${t.emergencyCapability} IN ('none','daytime','24h')`,
    ),
    check(
      "hospitals_pre_alert_has_owner",
      sql`${t.preAlertEnabled} = false OR ${t.boardOwnerNote} IS NOT NULL`,
    ),
    check(
      "hospitals_emergency_sms_format",
      sql`${t.emergencySmsNumber} IS NULL OR ${t.emergencySmsNumber} ~ '^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$'`,
    ),
    check(
      "hospitals_ambulance_format",
      sql`${t.ambulanceNumber} IS NULL OR ${t.ambulanceNumber} ~ '^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$|^0800[0-9]{6}$'`,
    ),
    check(
      "hospitals_coordinates_range",
      sql`(${t.latitude} IS NULL AND ${t.longitude} IS NULL) OR (${t.latitude} BETWEEN -2 AND 5 AND ${t.longitude} BETWEEN 29 AND 36)`,
    ),
    index("hospitals_country_district_idx").on(t.country, t.district),
  ],
);

export type Hospital = typeof hospitals.$inferSelect;
export type NewHospital = typeof hospitals.$inferInsert;
