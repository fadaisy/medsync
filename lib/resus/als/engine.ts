import type { TempBand } from "@/lib/resus/als/modifiers";
import type {
  ArrestContext,
  ArrestPrompt,
  ArrestState,
  RhythmCheckPayload,
} from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import {
  accessState,
  airwayState,
  compressorState,
  etco2State,
  etco2Values,
} from "@/lib/resus/als/devices";
import {
  adrenalineState,
  anaphylaxisAdrenalineText,
  antiarrhythmicState,
} from "@/lib/resus/als/drugs";
import {
  prescribingOf,
  rhythmHistory,
  shockGroups,
  shocksState,
} from "@/lib/resus/als/eligibility";
import { activeModifiers, isPaediatric, peLysisAtMs, tempBand } from "@/lib/resus/als/modifiers";
import { causeTiles } from "@/lib/resus/als/reversible-causes";
import { roscState } from "@/lib/resus/als/rosc";
import {
  arrestSlice,
  arrestStatus,
  cprElapsedMs,
  currentArrestSeq,
  cycleState,
  inArrestSegments,
  tMs,
} from "@/lib/resus/als/timing";
import {
  ETCO2_PE_HINT_BELOW_KPA,
  PE_LYSIS_CPR_MAX_MIN,
  PE_LYSIS_CPR_MIN_MIN,
} from "@/lib/resus/reference/als-catalog";
import { artefactFields } from "@/lib/resus/survey/vitals-bands";
import { reconstructTimeline } from "@/lib/resus/timeline";

export { arrestSeqForDeclaration } from "@/lib/resus/als/rosc";

/**
 * ALS arrest engine — `computeArrestState` (GATE A §7). PURE and deterministic: the same
 * timeline, clock and context always give the same state. Decision support only — it says
 * what is due; it never orders, administers, blocks or decides (catalog posture).
 *
 * Every rule comes from docs/clinical/resus-als-clinical-catalog.md and carries its rule ID;
 * every number is imported from `lib/resus/reference/als-catalog.ts`. The current arrest is
 * the highest declared sequence; per-arrest counters restart with a new sequence
 * (ALS-ROSC-05) while `episodeTotalsMg` spans the whole episode. A child (< 16) gets clocks
 * and logging only — no dose, no energy (ALS-MOD-16). Arrest recognition itself stays the
 * v1 seam (`lib/resus/arrest.ts` → `detectArrest`, ALS-REC-01/02).
 */

/** Episode-wide drug totals (mg) by drug key, for dose-safety checks (ALS-ROSC-05). */
export function episodeTotalsMg(tl: readonly TimelineEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of tl) {
    const p = prescribingOf(e);
    if (p?.drugKey && typeof p.amountMg === "number") {
      out[p.drugKey] = (out[p.drugKey] ?? 0) + p.amountMg;
    }
  }
  return out;
}

