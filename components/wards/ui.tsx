"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";
import { AlertTriangleIcon, MinusIcon, PlusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * The ward builder's small controls (DESIGN-medsync.md): teal marks a checked control and nothing else;
 * amber is for cautions and always carries an icon and words; headings take their weight from the type
 * token. Nothing here animates beyond the sanctioned 100 ms colour change.
 */

/** An ALL-CAPS group label (the `overline` style). */
export function Overline({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-overline text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

export function Section({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-2", className)}>
      <Overline id={id}>{title}</Overline>
      {children}
    </section>
  );
}

/** A toggle chip: aria-pressed, teal only when on. */
export function Chip({
  on,
  onClick,
  children,
  disabled,
  title,
  className,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "text-caption inline-flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 transition-colors duration-100",
        "focus-visible:shadow-focus outline-none disabled:opacity-45",
        on
          ? "bg-teal-tint text-teal-text border-teal-600"
          : "border-ink-300 bg-card text-ink-700 hover:bg-ink-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** One choice from a few, as chips (a radio group). */
export function ChipChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "text-caption inline-flex h-[30px] items-center rounded-md border px-2.5 transition-colors duration-100",
            "focus-visible:shadow-focus outline-none",
            o.value === value
              ? "bg-teal-tint text-teal-text border-teal-600"
              : "border-ink-300 bg-card text-ink-700 hover:bg-ink-50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** − value + with words for each button. */
export function Stepper({
  label,
  value,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
  minusDisabled,
  plusDisabled,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusLabel: string;
  plusLabel: string;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}) {
  const btn =
    "border-ink-300 bg-card text-ink-700 hover:bg-ink-50 focus-visible:shadow-focus inline-flex size-8 items-center justify-center rounded-md border outline-none disabled:opacity-45";
  return (
    <div className="flex items-center gap-2">
      <span className="text-caption text-ink-600 w-16 shrink-0">{label}</span>
      <button
        type="button"
        className={btn}
        onClick={onMinus}
        aria-label={minusLabel}
        disabled={minusDisabled}
      >
        <MinusIcon className="size-3.5" aria-hidden />
      </button>
      <output className="text-body-s w-16 text-center font-mono tabular-nums" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className={btn}
        onClick={onPlus}
        aria-label={plusLabel}
        disabled={plusDisabled}
      >
        <PlusIcon className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export const inputClass =
  "border-input bg-card text-body-s text-foreground h-[34px] w-full rounded-md border px-2.5 shadow-control outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-teal-tint";

/**
 * A text field that commits on Enter or when it loses focus (one undo step per edit, not per key).
 * Escape puts the committed value back.
 */
export function CommitField({
  label,
  value,
  onCommit,
  maxLength,
  mono,
  hint,
  validate,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  maxLength?: number;
  mono?: boolean;
  hint?: string;
  /** A problem in words, or null. */
  validate?: (v: string) => string | null;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const problem = validate?.(draft) ?? null;
  const commit = () => {
    const v = draft.trim();
    if (!v || problem) return setDraft(value);
    if (v !== value) onCommit(v);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-caption text-ink-700">
        {label}
      </label>
      <input
        id={id}
        className={cn(inputClass, mono && "font-mono")}
        value={draft}
        maxLength={maxLength}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem || hint ? `${id}-hint` : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
          }
        }}
      />
      {problem || hint ? (
        <p
          id={`${id}-hint`}
          className={cn(
            "text-caption",
            problem ? "text-status-caution-fg-aa" : "text-muted-foreground",
          )}
        >
          {problem ?? hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Amber = a caution (as the hub's own `ErrorLine`). Always the icon and the words. `alert` announces
 * it: an action's error that arrives after a click.
 */
export function CautionNote({
  children,
  className,
  alert,
}: {
  children: ReactNode;
  className?: string;
  alert?: boolean;
}) {
  return (
    <p
      role={alert ? "alert" : undefined}
      className={cn(
        "bg-status-caution-bg text-status-caution-fg-aa text-caption inline-flex items-start gap-1.5 rounded-md px-2.5 py-1.5",
        className,
      )}
    >
      <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
