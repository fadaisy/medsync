import type { ChipLine } from "./checks";

import { checkChips } from "./checks";

/**
 * The pharmacy queue as a projection over stored prescriptions (Pharmacy Phase 0, ADR 0230;
 * PQ-1..PQ-13). Pure: the read (lib/pharmacy/read.ts) brings the lines written in the period at one
 * hospital, their co-sign state and their encounters; this decides rows, lanes, states and chips.
 * Nothing is dropped: filters choose rows, counts are taken before the lane filter (PQ-9), and
 * every placement appears exactly once under All (PQ-13).
 */

export type Lane = "window" | "ward" | "open";
export type RowState = "awaiting_cosign" | "prescribed" | "not_continued" | "cancelled";
export type LineState = RowState;

export interface QueueLine extends ChipLine {
  id: string;
  /** NULL for rows written before migration 0099: grouped by time (PQ-1). */
  placementId: string | null;
  hospitalId: string;
  encounterId: string | null;
  patientUserId: string;
  prescriberUserId: string;
  prescriberCadre: string | null;
  drugName: string;
  /** Stored state: active | administered | completed | cancelled. */
  state: string;
  /** The line's co-sign request state, if one was raised (clinical_cosign_requests). */
  cosign: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueEncounter {
  id: string;
  departmentId: string | null;
  departmentName: string | null;
  encounterType: string;
  disposition: string | null;
  /** An admissions row names this encounter as its source. */
  admitted: boolean;
}

export type SortKey = "written" | "from" | "state";

export interface QueueFilters {
  lane: Lane | "all";
  state: RowState | "all";
  /** A ward or clinic (the encounter's department) id, or "all". */
  from: string;
  sort: SortKey;
  /** Oldest first by default (PQ-10). */
  desc: boolean;
}

export interface QueueRow {
  /** The placement id, or the time-grouping key (PQ-1). Ids and times only: no PHI. */
  key: string;
  groupedByTime: boolean;
  patientUserId: string;
  encounterId: string | null;
  lineIds: string[];
  /** In the order written, as stored (Law 5). */
  medicines: string[];
  from: { departmentId: string | null; departmentName: string | null };
  prescriberCadre: string | null;
  lane: Lane;
  state: RowState;
  /** When every line is cancelled: the latest cancellation. */
  cancelledAt: Date | null;
  /** The latest state change on any line (only state changes after writing today; PQ-7). */
  changedAt: Date | null;
  checks: string[];
  writtenAt: Date;
}

export interface QueueResult {
  rows: QueueRow[];
  laneCounts: Record<Lane | "all", number>;
  stateCounts: Record<RowState | "all", number>;
  /** Every placement written in the period, before any filter: the footer's N. */
  total: number;
}

/** Dispositions that keep the patient in: today's codes and the legacy ones the CHECK still allows. */
const WARD_DISPOSITIONS = new Set(["admitted", "admit", "observe"]);

/**
 * PQ-3 (D-PH0-18). Ward: an inpatient encounter, an admission, or a visit closed admitted or kept
 * under observation. Window: a visit closed any other way (home, discharge, referred, transferred,
 * left, died). Open: the visit has not closed, so where the patient goes is not yet known.
 */
export function laneOf(encounter: QueueEncounter | undefined): Lane {
  if (!encounter) return "open";
  if (
    encounter.encounterType === "inpatient" ||
    encounter.admitted ||
    (encounter.disposition !== null && WARD_DISPOSITIONS.has(encounter.disposition))
  )
    return "ward";
  if (encounter.disposition) return "window";
  return "open";
}

export function lineState(line: Pick<QueueLine, "state" | "cosign">): LineState {
  if (line.state === "cancelled") return "cancelled";
  if (line.state === "completed") return "not_continued";
  if (line.cosign === "pending_review") return "awaiting_cosign";
  return "prescribed";
}

const STATE_RANK: Record<RowState, number> = {
  awaiting_cosign: 0,
  prescribed: 1,
  not_continued: 2,
  cancelled: 3,
};

/** PQ-5: the first-ranked line state; "cancelled" only when every line is cancelled. */
export function rowState(lines: readonly Pick<QueueLine, "state" | "cosign">[]): RowState {
  return lines
    .map(lineState)
    .reduce((best, s) => (STATE_RANK[s] < STATE_RANK[best] ? s : best), "cancelled");
}

/** PQ-1: the placement, or encounter + prescriber + the one transaction time a placement shares. */
export function placementKey(line: QueueLine): { key: string; groupedByTime: boolean } {
  if (line.placementId) return { key: line.placementId, groupedByTime: false };
  return {
    key: `t:${line.encounterId ?? "none"}:${line.prescriberUserId}:${line.createdAt.toISOString()}`,
    groupedByTime: true,
  };
}

const latest = (dates: Date[]) =>
  dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;

/** Group lines into rows, one per placement (PQ-1, PQ-6). Rows from another hospital never enter. */
export function toRows(
  lines: readonly QueueLine[],
  encounters: ReadonlyMap<string, QueueEncounter>,
  hospitalId: string,
): QueueRow[] {
  const groups = new Map<string, { groupedByTime: boolean; lines: QueueLine[] }>();
  for (const line of lines) {
    if (line.hospitalId !== hospitalId) continue; // PQ-11, whatever the read returned
    const { key, groupedByTime } = placementKey(line);
    const g = groups.get(key) ?? { groupedByTime, lines: [] };
    g.lines.push(line);
    groups.set(key, g);
  }
  return [...groups].map(([key, g]) => {
    const ordered = [...g.lines].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );
    const first = ordered[0]!;
    const encounter = first.encounterId ? encounters.get(first.encounterId) : undefined;
    const state = rowState(ordered);
    // ponytail: only `state` changes after a line is written today (Q6), so a line not "active" has
    // changed and its updated_at is when. If prescribing ever edits lines in place, read an event log.
    const changed = ordered.filter((l) => l.state !== "active" && l.state !== "administered");
    return {
      key,
      groupedByTime: g.groupedByTime,
      patientUserId: first.patientUserId,
      encounterId: first.encounterId,
      lineIds: ordered.map((l) => l.id),
      medicines: ordered.map((l) => l.drugName),
      from: {
        departmentId: encounter?.departmentId ?? null,
        departmentName: encounter?.departmentName ?? null,
      },
      prescriberCadre: first.prescriberCadre,
      lane: laneOf(encounter),
      state,
      cancelledAt: state === "cancelled" ? latest(ordered.map((l) => l.updatedAt)) : null,
      changedAt: latest(changed.map((l) => l.updatedAt)),
      checks: checkChips(ordered),
      writtenAt: first.createdAt,
    };
  });
}

