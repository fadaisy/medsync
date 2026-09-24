import type { ArrestSlice } from "@/lib/resus/als/timing";
import type { ArrestDetectedPayload, Rhythm } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import { airwayState } from "@/lib/resus/als/devices";
import { isAdrenalineDose } from "@/lib/resus/als/drugs";
import { rhythmHistory } from "@/lib/resus/als/eligibility";
import { arrestSlice, arrestStatus, seqOf, tMs } from "@/lib/resus/als/timing";
import { ROSC_SUSTAINED_MS } from "@/lib/resus/reference/als-catalog";
import { reconstructTimeline } from "@/lib/resus/timeline";

/**
 * Utstein IHCA core data — the per-arrest record projection (closeout catalog §7,
 * CO-UTS-01..09). PURE and deterministic; the server action snapshots the result into the
 * immutable `resus_arrest_records` row at close.
 *
 * Every field is read from the reconstructed timeline (superseded rows never count) through
 * the ALS engine's own readers, so the record and the console never disagree. `null` means
 * "not recorded / not yet determinable" — never a guessed value. The arrest time is the
 * declaration (ALS-REC-04); the minute intervals are measured from it.
 *
 * ⚠ UTS-IH19 could not be re-read (closeout catalog §7): verify against the paper before
 * data are exported.
 */

export interface UtsteinRecord {
  arrestSeq: number;
  /** CO-UTS-01 — recorded after CPR (ALS-REC-09); null = unknown. */
  monitored: boolean | null;
  witnessed: boolean | null;
  /** CO-UTS-02 — recorded collapse time; defaults to the declaration (ALS-REC-09). */
  collapseAtIso: string;
  /** The declaration (ALS-REC-04). */
  arrestAtIso: string;
  /** CO-UTS-02 — CPR before declaration if recorded, else the first `cpr_started`. */
  cprStartedAtIso: string;
  /** CO-UTS-03 — the first rhythm check (ALS-RHY-03). */
  firstRhythm: Rhythm | null;
  /** CO-UTS-04 — true when a shock or pads are recorded; null = not recorded. */
  defibrillatorApplied: true | null;
  /** CO-UTS-04 — shocks delivered (each shock of a stack counts here). */
  shocksGiven: number;
  firstShockAtIso: string | null;
  firstShockMinFromArrest: number | null;
  /** CO-UTS-05 */
  firstAdrenalineAtIso: string | null;
  firstAdrenalineMinFromArrest: number | null;
  /** CO-UTS-06 — highest airway (BVM < SGA < ETT, ALS-AIR-01); null = none recorded. */
  airwayHighest: "bvm" | "sga" | "ett" | null;
  /** CO-UTS-07 — no ECPR event exists in the contract (capability off, ALS-DEV-01). */
  ecpr: boolean | null;
  /** CO-UTS-08 */
  anyRosc: boolean;
  /** 20 consecutive minutes (ALS-ROSC-03); null while a ROSC is under 20 min old. */
  sustainedRosc: boolean | null;
  /** ALS-ROSC-06: start of the sustained ROSC, or the stop. */
  cprStoppedAtIso: string | null;
  cprStoppedReason: "survived_event" | "died" | null;
  /** CO-UTS-09 — a treatment-limitation decision recorded before this arrest. */
  priorTreatmentLimitation: boolean;
}

const iso = (ms: number) => new Date(ms).toISOString();
const minutes = (atMs: number | null, fromMs: number) =>
  atMs === null ? null : (atMs - fromMs) / 60_000;

/**
 * The events of this arrest and every earlier one (a tube placed in an earlier arrest is still
 * in place — the engine's airway reading, `devices.ts`).
 */
export function arrestEventsSoFar(tl: readonly TimelineEvent[], slice: ArrestSlice) {
  return tl.filter((e) => {
    const s = seqOf(e);
    return s !== null ? s <= slice.seq : tMs(e) < slice.windowEndMs;
  });
}

/**
 * The latest recorded value of each Utstein field across this arrest's declarations. A
 * re-arrest (ALS-ROSC-04) writes a fresh declaration with the fields unset, so taking the whole
 * latest payload would erase details recorded earlier.
 */
function declarationDetails(slice: ArrestSlice) {
  const out = {
    witnessed: null as boolean | null,
    monitored: null as boolean | null,
    collapseAtIso: null as string | null,
    cprBeforeDeclarationAtIso: null as string | null,
  };
  for (const e of slice.events) {
    if (e.kind !== "arrest_detected") continue;
    const p = e.payload as Partial<ArrestDetectedPayload>;
    if (typeof p.witnessed === "boolean") out.witnessed = p.witnessed;
    if (typeof p.monitored === "boolean") out.monitored = p.monitored;
    if (typeof p.collapseAtIso === "string") out.collapseAtIso = p.collapseAtIso;
    if (typeof p.cprBeforeDeclarationAtIso === "string")
      out.cprBeforeDeclarationAtIso = p.cprBeforeDeclarationAtIso;
  }
  return out;
}

