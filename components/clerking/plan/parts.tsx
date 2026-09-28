import type { ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, CircleIcon } from "lucide-react";

import { PRESS } from "@/components/emr/orders/choice-chips";
import { StatusWord } from "@/components/emr/status-word";
import { cn } from "@/lib/utils";

/**
 * The Plan's small pieces (ADR 0184): a titled section, a segmented control, a square tag and a
 * disclosure. Teal is the chosen state and the focus ring; amber is a caution; the one red is the
 * Emergency test priority, always with its word. No left-edge bars, no decorative motion.
 */

export const FOCUS = "outline-none focus-visible:shadow-focus";
const TALL = "min-h-7 pointer-coarse:min-h-11";

/** The only red in the Plan: the Emergency test priority (ADR 0185), always with its word. */
const EMERGENCY_TONE = "bg-status-critical-bg text-red-700 dark:text-status-critical-fg";

export function Section({
  id,
  title,
  aside,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={id} className="text-label text-foreground">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A labelled row: the label column and its control. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <span className="text-caption text-muted-foreground sm:w-[132px] sm:shrink-0 sm:pt-1.5">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

export interface SegOption<V extends string> {
  id: V;
  label: string;
  disabled?: boolean;
  /** The Emergency priority: the critical token when chosen, with its word. */
  critical?: boolean;
}

/** One choice as a radio group; the chosen segment is raised, the word says it. */
export function Seg<V extends string>({
  label,
  options,
  value,
  onPick,
  disabled,
}: {
  label: string;
  options: readonly SegOption<V>[];
  value: V | null | undefined;
  onPick: (v: V) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="bg-muted inline-flex max-w-full flex-wrap gap-0.5 self-start rounded-md p-0.5"
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled || o.disabled}
            onClick={() => onPick(o.id)}
            className={cn(
              "text-caption rounded-sm px-2.5 disabled:opacity-50",
              TALL,
              FOCUS,
              PRESS,
              on
                ? o.critical
                  ? cn(EMERGENCY_TONE, "font-medium shadow-xs")
                  : "bg-card font-medium text-teal-800 shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A square tag for a workflow state (never red, amber or green). */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "text-caption bg-muted text-foreground inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The priority as a tag: Emergency in the critical token with its word; the rest neutral. */
export function PriorityTag({ priority, word }: { priority: string | null; word: string }) {
  if (priority === "emergency")
    return (
      <span
        className={cn(
          "text-caption inline-flex items-center rounded-[3px] px-1.5 py-0.5 font-medium",
          EMERGENCY_TONE,
        )}
      >
        {word}
      </span>
    );
  return <Tag>{word}</Tag>;
}

/** A toggle chip: pressed shows a tick. */
export function Toggle({
  on,
  onPress,
  disabled,
  children,
}: {
  on: boolean;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onPress}
      className={cn(
        "text-body-s inline-flex items-center gap-1.5 rounded-sm border px-2.5 select-none disabled:opacity-50",
        "min-h-[30px] pointer-coarse:min-h-11",
        FOCUS,
        PRESS,
        on
          ? "border-teal-600 bg-teal-50 text-teal-800"
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {on ? <CheckIcon aria-hidden className="size-3.5" /> : null}
      {children}
    </button>
  );
}

/** A chevron that turns 180° in 150 ms on the sanctioned curve (motion that says open or shut). */
export function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronDownIcon
      aria-hidden
      className={cn(
        "ease-expo-out size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
        open && "rotate-180",
      )}
    />
  );
}

/** A checklist line: done with a tick, open with a ring; the word carries it. */
export function CheckLine({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail: string | null;
}) {
  return (
    <li className="flex items-start gap-2">
      {done ? (
        <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-teal-700" />
      ) : (
        <CircleIcon aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      )}
      <span className="text-body-s flex flex-col">
        <span>
          <span className="sr-only">{done ? "Done: " : "To do: "}</span>
          {label}
        </span>
        {!done && detail ? <span className="text-muted-foreground">{detail}</span> : null}
      </span>
    </li>
  );
}

/** Amber words for a caution, with its glyph. */
export function Caution({ children }: { children: ReactNode }) {
  return <StatusWord tone="caution">{children}</StatusWord>;
}

/** "Draft, not CSO-signed" and similar: a quiet label on content the CSO has not signed. */
export function DraftLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-caption text-muted-foreground border-border rounded-[3px] border border-dashed px-1.5 py-0.5">
      {children}
    </span>
  );
}

export const inputClass =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-9 w-full rounded-sm border px-2.5 outline-none disabled:opacity-50";
