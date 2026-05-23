"use client";

import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Vertical step list rendered in the aside column. Each step shows
 * a bracketed number ([01]) in MedSync's clinical brand chrome, the
 * label, and an optional one-line hint. Clicking a step jumps to it
 * (via the parent component's onChange).
 *
 * Three visual states:
 *   - completed → checkmark in teal
 *   - current   → teal-tinted bracket, slightly bolder
 *   - upcoming  → muted bracket
 *
 * On mobile (`<lg`) this collapses into a horizontal pill list that
 * lives inside the form column — the aside is hidden. The form
 * component owns the mobile step UI; this sidebar variant assumes
 * `lg+` (hidden below).
 */

export interface StepDef {
  label: string;
  hint?: string;
}

interface StepListProps<TIndex extends number> {
  steps: ReadonlyArray<StepDef>;
  current: TIndex;
  onChange: (index: TIndex) => void;
  /** Optional eyebrow label above the list, e.g. "Steps". */
  title?: string;
}

export function StepList<TIndex extends number>({
  steps,
  current,
  onChange,
  title = "Steps",
}: StepListProps<TIndex>) {
  return (
    <nav
      aria-label="Signup progress"
      className="border-border bg-card sticky top-4 flex hidden flex-col gap-3 rounded-lg border p-4 lg:flex"
    >
      <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
        {title}
      </span>
      <ol className="flex flex-col">
        {steps.map((step, i) => {
          const completed = i < current;
          const active = i === current;
          return (
            <li key={step.label} className="relative">
              {/* Connector line linking the current step bracket to the next */}
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-7 left-[16px] h-[calc(100%-12px)] w-px",
                    completed ? "bg-teal-500/50" : "bg-border",
                  )}
                />
              ) : null}
              <button
                type="button"
                onClick={() => onChange(i as TIndex)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-md py-2.5 pr-2 pl-2 text-left transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500",
                  active ? "bg-teal-500/8" : "hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-7 shrink-0 items-center justify-center rounded-xs border font-mono text-[11px] leading-none font-semibold tabular-nums",
                    completed
                      ? "border-teal-500/40 bg-teal-500 text-white"
                      : active
                        ? "border-teal-300 bg-teal-50 text-teal-700 dark:bg-teal-50/15 dark:text-teal-200"
                        : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {completed ? (
                    <CheckIcon className="size-3" strokeWidth={2.5} />
                  ) : (
                    `[${String(i + 1).padStart(2, "0")}]`
                  )}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-[13px] leading-tight font-medium",
                      active
                        ? "text-foreground"
                        : completed
                          ? "text-foreground/80"
                          : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                  {step.hint ? (
                    <span className="text-muted-foreground text-[11.5px] leading-snug">
                      {step.hint}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Compact mobile variant of the step list — horizontal pill row.
 * Renders inside the form column on `<lg`; hidden on `lg+`.
 */
export function StepPills<TIndex extends number>({
  steps,
  current,
  onChange,
}: Omit<StepListProps<TIndex>, "title">) {
  return (
    <ol aria-label="Signup progress" className="flex items-center gap-1.5 lg:hidden">
      {steps.map((step, i) => {
        const completed = i < current;
        const active = i === current;
        return (
          <li key={step.label} className="flex flex-1 items-center">
            <button
              type="button"
              onClick={() => onChange(i as TIndex)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500",
                active ? "text-foreground bg-teal-500/10" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-6 shrink-0 items-center justify-center rounded-xs border font-mono text-[10px] leading-none font-semibold tabular-nums",
                  completed
                    ? "border-teal-500/40 bg-teal-500 text-white"
                    : active
                      ? "border-teal-300 bg-teal-50 text-teal-700 dark:bg-teal-50/15 dark:text-teal-200"
                      : "border-border bg-muted text-muted-foreground",
                )}
              >
                {completed ? (
                  <CheckIcon className="size-3" strokeWidth={2.5} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <span className="truncate font-medium">{step.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
