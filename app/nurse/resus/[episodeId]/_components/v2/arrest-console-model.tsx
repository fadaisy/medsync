"use client";

import type { DeskInitialData, PendingEntry } from "./types";
import type { DeskStore } from "./use-desk";
import type {
  ArrestContext,
  ArrestDetectedPayload,
  ArrestProcedure,
  BayProfile,
  Rhythm,
} from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";
import type { ReactElement, ReactNode } from "react";
import { useMemo } from "react";
import { Popover } from "@base-ui/react/popover";

import { arrestSlice } from "@/lib/resus/als/timing";
import { latestExposureAssessment } from "@/lib/resus/exposure";
import { STACK_MAX_SHOCKS } from "@/lib/resus/reference/als-catalog";
import { cn } from "@/lib/utils";
import { useDeskCtx } from "./desk-context";
import { shockLabel } from "./record-format";

/**
 * Arrest console — shared helpers (lane U4): clock formatting, the ArrestContext the ALS
 * engine needs, the labels the server writes (mirrored so optimistic rows match), the
 * console's button tones and a small popover shell. No clinical logic lives here.
 */

/** "m:ss" for countdowns, "mm:ss" for A+ clocks, "hh:mm:ss" for the resus T+ clock. */
export function fmtMs(ms: number, style: "m" | "mm" | "hms" = "m"): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor(t / 60) % 60;
  const s = String(t % 60).padStart(2, "0");
  if (style === "hms") return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s}`;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${s}`;
  return `${style === "mm" ? String(m).padStart(2, "0") : m}:${s}`;
}

/** Mirrors of the server labels (actions-arrest.ts) so an optimistic row reads the same. */
export const RHYTHM_LABEL: Record<Rhythm, string> = {
  vf_pvt: "VF / pVT",
  pea: "PEA",
  asystole: "Asystole",
  organised: "Organised rhythm",
};

export const PROC_LABEL: Record<ArrestProcedure, string> = {
  airway_bvm: "Bag-valve-mask ventilation",
  airway_sga: "Supraglottic airway inserted",
  airway_ett: "Tracheal tube inserted",
  iv_attempt_failed: "IV attempt failed",
  iv_access: "IV access obtained",
  io_access: "IO access obtained",
  compressor_swap: "Compressor swapped",
  pads_antero_posterior: "Pads moved antero-posterior",
  left_uterine_displacement: "Manual left uterine displacement",
  decompression: "Chest decompression",
  pericardiocentesis: "Pericardiocentesis",
  hysterotomy: "Resuscitative hysterotomy",
};

export const WAVEFORM_LABEL: Record<BayProfile["waveform"], string> = {
  monophasic: "monophasic",
  biphasic_truncated_exponential: "biphasic truncated exponential",
  rectilinear_biphasic: "rectilinear biphasic",
  pulsed_biphasic: "pulsed biphasic",
  unknown: "waveform unknown",
};

/**
 * The engine context, from what the record already knows: age and patient flags (desk),
 * core temperature from the latest E assessment, any other temperature from vitals, the
 * hospital antiarrhythmic, the bay's defibrillator (latest choice in this resus, else the
 * episode's) and the CPR role holder.
 */
export function useArrestCtx(): ArrestContext {
  const { initial, store, ageYears, flags } = useDeskCtx();
  const events = store.activeEvents;
  const episodeBay = store.episode.bayProfileId;
  const roster = store.roster;
  return useMemo(() => {
    let bayId = episodeBay;
    let otherTempC: number | null = null;
    for (const e of events) {
      if (e.kind === "note" && e.payload.noteKind === "bay_profile")
        bayId = (e.payload.bayProfileId as string | null | undefined) ?? null;
      if (e.kind === "vital") {
        const t = (e.payload.snapshot as { temperature?: unknown } | undefined)?.temperature;
        if (typeof t === "number" && Number.isFinite(t)) otherTempC = t;
      }
    }
    const cpr = roster.find((r) => r.role === "cpr_provider");
    return {
      ageYears,
      weightKg: null,
      flags,
      coreTempC: latestExposureAssessment(events)?.coreTempC ?? null,
      otherTempC,
      antiarrhythmic: initial.settings.antiarrhythmic,
      bayProfile: initial.bayProfiles.find((b) => b.id === bayId) ?? null,
      cprProvider: cpr ? { userId: cpr.userId, name: cpr.fullName } : null,
    };
  }, [events, episodeBay, initial, roster, ageYears, flags]);
}

export interface Person {
  userId: string;
  name: string;
  you: boolean;
}

/** Everyone who can take the chest: me, the roster, responders who said they are coming. */
export function teamPeople(
  initial: DeskInitialData,
  team: Pick<DeskStore, "roster" | "responders">,
): Person[] {
  const out = new Map<string, Person>();
  const add = (userId: string, name: string | null, you = false) => {
    if (!out.has(userId)) out.set(userId, { userId, name: name ?? "Unnamed responder", you });
  };
  add(initial.me.userId, initial.me.fullName ?? "You", true);
  for (const r of team.roster) add(r.userId, r.fullName);
  for (const r of team.responders) if (r.responding) add(r.userId, r.fullName);
  return [...out.values()];
}

