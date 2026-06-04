"use client";

import type { ResusActionState } from "@/lib/resus/action-order";

/**
 * Shared actions-board heading (whole-surface consistency): the section title +
 * a persistent "N outstanding" indicator + a screen-reader live region that
 * announces the most-urgent action — so a jump-to-top on `failed` reaches
 * non-visual users with the same priority signal the colour + position give
 * sighted users. Used by EVERY ABCDE step panel so the indicator + a11y are
 * identical, never a per-step reinvention. Presentation only.
 */
export function ResusActionsHeading({
  heading,
  outstanding,
  topLabel,
  topState,
}: {
  heading: string;
  outstanding: number;
  /** The most-urgent outstanding action's label (null when none outstanding). */
  topLabel: string | null;
  topState: ResusActionState | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
          {heading}
        </h3>
        {outstanding > 0 ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/70 bg-amber-50/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/25 dark:text-amber-200"
            title="Outstanding = failed + indicated + in-progress actions"
          >
            {outstanding} outstanding
          </span>
        ) : null}
      </div>
      {/* Deterministic live region — announces the current most-urgent action;
          updates (e.g. a failed action jumping to the top) are read out. */}
      <p className="sr-only" role="status" aria-live="polite">
        {topLabel
          ? `Most urgent action: ${topLabel}${topState ? ` — ${topState.replace(/_/g, " ")}` : ""}`
          : "No outstanding actions"}
      </p>
    </div>
  );
}
