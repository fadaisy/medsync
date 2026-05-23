"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SegmentedControl — 2 to 4 mutually exclusive options shown as a
 * single horizontal pill. Use for short, atomic choices: sex/gender,
 * employment type, ID type, ownership.
 *
 * For longer lists use the Combobox; for visual-card choices use
 * RadioCards.
 *
 * ARIA: implemented as a radiogroup with role="radio" buttons (the
 * pattern the W3C recommends for segmented controls in forms — keeps
 * keyboard nav + screen-reader behaviour correct).
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T | null;
  onValueChange: (value: T) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  disabled,
  size = "md",
  className,
  name,
  ...ariaProps
}: SegmentedProps<T>) {
  // Roving tabindex — only the selected (or first if none) is tab-stop.
  const focusIndex = React.useMemo(() => {
    const i = options.findIndex((o) => o.value === value);
    return i === -1 ? 0 : i;
  }, [options, value]);

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (index + 1) % options.length;
      const nextOption = options[next];
      if (nextOption && !nextOption.disabled) onValueChange(nextOption.value);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (index - 1 + options.length) % options.length;
      const prevOption = options[prev];
      if (prevOption && !prevOption.disabled) onValueChange(prevOption.value);
    } else if (e.key === "Home") {
      e.preventDefault();
      const first = options[0];
      if (first && !first.disabled) onValueChange(first.value);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = options[options.length - 1];
      if (last && !last.disabled) onValueChange(last.value);
    }
  }

  const sizeClasses = size === "sm" ? "h-8 text-[12px] px-3" : "h-9 text-[13px] px-3.5";

  return (
    <div
      role="radiogroup"
      aria-label={ariaProps["aria-label"]}
      aria-labelledby={ariaProps["aria-labelledby"]}
      aria-disabled={disabled}
      className={cn(
        "border-border bg-muted/40 inline-flex w-full rounded-md border p-0.5",
        className,
      )}
    >
      {options.map((opt, i) => {
        const selected = value === opt.value;
        const isDisabled = disabled || opt.disabled;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.description ? `${opt.label} — ${opt.description}` : opt.label}
            tabIndex={i === focusIndex ? 0 : -1}
            disabled={isDisabled}
            onClick={() => onValueChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "flex-1 rounded-[5px] font-medium transition-colors duration-150",
              sizeClasses,
              selected
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
              isDisabled && "cursor-not-allowed opacity-50",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500",
            )}
          >
            {opt.label}
          </button>
        );
      })}
      {/* Hidden native input so the value posts in form submissions. */}
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
    </div>
  );
}
