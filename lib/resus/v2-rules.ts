import type { EpisodePhase } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import { arrestSeqForDeclaration } from "@/lib/resus/als/rosc";
import { arrestSlice, arrestStatus, currentArrestSeq, tMs } from "@/lib/resus/als/timing";
import { projectPhase } from "@/lib/resus/closeout/lifecycle";
import { latestExposureAssessment } from "@/lib/resus/exposure";
import {
  ADRENALINE_DOSE_TEXT,
  ADULT_MIN_AGE_YEARS,
  AMIODARONE_FIRST_MG,
  AMIODARONE_SECOND_MG,
  HYPOTHERMIA_WITHHOLD_BELOW_C,
  LIDOCAINE_FIRST_MG,
  LIDOCAINE_SECOND_MG,
} from "@/lib/resus/reference/als-catalog";
import { reconstructTimeline } from "@/lib/resus/timeline";

/**
 * Resus Desk v2 — the write-side rules the server actions and the write core
 * apply (GATE A §1, §9; Law 6). PURE: no I/O, so each rule is tested directly.
 * Decision support: these are data-validity checks on what is being recorded,
 * never clinical blocks.
 */

/* ─── Bedside time (Law 6, GATE A §9) ────────────────────────────────── */

/** A bedside time this far from the server write is labelled with both times. */
export const LATE_ENTRY_MS = 60_000;
/** Device-clock tolerance: beyond it a bedside time ahead of the server (or before the start) is refused. */
export const BEDSIDE_SKEW_MS = 60_000;

/** Why a bedside time cannot be stored, or null. */
export function bedsideTimeProblem(
  atMs: number,
  nowMs: number,
  startedAtMs: number,
): string | null {
  if (!Number.isFinite(atMs)) return "Invalid bedside time.";
  if (atMs > nowMs + BEDSIDE_SKEW_MS)
    return "The bedside time is in the future — check this device's clock.";
  if (atMs < startedAtMs - BEDSIDE_SKEW_MS)
    return "The bedside time is before this resus started — check this device's clock.";
  return null;
}

/** Law 6: an entry whose bedside time differs from the write time (either way) is labelled. */
export const isLateEntry = (atMs: number, nowMs: number): boolean =>
  Math.abs(nowMs - atMs) > LATE_ENTRY_MS;

/* ─── Delta cursor ────────────────────────────────────────────────────── */

/**
 * created_at is the transaction START, not its commit: a transaction that began
 * earlier can commit after a later-stamped row. The delta re-reads this far back
 * (the client de-duplicates by id) so such a row is never skipped for good.
 */
export const DELTA_OVERLAP_MS = 30_000;

export const deltaFloor = (sinceIso: string): Date =>
  new Date(Date.parse(sinceIso) - DELTA_OVERLAP_MS);

/* ─── The header the timeline implies (GATE A §1, E4 / LC-09) ─────────── */

export interface DerivedHeader {
  phase: EpisodePhase;
  currentArrestSeq: number;
  /** First declaration of the first arrest (absent when no arrest is recorded). */
  arrestDetectedAt?: Date;
}

/** Phase, arrest sequence and first-arrest time from every row of the episode. */
export function deriveHeader(rows: readonly TimelineEvent[]): DerivedHeader {
  const tl = reconstructTimeline(rows);
  const first = tl.find((e) => e.kind === "arrest_detected");
  return {
    phase: projectPhase(rows),
    currentArrestSeq: currentArrestSeq(tl),
    ...(first ? { arrestDetectedAt: new Date(tMs(first)) } : {}),
  };
}

/* ─── Idempotent retry (GATE A §9) ───────────────────────────────────── */

export interface StoredRow {
  id: string;
  clientEventId?: string | null;
  createdAt: string;
}

/**
 * A batch whose PRIMARY (first) event already landed is a retry: every stored
 * row of the batch is returned and nothing is inserted — companion rows are
 * never written twice. Null when the batch is new.
 */
