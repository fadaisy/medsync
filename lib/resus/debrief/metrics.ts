import type { ArrestSlice, Segment } from "@/lib/resus/als/timing";
import type { ArrestState, CauseKey, CauseState } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import { airwayState, etco2Values } from "@/lib/resus/als/devices";
import { isAdrenalineDose } from "@/lib/resus/als/drugs";
import { arrestSlice, currentArrestSeq, inArrestSegments, tMs } from "@/lib/resus/als/timing";
import { CAUSE_KEYS, CAUSE_STATES } from "@/lib/resus/model";
import {
  ADRENALINE_OPEN_MS,
  ADRENALINE_OVERDUE_MS,
  CYCLE_OVERDUE_MS,
} from "@/lib/resus/reference/als-catalog";
import { reconstructTimeline } from "@/lib/resus/timeline";
import { arrestEventsSoFar } from "@/lib/resus/utstein/project";

/**
 * Data-driven debrief — pre-computed per-arrest performance metrics (closeout catalog §8,
 * CO-DBF-01..07; RCUK-ALS25 "data-driven and performance-focused"). PURE and deterministic.
 *
 * Times are measured from the arrest declaration (ALS-REC-04). `null` means "not computable"
 * (no such event, nothing to judge) — never 0 for unknown.
 *
 * CO-DBF-03 judges intervals against the standard 3–5 min window (ALS-ADR-03) only. The
 * hypothermic 6–10 min window (ALS-MOD-04), withheld adrenaline below 30 °C (ALS-MOD-01) and
 * a child (ALS-MOD-16, no numbers) are OUT OF SCOPE: such an arrest reads as non-adherent,
 * so the debrief must be read with the patient's temperature and age in view.
 */

export interface Ratio {
  n: number;
  of: number;
  /** n / of; null when there is nothing to judge (of = 0). */
  value: number | null;
}

export interface ArrestDebrief {
  arrestSeq: number;
  /** CO-DBF-01 — first shock − arrest (ms). */
  timeToFirstShockMs: number | null;
  /** CO-DBF-02 — first adrenaline − arrest (ms). */
  timeToFirstAdrenalineMs: number | null;
  /** CO-DBF-03 — dose-to-dose intervals inside 3:00–5:00 (ALS-ADR-03), within one CPR run. */
  adrenalineIntervalsInWindow: Ratio;
  /** CO-DBF-04 — CPR cycles closed within 2:15 (ALS-CPR-12). */
  cyclesOnTime: Ratio;
  /** CO-DBF-05 — first SGA / ETT placed in this arrest − arrest (ms). */
  timeToAdvancedAirwayMs: number | null;
  /** Advanced airway in place during this arrest (placed in it or an earlier one). */
  advancedAirway: "sga" | "ett" | null;
  /** ALS-AIR-03 answer for the ETT: sustained ETCO₂ trace confirmed? */
  ettTrace: ArrestState["airway"]["ettTrace"];
  /** ETCO₂ recorded, or a trace asked with a capnograph on ("yes" / "no"); false = "unavailable". */
  capnographyUsed: boolean | null;
  /** CO-DBF-06 — cause tiles with a recorded state other than `not_assessed`, of 8. */
  reversibleCausesAddressed: Ratio;
  /** CO-DBF-07 — compressor swaps per rhythm check (ALS-CPR-11: 1 = a swap at every check). */
  compressorSwapsPerCheck: Ratio;
}

export interface DebriefMetrics {
  /** One entry per declared arrest, in sequence order. */
  arrests: ArrestDebrief[];
}

const ratio = (n: number, of: number): Ratio => ({ n, of, value: of > 0 ? n / of : null });
const sinceArrest = (slice: ArrestSlice, e: TimelineEvent | undefined) =>
  e ? tMs(e) - slice.arrestAtMs : null;
const isProc = (e: TimelineEvent, ...kinds: string[]) =>
  e.kind === "procedure" && kinds.includes(e.payload.arrestProcedure as string);

/**
 * CO-DBF-03: intervals between consecutive doses given in the same CPR run. An interval that
 * spans an intermittent ROSC (ALS-ROSC-04) is not an ALS interval and is not judged.
 */