export function computeArrestState(
  events: readonly TimelineEvent[],
  nowMs: number,
  ctx: ArrestContext,
): ArrestState {
  const tl = reconstructTimeline(events);
  const paediatric = isPaediatric(ctx);
  const band = tempBand(ctx);
  const seq = currentArrestSeq(tl);
  const declared = seq > 0 ? arrestSlice(tl, seq) : null;
  const slice = declared ?? {
    seq: 0,
    arrestAtMs: nowMs,
    cprStartMs: nowMs,
    windowEndMs: Infinity,
    events: [],
  };
  const status = declared ? arrestStatus(slice) : "none";
  const inArrest = status === "in_arrest";
  const segs = inArrestSegments(slice);
  const cycle = cycleState(slice, segs, nowMs);
  const rhythms = rhythmHistory(slice);
  const shockTimes = shockGroups(slice);
  const drugInputs = { slice, inArrest, rhythms, shockTimes, ctx, paediatric, band, nowMs };
  const airway = airwayState(tl);
  const readings = etco2Values(slice, artefactFields(tl));
  const etco2 = etco2State(readings, airway);
  const lastEtco2 = readings[readings.length - 1];
  // ALS-MOD-16 / Law 7: the RC-09 threshold is an adult number — a child's tile never shows it.
  const causes = causeTiles(
    tl,
    ctx,
    !paediatric && etco2.lowPeHint && lastEtco2
      ? {
          eventId: lastEtco2.eventId,
          label: `ETCO₂ ${lastEtco2.value} kPa (< ${ETCO2_PE_HINT_BELOW_KPA}) with a confirmed tube — a PE hint only with adequate minute volume and good compressions; not a diagnosis`,
        }
      : null,
  );
  const lysisAt = peLysisAtMs(tl);
  const rosc = roscState(slice, nowMs);
  const endMs =
    status === "stopped"
      ? tMs([...slice.events].reverse().find((e) => e.kind === "resuscitation_stopped")!)
      : status === "rosc"
        ? (rosc.atMs ?? nowMs)
        : nowMs;

  const state: ArrestState = {
    arrestSeq: seq,
    status,
    paediatric,
    arrestAtMs: declared ? slice.arrestAtMs : null,
    cprStartMs: declared ? slice.cprStartMs : null,
    arrestElapsedMs: declared ? Math.max(0, endMs - slice.arrestAtMs) : 0,
    cprElapsedMs: cprElapsedMs(segs, nowMs),
    cycle,
    rhythms,
    firstRhythm: rhythms[0]?.rhythm ?? null,
    currentRhythm: rhythms[rhythms.length - 1]?.rhythm ?? null,
    shocks: shocksState(slice, rhythms, ctx, paediatric, band),
    adrenaline: adrenalineState(drugInputs),
    antiarrhythmic: antiarrhythmicState(drugInputs),
    airway,
    access: accessState(tl),
    etco2,
    modifiers: activeModifiers(ctx, causes, lysisAt),
    causes,
    prompts: [],
    rosc,
    compressor: compressorState(slice, segs, ctx, cycle.status, nowMs),
    episodeTotalsMg: episodeTotalsMg(tl),
  };
  const lastCheck = [...slice.events].reverse().find((e) => e.kind === "rhythm_check");
  const organisedPulseUnknown =
    !!lastCheck &&
    (lastCheck.payload as Partial<RhythmCheckPayload>).rhythm === "organised" &&
    (lastCheck.payload as Partial<RhythmCheckPayload>).pulse == null;
  state.prompts = buildPrompts(state, ctx, band, organisedPulseUnknown, lysisAt, nowMs);
  return state;
}

const RANK: Record<ArrestPrompt["severity"], number> = { overdue: 0, due: 1, info: 2 };