export function replayOf(
  batch: readonly { clientEventId: string }[],
  rows: readonly StoredRow[],
): { eventId: string; clientEventId: string; createdAt: string; duplicate: true }[] | null {
  const primary = batch[0];
  if (!primary || !rows.some((r) => r.clientEventId === primary.clientEventId)) return null;
  const out = [];
  for (const e of batch) {
    const r = rows.find((x) => x.clientEventId === e.clientEventId);
    if (r)
      out.push({
        eventId: r.id,
        clientEventId: e.clientEventId,
        createdAt: r.createdAt,
        duplicate: true as const,
      });
  }
  return out;
}

/** The checks were made on `expectRows` rows; a different count under the lock means the record moved. */
export const RECORD_MOVED =
  "The record changed on another device while saving — the entry is kept and will retry.";

/* ─── Arrest writes, judged at their bedside time (ALS-ROSC-04/05, LC-06) ─ */

/** The events recorded at or before the bedside time. */
export const recordedBy = (events: readonly TimelineEvent[], atMs: number): TimelineEvent[] =>
  events.filter((e) => tMs(e) <= atMs);

/**
 * ALS-ROSC-04/05: the sequence a declaration carries, judged as of ITS bedside
 * time — a re-arrest tapped 15 min after ROSC but delivered later (offline queue,
 * late entry) continues the same arrest.
 */
export const declarationSeqAt = (events: readonly TimelineEvent[], atMs: number): number =>
  arrestSeqForDeclaration(recordedBy(events, atMs), atMs);

/** The current arrest and its status as of the bedside time; null before any arrest. */
export function arrestAt(
  events: readonly TimelineEvent[],
  atMs: number,
): { seq: number; status: "in_arrest" | "rosc" | "stopped" } | null {
  const tl = reconstructTimeline(recordedBy(events, atMs));
  const seq = currentArrestSeq(tl);
  const slice = seq > 0 ? arrestSlice(tl, seq) : null;
  return slice ? { seq, status: arrestStatus(slice) } : null;
}

/** LC-06: stop resuscitation only while arrest `seq` is running. */
export function stopProblem(
  events: readonly TimelineEvent[],
  seq: number,
  atMs: number,
): string | null {
  const a = arrestAt(events, atMs);
  if (!a) return "No arrest is recorded — declare the arrest first.";
  if (a.seq !== seq) return `Arrest #${a.seq} is the current arrest — review it again.`;
  if (a.status === "rosc") return "ROSC is already recorded — declare re-arrest first.";
  if (a.status === "stopped") return "Resuscitation is already recorded as stopped.";
  return null;
}

/**
 * LC-06 / ALS-DTH-05: ROSC for the current arrest — while it runs, or after a stop
 * (signs of life during the observation). A second ROSC with no re-arrest is refused.
 */
export function roscProblem(
  events: readonly TimelineEvent[],
  seq: number,
  atMs: number,
): string | null {
  const a = arrestAt(events, atMs);
  if (!a) return "No arrest is recorded — declare the arrest first.";
  if (a.seq !== seq) return `Arrest #${a.seq} is the current arrest — record ROSC there.`;
  if (a.status === "rosc") return "ROSC is already recorded — declare re-arrest first.";
  return null;
}

/* ─── The arrest call (GATE A §9) ────────────────────────────────────── */

/** Where responders converge when the episode has no department on record. */
export const ARREST_CALL_FALLBACK_PLACE = "Resus";

/** The call goes to the PATIENT's department and names it — never the caller's affiliation. */
export function arrestCallTarget(header: {
  departmentId: string | null;
  departmentName: string | null;
}): { departmentId: string | null; placeLabel: string } {
  return {
    departmentId: header.departmentId,
    placeLabel: header.departmentName?.trim() || ARREST_CALL_FALLBACK_PLACE,
  };
}

/* ─── Fast-path arrest drugs (D4, ALS-DRG-05) — signed constants only (Law 3) ─ */

/** ALS-ADR-01/02: the adult dose in mg, read from the signed text ("1 mg IV"), as the console does. */
export const ADRENALINE_MG = Number.parseFloat(ADRENALINE_DOSE_TEXT);

