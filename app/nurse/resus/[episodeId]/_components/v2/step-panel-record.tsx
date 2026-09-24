"use client";

import type { AbcdeLetter } from "@/lib/resus/types";
import { ActivityIcon, CheckIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { FindingRow, SELECTED } from "./step-panel-chips";

/**
 * Resus Desk v2 — the step panel's record rows (part of step-panel.tsx): the
 * selected findings, the read-only "from vitals" findings, the Record bar and
 * the "recorded elsewhere" banner.
 */

/** Vitals-derived findings (read-only, dashed — they are not recorded by a tap). */
export function DerivedRow({
  ageMin,
  codes,
  label,
}: {
  ageMin: number | null;
  codes: string[];
  label: (code: string) => string;
}) {
  if (codes.length === 0) return null;
  return (
    <FindingRow label={`From vitals · ${ageMin ?? 0} min (auto)`}>
      {codes.map((c) => (
        <span
          key={c}
          className="border-border bg-muted/40 text-body-s text-muted-foreground inline-flex min-h-8 items-center gap-1.5 rounded-md border border-dashed px-3"
        >
          <ActivityIcon className="size-3.5" aria-hidden />
          {label(c)}
        </span>
      ))}
    </FindingRow>
  );
}

/** The selected findings, each a tap-to-remove chip. */
export function SelectedRow({
  codes,
  label,
  readOnly,
  onRemove,
}: {
  codes: string[];
  label: (code: string) => string;
  readOnly: boolean;
  onRemove: (code: string) => void;
}) {
  if (codes.length === 0) return null;
  // R3: the tapped chip unmounts — focus the next selected chip, else the same
  // finding's key-sign chip, else the findings group; never <body>.
  const remove = (c: string, btn: HTMLButtonElement) => {
    const chips = [...(btn.parentElement?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = chips.indexOf(btn);
    const group = btn.closest<HTMLElement>("[data-measure='findings']");
    const keySign = [
      ...(group?.querySelectorAll<HTMLButtonElement>("button[data-chip][aria-pressed='true']") ??
        []),
    ].find((b) => b.querySelector("span > span")?.textContent === label(c));
    const target = chips[i + 1] ?? chips[i - 1] ?? keySign ?? group;
    target?.focus();
    onRemove(c);
    requestAnimationFrame(() => {
      if (target && !target.isConnected) group?.focus();
    });
  };
  return (
    <FindingRow label="Selected">
      {codes.map((c) => (
        <button
          key={c}
          type="button"
          disabled={readOnly}
          onClick={(e) => remove(c, e.currentTarget)}
          aria-label={`Remove ${label(c)}`}
          className={cn(
            "tap text-body-s inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 disabled:opacity-60",
            SELECTED,
          )}
        >
          {label(c)}
          {readOnly ? null : <XIcon className="size-3.5" aria-hidden />}
        </button>
      ))}
    </FindingRow>
  );
}

/**
 * Record X findings. Enabled only while the draft differs from the latest
 * record (the count is the number of changes, so a tap never writes a
 * duplicate), and sticky only then and only from 1024 px: below that the
 * desk's bottom bar holds Record findings (prompt §5.1).
 */
export function RecordBar({
  step,
  unsaved,
  recorded,
  valid,
  onRecord,
}: {
  step: AbcdeLetter;
  unsaved: number;
  recorded: boolean;
  valid: boolean;
  onRecord: () => void;
}) {
  const dirty = unsaved > 0;
  return (
    <div
      className={cn(
        "border-border bg-card z-10 -mx-4 border-t px-4 py-3",
        dirty && "lg:sticky lg:bottom-20 xl:bottom-0",
      )}
    >
      <button
        id="record-findings"
        type="button"
        disabled={!valid || !dirty}
        onClick={onRecord}
        className="tap text-body-m bg-primary text-primary-foreground enabled:hover:bg-primary-hover inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 font-medium disabled:opacity-50"
      >
        <CheckIcon className="size-4" aria-hidden />
        {dirty
          ? `Record ${step} findings (${unsaved} ${unsaved === 1 ? "change" : "changes"})`
          : recorded
            ? `${step} recorded — no changes`
            : `Record ${step} findings`}
      </button>
      {valid ? null : (
        <p className="text-body-s mt-1 text-amber-700 dark:text-amber-300">
          Check the glucose or temperature value, then record.
        </p>
      )}
    </div>
  );
}

/** The record moved under an unsaved draft: the draft is kept until reviewed or discarded. */
export function MovedBanner({
  at,
  unsaved,
  onDiscard,
}: {
  at: string;
  unsaved: number;
  onDiscard: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <p className="text-body-s min-w-0 flex-1">
        Recorded elsewhere at {at} — review your {unsaved} unsaved{" "}
        {unsaved === 1 ? "change" : "changes"}.
      </p>
      <button
        type="button"
        onClick={onDiscard}
        className="tap text-body-s min-h-11 rounded-md border border-amber-400 px-3 font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40"
      >
        Discard my changes
      </button>
    </div>
  );
}
