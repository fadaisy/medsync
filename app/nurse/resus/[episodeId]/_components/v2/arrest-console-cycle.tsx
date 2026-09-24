"use client";

import type { Person } from "./arrest-console-model";
import type { ArrestState } from "@/lib/resus/model";
import { ArrowRightLeftIcon, ChevronDownIcon, TimerIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CYCLE_MS, CYCLE_PREPARE_MS } from "@/lib/resus/reference/als-catalog";
import { cn } from "@/lib/utils";
import { fmtMs, Overline, toneClass } from "./arrest-console-model";

/**
 * The 2:00 CPR cycle (ALS-CPR-03, prepare +1:45 / overdue after +2:15 — ALS-CPR-12) and
 * who is on the chest (ALS-CPR-11). The bar steps with the 500 ms clock — no transition,
 * so reduced motion needs nothing extra. Due and overdue are amber, never red.
 */

const STATUS_WORD = {
  running: "Running",
  prepare: "Prepare",
  due: "Rhythm check due",
  overdue: "Rhythm check overdue",
} as const;

export function CyclePanel({
  arrest,
  now,
  people,
  onSwap,
}: {
  arrest: ArrestState;
  now: number;
  people: Person[];
  onSwap: (p: Person) => void;
}) {
  const { cycle, compressor } = arrest;
  const started = cycle.startedAtMs;
  const elapsed = started === null ? 0 : now - started;
  const status = cycle.status;
  const amber = started !== null && (status === "due" || status === "overdue");
  const line =
    started === null
      ? "Cycle paused — no compressions running"
      : status === "running" || status === "prepare"
        ? `Rhythm check in ${fmtMs(CYCLE_MS - elapsed)}`
        : `${STATUS_WORD[status]} · +${fmtMs(elapsed - CYCLE_MS)}`;

  return (
    <section
      aria-label="CPR cycle"
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3",
        amber ? toneClass(status === "overdue" ? "overdue" : "due") : "border-border bg-card",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <Overline>Cycle {cycle.number}</Overline>
        {started !== null ? <span className="text-caption">{STATUS_WORD[status]}</span> : null}
      </div>
      <p role="timer" aria-label={`Cycle time ${fmtMs(elapsed)} of ${fmtMs(CYCLE_MS)}`}>
        <span className="text-heading-l font-mono tabular-nums">{fmtMs(elapsed)}</span>
        <span className="text-body-m text-muted-foreground font-mono tabular-nums">
          {" "}
          / {fmtMs(CYCLE_MS)}
        </span>
      </p>
      <div aria-hidden className="bg-muted relative h-2 overflow-hidden rounded-full">
        <div
          className={cn(
            "absolute inset-0 origin-left",
            amber ? "bg-amber-500" : status === "prepare" ? "bg-teal-600" : "bg-teal-400",
          )}
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, elapsed / CYCLE_MS))})` }}
        />
        <div
          className="bg-foreground/40 absolute inset-y-0 w-px"
          style={{ left: `${(CYCLE_PREPARE_MS / CYCLE_MS) * 100}%` }}
        />
      </div>
      <p className="text-body-s flex items-center gap-1.5 font-medium">
        <TimerIcon aria-hidden className="size-4 shrink-0" />
        {line}
      </p>

      <div className="border-border/70 flex items-center justify-between gap-2 border-t pt-3">
        <div className="min-w-0">
          <Overline>Compressor</Overline>
          <p className="text-body-s truncate font-medium">{compressor.name ?? "Not recorded"}</p>
          {compressor.onChestMs !== null ? (
            <p className="text-caption text-muted-foreground font-mono tabular-nums">
              On chest {fmtMs(compressor.onChestMs)}
            </p>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={cn(
                  "tap text-body-s flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 font-medium",
                  toneClass(compressor.swapDue ? "due" : "neutral", true),
                )}
              />
            }
          >
            <ArrowRightLeftIcon aria-hidden className="size-4" />
            {compressor.swapDue ? "Swap due" : "Swap"}
            <ChevronDownIcon aria-hidden className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {/* Base UI: a GroupLabel outside Menu.Group throws (#31) and takes the desk down. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-caption">Swap to…</DropdownMenuLabel>
              {people.map((p) => (
                <DropdownMenuItem
                  key={p.userId}
                  className="text-body-s min-h-11 px-3"
                  onClick={() => onSwap(p)}
                >
                  {p.name}
                  {p.you ? " (you)" : ""}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  );
}
