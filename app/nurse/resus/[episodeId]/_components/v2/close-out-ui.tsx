"use client";

import type { PendingEntry } from "./types";
import type { Capability, CareUnit } from "@/lib/resus/model";
import type { ReactNode } from "react";
import { InfoIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { unitDestination, unitLevel } from "./close-out-model";
import {
  AMBER_NOTE,
  CAPABILITY_WORD,
  DESTINATION_WORD,
  levelShort,
  SECONDARY,
} from "./close-out-words";

/** Lane U6 — the close-out sheet's small shared pieces (note, block, field, unit row). */

/** An amber data prompt (open / waiting) — never a block, never red. */
export function Note({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      className={cn(
        "text-body-s flex flex-col gap-3 rounded-md px-3 py-3 sm:flex-row sm:items-center",
        AMBER_NOTE,
      )}
    >
      <p className="flex flex-1 items-start gap-2">
        <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{children}</span>
      </p>
      {action}
    </div>
  );
}

export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-overline text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function UnitRow({
  unit,
  required,
  selected,
  onSelect,
}: {
  unit: CareUnit;
  required: readonly Capability[];
  selected: boolean;
  onSelect: () => void;
}) {
  const level = unitLevel(unit);
  const missing = required.filter((c) => !unit.capabilities.includes(c));
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "tap focus-visible:shadow-focus flex min-h-11 w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left outline-none",
        selected ? "border-teal-600 bg-teal-50" : "border-border bg-card hover:bg-muted",
      )}
    >
      <span className="text-body-s text-foreground font-medium">
        {selected ? "Chosen · " : ""}
        {DESTINATION_WORD[unitDestination(unit)]} — {unit.name}
        {level ? ` (${levelShort(level)})` : ""}
      </span>
      <span className="text-caption text-muted-foreground">
        can:{" "}
        {unit.capabilities.map((c) => CAPABILITY_WORD[c]).join(" · ") || "no capabilities declared"}
      </span>
      {missing.length > 0 ? (
        <span className="text-caption text-muted-foreground">
          cannot: {missing.map((c) => CAPABILITY_WORD[c]).join(" · ")}
        </span>
      ) : null}
    </button>
  );
}

export function Field({
  id,
  label,
  children,
  aside,
}: {
  id: string;
  label: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-overline text-muted-foreground uppercase">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

/**
 * Entries the server refused (status "failed" — they never leave the queue on
 * their own). Retry or discard them here, so ending is never blocked for good.
 */
export function FailedEntries({
  entries,
  onRetry,
  onDiscard,
}: {
  entries: readonly PendingEntry[];
  onRetry: (clientEventId: string) => void;
  onDiscard: (clientEventId: string) => void;
}) {
  const n = entries.length;
  return (
    <section
      aria-labelledby="co-failed"
      className={cn("text-body-s flex flex-col gap-2 rounded-md px-3 py-3", AMBER_NOTE)}
    >
      <h3 id="co-failed" className="flex items-start gap-2 font-medium">
        <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {n} {n === 1 ? "entry was" : "entries were"} not saved — retry or discard before ending.
      </h3>
      <ul className="flex flex-col gap-2">
        {entries.map((p) => (
          <li key={p.clientEventId} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1">
              {p.label}
              {p.error ? ` — ${p.error}` : ""}
            </span>
            <button type="button" onClick={() => onRetry(p.clientEventId)} className={SECONDARY}>
              Retry
            </button>
            <button type="button" onClick={() => onDiscard(p.clientEventId)} className={SECONDARY}>
              Discard
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
