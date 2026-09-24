import type { ArrestSlice } from "@/lib/resus/als/timing";
import type { ArrestState } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import { arrestSlice, arrestStatus, currentArrestSeq, tMs } from "@/lib/resus/als/timing";
import { ROSC_SUSTAINED_MS } from "@/lib/resus/reference/als-catalog";
import { reconstructTimeline } from "@/lib/resus/timeline";

/**
 * ALS engine — ROSC, sustained ROSC and the arrest sequence (catalog §8). PURE.
 *
 * ALS-ROSC-03: sustained = 20 consecutive minutes without compressions (the 20:00 timer).
 * ALS-ROSC-04: re-arrest before 20 min → the same arrest continues, counters intact.
 * ALS-ROSC-05: re-arrest after sustained ROSC → a new arrest record (sequence + 1).
 */

/** The ROSC block of ArrestState for one arrest. */
export function roscState(slice: ArrestSlice, nowMs: number): ArrestState["rosc"] {
  let atMs: number | null = null;
  let reArrestedAfterLatest = false;
  let intermittentCount = 0;
  let pendingRosc = false;
  for (const e of slice.events) {
    if (e.kind === "rosc") {
      atMs = tMs(e);
      reArrestedAfterLatest = false;
      pendingRosc = true;
    } else if (e.kind === "arrest_detected" && pendingRosc) {
      // A ROSC followed by a re-arrest of the same sequence is intermittent (ALS-ROSC-04).
      intermittentCount += 1;
      reArrestedAfterLatest = true;
      pendingRosc = false;
    } else if (e.kind === "resuscitation_stopped") {
      pendingRosc = false;
    }
  }
  const sustainedAtMs = atMs !== null && !reArrestedAfterLatest ? atMs + ROSC_SUSTAINED_MS : null;
  return {
    atMs,
    sustainedAtMs,
    sustained: sustainedAtMs !== null && nowMs >= sustainedAtMs,
    intermittentCount,
  };
}

/**
 * The arrest sequence a new declaration should carry, decided at the declaration's bedside
 * time (a queued or late write must not cross the 20-min line in transit). First arrest = 1.
 * Only a re-arrest after a SUSTAINED ROSC opens a new arrest (ALS-ROSC-05). Everything else
 * keeps the current sequence with its counters: a duplicate tap while in arrest, a re-arrest
 * < 20 min after ROSC (ALS-ROSC-04), and a resume after a stop ("Signs of life — resume",
 * ALS-DTH-05) — the stop was not a sustained ROSC, so it is the same arrest.
 */
export function arrestSeqForDeclaration(
  events: readonly TimelineEvent[],
  declaredAtMs: number,
): number {
  const tl = reconstructTimeline(events).filter((e) => tMs(e) <= declaredAtMs);
  const seq = currentArrestSeq(tl);
  if (seq === 0) return 1;
  const slice = arrestSlice(tl, seq)!;
  if (arrestStatus(slice) !== "rosc") return seq;
  return roscState(slice, declaredAtMs).sustained ? seq + 1 : seq;
}
