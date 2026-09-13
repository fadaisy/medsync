import "server-only";

import type { TakeRow } from "@/lib/patient/doses";
import { and, asc, desc, eq, gte, isNull, lt, lte, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { patientProfiles } from "@/db/schema/patient-profiles";
import {
  personalHealthLogs,
  selfMedications,
  selfMedicationTakes,
} from "@/db/schema/patient-self-tracking";
import { buildDayDoses } from "@/lib/patient/doses";

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
  READING_KINDS,
  SCHEDULE_PATTERN_LABEL,
  expectedDosesPerDay,
  formatReadingValue,
  formatReadingWhen,
  type NumericReadingKind,
  type ReadingKind,
} from "./self-tracking-constants";

/**
 * Today's tracking glance — used on the patient home.
 *
 * Returns the most recent reading (any kind), a count of the patient's
 * active medicines, today's confirmed takes, and today's dose slots.
 *
 * `todaySlots` is derived from exactly the rows `/patient/track/doses`
 * derives its timeline from — same fetchers, same `buildDayDoses` — so the
 * home screen and the timeline can never disagree about whether a dose is
 * still due. Telling someone on one screen that they missed a dose the
 * other screen shows as taken is a harm, not a cosmetic bug.
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
  todaySlots: {
    total: number;
    taken: number;
    next: { name: string; timeLabel: string } | null;
  };
}

export async function fetchTrackingGlance(patientUserId: string): Promise<TrackingGlance> {
  // Host-local on purpose: `buildDayDoses` re-derives its own host-local
  // midnight from this `day`, so the two must read one clock (the
  // patient's calendar, not a hospital's — see `lib/patient/doses.ts`).
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [latestReadingRows, medications, takes] = await Promise.all([
    db
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
      .limit(1),
    listMedicationsForDay(patientUserId, startOfDay),
    listTakesForDay(patientUserId, startOfDay),
  ]);

  const latestReadingRow = latestReadingRows[0];
  const today = buildDayDoses({ medications, takes, day: startOfDay, now: new Date() });

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
    // The day fetcher also returns paused medicines, which still belong on
    // the timeline; the home's "N active" line counts only the active ones.
    activeMedicationCount: medications.filter((m) => m.state === "active").length,
    takesToday: takes.length,
    todaySlots: {
      total: today.total,
      taken: today.taken,
      next: today.next ? { name: today.next.name, timeLabel: today.next.timeLabel } : null,
    },
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

/**
 * Every medicine that belongs to a given day — the input the dose timeline
 * and the home glance both derive from.
 *
 * "Belongs to the day" is deliberately wider than `state = 'active'`:
 * yesterday's list must still show the medicine the patient stopped this
 * morning, or a past day silently rewrites itself. A row qualifies when it
 * had started by the day (`started_on` null or on/before it) and had not
 * ended before it (still running, or ended on/after it). A row marked
 * `ended` with no `ended_on` is excluded from every day — we do not know
 * when it stopped, and guessing would put a medicine on a day the patient
 * may not have been taking it.
 *
 * Paused rows come back too, carrying their `state` so the caller can tell
 * the difference; the tint and the "Stopped" pill are the UI's business.
 */
export async function listMedicationsForDay(
  patientUserId: string,
  day: Date,
): Promise<MedicationRow[]> {
  const dayIso = isoDay(day);

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
      and(
        eq(selfMedications.patientUserId, patientUserId),
        or(ne(selfMedications.state, "ended"), gte(selfMedications.endedOn, dayIso)),
        or(isNull(selfMedications.startedOn), lte(selfMedications.startedOn, dayIso)),
      ),
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

/**
 * Confirmed takes belonging to a given local day, chronological.
 *
 * `scheduledFor` comes back with them because it is the exact slot a take
 * was recorded against — an unambiguous match that spares the derivation
 * from guessing which dose a take belongs to. It is null on every take
 * written before the slot redesign; `buildDayDoses` falls back to nearest
 * -slot matching for those.
 *
 * The day window is on `coalesce(scheduled_for, taken_at)`, not on
 * `taken_at`, and that is the whole point of the column. A 20:00 dose
 * swallowed at 00:20 carries `taken_at` on the following day: windowed on
 * the clock it disappears from the evening it belongs to (which then reads
 * "Missed" forever, with no way back to it) and lands on the next morning,
 * where the greedy pass gives it to 08:00 — a dose nobody has taken yet
 * showing "Taken". Windowed on the slot, it sits on the evening it was for.
 * A take with no slot is unchanged: coalesce falls through to `taken_at`.
 */
// ponytail: the coalesce keeps the `(patient_user_id, taken_at DESC)` index
// for the patient prefix and filters the rest. One patient's takes for one
// day is a handful of rows; an expression index is the upgrade path if a
// year of history ever gets queried at once.

/**
 * The `coalesce(scheduled_for, taken_at) ∈ [dayStart, dayEnd)` predicate.
 *
 * Exported so `tests/patient/takes-window.test.ts` can compile it and assert
 * the bounds bind as driver values. It is not test-only scaffolding: it is
 * the one place the day window is expressed.
 *
 * Both bounds go through `sql.param(value, column)` rather than being passed
 * to `gte`/`lt` directly, and that is load-bearing. Drizzle's `bindIfParam`
 * only wraps an operand in a `Param` when the LEFT side `isDriverValueEncoder`
 * — true for a Column, false for a raw `sql` fragment like this one. Compared
 * against a bare `Date` the encoder is never found, the `Date` reaches
 * postgres.js untouched and it throws `ERR_INVALID_ARG_TYPE` at runtime, which
 * nothing in typecheck can see. Naming the column as the encoder restores the
 * `.toISOString()` that a normal column comparison would have applied, and
 * `bindIfParam` passes an existing `Param` straight through.
 */
export function takesBelongToDay(dayStart: Date, dayEnd: Date) {
  const belongsTo = sql`coalesce(${selfMedicationTakes.scheduledFor}, ${selfMedicationTakes.takenAt})`;
  const bound = (at: Date) => sql.param(at, selfMedicationTakes.takenAt);
  return and(gte(belongsTo, bound(dayStart)), lt(belongsTo, bound(dayEnd)));
}

export async function listTakesForDay(patientUserId: string, dayStart: Date): Promise<TakeRow[]> {
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const rows = await db
    .select({
      medicationId: selfMedicationTakes.medicationId,
      takenAt: selfMedicationTakes.takenAt,
      scheduledFor: selfMedicationTakes.scheduledFor,
    })
    .from(selfMedicationTakes)
    .where(
      and(eq(selfMedicationTakes.patientUserId, patientUserId), takesBelongToDay(dayStart, dayEnd)),
    )
    .orderBy(asc(selfMedicationTakes.takenAt));

  return rows.map((r) => ({
    medicationId: r.medicationId,
    takenAtIso: r.takenAt.toISOString(),
    scheduledForIso: r.scheduledFor ? r.scheduledFor.toISOString() : null,
  }));
}

/** Local calendar day as `YYYY-MM-DD`, which is what a postgres `date` compares against. */
function isoDay(d: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