function adrenalineAdherence(slice: ArrestSlice, segs: readonly Segment[]): Ratio {
  const runOf = (t: number) => segs.findIndex((s) => t >= s.startMs && t <= (s.endMs ?? Infinity));
  const doses = slice.events.filter(isAdrenalineDose).map(tMs);
  let n = 0;
  let of = 0;
  for (let i = 1; i < doses.length; i++) {
    const [prev, at] = [doses[i - 1]!, doses[i]!];
    if (runOf(at) < 0 || runOf(at) !== runOf(prev)) continue;
    of += 1;
    if (at - prev >= ADRENALINE_OPEN_MS && at - prev <= ADRENALINE_OVERDUE_MS) n += 1;
  }
  return ratio(n, of);
}

/**
 * CO-DBF-04: each rhythm check closes a cycle anchored like the console's (run start, the last
 * check, or a shock / CPR restart after it — ALS-CPR-03). A cycle that ended without a check
 * (ROSC, stop) or is still running counts only once it is already past 2:15.
 */
function cycleAdherence(slice: ArrestSlice, segs: readonly Segment[], nowMs: number): Ratio {
  let n = 0;
  let of = 0;
  const judge = (ms: number) => {
    of += 1;
    if (ms <= CYCLE_OVERDUE_MS) n += 1;
  };
  for (const seg of segs) {
    const end = seg.endMs ?? nowMs;
    let anchor = seg.startMs;
    for (const e of slice.events) {
      const t = tMs(e);
      if (t < seg.startMs || t > end) continue;
      if (e.kind === "rhythm_check") {
        judge(t - anchor);
        anchor = t;
      } else if (e.kind === "shock" || e.kind === "cpr_started") anchor = t;
    }
    if (end - anchor > CYCLE_OVERDUE_MS) judge(end - anchor);
  }
  return ratio(n, of);
}

/** CO-DBF-06: the latest recorded state per tile, as the team left it by the end of this arrest. */
function causesAddressed(soFar: readonly TimelineEvent[]): Ratio {
  const states = new Map<CauseKey, CauseState>();
  for (const e of soFar) {
    const { decision, cause, state } = e.payload;
    if (e.kind !== "decision" || decision !== "reversible_cause") continue;
    if (CAUSE_KEYS.includes(cause as CauseKey) && CAUSE_STATES.includes(state as CauseState))
      states.set(cause as CauseKey, state as CauseState);
  }
  const addressed = [...states.values()].filter((s) => s !== "not_assessed").length;
  return ratio(addressed, CAUSE_KEYS.length);
}

function arrestDebrief(
  tl: readonly TimelineEvent[],
  slice: ArrestSlice,
  nowMs: number,
): ArrestDebrief {
  const segs = inArrestSegments(slice);
  const soFar = arrestEventsSoFar(tl, slice);
  const airway = airwayState(soFar);
  const trace = airway.ettTrace;
  const checks = slice.events.filter((e) => e.kind === "rhythm_check").length;
  const swaps = slice.events.filter((e) => isProc(e, "compressor_swap")).length;
  return {
    arrestSeq: slice.seq,
    timeToFirstShockMs: sinceArrest(
      slice,
      slice.events.find((e) => e.kind === "shock"),
    ),
    timeToFirstAdrenalineMs: sinceArrest(slice, slice.events.find(isAdrenalineDose)),
    adrenalineIntervalsInWindow: adrenalineAdherence(slice, segs),
    cyclesOnTime: cycleAdherence(slice, segs, nowMs),
    timeToAdvancedAirwayMs: sinceArrest(
      slice,
      slice.events.find((e) => isProc(e, "airway_sga", "airway_ett")),
    ),
    advancedAirway: airway.level === "sga" || airway.level === "ett" ? airway.level : null,
    ettTrace: trace,
    capnographyUsed:
      etco2Values(slice).length > 0 || trace === "yes" || trace === "no"
        ? true
        : trace === "unavailable"
          ? false
          : null,
    reversibleCausesAddressed: causesAddressed(soFar),
    compressorSwapsPerCheck: ratio(swaps, checks),
  };
}

/** The debrief metrics of every declared arrest in the episode (CO-DBF-01..07). */
export function debriefMetrics(events: readonly TimelineEvent[], nowMs: number): DebriefMetrics {
  const tl = reconstructTimeline(events);
  const arrests: ArrestDebrief[] = [];
  for (let seq = 1; seq <= currentArrestSeq(tl); seq++) {
    const slice = arrestSlice(tl, seq);
    if (slice) arrests.push(arrestDebrief(tl, slice, nowMs));
  }
  return { arrests };
}