export const FAST_PATH_DRUGS = {
  /** Every adrenaline dose is the same. */
  adrenaline: { drugId: "adrenaline_arrest_iv", doses: null },
  /** ALS-AA-01/02. */
  amiodarone: {
    drugId: "amiodarone_arrest_iv",
    doses: [AMIODARONE_FIRST_MG, AMIODARONE_SECOND_MG],
  },
  /** ALS-AA-03. */
  lidocaine: { drugId: "lidocaine_arrest_iv", doses: [LIDOCAINE_FIRST_MG, LIDOCAINE_SECOND_MG] },
} as const;
export type FastPathDrug = keyof typeof FAST_PATH_DRUGS;

/** The dose the next one-tap records in this arrest; null once the protocol doses are given. */
export function fastPathDoseMg(drug: FastPathDrug, givenThisArrest: number): number | null {
  const doses: readonly number[] | null = FAST_PATH_DRUGS[drug].doses;
  return doses === null ? ADRENALINE_MG : (doses[givenThisArrest] ?? null);
}

/**
 * D4: the fast path never records what the console holds back. Core < 30 °C (the
 * latest E core temperature — the console's input, tempBand "below_30"):
 * adrenaline is withheld (ALS-MOD-01), amiodarone is the loading dose only
 * (ALS-MOD-03) and lidocaine has no signed rule (ALS-AA-04). Null when clear.
 */
export function fastPathHoldReason(
  drug: FastPathDrug,
  events: readonly TimelineEvent[],
  givenThisArrest: number,
): string | null {
  const core = latestExposureAssessment(events)?.coreTempC ?? null;
  if (core === null || core >= HYPOTHERMIA_WITHHOLD_BELOW_C) return null;
  if (drug === "adrenaline") return "Adrenaline withheld — core < 30 °C";
  if (drug === "lidocaine" || givenThisArrest > 0) return "Antiarrhythmic delayed — hypothermia";
  return null;
}

/** ALS-MOD-16: a child (< 16 y) is dosed by weight through the dialog, never the fast path. */
export const isChild = (ageYears: number | null): boolean =>
  ageYears !== null && ageYears < ADULT_MIN_AGE_YEARS;

/* ─── The longitudinal vitals mirror (clinical_observations) ─────────── */

/** Snapshot field → observation kind + unit (as v1 mirrored them). */
const MIRROR: Record<string, { kind: string; unit: string }> = {
  hr: { kind: "hr", unit: "/min" },
  rr: { kind: "rr", unit: "/min" },
  spo2: { kind: "spo2", unit: "%" },
  systolicBp: { kind: "bp", unit: "mmHg" },
  diastolicBp: { kind: "bp", unit: "mmHg" },
  temperature: { kind: "temperature", unit: "°C" },
  glucose: { kind: "glucose", unit: "mmol/L" },
  gcs: { kind: "gcs", unit: "/15" },
  etco2: { kind: "etco2", unit: "kPa" },
  urineOutput: { kind: "urine_output", unit: "mL" },
};

export interface MirrorRow {
  hospitalId: string;
  patientUserId: string;
  recordedByUserId: string;
  observationKind: string;
  numericValue1: string;
  numericValue2: string | null;
  unit: string;
  /** The vital's bedside time — never the time the queue delivered it. */
  recordedAt: Date;
}

/** The clinical_observations rows for one vitals snapshot (BP: systolic / diastolic in one row). */
export function observationRows(
  snapshot: Record<string, unknown>,
  base: { hospitalId: string; patientUserId: string; recordedByUserId: string },
  recordedAt: Date,
): MirrorRow[] {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const rows: MirrorRow[] = [];
  for (const [field, m] of Object.entries(MIRROR)) {
    const v = num(snapshot[field]);
    if (field === "diastolicBp" || v === null) continue;
    const v2 = field === "systolicBp" ? num(snapshot.diastolicBp) : null;
    rows.push({
      ...base,
      observationKind: m.kind,
      numericValue1: String(v),
      numericValue2: v2 === null ? null : String(v2),
      unit: m.unit,
      recordedAt,
    });
  }
  return rows;
}

/** The mirrored kinds behind snapshot fields (an artefact mark or an undo retracts these). */
export const mirroredKinds = (fields: readonly string[]): string[] => [
  ...new Set(fields.flatMap((f) => (MIRROR[f] ? [MIRROR[f].kind] : []))),
];
