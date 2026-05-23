"use client";

import * as React from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { cn } from "@/lib/utils";

/**
 * RadioCards — vertical (or grid) stack of radio cards. Use when the
 * choices benefit from a short description, an icon, or extra context
 * that wouldn't fit in a Segmented control.
 *
 * Typical use in onboarding: I'm signing up as → patient / clinician /
 * hospital. Choose your role within hospital → owner / admin / etc.
 *
 * Built on Base UI Radio + RadioGroup so the ARIA pattern, focus
 * management, and form submission name are handled correctly.
 */

export interface RadioCardOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  helper?: string;
  disabled?: boolean;
}

interface RadioCardsProps<T extends string> {
  options: ReadonlyArray<RadioCardOption<T>>;
  value: T | null;
  onValueChange: (value: T) => void;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  columns?: 1 | 2 | 3;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export function RadioCards<T extends string>({
  options,
  value,
  onValueChange,
  name,
  disabled,
  required,
  columns = 1,
  className,
  ...ariaProps
}: RadioCardsProps<T>) {
  const gridClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <RadioGroup
      value={value ?? ""}
      onValueChange={(next) => {
        if (typeof next === "string" && next !== "") onValueChange(next as T);
      }}
      disabled={disabled}
      required={required}
      name={name}
      aria-label={ariaProps["aria-label"]}
      aria-labelledby={ariaProps["aria-labelledby"]}
      className={cn("grid gap-2", gridClass, className)}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        const isDisabled = disabled || opt.disabled;
        return (
          <Radio.Root
            key={opt.value}
            value={opt.value}
            disabled={isDisabled}
            className={cn(
              "group relative flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors duration-150",
              selected
                ? "border-teal-500 bg-teal-50/60 dark:bg-teal-500/5"
                : "border-border bg-card hover:border-gray-300 dark:hover:border-gray-700",
              isDisabled && "cursor-not-allowed opacity-50",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500",
            )}
          >
            {opt.icon ? (
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
                  selected ? "bg-teal-500 text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {opt.icon}
              </span>
            ) : null}

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-foreground text-[13px] font-medium">{opt.label}</span>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                    selected ? "border-teal-500 bg-teal-500" : "border-border bg-background",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full bg-white transition-opacity",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                </span>
              </div>
              {opt.description ? (
                <span className="text-muted-foreground text-[12px] leading-snug">
                  {opt.description}
                </span>
              ) : null}
              {opt.helper ? (
                <span className="text-muted-foreground/80 mt-1 text-[11px] tracking-wide uppercase">
                  {opt.helper}
                </span>
              ) : null}
            </div>
          </Radio.Root>
        );
      })}
    </RadioGroup>
  );
}
