import "server-only";

import type { Today } from "./today";
import type { LogKind, LogRow } from "@patient-core/log";
import type { MedRow, TakeRec } from "@patient-core/medicines";
import { readingsFrom, whenWords } from "@patient-core/log";
import { readingValueText } from "@patient-core/readings";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  personalHealthLogs,
  selfMedications,
  selfMedicationTakes,
} from "@/db/schema/patient-self-tracking";
import { today } from "./today";

export type { DayDose, Today } from "./today";
export { today } from "./today";

/**
 * The patient's own day, read on the server the way the phone reads it (`mobile/src/data/health-log.ts`,
 * `medicines.ts`): the log rows, the medicines and the takes, filtered to the patient as the old pages do
 * (`lib/patient/self-tracking.ts`). The derivations are `@patient-core`'s, never re-written here.
 */

const num = (v: string | null): number | null => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The log, newest first, from `days` back. ponytail: one bounded read; the phone's ceiling (3000 rows). */
export async function loadLog(userId: string, days: number): Promise<LogRow[]> {
  const rows = await db
    .select({
      id: personalHealthLogs.id,
      kind: personalHealthLogs.kind,
      recordedAt: personalHealthLogs.recordedAt,
      v1: personalHealthLogs.numericValue1,
      v2: personalHealthLogs.numericValue2,
      unit: personalHealthLogs.unit,
      note: personalHealthLogs.note,
    })
    .from(personalHealthLogs)
    .where(
      and(
        eq(personalHealthLogs.patientUserId, userId),
        eq(personalHealthLogs.state, "active"),
        gte(personalHealthLogs.recordedAt, new Date(Date.now() - days * 86_400_000)),
      ),
    )
    .orderBy(desc(personalHealthLogs.recordedAt))
    .limit(3000);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as LogKind,
    recordedAt: r.recordedAt.toISOString(),
    v1: num(r.v1),
    v2: num(r.v2),
    unit: r.unit,
    note: r.note,
  }));
}

/** Active and paused medicines, and eight days of takes (the week plus last night's late doses). */
export async function loadMedicines(userId: string): Promise<{ meds: MedRow[]; takes: TakeRec[] }> {
  const since = new Date();
  since.setDate(since.getDate() - 8);
  const [meds, takes] = await Promise.all([
    db
      .select({
        id: selfMedications.id,
        name: selfMedications.name,
        instructions: selfMedications.instructions,
        schedulePattern: selfMedications.schedulePattern,
        scheduleTimes: selfMedications.scheduleTimes,
        state: selfMedications.state,
        createdAt: selfMedications.createdAt,
      })
      .from(selfMedications)
      .where(
        and(
          eq(selfMedications.patientUserId, userId),
          inArray(selfMedications.state, ["active", "paused"]),
        ),
      )
      .orderBy(asc(selfMedications.createdAt)),
    db
      .select({
        id: selfMedicationTakes.id,
        medicationId: selfMedicationTakes.medicationId,
        takenAt: selfMedicationTakes.takenAt,
        scheduledFor: selfMedicationTakes.scheduledFor,
      })
      .from(selfMedicationTakes)
      .where(
        and(eq(selfMedicationTakes.patientUserId, userId), gte(selfMedicationTakes.takenAt, since)),
      ),
  ]);
  return {
    // The dose column is never read (law L5).
    meds: meds.map((m) => ({ ...m, dose: null, createdAt: m.createdAt.toISOString() })),
    takes: takes.map((t) => ({
      id: t.id,
      medicationId: t.medicationId,
      takenAtIso: t.takenAt.toISOString(),
      scheduledForIso: t.scheduledFor ? t.scheduledFor.toISOString() : null,
    })),
  };
}

/** What the plus needs on every page: today's doses and the last reading's line. */
export interface AddDialogDay {
  today: Today;
  lastReading: string | null;
}

export async function loadAddDialogDay(userId: string, now = new Date()): Promise<AddDialogDay> {
  const [{ meds, takes }, log] = await Promise.all([
    loadMedicines(userId),
    loadLatestReadings(userId),
  ]);
  const latest = readingsFrom(log)[0];
  return {
    today: today(meds, takes, now),
    lastReading: latest ? `${readingValueText(latest.input)} · ${whenWords(latest.at, now)}` : null,
  };
}

/** The newest few reading rows only: the plus shows one line. */
async function loadLatestReadings(userId: string): Promise<LogRow[]> {
  const rows = await db
    .select({
      id: personalHealthLogs.id,
      kind: personalHealthLogs.kind,
      recordedAt: personalHealthLogs.recordedAt,
      v1: personalHealthLogs.numericValue1,
      v2: personalHealthLogs.numericValue2,
      unit: personalHealthLogs.unit,
      note: personalHealthLogs.note,
    })
    .from(personalHealthLogs)
    .where(
      and(
        eq(personalHealthLogs.patientUserId, userId),
        eq(personalHealthLogs.state, "active"),
        inArray(personalHealthLogs.kind, ["bp", "glucose", "weight", "pulse"]),
      ),
    )
    .orderBy(desc(personalHealthLogs.recordedAt))
    .limit(1);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as LogKind,
    recordedAt: r.recordedAt.toISOString(),
    v1: num(r.v1),
    v2: num(r.v2),
    unit: r.unit,
    note: r.note,
  }));
}
