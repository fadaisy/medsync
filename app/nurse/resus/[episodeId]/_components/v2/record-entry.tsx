"use client";

import type { PendingEntry } from "./types";
import type { ResusEventKind, TimelineEvent } from "@/lib/resus/types";
import type { LucideIcon } from "lucide-react";
import { createElement, memo, useEffect, useState } from "react";
import {
  ActivityIcon,
  CheckIcon,
  CircleDotIcon,
  CircleStopIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  DiamondIcon,
  DropletIcon,
  EllipsisIcon,
  FileTextIcon,
  HeartIcon,
  HeartPulseIcon,
  LoaderCircleIcon,
  MegaphoneIcon,
  MinusIcon,
  PauseIcon,
  RotateCcwIcon,
  StethoscopeIcon,
  SyringeIcon,
  TriangleAlertIcon,
  Undo2Icon,
  UsersIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { clockOf, entryLabel, entryValues, tPlus } from "./record-format";

/**
 * Resus Desk v2 — one record entry (prompt §5.8): T+ and bedside clock, step
 * tag, a Lucide glyph (no emoji), label, values, who, late-entry and sync
 * state, Undo for 10 s and "Correct…".
 */

const KIND_ICON: Partial<Record<ResusEventKind, LucideIcon>> = {
  assessment: StethoscopeIcon,
  reassessment: RotateCcwIcon,
  drug: SyringeIcon,
  fluid: DropletIcon,
  procedure: WrenchIcon,
  vital: HeartPulseIcon,
  decision: DiamondIcon,
  shock: ZapIcon,
  rhythm_check: ActivityIcon,
  role_change: UsersIcon,
  mobilisation: MegaphoneIcon,
  note: FileTextIcon,
  handover: FileTextIcon,
  arrest_detected: TriangleAlertIcon,
  cpr_started: TriangleAlertIcon,
  context: ClipboardListIcon,
  rosc: HeartIcon,
  resuscitation_stopped: CircleStopIcon,
  death_confirmed: ClipboardCheckIcon,
};

/** Action rows wear their state's icon (design system action-state tokens). */
const STATE_ICON: Record<string, LucideIcon> = {
  indicated: CircleDotIcon,
  in_progress: LoaderCircleIcon,
  performed: CheckIcon,
  failed: TriangleAlertIcon,
  deferred: PauseIcon,
  not_indicated: MinusIcon,
};

function iconOf(e: TimelineEvent): LucideIcon {
  if (e.payload.noteKind === "correction") return Undo2Icon;
  const st = e.payload.state;
  if (e.kind === "action" && typeof st === "string" && STATE_ICON[st]) return STATE_ICON[st];
  return KIND_ICON[e.kind] ?? FileTextIcon;
}

const STEP_TAG: Record<string, string> = { arrest: "Arrest", post: "Post-ROSC" };

/**
 * Faint state tint (design system "Timeline + findings"): tint, never shout.
 * Rose at /40 keeps the muted captions ≥ 4.5:1; mint takes no dark: override
 * because the teal ramp already flips in .dark (mint-950 is near-white there).
 */
function tintOf(e: TimelineEvent, failedSync: boolean): string {
  const st = e.payload.state;
  if (failedSync || e.payload.danger === true || st === "failed")
    return "bg-rose-50/40 dark:bg-rose-950/20";
  if (st === "performed") return "bg-mint-50/50";
  if (st === "in_progress") return "bg-blue-50/40 dark:bg-blue-950/15";
  return "";
}

/* ─── The entry ────────────────────────────────────────────────────── */

export const UNDO_MS = 10_000;

/** "Undo" for 10 s after the entry was written (then it unmounts itself). */
function UndoLeaf({
  untilMs,
  nowMs,
  disabled,
  onUndo,
}: {
  untilMs: number;
  nowMs: () => number;
  disabled: boolean;
  onUndo: () => void;
}) {
  const [open, setOpen] = useState(() => nowMs() < untilMs);
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setOpen(false), Math.max(0, untilMs - nowMs()));
    return () => clearTimeout(id);
  }, [open, untilMs, nowMs]);
  if (!open) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Saving — undo in a moment" : undefined}
      onClick={onUndo}
      className="tap text-body-s min-h-11 rounded-md px-3 font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50"
    >
      Undo
    </button>
  );
}