const LOG_KINDS = new Set<string>([
  "arrest_detected",
  "cpr_started",
  "rhythm_check",
  "shock",
  "drug",
  "procedure",
  "rosc",
  "resuscitation_stopped",
]);

const etco2Of = (e: TimelineEvent): number | null => {
  const v = (e.payload.snapshot as { etco2?: unknown } | undefined)?.etco2;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/** The current arrest's console entries, oldest first (the log strip). */
export function arrestLog(events: readonly TimelineEvent[], seq: number): TimelineEvent[] {
  if (seq === 0) return [];
  return (arrestSlice(events, seq)?.events ?? []).filter(
    (e) =>
      LOG_KINDS.has(e.kind) ||
      (e.kind === "decision" && e.payload.decision === "reversible_cause") ||
      (e.kind === "vital" && etco2Of(e) !== null) ||
      (e.kind === "note" && e.payload.noteKind === "free"),
  );
}

export function entryLabel(e: TimelineEvent): string {
  const etco2 = e.kind === "vital" ? etco2Of(e) : null;
  if (etco2 !== null) return `EtCO₂ ${etco2} kPa`;
  if (e.kind === "shock")
    return shockLabel(e.payload.energyJ, e.payload.energySource, e.payload.stacked);
  return String(e.payload.label ?? e.kind.replace(/_/g, " "));
}

/**
 * Stacked shocks (ALS-SHK-03) are offered only in a witnessed AND monitored VF/pVT, at the
 * start of the arrest (every shock so far stacked, fewer than the stack maximum).
 */
export function stackOffered(events: readonly TimelineEvent[], seq: number): boolean {
  const slice = seq > 0 ? arrestSlice(events, seq) : null;
  if (!slice) return false;
  const decl = slice.events.find((e) => e.kind === "arrest_detected");
  const p = decl?.payload as Partial<ArrestDetectedPayload> | undefined;
  if (p?.witnessed !== true || p.monitored !== true) return false;
  const shocks = slice.events.filter((e) => e.kind === "shock");
  return shocks.length < STACK_MAX_SHOCKS && shocks.every((s) => s.payload.stacked === true);
}

/**
 * A queued Undo, each time it runs: correct the landed row; wait while the entry is still
 * on its way (queued, sending, or accepted but not yet fetched); otherwise the entry was
 * never recorded (failed, blocked, discarded) — drop the correction, so it can never hold
 * the ordered queue.
 */
export function undoStep(
  landed: boolean,
  accepted: boolean,
  queued: PendingEntry["status"] | undefined,
): "correct" | "wait" | "drop" {
  if (landed) return "correct";
  return accepted || (queued !== undefined && queued !== "failed") ? "wait" : "drop";
}

/* ─── Console tones (DESIGN-medsync "Resus state colour system") ─── */

/** neutral = pending/plain · primed = the one next tap (teal) · due / overdue = amber · done = teal soft. */
export type Tone = "neutral" | "primed" | "due" | "overdue" | "done";

const TONE: Record<Tone, string> = {
  neutral: "border-border bg-card text-foreground",
  primed: "border-transparent bg-primary text-primary-foreground",
  due: "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100",
  overdue:
    "border-amber-500 bg-amber-100 text-amber-950 dark:border-amber-500 dark:bg-amber-900/50 dark:text-amber-50",
  done: "border-teal-200 bg-teal-50 text-teal-800",
};

/** Hover is a colour change only (Tailwind v4 wraps `hover:` in `@media (hover: hover)`). */
const HOVER: Record<Tone, string> = {
  neutral: "hover:bg-muted",
  primed: "hover:bg-primary-hover",
  due: "hover:bg-amber-100 dark:hover:bg-amber-950/60",
  overdue: "hover:bg-amber-200 dark:hover:bg-amber-900/70",
  done: "hover:bg-teal-100",
};

export const toneClass = (tone: Tone, interactive = false): string =>
  interactive ? `${TONE[tone]} ${HOVER[tone]}` : TONE[tone];

/** A console control: ≥ 56 px tall, tactile on tap (never on keyboard), 1 px border. */
export const consoleBtn = (tone: Tone = "neutral", className?: string): string =>
  cn(
    "tap flex min-h-14 min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left disabled:opacity-50",
    toneClass(tone, true),
    className,
  );

/** Two-line button text: the action, then its state in words (never colour alone). */
export function BtnText({ label, caption }: { label: ReactNode; caption?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-body-m leading-tight font-medium">{label}</span>
      {caption ? <span className="text-caption">{caption}</span> : null}
    </span>
  );
}

export function Overline({ children }: { children: ReactNode }) {
  return <p className="text-overline text-muted-foreground uppercase">{children}</p>;
}

/** A small anchored panel (Base UI popover → role="dialog", so console keys stay off inside). */
export function ConsolePopover({
  open,
  onOpenChange,
  trigger,
  triggerContent,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trigger element (no children) — its content goes in `triggerContent`. */
  trigger: ReactElement;
  triggerContent: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <Popover.Trigger render={trigger}>{triggerContent}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-50">
          <Popover.Popup
            aria-label={label}
            className="border-border bg-popover text-popover-foreground shadow-popover w-72 max-w-[calc(100vw-2rem)] rounded-lg border p-3 outline-none"
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
