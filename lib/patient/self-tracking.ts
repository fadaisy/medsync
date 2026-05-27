import "server-only";

import { and, asc, desc, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { patientProfiles } from "@/db/schema/patient-profiles";
import {
  personalHealthLogs,
  selfMedications,
  selfMedicationTakes,
} from "@/db/schema/patient-self-tracking";

/**
 * Server-side queries for patient self-tracking. Constants + types
 * that are also needed by client components (the log-reading form,
 * the mark-taken button) live in `./self-tracking-constants.ts` so
 * the Drizzle / postgres driver imported here stays out of the
 * browser bundle. Re-export them from here so existing server-side
 * consumers don't need to change their import paths.
 */

export {
  READING_KIND_LABEL,
  READING_KIND_HINT,
  READING_UNIT_OPTIONS,
  NUMERIC_READING_KINDS,
  SCHEDULE_PATTERN_LABEL,
  expectedDosesPerDay,
  formatReadingValue,
  type NumericReadingKind,
} from "./self-tracking-constants";

/**
 * Today's tracking glance — used on the patient home.
 *
 * Returns the most recent reading (any kind) + a count of today's
 * confirmed-taken doses across all active scheduled meds. The home
 * uses these to render a calm "you logged X earlier" line rather than
 * an empty state when the patient is engaged with self-tracking.
 */

export interface TrackingGlance {
  latestReading: {
    kind: string;
    recordedAtIso: string;
    numericValue1: string | null;
    numericValue2: string | null;
    unit: string | null;
    severity: number | null;
    note: string | null;
  } | null;
  activeMedicationCount: number;
  takesToday: number;
}

export async function fetchTrackingGlance(patientUserId: string): Promise<TrackingGlance> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [latestReadingRow] = await db
    .select({
      kind: personalHealthLogs.kind,
      recordedAt: personalHealthLogs.recordedAt,
      numericValue1: personalHealthLogs.numericValue1,
      numericValue2: personalHealthLogs.numericValue2,
      unit: personalHealthLogs.unit,
      severity: personalHealthLogs.severity,
      note: personalHealthLogs.note,
    })
    .from(personalHealthLogs)
    .where(
      and(
        eq(personalHealthLogs.patientUserId, patientUserId),
        eq(personalHealthLogs.state, "active"),
      ),
    )
    .orderBy(desc(personalHealthLogs.recordedAt))
    .limit(1);

  const activeMeds = await db
    .select({ id: selfMedications.id })
    .from(selfMedications)
    .where(
      and(eq(selfMedications.patientUserId, patientUserId), eq(selfMedications.state, "active")),
    );

  const takesTodayRows = await db
    .select({ id: selfMedicationTakes.id })
    .from(selfMedicationTakes)
    .where(
      and(
        eq(selfMedicationTakes.patientUserId, patientUserId),
        gte(selfMedicationTakes.takenAt, startOfDay),
      ),
    );

  return {
    latestReading: latestReadingRow
      ? {
          kind: latestReadingRow.kind,
          recordedAtIso: latestReadingRow.recordedAt.toISOString(),
          numericValue1: latestReadingRow.numericValue1,
          numericValue2: latestReadingRow.numericValue2,
          unit: latestReadingRow.unit,
          severity: latestReadingRow.severity,
          note: latestReadingRow.note,
        }
      : null,
    activeMedicationCount: activeMeds.length,
    takesToday: takesTodayRows.length,
  };
}

/**
 * Suggest reading kinds to default into the log sheet, derived from
 * the patient's known conditions if available. Falls back to a broad
 * default set.
 */
export async function suggestedReadingKinds(patientUserId: string): Promise<string[]> {
  const [profile] = await db
    .select({ knownConditions: patientProfiles.knownConditions })
    .from(patientProfiles)
    .where(eq(patientProfiles.id, patientUserId))
    .limit(1);

  const conditions = (profile?.knownConditions ?? []).map((c) => c.toLowerCase());
  const fromConditions = new Set<string>();
  for (const c of conditions) {
    if (c.includes("diabet")) fromConditions.add("glucose");
    if (c.includes("hyperten") || c.includes("blood pressure") || c.includes("bp")) {
      fromConditions.add("bp");
    }
    if (c.includes("obes") || c.includes("weight")) fromConditions.add("weight");
    if (c.includes("asthma") || c.includes("copd") || c.includes("lung")) {
      fromConditions.add("spo2");
    }
    if (c.includes("fever") || c.includes("malaria")) fromConditions.add("temperature");
  }
  if (fromConditions.size > 0) return Array.from(fromConditions);

  // Sensible defaults when no conditions are set.
  return ["glucose", "bp", "weight"];
}

/* ─── Track hub fetchers ─────────────────────────────────────────── */

export interface ReadingRow {
  id: string;
  kind: string;
  recordedAtIso: string;
  numericValue1: string | null;
  numericValue2: string | null;
  unit: string | null;
  severity: number | null;
  note: string | null;
}

export async function listRecentReadings(patientUserId: string, limit = 20): Promise<ReadingRow[]> {
  const rows = await db
    .select({
      id: personalHealthLogs.id,
      kind: personalHealthLogs.kind,
      recordedAt: personalHealthLogs.recordedAt,
      numericValue1: personalHealthLogs.numericValue1,
      numericValue2: personalHealthLogs.numericValue2,
      unit: personalHealthLogs.unit,
      severity: personalHealthLogs.severity,
      note: personalHealthLogs.note,
    })
    .from(personalHealthLogs)
    .where(
      and(
        eq(personalHealthLogs.patientUserId, patientUserId),
        eq(personalHealthLogs.state, "active"),
      ),
    )
    .orderBy(desc(personalHealthLogs.recordedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    recordedAtIso: r.recordedAt.toISOString(),
    numericValue1: r.numericValue1,
    numericValue2: r.numericValue2,
    unit: r.unit,
    severity: r.severity,
    note: r.note,
  }));
}

export interface MedicationRow {
  id: string;
  name: string;
  dose: string | null;
  instructions: string | null;
  schedulePattern: string;
  scheduleTimes: string[] | null;
  state: string;
  notes: string | null;
}

export async function listActiveMedications(patientUserId: string): Promise<MedicationRow[]> {
  const rows = await db
    .select({
      id: selfMedications.id,
      name: selfMedications.name,
      dose: selfMedications.dose,
      instructions: selfMedications.instructions,
      schedulePattern: selfMedications.schedulePattern,
      scheduleTimes: selfMedications.scheduleTimes,
      state: selfMedications.state,
      notes: selfMedications.notes,
    })
    .from(selfMedications)
    .where(
      and(eq(selfMedications.patientUserId, patientUserId), eq(selfMedications.state, "active")),
    )
    .orderBy(asc(selfMedications.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    dose: r.dose,
    instructions: r.instructions,
    schedulePattern: r.schedulePattern,
    scheduleTimes: r.scheduleTimes,
    state: r.state,
    notes: r.notes,
  }));
}

export async function listTakesToday(
  patientUserId: string,
): Promise<Array<{ medicationId: string; takenAtIso: string }>> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      medicationId: selfMedicationTakes.medicationId,
      takenAt: selfMedicationTakes.takenAt,
    })
    .from(selfMedicationTakes)
    .where(
      and(
        eq(selfMedicationTakes.patientUserId, patientUserId),
        gte(selfMedicationTakes.takenAt, startOfDay),
      ),
    )
    .orderBy(desc(selfMedicationTakes.takenAt));

  return rows.map((r) => ({ medicationId: r.medicationId, takenAtIso: r.takenAt.toISOString() }));
}
