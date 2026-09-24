"use client";

import type { PendingEntry } from "./types";
import type { TimelineEvent } from "@/lib/resus/types";
import { useState } from "react";
import { CloudOffIcon, Undo2Icon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { entryLabel, fmtMs } from "./arrest-console-model";
import { NEEDS_DIALOG } from "./arrest-console-writes";
import { setConsoleKeysOn, useConsoleKeysOn } from "./use-console-keys";

/**
 * The console's recent entries: the last five of this arrest (A+ times), each saying in
 * words how its save is going (the record's wording), and Undo for the last one for 10 s.
 * A fast-path drug the safety check blocked stays here with "Open dialog". The full
 * record, with corrections, stays in the Resus record.
 */

export const UNDO_WINDOW_MS = 10_000;

/** The Resus record's sync wording (record-entry.tsx), so both say the same thing. */
function syncWord(p: PendingEntry, online: boolean): string {
  if (p.status === "failed")
    return p.error?.startsWith(NEEDS_DIALOG)
      ? "Not saved — needs the prescribe dialog"
      : "Not saved";
  if (p.status === "pending" && !online) return "Waiting: offline";
  if (p.status === "pending" && p.error) return "Retrying";
  return "Saving…";
}

export function LogStrip({
  entries,
  pending,
  online,
  arrestAtMs,
  undoable,
  onUndo,
  onOpenDialog,
}: {
  entries: TimelineEvent[];
  pending: PendingEntry[];
  online: boolean;
  arrestAtMs: number | null;
  /** The last entry's clientEventId while it can still be undone. */
  undoable: string | null;
  onUndo: (clientEventId: string) => void;
  onOpenDialog: (clientEventId: string) => void;
}) {
  const [all, setAll] = useState(false);
  const last5 = entries.slice(-5).reverse();
  const syncOf = (e: TimelineEvent) =>
    e.clientEventId ? pending.find((p) => p.clientEventId === e.clientEventId) : undefined;

  return (
    <section
      aria-label="Recent entries"
      className="border-border bg-muted/30 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start"
    >
      <div className="flex items-center justify-between gap-2 sm:block">
        <p className="text-overline text-muted-foreground uppercase sm:pt-1">Recent</p>
        {last5.length > 1 ? (
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll((v) => !v)}
            className="tap text-body-s text-primary min-h-11 rounded-md px-2 font-medium sm:hidden"
          >
            {all ? "Last entry only" : `Last ${last5.length}`}
          </button>
        ) : null}
      </div>
      {last5.length === 0 ? (
        <p className="text-body-s text-muted-foreground flex-1 sm:pt-0.5">Nothing logged yet.</p>
      ) : (
        <ol className="flex min-w-0 flex-1 flex-col gap-1">
          {last5.map((e, i) => {
            const p = syncOf(e);
            const failed = p?.status === "failed";
            return (
              <li
                key={e.id}
                data-sync={p?.status}
                className={cn(
                  "text-body-s flex flex-wrap items-baseline gap-x-2",
                  i > 0 && !all && "hidden sm:flex",
                )}
              >
                <span className="text-caption text-muted-foreground w-14 shrink-0 font-mono tabular-nums">
                  {arrestAtMs === null
                    ? ""
                    : `A+${fmtMs(Date.parse(e.recordedAt) - arrestAtMs, "mm")}`}
                </span>
                <span className="min-w-0 flex-1 truncate">{entryLabel(e)}</span>
                {p ? (
                  <span
                    className={cn(
                      "text-caption inline-flex shrink-0 items-center gap-1",
                      failed
                        ? "font-medium text-rose-700 dark:text-rose-300"
                        : p.status === "pending" && (!online || p.error)
                          ? "text-amber-800 dark:text-amber-200"
                          : "text-muted-foreground",
                    )}
                  >
                    {failed || !online ? <CloudOffIcon aria-hidden className="size-3.5" /> : null}
                    {syncWord(p, online)}
                  </span>
                ) : null}
                {failed && p.error?.startsWith(NEEDS_DIALOG) ? (
                  <button
                    type="button"
                    onClick={() => onOpenDialog(p.clientEventId)}
                    className="tap border-border bg-card text-body-s hover:bg-muted inline-flex min-h-11 shrink-0 items-center rounded-md border px-3 font-medium"
                  >
                    Open dialog
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {undoable ? (
        <button
          type="button"
          onClick={() => onUndo(undoable)}
          className="tap border-border bg-card text-body-s hover:bg-muted inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-md border px-3 font-medium"
        >
          <Undo2Icon aria-hidden className="size-4" />
          Undo last
        </button>
      ) : null}
    </section>
  );
}

const KEYS: [string, string][] = [
  ["R", "Rhythm — focus the rhythm buttons"],
  ["S", "Shock"],
  ["A", "Adrenaline"],
  ["M", "Antiarrhythmic"],
  ["O", "ROSC"],
  ["U", "Undo the last entry (10 s)"],
  ["?", "This help"],
];

/** "?" — the console's keyboard shortcuts, and the per-device switch for them (WCAG 2.1.4). */
export function KeysHelp({ onClose }: { onClose: () => void }) {
  const on = useConsoleKeysOn();
  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="data-closed:animate-none data-open:animate-none sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-heading-s">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-body-s">
            Arrest console only: they act while focus is in the console, never while you type in a
            field.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[2.5rem_1fr] gap-x-3 gap-y-2">
          {KEYS.map(([k, what]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="border-border bg-muted text-body-s inline-flex min-w-7 justify-center rounded-sm border px-1.5 font-mono">
                  {k}
                </kbd>
              </dt>
              <dd className="text-body-s">{what}</dd>
            </div>
          ))}
        </dl>
        <label className="border-border text-body-s flex min-h-11 items-center gap-2 border-t pt-3">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => setConsoleKeysOn(e.target.checked)}
            className="size-5 accent-teal-600"
          />
          Single-key shortcuts on this device
        </label>
      </DialogContent>
    </Dialog>
  );
}