interface RoscPeriod {
  startMs: number;
  /** The re-arrest / stop that ended it; null while still in ROSC. */
  endMs: number | null;
}

/** Each ROSC of this arrest until the next re-arrest or stop mark (ALS-ROSC-03/04). */
function roscPeriods(slice: ArrestSlice): RoscPeriod[] {
  const out: RoscPeriod[] = [];
  let open: RoscPeriod | null = null;
  for (const e of slice.events) {
    if (e.kind === "rosc" && !open) {
      open = { startMs: tMs(e), endMs: null };
      out.push(open);
    } else if (open && (e.kind === "arrest_detected" || e.kind === "resuscitation_stopped")) {
      open.endMs = tMs(e);
      open = null;
    }
  }
  return out;
}

/** CO-UTS-08 / ALS-ROSC-03/06: sustained ROSC, time and reason CPR stopped. */
function roscOutcome(slice: ArrestSlice, nowMs: number) {
  const periods = roscPeriods(slice);
  // An open ROSC runs until now, or until the next arrest opened (ALS-ROSC-05).
  const openEnd = Math.min(nowMs, slice.windowEndMs);
  const sustained = periods.find((p) => (p.endMs ?? openEnd) - p.startMs >= ROSC_SUSTAINED_MS);
  const last = periods[periods.length - 1];
  const pending = !sustained && last?.endMs === null && slice.windowEndMs === Infinity;
  const stopEvent = [...slice.events].reverse().find((e) => e.kind === "resuscitation_stopped");
  const died =
    arrestStatus(slice) === "stopped" || slice.events.some((e) => e.kind === "death_confirmed");
  const stopped = sustained
    ? { atMs: sustained.startMs, reason: "survived_event" as const }
    : died && !pending
      ? { atMs: stopEvent ? tMs(stopEvent) : null, reason: "died" as const }
      : { atMs: null, reason: null };
  return {
    anyRosc: periods.length > 0,
    sustainedRosc: sustained ? true : pending ? null : false,
    cprStoppedAtIso: stopped.atMs === null ? null : iso(stopped.atMs),
    cprStoppedReason: stopped.reason,
  };
}

/**
 * The Utstein record of arrest `arrestSeq` (CO-UTS-01..09). Throws a RangeError when that
 * arrest was never declared in this timeline.
 */
export function projectArrestRecord(
  events: readonly TimelineEvent[],
  arrestSeq: number,
  nowMs: number,
): UtsteinRecord {
  const tl = reconstructTimeline(events);
  const slice = arrestSlice(tl, arrestSeq);
  if (!slice) throw new RangeError(`Arrest ${arrestSeq} is not declared in this timeline`);
  const d = declarationDetails(slice);
  const arrestAtIso = iso(slice.arrestAtMs);
  const shocks = slice.events.filter((e) => e.kind === "shock");
  const firstShockMs = shocks.length ? tMs(shocks[0]!) : null;
  const firstDose = slice.events.find(isAdrenalineDose);
  const firstAdrenalineMs = firstDose ? tMs(firstDose) : null;
  const padsOn = slice.events.some(
    (e) => e.kind === "procedure" && e.payload.arrestProcedure === "pads_antero_posterior",
  );
  const airway = airwayState(arrestEventsSoFar(tl, slice)).level;
  return {
    arrestSeq,
    monitored: d.monitored,
    witnessed: d.witnessed,
    collapseAtIso: d.collapseAtIso ?? arrestAtIso,
    arrestAtIso,
    cprStartedAtIso: d.cprBeforeDeclarationAtIso ?? iso(slice.cprStartMs),
    firstRhythm: rhythmHistory(slice)[0]?.rhythm ?? null,
    defibrillatorApplied: shocks.length > 0 || padsOn ? true : null,
    shocksGiven: shocks.length,
    firstShockAtIso: firstShockMs === null ? null : iso(firstShockMs),
    firstShockMinFromArrest: minutes(firstShockMs, slice.arrestAtMs),
    firstAdrenalineAtIso: firstAdrenalineMs === null ? null : iso(firstAdrenalineMs),
    firstAdrenalineMinFromArrest: minutes(firstAdrenalineMs, slice.arrestAtMs),
    airwayHighest: airway === "none" ? null : airway,
    ecpr: null,
    ...roscOutcome(slice, nowMs),
    priorTreatmentLimitation: tl.some(
      (e) =>
        e.kind === "decision" &&
        e.payload.decision === "treatment_limitation" &&
        tMs(e) < slice.arrestAtMs,
    ),
  };
}
