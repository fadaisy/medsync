import type { YesNo } from "@/lib/clerking/answers";
import type { KeyboardEvent, ReactNode } from "react";
import { CheckIcon, LockIcon, MinusIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";

import { PRESS } from "@/components/emr/orders/choice-chips";
import { cn } from "@/lib/utils";

/**
 * The tap-first controls of clerking desk v2 (§5.4, §10), hook-free so the tests can press them:
 * toggle chips, a segmented control, a stepper, a yes/no row and the 0–10 strip. Teal is the
 * checked state and the focus ring; amber is caution; plum never appears here (place only).
 * Targets are 30 px on a fine pointer and 44 px on touch (`pointer-coarse`).
 */

const FOCUS = "outline-none focus-visible:shadow-focus";
const TALL = "min-h-[30px] pointer-coarse:min-h-11";

/**
 * Below 640 px (PROMPT-CLERKING-MOBILE §3, §5): each form group is one panel on the grey page, and
 * controls are 36 px (chips) or 32 px (yes/no) to the eye with a 44 px touch area from hit slop
 * (D-CM-07). Every phone rule is `max-sm:`, so 640 px and up are unchanged.
 */
export const PANEL =
  "max-sm:bg-card max-sm:ring-border max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:rounded-2xl max-sm:p-3.5 max-sm:shadow-xs max-sm:ring-1";
/** The panel's heading on the phone (the desktop's own label, restyled). */
export const PANEL_HEAD = "max-sm:text-body-m max-sm:text-foreground max-sm:font-medium";
const PHONE_CHIP =
  "max-sm:text-body-m max-sm:relative max-sm:min-h-9 max-sm:rounded-[10px] max-sm:px-3 max-sm:pointer-coarse:min-h-9 max-sm:after:absolute max-sm:after:inset-x-0 max-sm:after:-inset-y-1";
const CAUTION = "border-amber-600 bg-status-caution-bg text-amber-800 dark:text-status-caution-fg";

/** A label column (92 px) and its controls, wrapping. */
export function FieldRow({
  label,
  children,
  group = true,
}: {
  label: string;
  children: ReactNode;
  /** The controls form one named group (chips); false when they name themselves. */
  group?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 max-sm:gap-2 sm:flex-row sm:items-start sm:gap-3">
      <span
        aria-hidden={group || undefined}
        className="text-caption text-muted-foreground max-sm:text-body-s sm:w-[92px] sm:shrink-0 sm:pt-2"
      >
        {label}
      </span>
      <div
        role={group ? "group" : undefined}
        aria-label={group ? label : undefined}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 max-sm:gap-2"
      >
        {children}
      </div>
    </div>
  );
}

/** A toggle chip: pressed shows a tick and teal; the word says it, never the colour alone. */
export function Chip({
  selected,
  onPress,
  disabled,
  children,
  dashed,
}: {
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
  /** An add-something chip ("Common" picks). */
  dashed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={dashed ? undefined : selected}
      disabled={disabled}
      onClick={onPress}
      className={cn(
        "text-body-s inline-flex items-center gap-1.5 rounded-sm border px-2.5 font-medium select-none disabled:opacity-50",
        TALL,
        FOCUS,
        PRESS,
        PHONE_CHIP,
        dashed && "border-dashed",
        selected
          ? "border-teal-600 bg-teal-50 text-teal-800"
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {selected ? <CheckIcon aria-hidden className="size-3.5" /> : null}
      {children}
    </button>
  );
}

/** A short single choice as grouped buttons (History from). Tap again clears. */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onPick,
  disabled,
}: {
  label: string;
  options: readonly { id: V; label: string }[];
  value: V | null | undefined;
  onPick: (v: V) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="bg-muted inline-flex flex-wrap gap-0.5 rounded-md p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          disabled={disabled}
          onClick={() => onPick(o.id)}
          className={cn(
            "text-caption min-h-7 rounded-sm px-2.5 pointer-coarse:min-h-11",
            FOCUS,
            value === o.id
              ? "bg-card text-teal-800 shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** − value + with labelled buttons; arrow keys step too. */
export function Stepper({
  label,
  value,
  onStep,
  disabled,
}: {
  label: string;
  value: number | null;
  onStep: (delta: 1 | -1) => void;
  disabled?: boolean;
}) {
  const keys = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") onStep(1);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") onStep(-1);
    else return;
    e.preventDefault();
  };
  const btn = cn(
    "text-muted-foreground hover:text-foreground inline-flex w-[30px] items-center justify-center self-stretch disabled:opacity-50 pointer-coarse:w-11",
    FOCUS,
  );
  return (
    <div
      role="group"
      aria-label={label}
      onKeyDown={keys}
      className={cn(
        "border-input bg-card inline-flex items-stretch overflow-hidden rounded-sm border",
        TALL,
      )}
    >
      <button
        type="button"
        aria-label={`${label}: less`}
        disabled={disabled}
        onClick={() => onStep(-1)}
        className={btn}
      >
        <MinusIcon aria-hidden className="size-3.5" />
      </button>
      <output
        aria-live="polite"
        className="text-body-s flex min-w-8 items-center justify-center font-mono tabular-nums"
      >
        {value ?? "–"}
      </output>
      <button
        type="button"
        aria-label={`${label}: more`}
        disabled={disabled}
        onClick={() => onStep(1)}
        className={btn}
      >
        <PlusIcon aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

/** A yes/no question: grouped buttons with aria-pressed; tapping the same answer clears it. The
 *  row carries `data-yesno` so y, n and d act on the focused row (§5.13). */
export function YesNoRow({
  label,
  value,
  onAnswer,
  restricted,
  disabled,
  children,
}: {
  label: string;
  value: YesNo | undefined;
  onAnswer: (a: YesNo) => void;
  restricted?: boolean;
  disabled?: boolean;
  /** Beside the buttons (Phase 5: a Details button with `data-details`). */
  children?: ReactNode;
}) {
  const btn = (a: YesNo, word: string) => {
    const on = value === a;
    return (
      <button
        type="button"
        data-answer={a}
        aria-pressed={on}
        disabled={disabled}
        onClick={() => onAnswer(a)}
        className={cn(
          "text-caption inline-flex min-h-7 items-center gap-1 rounded-sm px-2.5 pointer-coarse:min-h-11",
          // Phone: 32 px, 50 px wide, 44 px to the finger (slop stays inside the 48 px row).
          "max-sm:text-body-s max-sm:relative max-sm:min-h-8 max-sm:min-w-[50px] max-sm:justify-center max-sm:font-medium max-sm:after:absolute max-sm:after:inset-x-0 max-sm:after:-inset-y-1.5 max-sm:pointer-coarse:min-h-8",
          FOCUS,
          on
            ? a === "yes"
              ? "bg-card text-teal-800 shadow-xs"
              : "bg-card text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {on ? (
          a === "yes" ? (
            <CheckIcon aria-hidden className="size-3" />
          ) : (
            <MinusIcon aria-hidden className="size-3" />
          )
        ) : null}
        {word}
      </button>
    );
  };
  return (
    <div
      data-yesno
      className="flex min-h-[34px] items-center justify-between gap-3 max-sm:min-h-12"
    >
      <span className="text-body-s text-foreground max-sm:text-body-m inline-flex min-w-0 items-center gap-1.5">
        {label}
        {restricted ? (
          <span title="Restricted" className="text-muted-foreground inline-flex">
            <LockIcon aria-hidden className="size-3" />
            <span className="sr-only">Restricted</span>
          </span>
        ) : null}
      </span>
      <span className="inline-flex shrink-0 items-center gap-2">
        {children}
        <span
          role="group"
          aria-label={label}
          className="bg-muted inline-flex rounded-md p-0.5 max-sm:rounded-[10px]"
        >
          {btn("yes", "Yes")}
          {btn("no", "No")}
        </span>
      </span>
    </div>
  );
}

/** The 0–10 strip, a radio group. At or above `cautionFrom` (a signed reference entry) the chosen
 *  number turns amber and a triangle joins the words. Tapping the chosen number clears it. */
export function ScaleStrip({
  label,
  value,
  onPick,
  cautionFrom,
  disabled,
}: {
  label: string;
  value: number | undefined;
  onPick: (n: number) => void;
  cautionFrom: number | null;
  disabled?: boolean;
}) {
  const caution = value !== undefined && cautionFrom !== null && value >= cautionFrom;
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const d =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : 0;
    if (!d) return;
    e.preventDefault();
    const next = Math.min(10, Math.max(0, (value ?? (d > 0 ? -1 : 11)) + d));
    if (next !== value) onPick(next);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label={label} onKeyDown={keys} className="flex flex-wrap gap-1">
        {Array.from({ length: 11 }, (_, n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n} out of 10`}
              tabIndex={on || (value === undefined && n === 0) ? 0 : -1}
              disabled={disabled}
              onClick={() => onPick(n)}
              className={cn(
                "text-caption inline-flex size-7 items-center justify-center rounded-sm border font-mono tabular-nums pointer-coarse:size-11",
                FOCUS,
                on
                  ? caution
                    ? CAUTION
                    : "border-teal-700 bg-teal-700 text-white dark:text-teal-50"
                  : "border-border bg-card text-foreground hover:bg-muted",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <span className="text-caption text-muted-foreground inline-flex items-center gap-1">
        {caution ? <TriangleAlertIcon aria-hidden className="size-3 text-amber-800" /> : null}
        {value === undefined ? "Not scored" : `${value} out of 10`}
      </span>
    </div>
  );
}
