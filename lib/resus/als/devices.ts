import type { ArrestSlice, Segment } from "@/lib/resus/als/timing";
import type { ArrestContext, ArrestProcedurePayload, ArrestState } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import { tMs } from "@/lib/resus/als/timing";
import { ETT_ACTION_CODES } from "@/lib/resus/closeout/level-of-care";
import {
  ETCO2_PE_HINT_BELOW_KPA,
  IV_FAILED_ATTEMPTS_FOR_IO,
} from "@/lib/resus/reference/als-catalog";
import { artefactFields } from "@/lib/resus/survey/vitals-bands";

/**
 * ALS engine — airway, access, capnography and the compressor. PURE.
 *
 * Catalog: ALS-AIR-01/03/04, ALS-ACC-01, ALS-ETC-01/02, ALS-RC-09, ALS-CPR-11.
 *
 * Airway and access are read from every arrest procedure recorded so far in the episode:
 * a tube or a line placed in an earlier arrest is still in place (the contract has no
 * removal event). The airway also counts a tube or SGA placed during the survey (a step
 * action in state `performed` — the same codes the level-of-care recommender reads).
 * ETCO₂ and the compressor are read from the current arrest only; an ETCO₂ value
 * annotated artefact leaves derivation (SV-VIT-16).
 * ETCO₂ "rising" is direction only (last > previous): no signed "sharp rise" number exists.
 */

type Proc = Partial<ArrestProcedurePayload>;
const procOf = (e: TimelineEvent): Proc | null =>
  e.kind === "procedure" && typeof e.payload.arrestProcedure === "string"
    ? (e.payload as Proc)
    : null;

const AIRWAY_RANK = { none: 0, bvm: 1, sga: 2, ett: 3 } as const;
type AirwayLevel = keyof typeof AIRWAY_RANK;
const AIRWAY_OF: Record<string, AirwayLevel> = {
  airway_bvm: "bvm",
  airway_sga: "sga",
  airway_ett: "ett",
};

export interface SurveyAction {
  code: string;
  state: string;
  /** When the latest state became `performed` (null when it is not performed). */
  performedAtMs: number | null;
}

/** Survey step actions (any step) folded by `payload.actionId`, latest state last. */
export function surveyActions(events: readonly TimelineEvent[]): SurveyAction[] {
  const byId = new Map<string, SurveyAction>();
  for (const e of events) {
    const { actionId, actionCode, state } = e.payload;
    if (typeof actionId !== "string" || typeof actionCode !== "string") continue;
    const s = typeof state === "string" ? state : "indicated";
    const held = byId.get(actionId);
    const performedAtMs =
      s !== "performed" ? null : held?.state === "performed" ? held.performedAtMs : tMs(e);
    byId.set(actionId, { code: actionCode, state: s, performedAtMs });
  }
  return [...byId.values()];
}

const SURVEY_AIRWAY: Record<string, AirwayLevel> = {
  ...Object.fromEntries(ETT_ACTION_CODES.map((c) => [c, "ett" as const])),
  a_plan_b_supraglottic: "sga",
};

/**
 * Highest airway (BVM < SGA < ETT, ALS-AIR-01) and the ETT trace (ALS-AIR-03). A survey tube
 * carries no trace answer, so the AIR-03 check still asks. `events` must be time-ordered.
 */
export function airwayState(events: readonly TimelineEvent[]): ArrestState["airway"] {
  let ettTrace: ArrestState["airway"]["ettTrace"] = null;
  const placed: AirwayLevel[] = ["none"];
  for (const e of events) {
    const p = procOf(e);
    const l = p?.arrestProcedure ? AIRWAY_OF[p.arrestProcedure] : undefined;
    if (!l) continue;
    placed.push(l);
    if (l === "ett") ettTrace = p?.ettTrace ?? null;
  }
  for (const a of surveyActions(events)) {
    const l = SURVEY_AIRWAY[a.code];
    if (l && a.state === "performed") placed.push(l);
  }
  const level = placed.reduce((hi, l) => (AIRWAY_RANK[l] > AIRWAY_RANK[hi] ? l : hi));
  // ALS-AIR-04: continuous compressions once an SGA or ETT is in.
  return { level, ettTrace, continuousCompressions: level === "sga" || level === "ett" };
}

/** IV / IO access and the IO prompt after 2 failed IV attempts (ALS-ACC-01). */
export function accessState(events: readonly TimelineEvent[]): ArrestState["access"] {
  let iv = false;
  let io = false;
  let ivFailedAttempts = 0;
  for (const e of events) {
    const kind = procOf(e)?.arrestProcedure;
    if (kind === "iv_access") iv = true;
    else if (kind === "io_access") io = true;
    else if (kind === "iv_attempt_failed") ivFailedAttempts += 1;
  }
  return {
    iv,
    io,
    ivFailedAttempts,
    promptIo: ivFailedAttempts >= IV_FAILED_ATTEMPTS_FOR_IO && !iv && !io,
  };
}

export interface Etco2Reading {
  eventId: string;
  value: number;
}

/**
 * ETCO₂ readings (kPa) from `vital` snapshots in this arrest, in order. A value annotated
 * artefact is skipped (SV-VIT-16); pass the episode's `artefactFields` when you have it.
 */
export function etco2Values(
  slice: ArrestSlice,
  artefacts: ReadonlySet<string> = artefactFields(slice.events),
): Etco2Reading[] {
  const out: Etco2Reading[] = [];
  for (const e of slice.events) {
    if (e.kind !== "vital" || artefacts.has(`${e.id}:etco2`)) continue;
    const v = (e.payload.snapshot as { etco2?: unknown } | undefined)?.etco2;
    if (typeof v === "number" && Number.isFinite(v)) out.push({ eventId: e.id, value: v });
  }
  return out;
}

/**
 * ETCO₂ trend (ALS-ETC-02) and the PE hint (ALS-RC-09). The engine can check only the tube;
 * adequate minute volume and good compressions have no field, so the hint says so.
 */
export function etco2State(
  readings: readonly Etco2Reading[],
  airway: ArrestState["airway"],
): ArrestState["etco2"] {
  const values = readings.map((r) => r.value);
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  return {
    last3: values.slice(-3),
    rising: last !== undefined && prev !== undefined && last > prev,
    lowPeHint:
      last !== undefined &&
      last < ETCO2_PE_HINT_BELOW_KPA &&
      airway.level === "ett" &&
      airway.ettTrace === "yes",
  };
}

/** Who is on the chest and for how long (ALS-CPR-11); the swap is due at the rhythm check. */
export function compressorState(
  slice: ArrestSlice,
  segs: readonly Segment[],
  ctx: ArrestContext,
  cycleStatus: ArrestState["cycle"]["status"],
  nowMs: number,
): ArrestState["compressor"] {
  const running = segs[segs.length - 1];
  const inArrest = !!running && running.endMs === null;
  let name = ctx.cprProvider?.name ?? null;
  let since = running?.startMs ?? null;
  for (const e of slice.events) {
    if (procOf(e)?.arrestProcedure !== "compressor_swap") continue;
    name = (e.payload.toName as string | null | undefined) ?? null;
    since = Math.max(since ?? 0, tMs(e));
  }
  return {
    name,
    onChestMs: inArrest && since !== null ? Math.max(0, nowMs - since) : null,
    swapDue: inArrest && (cycleStatus === "due" || cycleStatus === "overdue"),
  };
}
