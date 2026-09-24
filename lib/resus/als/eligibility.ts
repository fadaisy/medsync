import type { TempBand } from "@/lib/resus/als/modifiers";
import type { ArrestSlice } from "@/lib/resus/als/timing";
import type { ArrestContext, ArrestState, Rhythm, RhythmCheckPayload } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import { tMs } from "@/lib/resus/als/timing";
import { RHYTHMS } from "@/lib/resus/model";
import {
  HYPOTHERMIA_SHOCKS_BEFORE_DELAY,
  REFRACTORY_VF_SHOCKS,
  STACK_MAX_SHOCKS,
} from "@/lib/resus/reference/als-catalog";

/**
 * ALS engine — rhythms, shocks and the drug-event readers. PURE.
 *
 * Catalog: ALS-RHY-01..03, ALS-SHK-02..05, ALS-NRG-01/02, ALS-MOD-02, ALS-MOD-16.
 * Drug timing (adrenaline, antiarrhythmic) lives in `drugs.ts`.
 */

export interface Prescribing {
  drugId?: string;
  drugKey?: string;
  amountMg?: number;
  route?: string;
}

/** The `prescribing` block of a `drug` event, or null. */
export function prescribingOf(e: TimelineEvent): Prescribing | null {
  if (e.kind !== "drug") return null;
  const p = e.payload.prescribing;
  return p && typeof p === "object" ? (p as Prescribing) : null;
}

/** A dose of this arrest drug: its catalog id, or its molecule given IV/IO. */
export function isArrestDose(e: TimelineEvent, drugId: string, drugKey: string): boolean {
  const p = prescribingOf(e);
  if (!p) return false;
  return p.drugId === drugId || (p.drugKey === drugKey && (p.route === "iv" || p.route === "io"));
}

/** Organised rhythm without a pulse is PEA (ALS-RHY-02). */
export function effectiveRhythm(p: Partial<RhythmCheckPayload>): Rhythm | null {
  if (!p.rhythm || !(RHYTHMS as readonly string[]).includes(p.rhythm)) return null;
  return p.rhythm === "organised" && p.pulse === false ? "pea" : p.rhythm;
}

export interface RhythmEntry {
  atMs: number;
  rhythm: Rhythm;
}

/** Rhythm checks of this arrest, in order (the first fills Utstein, ALS-RHY-03). */
export function rhythmHistory(slice: ArrestSlice): RhythmEntry[] {
  const out: RhythmEntry[] = [];
  for (const e of slice.events) {
    if (e.kind !== "rhythm_check") continue;
    const rhythm = effectiveRhythm(e.payload as Partial<RhythmCheckPayload>);
    if (rhythm) out.push({ atMs: tMs(e), rhythm });
  }
  return out;
}

export const isNonShockable = (r: Rhythm): boolean => r === "pea" || r === "asystole";

/**
 * Shocks grouped for counting (ALS-SHK-02/03): each shock is one, except that consecutive
 * stacked shocks (up to 3) count as ONE. Returns the time of each counted shock.
 */
export function shockGroups(slice: ArrestSlice): number[] {
  const groups: number[] = [];
  let stackRun = 0;
  for (const e of slice.events) {
    if (e.kind !== "shock") continue;
    const stacked = e.payload.stacked === true;
    if (stacked && stackRun > 0 && stackRun < STACK_MAX_SHOCKS) {
      stackRun += 1;
      continue;
    }
    groups.push(tMs(e));
    stackRun = stacked ? 1 : 0;
  }
  return groups;
}

/** Time of the last shock event of this arrest (stacked shocks included). */
export function lastShockAtMs(slice: ArrestSlice): number | null {
  const shocks = slice.events.filter((e) => e.kind === "shock");
  const last = shocks[shocks.length - 1];
  return last ? tMs(last) : null;
}

/** The shocks block of ArrestState. */
export function shocksState(
  slice: ArrestSlice,
  rhythms: readonly RhythmEntry[],
  ctx: ArrestContext,
  paediatric: boolean,
  band: TempBand,
): ArrestState["shocks"] {
  const groups = shockGroups(slice);
  const count = groups.length;
  // Consecutive = counted shocks since the last non-VF rhythm check or the last ROSC / stop
  // (ALS-SHK-04: refractory VF is CONTINUOUS; VF after a ROSC is recurrent). The total count
  // (energy, drugs) spans the whole arrest (ALS-ROSC-04).
  const lastNonVf = [...rhythms].reverse().find((r) => r.rhythm !== "vf_pvt");
  const lastBreak = [...slice.events]
    .reverse()
    .find((e) => e.kind === "rosc" || e.kind === "resuscitation_stopped");
  const runStart = Math.max(lastNonVf?.atMs ?? -Infinity, lastBreak ? tMs(lastBreak) : -Infinity);
  const consecutive = groups.filter((t) => t > runStart).length;
  const current = rhythms[rhythms.length - 1]?.rhythm ?? null;
  const seq = ctx.bayProfile?.energySequenceJ ?? null;
  let energy: ArrestState["shocks"]["energy"];
  if (paediatric)
    energy = { kind: "suppressed_child" }; // ALS-MOD-16
  else if (ctx.bayProfile && seq && seq.length > 0) {
    // ALS-NRG-01: the registered profile's sequence, the last step repeating.
    const joules = seq[Math.min(count, seq.length - 1)]!;
    energy = { kind: "profile", joules, profileLabel: ctx.bayProfile.label };
  } else energy = { kind: "highest" }; // ALS-NRG-02
  return {
    count,
    lastAtMs: lastShockAtMs(slice),
    consecutive,
    refractoryVf: consecutive >= REFRACTORY_VF_SHOCKS && current === "vf_pvt",
    energy,
    // ALS-MOD-02: core < 30 °C after 3 shocks — delay further shocks until core > 30 °C.
    delayed: band === "below_30" && count >= HYPOTHERMIA_SHOCKS_BEFORE_DELAY,
  };
}