export interface RecordEntryProps {
  event: TimelineEvent;
  startedAtIso: string;
  /** Recorder's name, or "—". */
  who: string;
  /** The queue entry while the row is not yet saved. */
  sync: PendingEntry | null;
  online: boolean;
  /** Comma-joined fields of this vital marked artefact ("" if none). */
  artefactKeys: string;
  /** History view: how this superseded row was undone / corrected. */
  supersededNote: string | null;
  /** The same user may undo until then (ms), else null. */
  undoUntilMs: number | null;
  nowMs: () => number;
  onUndo?: (e: TimelineEvent) => void;
  onCorrect?: (e: TimelineEvent) => void;
  onRetry: (clientEventId: string) => void;
  onDiscard: (clientEventId: string) => void;
}

export const RecordEntry = memo(function RecordEntry({
  event: e,
  startedAtIso,
  who,
  sync,
  online,
  artefactKeys,
  supersededNote,
  undoUntilMs,
  nowMs,
  onUndo,
  onCorrect,
  onRetry,
  onDiscard,
}: RecordEntryProps) {
  const failed = sync?.status === "failed";
  const values = entryValues(e, artefactKeys);
  const step = e.step && e.step !== "pre" ? (STEP_TAG[e.step] ?? e.step) : null;
  const late = e.lateEntry === true || Date.parse(e.createdAt) - Date.parse(e.recordedAt) > 60_000;
  const arrest = e.kind === "arrest_detected" || e.kind === "cpr_started";
  const meta = [
    who,
    late ? `entered ${clockOf(e.createdAt, false)} for ${clockOf(e.recordedAt, false)}` : null,
    supersededNote,
  ].filter(Boolean);
  const syncText = !sync
    ? null
    : failed
      ? `Not saved${sync.error ? `: ${sync.error}` : ""}`
      : sync.status === "pending" && !online
        ? "Waiting: offline"
        : sync.status === "pending" && sync.error
          ? "Retrying"
          : "Saving…";

  return (
    <li
      data-sync={sync?.status}
      data-kind={e.kind}
      className={cn(
        "flex items-start gap-2 rounded-lg px-2 py-1.5",
        tintOf(e, failed),
        supersededNote && "opacity-70",
      )}
    >
      <div className="text-caption text-muted-foreground w-16 shrink-0 pt-0.5 font-mono leading-tight tabular-nums">
        <div>{tPlus(e.recordedAt, startedAtIso)}</div>
        <div>{clockOf(e.recordedAt)}</div>
      </div>
      {createElement(iconOf(e), {
        "aria-hidden": true,
        className: cn(
          "mt-0.5 size-4 shrink-0",
          arrest ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
        ),
      })}
      <div className="min-w-0 flex-1">
        <p className="text-body-s text-foreground">
          {step ? (
            <span className="text-caption text-muted-foreground mr-1 font-mono">[{step}]</span>
          ) : null}
          <span className={cn(supersededNote && "line-through")}>{entryLabel(e)}</span>
        </p>
        {values ? (
          <p
            className={cn(
              "text-body-s text-muted-foreground tabular-nums",
              e.kind === "vital" && "font-mono",
              supersededNote && "line-through",
            )}
          >
            {values}
          </p>
        ) : null}
        {meta.length > 0 ? (
          <p className="text-caption text-muted-foreground">{meta.join(" · ")}</p>
        ) : null}
        {syncText ? (
          <p
            className={cn(
              "text-caption",
              failed
                ? "font-medium text-rose-700 dark:text-rose-300"
                : sync?.status === "pending" && (!online || sync.error)
                  ? "text-amber-800 dark:text-amber-200"
                  : "text-muted-foreground",
            )}
          >
            {syncText}
          </p>
        ) : null}
        {failed && sync ? (
          <div className="mt-1 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              aria-label={`Retry: ${entryLabel(e)}`}
              onClick={() => onRetry(sync.clientEventId)}
            >
              Retry
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              aria-label={`Discard: ${entryLabel(e)}`}
              onClick={() => onDiscard(sync.clientEventId)}
            >
              Discard
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        {onUndo && undoUntilMs != null ? (
          <UndoLeaf
            untilMs={undoUntilMs}
            nowMs={nowMs}
            disabled={sync?.status === "sending"}
            onUndo={() => onUndo(e)}
          />
        ) : null}
        {onCorrect ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${entryLabel(e)}`}
              className="tap text-muted-foreground hover:bg-muted inline-flex size-11 items-center justify-center rounded-md"
            >
              <EllipsisIcon className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto">
              <DropdownMenuItem className="text-body-s min-h-11" onClick={() => onCorrect(e)}>
                Correct…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
});