const BY: Record<SortKey, (a: QueueRow, b: QueueRow) => number> = {
  written: (a, b) => a.writtenAt.getTime() - b.writtenAt.getTime(),
  from: (a, b) => (a.from.departmentName ?? "").localeCompare(b.from.departmentName ?? ""),
  state: (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state],
};

export function computeQueue(input: {
  lines: readonly QueueLine[];
  encounters: ReadonlyMap<string, QueueEncounter>;
  hospitalId: string;
  filters: QueueFilters;
}): QueueResult {
  const all = toRows(input.lines, input.encounters, input.hospitalId);
  const { lane, state, from, sort, desc } = input.filters;
  const base = from === "all" ? all : all.filter((r) => r.from.departmentId === from);

  const laneCounts: QueueResult["laneCounts"] = { window: 0, ward: 0, open: 0, all: base.length };
  for (const r of base) laneCounts[r.lane] += 1;

  const inLane = lane === "all" ? base : base.filter((r) => r.lane === lane);
  const stateCounts: QueueResult["stateCounts"] = {
    awaiting_cosign: 0,
    prescribed: 0,
    not_continued: 0,
    cancelled: 0,
    all: inLane.length,
  };
  for (const r of inLane) stateCounts[r.state] += 1;

  const shown = state === "all" ? inLane : inLane.filter((r) => r.state === state);
  // Stable: ties keep the oldest-first order, then the key (PQ-10).
  const rows = [...shown]
    .sort((a, b) => BY.written(a, b) || a.key.localeCompare(b.key))
    .sort((a, b) => (desc ? -1 : 1) * BY[sort](a, b));
  return { rows, laneCounts, stateCounts, total: all.length };
}

/** DP-4: a dispensing point's `serves` picks the lane its staff open on; none → All. */
export function defaultLane(serves: string | null | undefined): Lane | "all" {
  if (serves === "window") return "window";
  if (serves === "wards" || serves === "emergency") return "ward";
  return "all";
}
