"use client";

import type { DeskCtxValue } from "./desk-context";
import type { ArrestContext, CauseState } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";

import { latestExposureAssessment } from "@/lib/resus/exposure";
import { ALS_REFS } from "@/lib/resus/reference/als-catalog";
import { buildResusVitals } from "@/lib/resus/vitals";
import { cn } from "@/lib/utils";

/**
 * Lane U5 (after the arrest) — small helpers shared by the post-ROSC panel, the
 * termination review, death confirmation, after-death tasks and the debrief.
 * Nothing clinical is decided here: formatting, the ALS engine context, and the
 * one pressable choice every U5 form uses.
 */

/** mm:ss, or h:mm:ss past an hour ("03:10", "32:10", "1:02:05"). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 24-hour wall time ("18:04"). */
export function hhmm(at: number | string): string {
  const d = new Date(typeof at === "string" ? Date.parse(at) : at);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** DD MMM YYYY, HH:MM (Ugandan convention, "23 Sep 2026, 18:04"). */
export function dateTime(at: number | string): string {
  const d = new Date(typeof at === "string" ? Date.parse(at) : at);
  const day = `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return `${day}, ${hhmm(d.getTime())}`;
}

/** The ALS engine context from the desk (weight is not recorded in resus → null). */
export function arrestContextOf(d: DeskCtxValue, events: readonly TimelineEvent[]): ArrestContext {
  const cpr = d.store.roster.find((r) => r.role === "cpr_provider");
  const bayId = d.store.episode.bayProfileId;
  return {
    ageYears: d.ageYears,
    weightKg: null,
    flags: d.flags,
    coreTempC: latestExposureAssessment(events)?.coreTempC ?? null,
    otherTempC: buildResusVitals(events).latest.temperature ?? null,
    antiarrhythmic: d.initial.settings.antiarrhythmic,
    bayProfile: d.initial.bayProfiles.find((b) => b.id === bayId) ?? null,
    cprProvider: cpr ? { userId: cpr.userId, name: cpr.fullName } : null,
  };
}

/** D16 — the after-death checklist and debrief stay editable 24 h after close (mirrors actions-closeout.ts). */
const AFTER_CLOSE_MS = 24 * 3_600_000;

/**
 * Whether the after-close records (after-death tasks, debrief) are still editable.
 * An episode closed in this session has no `endedAtIso` on the client yet (the delta
 * carries state only) — it just closed, so it is editable; the server has the last word.
 */
export function afterCloseWindow(
  episode: { state: string; endedAtIso: string | null },
  nowMs: number,
): { editable: boolean; untilMs: number | null } {
  if (episode.state === "active" || !episode.endedAtIso) return { editable: true, untilMs: null };
  const untilMs = Date.parse(episode.endedAtIso) + AFTER_CLOSE_MS;
  return { editable: nowMs <= untilMs, untilMs };
}

/** A reversible-cause name from its signed tile entry ("Tension pneumothorax"). */
export function causeName(ruleId: string): string {
  return ALS_REFS[ruleId]?.text.split(" — ")[0] ?? ruleId;
}

export const CAUSE_STATE_WORD: Record<CauseState, string> = {
  not_assessed: "not assessed",
  suspected: "suspected",
  excluded: "excluded",
  treating: "treating",
  treated: "treated",
};

/** The latest active event matching a predicate (events are time-ordered). */
export function latest(
  events: readonly TimelineEvent[],
  match: (e: TimelineEvent) => boolean,
): TimelineEvent | null {
  for (let i = events.length - 1; i >= 0; i--) if (match(events[i]!)) return events[i]!;
  return null;
}

export const isDecision = (e: TimelineEvent, decision: string) =>
  e.kind === "decision" && e.payload.decision === decision;

/** One pressable choice (≥ 44 px): teal + check when selected — never colour alone. */
export function Choice({
  selected,
  onClick,
  disabled,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "tap text-body-s inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-left font-medium outline-none",
        "focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50",
        selected
          ? "border-teal-600 bg-teal-50 text-teal-800"
          : "border-border bg-card text-foreground hover:bg-muted",
        className,
      )}
    >
      {selected ? <CheckIcon className="size-4 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
  /** Classes of the selected segment (fill + text). */
  on: string;
}

/**
 * A one-row segmented state control (≤ 3 segments, each ≥ 44 px, icon + word). From
 * sm every segment keeps its icon (muted until selected) so a tap never shifts the
 * boundaries; on phones the segments are equal thirds, so only the selected one needs it.
 * No overflow clipping: the focused segment lifts above its neighbours so its whole
 * focus ring shows; the end segments carry the rounding instead.
 */
export function Segments<T extends string>({
  value,
  options,
  label,
  disabled,
  onPick,
}: {
  value: T | null;
  options: readonly SegmentOption<T>[];
  label: string;
  disabled: boolean;
  onPick: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="border-border bg-card divide-border inline-flex w-full divide-x rounded-md border sm:w-auto"
    >
      {options.map(({ value: v, label: word, icon: Icon, on }) => {
        const selected = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => (selected ? undefined : onPick(v))}
            className={cn(
              "tap text-body-s inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 font-medium outline-none first:rounded-l-md last:rounded-r-md sm:flex-none",
              "focus-visible:shadow-focus focus-visible:relative focus-visible:z-10 disabled:pointer-events-none disabled:opacity-50",
              selected ? on : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Icon
              className={cn("size-4 shrink-0", !selected && "opacity-40 max-sm:hidden")}
              aria-hidden
            />
            {word}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled review row: overline label left on tablets, stacked on phones. */
export function ReviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-border grid gap-2 border-b py-4 last:border-b-0 sm:grid-cols-[7rem_1fr] sm:gap-4">
      <h3 className="text-overline text-muted-foreground pt-0.5 uppercase">{label}</h3>
      <div className="min-w-0 space-y-2">{children}</div>
    </section>
  );
}

/** Shared text-field classes (the design-system input, for native textareas too). */
/** 16 px text on phones (iOS zooms a smaller field on focus), body-s from sm. */
export const FIELD =
  "border-input bg-card text-foreground text-body-l sm:text-body-s w-full min-w-0 rounded-sm border px-2.5 py-2 outline-none placeholder:text-gray-400 focus-visible:border-teal-500 focus-visible:shadow-focus disabled:opacity-50";

/** The deliberate, neutral-dark button (Stop resuscitation, Confirm death) — never red. */
export const NEUTRAL_DARK =
  "tap text-body-m inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-foreground px-5 font-medium text-background outline-none hover:opacity-90 focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-40";