/** The console prompts, most urgent first (overdue > due > info), each with its rule ID. */
function buildPrompts(
  s: ArrestState,
  ctx: ArrestContext,
  band: TempBand,
  organisedPulseUnknown: boolean,
  lysisAtMs: number | null,
  nowMs: number,
): ArrestPrompt[] {
  const out: ArrestPrompt[] = [];
  const add = (id: string, ruleId: string, text: string, severity: ArrestPrompt["severity"]) =>
    out.push({ id, ruleId, text, severity });
  if (s.status === "rosc" && !s.rosc.sustained) {
    add(
      "rosc_sustain",
      "ALS-ROSC-03",
      "ROSC — sustain timer running (20:00); re-arrest is one tap",
      "info",
    );
  }
  if (s.status !== "in_arrest") return out;
  const child = s.paediatric;

  if (s.cycle.status === "prepare")
    add(
      "cycle_prepare",
      "ALS-CPR-12",
      "Prepare for the rhythm check — next compressor ready",
      "info",
    );
  if (s.cycle.status === "due")
    add("cycle_due", "ALS-CPR-03", "Rhythm check now — identify the rhythm within 5 s", "due");
  if (s.cycle.status === "overdue")
    add("cycle_overdue", "ALS-CPR-12", "Rhythm check overdue (past 2:15)", "overdue");
  if (s.compressor.swapDue)
    add("compressor_swap", "ALS-CPR-11", "Swap the compressor at this rhythm check", "due");

  const adr = s.adrenaline;
  const adrRule = adr.ruleIds[0] ?? "ALS-ADR-03";
  if (adr.status === "due_now") add("adrenaline", adrRule, adr.reason, "due");
  if (adr.status === "window_open")
    add("adrenaline", adrRule, `Adrenaline window open — ${adr.reason}`, "due");
  if (adr.status === "overdue")
    add("adrenaline", adrRule, `Adrenaline overdue — ${adr.reason}`, "overdue");
  if (adr.status === "withheld") add("adrenaline", "ALS-MOD-01", adr.reason, "info");
  const aa = s.antiarrhythmic;
  if (aa.status === "due") add("antiarrhythmic", aa.ruleIds[0]!, aa.reason, "due");
  if (aa.status === "delayed_hypothermia")
    add("antiarrhythmic", aa.ruleIds[0] ?? "ALS-MOD-03", aa.reason, "info");

  if (s.shocks.refractoryVf)
    add(
      "refractory_vf",
      "ALS-SHK-04",
      "Refractory VF — consider escalating energy; prepare antero-posterior pads for the next rhythm check",
      "info",
    );
  if (s.shocks.delayed)
    add(
      "shocks_delayed",
      "ALS-MOD-02",
      "Core < 30 °C after 3 shocks — delay further shocks until core > 30 °C",
      "info",
    );
  if (s.currentRhythm === "asystole")
    add(
      "p_waves",
      "ALS-RHY-01",
      "Asystole — check the ECG for P waves (may respond to pacing)",
      "info",
    );
  if (organisedPulseUnknown)
    add("pulse_check", "ALS-RHY-02", "Organised rhythm — pulse? Yes → ROSC; No → PEA", "due");

  if (s.airway.level === "ett" && s.airway.ettTrace !== "yes")
    add(
      "ett_trace",
      "ALS-AIR-03",
      "ETT: sustained ETCO₂ trace not confirmed — check the tube position",
      "due",
    );
  if (s.airway.continuousCompressions)
    add(
      "continuous_compressions",
      "ALS-AIR-04",
      child
        ? "Advanced airway — continuous compressions (ventilation rate: PLS module not built)"
        : "Advanced airway — continuous compressions, ventilate 10 /min (SGA leak → 30:2)",
      "info",
    );
  if (s.access.promptIo)
    add("io_access", "ALS-ACC-01", "2 failed IV attempts — go intraosseous (IO)", "due");
  if (s.etco2.rising)
    add(
      "etco2_rising",
      "ALS-ETC-02",
      "ETCO₂ rising — check for ROSC at the next rhythm check; don't stop compressions on this alone",
      "info",
    );
  if (band === "peripheral_low")
    add("core_temp", "ALS-MOD-06", "Measure core temperature now (low-reading thermometer)", "due");
  if (ctx.flags.allergenTrigger)
    add(
      "anaphylaxis",
      "ALS-DRG-06",
      child
        ? "In cardiac arrest: follow ALS — IM prompt suppressed"
        : `In cardiac arrest: follow ALS — ${anaphylaxisAdrenalineText(ctx, band)}; give an IV crystalloid bolus early`,
      "info",
    );
  if (lysisAtMs !== null)
    add(
      "pe_lysis",
      "ALS-DRG-04",
      `PE thrombolysis ${Math.floor((nowMs - lysisAtMs) / 60_000)} min ago — ${
        child
          ? "prolonged resuscitation (weight-based — PLS module not built)"
          : `consider CPR for ${PE_LYSIS_CPR_MIN_MIN}–${PE_LYSIS_CPR_MAX_MIN} min after administration`
      }`,
      "info",
    );
  if (child)
    add(
      "paediatric",
      "ALS-MOD-16",
      "Age < 16 — clocks and logging only; doses weight-based — PLS module not built",
      "info",
    );
  return out
    .map((p, i) => ({ p, i }))
    .sort((a, b) => RANK[a.p.severity] - RANK[b.p.severity] || a.i - b.i)
    .map(({ p }) => p);
}
